import { ethers, utils } from "@witnet/ethers"
import { Witnet } from "@witnet/sdk"

import * as dotenv from "dotenv"
import { existsSync, writeFileSync, readFileSync } from "fs"
import { WrappedWIT } from "../index.js"
dotenv.config()

const ETH_NETWORK = process.env.WRAPPED_WIT_UNWRAPPER_ETH_NETWORK
const ETH_SKIP_BLOCKS = process.env.WRAPPED_WIT_UNWRAPPER_ETH_SKIP_BLOCKS || 1
const ETH_WSS_PROVIDER = process.env.WRAPPED_WIT_UNWRAPPER_ETH_WSS_PROVIDER
const ETH_WSS_RECONNECT_INTERVAL = process.env.WRAPPED_WIT_UNWRAPPER_ETH_WSS_RECONNECT_MSECS || 5000
const STORAGE_PATH = process.env.WRAPPED_WIT_UNWRAPPER_STORAGE_PATH || ".unwrapper"
const WIT_MASTER_KEY = process.env.WRAPPED_WIT_UNWRAPPER_WIT_MASTER_KEY
const WIT_MIN_BALANCE = process.env.WRAPPED_WIT_UNWRAPPER_WIT_MIN_BALANCE_WITS || 1000.0
const WIT_MIN_UTXOS = process.env.WRAPPED_WIT_UNWRAPPER_WIT_MIN_UTXOS || 16
const WIT_RPC_PROVIDER = process.env.WRAPPED_WIT_UNWRAPPER_WIT_RPC_PROVIDER || "https://rpc-01.witnet.io"
const WIT_SIGNER_PKH = process.env.WRAPPED_WIT_UNWRAPPER_WIT_SIGNER_PKH
const WIT_UTXOS_STRATEGY = process.env.WRAPPED_WIT_UNWRAPPER_WIT_UTXOS_STRATEGY || "slim-fit"
const WIT_VTT_CONFIRMATIONS = process.env.WRAPPED_WIT_UNWRAPPER_WIT_VTT_CONFIRMATIONS || 3
const WIT_VTT_PRIORITY = process.env.WRAPPED_WIT_UNWRAPPER_WIT_VTT_PRIORITY || "opulent"

if (!WrappedWIT.isNetworkSupported(ETH_NETWORK)) {
  console.error(`Fatal: ${ETH_NETWORK.toUpperCase()} is not supported!`)
  process.exit(1)
} else if (!WrappedWIT.isNetworkCanonical(ETH_NETWORK)) {
  console.error(`Fatal: ${ETH_NETWORK.toUpperCase()} is not canonical!`)
  process.exit(1)
}

if (!existsSync(STORAGE_PATH)) {
  writeFileSync(STORAGE_PATH, "")
}

async function main () {
  const wallet = await Witnet.Wallet.fromXprv(
    WIT_MASTER_KEY, {
      limit: 1,
      strategy: WIT_UTXOS_STRATEGY,
      provider: await Witnet.JsonRpcProvider.fromURL(WIT_RPC_PROVIDER),
    })

  await wallet.getAccount(WIT_SIGNER_PKH || wallet.coinbase.pkh)
  const signer = wallet.getSigner(WIT_SIGNER_PKH || wallet.coinbase.pkh)

  console.info(`Wit/RPC provider:  ${WIT_RPC_PROVIDER}`)
  console.info(`Witnet network:    WITNET:${wallet.provider.network.toUpperCase()} (${wallet.provider.networkId.toString(16)})`)
  console.info(`Witnet hot wallet: ${signer.pkh}`)

  const VTTs = Witnet.ValueTransfers.from(signer)

  const minBalance = Witnet.Coins.fromWits(WIT_MIN_BALANCE)

  let balance = Witnet.Coins.fromPedros(0n)
  balance = await checkWitnetBalance()
  console.info(`Initial balance:   ${balance.toString(2)} (${signer.cacheInfo.size} UTXOs)`)
  if (balance.pedros < minBalance.pedros) {
    console.error(`❌ Fatal: hot wallet must be funded with at least ${minBalance.toString(2)}.`)
    process.exit(0)
  }

  let fromBlock
  try {
    fromBlock = BigInt(readFileSync(STORAGE_PATH))
  } catch (err) {
    console.error(err)
  }
  if (!fromBlock || fromBlock < ETH_SKIP_BLOCKS) {
    fromBlock = BigInt(ETH_SKIP_BLOCKS)
  }

  let provider
  let wrappedWIT

  let inbound = []
  const vttEthMempool = {}
  const vttBlockNumbers = {}

  async function connect () {
    console.info("Connecting to WebSocket ...")

    console.info(`> Eth/WSS provider:  ${ETH_WSS_PROVIDER}`)
    provider = new ethers.WebSocketProvider(ETH_WSS_PROVIDER)

    const network = await provider.getNetwork()
    if (Number(network.chainId) !== WrappedWIT.getNetworkChainId(ETH_NETWORK)) {
      console.error(`> Fatal: connected to wrong EVM chain id (${network.chainId}).`)
      process.exit(0)
    }
    console.info(`> Ethereum network:  ${ETH_NETWORK.toUpperCase()} (${network.chainId})`)

    if (WrappedWIT.isNetworkMainnet() && signer.provider.network !== "mainnet") {
      console.error("> Fatal: EVM mainnets must be bridged to Witnet Mainnet network.")
      process.exit(0)
    }

    wrappedWIT = await WrappedWIT.fetchContractFromEthersProvider(provider)
    console.info(`> Ethereum contract: ${await wrappedWIT.getAddress()}`)

    const witCustodianUnwrapper = await wrappedWIT.witCustodianUnwrapper()
    if (witCustodianUnwrapper !== signer.pkh) {
      console.error(`> Fatal: contract's hot wallet mismatch: ${witCustodianUnwrapper}`)
      process.exit(0)
    }

    if (await provider.getBlockNumber() > fromBlock) {
      const unwraps = await wrappedWIT.queryFilter("Unwrapped", fromBlock)
      if (unwraps.length > 0) {
        console.info("> Catching up previous unwraps ...")
        await Promise.all(unwraps.map(log => onUnwrapped(...log.args, log)))
      }
    }

    wrappedWIT.on("NewCustodianUnwrapper", onNewUnwrapper)
    wrappedWIT.on("Unwrapped", onUnwrapped)

    provider.websocket.on("close", (code) => {
      console.error(`⚠️ WebSocket closed with code ${code}. Reconnecting in ${ETH_WSS_RECONNECT_INTERVAL / 1000} seconds...`)
      cleanup()
      setTimeout(connect, ETH_WSS_RECONNECT_INTERVAL)
    })

    provider.on("block", async (blockNumber) => {
      console.info(`> EVM block number:  ${blockNumber}`)
      if (Number(blockNumber) % 10 === 0) {
        balance = await checkWitnetBalance()
        if (balance.nanowits < minBalance.nanowits) {
          console.error(`> Witnet balance below ${minBalance.toString(2)}`)
        } else {
          console.info(`> Witnet balance: ${balance.toString(2)}`)
        }
      }
      flushInbound()
    })

    provider.on("error", err => {
      console.error("⚠️ WebSocket error:", err.message)
      cleanup()
      setTimeout(connect, ETH_WSS_RECONNECT_INTERVAL)
    })
  }

  // Clean listeners and connections before reconnecting
  function cleanup () {
    wrappedWIT?.removeAllListeners()
    provider?.websocket.close()
  }

  function onNewUnwrapper (newUnwrapper, event) {
    if (newUnwrapper !== signer.pkh) {
      console.info(`❌ Fatal: contract's hot wallet changed from ${signer.pkh} to ${newUnwrapper} on block ${event.blockNumber}.`)
      process.exit(0)
    }
  }

  async function onUnwrapped (from, to, value, nonce, event) {
    const blockNumber = event?.log?.blockNumber || event?.blockNumber

    if (BigInt(value) >= WrappedWIT.MIN_UNWRAPPABLE_NANOWITS) {
      // Rely on Witnet's metadata storage to verify the unwrap transaction has not yet been attended,
      // neither by `signer.pkh` nor any other hot wallet in the past.
      const witUnwrapTx = await WrappedWIT.findUnwrapTransactionFromWitnetProvider({
        witJsonRpcProvider: wallet.provider,
        evmNetwork: ETH_NETWORK,
        evmBlockNumber: blockNumber,
        nonce,
        from,
        to,
        value,
        signer: signer.pkh,
      })
      if (witUnwrapTx) {
        console.info(`> Unwrapped  { block: ${
          blockNumber
        }, nonce: ${nonce}, from: ${from}, into: ${to}, value: ${
          ethers.formatUnits(value, 9)
        } WIT }`)
      } else {
        const digest = WrappedWIT.getNetworkUnwrapTransactionDigest(ETH_NETWORK, blockNumber, nonce, from, to, value)
        inbound.push({
          blockNumber,
          nonce,
          from,
          to,
          value,
          event,
          digest,
          metadata: Witnet.PublicKeyHash.fromHexString(digest).toBech32(wallet.provider.network),
        })
      }
    } else {
      // Ignore unwrap transactions on Ethereum with a value lesser than WrappedWIT.MIN_UNWRAPPABLE_NANOWITS:
      console.error(`> IGNORED    { block: ${blockNumber}, nonce: ${nonce}, from: ${from}, into: ${to}, value: ${ethers.formatUnits(value, 9)} WIT }`)
    }
  }

  async function flushInbound () {
    const pending = []
    let pendingValue = 0n
    for (let index = 0; index < inbound.length; index++) {
      const unwrap = inbound[index]
      if (signer.cacheInfo.expendable > unwrap?.value) {
        const { blockNumber, nonce, from, to, digest, metadata, value } = unwrap

        // Double-check that the unwrap transaction has not yet been attended:
        const witUnwrapTx = await WrappedWIT.findUnwrapTransactionFromWitnetProvider({
          witJsonRpcProvider: wallet.provider,
          evmNetwork: ETH_NETWORK,
          evmBlockNumber: blockNumber,
          nonce,
          from,
          to,
          value,
          signer: signer.pkh,
        })
        if (witUnwrapTx) {
          console.info(`> Unwrapped  { block: ${blockNumber}, nonce: ${nonce}, from: ${from}, into: ${to}, value: ${
            ethers.formatUnits(value, 9)
          } WIT }`)
        } else {
          let vtt
          try {
            // estimate vtt's fees ...
            vtt = await VTTs.signTransaction({
              recipients: [
                [to, Witnet.Coins.fromPedros(value - 1n)], // `value` always greater than MIN_UNWRAPPABLE_NANOWITS
                [metadata, Witnet.Coins.fromPedros(1n)],
              ],
              fees: WIT_VTT_PRIORITY,
            })
            // discount vtt's fees from the transfer value,
            if (vtt.fees.pedros >= value - 1n) {
              // ...but never allow fees to be greater than the value:
              vtt.value = Witnet.Coins.fromPedros((value - 1n) / 2n + 1n - value % 2n)
              vtt.fees = Witnet.Coins.fromPedros((value - 1n) / 2n)
            } else {
              vtt.value = Witnet.Coins.fromPedros(value - 1n - vtt.fees.pedros)
            }
            vtt = await VTTs.sendTransaction({
              recipients: [
                [to, vtt.value],
                [metadata, Witnet.Coins.fromPedros(1n)],
              ],
              fees: vtt.fees,
            })
          } catch (err) {
            console.error(err)
            pending.push(unwrap)
            pendingValue += unwrap.value
            continue
          }

          console.info(`> Unwrapping { block: ${blockNumber}, nonce: ${nonce}, from: ${from} } ...`)
          console.info(`  => Recipient:  ${to}`)
          console.info(`  => Metadata:   ${digest} (${metadata})`)
          console.info(`  => Value:      ${Witnet.Coins.fromPedros(vtt.value.pedros - 1n).toString(2)}`)
          console.info(`  => Fee:        ${Witnet.Coins.fromPedros(vtt.fees.pedros + 1n).toString(2)}`)
          console.info(`  => VTT hash:   ${vtt.hash}`)

          // push new vtt data into unwrapper's mempool
          if (!vttEthMempool[blockNumber]) vttEthMempool[blockNumber] = []
          vttEthMempool[blockNumber][vtt.hash] = { nonce, from, to, value }
          vttBlockNumbers[vtt.hash] = blockNumber

          VTTs.confirmTransaction(vtt.hash, {
            confirmations: WIT_VTT_CONFIRMATIONS,
            onStatusChange: traceUnwrapping,
            onCheckpoint: traceUnwrapping,
          })
        }
      } else {
        pending.push(unwrap)
        pendingValue += unwrap.value
      }
    }
    if (pendingValue > balance.nanowits) {
      console.error(`> Insufficient funds (available: ${balance.toString(3)}, required: ${Witnet.Coins.fromPedros(pendingValue).toString(3)})`)
    } else if (pending.length > 0) {
      console.info(`> Awaiting UTXOs to be available for ${pending.length} pending transfers.`)
    }
    inbound = pending
  }

  function traceUnwrapping (receipt, error) {
    if (error) {
      console.info("> Value Transfer Transaction error while awaiting confirmations:")
      console.error(error)
    }
    const blockNumber = vttBlockNumbers[receipt.hash]
    const data = vttEthMempool[blockNumber][receipt.hash]
    if (receipt.status !== "confirmed" && receipt.status !== "finalized") {
      if (receipt.status !== "relayed") {
        const status = receipt.confirmations ? `T - ${WIT_VTT_CONFIRMATIONS - receipt.confirmations}` : receipt.status
        console.info(`> Unwrapping { block: ${blockNumber}, nonce: ${data.nonce}, from: ${data.from} } ... ${status}`)
      }
    } else if (receipt.status !== "relayed") {
      console.info(`> Unwrapped  { block: ${blockNumber}, nonce: ${data.nonce}, from: ${data.from}, into: ${data.to}, value: ${
        ethers.formatUnits(data.value, 9)
      } WIT }`)
      delete vttBlockNumbers[receipt.hash]
      delete vttEthMempool[blockNumber][receipt.hash]
      if (vttEthMempool[blockNumber].length === 0) {
        saveFromBlock(blockNumber)
      }
    }
  }

  function saveFromBlock (blockNumber) {
    // update last fully processed block number into local storage
    if (fromBlock < BigInt(blockNumber)) {
      fromBlock = blockNumber
      try {
        console.info(`> EVM checkpoint at: ${blockNumber}`)
        writeFileSync(STORAGE_PATH, fromBlock.toString(), { flag: "w+" })
      } catch (err) {
        console.error(`❌ Fatal: cannot write into local storage: ${err}`)
        process.exit(0)
      }
    }
  }

  async function checkWitnetBalance () {
    let newBalance = Witnet.Coins.fromPedros((await signer.getBalance()).unlocked)
    const now = Math.floor(Date.now() / 1000)
    const increased = newBalance.nanowits > balance?.nanowits || 0n
    const utxos = (await signer.getUtxos(increased)).filter(utxo => utxo.timelock <= now)
    if (increased && utxos.length < WIT_MIN_UTXOS) {
      const splits = Math.min(WIT_MIN_UTXOS * 2, 50)
      let fees = 10000n
      const recipients = []
      const value = Witnet.Coins.fromPedros((newBalance.pedros - fees) / BigInt(splits))
      fees += (newBalance.pedros - fees) % BigInt(splits)
      recipients.push(...Array(splits).fill([signer.pkh, value]))
      const receipt = await VTTs.sendTransaction({ recipients, fees: Witnet.Coins.fromPedros(fees) })
      console.info(JSON.stringify(receipt.tx, utils.txJsonReplacer, 4))
      await VTTs.confirmTransaction(receipt.hash, {
        onStatusChange: (receipt) => { console.info(`> Splitting UTXOs => ${receipt.hash} [${receipt.status}]`) },
      })
      newBalance = Witnet.Coins.fromPedros((await signer.getBalance()).unlocked)
    }
    return newBalance
  }

  connect()
}

main()
