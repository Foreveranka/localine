# Localine product website

Live: https://localine.vercel.app

This standalone website introduces Localine separately from the payment demo at https://shopinbit-monad.vercel.app/app. It includes a landing page, shopper setup guide, business services, documentation and roadmap in English, Turkish, French, Spanish and German.

## Build and preview

No package dependencies are required. With Node.js 22+ and Python 3 installed, run:

```sh
cd website
npm run build
npm run dev
```

Visit http://127.0.0.1:4184/en/ or replace `en` with `tr`, `fr`, `es` or `de`. The local static server does not execute Vercel middleware; automatic IP selection is verified on the hosted deployment.

`build.mjs` generates `dist/` from the content and translation sources. `source-strings.json` is the stable English key list for `translations.tsv`; do not reorder keys without updating their translation IDs. New strings can use `translations-extra.json`. Missing translations fail the build.

## Language routing

`middleware.js` runs for entry URLs without a locale. It uses Vercel's `x-vercel-ip-country` header, not a third-party IP lookup. Türkiye selects Turkish; configured French-speaking countries select French; Germany, Austria, Liechtenstein and Switzerland select German; configured Spanish-speaking countries select Spanish. Other or unknown countries select English. Country is a default, not a guarantee of the visitor's language.

The public `/locale` middleware endpoint returns only `{language}` based on the IP country, without redirecting or returning an IP address. The extension uses it with omitted credentials and falls back to the browser language if it fails.

The language menu keeps the current page and remembers the selected language in a non-sensitive preference cookie. Explicit localized URLs remain stable. Redirect responses are private and uncached so one visitor's country does not determine another visitor's language. The application does not persist IP addresses or request browser location permission.

## Extension distribution

The download is `downloads/localine-extension.zip`. From the repository root, run `node scripts/package-extension.mjs` after extension changes; it updates both this download and the demo application's package. The website build copies the checked-in download into its output. Browser installation is manual; the extension is not listed in the Chrome Web Store.

## Hosting

This folder is independently deployed to Vercel project `localine` under the existing project owner. Its ignored `.vercel/` link is separate from the parent Next.js application. No database, PSP credentials or pool signing keys are required for this website. Build command: `node build.mjs`; output: `dist`.
