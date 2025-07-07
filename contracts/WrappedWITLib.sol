// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import "./IWrappedWIT.sol";
import {IWitOracleRadonRequestModal} from "witnet-solidity-bridge/contracts/WitOracleRadonRequestFactory.sol";

/// @title Witnet Request Board base data model library
/// @author The Witnet Foundation.
library WrappedWITLib {  

    using Witnet for Witnet.DataResult;
    using Witnet for Witnet.Timestamp;
    using WitnetCBOR for WitnetCBOR.CBOR;
    
    bytes32 internal constant _WRAPPED_WIT_DATA_SLOTHASH =
        /* keccak256("io.witnet.tokens.WIT") */
        0x6116473658e87b023e7f215d122c0048f3d7a669d8df94a5565f0c95871c58f9;

    uint24  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_GAS_LIMIT = 1000000; 
    uint256 internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED = type(uint256).max;
    uint16  internal constant _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_RESULT_SIZE = 64;

    struct Storage {
        address evmAuthority;
        IWrappedWIT.EvmSettings evmSettings;
        IWrappedWIT.WitBalance witCustodianBalance;
        string[] witOracleCrossChainRpcProviders;
        Witnet.RadonHash witOracleProofOfReserveRadonHash;
        mapping (Witnet.TransactionHash => uint256) witOracleWrappingTransactionQueryId;
        mapping (uint256 => Witnet.TransactionHash) witOracleWrappingQueryTransactionHash;
    }

    
    // ================================================================================================================
    // --- Public functions -------------------------------------------------------------------------------------------

    function parseWitnetAddress(string calldata witAddrBech32, bool isMainnet)
        public pure 
        returns (Witnet.Address)
    {
        return Witnet.fromBech32(witAddrBech32, isMainnet);
    }

    function parseWitOracleProofOfReserve(Witnet.DataResult memory witOracleProofOfReserve)
        public view
        returns (IWrappedWIT.WitBalance memory)
    {

        uint64[] memory _witBalance;
        if (witOracleProofOfReserve.status == Witnet.ResultStatus.NoErrors) {
            _witBalance = witOracleProofOfReserve.fetchUint64Array();
        }
        require(
            witOracleProofOfReserve.status == Witnet.ResultStatus.NoErrors
                && witOracleProofOfReserve.timestamp.gt(data().witCustodianBalance.witTimestamp)
                && _witBalance.length == 3,
            "invalid report"
        );
        return IWrappedWIT.WitBalance({
            witLocked: _witBalance[0],
            witStaked: _witBalance[1],
            witUnlocked: _witBalance[2],
            witTimestamp: witOracleProofOfReserve.timestamp
        });
    }

    function processWitOracleQueryResult(
            uint256 witOracleQueryId,
            bytes calldata witOracleQueryResult,
            bool isMainnet
        )
        public
        returns (
            Witnet.TransactionHash _witnetValueTransferHash,
            Witnet.Address _witnetValueTransferRecipient,
            string memory _witnetValueTransferSenderBech32,
            address _account,
            uint64 _value
        )
    {
        // Check that (a) the query is actually expected:
        _witnetValueTransferHash = data().witOracleWrappingQueryTransactionHash[witOracleQueryId];
        require(
            Witnet.TransactionHash.unwrap(_witnetValueTransferHash) != bytes32(0), 
            "invalid query id"
        );
        // and (b), the Witnet transaction being queried has not yet been processed
        require(
            data().witOracleWrappingTransactionQueryId[_witnetValueTransferHash]
                != _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED, 
            "query already processed"
        );

        // Deserialize query result:
        Witnet.DataResult memory _witOracleQueryResult = abi.decode(witOracleQueryResult, (Witnet.DataResult));
        
        // Check that the query got solved successfully, containing an array of values:
        require(
            _witOracleQueryResult.status == Witnet.ResultStatus.NoErrors
                && _witOracleQueryResult.dataType == Witnet.RadonDataTypes.Array,
            "invalid query result"
        );
        
        // Try to parse Witnet Value Transfer metadata being reported:
        WitnetCBOR.CBOR[] memory _metadata = _witOracleQueryResult.fetchCborArray();
        /**
         * [
         *   finalized: uint8,
         *   metadata: string,
         *   recipient: string,
         *   sender: string,
         *   value: uint64,
         * ]
         **/

        // Revert if the referred Witnet transaction is reported to not be finalized, just yet:
        require(_metadata[0].readUint() == 1, "not finalized transaction");
        
        _witnetValueTransferRecipient = Witnet.fromBech32(_metadata[2].readString(), isMainnet);
        _witnetValueTransferSenderBech32 = _metadata[3].readString();

        _account = Witnet.toAddress(
            Witnet.parseHexString(
                _metadata[1].readString()
            )
        );
        _value = _metadata[4].readUint();

        // Avoid double-spends by marking the Witnet transaction hash as already parsed and processed:
        data().witOracleWrappingTransactionQueryId[_witnetValueTransferHash] = _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_PROCESSED;

        // TODO?: Increase burnable supply, only if the PoI's timestamp is greater than PoR's timestamp:
        //        => requires getValueTransfer to return Value Transfer transaction's block timestamp
        // if (_witOracleQueryResult.timestamp.gt(data().witCustodianBalance.witTimestamp)) {
        //     data().witCustodianBalance.witUnlocked += _value;
        // }
    }

    function witOracleQueryWitnetValueTransferProofOfInclusion(
            WitOracle witOracle, 
            IWitOracleRadonRequestModal witOracleCrossChainProofOfInclusion,
            Witnet.TransactionHash witnetValueTransferHash
        ) 
        public 
        returns (uint256 _witQueryId)
    {
        _witQueryId = data().witOracleWrappingTransactionQueryId[witnetValueTransferHash];
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
            _commonArgs[0] = Witnet.toString(Witnet.TransactionHash.unwrap(witnetValueTransferHash));
            Witnet.RadonHash _radonHash = witOracleCrossChainProofOfInclusion
                .verifyRadonRequest(
                    _commonArgs,
                    data().witOracleCrossChainRpcProviders
                );
            _witQueryId = IWitOracleQueriable(witOracle).queryDataWithCallback{
                value: msg.value
            }(
                _radonHash,
                Witnet.QuerySLA({
                    witCommitteeSize: data().evmSettings.witOracleMinWitnesses,
                    witInclusionFees: data().evmSettings.witOracleQueriesUnitaryReward,
                    witResultMaxSize: _WIT_ORACLE_QUERIABLE_CONSUMER_MAX_RESULT_SIZE
                }),
                Witnet.QueryCallback({
                    consumer: address(this),
                    gasLimit: _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_GAS_LIMIT
                })
            );
            data().witOracleWrappingTransactionQueryId[witnetValueTransferHash] = _witQueryId;
            data().witOracleWrappingQueryTransactionHash[_witQueryId] = witnetValueTransferHash;
        }
    }


    // ================================================================================================================
    // --- Internal functions -----------------------------------------------------------------------------------------

    function data() internal pure returns (Storage storage _ptr) {
        assembly {
            _ptr.slot := _WRAPPED_WIT_DATA_SLOTHASH
        }
    }

    function witOracleEstimateWrappingFee(WitOracle witOracle, uint256 evmGasPrice) internal view returns (uint256) {
        return (
            (100 + data().evmSettings.witOracleQueriesBaseFeeOverhead)
                * witOracle.estimateBaseFeeWithCallback(
                    evmGasPrice, 
                    _WIT_ORACLE_QUERIABLE_CONSUMER_CALLBACK_GAS_LIMIT
                )
        ) / 100;
    }
}