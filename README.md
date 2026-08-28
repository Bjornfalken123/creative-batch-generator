# Creative Batch Generator

Production-safe browser tool for converting customer ad-tag deliveries into Hawk `BatchUploadCreatives.xlsx`.

## Supported sources

- SeenThis tag exports (`.txt`, `.html`, `.js`)
- Adform tag exports (`.txt`)
- Google Campaign Manager tag sheets (`.xls`, `.xlsx`)

Source and Creative Type are detected automatically where possible. Unknown template sizes are excluded without blocking valid rows.

## HTML5 ZIP

HTML5 ZIP import is intentionally hidden/disabled in the production workflow. Testing showed that a ZIP package cannot reliably be converted into a Hawk batch Script/HTML payload without source-specific activation information. For SeenThis HTML5 packages, use the official SeenThis tag export instead.

If a `.zip` is dropped into the app, it will be rejected with a clear instruction rather than generating an unverified DSP payload.

## Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Deploy to Cloudflare Workers:

```bash
npx wrangler deploy
```
