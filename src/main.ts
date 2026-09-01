import './style.css';
import { detectTextSource, hasClicktagAttribute, hasHawkClicktag, parseAdformFile, parseSeenThisFile } from './parser';
import { parseGoogleWorkbook } from './google';
import { generateWorkbook, readTemplateConfig } from './xlsx';
import type { Creative, ExportSettings, ParseIssue, ReviewFilter, SourceType, TemplateConfig } from './types';

const APP_VERSION = '2.0.0';
const TEMPLATE_URL = '/BatchUploadCreatives-template.xlsx';
const DEFAULT_PREVIEW = 'https://publisher.com/ads/preview.png';
const LAST_SETTINGS_KEY = 'creative-batch-generator:last-settings:v5';
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const EXCEL_CELL_MAX_CHARS = 32767;

let templateBytes = new Uint8Array();
let templateConfig: TemplateConfig = { categories: [], sizes: [], creativeTypes: [], adServers: [], maxCreatives: 0, version: 'unknown' };
let creatives: Creative[] = [];
let parseIssues: ParseIssue[] = [];
let sourceItemCount = 0;
let selectedSource: SourceType | null = null;
let sourceFileName = '';
let reviewFilter: ReviewFilter = 'all';

function loadLastSettings(): Partial<ExportSettings> {
  try { return JSON.parse(localStorage.getItem(LAST_SETTINGS_KEY) ?? '{}'); } catch { return {}; }
}

function esc(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
}

function isHttpUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; }
}

function sourceLabel(type: SourceType): string {
  switch (type) {
    case 'seenthis': return 'SeenThis';
    case 'adform': return 'Adform';
    case 'google': return 'Google Campaign Manager';
  }
}


function renderShell(): void {
  const last = loadLastSettings();
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <header class="app-header">
      <div class="nav-shell">
        <div class="brand"><span class="brand-mark">H</span><span>Creative Batch Generator</span></div>
        <div class="header-meta"><span class="secure-dot"></span>Runs locally in your browser <span class="version-pill">v${APP_VERSION}</span></div>
      </div>
      <div class="intro-shell">
        <div>
          <span class="eyebrow">Hawk creative operations</span>
          <h1>Build upload-ready creative batches in minutes.</h1>
          <p>Drop in a customer delivery. Source, creative type, names and dimensions are detected automatically; you only review exceptions and campaign-level fields.</p>
        </div>
        <div class="supported-card">
          <span class="supported-label">Supported production sources</span>
          <div class="source-chips"><span>SeenThis tags</span><span>Adform tags</span><span>Google CM XLS/XLSX</span></div>
          <p>Unknown or ambiguous sizes are excluded safely without blocking the rest of the batch.</p>
        </div>
      </div>
    </header>

    <main class="page">
      <section class="panel upload-panel">
        <div class="section-heading">
          <div><span class="step">1</span><div><h2>Source delivery</h2><p>Upload one customer tag delivery.</p></div></div>
          <span id="template-state" class="template-state">Loading Hawk template…</span>
        </div>
        <label class="dropzone" id="dropzone">
          <input id="file-input" type="file" accept=".txt,.html,.js,.xls,.xlsx,text/plain,text/html,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
          <span class="upload-icon">↑</span>
          <strong>Choose a file or drop it here</strong>
          <span>TXT / HTML / JS / XLS / XLSX · max 20 MB</span>
        </label>
        <div id="file-summary" class="file-summary hidden"></div>
      </section>

      <section class="panel" id="settings-panel">
        <div class="section-heading">
          <div><span class="step">2</span><div><h2>Campaign details</h2><p>These values are applied to every exported row.</p></div></div>
          <span id="source-state" class="muted">Waiting for source file</span>
        </div>
        <div class="form-grid">
          <label class="field field-wide-mobile">IAB Category <span class="field-note">Search the Hawk category list</span>
            <input id="category" list="category-options" autocomplete="off" placeholder="Search or select category…" />
            <datalist id="category-options"></datalist>
          </label>
          <label class="field">AdServer <span class="field-note">Auto-detected; override only if needed</span><select id="adserver"></select></label>
          <label class="field">Preview Image URL <span class="field-note">Fallback used on all rows</span><input id="preview-url" type="url" value="${esc(last.previewUrl ?? DEFAULT_PREVIEW)}" /></label>
          <label class="field wide">Landing Page <span class="field-note">Use the final campaign URL, including UTM parameters when applicable</span><input id="landing-page" type="url" placeholder="https://…" value="" /><span id="landing-suggestion" class="landing-suggestion hidden"></span></label>
          <label id="clicktag-row" class="checkbox-row wide hidden"><input id="replace-clicktag" type="checkbox" ${last.replaceClicktag === false ? '' : 'checked'} /><span>Insert Hawk click tracking into SeenThis <code>data-clicktag</code> using the Landing Page above.</span></label>
        </div>
      </section>

      <section class="panel review-panel" id="creative-panel">
        <div class="section-heading creative-heading">
          <div><span class="step">3</span><div><h2>Review &amp; export</h2><p>Valid rows are included automatically. Resolve only the exceptions.</p></div></div>
          <div class="heading-actions">
            <button class="secondary-button" id="include-valid" type="button">Include all valid</button>
            <button class="secondary-button" id="remove-excluded" type="button">Remove excluded</button>
          </div>
        </div>

        <div class="summary-grid" id="summary-grid">
          <div class="metric"><span>Detected</span><strong id="metric-found">0</strong></div>
          <div class="metric metric-ready"><span>Ready</span><strong id="metric-ready">0</strong></div>
          <div class="metric"><span>Needs review</span><strong id="metric-review">0</strong></div>
          <div class="metric"><span>Excluded</span><strong id="metric-excluded">0</strong></div>
        </div>

        <div id="warnings"></div>
        <div class="review-toolbar">
          <div class="filter-tabs" role="tablist" aria-label="Creative review filter">
            <button class="filter-tab active" data-filter="all" type="button">All</button>
            <button class="filter-tab" data-filter="ready" type="button">Ready</button>
            <button class="filter-tab" data-filter="review" type="button">Needs review</button>
            <button class="filter-tab" data-filter="excluded" type="button">Excluded</button>
          </div>
          <span id="visible-count" class="muted"></span>
        </div>
        <div id="creative-table-wrap" class="empty-state"><strong>No delivery loaded</strong><span>Upload a customer file above to start.</span></div>
      </section>
    </main>

    <section class="export-bar">
      <div class="export-copy"><strong id="export-status">No file loaded</strong><span id="export-detail">At least one valid creative is required.</span></div>
      <button id="export-button" disabled>Export Excel</button>
    </section>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>`;
}

function optionMarkup(values: string[], selected?: string): string {
  return values.map((value) => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(value)}</option>`).join('');
}

function hydrateSettings(): void {
  const last = loadLastSettings();
  const categoryOptions = document.querySelector<HTMLDataListElement>('#category-options')!;
  const adserver = document.querySelector<HTMLSelectElement>('#adserver')!;
  const preferredAdserver = (last.adServer && templateConfig.adServers.includes(last.adServer)) ? last.adServer : 'Other';
  categoryOptions.innerHTML = templateConfig.categories.map((x) => `<option value="${esc(x.label)}"></option>`).join('');
  adserver.innerHTML = optionMarkup(templateConfig.adServers, preferredAdserver);
}

function currentSettings(): ExportSettings {
  return {
    category: document.querySelector<HTMLInputElement>('#category')!.value.trim(),
    previewUrl: document.querySelector<HTMLInputElement>('#preview-url')!.value.trim(),
    landingPage: document.querySelector<HTMLInputElement>('#landing-page')!.value.trim(),
    adServer: document.querySelector<HTMLSelectElement>('#adserver')!.value,
    replaceClicktag: selectedSource === 'seenthis' && document.querySelector<HTMLInputElement>('#replace-clicktag')!.checked,
  };
}

function applySourceDefaults(type: SourceType): void {
  const adserver = document.querySelector<HTMLSelectElement>('#adserver')!;
  const preferredAdserver = type === 'adform' ? 'Adform' : type === 'google' ? 'DCM' : 'Other';
  if (templateConfig.adServers.includes(preferredAdserver)) adserver.value = preferredAdserver;
}

function setDetectedSource(type: SourceType): void {
  selectedSource = type;
  applySourceDefaults(type);
  const clicktagRow = document.querySelector<HTMLElement>('#clicktag-row')!;
  clicktagRow.classList.toggle('hidden', type !== 'seenthis');
  document.querySelector<HTMLElement>('#source-state')!.textContent = `Detected source · ${sourceLabel(type)}`;
}

function clearImport(): void {
  creatives = [];
  parseIssues = [];
  sourceItemCount = 0;
  selectedSource = null;
  sourceFileName = '';
  reviewFilter = 'all';
  document.querySelector<HTMLInputElement>('#file-input')!.value = '';
  document.querySelector<HTMLInputElement>('#landing-page')!.value = '';
  const landingSuggestion = document.querySelector<HTMLElement>('#landing-suggestion')!;
  landingSuggestion.classList.add('hidden');
  landingSuggestion.innerHTML = '';
  document.querySelector<HTMLInputElement>('#category')!.value = '';
  document.querySelector<HTMLElement>('#clicktag-row')!.classList.add('hidden');
  document.querySelector<HTMLElement>('#source-state')!.textContent = 'Waiting for source file';
  const adserver = document.querySelector<HTMLSelectElement>('#adserver')!;
  if (templateConfig.adServers.includes('Other')) adserver.value = 'Other';
  const summary = document.querySelector<HTMLDivElement>('#file-summary')!;
  summary.classList.add('hidden');
  summary.innerHTML = '';
  rerenderCreatives();
}

function includedCreatives(): Creative[] {
  return creatives.filter((creative) => creative.included && Boolean(creative.mappedSizeLabel) && Boolean(creative.creativeType));
}

function isReviewCreative(creative: Creative): boolean {
  return creative.sizeStatus !== 'matched' || !creative.creativeType || creative.trackingOnly === true || creative.nameSource === 'fallback' || creative.warnings.length > 0;
}

function duplicateIncludedNames(): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const creative of includedCreatives()) {
    const key = creative.name.trim().toLocaleLowerCase('en-US');
    if (!key) continue;
    if (seen.has(key)) duplicates.add(creative.name.trim());
    seen.add(key);
  }
  return [...duplicates];
}

function renderWarnings(): void {
  const warningArea = document.querySelector<HTMLDivElement>('#warnings')!;
  if (!creatives.length && !parseIssues.length) { warningArea.innerHTML = ''; return; }
  const settings = currentSettings();
  const blocks: string[] = [];
  const missingDims = [...new Set(creatives.filter((c) => c.sizeStatus === 'missing').map((c) => c.dimension))];
  const ambiguousDims = [...new Set(creatives.filter((c) => c.sizeStatus === 'ambiguous' && !c.mappedSizeLabel).map((c) => c.dimension))];
  const noClicktag = selectedSource === 'seenthis' && settings.replaceClicktag ? includedCreatives().filter((c) => !hasClicktagAttribute(c.script)) : [];
  const duplicateNames = duplicateIncludedNames();
  const longNames = includedCreatives().filter((c) => c.name.trim().length > 200);
  const oversizedScripts = includedCreatives().filter((c) => c.script.length > EXCEL_CELL_MAX_CHARS);

  if (missingDims.length) blocks.push(`<div class="notice notice-error"><strong>Template sizes missing</strong><span>${missingDims.map((dim) => `<code>${esc(dim)}</code>`).join(', ')} · affected rows are excluded automatically.</span></div>`);
  if (ambiguousDims.length) blocks.push(`<div class="notice notice-error"><strong>Size selection required</strong><span>${ambiguousDims.map((dim) => `<code>${esc(dim)}</code>`).join(', ')} matches multiple Hawk size options.</span></div>`);
  if (parseIssues.length) blocks.push(`<div class="notice ${parseIssues.some((issue) => issue.type === 'error') ? 'notice-error' : 'notice-warning'}"><strong>Import notes</strong><ul>${parseIssues.map((issue) => `<li>${esc(issue.message)}</li>`).join('')}</ul></div>`);
  if (noClicktag.length) blocks.push(`<div class="notice notice-warning"><strong>SeenThis click tracking</strong><span>${noClicktag.length} included creative${noClicktag.length === 1 ? '' : 's'} has no <code>data-clicktag</code> attribute, so the Hawk click URL cannot be inserted automatically.</span></div>`);
  if (longNames.length) blocks.push(`<div class="notice notice-error"><strong>Name too long</strong><span>${longNames.length} included creative${longNames.length === 1 ? '' : 's'} exceeds Hawk's 200-character name limit.</span></div>`);
  if (oversizedScripts.length) blocks.push(`<div class="notice notice-error"><strong>Tag too long for Excel</strong><span>${oversizedScripts.length} included tag${oversizedScripts.length === 1 ? '' : 's'} exceeds 32,767 characters.</span></div>`);
  if (duplicateNames.length) blocks.push(`<div class="notice notice-warning"><strong>Duplicate names</strong><span>${duplicateNames.map((name) => `<code>${esc(name)}</code>`).join(', ')}. Export is allowed; verify they are intentional.</span></div>`);
  if (!blocks.length && creatives.length) blocks.push(`<div class="notice notice-success"><strong>Import checks passed</strong><span>No global issues detected. Review any row-level notes below, then complete the campaign fields.</span></div>`);
  warningArea.innerHTML = blocks.join('');
}

function nameSourceText(creative: Creative): string {
  switch (creative.nameSource) {
    case 'script-comment': return 'From tag comment';
    case 'file-header': return 'From campaign header + size';
    case 'adform-header': return 'From Adform tag header';
    case 'google-creative': return 'From Google Creative Name';
    case 'google-ad': return 'Creative Name missing · using Ad Name';
    case 'google-placement': return 'Creative/Ad Name missing · using Placement Name';
    default: return 'Fallback name · review';
  }
}

function sourceBadge(creative: Creative): string {
  if (creative.sourceType === 'seenthis') return hasHawkClicktag(creative.script) ? '<span class="source-badge">SeenThis · Hawk</span>' : '<span class="source-badge">SeenThis</span>';
  if (creative.sourceType === 'adform') return '<span class="source-badge">Adform</span>';
  return '<span class="source-badge">Google CM</span>';
}

function filteredCreativeEntries(): { creative: Creative; index: number }[] {
  return creatives.map((creative, index) => ({ creative, index })).filter(({ creative }) => {
    if (reviewFilter === 'ready') return creative.included && Boolean(creative.mappedSizeLabel) && Boolean(creative.creativeType);
    if (reviewFilter === 'review') return isReviewCreative(creative);
    if (reviewFilter === 'excluded') return !creative.included;
    return true;
  });
}

function renderMetrics(): void {
  const ready = includedCreatives().length;
  const excluded = creatives.length - ready;
  const review = creatives.filter(isReviewCreative).length;
  document.querySelector('#metric-found')!.textContent = String(creatives.length);
  document.querySelector('#metric-ready')!.textContent = String(ready);
  document.querySelector('#metric-review')!.textContent = String(review);
  document.querySelector('#metric-excluded')!.textContent = String(excluded);
  document.querySelectorAll<HTMLButtonElement>('.filter-tab').forEach((button) => button.classList.toggle('active', button.dataset.filter === reviewFilter));
}

function rerenderCreatives(): void {
  renderMetrics();
  const entries = filteredCreativeEntries();
  const wrap = document.querySelector<HTMLDivElement>('#creative-table-wrap')!;
  const visibleCount = document.querySelector<HTMLElement>('#visible-count')!;
  visibleCount.textContent = creatives.length ? `Showing ${entries.length} of ${creatives.length}` : '';
  const includeValid = document.querySelector<HTMLButtonElement>('#include-valid')!;
  const removeExcluded = document.querySelector<HTMLButtonElement>('#remove-excluded')!;
  includeValid.disabled = !creatives.length;
  removeExcluded.disabled = !creatives.some((creative) => !creative.included);

  if (!creatives.length) {
    wrap.className = 'empty-state';
    wrap.innerHTML = parseIssues.length ? '<strong>No exportable creatives identified</strong><span>Review the import note above or choose another file.</span>' : '<strong>No delivery loaded</strong><span>Upload a customer file above to start.</span>';
    renderWarnings(); updateExportState(); return;
  }
  if (!entries.length) {
    wrap.className = 'empty-state compact';
    wrap.innerHTML = '<strong>No creatives in this view</strong><span>Choose another filter to see the remaining rows.</span>';
    renderWarnings(); updateExportState(); return;
  }

  wrap.className = 'table-wrap';
  wrap.innerHTML = `<table><thead><tr><th>Include</th><th>Creative name</th><th>Size</th><th>Type</th><th>Status</th><th>Source</th><th>Tag</th><th></th></tr></thead><tbody>${entries.map(({ creative, index }) => {
    const missingSize = creative.sizeStatus === 'missing';
    const ambiguousSize = creative.sizeStatus === 'ambiguous' && !creative.mappedSizeLabel;
    const invalid = missingSize || ambiguousSize || !creative.creativeType;
    const sizeControl = creative.sizeStatus === 'ambiguous'
      ? `<select class="size-input" data-index="${index}" aria-label="Choose template size for creative ${index + 1}"><option value="">Choose Hawk size…</option>${creative.sizeOptions.map((option) => `<option value="${esc(option.label)}" ${creative.mappedSizeLabel === option.label ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select>`
      : `<span class="dimension ${missingSize ? 'dimension-error' : ''}">${esc(creative.dimension)}</span>`;
    const typeControl = creative.creativeType ? `<span class="type-badge">${esc(creative.creativeType)}</span>` : '<span class="status-error">Unknown</span>';
    const status = missingSize
      ? '<span class="status-chip status-error">Missing size</span>'
      : ambiguousSize
        ? '<span class="status-chip status-error">Choose size</span>'
        : creative.trackingOnly
          ? '<span class="status-chip status-muted">Tracking only</span>'
          : creative.included
            ? '<span class="status-chip status-ready">Ready</span>'
            : '<span class="status-chip status-muted">Excluded</span>';
    const rowWarnings = creative.warnings.filter((warning) => !warning.includes('is missing from the template') && !warning.includes('matches multiple template options'));
    return `<tr class="${invalid ? 'row-error' : creative.included ? '' : 'excluded-row'}">
      <td class="include-cell"><input class="include-input" type="checkbox" data-index="${index}" ${creative.included ? 'checked' : ''} ${invalid || creative.trackingOnly ? 'disabled' : ''} aria-label="Include creative ${index + 1}" /></td>
      <td class="name-cell"><input class="name-input" data-index="${index}" maxlength="200" value="${esc(creative.name)}" /><span class="cell-note ${creative.nameSource === 'fallback' ? 'warning-text' : ''}" title="${esc(creative.sourceComment)}">${esc(nameSourceText(creative))}</span></td>
      <td>${sizeControl}${creative.mappedSizeLabel && creative.mappedSizeLabel !== creative.dimension ? `<span class="cell-note">${esc(creative.mappedSizeLabel)}</span>` : ''}</td>
      <td>${typeControl}</td>
      <td>${status}${rowWarnings.length ? `<details class="row-warning"><summary>${rowWarnings.length} note${rowWarnings.length === 1 ? '' : 's'}</summary><ul>${rowWarnings.map((warning) => `<li>${esc(warning)}</li>`).join('')}</ul></details>` : ''}</td>
      <td>${sourceBadge(creative)}</td>
      <td><details class="tag-details"><summary>View tag <span>${creative.script.length.toLocaleString('en-US')} chars</span></summary><pre>${esc(creative.script)}</pre></details></td>
      <td><button class="icon-button remove-button" data-index="${index}" type="button" aria-label="Remove creative ${index + 1}">×</button></td>
    </tr>`;
  }).join('')}</tbody></table>`;

  wrap.querySelectorAll<HTMLInputElement>('.name-input').forEach((input) => input.addEventListener('input', () => {
    creatives[Number(input.dataset.index)].name = input.value;
    renderWarnings(); updateExportState();
  }));
  wrap.querySelectorAll<HTMLSelectElement>('.size-input').forEach((input) => input.addEventListener('change', () => {
    const creative = creatives[Number(input.dataset.index)];
    creative.mappedSizeLabel = input.value || null;
    creative.included = Boolean(creative.mappedSizeLabel) && Boolean(creative.creativeType) && !creative.trackingOnly;
    rerenderCreatives();
  }));
  wrap.querySelectorAll<HTMLInputElement>('.include-input').forEach((input) => input.addEventListener('change', () => {
    const creative = creatives[Number(input.dataset.index)];
    creative.included = Boolean(creative.mappedSizeLabel) && Boolean(creative.creativeType) && input.checked && !creative.trackingOnly;
    rerenderCreatives();
  }));
  wrap.querySelectorAll<HTMLButtonElement>('.remove-button').forEach((button) => button.addEventListener('click', () => {
    creatives.splice(Number(button.dataset.index), 1);
    rerenderCreatives();
  }));
  renderWarnings(); updateExportState();
}

function validate(): string[] {
  const errors: string[] = [];
  const settings = currentSettings();
  const included = includedCreatives();
  if (!creatives.length) errors.push('Upload a supported customer delivery.');
  if (creatives.length && !included.length) errors.push('No valid creative is selected for export.');
  if (included.length > templateConfig.maxCreatives) errors.push(`The current Hawk template supports a maximum of ${templateConfig.maxCreatives} creatives.`);
  if (included.some((c) => !c.name.trim())) errors.push('At least one included creative is missing a name.');
  if (included.some((c) => c.name.trim().length > 200)) errors.push('At least one included creative name is longer than 200 characters.');
  if (included.some((c) => !c.script.trim())) errors.push('At least one included creative is missing its tag.');
  if (included.some((c) => c.script.length > EXCEL_CELL_MAX_CHARS)) errors.push('At least one included tag exceeds Excel’s 32,767-character cell limit.');
  if (included.some((c) => !c.mappedSizeLabel)) errors.push('An included creative does not have a valid Hawk template size.');
  if (included.some((c) => !c.creativeType || !templateConfig.creativeTypes.includes(c.creativeType))) errors.push('An included creative has an invalid Creative Type.');
  if (!templateConfig.categories.some((category) => category.label === settings.category)) errors.push('Choose a valid IAB Category from the Hawk list.');
  if (!isHttpUrl(settings.previewUrl)) errors.push('Preview Image URL must be a valid http/https URL.');
  if (!isHttpUrl(settings.landingPage)) errors.push('Landing Page must be a valid http/https URL.');
  if (!templateConfig.adServers.includes(settings.adServer)) errors.push('Choose a valid AdServer from the Hawk template.');
  return errors;
}

function updateExportState(): void {
  const errors = validate();
  const included = includedCreatives().length;
  const excluded = creatives.length - included;
  const button = document.querySelector<HTMLButtonElement>('#export-button')!;
  const status = document.querySelector<HTMLElement>('#export-status')!;
  const detail = document.querySelector<HTMLElement>('#export-detail')!;
  button.disabled = errors.length > 0;
  button.textContent = included ? `Export ${included} creative${included === 1 ? '' : 's'}` : 'Export Excel';
  status.textContent = errors.length ? 'Not ready to export' : 'Ready for Hawk upload';
  detail.textContent = errors.length ? errors[0] : excluded ? `${included} ready · ${excluded} excluded` : `${included} creative${included === 1 ? '' : 's'} ready · no exclusions`;
}

function renderFileSummary(file: File, detected: SourceType, typeText: string): void {
  const summary = document.querySelector<HTMLDivElement>('#file-summary')!;
  const unit = detected === 'google' ? 'source rows' : 'tags';
  summary.classList.remove('hidden');
  summary.innerHTML = `
    <div class="file-main"><span class="file-icon">✓</span><div><strong>${esc(file.name)}</strong><span>${esc(sourceLabel(detected))}${esc(typeText)} · ${sourceItemCount} ${sourceItemCount === 1 ? unit.replace(/s$/, '') : unit} detected · ${creatives.length} creatives identified</span></div></div>
    <button id="clear-file" class="text-button" type="button">Clear</button>`;
  document.querySelector<HTMLButtonElement>('#clear-file')!.addEventListener('click', clearImport);
}

function applyDetectedLandingPage(url: string | undefined, source: SourceType): void {
  const input = document.querySelector<HTMLInputElement>('#landing-page')!;
  const suggestion = document.querySelector<HTMLElement>('#landing-suggestion')!;
  suggestion.classList.add('hidden');
  suggestion.innerHTML = '';
  if (!url) return;
  if (source === 'google') {
    input.value = url;
    suggestion.classList.remove('hidden');
    suggestion.textContent = 'Detected from the Google source sheet.';
    return;
  }
  try {
    const parsed = new URL(url);
    if (parsed.search || parsed.hash) {
      input.value = url;
      suggestion.classList.remove('hidden');
      suggestion.textContent = 'Detected from the SeenThis clicktag. Verify campaign tracking before export.';
      return;
    }
  } catch { /* URL was already validated by the parser; ignore if parsing fails here. */ }
  suggestion.classList.remove('hidden');
  suggestion.innerHTML = `Source destination detected: <button id="use-detected-landing" class="inline-link" type="button">${esc(url)}</button> · add campaign tracking if required.`;
  document.querySelector<HTMLButtonElement>('#use-detected-landing')!.addEventListener('click', () => { input.value = url; renderWarnings(); updateExportState(); });
}

async function handleFile(file: File): Promise<void> {
  const landingInput = document.querySelector<HTMLInputElement>('#landing-page')!;
  const summary = document.querySelector<HTMLDivElement>('#file-summary')!;
  sourceFileName = file.name;
  reviewFilter = 'all';
  landingInput.value = '';
  document.querySelector<HTMLInputElement>('#category')!.value = '';
  const landingSuggestion = document.querySelector<HTMLElement>('#landing-suggestion')!;
  landingSuggestion.classList.add('hidden');
  landingSuggestion.innerHTML = '';

  if (/\.zip$/i.test(file.name) || /zip/i.test(file.type)) {
    creatives = [];
    selectedSource = null;
    sourceItemCount = 0;
    parseIssues = [{ type: 'error', message: 'ZIP import is disabled. For SeenThis HTML5 deliveries, export the official SeenThis tag file and import that instead.' }];
    summary.classList.remove('hidden');
    summary.innerHTML = `<div class="file-main"><span class="file-icon file-error">!</span><div><strong>${esc(file.name)}</strong><span>Unsupported delivery format</span></div></div><button id="clear-file" class="text-button" type="button">Clear</button>`;
    document.querySelector<HTMLButtonElement>('#clear-file')!.addEventListener('click', clearImport);
    document.querySelector<HTMLElement>('#clicktag-row')!.classList.add('hidden');
    document.querySelector<HTMLElement>('#source-state')!.textContent = 'Unsupported source file';
    rerenderCreatives();
    return;
  }

  if (file.size > MAX_IMPORT_BYTES) {
    creatives = [];
    selectedSource = null;
    sourceItemCount = 0;
    parseIssues = [{ type: 'error', message: 'The selected file is larger than 20 MB. Split the delivery into smaller supported files before importing.' }];
    summary.classList.remove('hidden');
    summary.innerHTML = `<div class="file-main"><span class="file-icon file-error">!</span><div><strong>${esc(file.name)}</strong><span>Import rejected · file too large</span></div></div><button id="clear-file" class="text-button" type="button">Clear</button>`;
    document.querySelector<HTMLButtonElement>('#clear-file')!.addEventListener('click', clearImport);
    document.querySelector<HTMLElement>('#clicktag-row')!.classList.add('hidden');
    document.querySelector<HTMLElement>('#source-state')!.textContent = 'Import rejected';
    rerenderCreatives();
    return;
  }

  try {
    let parsed;
    let detected: SourceType;
    if (/\.(?:xls|xlsx)$/i.test(file.name) || /excel|spreadsheet/i.test(file.type)) {
      detected = 'google';
      setDetectedSource(detected);
      parsed = parseGoogleWorkbook(await file.arrayBuffer(), templateConfig.sizes);
    } else {
      const sourceText = await file.text();
      const textSource = detectTextSource(sourceText);
      if (!textSource) throw new Error('This file does not match a supported SeenThis or Adform tag export.');
      detected = textSource;
      setDetectedSource(detected);
      parsed = detected === 'adform' ? parseAdformFile(sourceText, templateConfig.sizes) : parseSeenThisFile(sourceText, templateConfig.sizes);
    }

    creatives = parsed.creatives;
    parseIssues = parsed.issues;
    sourceItemCount = parsed.itemCount;
    applyDetectedLandingPage(parsed.detectedLandingPage, detected);
    const detectedTypes = [...new Set(creatives.map((creative) => creative.creativeType).filter((value): value is string => Boolean(value)))];
    const typeText = detectedTypes.length === 1 ? ` · ${detectedTypes[0]}` : detectedTypes.length > 1 ? ` · ${detectedTypes.join(', ')}` : '';
    renderFileSummary(file, detected, typeText);
  } catch (error) {
    creatives = [];
    sourceItemCount = 0;
    selectedSource = null;
    document.querySelector<HTMLElement>('#clicktag-row')!.classList.add('hidden');
    document.querySelector<HTMLElement>('#source-state')!.textContent = 'Import failed';
    parseIssues = [{ type: 'error', message: error instanceof Error ? error.message : String(error) }];
    summary.classList.remove('hidden');
    summary.innerHTML = `<div class="file-main"><span class="file-icon file-error">!</span><div><strong>${esc(file.name)}</strong><span>Import failed</span></div></div><button id="clear-file" class="text-button" type="button">Clear</button>`;
    document.querySelector<HTMLButtonElement>('#clear-file')!.addEventListener('click', clearImport);
  }
  rerenderCreatives();
}

function safeExportFilename(): string {
  const base = sourceFileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9åäöÅÄÖ _.-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80);
  return base ? `BatchUploadCreatives-${base}.xlsx` : 'BatchUploadCreatives-filled.xlsx';
}

function download(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showToast(message: string, isError = false): void {
  const toast = document.querySelector<HTMLDivElement>('#toast')!;
  toast.textContent = message;
  toast.className = `toast show ${isError ? 'toast-error' : ''}`;
  window.setTimeout(() => { toast.className = 'toast'; }, 3200);
}

async function init(): Promise<void> {
  renderShell();
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error('Could not load the Hawk Excel template.');
  templateBytes = new Uint8Array(await response.arrayBuffer());
  templateConfig = readTemplateConfig(templateBytes);
  hydrateSettings();
  document.querySelector('#template-state')!.textContent = `Hawk template v${templateConfig.version} · ${templateConfig.sizes.length} sizes · max ${templateConfig.maxCreatives}`;

  const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
  fileInput.addEventListener('change', () => fileInput.files?.[0] && void handleFile(fileInput.files[0]));
  const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!;
  for (const event of ['dragenter', 'dragover']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.add('dragging'); });
  for (const event of ['dragleave', 'drop']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.remove('dragging'); });
  dropzone.addEventListener('drop', (event) => { const file = event.dataTransfer?.files?.[0]; if (file) void handleFile(file); });

  document.querySelector('#include-valid')!.addEventListener('click', () => {
    creatives.forEach((creative) => { creative.included = Boolean(creative.mappedSizeLabel) && Boolean(creative.creativeType) && !creative.trackingOnly; });
    rerenderCreatives();
  });
  document.querySelector('#remove-excluded')!.addEventListener('click', () => { creatives = creatives.filter((creative) => creative.included); rerenderCreatives(); });
  document.querySelectorAll<HTMLButtonElement>('.filter-tab').forEach((button) => button.addEventListener('click', () => {
    reviewFilter = (button.dataset.filter ?? 'all') as ReviewFilter;
    rerenderCreatives();
  }));
  document.querySelectorAll('#settings-panel input, #settings-panel select').forEach((el) => el.addEventListener('input', () => { renderWarnings(); updateExportState(); }));
  document.querySelector<HTMLButtonElement>('#export-button')!.addEventListener('click', () => {
    try {
      const settings = currentSettings();
      const { landingPage: _landingPage, category: _category, ...persistentSettings } = settings;
      localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(persistentSettings));
      const exportRows = includedCreatives();
      const filename = safeExportFilename();
      download(generateWorkbook(templateBytes, templateConfig, exportRows, settings), filename);
      showToast(`Exported ${exportRows.length} creative${exportRows.length === 1 ? '' : 's'} to ${filename}`);
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : 'Export failed.', true);
    }
  });
  rerenderCreatives();
}

init().catch((error) => {
  console.error(error);
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `<main class="fatal-shell"><div class="fatal"><span class="eyebrow">Creative Batch Generator</span><h1>Unable to start</h1><p>${esc(error instanceof Error ? error.message : String(error))}</p><p>Verify that the Hawk template is available at <code>${esc(TEMPLATE_URL)}</code> and refresh the page.</p></div></main>`;
});
