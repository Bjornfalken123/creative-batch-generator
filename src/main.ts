import './style.css';
import { detectTextSource, extractLandingPageFromScripts, hasHawkClicktag, parseAdformFile, parseSeenThisFile } from './parser';
import { parseGoogleWorkbook } from './google';
import { generateWorkbook, readTemplateConfig } from './xlsx';
import type { Creative, ExportSettings, ParseIssue, SourceType, TemplateConfig } from './types';

const TEMPLATE_URL = '/BatchUploadCreatives-template.xlsx';
const DEFAULT_PREVIEW = 'https://publisher.com/ads/preview.png';
const LAST_SETTINGS_KEY = 'creative-batch-generator:last-settings:v4';
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const EXCEL_CELL_MAX_CHARS = 32767;

let templateBytes = new Uint8Array();
let templateConfig: TemplateConfig = { categories: [], sizes: [], creativeTypes: [], adServers: [] };
let creatives: Creative[] = [];
let parseIssues: ParseIssue[] = [];
let sourceItemCount = 0;
let selectedSource: SourceType = 'seenthis';

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
  return type === 'seenthis' ? 'SeenThis' : type === 'adform' ? 'Adform' : 'Google Campaign Manager';
}

function sourceAccept(type: SourceType): string {
  return type === 'google' ? '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : '.txt,.html,.js,text/plain,text/html';
}

function renderShell(): void {
  const last = loadLastSettings();
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <section class="top-shell">
      <nav class="navbar">
        <div class="brand"><span class="brand-mark">H</span><span>Creative Ops Tool</span></div>
        <div class="nav-meta"><span class="nav-dot"></span><span>Local processing · no customer files uploaded</span></div>
      </nav>
      <header class="hero">
        <div>
          <span class="eyebrow">Hawk creative workflow</span>
          <h1>From ad tags to upload-ready Excel.</h1>
          <p>Import SeenThis, Adform or Google Campaign Manager tags, review names and sizes against the current template, and export only valid creatives.</p>
        </div>
        <div class="hero-side">
          <div class="privacy-pill">Processed locally in your browser</div>
          <div class="hero-stat"><strong>Multiple tag sources</strong><span>Each source has its own parser for names, sizes and tag structure.</span></div>
          <div class="hero-stat"><strong>Safe partial export</strong><span>Unknown sizes are excluded automatically without blocking valid creatives.</span></div>
        </div>
      </header>
    </section>

    <main class="page">
      <section class="panel upload-panel">
        <div class="section-heading">
          <div><span class="step">1</span><h2>Select tag source</h2></div>
          <span id="template-state" class="muted">Loading template…</span>
        </div>
        <div class="source-picker" role="radiogroup" aria-label="Tag source">
          <button type="button" class="source-option active" data-source="seenthis"><strong>SeenThis</strong><span>TXT / HTML tags</span></button>
          <button type="button" class="source-option" data-source="adform"><strong>Adform</strong><span>TXT tag sheet</span></button>
          <button type="button" class="source-option" data-source="google"><strong>Google</strong><span>Campaign Manager XLS / XLSX</span></button>
        </div>
        <label class="dropzone" id="dropzone">
          <input id="file-input" type="file" accept="${sourceAccept('seenthis')}" />
          <strong id="dropzone-title">Choose or drop a SeenThis file here</strong>
          <span id="dropzone-help">Comments, creative names, width and height are detected automatically.</span>
        </label>
        <div id="file-summary" class="file-summary hidden"></div>
      </section>

      <section class="panel" id="settings-panel">
        <div class="section-heading">
          <div><span class="step">2</span><h2>Campaign settings</h2></div>
          <span class="muted">Applied to all exported rows</span>
        </div>
        <div class="form-grid">
          <label>IAB Category<select id="category"></select></label>
          <label>Creative Type<select id="creative-type"></select></label>
          <label>AdServer<select id="adserver"></select></label>
          <label>Preview Image URL<input id="preview-url" type="url" value="${esc(last.previewUrl ?? DEFAULT_PREVIEW)}" /></label>
          <label class="wide">Landing Page<input id="landing-page" type="url" placeholder="https://…" value="" /></label>
          <label id="clicktag-row" class="checkbox-row wide"><input id="replace-clicktag" type="checkbox" ${last.replaceClicktag === false ? '' : 'checked'} /><span>Replace the <code>\${HAWK_CLICK}</code> URL in SeenThis scripts with the URL-encoded Landing Page</span></label>
        </div>
      </section>

      <section class="panel" id="creative-panel">
        <div class="section-heading creative-heading">
          <div><span class="step">3</span><h2>Review creatives</h2></div>
          <div class="heading-actions">
            <button class="secondary-button" id="include-valid" type="button">Include all valid</button>
            <button class="secondary-button" id="remove-excluded" type="button">Remove excluded</button>
            <span id="creative-count" class="count-badge">0 found</span>
          </div>
        </div>
        <div id="warnings"></div>
        <div id="creative-table-wrap" class="empty-state">Choose a tag source and upload a file to get started.</div>
      </section>

      <section class="export-bar">
        <div><strong id="export-status">No file loaded</strong><span id="export-detail">Export becomes available when at least one valid creative is included.</span></div>
        <button id="export-button" disabled>Export BatchUploadCreatives.xlsx</button>
      </section>
    </main>`;
}

function optionMarkup(values: string[], selected?: string): string {
  return values.map((value) => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(value)}</option>`).join('');
}

function hydrateSettings(): void {
  const last = loadLastSettings();
  const category = document.querySelector<HTMLSelectElement>('#category')!;
  const creativeType = document.querySelector<HTMLSelectElement>('#creative-type')!;
  const adserver = document.querySelector<HTMLSelectElement>('#adserver')!;
  const preferredType = (last.creativeType && templateConfig.creativeTypes.includes(last.creativeType)) ? last.creativeType : 'javascript';
  const preferredAdserver = (last.adServer && templateConfig.adServers.includes(last.adServer)) ? last.adServer : 'Other';
  category.innerHTML = `<option value="">Select IAB category…</option>${optionMarkup(templateConfig.categories.map((x) => x.label))}`;
  creativeType.innerHTML = optionMarkup(templateConfig.creativeTypes, preferredType);
  adserver.innerHTML = optionMarkup(templateConfig.adServers, preferredAdserver);
}

function currentSettings(): ExportSettings {
  return {
    category: document.querySelector<HTMLSelectElement>('#category')!.value,
    creativeType: document.querySelector<HTMLSelectElement>('#creative-type')!.value,
    previewUrl: document.querySelector<HTMLInputElement>('#preview-url')!.value.trim(),
    landingPage: document.querySelector<HTMLInputElement>('#landing-page')!.value.trim(),
    adServer: document.querySelector<HTMLSelectElement>('#adserver')!.value,
    replaceClicktag: selectedSource === 'seenthis' && document.querySelector<HTMLInputElement>('#replace-clicktag')!.checked,
  };
}

function applySourceDefaults(type: SourceType): void {
  const creativeType = document.querySelector<HTMLSelectElement>('#creative-type')!;
  const adserver = document.querySelector<HTMLSelectElement>('#adserver')!;
  if (templateConfig.creativeTypes.includes('javascript')) creativeType.value = 'javascript';
  const preferredAdserver = type === 'adform' ? 'Adform' : type === 'google' ? 'DCM' : 'Other';
  if (templateConfig.adServers.includes(preferredAdserver)) adserver.value = preferredAdserver;
}

function resetImportedFile(): void {
  creatives = [];
  parseIssues = [];
  sourceItemCount = 0;
  const input = document.querySelector<HTMLInputElement>('#file-input')!;
  input.value = '';
  const summary = document.querySelector<HTMLDivElement>('#file-summary')!;
  summary.classList.add('hidden');
  summary.innerHTML = '';
  rerenderCreatives();
}

function setSource(type: SourceType): void {
  if (selectedSource !== type) resetImportedFile();
  selectedSource = type;
  document.querySelectorAll<HTMLButtonElement>('.source-option').forEach((button) => button.classList.toggle('active', button.dataset.source === type));
  const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
  fileInput.accept = sourceAccept(type);
  document.querySelector('#dropzone-title')!.textContent = type === 'google'
    ? 'Choose or drop a Google Campaign Manager XLS / XLSX file here'
    : `Choose or drop an ${sourceLabel(type)} tag file here`;
  document.querySelector('#dropzone-help')!.textContent = type === 'seenthis'
    ? 'Comments, creative names, width and height are detected automatically.'
    : type === 'adform'
      ? 'Tag headers provide the creative name and size; the full JavaScript + noscript block is preserved.'
      : 'Creative Name, Dimensions and Impression Tag (JavaScript) are read from the Google tag sheet.';
  document.querySelector<HTMLElement>('#clicktag-row')!.classList.toggle('hidden', type !== 'seenthis');
  applySourceDefaults(type);
  renderWarnings();
  updateExportState();
}

function includedCreatives(): Creative[] { return creatives.filter((creative) => creative.included && Boolean(creative.mappedSizeLabel)); }

function duplicateIncludedNames(): string[] {
  const seen = new Set<string>(); const duplicates = new Set<string>();
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
  const excluded = creatives.filter((c) => !c.included).length;
  const noClicktag = selectedSource === 'seenthis' && settings.replaceClicktag ? includedCreatives().filter((c) => !hasHawkClicktag(c.script)) : [];
  const duplicateNames = duplicateIncludedNames();
  const longNames = includedCreatives().filter((c) => c.name.trim().length > 200);
  const oversizedScripts = includedCreatives().filter((c) => c.script.length > EXCEL_CELL_MAX_CHARS);
  const rowWarningCount = creatives.filter((c) => c.warnings.some((warning) => !warning.includes('is missing from the template'))).length;

  if (missingDims.length) blocks.push(`<div class="warning warning-error"><strong>Sizes missing from the template:</strong> ${missingDims.map((dim) => `<code>${esc(dim)}</code>`).join(', ')}. These rows are automatically excluded. Valid creatives can still be exported.</div>`);
  if (ambiguousDims.length) blocks.push(`<div class="warning warning-error"><strong>Sizes with multiple template matches:</strong> ${ambiguousDims.map((dim) => `<code>${esc(dim)}</code>`).join(', ')}. Choose the correct template size on each affected row before including it.</div>`);
  if (excluded && !missingDims.length && !ambiguousDims.length) blocks.push(`<div class="warning"><strong>${excluded} creative${excluded === 1 ? '' : 's'} excluded.</strong> They remain visible for review but will not be included in Excel.</div>`);
  if (parseIssues.length) blocks.push(`<div class="warning ${parseIssues.some((issue) => issue.type === 'error') ? 'warning-error' : ''}"><strong>Import issues:</strong><ul>${parseIssues.map((issue) => `<li>${esc(issue.message)}</li>`).join('')}</ul></div>`);
  if (rowWarningCount) blocks.push(`<div class="warning"><strong>${rowWarningCount} row${rowWarningCount === 1 ? ' needs' : 's need'} additional review.</strong> Open the row warning for details.</div>`);
  if (noClicktag.length) blocks.push(`<div class="warning"><strong>Clicktag:</strong> ${noClicktag.length} included SeenThis creative${noClicktag.length === 1 ? ' is' : 's are'} missing <code>\${HAWK_CLICK}</code>. They will still be exported, but the clicktag cannot be replaced automatically.</div>`);
  if (selectedSource !== 'seenthis' && creatives.length) blocks.push(`<div class="warning"><strong>${sourceLabel(selectedSource)} tags are preserved unchanged.</strong> No SeenThis/Hawk clicktag rewrite is applied to this source.</div>`);
  if (longNames.length) blocks.push(`<div class="warning warning-error"><strong>Name too long:</strong> ${longNames.length} included creative${longNames.length === 1 ? ' has' : 's have'} a name longer than 200 characters. Shorten the name before export.</div>`);
  if (oversizedScripts.length) blocks.push(`<div class="warning warning-error"><strong>Tag too long for Excel:</strong> ${oversizedScripts.length} included creative${oversizedScripts.length === 1 ? ' exceeds' : 's exceed'} the 32,767-character Excel cell limit.</div>`);
  if (duplicateNames.length) blocks.push(`<div class="warning"><strong>Duplicate names:</strong> ${duplicateNames.map((name) => `<code>${esc(name)}</code>`).join(', ')}. Export is allowed, but verify that the names are intentionally identical.</div>`);
  warningArea.innerHTML = blocks.join('');
}

function nameSourceText(creative: Creative): string {
  switch (creative.nameSource) {
    case 'script-comment': return 'Name derived from script comment';
    case 'file-header': return 'Name built from file campaign header + size';
    case 'adform-header': return 'Name read from Adform Tag header';
    case 'google-creative': return 'Name built from Google Creative Name + size';
    case 'google-ad': return 'Creative Name missing · using Google Ad Name + size';
    case 'google-placement': return 'Creative/Ad Name missing · using Placement Name + size';
    default: return 'Fallback name – review manually';
  }
}

function sourceBadge(creative: Creative): string {
  if (creative.sourceType === 'seenthis') return hasHawkClicktag(creative.script) ? '<span class="status-ok">✓ SeenThis / Hawk</span>' : '<span class="status-muted">SeenThis · no Hawk macro</span>';
  if (creative.sourceType === 'adform') return '<span class="status-ok">✓ Adform</span>';
  return '<span class="status-ok">✓ Google CM</span>';
}

function rerenderCreatives(): void {
  const included = includedCreatives().length; const excluded = creatives.length - included;
  document.querySelector('#creative-count')!.textContent = creatives.length ? `${creatives.length} found · ${included} included · ${excluded} excluded` : '0 found';
  const wrap = document.querySelector<HTMLDivElement>('#creative-table-wrap')!;
  if (!creatives.length) {
    wrap.className = 'empty-state'; wrap.innerHTML = parseIssues.length ? 'No exportable creatives could be identified.' : 'Choose a tag source and upload a file to get started.';
    renderWarnings(); updateExportState(); return;
  }

  wrap.className = 'table-wrap';
  wrap.innerHTML = `<table><thead><tr><th>Include</th><th>#</th><th>Creative name</th><th>Size</th><th>Status</th><th>Source</th><th>Tag</th><th></th></tr></thead><tbody>${creatives.map((creative, index) => {
    const missingSize = creative.sizeStatus === 'missing';
    const ambiguousSize = creative.sizeStatus === 'ambiguous' && !creative.mappedSizeLabel;
    const invalidSize = missingSize || ambiguousSize;
    const otherWarnings = creative.warnings.filter((warning) => !warning.includes('is missing from the template') && !warning.includes('matches multiple template options'));
    const sizeControl = creative.sizeStatus === 'ambiguous'
      ? `<select class="size-input" data-index="${index}" aria-label="Choose template size for creative ${index + 1}"><option value="">Choose template size…</option>${creative.sizeOptions.map((option) => `<option value="${esc(option.label)}" ${creative.mappedSizeLabel === option.label ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select>`
      : `<span class="dimension ${missingSize ? 'dimension-error' : ''}">${creative.dimension}</span>`;
    const sizeStatus = missingSize
      ? '<span class="status-error">⚠ Missing · excluded</span>'
      : ambiguousSize
        ? '<span class="status-error">⚠ Multiple matches · choose size</span>'
        : creative.included
          ? `<span class="status-ok">✓ ${esc(creative.mappedSizeLabel!)}</span>`
          : creative.trackingOnly
            ? '<span class="status-muted">Tracking-only · excluded</span>'
            : '<span class="status-muted">Excluded</span>';
    return `<tr class="${invalidSize ? 'missing-size' : creative.included ? '' : 'excluded-row'}">
      <td class="include-cell"><input class="include-input" type="checkbox" data-index="${index}" ${creative.included ? 'checked' : ''} ${invalidSize ? 'disabled' : ''} aria-label="Include creative ${index + 1}" /></td>
      <td>${index + 1}</td>
      <td><input class="name-input" data-index="${index}" maxlength="200" value="${esc(creative.name)}" /><span class="source-hint ${creative.nameSource === 'fallback' ? 'warning-text' : ''}" title="${esc(creative.sourceComment)}">${esc(nameSourceText(creative))}</span></td>
      <td>${sizeControl}</td>
      <td>${sizeStatus}${otherWarnings.length ? `<details class="row-warning"><summary>⚠ ${otherWarnings.length} warning${otherWarnings.length === 1 ? '' : 's'}</summary><ul>${otherWarnings.map((warning) => `<li>${esc(warning)}</li>`).join('')}</ul></details>` : ''}</td>
      <td>${sourceBadge(creative)}</td>
      <td><details><summary>Show</summary><pre>${esc(creative.script)}</pre></details></td>
      <td><button class="remove-button" data-index="${index}" type="button">Remove</button></td>
    </tr>`;
  }).join('')}</tbody></table>`;

  wrap.querySelectorAll<HTMLInputElement>('.name-input').forEach((input) => input.addEventListener('input', () => { creatives[Number(input.dataset.index)].name = input.value; renderWarnings(); updateExportState(); }));
  wrap.querySelectorAll<HTMLSelectElement>('.size-input').forEach((input) => input.addEventListener('change', () => {
    const creative = creatives[Number(input.dataset.index)];
    creative.mappedSizeLabel = input.value || null;
    creative.included = Boolean(creative.mappedSizeLabel) && !creative.trackingOnly;
    rerenderCreatives();
  }));
  wrap.querySelectorAll<HTMLInputElement>('.include-input').forEach((input) => input.addEventListener('change', () => { const creative = creatives[Number(input.dataset.index)]; creative.included = Boolean(creative.mappedSizeLabel) && input.checked; rerenderCreatives(); }));
  wrap.querySelectorAll<HTMLButtonElement>('.remove-button').forEach((button) => button.addEventListener('click', () => { creatives.splice(Number(button.dataset.index), 1); rerenderCreatives(); }));
  renderWarnings(); updateExportState();
}

function validate(): string[] {
  const errors: string[] = []; const settings = currentSettings(); const included = includedCreatives();
  if (!creatives.length) errors.push('No tag file has been loaded.');
  if (creatives.length && !included.length) errors.push('No valid creative is selected for export.');
  if (included.length > 200) errors.push('A maximum of 200 creatives can be exported in one template.');
  if (included.some((c) => !c.name.trim())) errors.push('At least one included creative is missing a name.');
  if (included.some((c) => c.name.trim().length > 200)) errors.push('At least one included creative name is longer than 200 characters.');
  if (included.some((c) => c.script.length > EXCEL_CELL_MAX_CHARS)) errors.push('At least one included tag is longer than Excel can store in one cell (32,767 characters).');
  if (included.some((c) => !c.mappedSizeLabel)) errors.push('An included creative does not have a valid template size.');
  if (!templateConfig.categories.some((category) => category.label === settings.category)) errors.push('Select an IAB Category.');
  if (!isHttpUrl(settings.previewUrl)) errors.push('Preview Image URL must be a valid http/https URL.');
  if (!isHttpUrl(settings.landingPage)) errors.push('Landing Page must be a valid http/https URL.');
  return errors;
}

function updateExportState(): void {
  const errors = validate(); const included = includedCreatives().length; const excluded = creatives.length - included;
  const button = document.querySelector<HTMLButtonElement>('#export-button')!; const status = document.querySelector<HTMLElement>('#export-status')!; const detail = document.querySelector<HTMLElement>('#export-detail')!;
  button.disabled = errors.length > 0;
  status.textContent = errors.length ? 'Not ready to export' : `${included} creative${included === 1 ? '' : 's'} ready to export`;
  detail.textContent = errors.length ? errors[0] : excluded ? `${excluded} creative${excluded === 1 ? '' : 's'} excluded and will not be exported.` : 'All identified creatives will be exported.';
}

async function handleFile(file: File): Promise<void> {
  const landingInput = document.querySelector<HTMLInputElement>('#landing-page')!;
  const summary = document.querySelector<HTMLDivElement>('#file-summary')!;
  if (file.size > MAX_IMPORT_BYTES) {
    creatives = [];
    parseIssues = [{ type: 'error', message: 'The selected file is larger than 20 MB. Please use the original tag export rather than a bundled archive.' }];
    sourceItemCount = 0;
    summary.classList.remove('hidden');
    summary.innerHTML = `<strong>${esc(file.name)}</strong><span>Import rejected · file too large</span>`;
    rerenderCreatives();
    return;
  }

  landingInput.value = '';
  document.querySelector<HTMLSelectElement>('#category')!.value = '';
  applySourceDefaults(selectedSource);
  try {
    let parsed;
    if (selectedSource === 'google') {
      parsed = parseGoogleWorkbook(await file.arrayBuffer(), templateConfig.sizes);
    } else {
      const sourceText = await file.text();
      const detectedSource = detectTextSource(sourceText);
      parsed = selectedSource === 'adform' ? parseAdformFile(sourceText, templateConfig.sizes) : parseSeenThisFile(sourceText, templateConfig.sizes);
      if (detectedSource && detectedSource !== selectedSource) {
        parsed.issues.unshift({ type: 'error', message: `This file looks like ${sourceLabel(detectedSource)}, but ${sourceLabel(selectedSource)} is selected. Choose the matching source and import the file again.` });
        parsed.creatives = [];
      }
      if (selectedSource === 'seenthis') {
        const detectedLanding = extractLandingPageFromScripts(sourceText);
        if (detectedLanding) landingInput.value = detectedLanding;
      }
    }
    creatives = parsed.creatives;
    parseIssues = parsed.issues;
    sourceItemCount = parsed.itemCount;
    summary.classList.remove('hidden');
    const unit = selectedSource === 'google' ? 'source row' : 'tag';
    summary.innerHTML = `<strong>${esc(file.name)}</strong><span>${esc(sourceLabel(selectedSource))} · ${sourceItemCount} ${unit}${sourceItemCount === 1 ? '' : 's'} detected · ${creatives.length} creatives identified</span>`;
  } catch (error) {
    creatives = [];
    sourceItemCount = 0;
    parseIssues = [{ type: 'error', message: `Could not read this ${sourceLabel(selectedSource)} file: ${error instanceof Error ? error.message : String(error)}` }];
    summary.classList.remove('hidden');
    summary.innerHTML = `<strong>${esc(file.name)}</strong><span>Import failed</span>`;
  }
  rerenderCreatives();
}

function download(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function init(): Promise<void> {
  renderShell();
  const response = await fetch(TEMPLATE_URL); if (!response.ok) throw new Error('Could not load the Excel template.');
  templateBytes = new Uint8Array(await response.arrayBuffer()); templateConfig = readTemplateConfig(templateBytes); hydrateSettings();
  document.querySelector('#template-state')!.textContent = `Template loaded · ${templateConfig.sizes.length} sizes · ${templateConfig.categories.length} categories`;

  document.querySelectorAll<HTMLButtonElement>('.source-option').forEach((button) => button.addEventListener('click', () => setSource(button.dataset.source as SourceType)));
  setSource('seenthis');

  const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
  fileInput.addEventListener('change', () => fileInput.files?.[0] && void handleFile(fileInput.files[0]));
  const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!;
  for (const event of ['dragenter', 'dragover']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.add('dragging'); });
  for (const event of ['dragleave', 'drop']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.remove('dragging'); });
  dropzone.addEventListener('drop', (event) => { const file = event.dataTransfer?.files?.[0]; if (file) void handleFile(file); });

  document.querySelector('#include-valid')!.addEventListener('click', () => { creatives.forEach((creative) => { creative.included = Boolean(creative.mappedSizeLabel) && !creative.trackingOnly; }); rerenderCreatives(); });
  document.querySelector('#remove-excluded')!.addEventListener('click', () => { creatives = creatives.filter((creative) => creative.included); rerenderCreatives(); });
  document.querySelectorAll('#settings-panel input, #settings-panel select').forEach((el) => el.addEventListener('input', () => { renderWarnings(); updateExportState(); }));
  document.querySelector<HTMLButtonElement>('#export-button')!.addEventListener('click', () => {
    const settings = currentSettings();
    const { landingPage: _landingPage, category: _category, ...persistentSettings } = settings;
    localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(persistentSettings));
    download(generateWorkbook(templateBytes, templateConfig, includedCreatives(), settings), 'BatchUploadCreatives-filled.xlsx');
  });
  updateExportState();
}

init().catch((error) => {
  console.error(error);
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `<main class="page"><div class="fatal"><h1>Something went wrong</h1><p>${esc(error instanceof Error ? error.message : String(error))}</p></div></main>`;
});
