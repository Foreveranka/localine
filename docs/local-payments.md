# Local payment sandbox

The live demo is https://shopinbit-monad.vercel.app. It uses Monad **testnet**, chain 10143, Circle test USDC and iyzico **sandbox** only. The demo conversion is **45 TRY per USDC**, with **2% added to the payer's TRY charge**. A 3 USDC invoice charges 137.70 TRY and transfers the full 3 USDC to the merchant.

## Flow

1. The storefront creates an authoritative invoice and a private recovery capability. The extension reads that invoice through the server; it does not select an address from the DOM.
2. The customer manually pastes the merchant address. The server checks it and the signed quote, then atomically locks the invoice to local payment. Wallet binding competes for the same lock.
3. A durable Vercel Workflow registers the immutable invoice and reserves its full USDC amount in the single prefunded SettlementPool. If liquidity is unavailable, no card checkout is opened.
4. The server creates one hosted iyzico Checkout Form. Card data stays at iyzico. Buyer/address fields are fictitious sandbox fixtures, not collected customer identity.
5. A callback merely returns the browser to the invoice. The worker independently retrieves the stored token and validates iyzico's HMAC response signature, invoice, TRY price, paid price, currency and approved fraud status.
6. The operator settles once. The server verifies the canonical finalized receipt, pool invoice, Settled event and exact USDC Transfer event before marking the order paid.

Contract: `0xac336b4e0ae0afac8e29fe0dc2488c66a17ea42d`.
Test merchant: `0xd022B96bAB53BbBfFBD9D185F5E4A8c4A3B6C2F0`.

## Replay and recovery

Orders, immutable quotes, card payment IDs and chain transactions are persisted in Postgres. Account leases serialize nonce preparation. Signed transaction bytes and hashes are saved **before** broadcast; retries rebroadcast the same bytes. Unique invoice, attempt, payment ID, payment reference and account/nonce constraints prevent duplicate settlement.

iyzico initialization and refund APIs are not assumed idempotent. Their claims are saved before requests. An ambiguous response enters `review` and preserves the reservation, rather than creating another checkout/refund. Transport errors and token-not-found responses are not proof that no card was charged. In a live Checkout Form session even a signed `FAILURE` can become `SUCCESS` after 3D Secure, as observed with the Troy sandbox test. It must not release the reservation. Unresolved sessions enter review after token expiry plus a reconciliation interval; they do not automatically free funds.

A payout can trigger an automatic full TRY refund only after a finalized revert or an unsent action that definitively failed. An ambiguous onchain transaction is reconciled, never refunded blindly. A confirmed refund is followed by release/cancellation. Unknown refund outcomes require provider reconciliation and remain reserved.

`review` is an operational hold, not a success state. Inspect `local_payments.issue`, provider payment records and the immutable `chain_transactions` journal before resolving one. Do not delete an attempt, reuse a PSP payment ID, change an invoice recipient or send a second nonce to “retry” a journaled transaction. Initialization with a lost response/token and unresolved refunds need provider-side confirmation; there is no customer or public “mark paid” endpoint.

Server environment: `DATABASE_URL`, `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL=https://sandbox-api.iyzipay.com`, `POOL_MANAGER_PRIVATE_KEY`, `POOL_OPERATOR_PRIVATE_KEY`. The owner/admin key is never deployed. Browser bundles and the extension contain no PSP or pool signing keys.

These are trusted-server fiat attestations backed by prefunded USDC. The pool cannot independently verify a bank payment or protect against later fiat chargebacks. This demo does not turn TRY into USDC through a live exchange. Production FX, real customer onboarding and PSP commercial requirements are outside this test integration.

## Validation

Run `npm run test:payments`, `node --test tests/checkout-reader.test.mjs`, and `npm run build`. Apply additive migrations using `node --env-file=.env.local scripts/migrate.mjs`. Package the extension using `node scripts/package-extension.mjs`.

For an operator-reviewed, unresolved capture with a stored token, `node scripts/reconcile-local-payment.mjs <invoice-id>` independently retrieves and validates the provider result before resuming the same signed transaction journal. It refuses ambiguous initialization or refund outcomes. It cannot fabricate a capture or alter the quote.

The live Troy/3D Secure test completed a **137.70 TRY** sandbox charge and a **3 USDC** finalized pool payout: [transaction proof](https://testnet.monadscan.com/tx/0xb78fd2a7277b2fcd7d8e6c3261f59c84ad03134516f68bb1076c1cfc8fbf2fff). Replayed callbacks did not increase the settlement count. The insufficient-liquidity case opened no card checkout; the recovery/refund case produced a signed full sandbox refund. Local proof files under `.local/` contain test results without credentials.

Official references: [CF initialize](https://docs.iyzico.com/odeme-metotlari/odeme-formu/cf-entegrasyonu/cf-baslatma), [CF retrieve](https://docs.iyzico.com/odeme-metotlari/odeme-formu/cf-entegrasyonu/cf-sorgulama), [response signatures](https://docs.iyzico.com/en/advanced/response-signature-validation), [idempotency](https://docs.iyzico.com/en/getting-started/preliminaries/idempotency), [sandbox test cards](https://docs.iyzico.com/en/add-ons/test-cards).
