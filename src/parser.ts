import type { Creative, ParseResult, TemplateOption } from './types';

const normalizeComment = (value: string) => value.replace(/\s*\r?\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
const dimensionOnly = /^\d{2,4}\s*[xX×]\s*\d{2,4}$/;
const genericHeaderTail = /^(all\s+javascript\s+tags|all\s+tags|javascript\s+tags)$/i;

function splitSegments(value: string): string[] {
  return normalizeComment(value).split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
}

function dimFromSegment(value: string): { width: number; height: number } | null {
  const match = value.match(/^(\d{2,4})\s*[xX×]\s*(\d{2,4})$/);
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

  // The example exports use the first segment as advertiser/account and the
  // remaining segments as campaign/creative identity. Keep short headers intact.
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

function buildCreativeName(
  localComment: string,
  headerComment: string,
  width: number,
  height: number,
  fallbackIndex: number,
): { name: string; source: Creative['nameSource'] } {
  const localParts = splitSegments(localComment);
  const semanticLocalParts = localParts.filter((part) => !dimensionOnly.test(part));
  const prettyDim = preferredPrettyDimension(localComment, width, height);

  // Format A: the per-script comment contains the full creative name.
  // Ex: Account - Property - Campaign - Parken - 980 × 300 - 980x300
  if (semanticLocalParts.length) {
    const parts = [...localParts];

    // Remove only the final duplicated size when the last two segments describe
    // the same dimension. Keep the first, usually human-readable, dimension.
    if (parts.length >= 2 && sameDim(dimFromSegment(parts.at(-1)!), dimFromSegment(parts.at(-2)!))) {
      parts.pop();
    }

    // If the local comment starts with the same advertiser/account as the file header,
    // remove that prefix to match the desired exported naming structure.
    const headerParts = splitSegments(headerComment);
    const firstLocal = parts[0]?.toLocaleLowerCase('sv-SE');
    const secondLocal = parts[1]?.toLocaleLowerCase('sv-SE');
    const firstHeader = headerParts[0]?.toLocaleLowerCase('sv-SE');
    if (headerParts.length >= 2 && (firstLocal === firstHeader || secondLocal === firstHeader)) {
      // The header may itself omit the advertiser prefix. If the local comment then
      // contains the header’s first segment in position 2, position 1 is treated
      // as advertiser/account and removed.
      if (secondLocal === firstHeader) parts.shift();
      else if (headerParts.length >= 3) parts.shift();
    } else if (!headerComment && parts.length >= 5) {
      // Conservative fallback for long SeenThis comments when no global header exists.
      parts.shift();
    }

    const hasDimension = parts.some((part) => sameDim(dimFromSegment(part), { width, height }));
    const base = parts.join(' - ').trim();
    return {
      name: base ? (hasDimension ? base : `${base} - ${prettyDim}`) : `Creative ${fallbackIndex + 1} - ${prettyDim}`,
      source: base ? 'script-comment' : 'fallback',
    };
  }

  // Format B: the per-script comment contains only the size. Use the file’s top
  // campaign comment for the creative identity and append the size.
  const headerBase = cleanHeaderBase(headerComment);
  if (headerBase) {
    return { name: `${headerBase} - ${prettyDim}`, source: 'file-header' };
  }

  return { name: `Creative ${fallbackIndex + 1} - ${prettyDim}`, source: 'fallback' };
}

export function extractLandingPageFromScripts(text: string): string {
  const match = text.match(/data-clicktag\s*=\s*["']\$\{HAWK_CLICK\}([^"']+)["']/i);
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function hasHawkClicktag(script: string): boolean {
  return /data-clicktag\s*=\s*["']\$\{HAWK_CLICK\}/i.test(script);
}

function getScriptDimension(script: string): { width: number; height: number } | null {
  const widthMatch = script.match(/data-width\s*=\s*["']\s*(\d+)\s*(?:px)?\s*["']/i);
  const heightMatch = script.match(/data-height\s*=\s*["']\s*(\d+)\s*(?:px)?\s*["']/i);
  if (!widthMatch || !heightMatch) return null;
  return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
}

function getCommentDimension(comment: string): { width: number; height: number } | null {
  const matches = [...comment.matchAll(/(\d{2,4})\s*[xX×]\s*(\d{2,4})/g)];
  const last = matches.at(-1);
  if (!last) return null;
  return { width: Number(last[1]), height: Number(last[2]) };
}

export function buildDimensionIndex(sizes: TemplateOption[]): Map<string, string> {
  const grouped = new Map<string, TemplateOption[]>();
  for (const option of sizes) {
    const match = option.label.match(/(\d{2,4})\s*[xX×]\s*(\d{2,4})/i);
    if (!match) continue;
    const dim = `${Number(match[1])}x${Number(match[2])}`;
    const list = grouped.get(dim) ?? [];
    list.push(option);
    grouped.set(dim, list);
  }

  const result = new Map<string, string>();
  for (const [dim, options] of grouped.entries()) {
    const exact = options.find((option) => option.label.replace(/\s/g, '').toLowerCase() === dim.toLowerCase());
    result.set(dim, (exact ?? options[0]).label);
  }
  return result;
}

export function parseCreativeFile(text: string, sizes: TemplateOption[]): ParseResult {
  const dimensionIndex = buildDimensionIndex(sizes);
  const creatives: Creative[] = [];
  const issues: ParseResult['issues'] = [];
  const headerComment = extractHeaderComment(text);

  const blockRegex = /(?:<!--((?:(?!-->)[\s\S])*)-->\s*)?(<script\b[\s\S]*?<\/script>)/gi;
  let match: RegExpExecArray | null;
  let scriptCount = 0;

  while ((match = blockRegex.exec(text)) !== null) {
    const index = scriptCount++;
    const sourceComment = normalizeComment(match[1] ?? '');
    const rawScript = match[2].trim();
    const script = sourceComment ? `<!-- ${sourceComment} -->\n${rawScript}` : rawScript;
    const scriptDimension = getScriptDimension(rawScript);
    const commentDimension = getCommentDimension(sourceComment);
    const dimension = scriptDimension ?? commentDimension;

    if (!dimension) {
      issues.push({ type: 'error', message: `Script ${index + 1} has no readable dimension and was not added.` });
      continue;
    }

    const warnings: string[] = [];
    if (!sourceComment) warnings.push('Missing script comment; the name was created from the file header or fallback.');
    if (scriptDimension && commentDimension && (
      scriptDimension.width !== commentDimension.width || scriptDimension.height !== commentDimension.height
    )) {
      warnings.push(`The comment says ${commentDimension.width}x${commentDimension.height}, but the script says ${scriptDimension.width}x${scriptDimension.height}. The script dimension is used.`);
    }

    const dim = `${dimension.width}x${dimension.height}`;
    const matchedSizeLabel = dimensionIndex.get(dim) ?? null;
    if (!matchedSizeLabel) warnings.push(`Size ${dim} is missing from the template and is automatically excluded from export.`);

    const nameResult = buildCreativeName(sourceComment, headerComment, dimension.width, dimension.height, index);
    if (nameResult.source === 'fallback') warnings.push('The creative name could not be identified confidently and needs manual review.');

    creatives.push({
      id: `creative-${index}`,
      sourceComment,
      name: nameResult.name,
      nameSource: nameResult.source,
      width: dimension.width,
      height: dimension.height,
      dimension: dim,
      script,
      mappedSizeLabel: matchedSizeLabel,
      included: Boolean(matchedSizeLabel),
      warnings,
    });
  }

  if (scriptCount === 0) issues.push({ type: 'error', message: 'No <script> tags were found in the file.' });

  return { creatives, issues, scriptCount };
}

export function updateHawkClicktag(script: string, landingPage: string): { script: string; updated: boolean } {
  if (!landingPage) return { script, updated: false };
  const encoded = encodeURIComponent(landingPage);
  const pattern = /(data-clicktag\s*=\s*["'])\$\{HAWK_CLICK\}[^"']*(["'])/i;
  if (!pattern.test(script)) return { script, updated: false };
  return {
    script: script.replace(pattern, `$1\${HAWK_CLICK}${encoded}$2`),
    updated: true,
  };
}
