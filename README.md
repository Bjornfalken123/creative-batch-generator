# Creative Batch Generator

Internal browser tool for turning customer ad-tag deliveries into Hawk `BatchUploadCreatives.xlsx` files.

## What it does

1. Detects the uploaded source automatically.
2. Extracts creative name, dimensions and tag/script.
3. Matches dimensions against the current Hawk Excel template.
4. Auto-detects Creative Type (`javascript`) and AdServer where the source format is known.
5. Lets the operator review only exceptions such as missing/ambiguous sizes or fallback names.
6. Exports only included valid rows into the original Hawk template.

All customer-file processing happens locally in the browser. The application has no upload API or database.

## Supported production sources

| Source | Input | Name logic | Size logic | Default AdServer |
|---|---|---|---|---|
| SeenThis | `.txt`, `.html`, `.js` official tag export | Tag comment, then campaign header + size | `data-width`/`data-height`, with comment fallback for `100vw/100vh` exports | `Other` |
| Adform | `.txt` tag export | `Tag N.` header | `Size: WxH`, with image-dimension fallback | `Adform` |
| Google Campaign Manager | `.xls`, `.xlsx` tag sheet | Creative Name → Ad Name → Placement Name | Dimensions/Size column | `DCM` |

HTML5 ZIP is intentionally disabled. For SeenThis HTML5 packages, use the official SeenThis tag export.

## Safety rules

- Unknown dimensions are excluded; valid rows remain exportable.
- Dimensions that map to multiple Hawk size IDs require a manual row choice.
- Google tracking-only / impression-only rows are excluded by default.
- IAB Category requires an explicit valid Hawk category.
- SeenThis base destination URLs are shown as suggestions rather than silently becoming the final campaign Landing Page.
- The generator checks the Hawk template column layout before running. If the template schema changes, the app stops with a clear error instead of writing into the wrong columns.
- Export is limited by the row capacity read from the template itself (currently 200), not a hidden app constant.

## Development

Requirements: Node 22+

```bash
npm install
npm run dev
```

Type check:

```bash
npm run typecheck
```

Production build:

```bash
npm run build
```

Deploy to Cloudflare Workers:

```bash
npx wrangler deploy
```

See `SETUP_CHECKLIST.md` for the full GitHub/Cloudflare setup.
