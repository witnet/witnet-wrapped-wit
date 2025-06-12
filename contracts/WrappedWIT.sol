// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

import "witnet-solidity-bridge/contracts/WitOracle.sol";

import {
    IWitOracleRadonRequestModal,
    IWitOracleRadonRequestTemplate,
    IWitOracleRadonRequestFactory
} from "witnet-solidity-bridge/contracts/WitOracleRadonRequestFactory.sol";

import {IWitOracleConsumer} from "witnet-solidity-bridge/contracts/interfaces/IWitOracleConsumer.sol";
import {IWitOracleQueriableConsumer} from "witnet-solidity-bridge/contracts/interfaces/IWitOracleQueriableConsumer.sol";

/// @custom:security-contact info@witnet.foundation
contract WrappedWIT
    is 
        ERC20,
        // ERC20Burnable, 
        ERC20Permit,
        IWitOracleConsumer,
        IWitOracleQueriableConsumer
{
    using Witnet for Witnet.Address;
    using Witnet for Witnet.DataResult;
    using Witnet for Witnet.RadonHash;
    using Witnet for Witnet.Timestamp;
    using WitnetCBOR for WitnetCBOR.CBOR;

    event AuthorityTransferred  (address from, address to);
    event Unwrapped (address indexed from, string  indexed into, uint256 value, uint256 timestamp);
    event Wrapped   (string  indexed from, address indexed into, uint256 value, Witnet.TransactionHash witWrapTxHash);    
    
    // event CuratorshipTransferred(address from, address to);
    // event WitAddressOwnership   (address indexed evmAddress, string indexed witAddress);

    uint24  internal constant _WIT_BURNING_MAX_TIMEOUT = 7 days;
    uint56  internal constant _WIT_BURNING_MIN_MIN_WITS = 10000;
    uint16  internal constant _WIT_ORACLE_REPORTS_MIN_MIN_WITNESSES = 3;
    uint24  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_GAS_LIMIT = 1000000; // EVM gas units
    uint256 internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED = type(uint256).max;
    uint16  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_BASE_FEE_OVERHEAD = 50;
    uint16  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_RESULT_SIZE = 64;
    uint64  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_MIN_UNITARY_REWARD = 200_000_000; // 0.2 $WIT

    struct EvmSettings {
        uint56 burningMinNanowits;
        uint24 burningProofTimeout;
        uint16 witOracleMinWitnesses;
        uint16 witOracleQueriesBaseFeeOverhead;
        uint64 witOracleQueriesUnitaryReward;
    }

    struct WitBalance {
        uint64 witLocked;
        uint64 witStaked;
        uint64 witUnlocked;
        Witnet.Timestamp witTimestamp;
    }

    // struct WitBurnRequest {
    //     uint56 nanowits;
    //     uint40 evmDeadline;
    //     Witnet.Address witAddress;
    //     bytes32 witUnwrapTxHash;
    // }
    
    address public evmAuthority;
    // address public evmCurator;
    EvmSettings public evmSettings;
    
    WitBalance  public witCustodianBalance;
    
    WitOracle public immutable witOracle;
    IWitOracleRadonRequestModal public immutable witOracleCrossChainProofOfReserve;
    IWitOracleRadonRequestModal public immutable witOracleCrossChainProofOfInclusion;
    
    string[] public witOracleCrossChainRpcProviders;
    Witnet.RadonHash public witOracleProofOfReserveRadonHash;
    
    Witnet.Address internal immutable __witCustodian;
    
    // mapping (Witnet.Address => address) internal __evmAddressOf;
    // mapping (address => Witnet.Address) internal __witAddressOf;
    // mapping (address => WitBurnRequest[]) internal __witBurnsFrom;

    mapping (Witnet.TransactionHash => uint256) internal __witOracleWrappingTxQueryId;
    mapping (uint256 => Witnet.TransactionHash) internal __witOracleWrappingQueryTxHash;
    // mapping (Witnet.TransactionHash => uint256) internal __witOracleWrapTxQueryId;
    // mapping (uint256 => WrapTxQueryInfo) internal __witOracleWrapTxQueryInfo;
    
    struct WrapTxQueryInfo {
        address evmAccount;
        Witnet.Address witWrapper;
        Witnet.TransactionHash witWrapTxHash;
    }

    modifier checkUnwrapValue(uint256 value) {
        _require(
            value >= evmSettings.burningMinNanowits
                && value < type(uint56).max
                && value <= witCustodianBalance.witUnlocked,
            "cannot unwrap that much"
        ); _;
    }

    modifier onlyAuthority {
        _require(
            _msgSender() == evmAuthority, 
            "unauthorized"
        ); _;
    }

    // modifier onlyCurator {
    //     _require(
    //         _msgSender() == evmCurator,
    //         "only curator"
    //     ); _;
    // }

    constructor(
            address _evmAuthority,
            // address _evmCurator,
            Witnet.Address _witCustodian,
            IWitOracleRadonRequestFactory _witOracleRadonRequestFactory
        )
        ERC20("Wrapped WIT", "WIT")
        ERC20Permit("Wrapped/WIT")
    {
        // Validate constructor parameters:
        _require(
            _evmAuthority != address(0) && (
                block.chainid != 1 || _evmAuthority.code.length > 0
            ),
            "invalid EVM authority"
        );
        // _require(
        //     _evmCurator != address(0) && _evmCurator.code.length == 0,
        //     "invalid EVM curator"
        // );
        _require(
            !_witCustodian.isZero(), 
            "invalid WIT custodian"
        );

        // Settle immutable parameters:
        witOracle = WitOracle(IWitOracleAppliance(address(_witOracleRadonRequestFactory)).witOracle());
        string[2][] memory _httpRequestHeaders = new string[2][](1);
        _httpRequestHeaders[0] = [ "Content-Type", "application/json;charset=UTF-8" ];
        witOracleCrossChainProofOfReserve = _witOracleRadonRequestFactory.buildRadonRequestModal(
            IWitOracleRadonRequestFactory.DataSourceRequest({
                method: Witnet.RadonRetrievalMethods.HttpPost,
                body: '{"jsonrpc":"2.0","method":"getBalance2","params":{"pkh":"\\1\\"},"id":1}',
                headers: _httpRequestHeaders,
                script: hex"83187782186666726573756c741869" 
                    // RadonScript(Radon.String)
                    //   .parseJSONMap()
                    //   .getMap("result")
                    //   .values()
            }),
            Witnet.RadonReducer({
                opcode: Witnet.RadonReduceOpcodes.Mode,
                filters: new Witnet.RadonFilter[](0)
            })
        );
        witOracleCrossChainProofOfInclusion = _witOracleRadonRequestFactory.buildRadonRequestModal(
            IWitOracleRadonRequestFactory.DataSourceRequest({
                method: Witnet.RadonRetrievalMethods.HttpPost,
                body: '{"jsonrpc":"2.0","method":"getValueTransfer","params":{"hash":"\\1\\","mode":"simple"},"id":1}',
                headers: _httpRequestHeaders,            
                script: hex"84187782186666726573756c748218666653696d706c651869" 
                    // RadonScript(Radon.String)
                    //   .parseJSONMap()
                    //   .getMap("result")
                    //   .getMap("Simple")
                    //   .values()
            }),
            Witnet.RadonReducer({
                opcode: Witnet.RadonReduceOpcodes.Mode,
                filters: new Witnet.RadonFilter[](0)
            })
        );
        __witCustodian = _witCustodian;
        
        // Initialize authoritative parameters:
        // transferCuratorship(_evmCurator);
        evmAuthority = _evmAuthority;
        evmSettings = EvmSettings({
            burningMinNanowits: uint56(_WIT_BURNING_MIN_MIN_WITS * 10 ** decimals()),
            burningProofTimeout: _WIT_BURNING_MAX_TIMEOUT,
            witOracleMinWitnesses: block.chainid == 1 ? 12 : _WIT_ORACLE_REPORTS_MIN_MIN_WITNESSES,
            witOracleQueriesBaseFeeOverhead: _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_BASE_FEE_OVERHEAD / 5, 
            witOracleQueriesUnitaryReward: _WIT_ORACLE_QUERIABLE_CONSUMER_MIN_UNITARY_REWARD
        });
        string[] memory _witOracleRpcProviders = new string[](1);
        _witOracleRpcProviders[0] = (
            block.chainid == 1 
                ? "https://rpc-01.witnet.io" 
                : "https://rpc-testnet.witnet.io"
        );
        witOracleCrossChainRpcProviders = _witOracleRpcProviders;

        // Formally verify parameterized Radon assets:
        __formallyVerifyRadonAssets(_witOracleRpcProviders);
    }

 
    /// ===============================================================================================================
    /// --- ERC20 -----------------------------------------------------------------------------------------------------

    function decimals() override public pure returns (uint8) {
        return 9;
    }


    /// ===============================================================================================================
    /// --- Wrapped/WIT read-only methods -----------------------------------------------------------------------------

    function burnableSupply() external view returns (uint256) {
        return witCustodianBalance.witUnlocked;
    }

    function totalReserve() external view returns (uint256) {
        return (
            witCustodianBalance.witUnlocked
                + witCustodianBalance.witStaked
                + witCustodianBalance.witLocked
        );
    }

    function witCustodian() public view returns (string memory) {
        return __witCustodian.toBech32(block.chainid == 1);
    }

    function witOracleEstimateWrappingFee(uint256 _evmGasPrice) external view returns (uint256) {
        return (
            (100 + evmSettings.witOracleQueriesBaseFeeOverhead)
                * witOracle.estimateBaseFeeWithCallback(
                    _evmGasPrice, 
                    _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_GAS_LIMIT
                )
        ) / 100;
    }

    function witOracleProofOfReserveRadonBytecode() external view returns (bytes memory) {
        return witOracle.registry().lookupRadonRequestBytecode(witOracleProofOfReserveRadonHash);
    }


    /// ===============================================================================================================
    /// --- Wrapped/WIT authoritative methods -------------------------------------------------------------------------

    // function settleEvmCurator(address _curator)
    //     external
    //     onlyAuthority
    // {
    //     assert(_curator != address(0));
    //     evmCurator = _curator;
    // }

    function settleEvmSettings(EvmSettings calldata _settings)
        external
        onlyAuthority
    {
        assert(
            _settings.burningMinNanowits >= _WIT_BURNING_MIN_MIN_WITS * 10 ** decimals()
                && _settings.burningProofTimeout <= _WIT_BURNING_MAX_TIMEOUT
                && _settings.witOracleMinWitnesses >= _WIT_ORACLE_REPORTS_MIN_MIN_WITNESSES
                && _settings.witOracleQueriesBaseFeeOverhead <= _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_BASE_FEE_OVERHEAD
                && _settings.witOracleQueriesUnitaryReward >= _WIT_ORACLE_QUERIABLE_CONSUMER_MIN_UNITARY_REWARD
        );
        evmSettings = _settings;
    }

    function settleWitRpcProviders(string[] memory _witRpcProviders)
        external
        onlyAuthority
    {
        assert(_witRpcProviders.length > 0);
        __formallyVerifyRadonAssets(_witRpcProviders);
        witOracleCrossChainRpcProviders = _witRpcProviders;
    }

    function transferAuthority(address _newAuthority)
        external 
        onlyAuthority
    {
        assert(
            _newAuthority != address(0)
                && _newAuthority != evmAuthority
                && (block.chainid != 1 || _newAuthority.code.length > 0)
        );
        emit AuthorityTransferred(evmAuthority, _newAuthority);
        evmAuthority = _newAuthority;
    }

    // function transferCuratorship(address _newCurator)
    //     public
    //     onlyCurator
    // {
    //     assert(_newCurator != address(0));
    //     emit CuratorshipTransferred(evmCurator, _newCurator);
    //     evmCurator = _newCurator;
    // }

    // function verifyBurnTransaction(
    //         address evmHolder, 
    //         uint256 requestIndex, 
    //         bytes32 witUnwrapTxHash
    //     )
    //     external
    //     onlyCurator
    // {
    //     WitBurnRequest storage __request = __witBurnsFrom[evmHolder][requestIndex];
    //     _require(
    //         __request.nanowits > 0  && __request.witUnwrapTxHash == bytes32(0), 
    //         "invalid burn request"
    //     );
    //     emit Unwrapped(
    //         evmHolder,
    //         __request.witAddress.toBech32(block.chainid == 1),
    //         __request.nanowits, 
    //         requestIndex, 
    //         witUnwrapTxHash
    //     );
    //     __request.nanowits = 0;
    //     __request.witUnwrapTxHash = witUnwrapTxHash;
    // }

    
    /// ===============================================================================================================
    /// --- Wrapped/WIT permissionless wrap/unwrap operations ---------------------------------------------------------

    function unwrap(uint256 value, string calldata witAddrBech32)
        virtual external
        checkUnwrapValue(value)
    {
        // validate correctness of wit address bech32 string
        Witnet.fromBech32(witAddrBech32, block.chainid == 1);
        // burn wrapped wit tokens
        _burn(_msgSender(), value);
        // emit events
        emit Transfer(_msgSender(), address(0), value);
        emit Unwrapped(_msgSender(), witAddrBech32, value, block.timestamp);
    }

    function wrap(Witnet.TransactionHash witWrapTxHash)
        virtual public payable
        returns (uint256 _witQueryId)
    {
        _witQueryId = __witOracleWrappingTxQueryId[witWrapTxHash];
        Witnet.QueryStatus _queryStatus = (
            _witQueryId > 0 ? (
                _witQueryId != _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED 
                    ? witOracle.getQueryStatus(_witQueryId) 
                    : Witnet.QueryStatus.Finalized 
            ) : Witnet.QueryStatus.Unknown
        );
        if (
            _witQueryId == 0
                || (
                    _witQueryId != _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED
                        && _queryStatus != Witnet.QueryStatus.Posted
                )
        ) {
            string[] memory _commonArgs = new string[](1);
            _commonArgs[0] = Witnet.toString(Witnet.TransactionHash.unwrap(witWrapTxHash));
            Witnet.RadonHash _radonHash = witOracleCrossChainProofOfInclusion
                .verifyRadonRequest(
                    _commonArgs,
                    witOracleCrossChainRpcProviders
                );
            _witQueryId = IWitOracleQueriable(witOracle).queryDataWithCallback{
                value: msg.value
            }(
                _radonHash,
                Witnet.QuerySLA({
                    witCommitteeSize: evmSettings.witOracleMinWitnesses,
                    witInclusionFees: evmSettings.witOracleQueriesUnitaryReward,
                    witResultMaxSize: _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_RESULT_SIZE
                }),
                Witnet.QueryCallback({
                    consumer: address(this),
                    gasLimit: _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_GAS_LIMIT
                })
            );
            __witOracleWrappingTxQueryId[witWrapTxHash] = _witQueryId;
            __witOracleWrappingQueryTxHash[_witQueryId] = witWrapTxHash;
        }
    }


    /// ===============================================================================================================
    /// --- Implementation of IWitOracleQueriableConsumer -------------------------------------------------------------

    /// @notice Determines if Wit/Oracle query results can be reported from the given address.
    function reportableFrom(address _from) override public view returns (bool) {
        return address(_from) == address(witOracle);
    }

    /// @notice Method called from the WitOracle as soon as the specified `queryId` gets reported from the Witnet blockchain.
    /// @param queryId The unique identifier of the Witnet query being reported.
    /// @param queryResult Abi-encoded Witnet.DataResult containing the CBOR-encoded query's result, and metadata.
    function reportWitOracleQueryResult(
            uint256 queryId,
            bytes calldata queryResult
        ) 
        override external 
    {
        _require(reportableFrom(_msgSender()), "invalid oracle");

        Witnet.TransactionHash _witWrapTxHash = __witOracleWrappingQueryTxHash[queryId];
        _require(Witnet.TransactionHash.unwrap(_witWrapTxHash) != bytes32(0), "invalid query");
        _require(
            __witOracleWrappingTxQueryId[_witWrapTxHash] != _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED, 
            "already processed"
        );
        
        // Parse and validate query result:
        Witnet.DataResult memory _witnetResult = abi.decode(queryResult, (Witnet.DataResult));
        WitnetCBOR.CBOR[] memory _fields = _witnetResult.fetchCborArray();
            // [
            //      evmAccount: string
            //      finalized: uint8,
            //      witRecipient: string,
            //      witSender: string,
            //      value: uint64,
            // ]
        
        Witnet.Address _witCustodian = Witnet.fromBech32(_fields[2].readString(), block.chainid == 1);
        _require(_witCustodian.eq(__witCustodian), "invalid custodian");

        uint64 _finalized = _fields[1].readUint();
        _require(_finalized > 0, "unconfirmed transaction");
            
        address _account = Witnet.toAddress(
            Witnet.parseHexString(
                _fields[0].readString()
            )
        );
        uint64 _value = _fields[2].readUint();
        string memory _witWrapperBech32 = _fields[3].readString();

        // Mark wrap tx hash as already processed:
        __witOracleWrappingTxQueryId[_witWrapTxHash] = _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED;        
        
        // Mint wrapped tokens:
        _mint(_account, _value);
        emit Transfer(address(0), _account, _value);
        emit Wrapped(_witWrapperBech32, _account, _value, _witWrapTxHash);
    }


    /// ===============================================================================================================
    /// --- Implementation of IWitOracleConsumer ----------------------------------------------------------------------

    /// @notice Process canonical Proof-of-Reserve reports from the Wit/Oracle blockchain, permissionlessly.    
    function pushDataReport(
            Witnet.DataPushReport calldata report, 
            bytes calldata proof
        )
        override external
    {
        _require(
            report.witDrSLA.witCommitteeSize >= evmSettings.witOracleMinWitnesses,
            "insufficient witnesses"
        );
        _require(
            report.witRadonHash.eq(witOracleProofOfReserveRadonHash),
            "invalid proof-of-reserve format"
        );
        Witnet.DataResult memory _witDataResult = witOracle.pushDataReport(
            report,
            proof
        );
        uint64[] memory _witBalance;
        if (_witDataResult.status == Witnet.ResultStatus.NoErrors) {
            _witBalance = _witDataResult.fetchUint64Array();
        }
        _require(
            _witDataResult.status == Witnet.ResultStatus.NoErrors
                && _witDataResult.timestamp.gt(witCustodianBalance.witTimestamp)
                && _witBalance.length == 3,
            "invalid proof-of-reserve data"
        );
        // Update Wit/Custodian balance:
        witCustodianBalance.witLocked = _witBalance[0] + _witBalance[1];
        witCustodianBalance.witUnlocked = _witBalance[2];
        witCustodianBalance.witTimestamp = _witDataResult.timestamp;
    }


    /// ===============================================================================================================
    /// --- Internal methods ------------------------------------------------------------------------------------------

    function __formallyVerifyRadonAssets(string[] memory _witRpcProviders) internal {
        // Formally verify cross-chain Radon request for notarizing custodian's proofs of reserve:
        string[] memory _commonArgs = new string[](1);
        _commonArgs[0] = witCustodian();
        witOracleProofOfReserveRadonHash = witOracleCrossChainProofOfReserve
            .verifyRadonRequest(
                _commonArgs,
                _witRpcProviders
            );
    }

    function _require(bool condition, string memory reason) internal pure {
        require(
            condition,
            string(abi.encodePacked(
                "WrappedWIT: ",
                reason
            ))
        );
    }
}
