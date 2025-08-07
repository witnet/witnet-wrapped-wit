const { ethers, network } = require("hardhat");
const { getNetworkAddresses } = require("witnet-solidity-bridge")

const addresses = require("../src/addresses.json")
const settings = require("../src/settings")

async function main() {
    const tokenContract = settings[network.name]?.contract
    if (!tokenContract) {
        console.info(`> Nothing to deploy on "${network.name}."`)
    }

    const curator = (await ethers.getSigner(settings[network.name]?.curator || settings?.default.curator))
    const Deployer = await ethers.getContractFactory("WrappedWITDeployer")
    let deployer
    if (
        !addresses.default.WrappedWITDeployer
            || (await ethers.provider.getCode(addresses.default.WrappedWITDeployer)).length < 3
    ) {
        console.info("> Wrapped/WIT EVM curator:   ", curator.address)
        deployer = await Deployer.connect(curator).deploy()
        addresses.default.WrappedWITDeployer = await deployer.getAddress()
    } else {
        deployer = Deployer.attach(addresses.default.WrappedWITDeployer)    
    }
    console.info("> Wrapped/WIT EVM deployer:  ", `${await deployer.getAddress()} [WrappedWITDeployer]`)
    
    const tokenCustodianBech32 = settings[network.name].custodian
    const tokenUnwrapperBech32 = settings[network.name].unwrapper
    const tokenSalt = settings[network.name]?.salt || settings?.default.salt
    
    if (tokenCustodianBech32) {    
        const witOracleRadonRequestFactoryAddr = getNetworkAddresses(network.name).core.WitOracleRadonRequestFactory
        if (
            addresses[network.name][tokenContract]
                && (await ethers.provider.getCode(addresses[network.name][tokenContract])).length > 2
        ) {
            console.info("> Wrapped/WIT EVM contract:  ", `${addresses[network.name][tokenContract]} [${tokenContract}]`)
            process.exit(0)
        }
        const tokenAddr = await deployer.determineAddr.staticCall(tokenSalt)

        // deploy external library, if it exists
        const tokenLibrary = `${tokenContract}Lib`
        const libraries = {}
        try {
            const Library = await ethers.getContractFactory(tokenLibrary)
            if (!addresses[network.name][tokenLibrary]) {
                const library = await Library.connect(curator).deploy()
                addresses[network.name][tokenLibrary] = await library.getAddress()
            }
            libraries[tokenLibrary] = addresses[network.name][tokenLibrary]
        } catch {}

        const evmCurator = settings[network.name]?.authority || settings.default?.authority || curator.address
        
        console.info("> Wrapped/WIT EVM library:  ", `${addresses[network.name][tokenLibrary]} [${tokenLibrary}]`)
        console.info("> Wrapped/WIT EVM curator:  ", evmCurator)
        console.info("> Wrapped/WIT cold wallet:  ", tokenCustodianBech32)
        console.info("> Wrapped/WIT hot wallet:   ", tokenUnwrapperBech32)
        console.info("> Wrapped/WIT deploy salt:  ", tokenSalt)
        
        const Token = await ethers.getContractFactory(tokenContract, { libraries })
        await deployer.connect(curator).deployCanonical.send(
            tokenSalt,
            Token.bytecode,
            witOracleRadonRequestFactoryAddr,
            evmCurator,
            tokenCustodianBech32,
            tokenUnwrapperBech32,
        ).then(response => {
            console.info("> Wrapped/WIT deploy tx:    ", response.hash)  
        }).catch(err => {
            console.error(err.code)
        })
        console.info("> Wrapped/WIT EVM contract: ", `${tokenAddr} [${tokenContract}]`)
        
    } else {
        if (
            addresses[network.name][tokenContract]
                && (await ethers.provider.getCode(addresses[network.name][tokenContract])).length > 2
        ) {
            console.info("> Wrapped/WIT EVM contract:  ", `${addresses[network.name][tokenContract]} [${tokenContract}]`)
            process.exit(0)
        }
        console.info("> Wrapped/WIT deploy salt:   ", tokenSalt)
        const tokenAddr = await deployer.determineAddr.staticCall(tokenSalt)
        const Token = await ethers.getContractFactory(tokenContract)
        await deployer.connect(curator).deployBridged.send(
            tokenSalt,
            Token.bytecode
        ).then(response => {
            console.info("> Wrapped/WIT deploy tx:     ", response.hash)  
        })
        console.info("> Wrapped/WIT EVM contract:  ", `${tokenAddr} [${tokenContract}]`)
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
