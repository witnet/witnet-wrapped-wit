import hardhatEthers from "@nomicfoundation/hardhat-ignition-ethers"
import hardhatVerify from "@nomicfoundation/hardhat-verify"

import { default as dotenv } from "dotenv"
dotenv.config()

export default {
  paths: {
    sources: "./contracts",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  plugins: [
    hardhatEthers,
    hardhatVerify,
  ],
  networks: {
    "base:sepolia": {
      chainId: 84532,
      confirmations: 2,
      type: "http",
      url: "http://127.0.0.1:8502",
    },
    "ethereum:mainnet": {
      chainId: 1,
      confirmations: 2,
      type: "http",
      url: "http://127.0.0.1:9545"
    },
    "ethereum:sepolia": {
      chainId: 11155111,
      confirmations: 2,
      type: "http",
      url: "http://127.0.0.1:8506",
    },
    "optimism:sepolia": {
      chainId: 11155420,
      confirmations: 2,
      type: "http",
      url: "http://127.0.0.1:8503",
    },
  },
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  verify: {
    blockscout: {
      enabled: true,
    },
    etherscan: {
      apiKey: process.env.ETHERSCAN_V2_API_KEY || "MY_API_KEY",
    },
    sourcify: {
      enabled: false,
      apiUrl: "https://sourcify.dev/server",
      browserUrl: "https://repo.sourcify.dev",
    },
  },
}
