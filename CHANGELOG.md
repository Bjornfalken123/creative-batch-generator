# Changelog

## 0.7.0
- Added strict handling for ambiguous dimensions (for example multiple `160x600` Hawk IDs).
- Added row-level template-size selection for ambiguous dimensions.
- Missing sizes remain excluded without blocking valid exports.
- IAB Category is now required per imported file instead of defaulting to a previous/client-specific value.
- Landing Page is cleared on every import to prevent cross-campaign reuse.
- Source-specific AdServer defaults: SeenThis → Other, Adform → Adform, Google CM → DCM.
- Added source mismatch detection between SeenThis and Adform text files.
- Added file-size guard and visible import error handling.
- Google parser now preserves JavaScript tag whitespace exactly.
- Google parser prefers standard JavaScript tags and flags impression/tracking tags.
- Google `trackimpj` tracking-only rows are excluded by default.
- Added legacy XLS codepage support.
- Replaced the outdated npm-registry `xlsx@0.18.5` dependency with official SheetJS CE 0.20.3 distribution.
- Template data columns are now found by header name instead of fixed A/C/G/M/N coordinates.
- Added 200-character Creative Name validation.
- Added `QA_REVIEW.md` with fixture expectations.

## 0.6.0
- Added SeenThis, Adform and Google Campaign Manager source modes.
