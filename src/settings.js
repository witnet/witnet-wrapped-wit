module.exports = {
    default: {
        curator: "0x34d903c72fC5A73Ef50817841d98F0e4019AF6B4",
        // salt: 22495054,
        salt: 4,
    },
    "ethereum:mainnet": {
        contract:  "WrappedWIT",
        custodian: "wit1wrappedl0fth3lm6xjhyp6vjnwcfjv9nwc40pa",
        unwrapper: "tbd",
    },
    "ethereum:sepolia": {
        contract:  "WrappedWIT",
        custodian: "twit1yyx8ll4ykyk0fugv3apefzlszlf8a9jxxr398l",
        // unwrapper: "twit1yyx8ll4ykyk0fugv3apefzlszlf8a9jxxr398l",
    },
    "base:sepolia": {
        contract: "WrappedWITSuperchain",
    },
    "celo:alfajores": {
        contract: "WrappedWITSuperchain",
    },
    "optimism:sepolia": {
        contract: "WrappedWITSuperchain",
    },
}
