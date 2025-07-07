// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.27;

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
    address internal constant _SUPERCHAIN_TOKEN_BRIDGE = 0x4200000000000000000000000000000000000028; // Superchain bridge
    
    uint16  internal constant _WIT_ORACLE_REPORTS_MIN_MIN_WITNESSES = 3;
    uint16  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_BASE_FEE_OVERHEAD = 50;
    uint64  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_MIN_UNITARY_REWARD = 200_000_000; // 0.2 $WIT
    
    uint56  internal constant _WRAPPED_WIT_BURNABLE_MIN_MIN_WITS = 10000;
    
    WitOracle public immutable witOracle;
    IWitOracleRadonRequestModal public immutable witOracleCrossChainProofOfReserve;
    IWitOracleRadonRequestModal public immutable witOracleCrossChainProofOfInclusion;
    
    Witnet.Address internal immutable __witCustodian;

    modifier checkUnwrapValue(uint64 value) {
        _require(
            value >= __storage().evmSettings.burnableMinNanowits
                && value <= __storage().witCustodianBalance.witUnlocked,
            "cannot unwrap that much"
        ); _;
    }

    modifier onlyAuthority {
        require(
            _msgSender() == __storage().evmAuthority, 
            Unauthorized()
        ); _;
    }

    constructor(
            string memory _witCustodian,
            IWitOracleRadonRequestFactory _witOracleRadonRequestFactory
        )
        ERC20("Wrapped WIT", "WIT")
        ERC20Permit("Wrapped/WIT")
    {
        // Settle immutable parameters --------------------------------------------------------------------------------
        __witCustodian = Witnet.fromBech32(_witCustodian, block.chainid == _CANONICAL_CHAIN_ID);

        witOracle = WitOracle(IWitOracleAppliance(address(_witOracleRadonRequestFactory)).witOracle());
        string[2][] memory _httpRequestHeaders = new string[2][](1);
        _httpRequestHeaders[0] = [ "Content-Type", "application/json;charset=UTF-8" ];
        witOracleCrossChainProofOfReserve = _witOracleRadonRequestFactory.buildRadonRequestModal(
            IWitOracleRadonRequestFactory.DataSourceRequest({
                method: Witnet.RadonRetrievalMethods.HttpPost,
                body: '{"jsonrpc":"2.0","method":"getBalance2","params":{"pkh":"\\1\\"},"id":1}',
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
        witOracleCrossChainProofOfInclusion = _witOracleRadonRequestFactory.buildRadonRequestModal(
            IWitOracleRadonRequestFactory.DataSourceRequest({
                method: Witnet.RadonRetrievalMethods.HttpPost,
                body: '{"jsonrpc":"2.0","method":"getValueTransfer","params":{"hash":"\\1\\","mode":"ethereal","force":true},"id":1}',
                headers: _httpRequestHeaders,         
                script: // [RadonString] parseJSONMap()
                        // [RadonMap]    getMap("result")
                        // [RadonArray]  values()
                        hex"83187782186666726573756c741869"                    
                // script: // [RadonString] parseJSONMap()
                //         // [RadonMap]    getMap("result")
                //         // [RadonMap]    getMap("ethereal")
                //         // [RadonArray]  values()
                //         hex"84187782186666726573756C7482186668657468657265616C1869"
            }),
            Witnet.RadonReducer({
                opcode: Witnet.RadonReduceOpcodes.Mode,
                filters: new Witnet.RadonFilter[](0)
            })
        );
    }

    function initialize(address _evmAuthority) external initializer {
        // Validate constructor parameters -----------------------------
        _require(_evmAuthority != address(0), "invalid EVM authority");        
        
        // Initialize authoritative parameters ----------------------------------------------------------------------
        __storage().evmAuthority = _evmAuthority;
        __storage().evmSettings = EvmSettings({
            burnableMinNanowits: uint56(_WRAPPED_WIT_BURNABLE_MIN_MIN_WITS * 10 ** decimals()),
            witOracleMinWitnesses: block.chainid == _CANONICAL_CHAIN_ID ? 12 : _WIT_ORACLE_REPORTS_MIN_MIN_WITNESSES,
            witOracleQueriesBaseFeeOverhead: _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_BASE_FEE_OVERHEAD / 5, 
            witOracleQueriesUnitaryReward: _WIT_ORACLE_QUERIABLE_CONSUMER_MIN_UNITARY_REWARD
        });
        string[] memory _witOracleRpcProviders = new string[](1);
        _witOracleRpcProviders[0] = (
            block.chainid == _CANONICAL_CHAIN_ID 
                ? "https://rpc-01.witnet.io" 
                : "https://rpc-testnet.witnet.io"
        );
        __storage().witOracleCrossChainRpcProviders = _witOracleRpcProviders;

        // Formally verify parameterized Radon assets ------
        __formallyVerifyRadonAssets(_witOracleRpcProviders);
    }

 
    /// ===============================================================================================================
    /// --- ERC20 -----------------------------------------------------------------------------------------------------

    function decimals() override public pure returns (uint8) {
        return 9;
    }


    /// ===============================================================================================================
    /// --- ERC20Burnable ---------------------------------------------------------------------------------------------

    function _checkTokenBridge(address caller) override internal pure {
        if (caller != _SUPERCHAIN_TOKEN_BRIDGE) revert Unauthorized();
    }


    /// ===============================================================================================================
    /// --- Wrapped/WIT read-only methods -----------------------------------------------------------------------------

    function burnableSupply() override external view returns (uint256) {
        return __storage().witCustodianBalance.witUnlocked;
    }
    
    function evmAuthority() override external view returns (address) {
        return __storage().evmAuthority;
    }

    function evmSettings() override external view returns (EvmSettings memory) {
        return __storage().evmSettings;
    }

    function totalReserve() override external view returns (uint256) {
        return (
            __storage().witCustodianBalance.witUnlocked
                + __storage().witCustodianBalance.witStaked
                + __storage().witCustodianBalance.witLocked
        );
    }

    function witCustodian() override public view returns (string memory) {
        return __witCustodian.toBech32(block.chainid == _CANONICAL_CHAIN_ID);
    }

    function witCustodianBalance() override public view returns (WitBalance memory) {
        return __storage().witCustodianBalance;
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


    /// ===============================================================================================================
    /// --- Wrapped/WIT authoritative methods -------------------------------------------------------------------------

    function settleEvmSettings(EvmSettings calldata _settings)
        external
        onlyAuthority
    {
        assert(
            _settings.burnableMinNanowits >= _WRAPPED_WIT_BURNABLE_MIN_MIN_WITS * 10 ** decimals()
                && _settings.witOracleMinWitnesses >= _WIT_ORACLE_REPORTS_MIN_MIN_WITNESSES
                && _settings.witOracleQueriesBaseFeeOverhead <= _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_BASE_FEE_OVERHEAD
                && _settings.witOracleQueriesUnitaryReward >= _WIT_ORACLE_QUERIABLE_CONSUMER_MIN_UNITARY_REWARD
        );
        __storage().evmSettings = _settings;
    }

    function settleWitRpcProviders(string[] memory _witRpcProviders)
        external
        onlyAuthority
    {
        assert(_witRpcProviders.length > 0);
        __formallyVerifyRadonAssets(_witRpcProviders);
        __storage().witOracleCrossChainRpcProviders = _witRpcProviders;
    }

    function transferAuthority(address _newAuthority)
        external 
        onlyAuthority
    {
        assert(_newAuthority != address(0));
        emit AuthorityTransferred(__storage().evmAuthority, _newAuthority);
        __storage().evmAuthority = _newAuthority;
    }

    
    /// ===============================================================================================================
    /// --- Wrapped/WIT permissionless wrap/unwrap operations ---------------------------------------------------------

    function wrap(Witnet.TransactionHash witnetValueTransferHash)
        override public payable
        returns (uint256 _witQueryId)
    {
        return WrappedWITLib.witOracleQueryWitnetValueTransferProofOfInclusion(
            witOracle,
            witOracleCrossChainProofOfInclusion,
            witnetValueTransferHash
        );
    }

    function unwrap(uint64 value, string calldata witAddrBech32)
        override external
        checkUnwrapValue(value)
    {
        WrappedWITLib.parseWitnetAddress(witAddrBech32, block.chainid == _CANONICAL_CHAIN_ID);

        // immediate reduction of burnable supply:
        __storage().witCustodianBalance.witUnlocked -= uint64(value);

        // immediate burning of wrapped wit tokens:
        _burn(_msgSender(), value);

        // emit events
        emit Transfer(_msgSender(), address(0), value);
        emit Unwrapped(_msgSender(), witAddrBech32, value, block.timestamp);
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
            queryResult,
            block.chainid == _CANONICAL_CHAIN_ID
        
        ) returns (
            Witnet.TransactionHash _witnetValueTransferHash,
            Witnet.Address _witnetValueTransferRecipient,
            string memory _witnetValueTransferSenderBech32,
            address _account,
            uint64 _value
        
        ) {
            _require(
                __witCustodian.eq(_witnetValueTransferRecipient),
                "invalid custodian"
            );

            // mint newly wrapped tokens:
            _mint(_account, _value);

            // emit events:
            emit Transfer(address(0), _account, _value);
            emit Wrapped(_witnetValueTransferSenderBech32, _account, _value, _witnetValueTransferHash);

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
            report.witDrSLA.witCommitteeSize >= __storage().evmSettings.witOracleMinWitnesses,
            "insufficient witnesses"
        );
        
        _require(
            report.witRadonHash.eq(__storage().witOracleProofOfReserveRadonHash),
            "invalid radon hash"
        );

        Witnet.DataResult memory _witOracleProofOfReserve = witOracle
            .pushDataReport(
                report,
                proof
            );

        try WrappedWITLib.parseWitOracleProofOfReserve(
            _witOracleProofOfReserve
        
        ) returns (
            WitBalance memory _witCustodianBalance
        
        ) {
            __storage().witCustodianBalance = _witCustodianBalance;

        } catch Error(string memory _reason) {
            _revert(_reason);
        
        } catch (bytes memory) {
            _revertUnhandled();
        }
    }


    /// ===============================================================================================================
    /// --- Internal methods ------------------------------------------------------------------------------------------

    /// @dev Formally verify cross-chain Radon request for notarizing custodian's proofs of reserve.
    function __formallyVerifyRadonAssets(string[] memory _witRpcProviders) internal {    
        string[] memory _commonArgs = new string[](1);
        _commonArgs[0] = witCustodian();
        __storage().witOracleProofOfReserveRadonHash = witOracleCrossChainProofOfReserve
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

    function __storage() internal pure returns (WrappedWITLib.Storage storage) {
        return WrappedWITLib.data();
    }
}
