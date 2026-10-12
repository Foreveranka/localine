// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {SettlementPool} from "../src/SettlementPool.sol";
import {MockUSDC, TokenHook} from "./MockUSDC.sol";
import {TestBase} from "./TestBase.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WrongDecimals is ERC20 {
    constructor() ERC20("Wrong", "WRONG") {}
}

contract ReentrantOperator is TokenHook {
    SettlementPool public pool;

    function setPool(SettlementPool p) external {
        pool = p;
    }

    function reserve(bytes32 id, bytes32 attempt) external {
        pool.reserve(id, attempt);
    }

    function settle(bytes32 id, bytes32 attempt, bytes32 ref) external {
        pool.settle(id, attempt, ref);
    }

    function onTokenTransfer() external {
        pool.release(bytes32(uint256(1)), bytes32(uint256(101)));
    }
}

contract SettlementPoolTest is TestBase {
    MockUSDC internal token;
    SettlementPool internal pool;
    address internal constant MANAGER = address(0x1001);
    address internal constant OPERATOR = address(0x1002);
    address internal constant MERCHANT = address(0x1003);
    address internal constant STRANGER = address(0x1004);
    bytes32 internal constant ID = bytes32(uint256(1));
    bytes32 internal constant ATTEMPT = bytes32(uint256(101));
    bytes32 internal constant REF = bytes32(uint256(201));
    uint256 internal constant UNIT = 1e6;

    function setUp() public {
        vm.warp(1_800_000_000);
        token = new MockUSDC();
        pool = new SettlementPool(address(token), address(this), MANAGER, OPERATOR, 15 * UNIT, 30 * UNIT);
        token.mint(address(this), 100 * UNIT);
        token.approve(address(pool), type(uint256).max);
        pool.fund(50 * UNIT);
    }

    function register(bytes32 id, uint256 amount) internal {
        vm.prank(MANAGER);
        pool.registerInvoice(id, MERCHANT, amount, uint64(block.timestamp + 1800));
    }

    function reserve(bytes32 id, bytes32 attempt) internal {
        vm.prank(OPERATOR);
        pool.reserve(id, attempt);
    }

    function settle(bytes32 id, bytes32 attempt, bytes32 ref) internal {
        vm.prank(OPERATOR);
        pool.settle(id, attempt, ref);
    }

    function state(bytes32 id) internal view returns (SettlementPool.Status s) {
        (,, s,,,) = pool.invoices(id);
    }

    function testFullAmountPaidOnce() public {
        register(ID, 5 * UNIT);
        reserve(ID, ATTEMPT);
        assertEq(pool.reservedTotal(), 5 * UNIT);
        assertEq(pool.availableBalance(), 45 * UNIT);
        settle(ID, ATTEMPT, REF);
        assertEq(token.balanceOf(MERCHANT), 5 * UNIT);
        assertEq(pool.poolBalance(), 45 * UNIT);
        assertEq(pool.reservedTotal(), 0);
        assertEq(pool.totalSettled(), 5 * UNIT);
        assertEq(pool.settlementCount(), 1);
        assertEq(pool.paymentInvoices(REF), ID);
        assertEq(uint256(state(ID)), uint256(SettlementPool.Status.Settled));
        vm.expectRevert(SettlementPool.InvalidStatus.selector);
        settle(ID, ATTEMPT, bytes32(uint256(202)));
    }

    function testReserveBeforeSettlementRequired() public {
        register(ID, UNIT);
        vm.expectRevert(SettlementPool.InvalidStatus.selector);
        settle(ID, ATTEMPT, REF);
    }

    function testInvoiceCannotBeOverwritten() public {
        register(ID, UNIT);
        vm.expectRevert(SettlementPool.DuplicateInvoice.selector);
        register(ID, 2 * UNIT);
    }

    function testRecipientAndAmountStayCommitted() public {
        register(ID, 7 * UNIT);
        reserve(ID, ATTEMPT);
        (address recipient,,, uint256 amount,,) = pool.invoices(ID);
        assertEq(recipient, MERCHANT);
        assertEq(amount, 7 * UNIT);
        settle(ID, ATTEMPT, REF);
        assertEq(token.balanceOf(MERCHANT), 7 * UNIT);
    }

    function testUnauthorizedManagerAndOperator() public {
        vm.expectRevert(SettlementPool.Unauthorized.selector);
        vm.prank(STRANGER);
        pool.registerInvoice(ID, MERCHANT, UNIT, uint64(block.timestamp + 1));
        register(ID, UNIT);
        vm.expectRevert(SettlementPool.Unauthorized.selector);
        vm.prank(MANAGER);
        pool.reserve(ID, ATTEMPT);
        reserve(ID, ATTEMPT);
        vm.expectRevert(SettlementPool.Unauthorized.selector);
        vm.prank(MANAGER);
        pool.settle(ID, ATTEMPT, REF);
        vm.expectRevert(SettlementPool.Unauthorized.selector);
        vm.prank(STRANGER);
        pool.release(ID, ATTEMPT);
    }

    function testOwnerPrivilegesNotGivenToOperator() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OPERATOR));
        vm.prank(OPERATOR);
        pool.withdraw(UNIT, OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OPERATOR));
        vm.prank(OPERATOR);
        pool.setRoles(OPERATOR, OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OPERATOR));
        vm.prank(OPERATOR);
        pool.setLimits(100 * UNIT, 100 * UNIT);
    }

    function testWithdrawDoesNotConsumeReservations() public {
        register(ID, 15 * UNIT);
        reserve(ID, ATTEMPT);
        vm.expectRevert(SettlementPool.InsufficientAvailableFunds.selector);
        pool.withdraw(36 * UNIT, address(this));
        pool.withdraw(35 * UNIT, address(this));
        assertEq(pool.availableBalance(), 0);
        settle(ID, ATTEMPT, REF);
        assertEq(token.balanceOf(MERCHANT), 15 * UNIT);
    }

    function testInsufficientLiquidityCannotReserve() public {
        pool.withdraw(50 * UNIT, address(this));
        register(ID, UNIT);
        vm.expectRevert(SettlementPool.InsufficientAvailableFunds.selector);
        reserve(ID, ATTEMPT);
    }

    function testDailyCapacityReservedBeforeFiatCharge() public {
        register(ID, 15 * UNIT);
        register(bytes32(uint256(2)), 15 * UNIT);
        register(bytes32(uint256(3)), UNIT);
        reserve(ID, ATTEMPT);
        reserve(bytes32(uint256(2)), bytes32(uint256(102)));
        assertEq(pool.remainingDailyCapacity(), 0);
        vm.expectRevert(SettlementPool.DailyLimit.selector);
        reserve(bytes32(uint256(3)), bytes32(uint256(103)));
        settle(ID, ATTEMPT, REF);
        assertEq(pool.spentToday(), 15 * UNIT);
        assertEq(pool.remainingDailyCapacity(), 0);
    }

    function testOutstandingReservationsCarryToNextDay() public {
        register(ID, 15 * UNIT);
        register(bytes32(uint256(2)), 15 * UNIT);
        reserve(ID, ATTEMPT);
        reserve(bytes32(uint256(2)), bytes32(uint256(102)));
        vm.warp(block.timestamp + 1 days);
        assertEq(pool.remainingDailyCapacity(), 0);
        settle(ID, ATTEMPT, REF);
        settle(bytes32(uint256(2)), bytes32(uint256(102)), bytes32(uint256(202)));
        assertEq(pool.spentToday(), 30 * UNIT);
        vm.warp(block.timestamp + 1 days);
        assertEq(pool.spentToday(), 0);
        assertEq(pool.remainingDailyCapacity(), 30 * UNIT);
    }

    function testCannotReduceDailyLimitBelowCommitments() public {
        register(ID, 15 * UNIT);
        reserve(ID, ATTEMPT);
        vm.expectRevert(SettlementPool.DailyLimit.selector);
        pool.setLimits(UNIT, 14 * UNIT);
        settle(ID, ATTEMPT, REF);
        vm.expectRevert(SettlementPool.DailyLimit.selector);
        pool.setLimits(UNIT, 14 * UNIT);
    }

    function testReducedSingleLimitKeepsExistingReservationPayable() public {
        register(ID, 15 * UNIT);
        reserve(ID, ATTEMPT);
        pool.setLimits(UNIT, 30 * UNIT);
        settle(ID, ATTEMPT, REF);
        assertEq(token.balanceOf(MERCHANT), 15 * UNIT);
    }

    function testReducedSingleLimitBlocksNewReservation() public {
        register(ID, 15 * UNIT);
        pool.setLimits(UNIT, 30 * UNIT);
        vm.expectRevert(SettlementPool.PaymentLimit.selector);
        reserve(ID, ATTEMPT);
    }

    function testExpiredOpenInvoiceCannotReserve() public {
        register(ID, UNIT);
        vm.warp(block.timestamp + 1800);
        vm.expectRevert(SettlementPool.InvoiceExpired.selector);
        reserve(ID, ATTEMPT);
    }

    function testReservedFundsDoNotExpireAndCanSettleLate() public {
        register(ID, UNIT);
        reserve(ID, ATTEMPT);
        vm.warp(block.timestamp + 3600);
        assertEq(pool.reservedTotal(), UNIT);
        settle(ID, ATTEMPT, REF);
        assertEq(token.balanceOf(MERCHANT), UNIT);
    }

    function testReleaseDoesNotReuseAttemptAndStaleReleaseRejected() public {
        register(ID, UNIT);
        reserve(ID, ATTEMPT);
        vm.prank(OPERATOR);
        pool.release(ID, ATTEMPT);
        assertEq(pool.reservedTotal(), 0);
        vm.expectRevert(SettlementPool.DuplicateAttempt.selector);
        reserve(ID, ATTEMPT);
        bytes32 next = bytes32(uint256(102));
        reserve(ID, next);
        vm.expectRevert(SettlementPool.WrongAttempt.selector);
        vm.prank(OPERATOR);
        pool.release(ID, ATTEMPT);
        vm.expectRevert(SettlementPool.WrongAttempt.selector);
        settle(ID, ATTEMPT, REF);
        settle(ID, next, REF);
    }

    function testDuplicateAttemptAcrossInvoicesRejected() public {
        register(ID, UNIT);
        register(bytes32(uint256(2)), UNIT);
        reserve(ID, ATTEMPT);
        vm.expectRevert(SettlementPool.DuplicateAttempt.selector);
        reserve(bytes32(uint256(2)), ATTEMPT);
    }

    function testDuplicatePaymentReferenceAcrossInvoicesRejected() public {
        register(ID, UNIT);
        register(bytes32(uint256(2)), UNIT);
        reserve(ID, ATTEMPT);
        reserve(bytes32(uint256(2)), bytes32(uint256(102)));
        settle(ID, ATTEMPT, REF);
        vm.expectRevert(SettlementPool.DuplicatePayment.selector);
        settle(bytes32(uint256(2)), bytes32(uint256(102)), REF);
        assertEq(pool.reservedTotal(), UNIT);
        assertEq(pool.settlementCount(), 1);
    }

    function testCancelledInvoiceCannotBePaidOrReRegistered() public {
        register(ID, UNIT);
        vm.prank(MANAGER);
        pool.cancelInvoice(ID);
        vm.expectRevert(SettlementPool.InvalidStatus.selector);
        reserve(ID, ATTEMPT);
        vm.expectRevert(SettlementPool.DuplicateInvoice.selector);
        register(ID, UNIT);
    }

    function testReservedInvoiceCannotBeCancelled() public {
        register(ID, UNIT);
        reserve(ID, ATTEMPT);
        vm.expectRevert(SettlementPool.InvalidStatus.selector);
        vm.prank(MANAGER);
        pool.cancelInvoice(ID);
    }

    function testPauseStopsPayoutAndNewOrdersButAllowsRecovery() public {
        register(ID, UNIT);
        reserve(ID, ATTEMPT);
        vm.prank(OPERATOR);
        pool.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        settle(ID, ATTEMPT, REF);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        register(bytes32(uint256(2)), UNIT);
        vm.prank(OPERATOR);
        pool.release(ID, ATTEMPT);
        pool.withdraw(UNIT, address(this));
        pool.fund(UNIT);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        reserve(ID, bytes32(uint256(102)));
        pool.unpause();
        reserve(ID, bytes32(uint256(102)));
        settle(ID, bytes32(uint256(102)), REF);
    }

    function testOperatorCannotUnpauseAndStrangerCannotPause() public {
        vm.expectRevert(SettlementPool.Unauthorized.selector);
        vm.prank(STRANGER);
        pool.pause();
        pool.pause();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OPERATOR));
        vm.prank(OPERATOR);
        pool.unpause();
    }

    function testRotatedOperatorRecoversReservationAndOldOperatorRevoked() public {
        register(ID, UNIT);
        reserve(ID, ATTEMPT);
        pool.setRoles(MANAGER, STRANGER);
        vm.expectRevert(SettlementPool.Unauthorized.selector);
        settle(ID, ATTEMPT, REF);
        vm.prank(STRANGER);
        pool.settle(ID, ATTEMPT, REF);
    }

    function testOwnershipRequiresAcceptanceAndCannotBeRenounced() public {
        pool.transferOwnership(STRANGER);
        assertEq(pool.owner(), address(this));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OPERATOR));
        vm.prank(OPERATOR);
        pool.acceptOwnership();
        vm.prank(STRANGER);
        pool.acceptOwnership();
        assertEq(pool.owner(), STRANGER);
        vm.expectRevert(SettlementPool.OwnershipRequired.selector);
        vm.prank(STRANGER);
        pool.renounceOwnership();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        pool.withdraw(UNIT, address(this));
    }

    function testInvalidParametersRejected() public {
        vm.expectRevert(SettlementPool.InvalidId.selector);
        register(bytes32(0), UNIT);
        vm.expectRevert(SettlementPool.InvalidAmount.selector);
        register(ID, 0);
        vm.expectRevert(SettlementPool.PaymentLimit.selector);
        register(ID, 16 * UNIT);
        vm.expectRevert(SettlementPool.InvalidExpiry.selector);
        vm.prank(MANAGER);
        pool.registerInvoice(ID, MERCHANT, UNIT, uint64(block.timestamp));
        vm.expectRevert(SettlementPool.InvalidAddress.selector);
        vm.prank(MANAGER);
        pool.registerInvoice(ID, address(pool), UNIT, uint64(block.timestamp + 100));
        vm.expectRevert(SettlementPool.InvalidAddress.selector);
        pool.setRoles(address(0), OPERATOR);
        vm.expectRevert(SettlementPool.InvalidAmount.selector);
        pool.setLimits(2, 1);
        vm.expectRevert(SettlementPool.InvalidAmount.selector);
        pool.fund(0);
        vm.expectRevert(SettlementPool.InvalidAddress.selector);
        pool.withdraw(UNIT, address(0));
        register(ID, UNIT);
        vm.expectRevert(SettlementPool.InvalidId.selector);
        reserve(ID, bytes32(0));
        reserve(ID, ATTEMPT);
        vm.expectRevert(SettlementPool.InvalidId.selector);
        settle(ID, ATTEMPT, bytes32(0));
    }

    function testConstructorRejectsNoCodeAndWrongDecimals() public {
        vm.expectRevert(SettlementPool.InvalidToken.selector);
        new SettlementPool(STRANGER, address(this), MANAGER, OPERATOR, UNIT, UNIT);
        WrongDecimals wrong = new WrongDecimals();
        vm.expectRevert(SettlementPool.InvalidToken.selector);
        new SettlementPool(address(wrong), address(this), MANAGER, OPERATOR, UNIT, UNIT);
    }

    function testTransferFailureRollsBackSettlementAndReference() public {
        register(ID, UNIT);
        reserve(ID, ATTEMPT);
        token.configure(true, false, address(0));
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token)));
        settle(ID, ATTEMPT, REF);
        assertEq(pool.reservedTotal(), UNIT);
        assertEq(pool.paymentInvoices(REF), bytes32(0));
        assertEq(pool.totalSettled(), 0);
        assertEq(uint256(state(ID)), uint256(SettlementPool.Status.Reserved));
        token.configure(false, false, address(0));
        settle(ID, ATTEMPT, REF);
    }

    function testFeeTokenCannotUnderpayMerchant() public {
        register(ID, UNIT);
        reserve(ID, ATTEMPT);
        token.configure(false, true, address(0));
        vm.expectRevert(SettlementPool.InexactTransfer.selector);
        settle(ID, ATTEMPT, REF);
        assertEq(token.balanceOf(MERCHANT), 0);
        assertEq(pool.reservedTotal(), UNIT);
    }

    function testFeeTokenCannotOverstateFunding() public {
        token.configure(false, true, address(0));
        vm.expectRevert(SettlementPool.InexactTransfer.selector);
        pool.fund(UNIT);
        assertEq(pool.poolBalance(), 50 * UNIT);
    }

    function testReentrantOperatorCannotReleaseFundsDuringPayout() public {
        ReentrantOperator attacker = new ReentrantOperator();
        attacker.setPool(pool);
        pool.setRoles(MANAGER, address(attacker));
        register(ID, UNIT);
        attacker.reserve(ID, ATTEMPT);
        token.configure(false, false, address(attacker));
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        attacker.settle(ID, ATTEMPT, REF);
        assertEq(pool.reservedTotal(), UNIT);
        assertEq(pool.paymentInvoices(REF), bytes32(0));
    }

    function testFuzzFullAmountAndDuplicateProtection(uint256 seed) public {
        uint256 amount = seed % (15 * UNIT) + 1;
        register(ID, amount);
        reserve(ID, ATTEMPT);
        settle(ID, ATTEMPT, REF);
        assertEq(token.balanceOf(MERCHANT), amount);
        assertEq(pool.reservedTotal(), 0);
        vm.expectRevert(SettlementPool.InvalidStatus.selector);
        settle(ID, ATTEMPT, REF);
    }

    function testFuzzReservedFundsCannotBeWithdrawn(uint256 seed) public {
        uint256 amount = seed % (15 * UNIT) + 1;
        register(ID, amount);
        reserve(ID, ATTEMPT);
        pool.withdraw(50 * UNIT - amount, address(this));
        assertEq(pool.poolBalance(), amount);
        assertEq(pool.availableBalance(), 0);
        vm.expectRevert(SettlementPool.InsufficientAvailableFunds.selector);
        pool.withdraw(1, address(this));
        settle(ID, ATTEMPT, REF);
        assertEq(token.balanceOf(MERCHANT), amount);
    }
}
