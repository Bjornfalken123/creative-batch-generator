import './style.css';
import { extractLandingPageFromScripts, parseCreativeFile } from './parser';
import { generateWorkbook, readTemplateConfig } from './xlsx';
import type { Creative, ExportSettings, TemplateConfig } from './types';

const TEMPLATE_URL = '/BatchUploadCreatives-template.xlsx';
const DEFAULT_PREVIEW = 'https://publisher.com/ads/preview.png';
const LAST_SETTINGS_KEY = 'creative-batch-generator:last-settings:v1';

let templateBytes = new Uint8Array();
let templateConfig: TemplateConfig = { categories: [], sizes: [], creativeTypes: [], adServers: [] };
let creatives: Creative[] = [];
let sourceText = '';
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
          <p>Importera kundens SeenThis/Hawk-taggar, validera storlekar mot den aktuella templaten och exportera en färdig BatchUploadCreatives-fil.</p>
        </div>
        <div class="hero-side">
          <div class="privacy-pill">Bearbetas lokalt i din browser</div>
          <div class="hero-stat"><strong>3 steg</strong><span>Importera scripts, kontrollera creatives och exportera Excel.</span></div>
          <div class="hero-stat"><strong>Strict size check</strong><span>Storlekar måste finnas i template-dropdownen. Annars stoppas exporten.</span></div>
        </div>
      </header>
    </section>

    <main class="page">
      <section class="panel upload-panel">
        <div class="section-heading">
          <div><span class="step">1</span><h2>Ladda upp kundens scriptfil</h2></div>
          <span id="template-state" class="muted">Laddar template…</span>
        </div>
        <label class="dropzone" id="dropzone">
          <input id="file-input" type="file" accept=".txt,.html,.js,text/plain" />
          <strong>Välj eller släpp en .txt-fil här</strong>
          <span>SeenThis-taggar med kommentarer, width och height läses automatiskt.</span>
        </label>
        <div id="file-summary" class="file-summary hidden"></div>
      </section>

      <section class="panel" id="settings-panel">
        <div class="section-heading">
          <div><span class="step">2</span><h2>Kampanjinställningar</h2></div>
          <span class="muted">Används på alla rader</span>
        </div>
        <div class="form-grid">
          <label>IAB Category<select id="category"></select></label>
          <label>Creative Type<select id="creative-type"></select></label>
          <label>AdServer<select id="adserver"></select></label>
          <label>Preview Image URL<input id="preview-url" type="url" value="${esc(last.previewUrl ?? DEFAULT_PREVIEW)}" /></label>
          <label class="wide">Landing Page<input id="landing-page" type="url" placeholder="https://…?utm_source=hawk…" value="${esc(last.landingPage ?? '')}" /></label>
          <label class="checkbox-row wide"><input id="replace-clicktag" type="checkbox" ${last.replaceClicktag === false ? '' : 'checked'} /><span>Byt <code>\${HAWK_CLICK}</code>-URL i alla scripts till den URL-kodade Landing Page-länken</span></label>
        </div>
      </section>

      <section class="panel" id="creative-panel">
        <div class="section-heading">
          <div><span class="step">3</span><h2>Kontrollera creatives</h2></div>
          <span id="creative-count" class="count-badge">0 hittade</span>
        </div>
        <div id="warnings"></div>
        <div id="creative-table-wrap" class="empty-state">Ladda upp en scriptfil för att börja.</div>
      </section>

      <section class="export-bar">
        <div>
          <strong id="export-status">Ingen fil inläst</strong>
          <span id="export-detail">Export blir tillgänglig när alla creatives har en giltig storlek.</span>
        </div>
        <button id="export-button" disabled>Exportera BatchUploadCreatives.xlsx</button>
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

function rerenderCreatives(): void {
  document.querySelector('#creative-count')!.textContent = `${creatives.length} hittade`;
  const wrap = document.querySelector<HTMLDivElement>('#creative-table-wrap')!;
  const warningArea = document.querySelector<HTMLDivElement>('#warnings')!;
  if (!creatives.length) {
    wrap.className = 'empty-state';
    wrap.innerHTML = 'Ladda upp en scriptfil för att börja.';
    warningArea.innerHTML = '';
    updateExportState();
    return;
  }

  const unresolvedDims = [...new Set(creatives.filter((c) => !c.mappedSizeLabel).map((c) => c.dimension))];
  warningArea.innerHTML = unresolvedDims.length
    ? `<div class="warning warning-error"><strong>Storlek saknas i templaten:</strong> ${unresolvedDims.map((dim) => `<code>${esc(dim)}</code>`).join(', ')}. Lägg till storleken i template-filens dropdown innan export.</div>`
    : '';

  wrap.className = 'table-wrap';
  wrap.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Creative name</th><th>Upptäckt storlek</th><th>Template-status</th><th>Script</th></tr></thead>
      <tbody>${creatives.map((creative, index) => `
        <tr class="${creative.mappedSizeLabel ? '' : 'missing-size'}">
          <td>${index + 1}</td>
          <td><input class="name-input" data-index="${index}" value="${esc(creative.name)}" /></td>
          <td><span class="dimension ${creative.mappedSizeLabel ? '' : 'dimension-error'}">${creative.dimension}</span></td>
          <td>${creative.mappedSizeLabel
            ? `<span class="status-ok">✓ ${esc(creative.mappedSizeLabel)}</span>`
            : `<span class="status-error">⚠ Saknas i template</span>`}</td>
          <td><details><summary>Visa</summary><pre>${esc(creative.script)}</pre></details></td>
        </tr>`).join('')}</tbody>
    </table>`;

  wrap.querySelectorAll<HTMLInputElement>('.name-input').forEach((input) => {
    input.addEventListener('input', () => {
      creatives[Number(input.dataset.index)].name = input.value;
      updateExportState();
    });
  });
  updateExportState();
}

function validate(): string[] {
  const errors: string[] = [];
  const settings = currentSettings();
  if (!creatives.length) errors.push('Ingen scriptfil är inläst.');
  if (creatives.some((c) => !c.mappedSizeLabel)) errors.push('Minst en creative har en storlek som saknas i templaten.');
  if (creatives.some((c) => !c.name.trim())) errors.push('Minst ett creative saknar namn.');
  if (!settings.previewUrl.startsWith('http')) errors.push('Preview Image URL måste börja med http/https.');
  if (!settings.landingPage.startsWith('http')) errors.push('Landing Page måste börja med http/https.');
  return errors;
}

function updateExportState(): void {
  const errors = validate();
  const button = document.querySelector<HTMLButtonElement>('#export-button')!;
  const status = document.querySelector<HTMLElement>('#export-status')!;
  const detail = document.querySelector<HTMLElement>('#export-detail')!;
  button.disabled = errors.length > 0;
  status.textContent = errors.length ? 'Inte redo för export' : `${creatives.length} creatives redo`;
  detail.textContent = errors.length ? errors[0] : 'Alla nödvändiga fält är ifyllda.';
}

async function handleFile(file: File): Promise<void> {
  sourceText = await file.text();
  creatives = parseCreativeFile(sourceText, templateConfig.sizes);

  const detectedLanding = extractLandingPageFromScripts(sourceText);
  const landingInput = document.querySelector<HTMLInputElement>('#landing-page')!;
  if (detectedLanding && !landingInput.value.trim()) landingInput.value = detectedLanding;

  const summary = document.querySelector<HTMLDivElement>('#file-summary')!;
  summary.classList.remove('hidden');
  summary.innerHTML = `<strong>${esc(file.name)}</strong><span>${creatives.length} creatives identifierade</span>`;
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
  if (!response.ok) throw new Error('Kunde inte ladda Excel-templaten.');
  templateBytes = new Uint8Array(await response.arrayBuffer());
  templateConfig = readTemplateConfig(templateBytes);
  hydrateSettings();
  document.querySelector('#template-state')!.textContent = `Template laddad · ${templateConfig.sizes.length} storlekar · ${templateConfig.categories.length} kategorier`;

  const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
  fileInput.addEventListener('change', () => fileInput.files?.[0] && void handleFile(fileInput.files[0]));
  const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!;
  for (const event of ['dragenter', 'dragover']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.add('dragging'); });
  for (const event of ['dragleave', 'drop']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.remove('dragging'); });
  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  });

  document.querySelectorAll('#settings-panel input, #settings-panel select').forEach((el) => el.addEventListener('input', updateExportState));
  document.querySelector<HTMLButtonElement>('#export-button')!.addEventListener('click', () => {
    const settings = currentSettings();
    localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(settings));
    const output = generateWorkbook(templateBytes, templateConfig, creatives, settings);
    download(output, 'BatchUploadCreatives-filled.xlsx');
  });
  updateExportState();
}

init().catch((error) => {
  console.error(error);
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `<main class="page"><div class="fatal"><h1>Något gick fel</h1><p>${esc(error instanceof Error ? error.message : String(error))}</p></div></main>`;
});
