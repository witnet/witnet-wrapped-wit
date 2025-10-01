import { network } from "hardhat"
import { default as framework } from "witnet-solidity-bridge"

import { createRequire } from "module"
const require = createRequire(import.meta.url)
const addresses = require("../src/addresses.json")
const settings = require("../src/settings.json")

async function main () {
  const connection = await network.connect()
  const contractName = settings[connection.networkName]?.contract
  if (!contractName) {
    console.info(`> Nothing to deploy on "${connection.networkName}."`)
    process.exit(0)
  }
  console.info("> Connected network:  ", connection.networkName)
  console.info("> Token contract:     ", `${contractName}`)

  const { ethers, networkName } = connection
  const curator = await ethers.getSigner(settings[networkName]?.curator || settings?.default.curator)
  console.info("> Token curator:      ", curator.address)

  const Factory = await ethers.getContractFactory("Factory", curator)
  let factory
  if (
    !addresses.default.Factory ||
      (await ethers.provider.getCode(addresses.default.Factory)).length < 3
  ) {
    factory = await Factory.connect(curator).deploy()
    addresses.default.Factory = await factory.getAddress()
  } else {
    factory = Factory.attach(addresses.default.Factory).connect(curator)
  }

  if (contractName === "WitnetERC20") {
    const tokenCustodianBech32 = settings[networkName].custodian
    const tokenUnwrapperBech32 = settings[networkName].unwrapper
    const tokenSalt = settings[networkName]?.salt || settings?.default.salt

    const witOracleRadonRequestFactoryAddr = framework.getNetworkAddresses(networkName).core.WitOracleRadonRequestFactory
    console.info(`> Wit/Oracle Radon Request factory: ${witOracleRadonRequestFactoryAddr}`)
    console.info("> Wrapped/WIT custodian address:", tokenCustodianBech32)
    console.info("> Wrapped/WIT unwrapper address:", tokenUnwrapperBech32)

    // deploy external library, if it exists
    const WitnetERC20Lib = await ethers.getContractFactory("WitnetERC20Lib")
    if (!addresses[networkName]?.WitnetERC20Lib) {
      const library = await WitnetERC20Lib.connect(curator).deploy()
      addresses[networkName].WitnetERC20Lib = await library.getAddress()
    }
    console.info("> Wrapped/WIT library:", `${addresses[networkName].WitnetERC20Lib}`)
    console.info("> Wrapped/WIT factory:", `${await factory.getAddress()}`)
    console.info("> Wrapped/WIT vanity: ", tokenSalt)

    let contractAddr = addresses[networkName][contractName]
    if (!contractAddr || (await ethers.provider.getCode(contractAddr)).length <= 2) {
      contractAddr = await factory.determineAddr.staticCall(tokenSalt)
      const Token = await ethers.getContractFactory(contractName, {
        libraries: {
          WitnetERC20Lib: addresses[networkName].WitnetERC20Lib,
        },
      })
      await factory.connect(curator).deployCanonical.send(
        tokenSalt,
        Token.bytecode,
        witOracleRadonRequestFactoryAddr,
        curator.address,
        tokenCustodianBech32,
        tokenUnwrapperBech32,
      ).then(response => {
        console.info("> Wrapped/WIT deploy tx:", response.hash)
      }).catch(err => {
        console.error(err.code)
        process.exit(1)
      })
    }
    console.info("> Wrapped/WIT address:", `${contractAddr}`)
  
  } else if (contractName === "WitnetL2ERC20") {
    
    const tokenSalt = settings[networkName]?.salt || settings?.default.salt
    const tokenAddr = settings.default?.address
    if (!tokenAddr) {
      console.error("The canonical token address must be specified in settings.json");
      process.exit(1)
    }

    console.info("> Bridged/WIT factory:", `${await factory.getAddress()}`)
    console.info("> Bridged/WIT vanity: ", tokenSalt)

    let contractAddr = addresses[networkName][contractName]
    if (!contractAddr || (await ethers.provider.getCode(contractAddr)).length <= 2) {
      contractAddr = await factory.determineAddr.staticCall(tokenSalt)
      const TokenL2 = await ethers.getContractFactory(contractName)
      await factory.connect(curator).deployBridged.send(
        tokenSalt,
        TokenL2.bytecode,
        curator.address,
        tokenAddr
      ).then(response => {
        console.info("> Bridged/WIT deployment:", response.hash)
      })
    }
    console.info("> Bridged/WIT address:", `${contractAddr}`)
    const tokenBridge = settings[networkName]?.bridge || settings?.default.bridge || "0x4200000000000000000000000000000000000010"
    const superchained = settings[networkName]?.superchained || false
    if (tokenBridge) {
      const TokenL2 = await ethers.getContractFactory(contractName)  
      const token = await TokenL2.attach(contractAddr).connect(curator)
      const [bridgeL2, superchainedL2] = await Promise.all([
        token.bridge(),
        token.superchained(),
      ])
      if (bridgeL2 !== tokenBridge || superchainedL2 !== superchained) {
        const promise = superchained ? token.settleSuperchainBridge.send(tokenBridge) : token.settleStandardBridge.send(tokenBridge)
        await promise.then(receipt => {
          console.info(`> Settling bridge tx: `, receipt.hash)
        });
      }
    }
    console.info("> Bridged/WIT bridge: ", `${tokenBridge} ${superchained ? "(superchained)" : ""}`)
  
  } else {
    console.error(`> Unsupported contract ${contractName}.`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
