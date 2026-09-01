# Architecture

## Runtime

The application is a static Vite + TypeScript frontend deployed with Cloudflare Workers Static Assets.

There is no application backend. Customer files are read through the browser File API and processed in memory.

## Flow

```text
Customer file
   ↓
Source detection
   ├─ SeenThis parser
   ├─ Adform parser
   └─ Google Campaign Manager workbook parser
   ↓
Normalized Creative[]
   ↓
Hawk template size/category/type/adserver configuration
   ↓
Review / include / exclude
   ↓
Original Hawk XLSX template patched in-browser
   ↓
BatchUploadCreatives-<source>.xlsx
```

## Template handling

The app does not rebuild the Hawk workbook from scratch. It opens the existing XLSX package and preserves formulas, formatting, data sheets and validation logic.

At startup it verifies:

- required sheets: `creatives`, `validation`, `data`, `metadata`
- expected `creatives` headers in A:J
- IAB category columns in `data`
- Creative Type list
- AdServer list
- Creative Size name/ID list
- template capacity
- metadata version

If the Hawk template changes structurally, startup fails rather than exporting a potentially corrupt batch.

## Formula caches

The Hawk workbook contains validation formulas. Some importers may inspect cached formula results without recalculating the workbook. The generator therefore updates the cached validation/metadata state for rows that already passed the same application-side rules, while retaining all original formulas and forcing recalculation on workbook open.

## Privacy

No customer creative data is sent to Cloudflare by application code. Cloudflare serves only the static application bundle and Hawk template.
