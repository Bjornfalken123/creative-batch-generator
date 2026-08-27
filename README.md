# Creative Batch Generator

A browser-based internal tool for turning customer ad-tag deliveries into a Hawk `BatchUploadCreatives.xlsx` file.

## Supported sources

### SeenThis
- Input: `.txt`, `.html`, `.js`
- Reads per-tag comments, file campaign header, `data-width`, `data-height` and SeenThis script.
- Supports the special `100vw` / `100vh` case by using the size from the comment.
- Can replace the SeenThis `${HAWK_CLICK}` destination with the URL-encoded Landing Page.

### Adform
- Input: `.txt`, `.html`
- Reads blocks formatted as `Tag N. Creative name (... Size: WxH ...)`.
- Uses the Tag header as Creative Name.
- Preserves the supplied JavaScript + noscript block unchanged.

### Google Campaign Manager
- Input: `.xls`, `.xlsx`
- Scans sheets for Campaign Manager columns instead of requiring a fixed sheet name.
- Uses `Creative Name` first, then `Ad Name`, then `Placement Name` as fallback.
- Uses `Dimensions` for size.
- Uses `Impression Tag (JavaScript)` as the exported tag.
- Requires the `xlsx` npm package to read legacy `.xls` files in the browser.

## Size validation

The app reads valid creative sizes directly from `public/BatchUploadCreatives-template.xlsx`.

- If a size exists in the template: the creative is included by default.
- If a size is missing: the row is marked as missing and automatically excluded.
- Missing sizes do not block export of other valid creatives.
- Replace the template file when Hawk adds new sizes such as `980x240` or `1080x1920`.

## Safety / privacy

All customer files are processed locally in the browser. No customer tag file is uploaded to a backend by this application.

## Development

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
