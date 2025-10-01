// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity >=0.8.20 <0.9.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Bridgeable, IERC7802} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Bridgeable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {IERC165, IOptimismMintableERC20} from "./interfaces/IOptimismMintableERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract WitnetL2ERC20
    is
        ERC20, 
        ERC20Bridgeable, 
        ERC20Permit,
        Initializable,
        IOptimismMintableERC20
{
    error Unauthorized();

    event CuratorshipTransferred(address from, address into);
    event CuratorshipRenounced(address from);
    event SettledBridge(address curator, address from, address into, bool superchained);

    address public curator;
    address public override bridge;
    address public override remoteToken;
    bool public superchained;

    modifier onlyStandardBridge {
        require(
            superchained == false
                && msg.sender == bridge, 
            Unauthorized()
        ); _;
    }

    modifier onlyCurator {
        require(
            msg.sender == curator, 
            Unauthorized()
        ); _;
    }

    constructor()
        ERC20("Witnet", "WIT") 
        ERC20Permit("Witnet")
    {}

    function initialize(address _curator, address _remoteToken)
        external 
        initializer
    {
        require(_curator != address(0), "zero curator");
        require(_remoteToken != address(0), "zero token");
        
        // Initialize curator:
        curator = _curator;
        emit CuratorshipTransferred(address(0), tx.origin);

        // Settle remote token address in stone:
        remoteToken = _remoteToken;

        // Settle the default StandardBridge until the cruator eventually determines otherwise:
        bridge = 0x4200000000000000000000000000000000000010;
        superchained = false;
    }

    function settleStandardBridge(address _newBridge)
        external
        onlyCurator
    {
        require(_newBridge != address(0), "zero bridge");
        emit SettledBridge(msg.sender, bridge, _newBridge, false);
        bridge = _newBridge;
        superchained = false;
    }

    function settleSuperchainBridge(address _newBridge)
        external
        onlyCurator
    {
        require(_newBridge != address(0), "zero bridge");
        emit SettledBridge(msg.sender, bridge, _newBridge, true);
        bridge = _newBridge;
        superchained = true;
    }

    function transferCuratorship(address _newCurator)
        external
        onlyCurator
    {
        require(_newCurator != address(0), Unauthorized());
        emit CuratorshipTransferred(curator, _newCurator);
        curator = _newCurator;
    }

    
    /// ===============================================================================================================
    /// --- ERC20 -----------------------------------------------------------------------------------------------------

    function decimals() override public pure returns (uint8) {
        return 9;
    }


    /// ===============================================================================================================
    /// --- ERC20Bridgeable -------------------------------------------------------------------------------------------

    /**
     * @dev Checks if the caller is the predeployed SuperchainTokenBridge. Reverts otherwise.
     */
    function _checkTokenBridge(address caller) internal view override {
        // Only allow the configured Superchain bridge when `superchained == true`
        if (!superchained || caller != bridge) revert Unauthorized();
    }

    
    /// ===============================================================================================================
    /// --- ERC165 ----------------------------------------------------------------------------------------------------

    /// @notice ERC165 interface check function.
    /// @param _interfaceId Interface ID to check.
    /// @return Whether or not the interface is supported by this contract.
    function supportsInterface(bytes4 _interfaceId)
        virtual override(ERC20Bridgeable, IERC165)
        public pure
        returns (bool)
    {
        return (
            _interfaceId == type(IOptimismMintableERC20).interfaceId
                || _interfaceId == type(IERC7802).interfaceId
                || _interfaceId == type(IERC165).interfaceId
        );
    }


    /// ===============================================================================================================
    /// --- IOptimismMintableERC20 ------------------------------------------------------------------------------------

    /// @notice Burns tokens from an account.
    /// @dev Bridge-gated burn used by the bridge for withdrawals.
    /// @param _from   Address to burn tokens from.
    /// @param _amount Amount of tokens to burn.
    function burn(
        address _from,
        uint256 _amount
    )
        virtual override
        external
        onlyStandardBridge
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
        onlyStandardBridge
    {
        _mint(_to, _amount);
        emit Mint(_to, _amount);
    }
}
