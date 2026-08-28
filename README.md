# Creative Batch Generator

Internal browser-based tool for converting customer ad-tag deliveries into a Hawk `BatchUploadCreatives.xlsx` file.

## Supported sources

### SeenThis
- Input: `.txt`, `.html`, `.js`
- Reads file-level campaign comments and per-tag comments.
- Reads numeric `data-width` / `data-height` when available.
- Falls back to the comment dimension for `100vw` / `100vh` creatives.
- Builds a reviewable Creative Name from the customer naming structure.
- Can replace the SeenThis `${HAWK_CLICK}` destination with the URL-encoded Landing Page.

### Adform
- Input: `.txt`, `.html`
- Reads `Tag N. Creative name (... Size: WxH ...)` blocks.
- Creative Name is taken from the Adform Tag header.
- Size is taken from `Size: WxH`.
- Preserves the supplied `<script>` + optional `<noscript>` block unchanged.
- AdServer defaults to `Adform`.

### Google Campaign Manager
- Input: `.xls`, `.xlsx`
- Scans for a Campaign Manager tag-sheet header instead of requiring one fixed sheet name.
- Name priority: `Creative Name` → `Ad Name` → `Placement Name`.
- Size comes from `Dimensions` / `Size`.
- Prefers a standard `JavaScript Tag` column. If only `Impression Tag (JavaScript)` exists, it is accepted but clearly warned.
- Tracking-only tags such as `trackimpj` are excluded by default.
- AdServer defaults to `DCM`.
- Uses SheetJS CE 0.20.3 from the official SheetJS distribution rather than the outdated npm-registry build.


### HTML5 ZIP
- Input: `.zip`
- Supports a single HTML5 creative ZIP (`manifest.json` + `index.html`) or a bundle containing multiple nested creative ZIPs.
- Reads width / height and clicktags from `manifest.json`, with `<meta name="ad.size">` as a dimension fallback.
- Converts compatible self-contained / remotely hosted HTML5 creatives into an inline JavaScript iframe tag for the Hawk template.
- A single detected click destination can optionally be rewritten to `${HAWK_CLICK}` + URL-encoded Landing Page at export.
- Required local assets, oversized converted tags, malformed archives and unsafe/unsupported ZIP structures are warned and excluded instead of exported broken.
- ZIP content is unpacked only in the browser; customer creative files are not uploaded by the app.

## Size validation

Valid sizes are read directly from `public/BatchUploadCreatives-template.xlsx`.

- Unique template match → included by default.
- Missing size → warned and excluded automatically.
- Multiple template choices for the same dimensions → no silent guess. The user must choose the correct template size on that row.
- Manually excluded rows never block export of valid rows.

This is important for dimensions such as `160x600`, where a template may contain separate desktop and smartphone options.

## Campaign settings safety

- `Creative Type` defaults to `javascript`.
- `AdServer` is automatically selected from the chosen source (`Other`, `Adform`, `DCM`). HTML5 ZIP defaults to `Other` because the output is a JavaScript wrapper.
- `IAB Category` must be explicitly selected for each imported file.
- `Landing Page` is cleared for each new import so a URL from a previous campaign cannot be reused accidentally.
- SeenThis can detect the original landing URL and populate it automatically. HTML5 ZIP does the same when all included packages expose one consistent click destination.
- Campaign-specific Landing Page and IAB Category are not persisted in local storage.

## Excel export

The app keeps the supplied Hawk workbook as the master template and only changes the creative rows plus the cached validation / metadata values required by the current template structure.

The export is limited to 200 included creatives, matching the current template. Creative names are validated against the template's 200-character limit.

## Privacy

Customer files are read locally in the browser. This project has no upload API and no application database.

## Development

Node 22 is recommended.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Cloudflare deploy:

```bash
npm run deploy
```

## Updating the Hawk template

Replace only:

`public/BatchUploadCreatives-template.xlsx`

Keep that filename unchanged. New size rows such as `980x240` and `1080x1920` will then be picked up automatically.
