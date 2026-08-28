import { strFromU8, unzipSync } from 'fflate';
import { resolveTemplateSize, buildDimensionOptions, updateHawkClicktag } from './parser';
import type { Creative, ParseIssue, ParseResult, TemplateOption } from './types';

const MAX_TOTAL_UNCOMPRESSED = 60 * 1024 * 1024;
const MAX_ENTRY_UNCOMPRESSED = 12 * 1024 * 1024;
const MAX_ENTRIES = 1000;
const MAX_NESTED_ARCHIVES = 200;
const MAX_NESTING_DEPTH = 2;
const MAX_HTML_BYTES = 300 * 1024;

interface ZipEntryInfo { name: string; compressedSize: number; uncompressedSize: number; }
interface Html5Manifest { title?: unknown; description?: unknown; width?: unknown; height?: unknown; source?: unknown; clicktags?: unknown; }
interface Html5Candidate {
  origin: string;
  packageName: string;
  manifestPath: string;
  htmlPath: string;
  manifest: Html5Manifest;
  html: string;
}

function readU16(bytes: Uint8Array, offset: number): number { return bytes[offset] | (bytes[offset + 1] << 8); }
function readU32(bytes: Uint8Array, offset: number): number { return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0; }

function inspectZip(bytes: Uint8Array, label: string): ZipEntryInfo[] {
  const entries: ZipEntryInfo[] = [];
  let total = 0;
  for (let i = 0; i + 46 <= bytes.length; i += 1) {
    if (readU32(bytes, i) !== 0x02014b50) continue;
    const compressedSize = readU32(bytes, i + 20);
    const uncompressedSize = readU32(bytes, i + 24);
    const nameLength = readU16(bytes, i + 28);
    const extraLength = readU16(bytes, i + 30);
    const commentLength = readU16(bytes, i + 32);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new Error(`${label} uses ZIP64, which is not supported by the safe browser importer.`);
    const endName = i + 46 + nameLength;
    if (endName > bytes.length) throw new Error(`${label} has an invalid ZIP directory.`);
    const name = new TextDecoder().decode(bytes.slice(i + 46, endName));
    entries.push({ name, compressedSize, uncompressedSize });
    total += uncompressedSize;
    if (entries.length > MAX_ENTRIES) throw new Error(`${label} contains more than ${MAX_ENTRIES} ZIP entries.`);
    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED) throw new Error(`${label} contains an entry larger than ${Math.round(MAX_ENTRY_UNCOMPRESSED / 1024 / 1024)} MB (${name}).`);
    if (total > MAX_TOTAL_UNCOMPRESSED) throw new Error(`${label} expands beyond ${Math.round(MAX_TOTAL_UNCOMPRESSED / 1024 / 1024)} MB and was rejected.`);
    i = endName + extraLength + commentLength - 1;
  }
  if (!entries.length) throw new Error(`${label} does not look like a readable ZIP archive.`);
  return entries;
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return parts.join('/');
}
function dirname(path: string): string { const n = normalizePath(path); const i = n.lastIndexOf('/'); return i >= 0 ? n.slice(0, i + 1) : ''; }
function stem(filename: string): string { return filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)\s*$/, '').trim(); }
function prettyDimension(width: number, height: number): string { return `${width} × ${height}`; }
function dimInText(value: string): boolean { return /\d{1,4}\s*[xX×]\s*\d{1,4}/.test(value); }
function dimensionOnlyName(value: string): boolean { return /^\s*\d{1,4}\s*[xX×]\s*\d{1,4}\s*$/.test(value); }
function cleanPackageName(value: string): string { return stem(value).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(); }

function manifestClickUrls(manifest: Html5Manifest): string[] {
  if (!manifest.clicktags || typeof manifest.clicktags !== 'object') return [];
  return [...new Set(Object.values(manifest.clicktags as Record<string, unknown>)
    .filter((value): value is string => typeof value === 'string' && /^https?:\/\//i.test(value.trim()))
    .map((value) => value.trim()))];
}
function manifestDimension(manifest: Html5Manifest): { width: number; height: number } | null {
  const width = Number(manifest.width); const height = Number(manifest.height);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
}
function htmlDimension(html: string): { width: number; height: number } | null {
  const meta = html.match(/<meta\b[^>]*name\s*=\s*["']ad\.size["'][^>]*content\s*=\s*["'][^"']*width\s*=\s*(\d+)[^"']*height\s*=\s*(\d+)[^"']*["'][^>]*>/i)
    ?? html.match(/<meta\b[^>]*content\s*=\s*["'][^"']*width\s*=\s*(\d+)[^"']*height\s*=\s*(\d+)[^"']*["'][^>]*name\s*=\s*["']ad\.size["'][^>]*>/i);
  return meta ? { width: Number(meta[1]), height: Number(meta[2]) } : null;
}

function parseManifest(bytes: Uint8Array, path: string): Html5Manifest {
  try { return JSON.parse(strFromU8(bytes)) as Html5Manifest; } catch { throw new Error(`Could not parse ${path}.`); }
}
function collectDirectCandidates(files: Record<string, Uint8Array>, origin: string, packageName: string): Html5Candidate[] {
  const output: Html5Candidate[] = [];
  for (const raw of Object.keys(files).filter((name) => /(?:^|\/)manifest\.json$/i.test(name))) {
    const manifestPath = normalizePath(raw);
    const manifest = parseManifest(files[raw], manifestPath);
    const base = dirname(manifestPath);
    const source = typeof manifest.source === 'string' && manifest.source.trim() ? normalizePath(manifest.source.trim()) : 'index.html';
    const htmlPath = normalizePath(`${base}${source}`);
    const matchKey = Object.keys(files).find((key) => normalizePath(key) === htmlPath);
    if (!matchKey) continue;
    const htmlBytes = files[matchKey];
    if (htmlBytes.byteLength > MAX_HTML_BYTES) throw new Error(`${origin}: ${htmlPath} is larger than ${Math.round(MAX_HTML_BYTES / 1024)} KB.`);
    output.push({ origin, packageName, manifestPath, htmlPath, manifest, html: strFromU8(htmlBytes) });
  }
  return output;
}
function collectCandidates(bytes: Uint8Array, origin: string, packageName: string, depth: number, nestedCounter: { count: number }): Html5Candidate[] {
  inspectZip(bytes, origin);
  const files = unzipSync(bytes);
  const direct = collectDirectCandidates(files, origin, packageName);
  if (depth >= MAX_NESTING_DEPTH) return direct;
  const nested: Html5Candidate[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (!/\.zip$/i.test(name) || name.startsWith('__MACOSX/')) continue;
    nestedCounter.count += 1;
    if (nestedCounter.count > MAX_NESTED_ARCHIVES) throw new Error(`The archive contains more than ${MAX_NESTED_ARCHIVES} nested ZIP files.`);
    nested.push(...collectCandidates(data, `${origin} → ${name}`, name, depth + 1, nestedCounter));
  }
  return [...direct, ...nested];
}

function chooseName(candidate: Html5Candidate, outerFilename: string, width: number, height: number): { name: string; source: Creative['nameSource'] } {
  const packageStem = cleanPackageName(candidate.packageName);
  const manifestTitle = typeof candidate.manifest.title === 'string' ? candidate.manifest.title.trim() : '';
  const genericManifestTitle = /^(?:ad|banner|creative|html5)$/i.test(manifestTitle);
  const dim = prettyDimension(width, height);
  if (packageStem && !dimensionOnlyName(packageStem)) return { name: dimInText(packageStem) ? packageStem : `${packageStem} - ${dim}`, source: 'html5-package' };
  if (manifestTitle && !genericManifestTitle) return { name: dimInText(manifestTitle) ? manifestTitle : `${manifestTitle} - ${dim}`, source: 'html5-manifest' };
  const outer = cleanPackageName(outerFilename) || 'HTML5 creative';
  return { name: dimInText(outer) ? outer : `${outer} - ${dim}`, source: 'html5-package' };
}

function localAssetReferences(html: string): string[] {
  const refs = new Set<string>();
  const attrRe = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  const cssRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  const add = (raw: string) => {
    const value = raw.trim();
    if (!value || /^(?:https?:)?\/\//i.test(value) || /^(?:data|blob|javascript|mailto|tel):/i.test(value) || value.startsWith('#')) return;
    if (/^(?:mraid|ormma)\.js(?:[?#].*)?$/i.test(value.replace(/^\.\//, ''))) return;
    refs.add(value);
  };
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(html)) !== null) add(match[1]);
  while ((match = cssRe.exec(html)) !== null) add(match[1]);
  return [...refs];
}

function detectCreativeType(html: string, availableTypes: string[]): { type: string | null; options: string[]; warning?: string } {
  const lowerTypes = new Map(availableTypes.map((type) => [type.toLowerCase(), type]));
  const exact = (key: string): string | null => lowerTypes.get(key) ?? null;
  const hasOrmma = /(?:\bormma\s*\.|\bormma\.js\b)/i.test(html);
  if (hasOrmma) {
    const type = exact('ormma');
    return type ? { type, options: [type] } : { type: null, options: [], warning: 'ORMMA was detected, but the template does not contain the “ormma” creative type.' };
  }

  const hasMraid = /(?:\bmraid\s*\.|\bmraid\.js\b)/i.test(html);
  if (hasMraid) {
    const mraid2Signals = /\b(?:createCalendarEvent|storePicture|playVideo|getCurrentPosition|getDefaultPosition|getMaxSize|getScreenSize|setOrientationProperties|getOrientationProperties|supports)\s*\(/i.test(html);
    const mraid2 = exact('mraid2');
    const mraid1 = exact('mraid1');
    if (mraid2Signals && mraid2) return { type: mraid2, options: [mraid2] };
    const options = [mraid1, mraid2].filter((value): value is string => Boolean(value));
    if (options.length === 1) return { type: options[0], options };
    if (options.length > 1) return { type: null, options, warning: 'MRAID was detected, but the HTML does not reveal the MRAID version confidently. Choose MRAID 1 or MRAID 2 for this row.' };
    return { type: null, options: [], warning: 'MRAID was detected, but the template does not contain an MRAID creative type.' };
  }

  const htmlType = exact('html');
  return htmlType ? { type: htmlType, options: [htmlType] } : { type: null, options: [], warning: 'HTML creative detected, but the template does not contain the “html” creative type.' };
}

export function parseHtml5ZipBundle(buffer: ArrayBuffer, filename: string, sizes: TemplateOption[], creativeTypes: string[]): ParseResult {
  const issues: ParseIssue[] = [];
  const creatives: Creative[] = [];
  const candidates = collectCandidates(new Uint8Array(buffer), filename, filename, 0, { count: 0 });
  const sizeOptionsMap = buildDimensionOptions(sizes);
  const landingPages = new Set<string>();

  candidates.forEach((candidate, index) => {
    const warnings: string[] = [];
    const manifestDim = manifestDimension(candidate.manifest);
    const htmlDim = htmlDimension(candidate.html);
    const dimension = manifestDim ?? htmlDim;
    if (!dimension) {
      issues.push({ type: 'error', message: `${candidate.origin}: could not determine width and height from manifest.json or <meta name="ad.size">.` });
      return;
    }
    if (manifestDim && htmlDim && (manifestDim.width !== htmlDim.width || manifestDim.height !== htmlDim.height)) warnings.push(`manifest.json says ${manifestDim.width}x${manifestDim.height}, but index.html says ${htmlDim.width}x${htmlDim.height}. The manifest dimension is used.`);

    const clickUrls = manifestClickUrls(candidate.manifest);
    clickUrls.forEach((url) => landingPages.add(url));
    if (clickUrls.length > 1) warnings.push(`manifest.json contains multiple click destinations (${clickUrls.length}). Review this package manually.`);
    const clickUrl = clickUrls.length === 1 ? clickUrls[0] : null;

    const assetRefs = localAssetReferences(candidate.html);
    if (assetRefs.length) warnings.push(`The HTML references local package asset${assetRefs.length === 1 ? '' : 's'} (${assetRefs.slice(0, 5).join(', ')}${assetRefs.length > 5 ? ', …' : ''}). A single-cell HTML import cannot carry those files, so this row is excluded.`);

    const type = detectCreativeType(candidate.html, creativeTypes);
    if (type.warning) warnings.push(type.warning);

    const nameResult = chooseName(candidate, filename, dimension.width, dimension.height);
    const dimensionKey = `${dimension.width}x${dimension.height}`;
    const size = resolveTemplateSize(dimensionKey, sizeOptionsMap);
    if (size.warning) warnings.push(size.warning);
    const html = candidate.html.trim();
    const exportable = Boolean(size.label) && Boolean(type.type) && assetRefs.length === 0 && html.length <= 32767;
    if (html.length > 32767) warnings.push('The HTML exceeds Excel’s 32,767-character cell limit and is excluded.');

    creatives.push({
      id: `html5zip-${index}`,
      sourceType: 'html5zip',
      sourceComment: `${candidate.origin} · ${candidate.manifestPath}`,
      name: nameResult.name,
      nameSource: nameResult.source,
      width: dimension.width,
      height: dimension.height,
      dimension: dimensionKey,
      script: html,
      creativeType: type.type,
      creativeTypeOptions: type.options,
      sizeStatus: size.status,
      sizeOptions: size.options,
      mappedSizeLabel: size.label,
      included: exportable,
      warnings,
      html5ZipConvertible: assetRefs.length === 0 && html.length <= 32767,
      detectedLandingPage: clickUrl ?? undefined,
    });
  });

  if (!candidates.length) issues.push({ type: 'error', message: 'No HTML5 creative package containing manifest.json + index.html was found in this ZIP.' });
  if (landingPages.size > 1) issues.push({ type: 'warning', message: `The ZIP contains ${landingPages.size} different click destinations. Landing Page was not auto-filled; review each creative.` });
  return { creatives, issues, itemCount: candidates.length, detectedLandingPage: landingPages.size === 1 ? [...landingPages][0] : undefined };
}
