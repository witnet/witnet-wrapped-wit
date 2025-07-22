// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import "witnet-solidity-bridge/contracts/WitOracle.sol";

interface IWrappedWIT {

    error Unauthorized();

    event AuthorityTransferred(address from, address to);    
    event Wrapped(string from, address into, uint256 value, Witnet.TransactionHash witnetValueTransferHash);
    event Unwrapped(address from, string into, uint256 value, uint256 timestamp);

    struct EvmSettings {
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

    enum WrappingStatus {
        Unknown,
        Awaiting,
        Retry,
        Done
    }

    /// --- Read-only methods -----------------------------------------------------------------------
    function burnableSupply() external view returns (uint256);
    function evmAuthority() external view returns (address);
    function evmSettings() external view returns (EvmSettings memory);
    function getWrapTransactionLastQueryId(Witnet.TransactionHash) external view returns (uint256);
    function getWrapTransactionStatus(Witnet.TransactionHash) external view returns (WrappingStatus);
    function totalReserve() external view returns (uint256);
    function witCustodian() external view returns (string memory);
    function witCustodianBalance() external view returns (WitBalance memory);
    function witOracleEstimateWrappingFee(uint256) external view returns (uint256);
    function witOracleProofOfReserveRadonBytecode() external view returns (bytes memory);
    
    /// --- Authoritative methods -----------------------------
    function settleEvmSettings(EvmSettings calldata) external;
    function settleWitRpcProviders(string[] calldata) external;
    function transferAuthority(address) external;

    // --- Permissionless state-modifying methods -------------------------------------
    function wrap(Witnet.TransactionHash witTxHash) external payable returns (uint256);
    function unwrap(uint64, string calldata) external;
}