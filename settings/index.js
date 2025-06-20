module.exports = {
    default: {
        curator: "0x65deCD9141ee487A390bb29f874672b910F50155",
        salt: 1,
    },
    "ethereum:mainnet": {
        contract: "WrappedWIT",
        custodian: "tbd...",
    },
    "optimism:sepolia": {
        // authority: "",
        contract: "WrappedWIT",
        custodian: "twit1yyx8ll4ykyk0fugv3apefzlszlf8a9jxxr398l",
        salt: 7,
    },
    "base:sepolia": {
        contract: "WrappedWITSuperchain",
    }
}
