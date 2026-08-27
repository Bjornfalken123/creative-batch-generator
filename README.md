# Creative Batch Generator

An internal tool for converting a customer's SeenThis/Hawk JavaScript tag file into a completed `BatchUploadCreatives.xlsx`.

The UI is Hawk-inspired: dark navy foundation, turquoise accent, large typography and clean operational workspaces.

## What it does

- Reads both the file-level campaign header comment and the comments directly before each `<script>` block.
- Reads width/height from `data-width` / `data-height`, with the comment as fallback.
- Reads IAB categories, creative types, ad servers and valid creative sizes directly from the Excel template.
- Auto-generates creative names in two modes: full name from the script comment, or campaign header + size when the script comment contains only a dimension.
- Does not use special size mapping or fall back to a nearby size.
- `980x240` and `1080x1920` work automatically once they exist in the template dropdown.
- If a dimension is missing from the template, the row gets a warning and is automatically excluded. Other valid creatives can still be exported.
- Can URL-encode the Landing Page and replace the URL after `${HAWK_CLICK}` in each SeenThis script.
- Modifies the real `.xlsx` template in the browser while preserving the rest of the workbook structure.
- Customer files are never uploaded to a server.

## Local development

Requires Node.js.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Output is written to `dist/`.

## Template

The app uses:

`public/BatchUploadCreatives-template.xlsx`

When Hawk provides an updated template, replace that file and keep the exact same filename. The app reads the size dropdown dynamically every time it loads.

The workbook is expected to keep these sheets:

- `creatives`
- `validation`
- `data`
- `metadata`

## Cloudflare

The project is configured for Cloudflare Workers Static Assets through `wrangler.jsonc`.

```bash
npm run deploy
```

For step-by-step GitHub + Cloudflare setup, see **SETUP_CHECKLIST.md**.

## Security / data

All parsing and Excel generation happen client-side in the browser. The customer's script file is not sent to Cloudflare or any external backend by the app.
