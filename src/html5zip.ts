/**
 * Legacy compatibility shim.
 *
 * HTML5 ZIP import is intentionally disabled in the production application.
 * This file exists so upgrading an older GitHub repository overwrites the
 * previous experimental html5zip.ts instead of leaving stale TypeScript code
 * behind in `src/` (which would still be compiled by tsconfig).
 */
export const HTML5_ZIP_IMPORT_ENABLED = false as const;
