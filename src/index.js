const merge = require("lodash.merge")
const { settings } = require("witnet-solidity-bridge")
const addresses = require("../addresses.json")
module.exports = {
    ABIs: {
        WrappedWIT: require("../artifacts/contracts/WrappedWIT.sol/WrappedWIT.json").abi,
        WrappedWITSuperchain: require("../artifacts/contracts/WrappedWITSuperchain.sol/WrappedWITSuperchain.json").abi,
    },
    getNetworkAddresses: (network) => merge(addresses?.default, addresses[network]),
    getNetworkChainId:   (network) => settings.getNetworks()[network].network_id,
    getNetworkSettings:  (network) => require("./settings")[network],
    getSupportedNetworks:() => Object.keys(addresses).filter(network => network !== "default"),
    isNetworkCanonical:  (network) => require("./settings")[network]?.contract === "WrappedWIT",
    isNetworkSupported:  (network) => Object.keys(addresses).find(key => key === network.toLowerCase()) !== undefined,
}
