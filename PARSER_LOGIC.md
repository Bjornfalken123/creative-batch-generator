# Parser Logic

All source parsers normalize customer deliveries to the same internal model:

- Creative Name
- Width / Height
- Dimension (`WxH`)
- Full source tag
- Source type
- Template-size candidates
- Selected Hawk size label
- Included / excluded state
- Review warnings

## Size resolution

1. Read all Hawk size labels and IDs from the current Excel template.
2. Group options by numeric dimensions.
3. No candidates: mark `missing`, exclude by default.
4. One logical candidate: select automatically.
5. Multiple labels with the same underlying ID: select the exact `WxH` label when available, otherwise the first alias.
6. Multiple different IDs for the same dimensions: mark `ambiguous`, do not guess, require a row-level user choice.

## SeenThis

1. Find each SeenThis `<script>` and its immediately preceding HTML comment.
2. Use numeric `data-width` / `data-height` when present.
3. For `100vw` / `100vh`, use the dimension in the comment.
4. If comment and script disagree, warn and use the numeric script dimension.
5. Naming:
   - Semantic local comment → remove account prefix and duplicate dimension suffix.
   - Size-only local comment → file-level campaign header + size.
   - No reliable metadata → fallback name + review warning.
6. Preserve the supplied script/comment structure.
7. Optional SeenThis-only `${HAWK_CLICK}` replacement uses `encodeURIComponent(Landing Page)`.

## Adform

Expected header:

`Tag 1. ROT_320x100_azerion_eng (Media: Azerion, ... Size: 320x100, Type: rotator)`

1. Each `Tag N.` header starts a block.
2. Name = text after `Tag N.` and before the metadata parenthesis.
3. Size = `Size: WxH`.
4. Tag = `<script>...</script>` plus `<noscript>...</noscript>` when present.
5. The customer tag is not rewritten.
6. Missing expected Adform host / GDPR parameters creates a review warning.

## Google Campaign Manager

The parser scans workbook sheets for a header containing:

- `Dimensions`, `Size`, or `Tag Size`
- a standard `JavaScript Tag` OR `Impression Tag (JavaScript)`
- at least one of `Creative Name`, `Ad Name`, `Placement Name`

Rules:

1. Prefer the sheet named `Tags` when multiple matching sheets exist.
2. Prefer `JavaScript Tag` over `Impression Tag (JavaScript)`.
3. Name priority: Creative Name → Ad Name → Placement Name → fallback.
4. Keep the JavaScript tag text intact; do not collapse whitespace or line breaks.
5. `trackimpj` / obvious 1x1 impression tracking is marked tracking-only and excluded by default.
6. Old `.xls` codepages are enabled through the SheetJS codepage module.
7. Additional matching sheets are ignored with a warning to avoid duplicate imports.

## HTML5 ZIP

Supported package shapes:

1. A ZIP that directly contains `manifest.json` + the manifest `source` file (normally `index.html`).
2. A bundle ZIP that contains multiple nested creative ZIPs.
3. A ZIP with one or more creative folders, each containing its own manifest + source file.

Rules:

1. Inspect ZIP central-directory sizes before full decompression and reject oversized / ZIP64 / excessive-entry packages.
2. Find every `manifest.json` and resolve its declared `source` file.
3. Width / height: manifest first, then `<meta name="ad.size">`. Warn if both exist and disagree.
4. Naming priority: meaningful nested-package name → non-generic manifest title → outer bundle filename + size. Names remain editable.
5. Read HTTP(S) clicktag destinations from `manifest.clicktags`. One unique destination can be patched through a controlled placeholder in the generated wrapper.
6. Detect required local `src`, `href`, or CSS `url(...)` assets. If local assets are required, do not pretend the creative is portable: exclude it and show a warning.
7. Escape inner `</script>` sequences before embedding the source HTML in an outer JavaScript tag.
8. Generate a fixed-size iframe using `srcdoc`; no customer creative is uploaded or hosted by the app.
9. Enforce Excel's 32,767-character cell limit after conversion. Oversized tags are excluded.
10. At export, optional Hawk click rewriting changes only the generated wrapper's controlled `cbgClickTarget` value; arbitrary HTML5 code is not searched/replaced.

This conversion path is intentionally conservative. A ZIP that cannot be represented safely as one JavaScript cell should be handled as a native HTML5 creative delivery rather than silently flattened.
