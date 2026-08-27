# Parser Logic

## Common rules

All parsers return the same normalized creative model:

- Creative Name
- Width
- Height
- Dimension (`WxH`)
- Full source tag
- Source type
- Template size match
- Included / excluded state
- Warnings

Sizes are matched strictly against the current Excel template. Unknown sizes are excluded, never silently remapped.

## SeenThis

1. Find each SeenThis `<script>` block and its preceding HTML comment.
2. Read numeric `data-width` / `data-height` when present.
3. If width/height are `100vw` / `100vh`, use the dimension from the HTML comment.
4. Naming:
   - If the local comment contains semantic creative text, derive the name from that comment and remove duplicate size suffixes.
   - If the local comment contains only the size, use the file-level campaign header + size.
   - Otherwise create a fallback name and warn.
5. SeenThis is the only source where `${HAWK_CLICK}` replacement is currently applied.

## Adform

Expected block header example:

`Tag 1. ROT_320x100_azerion_eng (Media: Azerion, ... Size: 320x100, Type: rotator)`

Rules:

1. Each `Tag N.` header starts a creative block.
2. Creative Name = text between `Tag N.` and the opening metadata parenthesis.
3. Size = `Size: WxH` in the header.
4. Tag = supplied `<script>...</script>` plus `<noscript>...</noscript>` when present.
5. The Adform tag is preserved unchanged.

## Google Campaign Manager

The parser scans workbook sheets for a header row containing:

- Dimensions (or Size)
- A JavaScript impression-tag column
- Creative Name, Ad Name or Placement Name

Rules:

1. Name priority: `Creative Name` → `Ad Name` → `Placement Name` → fallback.
2. Exported name = selected source name + ` - W × H`.
3. Size = `Dimensions`.
4. Tag = `Impression Tag (JavaScript)`.
5. Empty/non-JavaScript rows are skipped with a warning.
6. Tracking-only rows such as `1x1` are treated like any other size and will be excluded if the Hawk template does not support them.
