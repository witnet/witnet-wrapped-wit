require('dotenv').config();
const fs = require("fs")
const { ethers } = require('ethers');
const { utils, Witnet } = require("@witnet/sdk")
const { 
    ABIs, 
    getNetworkAddresses, 
    getNetworkChainId, 
    isNetworkSupported, 
    isNetworkCanonical 
} = require("..");

const ETH_NETWORK = process.env.WRAPPED_WIT_UNWRAPPER_ETH_NETWORK
const ETH_SKIP_BLOCKS = process.env.WRAPPED_WIT_UNWRAPPER_ETH_SKIP_BLOCKS || 1
const ETH_WSS_PROVIDER = process.env.WRAPPED_WIT_UNWRAPPER_ETH_WSS_PROVIDER
const ETH_WSS_RECONNECT_INTERVAL = process.env.WRAPPED_WIT_UNWRAPPER_ETH_WSS_RECONNECT_MSECS || 5000;
const STORAGE_PATH = process.env.WRAPPED_WIT_UNWRAPPER_STORAGE_PATH || ".unwrapper"
const WIT_MASTER_KEY = process.env.WRAPPED_WIT_UNWRAPPER_WIT_MASTER_KEY
const WIT_MIN_BALANCE = process.env.WRAPPED_WIT_UNWRAPPER_WIT_MIN_BALANCE_WITS || 1000.0
const WIT_MIN_UTXOS = process.env.WRAPPED_WIT_UNWRAPPER_WIT_MIN_UTXOS || 16
const WIT_RPC_PROVIDER = process.env.WRAPPED_WIT_UNWRAPPER_WIT_RPC_PROVIDER || "https://rpc-01.witnet.io"
const WIT_UTXOS_STRATEGY = process.env.WRAPPED_WIT_UNWRAPPER_WIT_UTXOS_STRATEGY || "slim-fit"
const WIT_VTT_CONFIRMATIONS = process.env.WRAPPED_WIT_UNWRAPPER_WIT_VTT_CONFIRMATIONS || 3
const WIT_VTT_PRIORITY = process.env.WRAPPED_WIT_UNWRAPPER_WIT_VTT_PRIORITY || "opulent"

if (!isNetworkSupported(ETH_NETWORK)) {
    console.error(`Fatal: ${ETH_NETWORK.toUpperCase()} is not supported!`)
    process.exit(1)
} else if (!isNetworkCanonical(ETH_NETWORK)) {
    console.error(`Fatal: ${ETH_NETWORK.toUpperCase()} is not canonical!`)
    process.exit(1)
}

if (!fs.existsSync(STORAGE_PATH)) {
    fs.writeFileSync(STORAGE_PATH, "");
}

async function main() {

    const wallet = await Witnet.Wallet.fromXprv(
        WIT_MASTER_KEY, { 
            limit: 1,
            strategy: WIT_UTXOS_STRATEGY,
            provider: await Witnet.JsonRpcProvider.fromURL(WIT_RPC_PROVIDER)
        })
    
    console.info(`Wit/RPC provider:  ${WIT_RPC_PROVIDER}`)        
    console.info(`Witnet network:    WITNET:${wallet.provider.network.toUpperCase()} (${wallet.provider.networkId.toString(16)})`)
    console.info(`Witnet hot wallet: ${wallet.coinbase.pkh}`)

    const VTTs = Witnet.ValueTransfers.from(wallet.coinbase)

    const minBalance = Witnet.Coins.fromWits(WIT_MIN_BALANCE)

    let balance = 0n
    balance = await checkWitnetBalance()
    console.info(`Initial balance:   ${balance.toString(2)} (${wallet.coinbase.cacheInfo.size} UTXOs)`)
    if (balance.pedros < minBalance.pedros) {
        console.error(`❌ Fatal: hot wallet must be funded with at least ${minBalance.toString(2)}.`)
        process.exit(0)
    }
    
    let fromBlock
    try {
        fromBlock = BigInt(fs.readFileSync(STORAGE_PATH))
    } catch (err) {
        console.error(err)
    }
    if (!fromBlock || fromBlock < ETH_SKIP_BLOCKS) {
        fromBlock = BigInt(ETH_SKIP_BLOCKS)
    }

    let provider;
    let contract;

    let inbound = []
    let vttEthMempool = {}
    let vttBlockNumbers = {}
    
    async function connect() {
        
        console.info(`Connecting to WebSocket ...`);
        
        console.info(`> Eth/WSS provider:  ${ETH_WSS_PROVIDER}`)
        provider = new ethers.WebSocketProvider(ETH_WSS_PROVIDER);
        
        const network = await provider.getNetwork()
        if (Number(network.chainId) !== getNetworkChainId(ETH_NETWORK)) {
            console.error(`> Fatal: connected to wrong EVM chain id (${network.chainId}).`)
            process.exit(0)
        }
        console.info(`> Ethereum network:  ${ETH_NETWORK.toUpperCase()} (${network.chainId})`)

        contract = new ethers.Contract(
            getNetworkAddresses(ETH_NETWORK).WrappedWIT, 
            ABIs.WrappedWIT, 
            provider
        );
        console.info(`> Ethereum contract: ${await contract.getAddress()}`)        

        const witUnwrapper = await contract.witUnwrapper()
        if (witUnwrapper !== wallet.coinbase.pkh) {
            console.error(`> Fatal: contract's hot wallet mismatch: ${witUnwrapper}`)
            process.exit(0)
        }

        if (await provider.getBlockNumber() > fromBlock) {
            const unwraps = await contract.queryFilter("Unwrapped", fromBlock)
            if (unwraps.length > 0) {
                console.info(`> Catching up previous unwraps ...`)
                await Promise.all(unwraps.map(log => onUnwrapped(...log.args, log)))
            }
        }
       
        contract.on("Unwrapped", onUnwrapped);
        contract.on("NewUnwrapper", onNewUnwrapper)

        provider.websocket.on("close", (code) => {
            console.error(`⚠️ WebSocket closed with code ${code}. Reconnecting in ${ETH_WSS_RECONNECT_INTERVAL / 1000} seconds...`);
            cleanup();
            setTimeout(connect, ETH_WSS_RECONNECT_INTERVAL);
        });
        

        provider.on("block", async (blockNumber) => {
            console.info(`> EVM block number:  ${blockNumber}`)
            if (Number(blockNumber) % 10 === 0) {
                balance = await checkWitnetBalance()
                if (balance.nanowits < minBalance.nanowits) {
                    console.error(`> Witnet balance below ${minBalance.toString(2)}`)
                } else {
                    console.info (`> Witnet balance: ${balance.toString(2)}`)
                }
            }
            flushInbound()
        })

        provider.on("error", err => {
            console.error("⚠️ WebSocket error:", err.message);
            cleanup();
            setTimeout(connect, ETH_WSS_RECONNECT_INTERVAL);
        });
    }
    
    // Clean listeners and connections before reconnecting
    function cleanup() {
        contract?.removeAllListeners();
        provider?.websocket.close()
    }

    function onNewUnwrapper(newUnwrapper, event) {
        if (newUnwrapper !== wallet.coinbase.pkh) {
            console.info(`❌ Fatal: contract's hot wallet changed from ${wallet.coinbase.pkh} to ${newUnwrapper} on block ${event.blockNumber}.`)
            process.exit(0)
        }
    }

    async function flushInbound() {
        const pending = []
        const pendingValue = 0n
        for (let index = 0; index < inbound.length; index ++) {
            const unwrap = inbound[index]
            if (wallet.coinbase.cacheInfo.expendable > unwrap?.value) {
                const { blockNumber, nonce, from, to, digest, metadata, value } = unwrap
                
                let vtt; 
                try {
                    vtt = await VTTs.sendTransaction({
                        recipients: [ 
                            [ to, Witnet.Coins.fromPedros(value) ], 
                            [ metadata, Witnet.Coins.fromPedros(1n) ]
                        ],
                        fees: WIT_VTT_PRIORITY
                    })
                } catch (err) {
                    console.error(err)
                    pending.push(unwrap)
                    pendingValue += unwrap.value
                    continue
                }

                console.info(`> Unwrapping { block: ${blockNumber}, nonce: ${nonce}, from: ${from} } ...`)
                console.info(`  => Recipient:  ${to}`)
                console.info(`  => Metadata:   ${metadata} [${digest.slice(2)}]`)
                console.info(`  => Value:      ${ethers.formatUnits(value, 9)} WIT`)
                
                console.info(`  => Fee:        ${vtt.fees.toString(2)}`)
                console.info(`  => VTT hash:   ${vtt.hash}`)

                // push new vtt data into unwrapper's mempool
                if (!vttEthMempool[blockNumber]) vttEthMempool[blockNumber] = []
                vttEthMempool[blockNumber][vtt.hash] = { nonce, from, to, value }
                vttBlockNumbers[vtt.hash] = blockNumber

                VTTs.confirmTransaction(vtt.hash, { 
                    confirmations: WIT_VTT_CONFIRMATIONS,
                    onStatusChange: traceUnwrapping,
                    onCheckpoint: traceUnwrapping
                })
            
            } else {
                pending.push(unwrap)
                pendingValue += unwrap.value
            }
        }
        if (pendingValue > balance.nanowits) {
            console.error(`> Insufficient funds (available: ${balance.toString(3)}, required: ${Witnet.Coins.fromPedros(pendingValue).toString(3)})`)
        } else if (pending.length > 0) {
            console.info (`> Awaiting UTXOs to be available for ${pending.length} pending transfers.`)
        }
        inbound = pending
    }

    async function onUnwrapped(from, to, value, nonce, event) {
        
        let blockNumber = event?.log?.blockNumber || event?.blockNumber

        const digest = ethers.solidityPackedKeccak256(
            [ "uint256", "uint256", "address", "string", "uint256" ],
            [ blockNumber, nonce, from, to, value ],
        ).slice(0, 42);
        const metadata = Witnet.PublicKeyHash.fromHexString(digest).toBech32(wallet.provider.network)
        
        // Rely on Witnet's metadata storage to verify the unwrap transaction has not yet been attended,
        // neither by `wallet.coinbase.pkh` nor any other hot wallet in the past.
        let alreadyUnwrapped = false

        const vtts = await wallet.provider
            .getUtxos(metadata)
            .then(utxos => utxos.map(utxo => utxo.output_pointer.split(':')[0]))
        
        for (let index = 0; index < vtts.length; index ++) {
            const report = await wallet.provider.getValueTransfer(vtts[index], "ethereal")
            if (report.recipient === to && report.value >= value) {
                alreadyUnwrapped = true
                break;
            }
        }
        if (alreadyUnwrapped) {
            console.info(`> Unwrapped  { block: ${blockNumber}, nonce: ${nonce}, from: ${from}, into: ${to}, value: ${ethers.formatUnits(value, 9)} WIT }`)
        
        } else {
            inbound.push({ blockNumber, from, to, value, nonce, event, digest, metadata })
        }
    }

    function traceUnwrapping(receipt, error) {
        if (error) {
            console.error(`> Failed     { block: ${blockNumber}, nonce: ${data.nomce}, from: ${data.from} }`)
            process.exit(1)
        }
        let blockNumber = vttBlockNumbers[receipt.hash] 
        let data = vttEthMempool[blockNumber][receipt.hash]
        if (receipt.status !== "confirmed" && receipt.status !== "finalized") {
            if (receipt.status !== "relayed") {
                const status = receipt.confirmations ? `T - ${WIT_VTT_CONFIRMATIONS - receipt.confirmations}` : receipt.status
                console.info(`> Unwrapping { block: ${blockNumber}, nonce: ${data.nonce}, from: ${data.from} } ... ${status}`)
            }
        } else if (receipt.status !== "relayed") {
            console.info(`> Unwrapped  { block: ${blockNumber}, nonce: ${data.nonce}, from: ${data.from}, into: ${data.to}, value: ${ethers.formatUnits(data.value, 9)} WIT }`)
            delete vttBlockNumbers[receipt.hash]
            delete vttEthMempool[blockNumber][receipt.hash]
            if (vttEthMempool[blockNumber].length === 0)  {
                saveFromBlock(blockNumber)
            }
        }
    }

    function saveFromBlock(blockNumber) {
        // update last fully processed block number into local storage
        if (fromBlock < BigInt(blockNumber)) {
            fromBlock = blockNumber
            try {
                console.info(`> EVM checkpoint at: ${blockNumber}`)
                fs.writeFileSync(STORAGE_PATH, fromBlock.toString(), { flag: "w+" })
            } catch (err) {
                console.error(`❌ Fatal: cannot write into local storage: ${err}`)
                process.exit(0)        
            }
        }
    }

    async function checkWitnetBalance() {
        let newBalance = Witnet.Coins.fromPedros((await wallet.coinbase.getBalance()).unlocked)
        let now = Math.floor(Date.now() / 1000)
        let utxos = (await wallet.coinbase.getUtxos()).filter(utxo => utxo.timelock <= now)
        if (newBalance.nanowits > balance.nanowits && utxos.length < WIT_MIN_UTXOS) {
            const splits = Math.min(WIT_MIN_UTXOS * 2, 50)
            let fees = 10000n
            const recipients = []
            const value = Witnet.Coins.fromPedros((newBalance.pedros - fees) / BigInt(splits))
            fees += (newBalance.pedros - fees) % BigInt(splits)
            recipients.push(...Array(splits).fill([ wallet.coinbase.pkh, value ]))
            const receipt = await VTTs.sendTransaction({ recipients, fees: Witnet.Coins.fromPedros(fees) })
            console.info(JSON.stringify(receipt.tx, utils.txJsonReplacer, 4))
            await VTTs.confirmTransaction(receipt.hash, {
                onStatusChange: (receipt) => { console.info(`> Splitting UTXOs => ${receipt.hash} [${receipt.status}]`)},
            })
            newBalance = Witnet.Coins.fromPedros((await wallet.coinbase.getBalance()).unlocked)
        }
        return newBalance
    }

    connect()
}

main();
