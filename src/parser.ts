import type { Creative, TemplateOption } from './types';

const normalizeComment = (value: string) => value.replace(/\s*\r?\n\s*/g, ' ').trim();

export function extractLandingPageFromScripts(text: string): string {
  const match = text.match(/data-clicktag\s*=\s*["']\$\{HAWK_CLICK\}([^"']+)["']/i);
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function cleanCreativeName(comment: string, width: number, height: number): string {
  let name = normalizeComment(comment);
  const dim = `${width}x${height}`;
  // SeenThis exports often duplicate the dimension at the end:
  // "... - 980 × 300 - 980x300". Remove only the final duplicate.
  const suffix = new RegExp(`\\s+-\\s+${width}\\s*[xX]\\s*${height}\\s*$`);
  if (suffix.test(name)) name = name.replace(suffix, '').trim();
  // If that left no dimension at all, keep a stable dimension suffix.
  if (!new RegExp(`${width}\\s*[xX×]\\s*${height}`).test(name)) {
    name = `${name} - ${dim}`;
  }
  return name;
}

function getDimension(comment: string, script: string): { width: number; height: number } | null {
  const widthMatch = script.match(/data-width\s*=\s*["']\s*(\d+)\s*(?:px)?\s*["']/i);
  const heightMatch = script.match(/data-height\s*=\s*["']\s*(\d+)\s*(?:px)?\s*["']/i);
  if (widthMatch && heightMatch) {
    return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
  }

  const matches = [...comment.matchAll(/(\d{2,4})\s*[xX×]\s*(\d{2,4})/g)];
  const last = matches.at(-1);
  if (!last) return null;
  return { width: Number(last[1]), height: Number(last[2]) };
}

export function buildDimensionIndex(sizes: TemplateOption[]): Map<string, string> {
  const grouped = new Map<string, TemplateOption[]>();
  for (const option of sizes) {
    const match = option.label.match(/(\d{2,4})\s*x\s*(\d{2,4})/i);
    if (!match) continue;
    const dim = `${Number(match[1])}x${Number(match[2])}`;
    const list = grouped.get(dim) ?? [];
    list.push(option);
    grouped.set(dim, list);
  }

  const result = new Map<string, string>();
  for (const [dim, options] of grouped.entries()) {
    const exact = options.find((option) => option.label.trim().toLowerCase() === dim.toLowerCase());
    result.set(dim, (exact ?? options[0]).label);
  }
  return result;
}

export function parseCreativeFile(
  text: string,
  sizes: TemplateOption[],
): Creative[] {
  const dimensionIndex = buildDimensionIndex(sizes);
  const result: Creative[] = [];
  const blockRegex = /<!--((?:(?!-->)[\s\S])*)-->\s*(<script\b[\s\S]*?<\/script>)/gi;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = blockRegex.exec(text)) !== null) {
    const sourceComment = normalizeComment(match[1]);
    const script = `<!-- ${sourceComment} -->\n${match[2].trim()}`;
    const dimension = getDimension(sourceComment, script);
    if (!dimension) continue;

    const dim = `${dimension.width}x${dimension.height}`;
    const matchedSizeLabel = dimensionIndex.get(dim) ?? null;
    result.push({
      id: `creative-${index++}`,
      sourceComment,
      name: cleanCreativeName(sourceComment, dimension.width, dimension.height),
      width: dimension.width,
      height: dimension.height,
      dimension: dim,
      script,
      mappedSizeLabel: matchedSizeLabel,
      clicktagUpdated: false,
    });
  }

  return result;
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
