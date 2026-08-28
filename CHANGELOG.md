# Changelog

## 0.8.0
- Added HTML5 ZIP as a fourth source mode.
- Supports direct creative ZIPs and bundle ZIPs containing multiple nested creatives.
- Reads `manifest.json`, its declared source HTML, dimensions and clicktags.
- Converts compatible HTML5 packages into inline fixed-size iframe JavaScript tags for the Hawk Excel workflow.
- Added conservative detection of required local assets; non-portable ZIP creatives are excluded rather than exported broken.
- Added controlled HTML5 ZIP Hawk click-target replacement without arbitrary source-code rewriting.
- Added ZIP central-directory safety checks, expansion limits, nesting limits and Excel-cell-length checks.
- Added HTML5 ZIP naming fallbacks and automatic Landing Page detection when the bundle has one consistent click destination.
- Updated source picker layout for four source types.
- Tested the supplied Arbetsförmedlingen bundle: 3 nested creatives detected (300x250, 320x320, 300x600), all three convertible to JavaScript at roughly 20.3k characters each.

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
