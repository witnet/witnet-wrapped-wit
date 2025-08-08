#!/usr/bin/env node

require("dotenv").config()
const moment = require("moment")
const { execSync, spawn } = require("node:child_process")
const os = require("os")
const prompt = require("inquirer").createPromptModule()

const { ethers, utils, KermitClient, Witnet } = require("@witnet/ethers")

const { WrappedWIT } = require("../..")

const helpers = require("./helpers")
const { colors } = helpers

/// CONSTANTS AND GLOBALS =============================================================================================

const settings = {
  flags: {
    help: "Show usage information for a specific command.",
    verbose: "Outputs detailed information.",
    version: "Print the CLI name and version.",

    check: "See if cross-chain transactions have been consolidated.",
    mints: "Include mint transactions, if any.",
    burns: "Include burn transactions, if any.",
    mainnets: "Only list supported EVM mainnets.",
    testnets: "Only list suppoered EVM testnets.",

  },
  options: {
    offset: {
      hint: "Skip the first output records when using --fromBlock (default: 0)",
      param: "OFFSET",
    },
    limit: {
      hint: "Limit number of output records (default: 64).",
      param: "LIMIT",
    },
    since: {
      hint: "Process events starting from the given EVM block number.",
      param: "EVM_BLOCK",
    },
    from: {
      hint: "Filter events by sender address.",
      param: "EVM|WIT_ADDRESS",
    },
    into: {
      hint: "Filter events by recipient address (or recipient of --value, when specified).",
      param: "EVM|WIT_ADDRESS",
    },
    "vtt-hash": {
      hint: "The hash of some finalized wrap transfer transaction in Witnet, pending to be verified.",
      param: "WIT_VTT_HASH",
    },
    value: {
      hint: "Send this amount of wrapped Wits to the specified recipient (requires --into).",
      param: "WIT_COINS",
    },
    gasPrice: {
      hint: "Specify the EVM transaction gas price to pay for.",
      param: "EVM_GAS_PRICE",
    },
    port: {
      hint: "Port on which the local ETH/RPC signing proxy is expected to be listening (default: 8545).",
      param: "HTTP_PORT",
    },
    remote: {
      hint: "Remote ETH/RPC provider to connect to, other than default's",
      param: "URL",
    },
    witnet: {
      hint: "Wit/Oracle RPC provider to connect to, other than default's.",
      param: "URL",
    },
    kermit: {
      hint: "Wit/Kermit REST-API provider to connect to, other than default's.",
      param: "URL",
    },
  },
  envars: {
    ETHRPC_PRIVATE_KEYS: "=> Private keys used by the ETH/RPC proxy for signing EVM transactions.",
    WITNET_SDK_WALLET_MASTER_KEY: "=> Wallet's master key in XPRV format, as exported from either a node, Sheikah or myWitWallet.",
  },
}

/// MAIN WORKFLOW =====================================================================================================

main()

async function main () {
  let ethRpcPort = 8545
  if (process.argv.indexOf("--port") >= 0) {
    ethRpcPort = parseInt(process.argv[process.argv.indexOf("--port") + 1])
  }
  let ethRpcProvider, ethRpcChainId, ethRpcNetwork, ethRpcError
  try {
    ethRpcProvider = new ethers.JsonRpcProvider(`http://127.0.0.1:${ethRpcPort}`)
    ethRpcChainId = (await ethRpcProvider.getNetwork()).chainId
    ethRpcNetwork = utils.getEvmNetworkByChainId(ethRpcChainId)
  } catch (err) {
    ethRpcError = err
  }

  const router = {
    ...(WrappedWIT.isNetworkSupported(ethRpcNetwork)
      ? {
        accounts: {
          hint: `Show EVM native and Wrapped/WIT balances for all available signing accounts on ${
            colors.mcyan(ethRpcNetwork.toUpperCase())
          }.`,
          options: [
            "port",
          ],
          envars: [],
        },
        contract: {
          hint: `Show Wrapped/WIT contract address on ${colors.mcyan(ethRpcNetwork.toUpperCase())}.`,
          flags: [
            "verbose",
          ],
        },
        supply: {
          hint: `Show wrapped $WIT supply information on ${colors.mcyan(ethRpcNetwork.toUpperCase())}.`,
          flags: [
            "verbose",
          ],
          options: [
            "witnet",
            "port",
            ...(WrappedWIT.isNetworkCanonical(ethRpcNetwork)
              ? ["witnet"]
              : []
            ),
            "limit",
            "from",
            "gasPrice",
          ],
          envars: [
            ...(WrappedWIT.isNetworkCanonical(ethRpcNetwork)
              ? ["WITNET_SDK_WALLET_MASTER_KEY"]
              : []
            ),
          ],
        },
        transfers: {
          hint: `Show transfers of Wrapped/WIT tokens on ${colors.mcyan(ethRpcNetwork.toUpperCase())}.`,
          flags: [
            "burns",
            "mints",
          ],
          options: [
            "port",
            "limit",
            "offset",
            "since",
            "from",
            "into",
            "value",
            "gasPrice",
          ],
        },
      }
      : {}),
    ...(WrappedWIT.isNetworkCanonical(ethRpcNetwork)
      ? {
        wrappings: {
          hint: `Show wrapping transactions into ${colors.mcyan(ethRpcNetwork.toUpperCase())}.`,
          flags: [
            "check",
          ],
          options: [
            "witnet",
            "port",
            "limit",
            "offset",
            "since",
            "from",
            "into",
            "value",
            "vtt-hash",
            "gasPrice",
          ],
          envars: ["WITNET_SDK_WALLET_MASTER_KEY"],
        },
        unwrappings: {
          hint: `Show unwrapping transactions from ${colors.mcyan(ethRpcNetwork.toUpperCase())}.`,
          flags: [
            "check",
          ],
          options: [
            "witnet",
            "port",
            "limit",
            "offset",
            "since",
            "from",
            "into",
            "value",
            "gasPrice",
          ],
          envars: [],
        },
      }
      : {}),
    proxy: {
      hint: "Launch a local ETH/RPC signing proxy connected to some specific EVM network.",
      params: ["EVM_NETWORK"],
      options: [
        "port",
        "remote",
      ],
      envars: [
        "ETHRPC_PRIVATE_KEYS",
      ],
    },
    networks: {
      hint: "List EVM networks where the Wrapped/WIT token is available.",
      params: "[EVM_ECOSYSTEM]",
      flags: [
        "mainnets",
        "testnets",
      ],
    },
    commands: {
      accounts,
      contract,
      proxy,
      networks,
      supply,
      transfers,
      unwrappings,
      wrappings,
    },
  }

  let [args, flags] = helpers.extractFlagsFromArgs(process.argv.slice(2), Object.keys(settings.flags))
  if (flags.version) {
    console.info(`${colors.lwhite(`Wrapped/WIT CLI v${require("../../../package.json").version}`)}`)
  }
  let options; [args, options] = helpers.extractOptionsFromArgs(args, Object.keys(settings.options))
  if (args[0] && router.commands[args[0]] && router[args[0]]) {
    const cmd = args[0]
    if (flags.help) {
      showCommandUsage(router, cmd, router[cmd])
    } else {
      try {
        await router.commands[cmd]({
          ...settings,
          ...flags,
          ...options,
          provider: ethRpcProvider,
          network: ethRpcNetwork,
        }, args.slice(1))
      } catch (e) {
        showUsageError(router, cmd, router[cmd], e)
      }
    }
  } else {
    const requiredEnvVars = [
      "ETHRPC_PRIVATE_KEYS",
      "WITNET_SDK_WALLET_MASTER_KEY",
    ]
    const missingEnvVars = requiredEnvVars.filter(key => !process.env[key])
    showMainUsage(router, missingEnvVars)
    if (!args[0] && (ethRpcError || !ethRpcNetwork)) {
      if (ethRpcChainId) {
        console.info(colors.mred(`\nTrying to connect to unsupported network (${ethRpcChainId}).`))
      } else if (ethRpcPort) {
        console.info(colors.mred(`\nNo ETH/RPC proxy running on port ${ethRpcPort}.`))
      }
    }
  }
}

function showMainUsage (router, envars) {
  showUsageHeadline(router)
  showUsageFlags(["help", "version"])
  showUsageOptions(["port"])
  console.info("\nCOMMANDS:")
  const maxLength = Object.keys(router.commands).map(key => key.length).reduce((prev, curr) => curr > prev ? curr : prev)
  Object.keys(router.commands).forEach(cmd => {
    if (router[cmd]) console.info("  ", `${cmd}${" ".repeat(maxLength - cmd.length)}`, " ", router[cmd]?.hint)
  })
  showUsageEnvars(envars)
}

function showCommandUsage (router, cmd, specs) {
  showUsageHeadline(router, cmd, specs)
  showUsageFlags(specs?.flags || [])
  showUsageOptions(specs?.options || [])
  showUsageEnvars(specs?.envars || [])
}

function showUsageEnvars (envars) {
  if (envars.length > 0) {
    console.info("\nENVARS:")
    const maxWidth = envars.map(envar => envar.length).reduce((curr, prev) => curr > prev ? curr : prev)
    envars.forEach(envar => {
      if (envar.toUpperCase().indexOf("KEY") < 0 && process.env[envar]) {
        console.info("  ", `${colors.yellow(envar.toUpperCase())}${" ".repeat(maxWidth - envar.length)}`, ` => Settled to "${process.env[envar]}"`)
      } else {
        console.info("  ", `${colors.yellow(envar.toUpperCase())}${" ".repeat(maxWidth - envar.length)}`, ` ${settings.envars[envar]}`)
      }
    })
  }
}

function showUsageError (router, cmd, specs, error) {
  showCommandUsage(router, cmd, specs)
  if (error) {
    console.info()
    console.info(error)
    // console.error(error?.stack?.split("\n")[0] || error)
  }
}

function showUsageFlags (flags) {
  if (flags.length > 0) {
    const maxWidth = flags.map(flag => flag.length).reduce((curr, prev) => curr > prev ? curr : prev)
    console.info("\nFLAGS:")
    flags.forEach(flag => {
      if (settings.flags[flag]) {
        console.info(`   --${flag}${" ".repeat(maxWidth - flag.length)}   ${settings.flags[flag]}`)
      }
    })
  }
}

function showUsageHeadline (router, cmd, specs) {
  console.info("USAGE:")
  const flags = cmd && (!specs?.flags || specs.flags.length === 0) ? "" : "[FLAGS] "
  const options = specs?.options && specs.options.length > 0 ? "[OPTIONS] " : ""
  if (cmd) {
    if (specs?.params) {
      let params
      const optionalize = (str) => str.endsWith(" ...]")
        ? `[<${str.slice(1, -5)}> ...]`
        : (
          str[0] === "[" ? `[<${str.slice(1, -1)}>]` : `<${str}>`
        )
      if (Array.isArray(specs?.params)) {
        params = specs.params.map(param => optionalize(param)).join(" ") + " "
      } else {
        params = optionalize(specs?.params) + " "
      }
      console.info(`   ${colors.lwhite(`npx witwrap ${cmd}`)} ${params ? colors.green(params) : ""}${flags}${options}`)
    } else {
      console.info(`   ${colors.lwhite(`npx witwrap ${cmd}`)} ${flags}${options}`)
    }
    console.info("\nDESCRIPTION:")
    console.info(`   ${router[cmd].hint}`)
  } else {
    console.info(`   ${colors.lwhite("npx witwrap")} <COMMAND> ${flags}${options}`)
  }
}

function showUsageOptions (options) {
  if (options.length > 0) {
    console.info("\nOPTIONS:")
    const maxLength = options
      .map(option => settings.options[option].param
        ? settings.options[option].param.length + option.length + 3
        : option.length
      )
      .reduce((prev, curr) => curr > prev ? curr : prev)
    options.forEach(option => {
      if (settings.options[option].hint) {
        const str = `${option}${settings.options[option].param ? colors.gray(` <${settings.options[option].param}>`) : ""}`
        console.info("  ", `--${str}${" ".repeat(maxLength - helpers.colorstrip(str).length)}`, "  ", settings.options[option].hint)
      }
    })
  }
}

/// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function accounts (flags = {}) {
  const { provider, network } = flags
  const contract = await WrappedWIT.fetchContractFromEthersProvider(provider)
  helpers.traceHeader(network.toUpperCase(), colors.lcyan)

  const signers = await provider.listAccounts()
  const records = []
  let totalWit = 0n; let totalEth = 0n
  records.push(
    ...await Promise.all(signers.map(async signer => {
      const eth = await provider.getBalance(signer.address)
      const wit = BigInt(await contract.balanceOf.staticCall(signer.address))
      totalEth += eth
      totalWit += wit
      return [signer.address, eth, wit]
    }))
  )
  records.push(["", totalEth, totalWit])

  helpers.traceTable(
    records.map(([address, eth, wit], index) => {
      totalWit += wit
      eth = (Number(eth / BigInt(10 ** 15)) / 1000).toFixed(3)
      wit = (Number(wit / BigInt(10 ** 8)) / 10).toFixed(1)
      return [
        address !== "" ? index : "",
        address,
        address !== "" ? colors.blue(helpers.commas(eth)) : colors.lblue(helpers.commas(eth) + " ETH"),
        address !== "" ? colors.yellow(helpers.commas(wit)) : colors.lyellow(helpers.commas(wit) + " WIT"),
      ]
    }), {
      headlines: ["INDEX", "EVM ADDRESS", `${colors.lwhite("ETH")} BALANCE`, `${colors.lwhite("WIT")} BALANCE`],
      humanizers: [helpers.commas, , ,],
      colors: [, colors.mblue],
    }
  )
}

async function proxy (flags = {}, args = []) {
  [args] = helpers.deleteExtraFlags(args)
  const network = args[0]
  if (!network) {
    throw new Error("No EVM network was specified.")
  } else if (network && !WrappedWIT.isNetworkSupported(network)) {
    throw new Error(`Unsupported network "${network}"`)
  } else {
    const shell = spawn(
      os.type() === "Windows_NT" ? "npx.cmd" : "npx", [
        "ethrpc",
        network,
        flags?.port || 8545,
        flags?.remote,
      ],
      { shell: true }
    )
    shell.stdout.on("data", (x) => {
      process.stdout.write(x.toString())
    })
    shell.stderr.on("data", (x) => {
      process.stderr.write(x.toString())
    })
  }
}

async function networks (flags = {}) {
  const { mainnets, testnets } = flags
  const networks = Object.fromEntries(WrappedWIT.getSupportedNetworks()
    .filter(network => {
      const settings = WrappedWIT.getNetworkSettings(network)
      const address = WrappedWIT.getNetworkAddresses(network)[settings.contract]
      return address && address !== "" && (
        (WrappedWIT.isNetworkMainnet(network) && (mainnets || !testnets)) ||
        (!WrappedWIT.isNetworkMainnet(network) && (testnets || !mainnets))
      )
    })
    .map(network => {
      return [
        WrappedWIT.isNetworkCanonical(network) ? colors.lwhite(network) : network, {
          "Chain id": WrappedWIT.getNetworkChainId(network),
          Mainnet: WrappedWIT.isNetworkMainnet(network),
          Canonical: WrappedWIT.isNetworkCanonical(network),
        },
      ]
    })
  )
  console.table(networks)
}

async function contract (flags = {}) {
  const { network, provider, verbose } = flags
  const contract = await WrappedWIT.fetchContractFromEthersProvider(provider)
  const settings = WrappedWIT.getNetworkSettings(network)
  const isCanonical = WrappedWIT.isNetworkCanonical(network)

  const records = []

  records.push(["ERC-20 contract address", colors.lblue(await contract.getAddress())])
  
  if (verbose && isCanonical) {
    records.push(["Wit/Oracle contract address", colors.mblue(await contract.witOracle())])
    records.push(["Wit/Oracle PoI's CCDR template", colors.mblue(await contract.witOracleCrossChainProofOfInclusionTemplate())])
    records.push(["Wit/Oracle PoR's Radon hash", colors.green((await contract.witOracleProofOfReserveRadonHash()).slice(2))])
  }
  records.push(["Wit/Custodian recipient address", colors.lmagenta(await contract.witCustodianWrapper())])
  if (verbose && isCanonical) {
    records.push(["Wit/Custodian sender address", colors.mmagenta(await contract.witCustodianUnwrapper())])
  }
  if (isCanonical) {
    records.push(["Verified wrap transactions", colors.white(helpers.commas(await contract.totalWraps()))])
    records.push(["Requested unwrap transactions", colors.white(helpers.commas(await contract.totalUnwraps()))])
  }
  helpers.traceTable(records, {
    headlines: [
      `:${colors.lcyan(network.replace(":", " ").toUpperCase())}`,
      `:${colors.lwhite(settings.contract + " contract")}`,
    ],
  })
}

async function supply (flags = {}) {
  let { network, provider, from, gasPrice, confirmations, verbose, limit } = flags
  let contract = await WrappedWIT.fetchContractFromEthersProvider(provider)

  const records = []

  const totalSupply = Witnet.Coins.fromPedros(await contract.totalSupply())
  if (WrappedWIT.isNetworkCanonical(network)) {
    // connect to Witnet
    const witnet = await Witnet.JsonRpcProvider.fromEnv(flags?.witnet || (WrappedWIT.isNetworkMainnet(network) ? undefined : "https://rpc-testnet.witnet.io"))
    const witnetSupply = await witnet.supplyInfo()

    const totalReserveSupply = Witnet.Coins.fromPedros(await contract.totalReserveSupply())
    records.push([
      "Currently tradeable token supply",
      totalReserveSupply.pedros <= totalSupply.pedros
        ? colors.lyellow(helpers.commas(totalSupply.wits.toFixed(2)))
        : colors.yellow(helpers.commas(totalSupply.wits.toFixed(2))),
    ])
    records.push([
      "Max. supply that can be unwrapped",
      totalReserveSupply.pedros >= totalSupply.pedros
        ? colors.myellow(helpers.commas(totalSupply.wits.toFixed(2)))
        : colors.yellow(helpers.commas(totalReserveSupply.wits.toFixed(2))),
    ])

    const witCustodianWrapper = await contract.witCustodianWrapper()
    const witCustodianUnwrapper = await contract.witCustodianUnwrapper()
    let witnetBalance = 0n

    const custodianBalance = await witnet.getBalance(witCustodianWrapper)
    witnetBalance += custodianBalance.locked + custodianBalance.staked + custodianBalance.unlocked
    if (witCustodianUnwrapper !== witCustodianWrapper) {
      const unwrapperBalance = await witnet.getBalance(witCustodianUnwrapper)
      witnetBalance += unwrapperBalance.locked + unwrapperBalance.staked + unwrapperBalance.unlocked
    }
    records.push([
      "Token under-custody supply on Witnet",
      witnetBalance >= totalReserveSupply.pedros
        ? colors.mmagenta(helpers.commas(Witnet.Coins.fromPedros(witnetBalance).wits.toFixed(2)))
        : colors.magenta(helpers.commas(Witnet.Coins.fromPedros(witnetBalance).wits.toFixed(2))),
    ])

    records.push([
      "Potentially wrappable supply on Witnet",
      colors.lmagenta(helpers.commas(
        Witnet.Coins.fromPedros(BigInt(witnetSupply.current_unlocked_supply) - witnetBalance).wits.toFixed(2)
      )),
    ])

    records.push([
      "Currently locked/staked supply on Witnet",
      colors.gray(helpers.commas(
        Witnet.Coins.fromPedros(
          BigInt(witnetSupply.current_staked_supply) + BigInt(witnetSupply.current_locked_supply)
        ).wits.toFixed(2)
      )),
    ])

    if (witnetBalance !== totalReserveSupply.pedros) {
      const user = await prompt([{
        message: "On-chain under-custody supply is outdated! Shall we report a fresh new Proof-of-Reserve ?",
        name: "continue",
        type: "confirm",
        default: false,
      }])

      if (user.continue) {
        helpers.traceHeader(network.toUpperCase(), colors.lcyan)

        // create Witnet Wallet
        const wallet = await Witnet.Wallet.fromEnv({ provider: witnet, strategy: "slim-first" })

        // fetch proof-of-reserve radon bytecode from the token contract
        const bytecode = await contract.witOracleProofOfReserveRadonBytecode()

        // fetch Wit/Oracle Query settings from the token contract
        const querySettings = await contract.witOracleQuerySettings()

        // create Witnet Radon request
        const request = Witnet.Radon.RadonRequest.fromBytecode(bytecode)

        // print dry-run report on console
        console.info(colors.lwhite("> Notarizing Proof-of-Reserve on Witnet ..."))
        execSync(
          `npx witsdk radon dry-run ${bytecode} --verbose --indent 2 --headline "WRAPPED / WIT PROOF-OF-RESERVE DRY-RUN REPORT"`,
          { stdio: "inherit", stdout: "inherit" },
        )
        console.info()

        // create and transmit Witnet Data Request Transaction (DRT)
        const PoRs = Witnet.DataRequests.from(wallet, request)
        let tx = await PoRs.sendTransaction({
          fees: Witnet.TransactionPriority.Medium,
          witnesses: querySettings.minWitnesses,
          maxResultSize: 256,
        })

        // await inclusion of the DRT in Witnet
        console.info(`  - DRO hash:   ${colors.green(tx.droHash)}`)
        console.info(`  - DRT hash:   ${colors.lwhite(tx.hash)}`)
        console.info(`  - DRT cost:   ${colors.mmagenta(ethers.formatUnits(tx.fees.nanowits + tx.value?.nanowits, 9) + " WIT")}`)
        tx = await PoRs.confirmTransaction(tx.hash, {
          confirmations: 0,
          onStatusChange: () => console.info(`  - DRT status: ${tx.status}`),
        })

        // await resolution of the DRT in Witnet
        let status = tx.status
        do {
          const report = await witnet.getDataRequest(tx.hash, "ethereal")
          if (report.status !== status) {
            status = report.status
            console.info(`  - DRT status: ${report.status}`)
          }
          if (report.status === "solved" && report?.result) {
            console.info(`  - DRT result: ${utils.cbor.decode(utils.fromHexString(report.result.cbor_bytes))}`)
            break
          }
          const delay = ms => new Promise(_resolve => setTimeout(_resolve, ms))
          await helpers.prompter(delay(5000))
        } while (status !== "solved")

        // retrieve data push report from Wit/Kermit:
        console.info(
          colors.lwhite("\n> Pushing Proof-of-Reserve report into ") +
          colors.mblue(WrappedWIT.getNetworkContractAddress(network)) +
          colors.lwhite(" ...")
        )
        const kermit = await KermitClient.fromEnv(flags?.kermit)
        console.info(`  - Wit/Kermit provider: ${kermit.url}`)
        const report = await kermit.getDataPushReport(tx.hash, network)
        const message = utils.abiEncodeDataPushReportMessage(report)
        const digest = utils.abiEncodeDataPushReportDigest(report)
        helpers.traceData("  - Push data report: ", message.slice(2), 64, "\x1b[90m")
        console.info(`  - Push data digest: ${digest.slice(2)}`)
        console.info(`  - Push data proof:  ${report?.evm_proof.slice(2)}`)

        // push data report into the consumer contract:
        if (!from) from = (await provider.listAccounts())[0].address
        contract = contract.connect(await provider.getSigner(from))
        console.info(`  - EVM data pusher:  ${from}`)
        await contract
          .pushDataReport
          .send(
            utils.abiEncodeDataPushReport(report),
            report.evm_proof,
            { gasPrice }
          )
          .then(async (tx) => {
            console.info(`  - Transaction hash: ${tx.hash}`)
            return helpers.prompter(tx.wait(confirmations || 1))
          })
          .then(receipt => {
            console.info(`  - Block number:     ${helpers.commas(receipt.blockNumber)}`)
            console.info(`  - Gas price:        ${helpers.commas(receipt.gasPrice)}`)
            console.info(`  - Gas used:         ${helpers.commas(receipt.gasUsed)}`)
            console.info(`  - Transaction cost: ${ethers.formatEther(receipt.gasPrice * receipt.gasUsed)} ETH`)
            return receipt
          })
      }
    }
  } else {
    records.push([
      "Currently tradeable token supply",
      colors.myellow(helpers.commas(totalSupply.wits.toFixed(2))),
    ])
  }

  helpers.traceTable(records, {
    headlines: [
      `${colors.lcyan(network.replace(":", " ").toUpperCase())}`,
      "Available ($WIT)",
    ],
  })
  if (verbose) {
    let events = await contract.queryFilter("ReserveUpdate")
    helpers.traceTable(
      events.reverse().slice(0, limit || 64).map(event => [
        event.blockNumber,
        event.args[0], //Witnet.Coins.fromPedros(event.args[0]).wits.toFixed(2),
        event.args[2].slice(2),
        moment.unix(Number(event.args[1])),
      ]), {
        headlines: [
          "BLOCK NUMBER",
          `REPORTED SUPPLY (${colors.lwhite("$pedros")})`,
          `PROOF-OF-RESERVE WITNESSING ACT ON ${colors.lwhite(`WITNET ${WrappedWIT.isNetworkMainnet(network) ? "MAINNET": "TESTNET"}`)}`,
          "PROOF-OF-RESERVE TIMESTAMP",
        ],
        colors: [ , colors.myellow, colors.magenta, colors.mmagenta ],
        humanizers: [ helpers.commas, helpers.commas ],
      }
    )
  }
  process.exit(0)
}

async function transfers (flags = {}) {
  let { provider, network, from, into, value, since, gasPrice, confirmations } = flags
  let contract = await WrappedWIT.fetchContractFromEthersProvider(provider)
  helpers.traceHeader(network.toUpperCase(), colors.lcyan)

  if (value) {
    value = Witnet.Coins.fromWits(value)
    if (!into) {
      throw new Error("--into must be specified.")
    } else if (!from) {
      from = (await provider.listAccounts())[0].address
    }
    contract = contract.connect(await provider.getSigner(from))
    console.info(colors.lwhite(`> Transferring ${ethers.formatUnits(value.pedros, 9)} WIT ...`))
    console.info(`  - EVM sender:       ${from}`)
    console.info(`  - EVM recipient:    ${into}`)
    await contract
      .transfer
      .send(into, value.pedros, { gasPrice })
      .then(async (tx) => {
        console.info(`  - Transaction hash: ${tx.hash}`)
        return helpers.prompter(tx.wait(confirmations || 1))
      })
      .then(receipt => {
        console.info(`  - Block number:     ${helpers.commas(receipt.blockNumber)}`)
        console.info(`  - Gas price:        ${helpers.commas(receipt.gasPrice)}`)
        console.info(`  - Gas used:         ${helpers.commas(receipt.gasUsed)}`)
        console.info(`  - Transaction cost: ${ethers.formatEther(receipt.gasPrice * receipt.gasUsed)} ETH`)
        return receipt
      })
  }

  const fromBlock = since ? BigInt(flags.since) : undefined
  let events = (fromBlock !== undefined && !value
    ? (await contract.queryFilter("Transfer", fromBlock)).slice(flags?.offset || 0, flags?.limit || 64)
    : (await contract.queryFilter("Transfer")).reverse().slice(0, flags?.limit || 64)
  )
  if (from) events = events.filter(event => event.args[0].toLowerCase().indexOf(from.toLowerCase()) > -1)
  if (into && !value) events = events.filter(event => event.args[1].toLowerCase().indexOf(into.toLowerCase()) > -1)
  if (!flags?.mints) events = events.filter(event => event.args[0] !== "0x0000000000000000000000000000000000000000")
  if (!flags?.burns) events = events.filter(event => event.args[1] !== "0x0000000000000000000000000000000000000000")
  if (events.length > 0) {
    helpers.traceTable(
      events.map(event => {
        const sender = `${event.args[0].slice(0, 7)}...${event.args[0].slice(-7)}`
        const recipient = `${event.args[1].slice(0, 7)}...${event.args[1].slice(-7)}`
        return [
          event.blockNumber,
          event.transactionHash,
          event.args[0] === "0x0000000000000000000000000000000000000000" ? colors.blue(sender) : colors.mblue(sender),
          event.args[1] === "0x0000000000000000000000000000000000000000" ? colors.blue(recipient) : colors.mblue(recipient),
          event.args[2],
        ]
      }), {
        headlines: ["BLOCK NUMBER", "EVM TRANSACTION HASH", "EVM SENDER", "EVM RECIPIENT", `VALUE (${colors.lwhite("$pedros")})`],
        humanizers: [helpers.commas, , , , helpers.commas],
        colors: [, colors.gray, , , colors.yellow],
      }
    )
  } else {
    console.info(`^ No transfers found ${from ? `from "${from}" ` : ""}${into ? `into "${into}"` : ""}.`)
  }
}

async function unwrappings (flags = {}) {
  let { check, provider, network, from, into, value, since, offset, limit, gasPrice, confirmations } = flags
  let contract = await WrappedWIT.fetchContractFromEthersProvider(provider)
  helpers.traceHeader(network.toUpperCase(), colors.lcyan)

  if (from && !ethers.isAddress(from)) {
    throw new Error("--from must specify some valid <EVM_ADDRESS>.")
  } else if (into) {
    try {
      Witnet.PublicKeyHash.fromBech32(into)
    } catch {
      throw new Error("--into must specify some valid <WIT_ADDRESS>.")
    }
  }

  if (value) {
    value = Witnet.Coins.fromWits(value)
    if (!into) {
      throw new Error("--into <WIT_ADDRESS> must be specified.")
    } else if (!from) {
      from = (await provider.listAccounts())[0].address
    }
    contract = contract.connect(await provider.getSigner(from))
    console.info(colors.lwhite(`> Unwrapping ${ethers.formatUnits(value.pedros, 9)} WIT ...`))
    console.info(`  - EVM sender:       ${from}`)
    console.info(`  - WITNET recipient: ${into}`)
    await contract
      .unwrap
      .send(value.pedros, into, { gasPrice }) // swap method's parameters order
      .then(async (tx) => {
        console.info(`  - Transaction hash: ${tx.hash}`)
        return await helpers.prompter(tx.wait(confirmations || 1))
      })
      .then(receipt => {
        console.info(`  - Transaction cost: ${ethers.formatEther(receipt.gasPrice * receipt.gasUsed)} ETH`)
        console.info(`  - Block number:     ${helpers.commas(receipt.blockNumber)}`)
        console.info(`  - Gas price:        ${helpers.commas(receipt.gasPrice)}`)
        console.info(`  - Gas used:         ${helpers.commas(receipt.gasUsed)}`)
        return receipt
      })
  }

  const fromBlock = since ? BigInt(flags.since) : undefined
  let events = (fromBlock !== undefined && !value
    ? (await contract.queryFilter("Unwrapped", fromBlock)).slice(offset || 0, limit || 64)
    : (await contract.queryFilter("Unwrapped")).reverse().slice(0, limit || 64)
  )
  if (from) events = events.filter(event => event.args[0].toLowerCase().indexOf(from.toLowerCase()) > -1)
  if (into && !value) events = events.filter(event => event.args[1].toLowerCase().indexOf(into.toLowerCase()) > -1)

  if (check) {
    const witnet = await Witnet.JsonRpcProvider.fromEnv(flags?.witnet || (WrappedWIT.isNetworkMainnet(network) ? undefined : "https://rpc-testnet.witnet.io"))
    const records = await helpers.prompter(
      Promise.all(events.map(async event => {
        const ethBlock = await provider.getBlock(event.blockNumber)
        const witUnwrapTx = await WrappedWIT.findUnwrapTransactionFromWitnetProvider(
          witnet,
          network,
          event.blockNumber,
          event.args[3], // nonce
          event.args[0], // from
          event.args[1], // to
          event.args[2] // value
        )
        return [
          { blockNumber: event.blockNumber, hash: event.transactionHash, timestamp: ethBlock.timestamp },
          witUnwrapTx,
          witUnwrapTx ? moment.duration(moment.unix(witUnwrapTx.timestamp).diff(moment.unix(ethBlock.timestamp))).humanize() : "",
        ]
      }))
    )
    helpers.traceTable(
      records.map(([evm, wit, timediff]) => [
        evm.blockNumber,
        evm.hash,
        wit?.hash,
        timediff,
      ]), {
        headlines: [
          "BLOCK NUMBER",
          "EVM UNWRAP TRANSACTION HASH",
          `VALUE TRANSFER TRANSACTION HASH ON ${colors.lwhite(`WITNET ${witnet.network.toUpperCase()}`)}`,
          ":TIME DIFF",
        ],
        humanizers: [helpers.commas, , ,],
        colors: [, colors.gray, colors.magenta],
      }
    )
  } else {
    if (events.length > 0) {
      helpers.traceTable(
        events.map(event => {
          const sender = `${event.args[0].slice(0, 7)}...${event.args[0].slice(-7)}`
          return [
            event.blockNumber,
            event.transactionHash,
            sender,
            event.args[1],
            event.args[2],
          ]
        }), {
          headlines: [
            "BLOCK NUMBER",
            "EVM UNWRAP TRANSACTION HASH",
            "EVM UNWRAPPER",
            `WIT RECIPIENT ON ${colors.lwhite(`WITNET ${WrappedWIT.isNetworkMainnet(network) ? "MAINNET" : "TESTNET"}`)}`,
            `VALUE (${colors.lwhite("$pedros")})`,
          ],
          humanizers: [helpers.commas, , , , helpers.commas],
          colors: [, colors.gray, colors.mblue, colors.mmagenta, colors.yellow],
        }
      )
    } else {
      console.info(`^ No unwrappings found ${from ? `from "${from}" ` : ""}${into ? `into "${into}"` : ""}.`)
    }
  }
  process.exit(0)
}

async function wrappings (flags = {}) {
  let { provider, network, from, into, value, since, offset, limit, gasPrice, confirmations, check } = flags

  let contract = await WrappedWIT.fetchContractFromEthersProvider(provider)
  const witnet = await Witnet.JsonRpcProvider.fromEnv(flags?.witnet || (WrappedWIT.isNetworkMainnet(network) ? undefined : "https://rpc-testnet.witnet.io"))

  helpers.traceHeader(network.toUpperCase(), colors.lcyan)

  if (into && !ethers.isAddress(into)) {
    throw new Error("--into must specify some valid <EVM_ADDRESS>.")
  } else if (from) {
    try {
      Witnet.PublicKeyHash.fromBech32(from)
    } catch {
      throw new Error("--from must specify some valid <WIT_ADDRESS>.")
    }
  }

  let wallet, ledger
  if (value || flags["vtt-hash"]) {
    // create local wallet
    wallet = await Witnet.Wallet.fromEnv({ provider: witnet, strategy: "slim-first", onlyWithFunds: false })

    // select account/signer address from witnet wallet
    ledger = from ? wallet.getAccount(from) : wallet
    if (!ledger) {
      throw new Error("--from <WIT_ADDRESS> not found on wallet.")
    }
  }

  // read Wit/ custodian address from token contract
  const witCustodianWrapper = await contract.witCustodianWrapper()

  if (value && witnet) {
    value = Witnet.Coins.fromWits(value)
    if ((await ledger.getBalance()).unlocked < value.pedros) {
      throw new Error(`Insufficient funds on ${ledger.pkh}`)
    }

    const user = await prompt([{
      message: `Transfer ${value.toString(2)} into custodian address at ${witCustodianWrapper} ?`,
      name: "continue",
      type: "confirm",
      default: false,
    }])

    if (user.continue) {
      // create and send to Witnet a new value transfer transaction with metadata tag
      const VTTs = Witnet.ValueTransfers.from(ledger)
      const metadata = Witnet.PublicKeyHash.fromHexString(into).toBech32(witnet.network)
      let tx = await VTTs.sendTransaction({
        recipients: [
          [witCustodianWrapper, value],
          [metadata, Witnet.Coins.fromPedros(1n)],
        ],
      })
      console.info(`  - From:       ${colors.mmagenta(ledger.pkh)}`)
      console.info(`  - Into:       ${colors.mcyan(witCustodianWrapper)}`)
      console.info(`  - Value:      ${colors.myellow(`${value.wits.toFixed(2)} WIT`)}`)
      console.info(`  - Fees:       ${colors.yellow(tx.fees.toString())}`)
      console.info(`  - VTT hash:   ${colors.lwhite(tx.hash)}`)

      // await inclusion of the VTT in Witnet
      tx = await VTTs.confirmTransaction(tx.hash, {
        confirmations: 0,
        onStatusChange: () => console.info(`  - VTT status: ${tx.status}`),
      })

      console.info(colors.myellow("\n => Please, wait a few minutes until the transaction gets finalized on Witnet,"))
      console.info(colors.myellow("    before querying cross-chain verification.\n"))

      // remove --into filter
      into = undefined
    }
  }

  if (flags["vtt-hash"] && witnet) {
    const vttHash = flags["vtt-hash"].startsWith("0x") ? flags["vtt-hash"].slice(2) : flags["vtt-hash"]
    if (!utils.isHexStringOfLength(vttHash, 32)) {
      throw new Error("--vtt-hash must specify a valid Witnet transaction hash.")
    }

    // check the VTT exists, and fetch transaction etheral report
    const vtt = await witnet.getValueTransfer(vttHash, "ethereal")

    // check if the VTT is a valid transfer to the custodian address:
    if (vtt.recipient !== witCustodianWrapper) {
      throw new Error(`Transaction ${vttHash} transfers no value to custodian address at ${witCustodianWrapper}.`)
    } else if (!vtt.metadata) {
      throw new Error(`Transaction ${vttHash} transfers value to custodian address at ${witCustodianWrapper}, but specifies no EVM recipient.`)
    }

    let proceed, wrapEvent, user

    // check VTT's current wrapping status
    switch (await contract.getWrapTransactionStatus(`0x${vttHash}`)) {
      case 3n: // Done
        proceed = false
        wrapEvent = (await contract.queryFilter("Wrapped")).find(event => event.args[3] === `0x${vttHash.toLowerCase()}`)
        if (wrapEvent) {
          since = wrapEvent.blockNumber; offset = 0; limit = 1
          from = wrapEvent.args[0]; into = wrapEvent.args[1]
          console.info(colors.mgreen(" => This Witnet wrap transaction has already been verified and minted:"))
        }
        break

      case 0n: // Unknown
      case 2n: // Retry
        proceed = true
        break

      case 1n: // Awaiting
        user = await prompt([{
          message: "The specified VTT hash is currently being verified. Shall we retry, anyways ?",
          name: "continue",
          type: "confirm",
          default: false,
        }])
        proceed = user.continue
        break

      default:
        proceed = false
    }

    if (proceed && vtt.finalized !== 1) {
      console.info(colors.mred("\n => Sorry, wait a few minutes until the transaction gets finalized on Witnet,"))
      console.info(colors.mred("      before querying cross-chain verification.\n"))
      proceed = false
    }

    if (proceed) {
      if (!gasPrice) gasPrice = (await provider.getFeeData()).gasPrice
      const fee = await contract.witOracleEstimateWrappingFee(gasPrice)
      const gas = await contract.wrap.estimateGas(`0x${vttHash}`, { value: fee, gasPrice })
      const cost = fee + gasPrice * gas
      user = await prompt([{
        message: `Verification is expected to cost ${ethers.formatEther(cost)} ETH. Shall we proceed ?`,
        name: "continue",
        type: "confirm",
        default: true,
      }])
      if (user.continue) {
        // connect contract to the eth/rpc provider's default signer
        contract = contract.connect(await provider.getSigner())

        console.info(colors.lwhite(`> Wrapping ${ethers.formatUnits(vtt.value, 9)} WIT ...`))
        console.info(`  - WITNET sender:  ${vtt.sender}`)
        console.info(`  - EVM recipient:  ${ethers.getAddress(`0x${vtt.metadata}`)}`)
        console.info(`  - EVM signer:     ${(await provider.getSigner()).address}`)
        console.info(`  - Wit/Oracle fee: ${ethers.formatEther(fee)} ETH`)

        await contract
          .wrap
          .send(`0x${vttHash}`, { value: fee, gasPrice })
          .then(async (tx) => {
            console.info(`  - EVM tx hash:    ${tx.hash}`)
            return await helpers.prompter(tx.wait(confirmations || 1))
          })
          .then(receipt => {
            console.info(`  - EVM tx cost:    ${ethers.formatEther(fee + receipt.gasPrice * receipt.gasUsed)} ETH`)
            console.info(`  - Gas price:      ${helpers.commas(receipt.gasPrice)}`)
            console.info(`  - Gas used:       ${helpers.commas(receipt.gasUsed)}`)
            console.info(`  - Block number:   ${helpers.commas(receipt.blockNumber)}`)
            return receipt
          })
        // settle --from filter
        from = vtt.sender
        // delete --into filter
        into = undefined
      }
    }
  }

  const fromBlock = since ? BigInt(since) : undefined

  let events = []

  events.push(...(fromBlock !== undefined && !value
    ? (await contract.queryFilter("Wrapped", fromBlock)).slice(offset || 0, limit || 64)
    : (await contract.queryFilter("Wrapped")).reverse().slice(0, limit || 64)
  ))

  if (from) events = events.filter(event => event.args[0].toLowerCase().indexOf(from.toLowerCase()) > -1)
  if (into) events = events.filter(event => event.args[1].toLowerCase().indexOf(into.toLowerCase()) > -1)

  // insert pending to-be-validated wrap transactions, only if --from or --into are specified:
  {
    const utxos = await witnet.getUtxos(witCustodianWrapper)
    const hashes = [...new Set(utxos.map(utxo => utxo.output_pointer.split(":")[0]))]
    for (let index = 0; index < hashes.length; index++) {
      const vtt = await witnet.getValueTransfer(hashes[index], "ethereal")
      if (!events.find(event => event.args[3] === `0x${hashes[index]}`)) {
        if (vtt?.metadata && (!from || from.toLowerCase() === vtt.sender) && (!into || into.toLowerCase() === `0x${vtt.metadata}`)) {
          let status = ""
          switch ((await contract.getWrapTransactionStatus(`0x${hashes[index]}`))) {
            case 0n:
              status = (vtt.finalized === 1) ? "(finalized on Witnet)" : "(awaiting finalization on Witnet)"
              break
            case 1n:
              status = "(awaiting cross-chain verification)"
              break
            case 2n:
              status = "(cross-chain verification failed)"
              break
          }
          events.push({
            blockNumber: undefined,
            transactionHash: status,
            args: [vtt.sender, ethers.getAddress(`0x${vtt.metadata}`), vtt.value, `0x${hashes[index]}`],
          })
        }
      }
    }
  }

  if (check) {
    const records = []
    records.push(...await helpers.prompter(
      Promise.all(events.map(async event => {
        const ethBlock = event.blockNumber ? await provider.getBlock(event.blockNumber) : undefined
        const ethTxHash = event.transactionHash
        const witTxHash = event.args[3]
        const witTx = await witnet.getValueTransfer(witTxHash.slice(2), "ethereal")
        return [
          { hash: witTxHash.slice(2), timestamp: witTx.timestamp },
          { blockNumber: event?.blockNumber, hash: ethTxHash, timestamp: ethBlock?.timestamp },
          ethBlock
            ? moment.duration(moment.unix(ethBlock.timestamp).diff(moment.unix(witTx.timestamp))).humanize()
            : moment.unix(witTx.timestamp).fromNow(),
        ]
      }))
    ))
    if (records.length > 0) {
      helpers.traceTable(
        records.map(([wit, evm, timediff]) => {
          return [
            evm?.blockNumber ? helpers.commas(evm.blockNumber) : "",
            wit.hash,
            evm.hash.startsWith("0x") ? colors.gray(evm.hash) : colors.red(evm.hash),
            timediff,
          ]
        }), {
          headlines: [
            "BLOCK NUMBER",
            `VALUE TRANSFER TRANSACTION HASH ON ${colors.lwhite(`WITNET ${witnet.network.toUpperCase()}`)}`,
            "ERC-20 WRAP VALIDATING TRANSACTION HASH",
            ":TIME DIFF",
          ],
          colors: [, colors.magenta],
        }
      )
    } else {
      console.info(`^ No verified wrappings found so far ${from ? `from "${from}" ` : ""}${into ? `into "${into}"` : ""}.`)
    }
  } else {
    const records = events.map(event => ({
      blockNumber: event.blockNumber,
      sender: event.args[0],
      transactionHash: event.transactionHash,
      recipient: `${event.args[1].slice(0, 7)}...${event.args[1].slice(-7)}`,
      value: event.args[2],
    }))
    if (records.length > 0) {
      helpers.traceTable(
        records.map(record => {
          return [
            record?.blockNumber ? helpers.commas(record.blockNumber) : "",
            record.sender,
            record.transactionHash.startsWith("0x") ? colors.gray(record.transactionHash) : colors.red(record.transactionHash),
            record.recipient,
            record.value,
          ]
        }), {
          headlines: [
            "BLOCK NUMBER",
            `WIT SENDER ON ${colors.lwhite(`WITNET ${WrappedWIT.isNetworkMainnet(network) ? "MAINNET" : "TESTNET"}`)}`,
            "ERC-20 WRAP VALIDATING TRANSACTION HASH",
            "EVM RECIPIENT",
            `VALUE (${colors.lwhite("$pedros")})`,
          ],
          humanizers: [, , , , helpers.commas],
          colors: [, colors.mmagenta, , colors.mblue, colors.yellow],
        }
      )
    } else {
      console.info(`^ No verified wrappings found so far ${from ? `from "${from}" ` : ""}${into ? `into "${into}"` : ""}.`)
    }
  }
  process.exit(0)
}
