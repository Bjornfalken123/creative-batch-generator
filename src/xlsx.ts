import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Creative, ExportSettings, TemplateConfig, TemplateOption } from './types';
import { updateHawkClicktag } from './parser';

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const EXPECTED_CREATIVE_HEADERS: Record<string, string> = {
  A: 'valid ?',
  B: 'name*',
  C: 'iab category*',
  D: 'creative type*',
  E: 'creative size*',
  F: 'creative attribute (optional)',
  G: 'preview image url*',
  H: 'landing page*',
  I: 'adserver*',
  J: 'script*',
};

function parseXml(bytes: Uint8Array | undefined): XMLDocument {
  if (!bytes) throw new Error('The Excel template is missing an expected XML file.');
  const xml = strFromU8(bytes);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not read Excel XML.');
  return doc;
}

function serializeXml(doc: XMLDocument): Uint8Array {
  return strToU8(new XMLSerializer().serializeToString(doc));
}

function colLetters(ref: string): string {
  return ref.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? '';
}

function getSharedStrings(files: Record<string, Uint8Array>): string[] {
  const bytes = files['xl/sharedStrings.xml'];
  if (!bytes) return [];
  const doc = parseXml(bytes);
  return [...doc.getElementsByTagNameNS(NS_MAIN, 'si')].map((si) =>
    [...si.getElementsByTagNameNS(NS_MAIN, 't')].map((t) => t.textContent ?? '').join(''),
  );
}

function getCellValue(cell: Element, sharedStrings: string[]): string {
  const type = cell.getAttribute('t');
  if (type === 'inlineStr') {
    return [...cell.getElementsByTagNameNS(NS_MAIN, 't')].map((t) => t.textContent ?? '').join('');
  }
  const v = cell.getElementsByTagNameNS(NS_MAIN, 'v')[0]?.textContent ?? '';
  if (type === 's') return sharedStrings[Number(v)] ?? '';
  return v;
}

function resolveSheetPaths(files: Record<string, Uint8Array>): Record<string, string> {
  const workbook = parseXml(files['xl/workbook.xml']);
  const rels = parseXml(files['xl/_rels/workbook.xml.rels']);
  const relMap = new Map<string, string>();
  for (const rel of [...rels.getElementsByTagNameNS(NS_PKG_REL, 'Relationship')]) {
    relMap.set(rel.getAttribute('Id') ?? '', rel.getAttribute('Target') ?? '');
  }

  const output: Record<string, string> = {};
  for (const sheet of [...workbook.getElementsByTagNameNS(NS_MAIN, 'sheet')]) {
    const name = sheet.getAttribute('name') ?? '';
    const rid = sheet.getAttributeNS(NS_REL, 'id') ?? sheet.getAttribute('r:id') ?? '';
    let target = relMap.get(rid) ?? '';
    target = target.replace(/^\//, '');
    if (!target.startsWith('xl/')) target = `xl/${target.replace(/^\.\//, '')}`;
    output[name] = target;
  }
  return output;
}

function rowsFromSheet(doc: XMLDocument): Element[] {
  return [...doc.getElementsByTagNameNS(NS_MAIN, 'row')];
}

function rowNumber(row: Element): number {
  return Number(row.getAttribute('r') ?? '0');
}

function getCell(row: Element, column: string): Element | null {
  return [...row.getElementsByTagNameNS(NS_MAIN, 'c')].find((cell) => colLetters(cell.getAttribute('r') ?? '') === column) ?? null;
}

function ensureCell(doc: XMLDocument, row: Element, column: string): Element {
  const existing = getCell(row, column);
  if (existing) return existing;
  const cell = doc.createElementNS(NS_MAIN, 'c');
  cell.setAttribute('r', `${column}${rowNumber(row)}`);
  row.appendChild(cell);
  return cell;
}

function removeValueNodes(cell: Element): void {
  for (const child of [...cell.childNodes]) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    if (el.localName === 'v' || el.localName === 'is') cell.removeChild(child);
  }
}

function setInlineString(doc: XMLDocument, cell: Element, value: string | null): void {
  removeValueNodes(cell);
  if (value === null || value === '') {
    cell.removeAttribute('t');
    return;
  }
  cell.setAttribute('t', 'inlineStr');
  const is = doc.createElementNS(NS_MAIN, 'is');
  const t = doc.createElementNS(NS_MAIN, 't');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = value;
  is.appendChild(t);
  cell.appendChild(is);
}

function setFormulaCachedValue(doc: XMLDocument, cell: Element, value: string | number | boolean | null): void {
  removeValueNodes(cell);
  if (value === null || value === '') {
    cell.removeAttribute('t');
    return;
  }
  const v = doc.createElementNS(NS_MAIN, 'v');
  if (typeof value === 'boolean') {
    cell.setAttribute('t', 'b');
    v.textContent = value ? '1' : '0';
  } else if (typeof value === 'number') {
    cell.removeAttribute('t');
    v.textContent = String(value);
  } else {
    cell.setAttribute('t', 'str');
    v.textContent = value;
  }
  cell.appendChild(v);
}

function extractOptions(dataDoc: XMLDocument, sharedStrings: string[], labelCol: string, idCol: string): TemplateOption[] {
  const result: TemplateOption[] = [];
  for (const row of rowsFromSheet(dataDoc)) {
    if (rowNumber(row) < 2) continue;
    const labelCell = getCell(row, labelCol);
    const idCell = getCell(row, idCol);
    if (!labelCell || !idCell) continue;
    const label = getCellValue(labelCell, sharedStrings);
    const id = getCellValue(idCell, sharedStrings);
    if (label && id) result.push({ label, id });
  }
  return result;
}

function extractSingleColumn(dataDoc: XMLDocument, sharedStrings: string[], col: string): string[] {
  const values: string[] = [];
  for (const row of rowsFromSheet(dataDoc)) {
    if (rowNumber(row) < 2) continue;
    const cell = getCell(row, col);
    if (!cell) continue;
    const value = getCellValue(cell, sharedStrings);
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function dataHeaderColumns(dataDoc: XMLDocument, sharedStrings: string[]): Map<string, string> {
  const headerRow = rowsFromSheet(dataDoc).find((row) => rowNumber(row) === 1);
  const result = new Map<string, string>();
  if (!headerRow) return result;
  for (const cell of [...headerRow.getElementsByTagNameNS(NS_MAIN, 'c')]) {
    const label = getCellValue(cell, sharedStrings).replace(/\s+/g, ' ').trim().toLowerCase();
    if (label) result.set(label, colLetters(cell.getAttribute('r') ?? ''));
  }
  return result;
}

function requireHeader(columns: Map<string, string>, names: string[]): string {
  for (const name of names) {
    const found = columns.get(name.toLowerCase());
    if (found) return found;
  }
  throw new Error(`The template data sheet is missing the column “${names[0]}”.`);
}

function validateCreativeSheetLayout(creativeDoc: XMLDocument, sharedStrings: string[]): number {
  const rows = rowsFromSheet(creativeDoc);
  const headerRow = rows.find((row) => rowNumber(row) === 2);
  if (!headerRow) throw new Error('The template creatives sheet is missing its header row.');
  for (const [column, expected] of Object.entries(EXPECTED_CREATIVE_HEADERS)) {
    const cell = getCell(headerRow, column);
    const actual = cell ? getCellValue(cell, sharedStrings).replace(/\s+/g, ' ').trim().toLowerCase() : '';
    if (actual !== expected) {
      throw new Error(`The Hawk template layout has changed at ${column}2. Expected “${EXPECTED_CREATIVE_HEADERS[column]}”, found “${actual || 'blank'}”. Update the generator before using this template.`);
    }
  }
  const maxRow = Math.max(...rows.map(rowNumber));
  const capacity = maxRow - 2;
  if (!Number.isFinite(capacity) || capacity < 1) throw new Error('The template does not contain any creative input rows.');
  return capacity;
}

export function readTemplateConfig(templateBytes: Uint8Array): TemplateConfig {
  const files = unzipSync(templateBytes);
  const paths = resolveSheetPaths(files);
  const dataPath = paths['data'];
  const creativesPath = paths['creatives'];
  const validationPath = paths['validation'];
  const metadataPath = paths['metadata'];
  if (!dataPath || !creativesPath || !validationPath || !metadataPath) {
    throw new Error('The template is missing one of the required sheets: creatives, validation, data or metadata.');
  }

  const sharedStrings = getSharedStrings(files);
  const dataDoc = parseXml(files[dataPath]);
  const creativeDoc = parseXml(files[creativesPath]);
  const validationDoc = parseXml(files[validationPath]);
  const metadataDoc = parseXml(files[metadataPath]);
  const columns = dataHeaderColumns(dataDoc, sharedStrings);
  const categoryLabelCol = requireHeader(columns, ['iab cat name', 'iab category name']);
  const categoryIdCol = requireHeader(columns, ['iab cat id', 'iab category id']);
  const creativeTypeCol = requireHeader(columns, ['creative type']);
  const adServerCol = requireHeader(columns, ['adservers', 'adserver']);
  const sizeLabelCol = requireHeader(columns, ['creative size name']);
  const sizeIdCol = requireHeader(columns, ['creative size id']);
  const creativeCapacity = validateCreativeSheetLayout(creativeDoc, sharedStrings);
  const validationCapacity = Math.max(...rowsFromSheet(validationDoc).map(rowNumber)) - 1;
  const maxCreatives = Math.min(creativeCapacity, validationCapacity);
  const metadataRow1 = rowsFromSheet(metadataDoc).find((row) => rowNumber(row) === 1);
  const version = metadataRow1 && getCell(metadataRow1, 'B') ? getCellValue(getCell(metadataRow1, 'B')!, sharedStrings) : 'unknown';

  const config: TemplateConfig = {
    categories: extractOptions(dataDoc, sharedStrings, categoryLabelCol, categoryIdCol),
    sizes: extractOptions(dataDoc, sharedStrings, sizeLabelCol, sizeIdCol),
    creativeTypes: extractSingleColumn(dataDoc, sharedStrings, creativeTypeCol),
    adServers: extractSingleColumn(dataDoc, sharedStrings, adServerCol),
    maxCreatives,
    version,
  };
  if (!config.categories.length || !config.sizes.length || !config.creativeTypes.length || !config.adServers.length || !config.maxCreatives) {
    throw new Error('The template could not be read completely. Check categories, sizes, creative types, ad servers and input rows.');
  }
  return config;
}

function setWorkbookRecalculation(files: Record<string, Uint8Array>): void {
  const path = 'xl/workbook.xml';
  const doc = parseXml(files[path]);
  let calcPr = doc.getElementsByTagNameNS(NS_MAIN, 'calcPr')[0];
  if (!calcPr) {
    calcPr = doc.createElementNS(NS_MAIN, 'calcPr');
    doc.documentElement.appendChild(calcPr);
  }
  calcPr.setAttribute('calcMode', 'auto');
  calcPr.setAttribute('fullCalcOnLoad', '1');
  calcPr.setAttribute('forceFullCalc', '1');
  files[path] = serializeXml(doc);
}

function optionId(options: TemplateOption[], label: string): string | null {
  return options.find((option) => option.label === label)?.id ?? null;
}

export function generateWorkbook(
  templateBytes: Uint8Array,
  templateConfig: TemplateConfig,
  creatives: Creative[],
  settings: ExportSettings,
): Uint8Array {
  if (creatives.length === 0) throw new Error('No creatives to export.');
  if (creatives.length > templateConfig.maxCreatives) throw new Error(`The template supports a maximum of ${templateConfig.maxCreatives} creatives.`);
  if (creatives.some((creative) => !creative.name.trim())) throw new Error('At least one creative is missing a name.');
  if (creatives.some((creative) => creative.name.trim().length > 200)) throw new Error('At least one creative name is longer than 200 characters.');
  if (creatives.some((creative) => !creative.script.trim())) throw new Error('At least one creative is missing its tag/script.');
  if (creatives.some((creative) => creative.script.length > 32767)) throw new Error('At least one creative tag is longer than the Excel cell limit (32,767 characters).');
  const unresolved = creatives.filter((creative) => !creative.mappedSizeLabel);
  if (unresolved.length) throw new Error(`Size is missing from the template: ${unresolved[0].dimension}`);

  const categoryId = optionId(templateConfig.categories, settings.category);
  if (!categoryId) throw new Error('Invalid IAB category.');
  if (creatives.some((creative) => !creative.creativeType || !templateConfig.creativeTypes.includes(creative.creativeType))) throw new Error('At least one creative has an invalid or unresolved Creative Type.');
  if (!templateConfig.adServers.includes(settings.adServer)) throw new Error('Invalid AdServer.');
  if (!/^https?:\/\//i.test(settings.landingPage)) throw new Error('Landing Page must start with http:// or https://.');
  if (!/^https?:\/\//i.test(settings.previewUrl)) throw new Error('Preview Image URL must start with http:// or https://.');

  const files = unzipSync(templateBytes);
  const paths = resolveSheetPaths(files);
  const creativesPath = paths['creatives'];
  const validationPath = paths['validation'];
  const metadataPath = paths['metadata'];
  if (!creativesPath || !validationPath || !metadataPath) throw new Error('The template is missing the creatives/validation/metadata sheets.');

  const creativeDoc = parseXml(files[creativesPath]);
  const creativeRows = new Map(rowsFromSheet(creativeDoc).map((row) => [rowNumber(row), row]));

  for (let i = 0; i < templateConfig.maxCreatives; i++) {
    const excelRow = i + 3;
    const row = creativeRows.get(excelRow);
    if (!row) continue;
    const creative = creatives[i];
    const aCell = getCell(row, 'A');
    if (aCell) setFormulaCachedValue(creativeDoc, aCell, creative ? 'OK' : null);

    const values: Record<string, string | null> = creative
      ? {
          B: creative.name.trim(),
          C: settings.category,
          D: creative.creativeType,
          E: creative.mappedSizeLabel,
          F: null,
          G: settings.previewUrl,
          H: settings.landingPage,
          I: settings.adServer,
          J: settings.replaceClicktag && creative.sourceType === 'seenthis'
            ? updateHawkClicktag(creative.script, settings.landingPage).script
            : creative.script,
        }
      : { B: null, C: null, D: null, E: null, F: null, G: null, H: null, I: null, J: null };

    for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
      const cell = ensureCell(creativeDoc, row, col);
      setInlineString(creativeDoc, cell, values[col]);
    }
  }

  const a1 = creativeRows.get(1) ? getCell(creativeRows.get(1)!, 'A') : null;
  if (a1) setFormulaCachedValue(creativeDoc, a1, '(ok) All validation are successful. The sheet is ready to be uploaded');
  files[creativesPath] = serializeXml(creativeDoc);

  // The Hawk workbook contains formulas, but third-party importers can read cached values
  // without recalculating. The app only reaches this point after running the equivalent
  // validation rules, so cache the expected valid state while keeping all formulas intact.
  const validationDoc = parseXml(files[validationPath]);
  const validationRows = new Map(rowsFromSheet(validationDoc).map((row) => [rowNumber(row), row]));
  for (let i = 0; i < templateConfig.maxCreatives; i++) {
    const row = validationRows.get(i + 2);
    if (!row) continue;
    const creative = creatives[i];
    const sizeId = creative?.mappedSizeLabel ? optionId(templateConfig.sizes, creative.mappedSizeLabel) : null;
    const used = Boolean(creative);
    const cached: Record<string, string | number | boolean | null> = used
      ? {
          A: true, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: null, I: 0,
          J: sizeId, K: sizeId ? 0 : 1, L: categoryId, M: 0, N: Boolean(sizeId),
          P: true, Q: i + 1,
        }
      : {
          A: false, B: 1, C: 1, D: 1, E: 1, F: 1, G: 1, H: null, I: 0,
          J: null, K: 1, L: null, M: 1, N: true, P: true, Q: 0,
        };
    for (const [col, value] of Object.entries(cached)) {
      const cell = getCell(row, col);
      if (cell) setFormulaCachedValue(validationDoc, cell, value);
    }
  }
  files[validationPath] = serializeXml(validationDoc);

  const metadataDoc = parseXml(files[metadataPath]);
  const metadataRows = new Map(rowsFromSheet(metadataDoc).map((row) => [rowNumber(row), row]));
  const metadataValues: Record<number, string | number | boolean> = {
    2: creatives.length,
    3: true,
    4: true,
    5: false,
    6: false,
  };
  for (const [rowNumText, value] of Object.entries(metadataValues)) {
    const row = metadataRows.get(Number(rowNumText));
    const cell = row ? getCell(row, 'B') : null;
    if (cell) setFormulaCachedValue(metadataDoc, cell, value);
  }
  files[metadataPath] = serializeXml(metadataDoc);

  setWorkbookRecalculation(files);
  return zipSync(files, { level: 6 });
}
