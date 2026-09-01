# Parser logic

## Source detection

Detection is intentionally conservative.

- SeenThis requires the official `video.seenthis.se/public/tag-loader/` loader or a SeenThis `/v2/builds/` data source.
- Adform requires `track.adform.net` or a recognizable `Tag N. ... Size: WxH` header.
- `.xls` / `.xlsx` files are parsed as Google Campaign Manager candidates and must contain the required tag-sheet columns.

A generic HTML `data-id` is not enough to classify a file as SeenThis.

## SeenThis

Only actual SeenThis loader scripts are parsed. Other `<script>` elements in the file are ignored.

Dimension priority:

1. numeric `data-width` + `data-height`
2. nearest tag comment dimension

This supports fullscreen exports where the script uses `100vw`/`100vh` but the comment contains `1080 × 1920` or `1920 × 1080`.

Name priority:

1. semantic name in the per-tag comment
2. campaign file header + dimension
3. generated fallback name

When the customer export includes both a pretty and compact size (`300 × 250 - 300x250`), only one size is retained in the generated name.

SeenThis clicktag replacement supports both an existing Hawk clicktag and an empty official `data-clicktag=""` attribute.

## Landing Page safety

A SeenThis clicktag may contain only the publisher/base destination while the final Hawk campaign needs UTM parameters. Therefore:

- a detected SeenThis URL with query/hash tracking may be auto-filled, with a review note
- a plain base URL is shown as a clickable suggestion but is not silently used as the final Landing Page
- a Google sheet can auto-fill Landing Page only from explicit landing/destination/click-through URL columns when exactly one URL is found

## Adform

Each `Tag N.` block is parsed as one creative. The JavaScript + optional `<noscript>` block is preserved unchanged.

Dimension comes from `Size: WxH`; an `<img width height>` fallback exists for slightly different exports.

No SeenThis/Hawk clicktag rewrite is applied to Adform tags.

## Google Campaign Manager

The parser searches candidate sheets for:

- Dimensions / Size / Tag Size
- JavaScript Tag / Standard JavaScript Tag, or Impression Tag (JavaScript) fallback
- Creative Name, Ad Name or Placement Name

Name fallback order:

1. Creative Name
2. Ad Name
3. Placement Name
4. generated fallback

1x1 / `trackimpj` impression tracking is excluded by default.

## Hawk size mapping

Dimensions are matched against the live size list in the template.

- no match → excluded
- one Hawk size ID → matched automatically
- multiple Hawk size IDs for the same dimensions → manual choice required

Example: `160x600` currently has separate desktop and smartphone IDs, so the app does not guess.
