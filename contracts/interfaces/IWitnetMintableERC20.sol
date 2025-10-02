// SPDX-License-Identifier: MIT

pragma solidity >=0.8.20 <0.9.0;

import "witnet-solidity-bridge/contracts/WitOracle.sol";

interface IWitnetMintableERC20 {

    event CuratorshipTransferred(address indexed evmPrevCurator, address indexed evmNewCurator);
    event NewCustodianUnwrapper(address curator, string witCustodianUnwrapper);
    event PauseFlags(address curator, bool erc7802, bool witnetBurns, bool witnetMints);
    event ReserveUpdate(uint256 value, Witnet.Timestamp timestamp, Witnet.TransactionHash indexed witDrTxHash);
    event SettledBridge(address curator, address from, address into);
    event WitRpcProvidersChanged(address curator, string[] witRpcProviders);
    event Wrapped(string witSender, address indexed evmRecipient, uint256 value, Witnet.TransactionHash witVttHash);
    event Unwrapped(address indexed evmSender, string witRecipient, uint256 value, uint256 nonce);

    struct WitOracleSettings {
        uint16 minWitnesses;
        uint16 extraFeePercentage;
        uint64 unitaryRewardNanowits;
        uint24 responseCallbackGasLimit;
    }

    enum WrappingStatus {
        Unknown,
        Awaiting,
        Retry,
        Done
    }

    // ====================================================================================================================
    /// --- Read-only methods ---------------------------------------------------------------------------------------------
    
    function bridge() external view returns (address);
    function curator() external view returns (address);
    
    function getWrapTransactionLastQueryId(Witnet.TransactionHash) external view returns (uint256);
    function getWrapTransactionStatus(Witnet.TransactionHash) external view returns (WrappingStatus);
    function getWrapTransactionStatuses(Witnet.TransactionHash[] calldata) external view returns (WrappingStatus[] memory);

    function minUnwrappableNanowits() external view returns (uint256);

    function paused() external view returns (bool bridge, bool witnetBurns, bool witnetMints);
    
    function totalReserveNanowits() external view returns (uint256);
    function totalUnwrappings() external view returns (uint256);
    function totalUnwraps() external view returns (uint256);
    function totalWrappings() external view returns (uint256);
    function totalWraps()   external view returns (uint256);
    
    function witCustodianWrapper() external view returns (string memory);
    function witCustodianUnwrapper() external view returns (string memory);

    function witOracleCrossChainRpcProviders() external view returns (string[] memory);
    function witOracleEstimateWrappingFee(uint256) external view returns (uint256);
    function witOracleProofOfReserveLastUpdate() external view returns (Witnet.Timestamp);
    function witOracleProofOfReserveRadonBytecode() external view returns (bytes memory);
    function witOracleProofOfReserveRadonHash() external view returns (Witnet.RadonHash);
    function witOracleQuerySettings() external view returns (WitOracleSettings memory);
    
    /// ===================================================================================================================    
    /// --- Authoritative methods -----------------------------------------------------------------------------------------
    
    function crosschainPause(bool erc7802, bool witnetBurns, bool witnetMints) external;
    function settleBridge(address) external;
    function settleWitCustodianUnwrapper(string calldata) external;
    function settleWitOracleCrossChainRpcProviders(string[] memory) external;
    function settleWitOracleSettings(WitOracleSettings calldata) external;
    function transferCuratorship(address) external;

    /// ====================================================================================================================
    // --- Permissionless state-modifying methods --------------------------------------------------------------------------
    
    function wrap(Witnet.TransactionHash witTxHash) external payable returns (uint256 witOracleQueryId);
    function unwrap(uint64, string calldata) external returns (uint256 evmUnwrapId);
}
