# Wrapped/WIT contracts and CLI tools

> A command-line tool and smart contract suite to wrap and unwrap $WIT tokens between the Witnet blockchain and Ethereum (as ERC-20 tokens), using specific RPC endpoints for eacy ecosystem.

## ✨ Overview

This repository contains:
- A **CLI tool** (`witwrap`) to interact with both Witnet and Ethereum RPCs to:
  - Wrap native $WIT coins from Witnet into ERC-20 tokens on Ethereum.
  - Unwrap ERC-20 $WIT token on Ethereum back into native coins on Witnet.
  - Check out both wrapped and under-custody $WIT suppies on Ethereum and Witnet.
  - Notarize Proof-of-Reserve reports on Witnet and then push it on-chain into Ethereum.
  - Get list of supported EVM testnets and mainnets.
  - Get relevant info about the ERC-20 contract on the currently connected EVM network. 
  - Get history of transfer, wrap and unwrap transactions.
  - Measure the time taken by cross-chain transactions.
- **Javascript library** allowing scripts to fetch supported networks, addresses, settings and some other helper methods. 
- The full **Solidity source code** of both the canonical and bridged versions of the Wrapped/WIT ERC-20 token deployed on Ethereum and other Superchain-compliant networks.

## 📦 Installation

### CLI tool
```bash
npm install -g @witnet/wrapped-wit
```

### Javascript library
```bash
npm install --save-dev @witnet/wrapped-wit
```
```typescript
import { WrappedWit } from "@witnet/wrapped-wit"
```

## ⚙️ Requirements
- Node.js >= 20
- Wallets with sufficient $ETH and $WIT for transacting on both chains.

🔧 Configuration
- The CLI can be configured using a **`.env`** file or the following environment variables:
```env
ETHRPC_PRIVATE_KEYS=["your_eth_private_key_1", ..., "your_eth_private_key_n"]

WITNET_SDK_WALLET_MASTER_KEY="xprv_string_here_as_exported_from_mww_or_sheikah"
#WITNET_SDK_PROVIDER_URL=url_to_rpc_port_on_your_own_witnet_node
```
You can also override these values using command-line options.


## 🛠️ Usage
```bash
witwrap <command> [flags] [options]
``` 

### Commands

You need to have a local ETH/RPC proxy running in order to get access to extra functionality. You will only be able to wrap and unwrap $WIT token if you connect to an EVM network where the canonical version of the ERC-20 token is available (see below). 

#### `networks`
List supported EVM mainnets.

Flags:
- `--testnets`: List supported EVM testnets, instead.

#### `gateway`
Launch a local ETH/RPC signing proxy to the specified EVM network, listening on port 8545.

Options:
  - `--port`: Port where the proxy will be listening, other than default's.

## 📄 Smart Contracts
This repository includes the Solidity contracts that power the Ethereum side of the Wrapped/WIT, both on its canonical and Superchain-bridge versions.

Contracts are located in the `contracts/` directory:

- `WrappedWIT.sol`: The canonical version of the ERC-20 token contract for $WIT on Ethereum. It relies on the Wit/Oracle contract framework for validating both Proof-of-Reserve reports and cross-chain wrapping/unwrapping transactions.
- `WrappedWITSuperchain.sol`: The "bridged" version of the ERC-20 token contract that allows wrapped $WIT tokens to be bridged out to a set of Superchain-compliant networks (see below). This version does not support wrapping/unwrapping transactions with the Witnet network. 

## 🧪 Supported Networks
### Testnets
| EVM network | Contract version | Witnet network |
| :- | -: | :-: |
| **Ethereum Sepolia** | `WrappedWIT` | Testnet 
| **Base Sepolia** | `WrappedWITSuperchain` |
| **Celo Alfajores** | `WrappedWITSuperchain` |
| **Optimism Sepolia** | `WrappedWITSuperchain` |

## 🚀 Examples
### Wrap 10,000.0 $WIT to Ethereum
...
### Unwrap 500,0 $WIT to Witnet

## 🔐 Security
- **Do not share your private keys.**
- Use trusted RPC endpoints when using others that the ones settled as default.
- Consider hardware wallets or key vaults for production usage.

## 📚 Documentation
Learn more about the Witnet project, the $WIT coin and the Wit/Oracle framework for smart contracts at:
👉 https://docs.witnet.io

## 🧾 License
MIT © 2025 — Maintained by the [Witnet Project](https://github.com/witnet).


