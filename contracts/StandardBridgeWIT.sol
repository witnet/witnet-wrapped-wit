// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity >=0.8.20 <0.9.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Bridgeable} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Bridgeable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

import {IERC165, IOptimismMintableERC20} from "./interfaces/IOptimismMintableERC20.sol";

contract StandardBridgeWIT is ERC20, ERC20Permit, IOptimismMintableERC20 {

    error Unauthorized();

    /// @notice Address of the StandardBridge on this network.
    address internal __BRIDGE;

    /// @notice Address of the corresponding token on the remote chain.
    address internal immutable __REMOTE_TOKEN;

    /// @notice A modifier that only allows the bridge to call
    modifier onlyBridge() {
        require(
            msg.sender == __BRIDGE, 
            string(abi.encodePacked(
                bytes(type(StandardBridgeWIT).name),
                ": only the StandardBridge can mint and burn"
            ))
        ); _;
    }
    
    constructor(address _bridge, address _remoteToken)
        ERC20("Wrapped WIT", "WIT") ERC20Permit("Wrapped/WIT")
    {
        __BRIDGE = _bridge;
        __REMOTE_TOKEN = _remoteToken;
    }

    
    /// ===============================================================================================================
    /// --- ERC20 -----------------------------------------------------------------------------------------------------

    function decimals() override public pure returns (uint8) {
        return 9;
    }


    /// ===============================================================================================================
    /// --- ERC165 ----------------------------------------------------------------------------------------------------

    /// @notice ERC165 interface check function.
    /// @param _interfaceId Interface ID to check.
    /// @return Whether or not the interface is supported by this contract.
    function supportsInterface(bytes4 _interfaceId)
        virtual override
        public pure
        returns (bool)
    {
        return (
            _interfaceId == type(IOptimismMintableERC20).interfaceId
                || _interfaceId == type(IERC165).interfaceId
        );
    }


    /// ===============================================================================================================
    /// --- IOptimismMintableERC20 ------------------------------------------------------------------------------------

    function bridge() virtual override external view returns (address) {
        return __BRIDGE;
    }

    /// @notice Burns tokens from an account.
    /// @dev This function always reverts to prevent withdrawals to L1.
    /// @param _from   Address to burn tokens from.
    /// @param _amount Amount of tokens to burn.
    function burn(
        address _from,
        uint256 _amount
    )
        virtual override
        external
        onlyBridge
    {
        _burn(_from, _amount);
        emit Burn(_from, _amount);
    }

    /// @notice Allows the StandardBridge on this network to mint tokens.
    /// @param _to     Address to mint tokens to.
    /// @param _amount Amount of tokens to mint.
    function mint(
        address _to,
        uint256 _amount
    )
        virtual override 
        external
        onlyBridge
    {
        _mint(_to, _amount);
        emit Mint(_to, _amount);
    }

    function remoteToken() override external view returns (address) {
        return __REMOTE_TOKEN;
    }
}
