const { ethers, network } = require("hardhat");
const witnet = require("@witnet/solidity")

const addresses = require("../addresses.json")
const settings = require("../settings")

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
        console.info("> EVM curator address:      ", curator.address)
        deployer = await Deployer.connect(curator).deploy()
        addresses.default.WrappedWITDeployer = await deployer.getAddress()
    } else {
        deployer = Deployer.attach(addresses.default.WrappedWITDeployer)    
    }
    console.info("> Wrapped/WIT deployer:     ", `${await deployer.getAddress()} [WrappedWITDeployer]`)
    
    const tokenCustodianBech32 = settings[network.name]?.custodian
    const tokenSalt = settings[network.name]?.salt || settings?.default.salt
    
    if (tokenCustodianBech32) {    
        const witOracleRadonRequestFactoryAddr = witnet.getNetworkAddresses(network.name).core.WitOracleRadonRequestFactory
        if (
            addresses[network.name][tokenContract]
                && (await ethers.provider.getCode(addresses[network.name][tokenContract])).length > 2
        ) {
            console.info("> Wrapped/WIT contract:     ", `${addresses[network.name][tokenContract]} [${tokenContract}]`)
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
        
        const evmAuthority = settings[network.name]?.authority || settings.default?.authority || curator.address
        // console.info("> Wrapped/WIT bytecode:    ", Token.bytecode)
        console.info("> Wrapped/WIT authority:    ", evmAuthority)
        console.info("> Wrapped/WIT library:      ", `${addresses[network.name][tokenLibrary]} [${tokenLibrary}]`)
        console.info("> Wrapped/WIT custodian:    ", tokenCustodianBech32)
        console.info("> Wrapped/WIT Radon factory:", `${witOracleRadonRequestFactoryAddr} [WitOracleRadonRequestFactory]`)
        console.info("> Wrapped/WIT deploy salt:  ", tokenSalt)
        
        const Token = await ethers.getContractFactory(tokenContract, { libraries })
        await deployer.connect(curator).deployCanonical.send(
            tokenSalt,
            Token.bytecode,
            evmAuthority,
            tokenCustodianBech32,
            witOracleRadonRequestFactoryAddr
        ).then(response => {
            console.info("> Wrapped/WIT deploy tx:    ", response.hash)  
        })
        console.info("> Wrapped/WIT contract:     ", `${tokenAddr} [${tokenContract}]`)
        
    } else {
        if (
            addresses[network.name][tokenContract]
                && (await ethers.provider.getCode(addresses[network.name][tokenContract])).length > 2
        ) {
            console.info("> Wrapped/WIT contract:     ", `${addresses[network.name][tokenContract]} [${tokenContract}]`)
            process.exit(0)
        }
        console.info("> Wrapped/WIT deploy salt:  ", tokenSalt)
        const tokenAddr = await deployer.determineAddr.staticCall(tokenSalt)
        const Token = await ethers.getContractFactory(tokenContract)
        await deployer.connect(curator).deployBridged.send(
            tokenSalt,
            Token.bytecode
        ).then(response => {
            console.info("> Wrapped/WIT deploy tx:    ", response.hash)  
        })
        console.info("> Wrapped/WIT contract:     ", `${tokenAddr} [${tokenContract}]`)
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
