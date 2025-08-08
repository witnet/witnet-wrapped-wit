require("@nomicfoundation/hardhat-toolbox")
require("dotenv").config()

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  gasReporter: {
    enabled: true,
    includeIntrinsicGas: false,
  },
  networks: {
    "base:sepolia": {
      chainId: 84532,
      confirmations: 2,
      url: "http://127.0.0.1:8502",
    },
    "celo:alfajores": {
      chainId: 44787,
      confirmations: 2,
      url: "http://127.0.0.1:8538",
    },
    "ethereum:sepolia": {
      chainId: 11155111,
      confirmations: 2,
      url: "http://127.0.0.1:8506",
    },
    "optimism:sepolia": {
      chainId: 11155420,
      confirmations: 2,
      url: "http://127.0.0.1:8503",
    },
    "polygon:amoy": {
      chainId: 80002,
      confirmations: 2,
      url: "http://127.0.0.1:8535",
    },
    "unichain:sepolia": {
      chainId: 1301,
      confirmations: 2,
      url: "http://127.0.0.1:8500",
    },
  },
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "paris",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  sourcify: {
    enabled: false,
    apiUrl: "https://sourcify.dev/server",
    browserUrl: "https://repo.sourcify.dev",
  },
  etherscan: {
    apiKey: {
      "base:sepolia": process.env.ETHERSCAN_V2_API_KEY,
      "celo:alfajores": process.env.ETHERSCAN_V2_API_KEY,
      "ethereum:sepolia": process.env.ETHERSCAN_V1_API_KEY,
      "optimism:sepolia": process.env.ETHERSCAN_V2_API_KEY,
      "polygon:amoy": process.env.ETHERSCAN_V2_API_KEY,
      "unichain:sepolia": process.env.ETHERSCAN_V2_API_KEY,
    },
    customChains: [
      {
        network: "base:sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=84532",
          browserURL: "https://sepolia.basescan.org/",
        },
      },
      {
        network: "celo:alfajores",
        chainId: 44787,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=44787",
          browserURL: "https://alfjores.celoscan.io/",
        },
      },
      {
        network: "ethereum:sepolia",
        chainId: 11155111,
        urls: {
          // apiURL: "https://api.etherscan.io/v2/api?chainId=11155111",
          apiURL: "https://api-sepolia.etherscan.io/api",
          browserURL: "https://sepolia.etherscan.io/",
        },
      },
      {
        network: "optimism:sepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=11155420",
          browserURL: "https://sepolia-optimism.etherscan.io",
        },
      },
      {
        network: "polygon:amoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=80002",
          browserURL: "https://amoy.polygonscan.com/",
        },
      },
      {
        network: "unichain:sepolia",
        chainId: 1301,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=1301",
          browserURL: "https://sepolia.uniscan.xyz/",
        },
      },
    ],
  },
}
