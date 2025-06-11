const merge = require("lodash.merge")
const { ethers } = require('ethers');
const WSB = require("witnet-solidity-bridge")
const { Witnet } = require("@witnet/sdk")

const ABI = require("../artifacts/contracts/WrappedWIT.sol/WrappedWIT.json").abi
const addresses = require("./addresses.json")

module.exports = {
    ABI,
    fetchContractFromEthersProvider,
    findNetworkByChainId,
    findUnwrapTransactionFromWitnetProvider,
    getNetworkAddresses,
    getNetworkChainId,
    getNetworkContractAddress,
    getNetworkSettings,
    getNetworkUnwrapTransactionDigest,
    getSupportedNetworks, 
    isNetworkCanonical,
    isNetworkMainnet,
    isNetworkSupported,
}

async function fetchContractFromEthersProvider (ethersProvider) {
    const chainId = (await ethersProvider.getNetwork()).chainId
    const network = findNetworkByChainId(chainId)
    if (!network) {
        throw new Error(`WrappedWIT token contract not available on this EVM chain (${chainId})`)
    }
    return new ethers.Contract(
        getNetworkContractAddress(network), 
        ABI, 
        ethersProvider
    )
}

function findNetworkByChainId(evmChainId) {
    const found = Object.entries(WSB.supportedNetworks()).find(([, config]) => config.network_id.toString() === evmChainId.toString())
    if (found && BigInt(getNetworkChainId(found[0])) === BigInt(evmChainId)) return found[0];
    else return undefined;
}

async function findUnwrapTransactionFromWitnetProvider (
    witJsonRpcProvider, 
    evmNetwork,
    evmBlockNumber, 
    nonce, 
    from, 
    to, 
    value
) {
    const digest = getNetworkUnwrapTransactionDigest(evmNetwork, evmBlockNumber, nonce, from, to, value);
    const pkh = Witnet.PublicKeyHash.fromHexString(digest).toBech32(witJsonRpcProvider.network)
    return witJsonRpcProvider
        .getUtxos(pkh)
        .then(async utxos => {
            const hashes = utxos.map(utxo => utxo.output_pointer.split(':')[0])
            for (let index = 0; index < utxos.length; index ++) {
                const vtt = await witJsonRpcProvider.getValueTransfer(hashes[index], "ethereal")
                if (vtt.recipient === to && vtt.value >= value) {
                    return {
                        ...vtt,
                        hash: hashes[index]
                    }
                }
            }
            return undefined
        })
}

function getNetworkAddresses (network) {
    return merge(addresses?.default, addresses[network])
}

function getNetworkChainId (network) {
    return WSB.settings.getNetworks()[network].network_id
}

function getNetworkContractAddress (network) {
    const settings = getNetworkSettings(network)
    return merge(addresses?.default, addresses[network])[settings?.contract]
}

function getNetworkSettings (network) {
    return require("./settings")[network]
}

function getNetworkUnwrapTransactionDigest (network, evmBlockNumber, nonce, from, to, value) {
    const _chainId = getNetworkChainId(network)
    return ethers.solidityPackedKeccak256(
        [ /*"uint256",  */"uint256", "uint256", "address", "string", "uint256" ],
        [ /*evmChainId, */evmBlockNumber, nonce, from, to, value ],
    ).slice(0, 42)
}

function getSupportedNetworks() {
    return Object.keys(addresses).filter(network => network !== "default")
}

function isNetworkCanonical (network) {
    return getNetworkSettings(network)?.contract === "WrappedWIT"
}

function isNetworkMainnet (network) {
    return WSB.settings.getNetworks()[network]?.mainnet ? true : false
}

function isNetworkSupported (network) {
    const settings = getNetworkSettings(network)
    const address = merge(addresses?.default, addresses[network])[settings?.contract]
    return address && address !== "" && address.startsWith("0x")
}