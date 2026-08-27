import './style.css';
import { extractLandingPageFromScripts, hasHawkClicktag, parseCreativeFile } from './parser';
import { generateWorkbook, readTemplateConfig } from './xlsx';
import type { Creative, ExportSettings, ParseIssue, TemplateConfig } from './types';

const TEMPLATE_URL = '/BatchUploadCreatives-template.xlsx';
const DEFAULT_PREVIEW = 'https://publisher.com/ads/preview.png';
const LAST_SETTINGS_KEY = 'creative-batch-generator:last-settings:v2';

let templateBytes = new Uint8Array();
let templateConfig: TemplateConfig = { categories: [], sizes: [], creativeTypes: [], adServers: [] };
let creatives: Creative[] = [];
let parseIssues: ParseIssue[] = [];
let sourceScriptCount = 0;

function loadLastSettings(): Partial<ExportSettings> {
  try {
    return JSON.parse(localStorage.getItem(LAST_SETTINGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function esc(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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
          <h1>From scripts to upload-ready Excel.</h1>
          <p>Import the customer’s SeenThis/Hawk tags, review names and sizes against the current template, and export only the creatives you want to include.</p>
        </div>
        <div class="hero-side">
          <div class="privacy-pill">Processed locally in your browser</div>
          <div class="hero-stat"><strong>Auto naming</strong><span>Creative names are derived from the file comments and the dimension is added once.</span></div>
          <div class="hero-stat"><strong>Safe partial export</strong><span>Unknown sizes are excluded automatically without blocking the remaining creatives.</span></div>
        </div>
      </header>
    </section>

    <main class="page">
      <section class="panel upload-panel">
        <div class="section-heading">
          <div><span class="step">1</span><h2>Upload customer script file</h2></div>
          <span id="template-state" class="muted">Loading template…</span>
        </div>
        <label class="dropzone" id="dropzone">
          <input id="file-input" type="file" accept=".txt,.html,.js,text/plain" />
          <strong>Choose or drop a .txt file here</strong>
          <span>SeenThis tags, comments, width and height are detected automatically.</span>
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
          <label class="wide">Landing Page<input id="landing-page" type="url" placeholder="https://…?utm_source=hawk…" value="${esc(last.landingPage ?? '')}" /></label>
          <label class="checkbox-row wide"><input id="replace-clicktag" type="checkbox" ${last.replaceClicktag === false ? '' : 'checked'} /><span>Replace the <code>\${HAWK_CLICK}</code> URL in scripts with the URL-encoded Landing Page</span></label>
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
        <div id="creative-table-wrap" class="empty-state">Upload a script file to get started.</div>
      </section>

      <section class="export-bar">
        <div>
          <strong id="export-status">No file loaded</strong>
          <span id="export-detail">Export becomes available when at least one valid creative is included.</span>
        </div>
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
  const preferredCategory = (last.category && templateConfig.categories.some((x) => x.label === last.category))
    ? last.category
    : templateConfig.categories.find((x) => x.label === 'Malls & Shopping Centers')?.label ?? templateConfig.categories[0]?.label;
  const preferredType = (last.creativeType && templateConfig.creativeTypes.includes(last.creativeType)) ? last.creativeType : 'javascript';
  const preferredAdserver = (last.adServer && templateConfig.adServers.includes(last.adServer)) ? last.adServer : 'Other';
  category.innerHTML = optionMarkup(templateConfig.categories.map((x) => x.label), preferredCategory);
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
    replaceClicktag: document.querySelector<HTMLInputElement>('#replace-clicktag')!.checked,
  };
}

function includedCreatives(): Creative[] {
  return creatives.filter((creative) => creative.included && Boolean(creative.mappedSizeLabel));
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
  if (!creatives.length && !parseIssues.length) {
    warningArea.innerHTML = '';
    return;
  }

  const settings = currentSettings();
  const blocks: string[] = [];
  const missingDims = [...new Set(creatives.filter((c) => !c.mappedSizeLabel).map((c) => c.dimension))];
  const excluded = creatives.filter((c) => !c.included).length;
  const noClicktag = settings.replaceClicktag ? includedCreatives().filter((c) => !hasHawkClicktag(c.script)) : [];
  const duplicateNames = duplicateIncludedNames();
  const rowWarningCount = creatives.filter((c) => c.warnings.some((warning) => !warning.includes('is missing from the template'))).length;

  if (missingDims.length) {
    blocks.push(`<div class="warning warning-error"><strong>Sizes missing from the template:</strong> ${missingDims.map((dim) => `<code>${esc(dim)}</code>`).join(', ')}. These rows are automatically excluded and will not be exported. The remaining valid creatives can still be exported.</div>`);
  }
  if (excluded && !missingDims.length) {
    blocks.push(`<div class="warning"><strong>${excluded} creative${excluded === 1 ? '' : 's'} excluded.</strong> They remain visible for review but will not be included in Excel.</div>`);
  }
  if (parseIssues.length) {
    blocks.push(`<div class="warning warning-error"><strong>Import issues:</strong><ul>${parseIssues.map((issue) => `<li>${esc(issue.message)}</li>`).join('')}</ul></div>`);
  }
  if (rowWarningCount) {
    blocks.push(`<div class="warning"><strong>${rowWarningCount} row${rowWarningCount === 1 ? ' needs' : 's need'} additional review.</strong> Open the row warning for details.</div>`);
  }
  if (noClicktag.length) {
    blocks.push(`<div class="warning"><strong>Clicktag:</strong> ${noClicktag.length} included creative${noClicktag.length === 1 ? ' is' : 's are'} missing <code>\${HAWK_CLICK}</code>. They will still be exported, but the script clicktag cannot be replaced automatically.</div>`);
  }
  if (duplicateNames.length) {
    blocks.push(`<div class="warning"><strong>Duplicate names:</strong> ${duplicateNames.map((name) => `<code>${esc(name)}</code>`).join(', ')}. Export is allowed, but verify that the names are intentionally identical.</div>`);
  }

  warningArea.innerHTML = blocks.join('');
}

function rerenderCreatives(): void {
  const included = includedCreatives().length;
  const excluded = creatives.length - included;
  document.querySelector('#creative-count')!.textContent = creatives.length
    ? `${creatives.length} found · ${included} included · ${excluded} excluded`
    : '0 found';

  const wrap = document.querySelector<HTMLDivElement>('#creative-table-wrap')!;
  if (!creatives.length) {
    wrap.className = 'empty-state';
    wrap.innerHTML = parseIssues.length ? 'No exportable creatives could be identified.' : 'Upload a script file to get started.';
    renderWarnings();
    updateExportState();
    return;
  }

  wrap.className = 'table-wrap';
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Include</th><th>#</th><th>Creative name</th><th>Size</th><th>Status</th><th>Clicktag</th><th>Script</th><th></th></tr></thead>
      <tbody>${creatives.map((creative, index) => {
        const invalidSize = !creative.mappedSizeLabel;
        const otherWarnings = creative.warnings.filter((warning) => !warning.includes('is missing from the template'));
        return `
        <tr class="${invalidSize ? 'missing-size' : creative.included ? '' : 'excluded-row'}">
          <td class="include-cell"><input class="include-input" type="checkbox" data-index="${index}" ${creative.included ? 'checked' : ''} ${invalidSize ? 'disabled' : ''} aria-label="Include creative ${index + 1}" /></td>
          <td>${index + 1}</td>
          <td>
            <input class="name-input" data-index="${index}" value="${esc(creative.name)}" ${creative.included ? '' : 'disabled'} />
            ${creative.nameSource === 'script-comment'
              ? `<span class="source-hint" title="${esc(creative.sourceComment)}">Name derived from script comment</span>`
              : creative.nameSource === 'file-header'
                ? `<span class="source-hint">Name built from file campaign header + size</span>`
                : `<span class="source-hint warning-text">Fallback name – review manually</span>`}
          </td>
          <td><span class="dimension ${invalidSize ? 'dimension-error' : ''}">${creative.dimension}</span></td>
          <td>${invalidSize
            ? `<span class="status-error">⚠ Missing · excluded</span>`
            : creative.included
              ? `<span class="status-ok">✓ ${esc(creative.mappedSizeLabel!)}</span>`
              : `<span class="status-muted">Excluded</span>`}
            ${otherWarnings.length ? `<details class="row-warning"><summary>⚠ ${otherWarnings.length} warning${otherWarnings.length === 1 ? '' : 's'}</summary><ul>${otherWarnings.map((warning) => `<li>${esc(warning)}</li>`).join('')}</ul></details>` : ''}
          </td>
          <td>${hasHawkClicktag(creative.script) ? `<span class="status-ok">✓ Hawk</span>` : `<span class="status-muted">No Hawk macro</span>`}</td>
          <td><details><summary>Show</summary><pre>${esc(creative.script)}</pre></details></td>
          <td><button class="remove-button" data-index="${index}" type="button">Remove</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;

  wrap.querySelectorAll<HTMLInputElement>('.name-input').forEach((input) => {
    input.addEventListener('input', () => {
      creatives[Number(input.dataset.index)].name = input.value;
      renderWarnings();
      updateExportState();
    });
  });
  wrap.querySelectorAll<HTMLInputElement>('.include-input').forEach((input) => {
    input.addEventListener('change', () => {
      const creative = creatives[Number(input.dataset.index)];
      creative.included = Boolean(creative.mappedSizeLabel) && input.checked;
      rerenderCreatives();
    });
  });
  wrap.querySelectorAll<HTMLButtonElement>('.remove-button').forEach((button) => {
    button.addEventListener('click', () => {
      creatives.splice(Number(button.dataset.index), 1);
      rerenderCreatives();
    });
  });

  renderWarnings();
  updateExportState();
}

function validate(): string[] {
  const errors: string[] = [];
  const settings = currentSettings();
  const included = includedCreatives();
  if (!creatives.length) errors.push('No script file has been loaded.');
  if (creatives.length && !included.length) errors.push('No valid creative is selected for export.');
  if (included.length > 200) errors.push('A maximum of 200 creatives can be exported in one template.');
  if (included.some((c) => !c.name.trim())) errors.push('At least one included creative is missing a name.');
  if (included.some((c) => !c.mappedSizeLabel)) errors.push('An included creative does not have a valid template size.');
  if (!isHttpUrl(settings.previewUrl)) errors.push('Preview Image URL must be a valid http/https URL.');
  if (!isHttpUrl(settings.landingPage)) errors.push('Landing Page must be a valid http/https URL.');
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
  status.textContent = errors.length ? 'Not ready to export' : `${included} creative${included === 1 ? '' : 's'} ready to export`;
  detail.textContent = errors.length
    ? errors[0]
    : excluded
      ? `${excluded} creative${excluded === 1 ? '' : 's'} excluded and will not be exported.`
      : 'All identified creatives will be exported.';
}

async function handleFile(file: File): Promise<void> {
  const sourceText = await file.text();
  const parsed = parseCreativeFile(sourceText, templateConfig.sizes);
  creatives = parsed.creatives;
  parseIssues = parsed.issues;
  sourceScriptCount = parsed.scriptCount;

  const detectedLanding = extractLandingPageFromScripts(sourceText);
  const landingInput = document.querySelector<HTMLInputElement>('#landing-page')!;
  if (detectedLanding && !landingInput.value.trim()) landingInput.value = detectedLanding;

  const summary = document.querySelector<HTMLDivElement>('#file-summary')!;
  summary.classList.remove('hidden');
  summary.innerHTML = `<strong>${esc(file.name)}</strong><span>${sourceScriptCount} scripts found · ${creatives.length} creatives identified</span>`;
  rerenderCreatives();
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

async function init(): Promise<void> {
  renderShell();
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error('Could not load the Excel template.');
  templateBytes = new Uint8Array(await response.arrayBuffer());
  templateConfig = readTemplateConfig(templateBytes);
  hydrateSettings();
  document.querySelector('#template-state')!.textContent = `Template loaded · ${templateConfig.sizes.length} sizes · ${templateConfig.categories.length} categories`;

  const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
  fileInput.addEventListener('change', () => fileInput.files?.[0] && void handleFile(fileInput.files[0]));
  const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!;
  for (const event of ['dragenter', 'dragover']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.add('dragging'); });
  for (const event of ['dragleave', 'drop']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.remove('dragging'); });
  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  });

  document.querySelector('#include-valid')!.addEventListener('click', () => {
    creatives.forEach((creative) => { creative.included = Boolean(creative.mappedSizeLabel); });
    rerenderCreatives();
  });
  document.querySelector('#remove-excluded')!.addEventListener('click', () => {
    creatives = creatives.filter((creative) => creative.included);
    rerenderCreatives();
  });

  document.querySelectorAll('#settings-panel input, #settings-panel select').forEach((el) => {
    el.addEventListener('input', () => {
      renderWarnings();
      updateExportState();
    });
  });

  document.querySelector<HTMLButtonElement>('#export-button')!.addEventListener('click', () => {
    const settings = currentSettings();
    localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(settings));
    const selected = includedCreatives();
    const output = generateWorkbook(templateBytes, templateConfig, selected, settings);
    download(output, 'BatchUploadCreatives-filled.xlsx');
  });
  updateExportState();
}

init().catch((error) => {
  console.error(error);
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `<main class="page"><div class="fatal"><h1>Something went wrong</h1><p>${esc(error instanceof Error ? error.message : String(error))}</p></div></main>`;
});
