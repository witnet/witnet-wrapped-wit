# Wrapped/WIT contracts and CLI tools

> A command-line tool and smart contract suite to wrap and unwrap $WIT coins between Witnet and Ethereum blockchains, using specific RPC endpoints for each.

## ✨ Overview

This repository contains:
- A **CLI tool** (`witwrap`) to interact with both Witnet and Ethereum RPCs to:
  - Wrap **native $WIT** coins from Witnet into **ERC-20** tokens on Ethereum.
  - Unwrap ERC-20 $WIT tokens on Ethereum back into native coins on Witnet.
  - Check out both wrapped and under-custody $WIT suppies on Ethereum and Witnet.
  - Notarize **Proof-of-Reserve** reports on Witnet and then push them on-chain into Ethereum.
  - Get list of supported EVM testnets and mainnets.
  - Get relevant info about the ERC-20 contract on each supported network. 
  - Get history of transfer, wrap and unwrap transactions.
  - Measure actual time taken by cross-chain transactions.

- A **Javascript library** allowing scripts to introspect supported networks, ABIs, addresses and settings, as well as some related helper methods. 

- The full **Solidity source code** of both the canonical and bridged versions of the Wrapped/WIT ERC-20 token deployed on Ethereum and other Superchain-compliant networks.

## 📦 Installation

### CLI binary
Install the `witwrap` binary:
```bash
$ npm install -g @witnet/wrapped-wit
```

### NPM module
- Add the `@witnet/wrapped-wit` module to your Github project:
```bash
  $ npm install --save-dev @witnet/wrapped-wit
```
- Import from Javascript:
```javascript
  const { WrappedWIT } = require("@witnet/wrapped-wit")
 ```
- Import from Typescript:
```typescript
  import { WrappedWIT } from "@witnet/wrapped-wit"
```

## ⚙️ Requirements
- Node.js >= 20
- Wallets with sufficient **$ETH** and **$WIT** for transacting on both Ethereum and Witnet networks.

## 🔧 Configuration
 The CLI can be configured using a **.env** file or by setting the following two variables:
```env
  ETHRPC_PRIVATE_KEYS=["your_eth_private_key_1", ..., "your_eth_private_key_n"]
  WITNET_SDK_WALLET_MASTER_KEY="xprv_string_here_as_exported_from_mww_or_sheikah"
```
You can optionally:
- Settle your preferred ETH/RPC provider when launching the local gateway (see below).
- Settle your preferred WIT/RPC provider by using the command-line option `--witnet`, where suitable.

## 🛠️ Usage

```bash
  $ witwrap <command> [<args>] [<flags>] [<options>] [--help]
``` 

### Commands

You need to have a local **ETH/RPC gateway** running in order to get access to extra commands. You will only be able to wrap and unwrap $WIT coins if you connect to an EVM network where the canonical version of the ERC-20 token is available (see supported networks below). 

---
#### `witwrap networks`
Lists supported EVM networks.

**Flags**:
- `--mainnets`: Just list the mainnets.
- `--testnets`: Just list the testnets.

---
#### `witwrap gateway <evm_network>`
Launches a local ETH/RPC signing gateway to the specified `evm_network`, listening on port 8545 if no otherwise specified.

**Options**:
  - `--port`: Port where the new gateway should be listening on.  
  - `--remote`: URL of the ETH/RPC remote provider to use instead of the gateway's default for the specified network. 

> *Launch a gateway to your preferred EVM network on a different terminal so you can augment the available commands of the `witwrap` CLI binary. If you launch the gateway on a port other than default's, you'll need to specify `--port <PORT>` when invoking other commands of the `witwrap` binary.*

---
#### `witwrap contract`
Shows the address and other relevant data of the WrappedWIT contract that's available on the connected EVM network. 

**Flags**:
- `--verbose`: Outputs extra information.

---
#### `witwrap supplies`
Shows wrapped $WIT supply information in both Witnet and the connected EVM network. It also detects if the total reserve supply in Ethereum is outdated with respect the actual under-custody supply on Witnet, asking you whether you wish to permissionlessly contribute by notarizing (in Witnet) and pushing (in Ethereum) a fresh new **Proof-of-Reserve** report.

**Flags**:
- `--verbose`: Outputs history of Proof-of-Reserve update reports.

**Options**:
- `--limit`: Limit number of history records.
- `--from`: EVM signer address to use when pushing a fresh new Proof-of-Reserve report into Ethereum. 
- `--gasPrice`: Max. EVM gas price to pay when pushing a Proof-of-Reserve report into Ethereum.

---
#### `witwrap transfers`
Shows the history of recent transfers of wrapped $WIT on the connected EVM network. It also allows you to transfer wrapped $WIT tokens in Ethereum, as long the signing addresses of your EVM gateway holds some wrapped $WIT balance.

**Flags**:
- `--burns`: Also show history of burnt $WIT (either unwrapped to Witnet, or bridged to other EVM networks).
- `--mints`: Also show history of minted $WIT (either wrapped from Witnet, or bridged from other EVM networks).

**Options**:
- `--from`: Filter transfers from the specified EVM address (required when ordering a new transfer).
- `--into`: Filter transfers to the specified EVM address (required when ordering a new transfer).
- `--limit`: Limit number of listed records.
- `--offset`: Skip first records before listing.
- `--since`: Process events starting from the specified EVM block number (default: -5000).
- `--value`: Amount of $WIT to transfer between the specified addresses.
- `--gasPrice`: Max. EVM gas price to pay when transferring $WIT. 

---
#### `witwrap wrappings`
Shows the history of past wrapping transactions, as well as an up-to-date list with the status of on-going wrapping workflows. It also allows you to initiate a wrap transaction on Witnet, and validate it on Ethereum when finalized.

**Flags**:
- `--trace-back`: Check the time difference since the moment when the wrap transaction took place on Witnet, and when it got ultimately verified on Ethereum. 

**Options**:
- `--from`: Filter wrappings from the specified WIT address.
- `--into`: Filter wrappings to the specified EVM address (required when initiating a new wrap).
- `--limit`: Limit number of listed records.
- `--offset`: Skip first records before listing.
- `--since`: Process events starting from the specified EVM block number (default: -5000).
- `--value`: Amount of $WIT to be wrapped between specified addresses.
- `--vtt-hash`: Request the validation on Ethereum of some not-yet verified wrapping transaction that took place on Witnet. 
- `--gasPrice`: Max. EVM gas price to pay when querying the validation of some `--vtt-hash`. 

> *When ordering a new wrap:*
>- *If no --from is specified, the transaction will get paid by any set of self-custody HD-derived accounts holding sufficient funds.*
>- *Wrapping from the wallet's coinbase address, requires its address to be specified as --from.*
>- *Make sure that you have enough funds for covering both the amount being wrapped and the Witnet network fee for such transaction.*

---
#### `witwrap unwrappings`
Shows the history of past unwrapping transactions. It also allows you to unwrap $WIT tokens that you hold on any of the EVM gateway signing addresses, as long as there's enough under-custody reserve supply on the ERC-20 contract.

**Flags**:
- `--trace-back`: Check the time difference since the moment when the unwrap transaction took place on Ethereum, and the unwrapped amount got ultimately transferred to the recipient on Witnet.

**Options**:
- `--from`: Filter unwrappings from the specified EVM address (required when ordering a new unwrap).
- `--into`: Filter unwrappings to the specified WIT address (required when ordering a new unwrap).
- `--limit`: Limit number of listed records.
- `--offset`: Skip first records before listing.
- `--since`: Process events starting from the specified EVM block number (default: -5000).
- `--value`: Amount of $WIT to be unwrapped between specified addresses.
- `--gasPrice`: Max. EVM gas price to pay when querying the unwrapping of the specified amount.

## 📄 Smart Contracts
This repository includes the Solidity contracts that power the Ethereum side of the **Wrapped/WIT**, both on its canonical and Superchain-bridge versions.

Contracts are located in the **contracts/** folder:

- **WrappedWIT.sol**
  > The canonical version of the ERC-20 token contract for $WIT on Ethereum. It relies on the Wit/Oracle contract framework for validating both Proof-of-Reserve reports and cross-chain wrapping and unwrapping transactions.

- **SuperchainWIT.sol**
  > The "bridged" version of the ERC-20 token contract that allows wrapped $WIT tokens to be bridged out to a set of Superchain-compliant networks. This version does not support wrapping nor unwrapping transactions with the Witnet network. 

## 🧪 Supported Networks
### Mainnets
Soon <sup>TM</sup>.
### Testnets
| EVM Network | ERC-20 Contract | ERC-20 Address | Witnet Network |
| :- | :- | :- | | :-: |
| Ethereum Sepolia | `WrappedWIT` | [`0xFabadaC5963bdE1bCcCd560EA60e9928DC5dF014`](https://sepolia.etherscan.io/address/0xFabadaC5963bdE1bCcCd560EA60e9928DC5dF014#tokentxns) | Testnet 
| Base Sepolia | `SuperchainWIT` | [`0xTBD`](https://sepolia.basescan.org/address/0xFabadaC5963bdE1bCcCd560EA60e9928DC5dF014#tokentxns) |
| Optimism Sepolia | `SuperchainWIT` | [`0xTBD`](https://sepolia-optimism.etherscan.io/address/0xfabadac5963bde1bcccd560ea60e9928dc5df014#tokentxns) |

## 🚀 Examples

### Wrap 10,000.0 $WIT to Ethereum
It involves a two-step workflow:
- First, transfer 10,000.0 $WIT to the Wrapped/WIT custodian's address in Witnet:
  - `witwrap wrappings --from <witnet_wallet_address> --into <evm_recipient> --value 10000.0`
  - Wait a few minutes until the value transfer gets finalized in Witnet.
- Second, request the Wrapped/WIT contract to verify finality of the value transfer transaction in Witnet:
  - `witwrap wrappings --vtt-hash <vtt_hash>`
  - Wait a few minutes until the Wit/Oracle on Ethereum validates the finality of the specified value transfer in Witnet.
- You can at all times filter and check the status of pending wrapping transactions:
  - `witwrap wrappings [--from <witnet_wallet_addres>] [--into <evm_recipient>]`

Once the finality of the value transfer transaction that took place in Witnet gets verified in Ethereum, you shall see increased the $WIT balance of the specified `<evm_recipient>` address. 

### Unwrap 500.0 $WIT to Witnet
Just one single step required:
- `witwrap unwrappings --from <evm_sender> --into <witnet_recipient> --value 500.0`

In a matter of a few seconds, you should see increased the $WIT balance of the specified `<witnet_recipient>` address.

## 🔐 Security
- **Do not share your private keys.**
- Use trusted RPC endpoints when using others that the ones settled as default.
- Consider hardware wallets or key vaults for production usage.

## 📚 Documentation
Learn more about Witnet, the $WIT coin and the Wit/Oracle framework for smart contracts at:

👉 https://docs.witnet.io
👉 https://witnet.io
👉 https://witnet.foundation/

## 🧾 License
MIT © 2025 — Maintained by the [Witnet Project](https://github.com/witnet).
