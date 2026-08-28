# Creative Batch Generator

Browser-based tool for turning customer ad deliveries into the Hawk `BatchUploadCreatives.xlsx` template.

## Supported inputs

Just upload the file — the source is detected automatically.

- SeenThis TXT / HTML / JS tags
- Adform TXT tag sheets
- Google Campaign Manager XLS / XLSX
- HTML5 ZIP bundles, including bundles containing several nested creative ZIPs

## Automated fields

The app attempts to detect automatically:

- source / ad server
- creative name
- width and height
- Creative Type
- tag or HTML content
- landing page when available

Creative Type is written per row:

- JavaScript tag sources → `javascript`
- normal HTML5 ZIP → `html`
- MRAID / ORMMA → matching template type when confidently detected

Only IAB Category and campaign-level values that cannot be reliably inferred remain manual.

## HTML5 ZIP

HTML5 ZIP is treated as HTML, not converted into JavaScript. The original `index.html` is placed in the creative content field when it can safely work as a single-cell HTML creative.

If the HTML depends on local package assets, exceeds Excel's cell limit, has an unsupported size, or has an unresolved MRAID version, that row is excluded while valid rows remain exportable.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Cloudflare

The repository includes `wrangler.jsonc`. Connect the GitHub repository to Cloudflare Workers and deploy using:

```text
Build command: npm run build
Deploy command: npx wrangler deploy
```
