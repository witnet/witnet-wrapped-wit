import { Witnet } from "@witnet/sdk"
import { ethers } from "@witnet/ethers"

import { default as merge } from "lodash.merge"
import { default as WSB } from "witnet-solidity-bridge"

import { createRequire } from "module"
const require = createRequire(import.meta.url)
const addresses = require("./addresses.json")

export const ABI = require("../artifacts/contracts/WitnetERC20.sol/WitnetERC20.json").abi
export const MIN_UNWRAPPABLE_NANOWITS = BigInt(10 ** 9) // 1.0 $WIT
export const MIN_WRAPPABLE_NANOWITS = BigInt(10 ** 12)  // 1000.0 $WIT

export default {
  ABI,
  MIN_UNWRAPPABLE_NANOWITS,
  MIN_WRAPPABLE_NANOWITS,
  fetchContractFromEthersProvider,
  findNetworkByChainId,
  findUnwrapTransactionFromWitnetProvider,
  getNetworkAddresses,
  getNetworkChainId,
  getNetworkContractAddress,
  getNetworkSettings,
  getNetworkUnwrapTransactionDigest,
  getSupportedNetworks,
  isNetworkCanonical,
  isNetworkMainnet,
  isNetworkSupported,
}

export async function fetchContractFromEthersProvider (ethersProvider) {
  const chainId = (await ethersProvider.getNetwork()).chainId
  const network = findNetworkByChainId(chainId)
  if (!network) {
    throw new Error(`WitnetERC20 token contract not available on this EVM chain (${chainId})`)
  }
  return new ethers.Contract(
    getNetworkContractAddress(network),
    ABI,
    ethersProvider
  )
}

export function findNetworkByChainId (evmChainId) {
  const found = Object.entries(WSB.supportedNetworks()).find(([, config]) => config.network_id.toString() === evmChainId.toString())
  if (found && BigInt(getNetworkChainId(found[0])) === BigInt(evmChainId)) return found[0]
  else return undefined
}

export async function findUnwrapTransactionFromWitnetProvider ({
  witJsonRpcProvider,
  evmNetwork,
  evmBlockNumber,
  nonce,
  from,
  to,
  value,
  signer,
}) {
  const digest = getNetworkUnwrapTransactionDigest(evmNetwork, evmBlockNumber, nonce, from, to, value)
  const pkh = Witnet.PublicKeyHash.fromHexString(digest).toBech32(witJsonRpcProvider.network)
  return witJsonRpcProvider
    .getUtxos(pkh, { fromSigner: signer })
    .then(async utxos => {
      const hashes = utxos.map(utxo => utxo.output_pointer.split(":")[0])
      for (let index = 0; index < utxos.length; index++) {
        const vtt = await witJsonRpcProvider.getValueTransfer(hashes[index], "simple")
        if (vtt.recipient === to && vtt.value + vtt?.fee >= value - 1n) {
          return {
            ...vtt,
            hash: hashes[index],
          }
        }
      }
      return undefined
    })
}

export function getNetworkAddresses (network) {
  return merge(addresses?.default, addresses[network])
}

export function getNetworkChainId (network) {
  return WSB.settings.getNetworks()[network].network_id
}

export function getNetworkContractAddress (network) {
  const settings = getNetworkSettings(network)
  return merge(addresses?.default, addresses[network])[settings?.contract]
}

export function getNetworkSettings (network) {
  return require("./settings.json")[network]
}

export function getNetworkUnwrapTransactionDigest (network, evmBlockNumber, nonce, from, to, value) {
  const evmChainId = getNetworkChainId(network)
  return ethers.solidityPackedKeccak256(
    ["uint256", "uint256", "uint256", "address", "string", "uint256"],
    [evmChainId, evmBlockNumber, nonce, from, to, value],
  ).slice(0, 42)
}

export function getSupportedNetworks () {
  return Object.keys(addresses).filter(network => network !== "default")
}

export function isNetworkCanonical (network) {
  return getNetworkSettings(network)?.contract === "WitnetERC20"
}

export function isNetworkMainnet (network) {
  return !!WSB.settings.getNetworks()[network]?.mainnet
}

export function isNetworkSupported (network) {
  const settings = getNetworkSettings(network)
  const address = merge(addresses?.default, addresses[network])[settings?.contract]
  return address && address !== "" && address.startsWith("0x")
}
