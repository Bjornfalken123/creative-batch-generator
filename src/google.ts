import * as XLSX from 'xlsx';
import * as cpexcel from 'xlsx/dist/cpexcel.full.mjs';
import { buildDimensionOptions, resolveTemplateSize } from './parser';
import type { Creative, ParseResult, TemplateOption } from './types';

const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
const headerKey = (value: unknown): string => normalize(value).toLowerCase();
const rawTag = (value: unknown): string => String(value ?? '').trim();

XLSX.set_cptable(cpexcel);

function findHeaderRow(rows: unknown[][]): { rowIndex: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(rows.length, 100); i++) {
    const headers = (rows[i] ?? []).map(headerKey);
    const hasDimensions = headers.includes('dimensions') || headers.includes('size') || headers.includes('tag size');
    const hasStandardJs = headers.includes('javascript tag') || headers.includes('standard javascript tag');
    const hasImpressionJs = headers.some((h) => h.includes('impression tag') && h.includes('javascript'));
    const hasName = headers.includes('creative name') || headers.includes('ad name') || headers.includes('placement name');
    if (hasDimensions && (hasStandardJs || hasImpressionJs) && hasName) return { rowIndex: i, headers };
  }
  return null;
}

function indexOfAny(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const exact = headers.indexOf(candidate);
    if (exact >= 0) return exact;
  }
  return -1;
}

function indexMatching(headers: string[], predicate: (header: string) => boolean): number {
  return headers.findIndex(predicate);
}

function parseDimension(value: string): { width: number; height: number } | null {
  const match = value.match(/(\d{1,4})\s*[xX×]\s*(\d{1,4})/);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function preferredSheetNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const score = (name: string) => {
      const lower = name.trim().toLowerCase();
      if (lower === 'tags') return 0;
      if (lower.includes('tracking') && lower.includes('tag')) return 1;
      if (lower.includes('tag')) return 2;
      if (lower.includes('legacy')) return 4;
      return 3;
    };
    return score(a) - score(b);
  });
}

function extractHttpUrl(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return '';
  try {
    const url = new URL(match[0]);
    return url.href;
  } catch {
    return '';
  }
}

export function parseGoogleWorkbook(bytes: ArrayBuffer, sizes: TemplateOption[]): ParseResult {
  const workbook = XLSX.read(bytes, { type: 'array', cellText: true, cellDates: false, cellFormula: false, cellHTML: false });
  const sizeOptionsMap = buildDimensionOptions(sizes);
  const creatives: Creative[] = [];
  const issues: ParseResult['issues'] = [];
  const landingCandidates = new Set<string>();
  let detectedRows = 0;
  let matchedSheet = '';
  let additionalMatchingSheets = 0;

  const candidateSheets: { name: string; rows: unknown[][]; header: { rowIndex: number; headers: string[] } }[] = [];
  for (const sheetName of preferredSheetNames(workbook.SheetNames)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
    const header = findHeaderRow(rows);
    if (header) candidateSheets.push({ name: sheetName, rows, header });
  }

  if (candidateSheets.length) additionalMatchingSheets = Math.max(0, candidateSheets.length - 1);
  const candidate = candidateSheets[0];
  if (candidate) {
    matchedSheet = candidate.name;
    const { rows, header } = candidate;
    const creativeNameIdx = indexOfAny(header.headers, ['creative name']);
    const adNameIdx = indexOfAny(header.headers, ['ad name']);
    const placementNameIdx = indexOfAny(header.headers, ['placement name']);
    const dimensionIdx = indexOfAny(header.headers, ['dimensions', 'size', 'tag size']);
    const standardJavascriptIdx = indexOfAny(header.headers, ['javascript tag', 'standard javascript tag']);
    const impressionJavascriptIdx = indexMatching(header.headers, (h) => h.includes('impression tag') && h.includes('javascript'));
    const javascriptIdx = standardJavascriptIdx >= 0 ? standardJavascriptIdx : impressionJavascriptIdx;
    const usingImpressionColumn = standardJavascriptIdx < 0 && impressionJavascriptIdx >= 0;
    const landingIdx = indexOfAny(header.headers, [
      'landing page', 'landing page url', 'destination url', 'click-through url', 'click through url',
    ]);

    for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] ?? [];
      const javascriptTag = javascriptIdx >= 0 ? rawTag(row[javascriptIdx]) : '';
      const dimensionText = dimensionIdx >= 0 ? normalize(row[dimensionIdx]) : '';
      if (!javascriptTag && !dimensionText) continue;
      detectedRows++;

      if (landingIdx >= 0) {
        const landing = extractHttpUrl(row[landingIdx]);
        if (landing) landingCandidates.add(landing);
      }

      if (!javascriptTag) {
        issues.push({ type: 'warning', message: `Google row ${rowIndex + 1} has no JavaScript tag and was skipped.` });
        continue;
      }

      const dim = parseDimension(dimensionText);
      if (!dim) {
        issues.push({ type: 'warning', message: `Google row ${rowIndex + 1} has no readable dimension (“${dimensionText || 'blank'}”) and was skipped.` });
        continue;
      }

      const creativeName = creativeNameIdx >= 0 ? normalize(row[creativeNameIdx]) : '';
      const adName = adNameIdx >= 0 ? normalize(row[adNameIdx]) : '';
      const placementName = placementNameIdx >= 0 ? normalize(row[placementNameIdx]) : '';
      const baseName = creativeName || adName || placementName;
      const nameSource: Creative['nameSource'] = creativeName ? 'google-creative' : adName ? 'google-ad' : placementName ? 'google-placement' : 'fallback';
      const hasSizeInName = baseName ? new RegExp(`(?:^|[^0-9])${dim.width}\\s*[xX×]\\s*${dim.height}(?:[^0-9]|$)`).test(baseName) : false;
      const name = baseName ? (hasSizeInName ? baseName : `${baseName} - ${dim.width} × ${dim.height}`) : `Google creative ${creatives.length + 1} - ${dim.width} × ${dim.height}`;
      const dimension = `${dim.width}x${dim.height}`;
      const size = resolveTemplateSize(dimension, sizeOptionsMap);
      const trackingOnly = /\/trackimpj\//i.test(javascriptTag) || (usingImpressionColumn && dim.width === 1 && dim.height === 1);
      const warnings: string[] = [];
      if (!baseName) warnings.push('No Creative Name, Ad Name or Placement Name was found. Review the fallback name.');
      if (usingImpressionColumn) warnings.push('This workbook uses “Impression Tag (JavaScript)” instead of a standard “JavaScript Tag” column. Verify that this is the intended Hawk creative tag.');
      if (size.warning) warnings.push(size.warning);
      if (trackingOnly) warnings.push('The tag looks like a Google tracking/impression tag rather than a display creative. It is excluded by default.');

      creatives.push({
        id: `google-${rowIndex}`,
        sourceType: 'google',
        sourceComment: `Sheet: ${candidate.name} · Row: ${rowIndex + 1}`,
        name,
        nameSource,
        width: dim.width,
        height: dim.height,
        dimension,
        script: javascriptTag,
        creativeType: 'javascript',
        sizeStatus: size.status,
        sizeOptions: size.options,
        mappedSizeLabel: size.label,
        included: Boolean(size.label) && !trackingOnly,
        warnings,
        trackingOnly,
      });
    }
  }

  if (!matchedSheet) issues.push({ type: 'error', message: 'No Google Campaign Manager tag sheet with Dimensions and a JavaScript tag column was found.' });
  else {
    if (additionalMatchingSheets) issues.push({ type: 'warning', message: `Multiple Google tag sheets were detected. “${matchedSheet}” was used and ${additionalMatchingSheets} additional matching sheet${additionalMatchingSheets === 1 ? ' was' : 's were'} ignored to avoid duplicates.` });
    if (!creatives.length && !issues.some((issue) => issue.type === 'error')) issues.push({ type: 'error', message: `Google sheet “${matchedSheet}” was found, but no usable JavaScript creative rows were identified.` });
    if (landingCandidates.size > 1) issues.push({ type: 'warning', message: `Multiple landing-page URLs were found in the Google sheet. Landing Page was left blank so you can choose the correct campaign URL.` });
  }

  return {
    creatives,
    issues,
    itemCount: detectedRows,
    detectedLandingPage: landingCandidates.size === 1 ? [...landingCandidates][0] : undefined,
  };
}
