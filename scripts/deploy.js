import { network } from "hardhat"
import { default as framework } from "witnet-solidity-bridge"

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const addresses = require("../src/addresses.json")
const settings = require("../src/settings.json")

async function main () {
  const connection = await network.connect()
  const contractName = settings[connection.networkName]?.contract
  if (!contractName) {
    console.info(`> Nothing to deploy on "${connection.networkName}."`)
    process.exit(0)
  }
  console.info("> Wrapped/WIT network:   ", connection.networkName)
  console.info("> Wrapped/WIT contract:  ", `${contractName}`)
  
  const { ethers, networkName } = connection
  const curator = await ethers.getSigner(settings[networkName]?.curator || settings?.default.curator)
  console.info("> Wrapped/WIT curator:   ", curator.address)
  
  const Factory = await ethers.getContractFactory("Factory", curator)
  let factory
  if (
    !addresses.default.Factory ||
      (await ethers.provider.getCode(addresses.default.Factory)).length < 3
  ) {  
    factory = await Factory.connect(curator).deploy()
    addresses.default.Factory = await deployer.getAddress()
  } else {
    factory = Factory.attach(addresses.default.Factory).connect(curator)
  }
  console.info("> Wrapped/WIT factory:   ", `${await factory.getAddress()}`)
  
  let contractAddr = addresses[networkName][contractName]
  if (contractAddr && (await ethers.provider.getCode(contractAddr)).length > 2) {
    console.info("> Wrapped/WIT address:   ", `${contractAddr}`)
    process.exit(0)
  }

  if (contractName === "WrappedWIT") {
    const tokenCustodianBech32 = settings[networkName].custodian
    const tokenUnwrapperBech32 = settings[networkName].unwrapper
    const tokenSalt = settings[networkName]?.salt || settings?.default.salt
    contractAddr = await factory.determineAddr.staticCall(tokenSalt)

    const witOracleRadonRequestFactoryAddr = framework.getNetworkAddresses(networkName).core.WitOracleRadonRequestFactory
    console.info(`> Wit/Oracle Radon Request factory: ${witOracleRadonRequestFactoryAddr}`)
    console.info("> Wrapped/WIT custodian address:   ", tokenCustodianBech32)
    console.info("> Wrapped/WIT unwrapper address:   ", tokenUnwrapperBech32)
    
    // deploy external library, if it exists
    const Library = await ethers.getContractFactory("Library")
    if (!addresses[networkName]?.Library) {
      const library = await Library.connect(curator).deploy()
      addresses[networkName].Library = await library.getAddress()
    }
    console.info("> Wrapped/WIT library:  ", `${addresses[networkName].Library}`)
  
    const authority = settings[networkName]?.authority || settings.default?.authority || curator.address
    console.info("> Wrapped/WIT authority:", authority)
    console.info("> Wrapped/WIT vanity:   ", tokenSalt)
    
    const Token = await ethers.getContractFactory(contractName, { 
      libraries: { 
        Library: addresses[networkName].Library
      } 
    })
    console.log(tokenCustodianBech32, tokenUnwrapperBech32)
    await factory.connect(curator).deployCanonical.send(
      tokenSalt,
      Token.bytecode,
      witOracleRadonRequestFactoryAddr,
      authority,
      tokenCustodianBech32,
      tokenUnwrapperBech32,
    ).then(response => {
      console.info("> Wrapped/WIT deploy tx:", response.hash)
    }).catch(err => {
      console.error(err.code)
      process.exit(1)
    })
    console.info("> Wrapped/WIT address:  ", `${contractAddr}`)
    
  } else if (contractName === "SuperchainWIT") {
    contractAddr = await deployer.determineAddr.staticCall(tokenSalt)
    console.info("> Wrapped/WIT vanity:   ", tokenSalt)
    const Token = await ethers.getContractFactory(tokenContract)
    await deployer.connect(curator).deployBridged.send(
      tokenSalt,
      Token.bytecode
    ).then(response => {
      console.info("> Wrapped/WIT deploy tx:", response.hash)
    })
    console.info("> Wrapped/WIT address:  ", `${contractAddr}`)
  
  } else if (contractName === "StandardBridgeWIT") {
    console.error("Not yet implemented!")
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
