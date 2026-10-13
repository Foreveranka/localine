# Localine

**Pay local. Shop global.**

Localine connects local payment methods to merchants accepting USDC on Monad. A shopper pays through a familiar local method without needing a crypto wallet, USDC holdings, or MON for gas; the merchant receives the full invoiced USDC amount from a prefunded settlement pool.

The current prototype demonstrates **TROY card payments through iyzico sandbox in Türkiye**. **PIX in Brazil and YAPE in Peru are planned integrations, not implemented features.** Local methods may already have international partnerships, but acceptance still depends on each merchant's payment infrastructure.

## Try the demo

- Introduction: https://shopinbit-monad.vercel.app
- Demo storefront: https://shopinbit-monad.vercel.app/app
- Extension: extract `public/monad-checkout-extension.zip` and load the extracted directory through Chrome's **Extensions → Developer mode → Load unpacked**. Alternatively, load this repository's `extension/` directory.
- Network: **Monad Testnet, chain ID 10143**. All card payments use **iyzico sandbox** and all USDC is **test USDC**.

The storefront is an independent ShopinBit-style demonstration, not an official ShopinBit integration or a merchant partnership. The extension currently supports this demo's `/app` checkout and `http://127.0.0.1:4173/app`, not arbitrary websites.

## Payment flow

1. Create a checkout invoice in the demo store. The server calculates its USDC amount from the catalog.
2. Open the extension and read the invoice. The amount comes from the server, never from editable page text. Manually paste the merchant recipient address shown in the checkout; a mismatch stops the flow.
3. Open the local payment checkout. It displays a **demo rate of 1 USDC = 45 TRY**, plus a **2% customer fee**. A 3 USDC purchase costs 137.70 TRY; the merchant receives all 3 USDC.
4. A durable worker registers the invoice and reserves liquidity onchain before opening the hosted sandbox card form. Card details stay with iyzico.
5. After independently verifying the provider's signed capture response, the worker settles the invoice. Canonical finalized contract state, settlement events and the exact USDC transfer are verified before the order becomes paid.

Background processing continues when the tab closes. A definitive payout failure triggers a full sandbox TRY refund; ambiguous card or chain outcomes enter reconciliation rather than triggering a blind retry. The original direct-wallet test USDC payment path is also available and shares an exclusive payment-method lock with local checkout.

## Contracts and transaction proof

| Item | Monad Testnet address |
| --- | --- |
| Single settlement pool | `0xac336b4e0ae0afac8e29fe0dc2488c66a17ea42d` |
| Official Circle test USDC, 6 decimals | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| Demo merchant | `0xd022B96bAB53BbBfFBD9D185F5E4A8c4A3B6C2F0` |

- [Finalized 3 USDC TROY sandbox settlement](https://testnet.monadscan.com/tx/0xb78fd2a7277b2fcd7d8e6c3261f59c84ad03134516f68bb1076c1cfc8fbf2fff)
- [Finalized 2 USDC settlement after a declined-card retry](https://testnet.monadscan.com/tx/0xfc8b048eae04027333b9bf338c45c204645fe877d861182247deedd125fd4784)
- Source, ABI and deployment metadata: [`contracts/`](contracts/).

## Run locally

Use Node.js 22 or newer and npm. Install dependencies with `npm ci`. Create an ignored `.env.local` with your own sandbox credentials and testnet service keys:

```dotenv
DATABASE_URL=<Neon pooled PostgreSQL connection string>
DATABASE_URL_UNPOOLED=<Neon direct PostgreSQL connection string for migrations>
IYZICO_API_KEY=<your sandbox API key>
IYZICO_SECRET_KEY=<your sandbox secret>
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
POOL_MANAGER_PRIVATE_KEY=<invoice-manager testnet private key>
POOL_OPERATOR_PRIVATE_KEY=<operator testnet private key>
```

For a fresh deployment, deploy your own pool and update the deployment metadata and merchant configuration. Your manager/operator keys must match that pool's recorded roles and have test MON for gas. Fund it with official test USDC. The published demo's service keys and database are intentionally not included.

```sh
node --env-file=.env.local scripts/migrate.mjs
npm run dev -- --port 4173
```

Open `http://127.0.0.1:4173`. Keep the introduction at `/` and the store at `/app`. When hosting at a different origin, update the extension's allowed origin and the application's origin checks together. For Vercel hosting, provision the environment variables server-side and deploy the Next.js application with its Workflow integration.

## Verification

```sh
npm run check
npm run test:payments
node --test tests/checkout-reader.test.mjs
npm run build
```

For the Solidity tests, use Foundry 1.8 or newer:

```sh
cd contracts
npm ci --ignore-scripts
forge test
```

Contract coverage includes role checks, immutable invoices, reservations, limits, pause/recovery, replay protection, fuzz tests and invariants. Live sandbox validation covered successful TROY/3DS payments, an insufficient-balance card retry, processing after closing the tab, duplicate callbacks, direct-wallet payments, and a full refund after a deliberately failed test payout. Extension controller tests are automated; a fully installed-extension browser test remains pending.

## Architecture and limitations

Next.js and React provide the storefront and checkout; Neon Postgres stores invoices and payment journals; Vercel Workflow coordinates iyzico and Monad transactions; viem interacts with the single Solidity settlement pool. Monad provides the USDC settlement layer, with finalized chain verification before payment completion.

This is a **testnet prototype**, not a production payment service. The backend and service roles attest to fiat capture; the contract cannot independently verify bank payments or prevent later card chargebacks. The pool is prefunded, with **no live TRY-to-USDC exchange**. Production onboarding, commercial PSP arrangements, abuse controls and operational monitoring remain future work.

See [`docs/local-payments.md`](docs/local-payments.md) for recovery behavior and [`contracts/README.md`](contracts/README.md) for contract controls.

## Attribution and development

The project was developed with AI-assisted coding and review. The local-payment backend, pool contract, extension and storefront are included in this repository; dependencies remain subject to their respective licenses. ShopinBit reference images, icons and branding are attributed in [`public/reference/README.md`](public/reference/README.md); their inclusion does not imply permission, ownership or endorsement. No license is granted by this repository over third-party assets.
