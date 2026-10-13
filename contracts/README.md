# Monad testnet USDC settlement pool

One deployed application contract, `src/SettlementPool.sol`, holds prefunded USDC and combines immutable invoice details, liquidity reservations, payouts, replay protection, funding/withdrawals, separate roles, limits, pausing and two-step ownership. OpenZeppelin contracts are inherited into the same deployed bytecode; no separate registry, proxy or project token is deployed. The token is the existing official Circle test USDC, with 6 decimals.

The demo deployment and ABI are in `deployments/monad-testnet.json` and `deployments/SettlementPool.abi.json`. Service role wallets are TEST accounts, separate from customer and merchant wallets. Their private keys stay outside this repository. The deployment script refuses any RPC whose chain ID is not 10143 and records the signed deployment transaction before broadcasting, so an uncertain RPC response does not silently deploy a second pool.

## Payment sequence

1. The trusted invoice server checks the customer's manually pasted recipient against its own checkout invoice. It registers the same 32-byte invoice ID, recipient, integer USDC amount and Unix-seconds expiry through the invoice manager. Registration is permanent; the recipient and amount cannot be overwritten. The current website uses millisecond timestamps: explicitly convert its expiry to seconds when integrating.
2. The operator calls `reserve(invoiceId, attemptId)` **before** requesting a local PSP charge. This checks available liquidity, the per-payment cap and daily capacity. Wait for canonical `finalized` confirmation before starting the PSP charge. Insufficient liquidity/capacity means no charge.
3. The server verifies capture directly with the PSP. A redirect or browser success message is not proof of capture. Store the capture result, attempt ID, transaction hash/nonce and work item durably in Postgres. Do not expose service keys in the extension or browser.
4. After verified capture, call `settle(invoiceId, attemptId, paymentRef)`. `paymentRef` must be a consistently encoded, domain-separated hash of PSP provider, sandbox/production environment and captured payment ID, not raw customer/card data. The contract takes recipient and amount from the registered invoice; the operator cannot change either in the payout call. The merchant receives the entire USDC invoice amount; FX, local currency and the customer's additional commission belong to the server/PSP quote.
5. Verify the canonical finalized transaction, the pool's `Settled` event, its invoice/attempt/payment reference/recipient/amount and the official USDC `Transfer` from pool to recipient. Update the existing order atomically once. One invoice, one attempt ID and one captured payment reference cannot be settled twice.
6. If the charge definitely failed or was refunded with no crypto payout, the operator may `release` the reservation. Every used attempt ID stays consumed; a new attempt needs a new ID. A stale worker cannot release or settle a newer reservation. If desired, the invoice manager can permanently cancel an open invoice.

## Recovery and controls

- Reservations **never auto-expire**. An expired quote may already have an in-flight or captured fiat charge. A reserved invoice can therefore settle after quote expiry. An unreserved expired invoice cannot start a payment.
- A PSP timeout/unknown charge status keeps the reservation. Query the PSP before retrying or releasing. A chain timeout keeps the saved transaction hash/nonce; check both that transaction and invoice state at `finalized`. Never refund or broadcast another payout merely because polling timed out.
- Reserved principal cannot be withdrawn. Funding remains available while paused; owner withdrawals can only use unreserved funds. `release` and cancellation remain available for verified recovery while paused. The owner or payout operator may pause; only the owner may resume.
- The initial test caps are **15 USDC per reservation and 100 USDC of daily payouts plus outstanding reservations**. These are configurable test caps, not a business fee. Daily payouts reset at UTC midnight, but all pending reservations carry their capacity commitment across days. The owner cannot lower the daily cap below current commitments. Lowering the per-payment cap affects new reservations and does not strand an already approved reservation.
- Owner: roles, caps, unreserved withdrawals, resume, two-step ownership transfer. Invoice manager: registration/cancellation only. Operator: reserve/release/settle and pause. Changing roles preserves reserved invoices so a replacement operator can recover them. Ownership cannot be renounced; handing ownership to another address does not implicitly hand it either service role.
- SafeERC20, exact balance changes and reentrancy protection reject failed, no-op and fee-deducting token transfers. No function mints USDC, changes the token or upgrades the pool.

## Trust boundary and integration status

This is a custodial prefunded payment pool. The server/PSP, invoice manager and operator are trusted for correct invoice data and honest capture/refund decisions. The contract does not prove a card charge occurred, prevent a dishonest operator choosing a false payment reference, reverse a merchant's completed transfer, or protect the operator from later fiat chargebacks. The owner retains control over roles and unreserved liquidity. Keep the production owner separate from online service keys and use a suitable multisig before any mainnet deployment.

The website now connects iyzico sandbox capture to checkout-to-pool registration, reservations and finalized pool-event verification through a durable worker. Direct-wallet and local-payment modes share an atomic order/payment-method lock. The direct-wallet verifier remains separate: a pool payout calls the pool and sends from the pool, not the customer's wallet. See [`../docs/local-payments.md`](../docs/local-payments.md) for the integrated flow and recovery rules. The pool cannot prevent an unrelated direct transfer outside itself.

`deployments/monad-testnet-smoke.json` records the initial finalized USDC pool payout, protected reservation, unauthorized caller rejection and duplicate payout rejection. That initial smoke run simulated PSP capture; subsequent integrated tests used real iyzico sandbox sessions and official Circle test USDC. Its recorded 4 USDC remaining balance is historical, not a current balance. Live integration transaction proofs are linked in the root README.

## Build and verify

Use official Foundry **1.8 or newer**, Solidity 0.8.35 and the `network = "monad"` configuration. The checked-in npm lock pins OpenZeppelin 5.6.1 and viem 2.57.5. Dependencies are local to this contract package, not the website runtime.

```sh
cd contracts
npm ci --ignore-scripts
forge build
forge test
forge fmt --check
```

Tests include unauthorized roles, two-step ownership, immutable invoice data, reserves, daily-cap carryover, pause/recovery, failed or inexact transfers, reentrancy, invoice/attempt/payment-reference replay, two 256-run fuzz tests and 128 invariant runs of 64 random operations each.

To deploy a fresh test instance, explicitly point `POOL_KEY_FILE` at a local 0600 JSON with `admin`, `invoiceManager` and `operator`, each containing `address` and `privateKey`. The three service addresses must differ. Never paste those values into shell arguments or commit them. `npm run deploy:testnet` refuses to overwrite a recorded deployment. `FORGE_BIN` may select an isolated official Foundry binary for `npm run verify:testnet`. The verifier uploads public source to MonadVision's Sourcify service.

`scripts/smoke-testnet.mjs` is an explicitly gated test-token payout tool, not a PSP worker. It requires `POOL_SMOKE_TEST=1`, `POOL_KEY_FILE` and `TEST_MERCHANT_KEY_FILE`; it checks recorded roles/bytecode and current invoice state to prevent a repeated smoke payout. If the network response is uncertain, reconcile the recorded hashes and finalized state before rerunning it.

Official deployment/verification guidance: [Foundry on Monad](https://docs.monad.xyz/guides/deploy-smart-contract/foundry), [MonadVision source verification](https://docs.monad.xyz/guides/verify-smart-contract/foundry). Token reference: [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses).
