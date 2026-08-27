import * as XLSX from 'xlsx';
import { buildDimensionIndex } from './parser';
import type { Creative, ParseResult, TemplateOption } from './types';

const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
const headerKey = (value: unknown): string => normalize(value).toLowerCase();

function findHeaderRow(rows: unknown[][]): { rowIndex: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(rows.length, 80); i++) {
    const headers = (rows[i] ?? []).map(headerKey);
    const hasDimensions = headers.includes('dimensions') || headers.includes('size');
    const hasJs = headers.some((h) => h.includes('impression tag') && h.includes('javascript')) || headers.includes('javascript tag');
    const hasName = headers.includes('creative name') || headers.includes('ad name') || headers.includes('placement name');
    if (hasDimensions && hasJs && hasName) return { rowIndex: i, headers };
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

export function parseGoogleWorkbook(bytes: ArrayBuffer, sizes: TemplateOption[]): ParseResult {
  const workbook = XLSX.read(bytes, { type: 'array', cellText: true, cellDates: false });
  const dimensionIndex = buildDimensionIndex(sizes);
  const creatives: Creative[] = [];
  const issues: ParseResult['issues'] = [];
  let detectedRows = 0;
  let matchedSheet = '';

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
    const header = findHeaderRow(rows);
    if (!header) continue;
    matchedSheet = sheetName;

    const creativeNameIdx = indexOfAny(header.headers, ['creative name']);
    const adNameIdx = indexOfAny(header.headers, ['ad name']);
    const placementNameIdx = indexOfAny(header.headers, ['placement name']);
    const dimensionIdx = indexOfAny(header.headers, ['dimensions', 'size']);
    const javascriptIdx = indexMatching(header.headers, (h) => (h.includes('impression tag') && h.includes('javascript')) || h === 'javascript tag');

    for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] ?? [];
      const javascriptTag = normalize(row[javascriptIdx]);
      const dimensionText = normalize(row[dimensionIdx]);
      if (!javascriptTag && !dimensionText) continue;
      detectedRows++;
      if (!javascriptTag) {
        issues.push({ type: 'warning', message: `Google row ${rowIndex + 1} has no JavaScript impression tag and was skipped.` });
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
      const mappedSizeLabel = dimensionIndex.get(dimension) ?? null;
      const warnings: string[] = [];
      if (!baseName) warnings.push('No Creative Name, Ad Name or Placement Name was found. Review the fallback name manually.');
      if (!mappedSizeLabel) warnings.push(`Size ${dimension} is missing from the template and is automatically excluded from export.`);

      creatives.push({
        id: `google-${rowIndex}`,
        sourceType: 'google',
        sourceComment: `Sheet: ${sheetName} · Row: ${rowIndex + 1}`,
        name,
        nameSource,
        width: dim.width,
        height: dim.height,
        dimension,
        script: javascriptTag,
        mappedSizeLabel,
        included: Boolean(mappedSizeLabel),
        warnings,
      });
    }
    break;
  }

  if (!matchedSheet) issues.push({ type: 'error', message: 'No Google Campaign Manager tag sheet with Dimensions and JavaScript impression tags was found.' });
  else if (!creatives.length && !issues.some((issue) => issue.type === 'error')) issues.push({ type: 'error', message: `Google sheet “${matchedSheet}” was found, but no usable JavaScript creative rows were identified.` });

  return { creatives, issues, itemCount: detectedRows };
}
