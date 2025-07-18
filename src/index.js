const addresses = require("../addresses.json")
const merge = require("lodash.merge")
module.exports = {
    ABIs: {
        WrappedWIT: require("../artifacts/contracts/WrappedWIT.sol/WrappedWIT.JSON").abi,
        WrappedWITSuperchain: require("../artifacts/contracts/WrappedWITSuperchain.sol").abi,
    },
    getNetworkAddresses: (network) => merge(addresses?.default, addresses[network]),
    getSettings: require("./settings"),
    supportedNetworks: () => Object.keys(addresses).filter(network => network !== "default"),
}