// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import "witnet-solidity-bridge/contracts/WitOracle.sol";

interface IWrappedWIT {

    error Unauthorized();

    event CuratorshipTransferred(address indexed evmPrevCurator, address indexed evmNewCurator);
    event NewUnwrapper(string witUnwrapper);
    event ReserveUpdate(uint256 value, Witnet.Timestamp timestamp, Witnet.TransactionHash witDrtHash);
    event Wrapped(string witSender, address evmRecipient, uint256 value, Witnet.TransactionHash witVttHash);
    event Unwrapped(address evmSender, string witRecipient, uint256 value, uint256 nonce);

    struct WitOracleSettings {
        uint16 minWitnesses;
        uint16 baseFeeOverhead100;
        uint64 unitaryRewardNanowits;
    }

    enum WrappingStatus {
        Unknown,
        Awaiting,
        Retry,
        Done
    }

    /// --- Read-only methods -----------------------------------------------------------------------------------------
    function evmCurator() external view returns (address);
    function getWrapTransactionLastQueryId(Witnet.TransactionHash) external view returns (uint256);
    function getWrapTransactionStatus(Witnet.TransactionHash) external view returns (WrappingStatus);
    function totalReserve() external view returns (uint256);
    function totalUnwraps() external view returns (uint256);
    
    function witCustodian() external view returns (string memory);
    function witUnwrapper() external view returns (string memory);
    
    function witOracleEstimateWrappingFee(uint256) external view returns (uint256);
    function witOracleProofOfReserveRadonBytecode() external view returns (bytes memory);
    function witOracleQuerySettings() external view returns (WitOracleSettings memory);
    
    /// --- Authoritative methods -------------------------------------------------------------------------------------
    function settleWitOracleSettings(WitOracleSettings calldata) external;
    function settleWitRpcProviders(string[] calldata) external;
    function settleWitUnwrapper(string calldata) external;
    function transferCuratorship(address) external;

    // --- Permissionless state-modifying methods ---------------------------------------------------------------------
    function wrap(Witnet.TransactionHash witTxHash) external payable returns (uint256 witOracleQueryId);
    function unwrap(uint64, string calldata) external returns (uint256 evmUnwrapId);
}
