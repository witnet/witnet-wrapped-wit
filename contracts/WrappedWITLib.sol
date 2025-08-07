// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import "./IWrappedWIT.sol";
import {IWitOracleRadonRequestModal} from "witnet-solidity-bridge/contracts/WitOracleRadonRequestFactory.sol";

/// @title Witnet Request Board base data model library
/// @author The Witnet Foundation.
library WrappedWITLib {  

    using Witnet for Witnet.DataResult;
    using Witnet for Witnet.Timestamp;
    using WitnetCBOR for WitnetCBOR.CBOR;
    
    bytes32 internal constant _WRAPPED_WIT_STORAGE_SLOT =
        /* keccak256("io.witnet.tokens.WIT") */
        0x6116473658e87b023e7f215d122c0048f3d7a669d8df94a5565f0c95871c58f9;

    uint256 internal constant _PERCENT_FACTOR = 100;
    uint24  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_GAS_LIMIT = 220_000; 
    uint256 internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED = type(uint256).max;
    uint16  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_RESULT_SIZE = 256;

    struct Storage {
        address evmCurator; uint32 _0; 
        Witnet.Timestamp evmLastReserveTimestamp;
        uint64  evmLastReserveNanowits; 
        uint64  evmUnwraps; 
        uint64  evmWraps;
        Witnet.Address witCustodianUnwrapper;
        IWrappedWIT.WitOracleSettings witOracleQuerySettings;
        string[] witOracleCrossChainRpcProviders;
        Witnet.RadonHash witOracleProofOfReserveRadonHash;
        
        mapping (Witnet.TransactionHash => uint256) witOracleWrappingTransactionLastQueryId;
        mapping (uint256 => Witnet.TransactionHash) witOracleWrappingQueryTransactionHash;
    }

    
    // ================================================================================================================
    // --- Public functions -------------------------------------------------------------------------------------------

    function parseWitOracleProofOfReserve(Witnet.DataResult memory witOracleProofOfReserve)
        external view
        returns (uint64)
    {
        uint64[] memory _witBalance;
        if (witOracleProofOfReserve.status == Witnet.ResultStatus.NoErrors) {
            _witBalance = witOracleProofOfReserve.fetchUint64Array();
        }
        require(
            witOracleProofOfReserve.status == Witnet.ResultStatus.NoErrors
                && witOracleProofOfReserve.timestamp.gt(data().evmLastReserveTimestamp)
                && _witBalance.length == 3,
            "invalid report"
        );
        return (
            _witBalance[0]
                + _witBalance[1]
                + _witBalance[2]
        );
    }

    function processWitOracleQueryResult(
            uint256 witOracleQueryId,
            bytes calldata witOracleQueryResult
        )
        external
        returns (
            Witnet.TransactionHash _witValueTransferTransactionHash,
            string memory _witRecipientBech32,
            string memory _witWrapperBech32,
            address _evmRecipient,
            uint64 _value
        )
    {
        _witValueTransferTransactionHash = data().witOracleWrappingQueryTransactionHash[witOracleQueryId];

        // Check that the query id actually refers to a wit/wrap tx that's being validated:
        require(
            Witnet.TransactionHash.unwrap(_witValueTransferTransactionHash) != bytes32(0), 
            "invalid query id"
        );

        // Check that the Wit/wrap tx being reported has not yet been validated:
        require(
            data().witOracleWrappingTransactionLastQueryId[_witValueTransferTransactionHash]
                != _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED, 
            "wit/wrap tx already minted"
        );

        // Deserialize the query's result data:
        Witnet.DataResult memory _witOracleQueryResult = abi.decode(witOracleQueryResult, (Witnet.DataResult));
        
        // Check that the query was successfully solved:
        require(
            _witOracleQueryResult.status == Witnet.ResultStatus.NoErrors,
            "query solved with errors"
        );
        
        // Check that the query result contains an heterogenous array of values:
        require(
            _witOracleQueryResult.dataType == Witnet.RadonDataTypes.Array, 
            "invalid query result"
        );
            
        // Avoid double-spending by marking the Witnet value transfer hash as already parsed and processed:
        data().witOracleWrappingTransactionLastQueryId[_witValueTransferTransactionHash] = _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED;

        // Try to parse Witnet Value Transfer metadata being reported:
        WitnetCBOR.CBOR[] memory _metadata = _witOracleQueryResult.fetchCborArray();
        /**
         * [
         *   0 -> finalized: uint8,
         *   1 -> metadata: string,
         *   2 -> recipient: string,
         *   3 -> sender: string,
         *   4 -> timestamp: uint64,
         *   5 -> value: uint64,
         * ]
         **/

        // Revert if the referred Witnet transaction is reported to not be finalized just yet:
        require(_metadata[0].readUint() == 1, "unfinalized query result");
        
        // Parse data result:
        _witRecipientBech32 = _metadata[2].readString();
        _witWrapperBech32 = _metadata[3].readString();
        _evmRecipient = Witnet.toAddress(
            Witnet.parseHexString(
                _metadata[1].readString()
            )
        );
        Witnet.Timestamp _valueTimestamp = Witnet.Timestamp.wrap(_metadata[4].readUint());
        _value = _metadata[5].readUint();
        
        // Increase count of validated wrap transactions:
        data().evmWraps ++;
        
        // Also increase the burnable supply, only if the VTT's inclusion timestamp is fresher than last PoR's timestamp:
        if (_valueTimestamp.gt(data().evmLastReserveTimestamp)) {
            data().evmLastReserveNanowits += _value;
        }
    }

    function witOracleQueryWitnetValueTransferProofOfInclusion(
            WitOracle witOracle, 
            IWitOracleRadonRequestModal witOracleCrossChainProofOfInclusionTemplate,
            Witnet.TransactionHash witValueTransferTransactionHash
        ) 
        external 
        returns (uint256 _witQueryId)
    {
        _witQueryId = data().witOracleWrappingTransactionLastQueryId[witValueTransferTransactionHash];
        if (
            _witQueryId != _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED
        ) {
            string[] memory _commonArgs = new string[](1);
            _commonArgs[0] = Witnet.toHexString(Witnet.TransactionHash.unwrap(witValueTransferTransactionHash));
            Witnet.RadonHash _radonHash = witOracleCrossChainProofOfInclusionTemplate
                .verifyRadonRequest(
                    _commonArgs,
                    data().witOracleCrossChainRpcProviders
                );
            _witQueryId = IWitOracleQueriable(witOracle).queryDataWithCallback{
                value: msg.value
            }(
                _radonHash,
                Witnet.QuerySLA({
                    witCommitteeSize: data().witOracleQuerySettings.minWitnesses,
                    witUnitaryReward: data().witOracleQuerySettings.unitaryRewardNanowits,
                    witResultMaxSize: _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_RESULT_SIZE
                }),
                Witnet.QueryCallback({
                    consumer: address(this),
                    gasLimit: data().witOracleQuerySettings.responseCallbackGasLimit
                })
            );
            data().witOracleWrappingTransactionLastQueryId[witValueTransferTransactionHash] = _witQueryId;
            data().witOracleWrappingQueryTransactionHash[_witQueryId] = witValueTransferTransactionHash;
        }
    }


    // ================================================================================================================
    // --- Internal functions -----------------------------------------------------------------------------------------

    function data() internal pure returns (Storage storage _ptr) {
        assembly {
            _ptr.slot := _WRAPPED_WIT_STORAGE_SLOT
        }
    }

    function witOracleEstimateWrappingFee(WitOracle witOracle, uint256 evmGasPrice) internal view returns (uint256) {
        return (
            (_PERCENT_FACTOR + data().witOracleQuerySettings.baseFeeOverhead100)
                * witOracle.estimateBaseFeeWithCallback(
                    evmGasPrice, 
                    _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_GAS_LIMIT
                )
        ) / _PERCENT_FACTOR;
    }
}