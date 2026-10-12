// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {SettlementPool} from "../src/SettlementPool.sol";
import {MockUSDC} from "./MockUSDC.sol";
import {TestBase} from "./TestBase.sol";

contract PoolHandler is TestBase {
    MockUSDC public token;
    SettlementPool public pool;
    address public constant MERCHANT = address(0x2001);
    uint256 public nextId = 1;
    uint256 public nextAttempt = 1;
    uint256 public nextRef = 1;
    uint256 public deposits;
    uint256 public withdrawals;
    uint256 public paid;
    uint256 public paidCount;

    constructor() {
        token = new MockUSDC();
        pool = new SettlementPool(address(token), address(this), address(this), address(this), 15e6, 100e6);
        token.approve(address(pool), type(uint256).max);
        fund(100e6);
    }

    function fund(uint256 seed) public {
        uint256 amount = seed % 100e6 + 1;
        token.mint(address(this), amount);
        pool.fund(amount);
        deposits += amount;
    }

    function register(uint256 seed) external {
        pool.registerInvoice(bytes32(nextId++), MERCHANT, seed % 15e6 + 1, uint64(block.timestamp + 1 days));
    }

    function reserve(uint256 seed) external {
        if (nextId == 1) return;
        bytes32 id = bytes32(seed % (nextId - 1) + 1);
        pool.reserve(id, keccak256(abi.encode("attempt", nextAttempt++)));
    }

    function release(uint256 seed) external {
        if (nextId == 1) return;
        bytes32 id = bytes32(seed % (nextId - 1) + 1);
        (,,,, bytes32 attempt,) = pool.invoices(id);
        pool.release(id, attempt);
    }

    function settle(uint256 seed) external {
        if (nextId == 1) return;
        bytes32 id = bytes32(seed % (nextId - 1) + 1);
        (,,, uint256 amount, bytes32 attempt,) = pool.invoices(id);
        pool.settle(id, attempt, keccak256(abi.encode("payment", nextRef++)));
        paid += amount;
        paidCount++;
    }

    function cancel(uint256 seed) external {
        if (nextId == 1) return;
        pool.cancelInvoice(bytes32(seed % (nextId - 1) + 1));
    }

    function withdraw(uint256 seed) external {
        uint256 amount = seed % 100e6 + 1;
        pool.withdraw(amount, address(this));
        withdrawals += amount;
    }

    function advanceTime(uint256 seed) external {
        vm.warp(block.timestamp + seed % 2 days);
    }

    function changeLimits(uint256 seed) external {
        uint256 max = seed % 15e6 + 1;
        pool.setLimits(max, max + seed % 100e6);
    }
}

contract SettlementPoolInvariantTest is TestBase {
    struct FuzzSelector {
        address addr;
        bytes4[] selectors;
    }

    struct FuzzArtifactSelector {
        string artifact;
        bytes4[] selectors;
    }

    struct FuzzInterface {
        address addr;
        string[] artifacts;
    }
    PoolHandler internal handler;
    address[] private targets;

    function setUp() public {
        vm.warp(1_800_000_000);
        handler = new PoolHandler();
        targets.push(address(handler));
    }

    function targetContracts() external view returns (address[] memory) {
        return targets;
    }

    function targetSelectors() external view returns (FuzzSelector[] memory result) {
        bytes4[] memory selectors = new bytes4[](9);
        selectors[0] = PoolHandler.fund.selector;
        selectors[1] = PoolHandler.register.selector;
        selectors[2] = PoolHandler.reserve.selector;
        selectors[3] = PoolHandler.release.selector;
        selectors[4] = PoolHandler.settle.selector;
        selectors[5] = PoolHandler.cancel.selector;
        selectors[6] = PoolHandler.withdraw.selector;
        selectors[7] = PoolHandler.advanceTime.selector;
        selectors[8] = PoolHandler.changeLimits.selector;
        result = new FuzzSelector[](1);
        result[0] = FuzzSelector(address(handler), selectors);
    }

    function targetArtifacts() external pure returns (string[] memory) {
        return new string[](0);
    }

    function excludeArtifacts() external pure returns (string[] memory) {
        return new string[](0);
    }

    function targetSenders() external pure returns (address[] memory) {
        return new address[](0);
    }

    function excludeSenders() external pure returns (address[] memory) {
        return new address[](0);
    }

    function excludeContracts() external pure returns (address[] memory) {
        return new address[](0);
    }

    function targetInterfaces() external pure returns (FuzzInterface[] memory) {
        return new FuzzInterface[](0);
    }

    function targetArtifactSelectors() external pure returns (FuzzArtifactSelector[] memory) {
        return new FuzzArtifactSelector[](0);
    }

    function excludeSelectors() external pure returns (FuzzSelector[] memory) {
        return new FuzzSelector[](0);
    }

    function invariantReservationsBackedAndReconcile() public view {
        SettlementPool pool = handler.pool();
        uint256 reserved;
        uint256 settled;
        uint256 count;
        for (uint256 i = 1; i < handler.nextId(); i++) {
            (,, SettlementPool.Status status, uint256 amount, bytes32 attempt, bytes32 ref) = pool.invoices(bytes32(i));
            if (status == SettlementPool.Status.Reserved) {
                reserved += amount;
                assertEq(pool.attemptInvoices(attempt), bytes32(i));
            }
            if (status == SettlementPool.Status.Settled) {
                settled += amount;
                count++;
                assertEq(pool.paymentInvoices(ref), bytes32(i));
                assertEq(pool.attemptInvoices(attempt), bytes32(i));
            }
        }
        assertEq(reserved, pool.reservedTotal());
        assertTrue(reserved <= pool.poolBalance());
        assertEq(pool.availableBalance() + reserved, pool.poolBalance());
        assertEq(settled, pool.totalSettled());
        assertEq(count, pool.settlementCount());
        assertEq(settled, handler.paid());
        assertEq(count, handler.paidCount());
        assertEq(handler.token().balanceOf(handler.MERCHANT()), settled);
        assertEq(pool.poolBalance() + settled + handler.withdrawals(), handler.deposits());
        assertTrue(pool.spentToday() + reserved <= pool.dailyLimit());
    }
}
