// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title VaultXToken — ERC-20 token for the VaultX presale ecosystem
/// @notice Minting is restricted to the PresaleVault and VaultXStaking contracts
contract VaultXToken is ERC20, ERC20Permit, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether; // 1 billion tokens

    mapping(address => bool) public minters;

    event MinterSet(address indexed account, bool status);

    modifier onlyMinter() {
        require(minters[msg.sender], "VaultXToken: not a minter");
        _;
    }

    constructor(address initialOwner)
        ERC20("VaultX Token", "VTX")
        ERC20Permit("VaultX Token")
        Ownable(initialOwner)
    {}

    /// @notice Grant or revoke minting rights
    function setMinter(address account, bool status) external onlyOwner {
        minters[account] = status;
        emit MinterSet(account, status);
    }

    /// @notice Mint tokens — called by PresaleVault / VaultXStaking
    function mint(address to, uint256 amount) external onlyMinter {
        require(totalSupply() + amount <= MAX_SUPPLY, "VaultXToken: max supply exceeded");
        _mint(to, amount);
    }

    /// @notice Owner can burn own tokens
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
