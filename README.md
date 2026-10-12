# ShopinBit Monad — Vercel

Vercel / Next.js deployment of the independent ShopinBit demo. Monad Testnet 10143, official Circle test USDC. Original Sites version is preserved at /Users/mete/sites/shopinbit-monad.

Neon Postgres stores invoices, their hashed access keys and unique payment transaction hashes. All chain verification rules and the UI are unchanged. DATABASE_URL is provisioned through the Vercel Marketplace; never commit .env.local.

Run npm run dev, npm run build and npm run check. Schema initialization: node --env-file=.env.local scripts/migrate.mjs. Vercel: vercel deploy --prod.
