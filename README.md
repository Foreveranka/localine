# ShopinBit Monad — Vercel

Vercel / Next.js deployment of the independent ShopinBit demo. Monad Testnet 10143, official Circle test USDC. Original Sites version is preserved at /Users/mete/sites/shopinbit-monad.

Neon Postgres stores invoices, their hashed access keys and unique payment transaction hashes. DATABASE_URL is provisioned through the Vercel Marketplace; never commit .env.local.

Invoices are prepared at quote review without requiring a customer wallet. The server calculates the amount from the catalog; it ignores client-supplied amounts. Existing direct wallet payments bind a payer once, atomically, before the transfer. Old paid invoices remain valid.

`GET /api/orders/:id/payment-request` requires the invoice-specific `x-order-key` capability. It returns only the token, network, integer USDC amount, recipient, expiry and exact transfer instructions. Paid and expired invoices are rejected; no customer request details or keys are included. The API has no shared public merchant credential.

The MV3 checkout reader in `extension/` reads one checkout marker on the active `/app` tab, then obtains the amount from the configured demo server, never from page text or a manually entered amount. It only supports `https://shopinbit-monad.vercel.app/app` and the local preview `http://127.0.0.1:4173/app`. The user pastes the recipient manually; a mismatch with the server's invoice stops the flow. Confirmation re-reads both the active invoice and server response. It does not charge fiat or send tokens yet. It is not published in the Chrome Web Store.

Build the ZIP with `node scripts/package-extension.mjs`. To try it, extract `public/monad-checkout-extension.zip`, use Chrome's Extensions page to load that directory as an unpacked extension, open a demo checkout and press **Faturayı oku**. Copy the demo merchant address from the site's payment details and paste it into the extension. No wallet permission is requested by the extension; the site's direct crypto checkout is separate. Session data stays in the popup and disappears when closed.

Verification: `node tests/checkout-reader.test.mjs` plus the existing TypeScript payment tests. The reader deliberately relies on the known server over HTTPS; it does not claim a merchant signature, arbitrary-site support or safety if that server/extension/browser is compromised.

Run npm run dev, npm run build and npm run check. Schema initialization: node --env-file=.env.local scripts/migrate.mjs. Vercel: vercel deploy --prod.
