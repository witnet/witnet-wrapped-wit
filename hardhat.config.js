require("@nomicfoundation/hardhat-toolbox");
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
      url: "http://127.0.0.1:8502"
    },
    "optimism:sepolia": {
      chainId: 11155420,
      confirmations: 2,
      url: "http://127.0.0.1:8503"
    },
  },
  solidity: {
    version: "0.8.28",
    settings: {
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
      "optimism:sepolia": process.env.ETHERSCAN_OPTIMISM_API_KEY
    },
    customChains: [
      {
        network: "optimism:sepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
          browserURL: "https://sepolia-optimism.etherscan.io/address",
        }
      },
    ],
  },
};
