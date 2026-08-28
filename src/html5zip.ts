import { strFromU8, unzipSync } from 'fflate';
import { resolveTemplateSize, buildDimensionOptions } from './parser';
import type { Creative, ParseIssue, ParseResult, TemplateOption } from './types';

const MAX_TOTAL_UNCOMPRESSED = 60 * 1024 * 1024;
const MAX_ENTRY_UNCOMPRESSED = 12 * 1024 * 1024;
const MAX_ENTRIES = 1000;
const MAX_NESTED_ARCHIVES = 200;
const MAX_NESTING_DEPTH = 2;
const MAX_HTML_BYTES = 150 * 1024;
const CLICK_PLACEHOLDER = '__CBG_CLICK_TARGET__';

interface ZipEntryInfo {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

interface Html5Manifest {
  title?: unknown;
  description?: unknown;
  width?: unknown;
  height?: unknown;
  source?: unknown;
  clicktags?: unknown;
}

interface Html5Candidate {
  origin: string;
  packageName: string;
  manifestPath: string;
  htmlPath: string;
  manifest: Html5Manifest;
  html: string;
  files: Record<string, Uint8Array>;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

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
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error(`${label} uses ZIP64, which is not supported by the safe browser importer.`);
    }
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
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index + 1) : '';
}

function stem(filename: string): string {
  return filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
}

function prettyDimension(width: number, height: number): string {
  return `${width} × ${height}`;
}

function dimInText(value: string): boolean {
  return /\d{1,4}\s*[xX×]\s*\d{1,4}/.test(value);
}

function dimensionOnlyName(value: string): boolean {
  return /^\s*\d{1,4}\s*[xX×]\s*\d{1,4}\s*$/.test(value);
}

function cleanPackageName(value: string): string {
  return stem(value).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function manifestClickUrls(manifest: Html5Manifest): string[] {
  if (!manifest.clicktags || typeof manifest.clicktags !== 'object') return [];
  return [...new Set(Object.values(manifest.clicktags as Record<string, unknown>)
    .filter((value): value is string => typeof value === 'string' && /^https?:\/\//i.test(value.trim()))
    .map((value) => value.trim()))];
}

function manifestDimension(manifest: Html5Manifest): { width: number; height: number } | null {
  const width = Number(manifest.width);
  const height = Number(manifest.height);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
}

function htmlDimension(html: string): { width: number; height: number } | null {
  const meta = html.match(/<meta\b[^>]*name\s*=\s*["']ad\.size["'][^>]*content\s*=\s*["'][^"']*width\s*=\s*(\d+)[^"']*height\s*=\s*(\d+)[^"']*["'][^>]*>/i)
    ?? html.match(/<meta\b[^>]*content\s*=\s*["'][^"']*width\s*=\s*(\d+)[^"']*height\s*=\s*(\d+)[^"']*["'][^>]*name\s*=\s*["']ad\.size["'][^>]*>/i);
  return meta ? { width: Number(meta[1]), height: Number(meta[2]) } : null;
}

function isRemoteReference(value: string): boolean {
  const v = value.trim();
  return !v || /^(?:https?:|data:|blob:|\/\/|#|javascript:|mailto:|tel:)/i.test(v);
}

function findRequiredLocalAssets(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const refs = new Set<string>();
  doc.querySelectorAll<HTMLElement>('[src],[href]').forEach((node) => {
    for (const attr of ['src', 'href']) {
      const value = node.getAttribute(attr);
      if (value && !isRemoteReference(value)) refs.add(value.trim());
    }
  });
  const cssText = [...doc.querySelectorAll('style')].map((node) => node.textContent ?? '').join('\n');
  for (const match of cssText.matchAll(/url\(\s*["']?([^\)"']+)["']?\s*\)/gi)) {
    const value = (match[1] ?? '').trim();
    if (value && !isRemoteReference(value)) refs.add(value);
  }
  return [...refs].filter((value) => !/^window\.location\.href$/i.test(value));
}

function escapeForInlineScript(value: string): string {
  // JSON gives us a valid JS string. Breaking literal </script prevents the outer ad tag from ending early.
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

function replaceManifestClickTargets(html: string, urls: string[]): { html: string; replaced: number } {
  let output = html;
  let replaced = 0;
  for (const url of urls) {
    const pieces = output.split(url);
    if (pieces.length > 1) {
      replaced += pieces.length - 1;
      output = pieces.join(CLICK_PLACEHOLDER);
    }
  }
  return { html: output, replaced };
}

function createInlineWrapper(html: string, width: number, height: number, originalClickUrl: string | null): string {
  const htmlLiteral = escapeForInlineScript(html);
  const clickLiteral = escapeForInlineScript(originalClickUrl ?? '');
  return `<script>(function(){var cbgHtml=${htmlLiteral};var cbgClickTarget=${clickLiteral};if(cbgClickTarget){cbgHtml=cbgHtml.split(${escapeForInlineScript(CLICK_PLACEHOLDER)}).join(cbgClickTarget);}var cbgFrame=document.createElement("iframe");cbgFrame.width="${width}";cbgFrame.height="${height}";cbgFrame.setAttribute("frameborder","0");cbgFrame.setAttribute("scrolling","no");cbgFrame.setAttribute("allow","autoplay");cbgFrame.style.border="0";cbgFrame.style.display="block";cbgFrame.srcdoc=cbgHtml;var cbgScript=document.currentScript;var cbgParent=cbgScript&&cbgScript.parentNode?cbgScript.parentNode:document.body;cbgParent.insertBefore(cbgFrame,cbgScript||null);})();</script>`;
}

export function updateHtml5ZipClicktag(script: string, landingPage: string): { script: string; updated: boolean } {
  if (!landingPage || !script.includes(CLICK_PLACEHOLDER)) return { script, updated: false };
  const encoded = encodeURIComponent(landingPage);
  const value = `\${HAWK_CLICK}${encoded}`;
  const pattern = /(var\s+cbgClickTarget\s*=)\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/;
  if (!pattern.test(script)) return { script, updated: false };
  return { script: script.replace(pattern, `$1${escapeForInlineScript(value)}`), updated: true };
}

function parseManifest(bytes: Uint8Array, path: string): Html5Manifest {
  try {
    return JSON.parse(strFromU8(bytes)) as Html5Manifest;
  } catch {
    throw new Error(`Could not parse ${path}.`);
  }
}

function collectDirectCandidates(files: Record<string, Uint8Array>, origin: string, packageName: string): Html5Candidate[] {
  const output: Html5Candidate[] = [];
  for (const manifestPathRaw of Object.keys(files).filter((name) => /(?:^|\/)manifest\.json$/i.test(name))) {
    const manifestPath = normalizePath(manifestPathRaw);
    const manifest = parseManifest(files[manifestPathRaw], manifestPath);
    const base = dirname(manifestPath);
    const source = typeof manifest.source === 'string' && manifest.source.trim() ? normalizePath(manifest.source.trim()) : 'index.html';
    const htmlPath = normalizePath(`${base}${source}`);
    const htmlBytes = files[htmlPath] ?? files[Object.keys(files).find((key) => normalizePath(key) === htmlPath) ?? ''];
    if (!htmlBytes) continue;
    if (htmlBytes.byteLength > MAX_HTML_BYTES) throw new Error(`${origin}: ${htmlPath} is larger than ${Math.round(MAX_HTML_BYTES / 1024)} KB and cannot safely be converted to one Excel JavaScript cell.`);
    output.push({ origin, packageName, manifestPath, htmlPath, manifest, html: strFromU8(htmlBytes), files });
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

  if (packageStem && !dimensionOnlyName(packageStem)) {
    return { name: dimInText(packageStem) ? packageStem : `${packageStem} - ${dim}`, source: 'html5-package' };
  }
  if (manifestTitle && !genericManifestTitle) {
    return { name: dimInText(manifestTitle) ? manifestTitle : `${manifestTitle} - ${dim}`, source: 'html5-manifest' };
  }
  const outer = cleanPackageName(outerFilename) || 'HTML5 creative';
  return { name: dimInText(outer) ? outer : `${outer} - ${dim}`, source: 'html5-package' };
}

export function parseHtml5ZipBundle(buffer: ArrayBuffer, filename: string, sizes: TemplateOption[]): ParseResult {
  const issues: ParseIssue[] = [];
  const creatives: Creative[] = [];
  const bytes = new Uint8Array(buffer);
  const candidates = collectCandidates(bytes, filename, filename, 0, { count: 0 });
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
    if (manifestDim && htmlDim && (manifestDim.width !== htmlDim.width || manifestDim.height !== htmlDim.height)) {
      warnings.push(`manifest.json says ${manifestDim.width}x${manifestDim.height}, but index.html says ${htmlDim.width}x${htmlDim.height}. The manifest dimension is used.`);
    }

    const localAssets = findRequiredLocalAssets(candidate.html);
    if (localAssets.length) warnings.push(`This HTML references local asset${localAssets.length === 1 ? '' : 's'} (${localAssets.slice(0, 4).join(', ')}${localAssets.length > 4 ? ', …' : ''}). Inline conversion is not safe for this package.`);

    const clickUrls = manifestClickUrls(candidate.manifest);
    clickUrls.forEach((url) => landingPages.add(url));
    if (clickUrls.length > 1) warnings.push(`manifest.json contains multiple click destinations (${clickUrls.length}). Automatic Hawk click rewriting is disabled for this creative.`);
    const clickUrl = clickUrls.length === 1 ? clickUrls[0] : null;
    const patched = clickUrl ? replaceManifestClickTargets(candidate.html, [clickUrl]) : { html: candidate.html, replaced: 0 };
    if (clickUrl && patched.replaced === 0) warnings.push('A click URL exists in manifest.json but was not found in index.html. The original HTML click logic is preserved and cannot be rewritten automatically.');
    if (!clickUrl) warnings.push('No single click destination was found in manifest.json. Hawk click rewriting is unavailable for this creative.');

    const nameResult = chooseName(candidate, filename, dimension.width, dimension.height);
    const script = createInlineWrapper(patched.html, dimension.width, dimension.height, patched.replaced > 0 ? clickUrl : null);
    if (script.length > 32767) warnings.push(`Converted JavaScript is ${script.length.toLocaleString('en-US')} characters, above Excel's 32,767-character cell limit.`);

    const dimensionKey = `${dimension.width}x${dimension.height}`;
    const size = resolveTemplateSize(dimensionKey, sizeOptionsMap);
    if (size.warning) warnings.push(size.warning);
    const canInline = localAssets.length === 0 && script.length <= 32767;
    creatives.push({
      id: `html5zip-${index}`,
      sourceType: 'html5zip',
      sourceComment: `${candidate.origin} · ${candidate.manifestPath}`,
      name: nameResult.name,
      nameSource: nameResult.source,
      width: dimension.width,
      height: dimension.height,
      dimension: dimensionKey,
      script,
      sizeStatus: size.status,
      sizeOptions: size.options,
      mappedSizeLabel: size.label,
      included: Boolean(size.label) && canInline,
      warnings,
      html5ZipConvertible: canInline,
      detectedLandingPage: clickUrl ?? undefined,
    });
  });

  if (!candidates.length) issues.push({ type: 'error', message: 'No HTML5 creative package containing manifest.json + index.html was found in this ZIP.' });
  if (landingPages.size > 1) issues.push({ type: 'warning', message: `The ZIP contains ${landingPages.size} different click destinations. Landing Page was not auto-filled; review each creative before using one campaign-level URL.` });
  const detectedLandingPage = landingPages.size === 1 ? [...landingPages][0] : undefined;
  return { creatives, issues, itemCount: candidates.length, detectedLandingPage };
}
