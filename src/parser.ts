import type { Creative, ParseResult, SourceType, TemplateOption } from './types';

const normalizeComment = (value: string) => value.replace(/\s*\r?\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
const dimensionOnly = /^\d{1,4}\s*[xX×]\s*\d{1,4}$/;
const genericHeaderTail = /^(all\s+javascript\s+tags|all\s+tags|javascript\s+tags)$/i;
const seenThisLoader = /video\.seenthis\.se\/public\/tag-loader\//i;
const seenThisBuild = /data-src\s*=\s*["'][^"']*video\.seenthis\.se\/v2\/builds\//i;

function splitSegments(value: string): string[] {
  return normalizeComment(value).split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
}

function dimFromSegment(value: string): { width: number; height: number } | null {
  const match = value.match(/^(\d{1,4})\s*[xX×]\s*(\d{1,4})$/);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function sameDim(a: { width: number; height: number } | null, b: { width: number; height: number } | null): boolean {
  return Boolean(a && b && a.width === b.width && a.height === b.height);
}

function extractHeaderComment(text: string): string {
  const firstScriptIndex = text.search(/<script\b/i);
  const headerArea = firstScriptIndex >= 0 ? text.slice(0, firstScriptIndex) : text;
  const comments = [...headerArea.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => normalizeComment(match[1] ?? ''));
  return comments.find((comment) => comment && !/^adserver\s*:/i.test(comment) && !splitSegments(comment).every((part) => dimensionOnly.test(part))) ?? '';
}

function cleanHeaderBase(headerComment: string): string {
  const parts = splitSegments(headerComment);
  while (parts.length && genericHeaderTail.test(parts[parts.length - 1])) parts.pop();
  // Customer exports commonly start with an agency/account prefix. The completed Hawk file
  // uses the campaign portion rather than that outer prefix when at least three segments exist.
  if (parts.length >= 3) parts.shift();
  return parts.join(' - ').trim();
}

function preferredPrettyDimension(comment: string, width: number, height: number): string {
  const parts = splitSegments(comment);
  const exact = parts.find((part) => {
    const dim = dimFromSegment(part);
    return sameDim(dim, { width, height }) && part.includes('×');
  });
  return exact ?? `${width} × ${height}`;
}

function buildSeenThisCreativeName(
  localComment: string,
  headerComment: string,
  width: number,
  height: number,
  fallbackIndex: number,
): { name: string; source: Creative['nameSource'] } {
  const localParts = splitSegments(localComment);
  const semanticLocalParts = localParts.filter((part) => !dimensionOnly.test(part));
  const prettyDim = preferredPrettyDimension(localComment, width, height);

  if (semanticLocalParts.length) {
    const parts = [...localParts];
    if (parts.length >= 2 && sameDim(dimFromSegment(parts.at(-1)!), dimFromSegment(parts.at(-2)!))) parts.pop();

    const headerParts = splitSegments(headerComment);
    const firstLocal = parts[0]?.toLocaleLowerCase('sv-SE');
    const secondLocal = parts[1]?.toLocaleLowerCase('sv-SE');
    const firstHeader = headerParts[0]?.toLocaleLowerCase('sv-SE');
    if (headerParts.length >= 2 && (firstLocal === firstHeader || secondLocal === firstHeader)) {
      if (secondLocal === firstHeader) parts.shift();
      else if (headerParts.length >= 3) parts.shift();
    } else if (!headerComment && parts.length >= 5) {
      parts.shift();
    }

    const hasDimension = parts.some((part) => sameDim(dimFromSegment(part), { width, height }));
    const base = parts.join(' - ').trim();
    return {
      name: base ? (hasDimension ? base : `${base} - ${prettyDim}`) : `Creative ${fallbackIndex + 1} - ${prettyDim}`,
      source: base ? 'script-comment' : 'fallback',
    };
  }

  const headerBase = cleanHeaderBase(headerComment);
  if (headerBase) return { name: `${headerBase} - ${prettyDim}`, source: 'file-header' };
  return { name: `Creative ${fallbackIndex + 1} - ${prettyDim}`, source: 'fallback' };
}

function safeDecodeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const decoded = decodeURIComponent(trimmed);
    return /^https?:\/\//i.test(decoded) ? decoded : '';
  } catch {
    return /^https?:\/\//i.test(trimmed) ? trimmed : '';
  }
}

export function extractLandingPageFromScripts(text: string): string {
  const values = [...text.matchAll(/data-clicktag\s*=\s*["']([^"']*)["']/gi)]
    .map((match) => match[1] ?? '')
    .map((value) => value.replace(/^\$\{HAWK_CLICK\}/i, ''))
    .map(safeDecodeUrl)
    .filter(Boolean);
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : '';
}

export function hasHawkClicktag(script: string): boolean {
  return /data-clicktag\s*=\s*["']\$\{HAWK_CLICK\}/i.test(script);
}

export function hasClicktagAttribute(script: string): boolean {
  return /data-clicktag\s*=\s*["'][^"']*["']/i.test(script);
}

export function detectTextSource(text: string): 'seenthis' | 'adform' | null {
  // Keep detection conservative: a generic data-id attribute is not enough to call a file SeenThis.
  if (seenThisLoader.test(text) || seenThisBuild.test(text)) return 'seenthis';
  if (/track\.adform\.net/i.test(text) || /^\s*Tag\s+\d+\..*\bSize\s*:\s*\d{1,4}\s*[xX×]\s*\d{1,4}/im.test(text)) return 'adform';
  return null;
}

function getSeenThisScriptDimension(script: string): { width: number; height: number } | null {
  const widthMatch = script.match(/data-width\s*=\s*["']\s*(\d+)\s*(?:px)?\s*["']/i);
  const heightMatch = script.match(/data-height\s*=\s*["']\s*(\d+)\s*(?:px)?\s*["']/i);
  if (!widthMatch || !heightMatch) return null;
  return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
}

function getCommentDimension(comment: string): { width: number; height: number } | null {
  const matches = [...comment.matchAll(/(\d{1,4})\s*[xX×]\s*(\d{1,4})/g)];
  const last = matches.at(-1);
  if (!last) return null;
  return { width: Number(last[1]), height: Number(last[2]) };
}

export function buildDimensionOptions(sizes: TemplateOption[]): Map<string, TemplateOption[]> {
  const grouped = new Map<string, TemplateOption[]>();
  for (const option of sizes) {
    const match = option.label.match(/(\d{1,4})\s*[xX×]\s*(\d{1,4})/i);
    if (!match) continue;
    const dim = `${Number(match[1])}x${Number(match[2])}`;
    const list = grouped.get(dim) ?? [];
    list.push(option);
    grouped.set(dim, list);
  }
  return grouped;
}

export function resolveTemplateSize(dimension: string, sizeOptionsMap: Map<string, TemplateOption[]>): {
  status: Creative['sizeStatus'];
  options: TemplateOption[];
  label: string | null;
  warning?: string;
} {
  const options = sizeOptionsMap.get(dimension) ?? [];
  if (!options.length) {
    return { status: 'missing', options: [], label: null, warning: `Size ${dimension} is missing from the template and is excluded from export.` };
  }

  const ids = new Set(options.map((option) => option.id));
  if (ids.size > 1) {
    return {
      status: 'ambiguous', options, label: null,
      warning: `Size ${dimension} matches multiple template options (${options.map((option) => option.label).join(' / ')}). Choose the correct size before including this row.`,
    };
  }

  const exact = options.find((option) => option.label.replace(/\s/g, '').toLowerCase() === dimension.toLowerCase());
  return { status: 'matched', options, label: (exact ?? options[0]).label };
}

function finalizeCreative(
  sourceType: SourceType,
  id: string,
  name: string,
  nameSource: Creative['nameSource'],
  width: number,
  height: number,
  script: string,
  sourceComment: string,
  warnings: string[],
  sizeOptionsMap: Map<string, TemplateOption[]>,
  trackingOnly = false,
): Creative {
  const dimension = `${width}x${height}`;
  const size = resolveTemplateSize(dimension, sizeOptionsMap);
  if (size.warning) warnings.push(size.warning);
  if (trackingOnly) warnings.push('This appears to be a tracking-only tag rather than a display creative. It is excluded by default.');
  return {
    id, sourceType, sourceComment, name, nameSource, width, height, dimension, script, creativeType: 'javascript',
    sizeStatus: size.status, sizeOptions: size.options, mappedSizeLabel: size.label,
    included: Boolean(size.label) && !trackingOnly, warnings, trackingOnly,
  };
}

function isSeenThisCreativeScript(script: string): boolean {
  return seenThisLoader.test(script) || seenThisBuild.test(script);
}

export function parseSeenThisFile(text: string, sizes: TemplateOption[]): ParseResult {
  const sizeOptionsMap = buildDimensionOptions(sizes);
  const creatives: Creative[] = [];
  const issues: ParseResult['issues'] = [];
  const headerComment = extractHeaderComment(text);
  const blockRegex = /(?:<!--((?:(?!-->)[\s\S])*)-->\s*)?(<script\b[\s\S]*?<\/script>)/gi;
  let match: RegExpExecArray | null;
  let seenThisTagCount = 0;

  while ((match = blockRegex.exec(text)) !== null) {
    const sourceComment = normalizeComment(match[1] ?? '');
    const rawScript = match[2].trim();
    if (!isSeenThisCreativeScript(rawScript)) continue;
    const index = seenThisTagCount++;
    const script = sourceComment ? `<!-- ${sourceComment} -->\n${rawScript}` : rawScript;
    const scriptDimension = getSeenThisScriptDimension(rawScript);
    const commentDimension = getCommentDimension(sourceComment);
    const dimension = scriptDimension ?? commentDimension;

    if (!dimension) {
      issues.push({ type: 'error', message: `SeenThis tag ${index + 1} has no readable dimension and was skipped.` });
      continue;
    }

    const warnings: string[] = [];
    if (!sourceComment) warnings.push('No tag comment was found; the name was built from the file header or a fallback.');
    if (scriptDimension && commentDimension && !sameDim(scriptDimension, commentDimension)) {
      warnings.push(`The comment says ${commentDimension.width}x${commentDimension.height}, while the tag says ${scriptDimension.width}x${scriptDimension.height}. The tag dimension is used.`);
    }
    if (!hasClicktagAttribute(rawScript)) warnings.push('No data-clicktag attribute was found. Hawk clicktag insertion will not be possible for this row.');

    const nameResult = buildSeenThisCreativeName(sourceComment, headerComment, dimension.width, dimension.height, index);
    if (nameResult.source === 'fallback') warnings.push('The creative name could not be identified confidently. Review the generated name.');

    creatives.push(finalizeCreative('seenthis', `seenthis-${index}`, nameResult.name, nameResult.source,
      dimension.width, dimension.height, script, sourceComment, warnings, sizeOptionsMap));
  }

  if (seenThisTagCount === 0) issues.push({ type: 'error', message: 'No SeenThis loader tags were found in the file.' });
  return { creatives, issues, itemCount: seenThisTagCount, detectedLandingPage: extractLandingPageFromScripts(text) || undefined };
}

function extractAdformDimension(header: string, block: string): { width: number; height: number } | null {
  const headerMatch = header.match(/\bSize\s*:\s*(\d{1,4})\s*[xX×]\s*(\d{1,4})/i);
  if (headerMatch) return { width: Number(headerMatch[1]), height: Number(headerMatch[2]) };
  const imgMatch = block.match(/<img\b[^>]*\bwidth=["']?(\d{1,4})["']?[^>]*\bheight=["']?(\d{1,4})["']?/i)
    ?? block.match(/<img\b[^>]*\bheight=["']?(\d{1,4})["']?[^>]*\bwidth=["']?(\d{1,4})["']?/i);
  if (!imgMatch) return null;
  if (/\bwidth=/i.test(imgMatch[0]) && imgMatch[0].search(/\bwidth=/i) < imgMatch[0].search(/\bheight=/i)) {
    return { width: Number(imgMatch[1]), height: Number(imgMatch[2]) };
  }
  return { width: Number(imgMatch[2]), height: Number(imgMatch[1]) };
}

export function parseAdformFile(text: string, sizes: TemplateOption[]): ParseResult {
  const sizeOptionsMap = buildDimensionOptions(sizes);
  const creatives: Creative[] = [];
  const issues: ParseResult['issues'] = [];
  const headerRegex = /^\s*Tag\s+(\d+)\.\s*(.+?)\s*$/gim;
  const headers = [...text.matchAll(headerRegex)].filter((match) => /\bSize\s*:/i.test(match[0]));

  headers.forEach((header, index) => {
    const start = (header.index ?? 0) + header[0].length;
    const end = index + 1 < headers.length ? (headers[index + 1].index ?? text.length) : text.length;
    const block = text.slice(start, end);
    const headerLine = header[0].trim();
    const namePart = (header[2] ?? '').replace(/\s*\([^)]*\bSize\s*:[^)]*\)\s*$/i, '').trim();
    const name = normalizeComment(namePart) || `Adform creative ${index + 1}`;
    const dimension = extractAdformDimension(headerLine, block);
    const tagMatch = block.match(/(<script\b[\s\S]*?<\/script>\s*(?:<noscript>[\s\S]*?<\/noscript>)?)/i);
    const warnings: string[] = [];

    if (!dimension) {
      issues.push({ type: 'error', message: `Adform tag ${index + 1} (${name}) has no readable size and was skipped.` });
      return;
    }
    if (!tagMatch?.[1]) {
      issues.push({ type: 'error', message: `Adform tag ${index + 1} (${name}) has no readable JavaScript tag and was skipped.` });
      return;
    }

    const script = tagMatch[1].trim();
    if (!/track\.adform\.net/i.test(script)) warnings.push('The tag does not contain the expected track.adform.net host. Review the supplied tag.');
    if (!/gdpr=/i.test(script)) warnings.push('No GDPR parameter was detected in this Adform tag. Review the supplied tag.');
    creatives.push(finalizeCreative('adform', `adform-${index}`, name, 'adform-header', dimension.width, dimension.height,
      script, headerLine, warnings, sizeOptionsMap));
  });

  if (!headers.length) issues.push({ type: 'error', message: 'No Adform “Tag N. … Size: WxH” blocks were found in the file.' });
  return { creatives, issues, itemCount: headers.length };
}

export function updateHawkClicktag(script: string, landingPage: string): { script: string; updated: boolean } {
  if (!landingPage) return { script, updated: false };
  const encoded = encodeURIComponent(landingPage);
  const pattern = /(data-clicktag\s*=\s*["'])[^"']*(["'])/i;
  if (!pattern.test(script)) return { script, updated: false };
  return { script: script.replace(pattern, `$1\${HAWK_CLICK}${encoded}$2`), updated: true };
}
