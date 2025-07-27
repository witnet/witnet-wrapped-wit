const addresses = require("../addresses.json")
const merge = require("lodash.merge")
module.exports = {
    ABIs: {
        WrappedWIT: require("../artifacts/contracts/WrappedWIT.sol/WrappedWIT.json").abi,
        WrappedWITSuperchain: require("../artifacts/contracts/WrappedWITSuperchain.sol/WrappedWITSuperchain.json").abi,
    },
    getNetworkAddresses: (network) => merge(addresses?.default, addresses[network]),
    getSettings: require("./settings"),
    supportedNetworks: () => Object.keys(addresses).filter(network => network !== "default"),
}