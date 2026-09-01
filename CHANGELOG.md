# Changelog

## v2.0.0 — production polish

### Product / UX

- Reworked the interface into a finished three-step workflow.
- Added source/template status, review metrics and All / Ready / Needs review / Excluded filters.
- Added clearer row status chips, compact tag inspection and safer bulk actions.
- Added export feedback/toasts and source-based export filenames.
- Made IAB Category searchable with the browser datalist.
- Added a sensible Preview Image fallback matching the supplied Hawk workflow.
- Reduced noisy MVP copy and removed unused source-selector styles.

### Logic / safety

- Removed experimental HTML5 ZIP code from the production project rather than merely hiding it.
- Made SeenThis detection stricter; generic `data-id` no longer triggers a false SeenThis match.
- SeenThis parser now ignores unrelated script tags.
- Added safe Landing Page suggestion behavior for SeenThis base URLs.
- Added Google landing-page detection only from explicit landing/destination/click-through columns.
- Improved Adform dimension fallback.
- Template version and creative capacity are read dynamically.
- Added Hawk template schema/header validation to prevent silent writes after structural template changes.
- Export validation now mirrors the Hawk workbook requirements more explicitly.

### QA

- Re-ran supplied SeenThis and Adform deliveries against the bundled template.
- Verified future `980x240` / `1080x1920` additions require no parser changes.
- Verified `160x600` remains a deliberate manual Hawk-size choice.
