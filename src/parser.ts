import type { Creative, ParseResult, SourceType, TemplateOption } from './types';

const normalizeComment = (value: string) => value.replace(/\s*\r?\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
const dimensionOnly = /^\d{1,4}\s*[xX×]\s*\d{1,4}$/;
const genericHeaderTail = /^(all\s+javascript\s+tags|all\s+tags|javascript\s+tags)$/i;

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

export function extractLandingPageFromScripts(text: string): string {
  const match = text.match(/data-clicktag\s*=\s*["']\$\{HAWK_CLICK\}([^"']+)["']/i);
  if (!match?.[1]) return '';
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

export function hasHawkClicktag(script: string): boolean {
  return /data-clicktag\s*=\s*["']\$\{HAWK_CLICK\}/i.test(script);
}

export function hasClicktagAttribute(script: string): boolean {
  return /data-clicktag\s*=\s*["'][^"']*["']/i.test(script);
}

export function detectTextSource(text: string): 'seenthis' | 'adform' | null {
  if (/video\.seenthis\.se|data-id\s*=|data-src\s*=\s*["'][^"']*seenthis/i.test(text)) return 'seenthis';
  if (/track\.adform\.net|^Tag\s+\d+\..*\bSize:\s*\d+x\d+/im.test(text)) return 'adform';
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

export function buildDimensionIndex(sizes: TemplateOption[]): Map<string, string> {
  const grouped = buildDimensionOptions(sizes);
  const result = new Map<string, string>();
  for (const [dim, options] of grouped.entries()) {
    const ids = new Set(options.map((option) => option.id));
    if (ids.size > 1) continue;
    const exact = options.find((option) => option.label.replace(/\s/g, '').toLowerCase() === dim.toLowerCase());
    result.set(dim, (exact ?? options[0]).label);
  }
  return result;
}

export function resolveTemplateSize(dimension: string, sizeOptionsMap: Map<string, TemplateOption[]>): {
  status: Creative['sizeStatus'];
  options: TemplateOption[];
  label: string | null;
  warning?: string;
} {
  const options = sizeOptionsMap.get(dimension) ?? [];
  if (!options.length) {
    return { status: 'missing', options: [], label: null, warning: `Size ${dimension} is missing from the template and is automatically excluded from export.` };
  }

  const ids = new Set(options.map((option) => option.id));
  if (ids.size > 1) {
    return {
      status: 'ambiguous', options, label: null,
      warning: `Size ${dimension} matches multiple template options (${options.map((option) => option.label).join(' / ')}). Choose the correct size before export.`,
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
  if (trackingOnly) warnings.push('This appears to be a tracking-only tag, not a normal display creative. It is excluded by default and should be reviewed before use.');
  return {
    id, sourceType, sourceComment, name, nameSource, width, height, dimension, script, creativeType: 'javascript',
    sizeStatus: size.status, sizeOptions: size.options, mappedSizeLabel: size.label,
    included: Boolean(size.label) && !trackingOnly, warnings, trackingOnly,
  };
}

export function parseSeenThisFile(text: string, sizes: TemplateOption[]): ParseResult {
  const sizeOptionsMap = buildDimensionOptions(sizes);
  const creatives: Creative[] = [];
  const issues: ParseResult['issues'] = [];
  const headerComment = extractHeaderComment(text);
  const blockRegex = /(?:<!--((?:(?!-->)[\s\S])*)-->\s*)?(<script\b[\s\S]*?<\/script>)/gi;
  let match: RegExpExecArray | null;
  let itemCount = 0;

  while ((match = blockRegex.exec(text)) !== null) {
    const index = itemCount++;
    const sourceComment = normalizeComment(match[1] ?? '');
    const rawScript = match[2].trim();
    const script = sourceComment ? `<!-- ${sourceComment} -->\n${rawScript}` : rawScript;
    const scriptDimension = getSeenThisScriptDimension(rawScript);
    const commentDimension = getCommentDimension(sourceComment);
    const dimension = scriptDimension ?? commentDimension;

    if (!dimension) {
      issues.push({ type: 'error', message: `SeenThis script ${index + 1} has no readable dimension and was not added.` });
      continue;
    }

    const warnings: string[] = [];
    if (!sourceComment) warnings.push('Missing script comment; the name was created from the file header or fallback.');
    if (scriptDimension && commentDimension && !sameDim(scriptDimension, commentDimension)) {
      warnings.push(`The comment says ${commentDimension.width}x${commentDimension.height}, but the script says ${scriptDimension.width}x${scriptDimension.height}. The script dimension is used.`);
    }

    const nameResult = buildSeenThisCreativeName(sourceComment, headerComment, dimension.width, dimension.height, index);
    if (nameResult.source === 'fallback') warnings.push('The creative name could not be identified confidently and needs manual review.');

    creatives.push(finalizeCreative('seenthis', `seenthis-${index}`, nameResult.name, nameResult.source,
      dimension.width, dimension.height, script, sourceComment, warnings, sizeOptionsMap));
  }

  if (itemCount === 0) issues.push({ type: 'error', message: 'No SeenThis <script> tags were found in the file.' });
  return { creatives, issues, itemCount };
}

export function parseAdformFile(text: string, sizes: TemplateOption[]): ParseResult {
  const sizeOptionsMap = buildDimensionOptions(sizes);
  const creatives: Creative[] = [];
  const issues: ParseResult['issues'] = [];
  const headerRegex = /^Tag\s+(\d+)\.\s*(.*?)\s*\(([^)\n\r]*Size:\s*(\d{1,4})x(\d{1,4})[^)\n\r]*)\)\s*$/gim;
  const headers = [...text.matchAll(headerRegex)];

  headers.forEach((header, index) => {
    const start = (header.index ?? 0) + header[0].length;
    const end = index + 1 < headers.length ? (headers[index + 1].index ?? text.length) : text.length;
    const block = text.slice(start, end);
    const name = normalizeComment(header[2] ?? '') || `Adform creative ${index + 1}`;
    const width = Number(header[4]);
    const height = Number(header[5]);
    const tagMatch = block.match(/(<script\b[\s\S]*?<\/script>\s*(?:<noscript>[\s\S]*?<\/noscript>)?)/i);
    const warnings: string[] = [];

    if (!tagMatch?.[1]) {
      issues.push({ type: 'error', message: `Adform tag ${index + 1} (${name}) has no readable JavaScript tag and was not added.` });
      return;
    }

    const script = tagMatch[1].trim();
    if (!/track\.adform\.net/i.test(script)) warnings.push('The tag does not contain the expected track.adform.net host. Review manually.');
    if (!/gdpr=/i.test(script)) warnings.push('No GDPR parameter was detected in this Adform tag. Review the supplied tag before export.');
    creatives.push(finalizeCreative('adform', `adform-${index}`, name, 'adform-header', width, height,
      script, header[0].trim(), warnings, sizeOptionsMap));
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
