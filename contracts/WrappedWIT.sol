// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Bridgeable} from "@openzeppelin/community-contracts/contracts/token/ERC20/extensions/ERC20Bridgeable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "witnet-solidity-bridge/contracts/WitOracle.sol";

import {
    IWitOracleRadonRequestModal,
    IWitOracleRadonRequestTemplate,
    IWitOracleRadonRequestFactory
} from "witnet-solidity-bridge/contracts/WitOracleRadonRequestFactory.sol";

import {IWitOracleConsumer} from "witnet-solidity-bridge/contracts/interfaces/IWitOracleConsumer.sol";
import {IWitOracleQueriableConsumer} from "witnet-solidity-bridge/contracts/interfaces/IWitOracleQueriableConsumer.sol";

import {IWrappedWIT, WrappedWITLib} from "./WrappedWITLib.sol";

/// @custom:security-contact info@witnet.foundation
contract WrappedWIT
    is 
        ERC20,
        ERC20Bridgeable,
        ERC20Permit,
        Initializable,
        IWitOracleConsumer,
        IWitOracleQueriableConsumer,
        IWrappedWIT
{
    using Witnet for Witnet.Address;
    using Witnet for Witnet.RadonHash;

    uint256 internal constant _CANONICAL_CHAIN_ID = 1; // Ethereum Mainnet
    uint8   internal constant _DECIMALS = 9;
    address internal constant _SUPERCHAIN_TOKEN_BRIDGE = 0x4200000000000000000000000000000000000028; // Superchain bridge
    
    uint16  internal constant _WIT_ORACLE_REPORTS_MIN_MIN_WITNESSES = 3;
    uint16  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_BASE_FEE_OVERHEAD = 50;
    uint64  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_MIN_UNITARY_REWARD = 200_000_000; // 0.2 $WIT
    
    WitOracle public immutable witOracle;
    IWitOracleRadonRequestModal public immutable witOracleCrossChainProofOfReserveTemplate;
    IWitOracleRadonRequestModal public immutable witOracleCrossChainProofOfInclusionTemplate;
    
    Witnet.Address internal immutable __witCustodian;
    bytes32 internal immutable __witCustodianBech32Hash;

    modifier onlyCurator {
        require(
            _msgSender() == __storage().evmCurator, 
            Unauthorized()
        ); _;
    }

    constructor(
            IWitOracleRadonRequestFactory _witOracleRadonRequestFactory,
            string memory _witCustodianBech32
        )
        ERC20("Wrapped WIT", "WIT")
        ERC20Permit("Wrapped/WIT")
    {
        // Settle immutable parameters --------------------------------------------------------------------------------
        __witCustodian = Witnet.fromBech32(_witCustodianBech32, block.chainid == _CANONICAL_CHAIN_ID);
        __witCustodianBech32Hash = keccak256(bytes(_witCustodianBech32));

        string[2][] memory _httpRequestHeaders = new string[2][](1);
        _httpRequestHeaders[0] = [ "Content-Type", "application/json;charset=UTF-8" ];
        witOracleCrossChainProofOfReserveTemplate = _witOracleRadonRequestFactory.buildRadonRequestModal(
            IWitOracleRadonRequestFactory.DataSourceRequest({
                method: Witnet.RadonRetrievalMethods.HttpPost,
                body: '{"jsonrpc":"2.0","method":"getBalance2","params":{"pkh":"\\1\\;\\2\\"},"id":1}',
                headers: _httpRequestHeaders,
                script: // [RadonString] parseJSONMap()
                        // [RadonMap]    getMap("result")
                        // [RadonArray]  values()
                        hex"83187782186666726573756c741869" 
            }),
            Witnet.RadonReducer({
                opcode: Witnet.RadonReduceOpcodes.Mode,
                filters: new Witnet.RadonFilter[](0)
            })
        );
        witOracleCrossChainProofOfInclusionTemplate = _witOracleRadonRequestFactory.buildRadonRequestModal(
            IWitOracleRadonRequestFactory.DataSourceRequest({
                method: Witnet.RadonRetrievalMethods.HttpPost,
                body: '{"jsonrpc":"2.0","method":"getValueTransfer","params":{"hash":"\\1\\","mode":"ethereal","force":true},"id":1}',
                headers: _httpRequestHeaders,         
                script: // [RadonString] parseJSONMap()
                        // [RadonMap]    getMap("result")
                        // [RadonArray]  values()
                        hex"83187782186666726573756c741869"
            }),
            Witnet.RadonReducer({
                opcode: Witnet.RadonReduceOpcodes.Mode,
                filters: new Witnet.RadonFilter[](0)
            })
        );

        witOracle = WitOracle(IWitOracleAppliance(address(_witOracleRadonRequestFactory)).witOracle());
    }

    function initialize(
            address _evmCurator,
            string calldata _witUnwrapperBech32
        ) 
        external 
        initializer
    {
        // Initialize authority --------
        __storage().evmCurator = _evmCurator;
        emit CuratorshipTransferred(address(0), _evmCurator);
        
        // Initialize authoritative parameters -------------------------------------------------------------
        __storage().witOracleQuerySettings = WitOracleSettings({
            minWitnesses: block.chainid == _CANONICAL_CHAIN_ID ? 12 : _WIT_ORACLE_REPORTS_MIN_MIN_WITNESSES,
            baseFeeOverhead100: _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_BASE_FEE_OVERHEAD / 5, 
            unitaryRewardNanowits: _WIT_ORACLE_QUERIABLE_CONSUMER_MIN_UNITARY_REWARD
        });
        string[] memory _witOracleRpcProviders = new string[](1);
        _witOracleRpcProviders[0] = (
            block.chainid == _CANONICAL_CHAIN_ID 
                ? "https://rpc-01.witnet.io" 
                : "https://rpc-testnet.witnet.io"
        );
        __storage().witOracleCrossChainRpcProviders = _witOracleRpcProviders;

        // Settle Wit/ Unwrapper address and formally verify parameterized Radon assets:
        __settleWitUnwrapper(_witUnwrapperBech32);
    }

 
    /// ===============================================================================================================
    /// --- ERC20 -----------------------------------------------------------------------------------------------------

    function decimals() override public pure returns (uint8) {
        return _DECIMALS;
    }


    /// ===============================================================================================================
    /// --- ERC20Bridgeable -------------------------------------------------------------------------------------------

    function _checkTokenBridge(address caller) override internal pure {
        if (caller != _SUPERCHAIN_TOKEN_BRIDGE) revert Unauthorized();
    }


    /// ===============================================================================================================
    /// --- Wrapped/WIT read-only methods -----------------------------------------------------------------------------
    
    function evmCurator() override external view returns (address) {
        return __storage().evmCurator;
    }

    function getWrapTransactionLastQueryId(Witnet.TransactionHash _witnetValueTransferTransactionHash)
        override external view 
        returns (uint256)
    {
        return __storage().witOracleWrappingTransactionLastQueryId[_witnetValueTransferTransactionHash];
    }

    function getWrapTransactionStatus(Witnet.TransactionHash _witnetValueTransferTransactionHash) 
        override external view 
        returns (WrappingStatus)
    {
        uint256 _witOracleLastQueryId = __storage().witOracleWrappingTransactionLastQueryId[
            _witnetValueTransferTransactionHash
        ];
        if (_witOracleLastQueryId == 0) {
            return WrappingStatus.Unknown;
        
        } else if (_witOracleLastQueryId == WrappedWITLib._WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED) {
            return WrappingStatus.Done;
        
        } else {
            return (
                witOracle.getQueryStatus(_witOracleLastQueryId) == Witnet.QueryStatus.Posted
                ? WrappingStatus.Awaiting
                : WrappingStatus.Retry
            );
        }
    }

    function totalReserve() override external view returns (uint256) {
        return __storage().evmLastReserveNanowits;
    }

    function totalUnwraps() override external view returns (uint256) {
        return __storage().evmUnwraps;
    }

    function witCustodian() override public view returns (string memory) {
        return __witCustodian.toBech32(block.chainid == _CANONICAL_CHAIN_ID);
    }

    function witUnwrapper() override public view returns (string memory) {
        return __storage().witUnwrapper.toBech32(block.chainid == _CANONICAL_CHAIN_ID);
    }

    function witOracleEstimateWrappingFee(uint256 evmGasPrice) override external view returns (uint256) {
        return WrappedWITLib.witOracleEstimateWrappingFee(
            witOracle, 
            evmGasPrice
        );
    }

    function witOracleProofOfReserveRadonBytecode() override external view returns (bytes memory) {
        return witOracle
            .registry()
            .lookupRadonRequestBytecode(
                __storage().witOracleProofOfReserveRadonHash
            );
    }

    function witOracleQuerySettings() override external view returns (WitOracleSettings memory) {
        return __storage().witOracleQuerySettings;
    }


    /// ===============================================================================================================
    /// --- Wrapped/WIT authoritative methods -------------------------------------------------------------------------

    function settleWitOracleSettings(WitOracleSettings calldata _settings)
        external
        onlyCurator
    {
        assert(
            _settings.minWitnesses >= _WIT_ORACLE_REPORTS_MIN_MIN_WITNESSES
                && _settings.baseFeeOverhead100 <= _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_BASE_FEE_OVERHEAD
                && _settings.unitaryRewardNanowits >= _WIT_ORACLE_QUERIABLE_CONSUMER_MIN_UNITARY_REWARD
        );
        __storage().witOracleQuerySettings = _settings;
    }

    function settleWitRpcProviders(string[] memory _witRpcProviders)
        external
        onlyCurator
    {
        assert(_witRpcProviders.length > 0);
        __storage().witOracleCrossChainRpcProviders = _witRpcProviders;
        __formallyVerifyRadonAssets(
            _witRpcProviders, 
            __storage().witUnwrapper.toBech32(block.chainid == _CANONICAL_CHAIN_ID)
        );
    }

    function settleWitUnwrapper(string calldata _witUnwrapperBech32)
        external
        onlyCurator
    {
        __settleWitUnwrapper(_witUnwrapperBech32);
    }

    function transferCuratorship(address _newCurator)
        external 
        onlyCurator
    {
        assert(_newCurator != address(0));
        emit CuratorshipTransferred(__storage().evmCurator, _newCurator);
        __storage().evmCurator = _newCurator;
    }

    
    /// ===============================================================================================================
    /// --- Wrapped/WIT permissionless wrap/unwrap operations ---------------------------------------------------------

    function wrap(Witnet.TransactionHash _witnetValueTransferTransactionHash)
        override public payable
        returns (uint256 _witOracleQueryId)
    {
        _witOracleQueryId = WrappedWITLib.witOracleQueryWitnetValueTransferProofOfInclusion(
            witOracle,
            witOracleCrossChainProofOfInclusionTemplate,
            _witnetValueTransferTransactionHash
        );
        require(
            _witOracleQueryId != WrappedWITLib._WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED, 
            "already minted"
        );
    }

    function unwrap(uint64 value, string calldata witRecipientBech32)
        override external
        returns (uint256 evmUnwrapId)
    {
        require(
            balanceOf(_msgSender()) >= value,
            "not enough balance"
        );
        uint64 _evmLastReserveNanowits = __storage().evmLastReserveNanowits;
         require(
            value <= _evmLastReserveNanowits,
            "cannot unwrap that much"
        );
        Witnet.Address _recipient = Witnet.fromBech32(
            witRecipientBech32, 
            block.chainid == _CANONICAL_CHAIN_ID
        );
        require(
            !_recipient.eq(__witCustodian),
            "invalid recipient"
        );

        // immediate reduction of reserve supply:
        __storage().evmLastReserveNanowits = _evmLastReserveNanowits - value;

        // immediate burning of wrapped wit tokens:
        _burn(_msgSender(), value);

        // increment unwrap id:
        evmUnwrapId = ++ __storage().evmUnwraps;

        // emit events
        emit Unwrapped(
            _msgSender(), 
            witRecipientBech32, 
            value, 
            evmUnwrapId
        );
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
        _require(reportableFrom(msg.sender), "invalid oracle");

        try WrappedWITLib.processWitOracleQueryResult(
            queryId, 
            queryResult
        
        ) returns (
            Witnet.TransactionHash _witValueTransferTransactionHash,
            string memory _witRecipientBech32,
            string memory _witWrapperBech32,
            address _evmRecipient,
            uint64 _value
        ) {
            _require(
                keccak256(bytes(_witRecipientBech32)) == __witCustodianBech32Hash,
                "invalid custodian"
            );

            // mint newly wrapped tokens:
            _mint(_evmRecipient, _value);

            // emit events:
            emit Wrapped(
                _witWrapperBech32, 
                _evmRecipient, 
                _value, 
                _witValueTransferTransactionHash
            );

        } catch Error(string memory _reason) {
            _revert(_reason);
        
        } catch (bytes memory) {
            _revertUnhandled();
        }
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
            report.queryParams.witCommitteeSize >= __storage().witOracleQuerySettings.minWitnesses,
            "insufficient witnesses"
        );
        
        _require(
            report.queryRadHash.eq(__storage().witOracleProofOfReserveRadonHash),
            "invalid radon hash"
        );

        // Ask the Wit/Oracle to validate and parse the posted query's result: 
        Witnet.DataResult memory _witOracleProofOfReserve = witOracle
            .pushDataReport(
                report,
                proof
            );

        // Parse expected integer from the posted query's result:
        try WrappedWITLib.parseWitOracleProofOfReserve(
            _witOracleProofOfReserve
        
        ) returns (
            uint64 _totalReserve
        
        ) {
            emit ReserveUpdate(
                _totalReserve, 
                _witOracleProofOfReserve.timestamp,
                _witOracleProofOfReserve.drTxHash 
            );
            __storage().evmLastReserveNanowits = _totalReserve;
            __storage().evmLastReserveTimestamp = _witOracleProofOfReserve.timestamp;

        } catch Error(string memory _reason) {
            _revert(_reason);
        
        } catch (bytes memory) {
            _revertUnhandled();
        }
    }


    /// ===============================================================================================================
    /// --- Internal methods ------------------------------------------------------------------------------------------

    /// @dev Formally verify cross-chain Radon request for notarizing custodian's proofs of reserve.
    function __formallyVerifyRadonAssets(
            string[] memory _witRpcProviders,
            string memory _witUnwrapperBech32
        )
        internal
    {    
        string[] memory _commonArgs = new string[](2);
        _commonArgs[0] = witCustodian();
        _commonArgs[1] = _witUnwrapperBech32;
        __storage().witOracleProofOfReserveRadonHash = witOracleCrossChainProofOfReserveTemplate
            .verifyRadonRequest(
                _commonArgs,
                _witRpcProviders
            );
    }

    function _require(bool condition, string memory reason) internal pure {
        if (!condition) {
            _revert(reason);
        }
    }

    function _revert(string memory reason) internal pure {
        revert(
            string(abi.encodePacked(
                "WrappedWIT: ",
                reason
            ))
        );
    }

    function _revertUnhandled() internal pure {
        _revert("unhandled exception");
    }

    function __settleWitUnwrapper(string memory _witUnwrapperBech32)
        internal
    {
        require(
            keccak256(bytes(_witUnwrapperBech32)) != __witCustodianBech32Hash,
            "unacceptable unwrapper"
        );
        emit NewUnwrapper(_witUnwrapperBech32);
        __storage().witUnwrapper = Witnet.fromBech32(_witUnwrapperBech32, block.chainid == _CANONICAL_CHAIN_ID);
        __formallyVerifyRadonAssets(
            __storage().witOracleCrossChainRpcProviders,
            _witUnwrapperBech32
        );
    }

    function __storage() internal pure returns (WrappedWITLib.Storage storage) {
        return WrappedWITLib.data();
    }
}
