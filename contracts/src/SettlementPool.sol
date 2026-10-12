// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Prefunded USDC payments for server-verified local payment methods.
/// @dev The invoice manager commits authoritative checkout details. A separate operator
/// reserves liquidity BEFORE charging fiat and settles ONLY after server-side PSP verification.
/// Fiat capture, refunds and chargebacks cannot be verified by this contract.
/// Amounts are USDC base units (6 decimals). Fees are charged offchain to the customer;
/// the merchant always receives the full committed amount. No upgrade/proxy or mint authority.
contract SettlementPool is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open,
        Reserved,
        Settled,
        Cancelled
    }

    struct Invoice {
        address recipient;
        uint64 expiresAt;
        Status status;
        uint256 amount;
        bytes32 attemptId;
        bytes32 paymentRef;
    }

    IERC20 public immutable usdc;
    address public invoiceManager;
    address public operator;
    uint256 public maxPayment;
    uint256 public dailyLimit;
    uint256 public reservedTotal;
    uint256 public totalSettled;
    uint256 public settlementCount;
    uint256 private _spentDay;
    uint256 private _spent;

    mapping(bytes32 invoiceId => Invoice) public invoices;
    mapping(bytes32 attemptId => bytes32 invoiceId) public attemptInvoices;
    mapping(bytes32 paymentRef => bytes32 invoiceId) public paymentInvoices;

    event InvoiceRegistered(bytes32 indexed invoiceId, address indexed recipient, uint256 amount, uint64 expiresAt);
    event Reserved(bytes32 indexed invoiceId, bytes32 indexed attemptId, uint256 amount);
    event ReservationReleased(bytes32 indexed invoiceId, bytes32 indexed attemptId);
    event InvoiceCancelled(bytes32 indexed invoiceId);
    event Settled(
        bytes32 indexed invoiceId,
        bytes32 indexed paymentRef,
        address indexed recipient,
        bytes32 attemptId,
        uint256 amount
    );
    event Funded(address indexed sender, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event RolesChanged(address indexed invoiceManager, address indexed operator);
    event LimitsChanged(uint256 maxPayment, uint256 dailyLimit);

    error Unauthorized();
    error InvalidAddress();
    error InvalidToken();
    error InvalidId();
    error InvalidAmount();
    error InvalidExpiry();
    error InvalidStatus();
    error DuplicateInvoice();
    error DuplicateAttempt();
    error DuplicatePayment();
    error WrongAttempt();
    error InvoiceExpired();
    error PaymentLimit();
    error DailyLimit();
    error InsufficientAvailableFunds();
    error InexactTransfer();
    error OwnershipRequired();

    modifier onlyManager() {
        if (msg.sender != invoiceManager) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    constructor(
        address token,
        address admin,
        address manager,
        address payoutOperator,
        uint256 maxAmount,
        uint256 dayLimit
    ) Ownable(admin) {
        if (token.code.length == 0) revert InvalidToken();
        if (IERC20Metadata(token).decimals() != 6) revert InvalidToken();
        usdc = IERC20(token);
        _setRoles(manager, payoutOperator);
        _setLimits(maxAmount, dayLimit);
    }

    /// @dev Role changes leave existing reservations intact for recovery by the new operator.
    function setRoles(address manager, address payoutOperator) external onlyOwner {
        _setRoles(manager, payoutOperator);
    }

    function _setRoles(address manager, address payoutOperator) private {
        if (
            manager == address(0) || payoutOperator == address(0) || manager == address(this)
                || payoutOperator == address(this) || manager == address(usdc) || payoutOperator == address(usdc)
        ) {
            revert InvalidAddress();
        }
        invoiceManager = manager;
        operator = payoutOperator;
        emit RolesChanged(manager, payoutOperator);
    }

    /// @dev Existing reservations retain their single-payment approval. The daily cap
    /// cannot be lowered below funds already paid today plus ALL outstanding reservations.
    function setLimits(uint256 maxAmount, uint256 dayLimit) external onlyOwner {
        _setLimits(maxAmount, dayLimit);
    }

    function _setLimits(uint256 maxAmount, uint256 dayLimit) private {
        if (maxAmount == 0 || dayLimit < maxAmount) revert InvalidAmount();
        if (dayLimit < spentToday() + reservedTotal) revert DailyLimit();
        maxPayment = maxAmount;
        dailyLimit = dayLimit;
        emit LimitsChanged(maxAmount, dayLimit);
    }

    function pause() external {
        if (msg.sender != owner() && msg.sender != operator) revert Unauthorized();
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev A funded pool must never become ownerless.
    function renounceOwnership() public view override onlyOwner {
        revert OwnershipRequired();
    }

    /// @notice Register once from the trusted invoice server; the recipient/amount cannot be edited.
    function registerInvoice(bytes32 invoiceId, address recipient, uint256 amount, uint64 expiresAt)
        external
        onlyManager
        whenNotPaused
    {
        if (invoiceId == bytes32(0)) revert InvalidId();
        if (invoices[invoiceId].status != Status.None) revert DuplicateInvoice();
        if (recipient == address(0) || recipient == address(this) || recipient == address(usdc)) {
            revert InvalidAddress();
        }
        if (amount == 0) revert InvalidAmount();
        if (amount > maxPayment) revert PaymentLimit();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();
        invoices[invoiceId] = Invoice(recipient, expiresAt, Status.Open, amount, bytes32(0), bytes32(0));
        emit InvoiceRegistered(invoiceId, recipient, amount, expiresAt);
    }

    /// @notice Lock liquidity and daily capacity BEFORE the PSP is allowed to capture fiat.
    /// @dev Attempt IDs are permanent tombstones. An old retry cannot reuse an ID or release
    /// a later reservation. A reservation does NOT auto-expire: the PSP may have captured funds.
    function reserve(bytes32 invoiceId, bytes32 attemptId) external nonReentrant onlyOperator whenNotPaused {
        Invoice storage invoice = invoices[invoiceId];
        if (invoice.status != Status.Open) revert InvalidStatus();
        if (block.timestamp >= invoice.expiresAt) revert InvoiceExpired();
        if (attemptId == bytes32(0)) revert InvalidId();
        if (attemptInvoices[attemptId] != bytes32(0)) revert DuplicateAttempt();
        if (invoice.amount > maxPayment) revert PaymentLimit();
        if (invoice.amount > availableBalance()) revert InsufficientAvailableFunds();
        if (invoice.amount > remainingDailyCapacity()) revert DailyLimit();
        invoice.status = Status.Reserved;
        invoice.attemptId = attemptId;
        attemptInvoices[attemptId] = invoiceId;
        reservedTotal += invoice.amount;
        emit Reserved(invoiceId, attemptId, invoice.amount);
    }

    /// @notice Release ONLY after a definitively failed, never-captured or refunded fiat payment.
    /// @dev Kept available while paused for recovery. PSP/chain ambiguity is NOT a reason to release.
    function release(bytes32 invoiceId, bytes32 attemptId) external nonReentrant onlyOperator {
        Invoice storage invoice = _reservedInvoice(invoiceId, attemptId);
        reservedTotal -= invoice.amount;
        invoice.status = Status.Open;
        invoice.attemptId = bytes32(0);
        emit ReservationReleased(invoiceId, attemptId);
    }

    function cancelInvoice(bytes32 invoiceId) external onlyManager {
        Invoice storage invoice = invoices[invoiceId];
        if (invoice.status != Status.Open) revert InvalidStatus();
        invoice.status = Status.Cancelled;
        emit InvoiceCancelled(invoiceId);
    }

    /// @notice Pay the full committed USDC amount, once, after verified PSP capture.
    /// @param paymentRef Domain-separated hash of PSP + environment + captured payment ID.
    /// No card data, names or raw PSP references should be put onchain.
    /// @dev Reserved invoices can settle after expiry; fiat may have been captured before expiry.
    function settle(bytes32 invoiceId, bytes32 attemptId, bytes32 paymentRef)
        external
        nonReentrant
        onlyOperator
        whenNotPaused
    {
        Invoice storage invoice = _reservedInvoice(invoiceId, attemptId);
        if (paymentRef == bytes32(0)) revert InvalidId();
        if (paymentInvoices[paymentRef] != bytes32(0)) revert DuplicatePayment();
        uint256 amount = invoice.amount;
        uint256 today = block.timestamp / 1 days;
        if (_spentDay != today) {
            _spentDay = today;
            _spent = 0;
        }
        // Reserved capacity is carried across days and cannot be withdrawn or spent twice.
        if (_spent + amount > dailyLimit) revert DailyLimit();
        invoice.status = Status.Settled;
        invoice.paymentRef = paymentRef;
        paymentInvoices[paymentRef] = invoiceId;
        reservedTotal -= amount;
        _spent += amount;
        totalSettled += amount;
        settlementCount += 1;
        _transferExact(invoice.recipient, amount);
        emit Settled(invoiceId, paymentRef, invoice.recipient, attemptId, amount);
    }

    function _reservedInvoice(bytes32 invoiceId, bytes32 attemptId) private view returns (Invoice storage invoice) {
        invoice = invoices[invoiceId];
        if (invoice.status != Status.Reserved) revert InvalidStatus();
        if (invoice.attemptId != attemptId) revert WrongAttempt();
    }

    /// @notice Exact-transfer USDC funding; callers approve this contract first.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = usdc.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) revert InexactTransfer();
        emit Funded(msg.sender, amount);
    }

    function withdraw(uint256 amount, address recipient) external nonReentrant onlyOwner {
        if (recipient == address(0) || recipient == address(this) || recipient == address(usdc)) {
            revert InvalidAddress();
        }
        if (amount == 0) revert InvalidAmount();
        if (amount > availableBalance()) revert InsufficientAvailableFunds();
        _transferExact(recipient, amount);
        emit Withdrawn(recipient, amount);
    }

    function _transferExact(address recipient, uint256 amount) private {
        uint256 beforePool = usdc.balanceOf(address(this));
        uint256 beforeRecipient = usdc.balanceOf(recipient);
        usdc.safeTransfer(recipient, amount);
        uint256 afterPool = usdc.balanceOf(address(this));
        uint256 afterRecipient = usdc.balanceOf(recipient);
        if (
            afterPool > beforePool || beforePool - afterPool != amount || afterRecipient < beforeRecipient
                || afterRecipient - beforeRecipient != amount
        ) revert InexactTransfer();
    }

    function poolBalance() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function availableBalance() public view returns (uint256) {
        uint256 balance = poolBalance();
        return balance > reservedTotal ? balance - reservedTotal : 0;
    }

    function spentToday() public view returns (uint256) {
        return _spentDay == block.timestamp / 1 days ? _spent : 0;
    }

    function remainingDailyCapacity() public view returns (uint256) {
        uint256 committed = spentToday() + reservedTotal;
        return committed < dailyLimit ? dailyLimit - committed : 0;
    }
}
