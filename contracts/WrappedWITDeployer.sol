// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

import {Create3} from "./Create3.sol";

/// @notice CREATE3 (EIP-3171) contract factory for deploying both canonical 
/// @notice and bridged versions of the Wrapped/WIT ERC-20 token.
contract WrappedWITDeployer is Ownable2Step {

    constructor() Ownable(msg.sender) {}

    /// @notice Deploy canonical version of the WrappedWIT token.
    /// @param salt Salt that determines the address of the new contract.
    /// @param creationCode Creation bytecode of the canonical implementation of the Wrapped/WIT token.
    /// @param initialAuthority EVM address that will be granted permissions for altering authoritative settings.
    /// @param witCustodianAddressBech32 Witnet Custodian address where wrapped tokens will be pegged to. 
    /// @param witOracleRadonRequestFactory Radon Request Factory artifact address (bound to the Wit/Oracle bridge contract).
    function deployCanonical(
            uint256 salt, 
            bytes calldata creationCode,
            address initialAuthority,
            string memory witCustodianAddressBech32,
            address witOracleRadonRequestFactory
        )
        virtual public
        onlyOwner
        returns (address _deployed)
    {
        _deployed = Create3.deploy(
            bytes32(salt),
            abi.encodePacked(
                creationCode,
                abi.encode(
                    witCustodianAddressBech32,
                    witOracleRadonRequestFactory
                )
            )
        );
        (bool _success,) = _deployed.call(abi.encodeWithSignature(
            "initialize(address)",
            initialAuthority
        ));
        require(_success, "initialization failed");
    }

    /// @notice Deploy immutable bridged version of the WrappedWIT token.
    /// @param salt Salt that determines the address of the new contract.
    /// @param creationCode Creation bytecode of some bridged implementation of the Wrapped/WIT token. 
    function deployBridged(
            uint256 salt,
            bytes calldata creationCode
        )
        virtual public
        onlyOwner
        returns (address)
    {
        return Create3.deploy(
            bytes32(salt),
            creationCode
        );
    }

    /// @notice Computes the resulting address of a contract deployed using address(this) and the given `salt`.
    /// @param salt Salt that determines the address of the new contract.
    /// @return addr of the deployed contract, reverts on error
    function determineAddr(uint256 salt)
        virtual public view
        returns (address)
    {
        return Create3.determineAddr(bytes32(salt));
    }
}
