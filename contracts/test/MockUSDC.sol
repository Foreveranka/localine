// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface TokenHook {
    function onTokenTransfer() external;
}

/// @dev Test-only token. Never deployed as the project's USDC.
contract MockUSDC is ERC20 {
    bool public fail;
    bool public chargeFee;
    address public hook;
    constructor() ERC20("Test USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function configure(bool shouldFail, bool fee, address callback) external {
        fail = shouldFail;
        chargeFee = fee;
        hook = callback;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (fail) return false;
        if (hook != address(0)) TokenHook(hook).onTokenTransfer();
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (fail) return false;
        if (hook != address(0)) TokenHook(hook).onTokenTransfer();
        return super.transferFrom(from, to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (chargeFee && from != address(0) && to != address(0) && value > 0) {
            super._update(from, to, value - 1);
            super._update(from, address(0), 1);
        } else {
            super._update(from, to, value);
        }
    }
}
