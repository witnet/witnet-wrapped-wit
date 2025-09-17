module.exports = {
  default: {
    curator: "0x06b5B7b1deaD1ade17C96fc2995Db93b82DeA970",
    salt: 492587619,
  },
  "ethereum:mainnet": {
    contract: "WrappedWIT",
    custodian: "wit1wrappedl0fth3lm6xjhyp6vjnwcfjv9nwc40pa",
    unwrapper: "tbd",
  },
  "ethereum:sepolia": {
    contract: "WrappedWIT",
    custodian: "twit120x84rx5l0kmhl89kpezd69pnlxd8rzmjxq3lz",
    unwrapper: "twit19rnvq8yjrmpa6tjdahct4pd49ha5lmvxjeyfha",
  },
  "base:sepolia": {
    contract: "StandardBridgeWIT",
    bridge: "0x",
    remote: "0x",
  },
  "optimism:sepolia": {
    contract: "StandardBridgeWIT",
    bridge: "0x",
    remote: "0x",
  },
}
