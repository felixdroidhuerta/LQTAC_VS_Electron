const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const statusMessage = $('#status-message');
const runtimeLabel = $('#runtime-label');
const connectionLabel = $('#connection-label');
const generationState = $('#generation-state');
const audioPlayer = $('#audio-player');
const projectPathLabel = $('#project-path');
const waveformCanvas = $('#waveform-canvas');
const previewCanvas = $('#preview-waveform-canvas');

let currentProject = null;
let currentProjectFilePath = null;
let currentAudioPath = null;
document.querySelector('#stt-show-times').addEventListener('change', event => {
  const field = document.querySelector('#stt-output');
  field.value = field.value.split('\n').map((line, index) => {
    const plain = line.replace(/^\[\d{2}:\d{2}:\d{2}\] /, '');
    const segment = (window.sttSegments || [])[index];
    return event.target.checked && segment ? '[' + segment.time + '] ' + plain : plain;
  }).join('\n');
});
let waveformPeaks = [];
let waveformDuration = 0;
let selectionStart = null;
let selectionEnd = null;
let cursorSeconds = 0;
let cutSegments = [];
let splitPoints = [];
let editorMode = 'cursor';
let dragStart = null;
let fusionFiles = [];
let conversionFile = null;
let batchInputs = [];
let batchStates = [];
let batchFolder = null;
const engineDefinitions = {
  edge: { label: 'Edge TTS', note: 'Motor online de Microsoft. Filtra y carga el catálogo de voces disponible.', fields: () => `<label class="wide">Filtro de idioma<input id="engine-locale" value="es-ES" placeholder="es-ES"></label><label class="wide">Voz<select id="engine-voice"><option value="es-ES-ElviraNeural">es-ES-ElviraNeural</option></select></label>` },
  azure: { label: 'Azure Speech', note: 'Usa tu recurso de Azure Speech. También admite SPEECH_KEY y SPEECH_REGION del entorno.', fields: () => `<label>Clave de Speech<input id="engine-key" type="password"></label><label>Región<input id="engine-region" placeholder="westeurope"></label><label class="wide">Voz<input id="engine-voice" value="es-ES-ElviraNeural"></label><div class="azure-links wide"><button type="button" class="primary-button" data-external-url="https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices">Abrir portal: crear Speech y obtener clave</button><button type="button" class="secondary-button" data-external-url="https://learn.microsoft.com/azure/ai-services/speech-service/overview">Abrir guía oficial de Azure Speech</button><button type="button" class="secondary-button" id="azure-load-environment">Cargar credenciales del entorno</button></div>` },
  qwen: { label: 'Qwen TTS', note: 'Motor local. La primera carga del modelo puede tardar.', fields: () => `<label>Voz<select id="engine-voice">${['serena','ryan','dylan','aiden','eric','ono_anna','sohee','uncle_fu','vivian'].map(v => `<option>${v}</option>`).join('')}</select></label><label>Idioma<select id="engine-language">${['Auto','Spanish','English','Portuguese','French','Italian','German','Chinese','Japanese','Korean','Russian'].map(v => `<option>${v}</option>`).join('')}</select></label><label class="wide">Modelo<input id="engine-model" value="Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"></label><label class="wide">Instrucción de estilo<input id="engine-instruct" placeholder="Ej.: voz cálida, íntima y cercana"></label>` },
  melo: { label: 'MeloTTS', note: 'Motor local gratuito. La primera ejecución puede preparar o descargar el modelo.', fields: () => `<label>Idioma<select id="engine-language">${['Español','English','Français','中文','日本語','한국어'].map(v => `<option>${v}</option>`).join('')}</select></label><label>Voz<input id="engine-voice" value="ES"></label><label class="wide">Velocidad del modelo<select id="engine-speed">${['0.75','0.9','1.0','1.1','1.25','1.5'].map(v => `<option>${v}</option>`).join('')}</select></label>` },
  matxa: { label: 'Matxa alVoCat CA', note: 'Motor online experimental para catalán. Máximo 500 caracteres.', fields: () => `<label>Acento<select id="engine-accent">${['balear','central','nord-occidental','valencia'].map(v => `<option>${v}</option>`).join('')}</select></label><label>Voz<select id="engine-voice"></select></label><label>Temperatura<input id="engine-temperature" type="number" min="0.1" max="0.8" step="0.01" value="0.20"></label><label>Ritmo del modelo<input id="engine-length" type="number" min="0.8" max="1.1" step="0.01" value="0.89"></label>` }
};
const matxaVoices = { balear:['quim','olga'], central:['grau','elia'], 'nord-occidental':['pere','emma'], valencia:['lluc','gina'] };
function updateMatxaVoices() { const accent = $('#engine-accent')?.value; const voice = $('#engine-voice'); if (!accent || !voice) return; voice.replaceChildren(...matxaVoices[accent].map(value => new Option(value, value))); }
function renderEngineFields() { const engine = engineDefinitions[$('#engine').value]; const host = $('#engine-fields'); host.className = 'engine-fields-grid'; host.innerHTML = engine.fields() + `<p class="engine-note">${engine.note}</p>`; $('#prepare-generation').textContent = `Generar audio ${engine.label}`; $('#load-voices').hidden = $('#engine').value !== 'edge'; $('#engine-accent')?.addEventListener('change', updateMatxaVoices); $$('[data-external-url]').forEach(button => button.addEventListener('click', () => window.voiceStudio.openExternal(button.dataset.externalUrl).catch(error => setStatus(error.message)))); $('#azure-load-environment')?.addEventListener('click', async () => { try { const credentials = await window.voiceStudio.getAzureCredentials(); $('#engine-key').value = credentials.key || ''; $('#engine-region').value = credentials.region || ''; $('#engine-voice').value = credentials.voice || 'es-ES-ElviraNeural'; setStatus(credentials.key && credentials.region ? 'Credenciales de Azure cargadas desde el entorno.' : 'No se encontraron SPEECH_KEY y SPEECH_REGION en el entorno.'); } catch (error) { setStatus(error.message); } }); updateMatxaVoices(); generationState.textContent = `${engine.label} seleccionado`; }
function showBatchSelection() {
  const container = $('#conversion-file'); container.replaceChildren();
  const heading = document.createElement('strong');
  heading.className = 'conversion-folder';
  heading.textContent = batchFolder ? 'Carpeta: ' + batchFolder.split(/[\\/]/).filter(Boolean).pop() : 'Archivos seleccionados';
  if (batchFolder) heading.title = batchFolder;
  container.append(heading);
  if (batchFolder) { const location = document.createElement('div'); location.className = 'conversion-location'; location.textContent = batchFolder; container.append(location); }
  const count = document.createElement('div'); count.textContent = batchInputs.length + ' archivo(s)'; container.append(count);
  const list = document.createElement('ol'); list.className = 'conversion-files';
  batchInputs.forEach((file, index) => {
    const row = document.createElement('li');
    const name = document.createElement('span'); name.className = 'conversion-filename'; name.textContent = file.split(/[\\/]/).pop(); name.title = file;
    const state = document.createElement('span'); state.className = 'conversion-state'; state.textContent = batchStates[index] || 'Pendiente';
    row.append(name, state); list.append(row);
  });
  container.append(list);
}
window.voiceStudio.onBatchProgress(data => {
  batchStates[data.index] = data.state === 'done' ? 'Convertido' : data.state === 'error' ? 'Error: ' + data.error : 'Convirtiendo…';
  showBatchSelection();
  setStatus(`${data.index + 1}/${data.total}: ${data.input} · ${batchStates[data.index]}`);
});
$('#conversion-select').addEventListener('click', () => { batchInputs = []; batchStates = []; batchFolder = null; });
$('#conversion-run').addEventListener('click', async event => {
  if (!batchInputs.length) return;
  event.stopImmediatePropagation();
  const button = $('#conversion-run'); button.disabled = true;
  batchStates = []; showBatchSelection();
  try {
    setStatus('Elige la carpeta de salida para iniciar la conversión.');
    const result = await window.voiceStudio.convertBatch({inputs:batchInputs, profile:$('#conversion-format').value});
    setStatus(result.canceled ? 'Conversión cancelada. No se inició el lote.' : `${result.count}/${result.total} convertidos. Destino: ${result.directory}`);
  } catch(error) { setStatus('Error de conversión: ' + error.message); }
  finally { button.disabled = false; }
}, true);
$('#export-project-top').addEventListener('click', async () => {
  try {
    const result = await window.voiceStudio.exportProject(currentProject || projectTemplate());
    if (!result.canceled) setStatus('Proyecto exportado con sus audios: ' + result.filePath);
  } catch (error) { setStatus('Error al exportar proyecto: ' + error.message); }
});
const batchActions = document.createElement('div');
batchActions.className = 'transcript-toolbar';
$('#conversion-select').after(batchActions);
for (const [label, folder] of [['Seleccionar varios archivos', false], ['Seleccionar carpeta y subcarpetas', true]]) {
  const button = document.createElement('button'); button.className = 'secondary-button'; button.textContent = label;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const result = await window.voiceStudio.convertBatch({ folder, selectOnly:true });
      if (!result.canceled) { batchInputs = result.inputs; batchFolder = result.folder; batchStates = []; conversionFile = null; showBatchSelection(); setStatus('Selección preparada. Elige formato y pulsa Convertir audio para continuar.'); }
    } catch (error) { setStatus('Error de conversión: ' + error.message); }
    finally { button.disabled = false; }
  });
  batchActions.append(button);
}
let idtagFile = null;
let idtagCoverFile = null;
let cloneSampleFile = null;
let cloneProfiles = [];
let sttAudioFile = null;
let audioContext = null;
let mediaSourceNode = null;
let liveFxNodes = [];
const EQ_BANDS = [
  { key: 'eq_60', id: 'eq-band-60', frequency: 60, warm: 2 },
  { key: 'eq_170', id: 'eq-band-170', frequency: 170, warm: 1 },
  { key: 'eq_310', id: 'eq-band-310', frequency: 310, warm: 0 },
  { key: 'eq_600', id: 'eq-band-600', frequency: 600, warm: 0 },
  { key: 'eq_1000', id: 'eq-band-1000', frequency: 1000, warm: 0 },
  { key: 'eq_3000', id: 'eq-band-3000', frequency: 3000, warm: 0 },
  { key: 'eq_6000', id: 'eq-band-6000', frequency: 6000, warm: -1 },
  { key: 'eq_12000', id: 'eq-band-12000', frequency: 12000, warm: -1 }
];

function projectTemplate(name = 'mi_proyecto') {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return { app: 'LQTAC Voice Studio', project_format: 'tacvs', format_version: 1, app_version: 'Electron 0.1.0', project_name: name, created_at: now, updated_at: now, creation: { system: '—', voice: '—' }, active_take_id: null, takes: [], notes: 'Proyecto portable de LQTAC Voice Studio.' };
}
function setStatus(message) { statusMessage.textContent = message; }
function updateProjectLabel(filePath = '') { currentProjectFilePath = filePath || null; projectPathLabel.textContent = filePath ? `Proyecto: ${filePath}` : 'Proyecto nuevo sin guardar'; }
let projectModalResolve = null;
function closeProjectModal(result) { $('#project-modal').hidden = true; const resolve = projectModalResolve; projectModalResolve = null; if (resolve) resolve(result); }
function setProjectModalMessage(message, boldWord = '') { const node = $('#project-modal-message'); node.replaceChildren(); if (!boldWord) { node.textContent = message; return; } const parts = String(message).split(boldWord); parts.forEach((part, index) => { if (index) { const strong = document.createElement('strong'); strong.textContent = boldWord; node.appendChild(strong); } node.appendChild(document.createTextNode(part)); }); }
function openProjectModal({ title, message, boldWord = '', showName = false, showCancel = showName, confirmText = 'Aceptar', cancelText = 'Cancelar', kind = 'info', defaultName = '' }) { const modal = $('#project-modal'); const box = $('.project-modal'); $('#project-modal-title').textContent = title; setProjectModalMessage(message, boldWord); $('#project-modal-confirm').textContent = confirmText; $('#project-modal-cancel').textContent = cancelText; $('#project-modal-cancel').hidden = !showCancel; $('#project-modal-name-label').hidden = !showName; $('#project-modal-name').value = defaultName; $('#project-modal-icon').textContent = kind === 'success' ? '✓' : kind === 'error' ? '!' : 'i'; box.classList.toggle('success', kind === 'success'); box.classList.toggle('error', kind === 'error'); box.classList.remove('invalid'); modal.hidden = false; if (showName) requestAnimationFrame(() => $('#project-modal-name').focus()); return new Promise(resolve => { projectModalResolve = resolve; }); }
function formatTime(seconds) { const value = Math.max(0, Number(seconds) || 0); const minutes = Math.floor(value / 60); return `${String(minutes).padStart(2, '0')}:${(value - minutes * 60).toFixed(3).padStart(6, '0')}`; }
function signed(value, suffix = '') { const number = Number(value) || 0; return `${number >= 0 ? '+' : ''}${number}${suffix}`; }
function setRangeOutput(id, value, suffix = '') { const node = $(`#${id}`); if (node) node.textContent = signed(value, suffix); }

function updateSelectionInfo() {
  if (selectionStart === null || selectionEnd === null || !waveformDuration) $('#selection-info').textContent = 'Sin selección';
  else $('#selection-info').textContent = `Selección: ${formatTime(Math.min(selectionStart, selectionEnd))} → ${formatTime(Math.max(selectionStart, selectionEnd))}`;
  $('#cursor-info').textContent = `Cursor: ${formatTime(cursorSeconds)}`;
  $('#cuts-info').textContent = cutSegments.length ? `${cutSegments.length} recorte(s) marcado(s)` : 'Sin recortes';
}

function drawWaveform(canvas, compact = false) {
  if (!canvas) return;
  const width = Math.max(compact ? 260 : 320, canvas.clientWidth || (compact ? 480 : 900));
  const height = compact ? 126 : 220;
  const ctx = canvas.getContext('2d');
  canvas.width = width; canvas.height = height;
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#080f20'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#182640'; ctx.lineWidth = 1;
  for (let row = 1; row < 4; row++) { const y = (height / 4) * row; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  if (!waveformPeaks.length || !waveformDuration) { if (!compact) { ctx.fillStyle = '#64708E'; ctx.font = '13px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('Genera o abre un audio para ver la onda real', width / 2, height / 2); } return; }
  const toX = seconds => Math.max(0, Math.min(width, (seconds / waveformDuration) * width));
  for (const [start, end] of cutSegments) { ctx.fillStyle = 'rgba(239, 68, 68, .27)'; ctx.fillRect(toX(start), 0, Math.max(2, toX(end) - toX(start)), height); }
  if (selectionStart !== null && selectionEnd !== null) { const left = toX(Math.min(selectionStart, selectionEnd)); const right = toX(Math.max(selectionStart, selectionEnd)); ctx.fillStyle = 'rgba(139, 92, 246, .27)'; ctx.fillRect(left, 0, Math.max(2, right - left), height); }
  for (const point of splitPoints) { const x = toX(point); ctx.strokeStyle = '#facc15'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); ctx.setLineDash([]); }
  ctx.strokeStyle = compact ? '#58d8ff' : '#50d7ff'; ctx.lineWidth = compact ? 1 : 1.2; ctx.beginPath();
  const step = width / Math.max(1, waveformPeaks.length - 1);
  waveformPeaks.forEach((peak, index) => { const x = index * step; const amp = Math.max(compact ? 1.5 : 2, peak * height * .42); ctx.moveTo(x, height / 2 - amp); ctx.lineTo(x, height / 2 + amp); }); ctx.stroke();
  const cursorX = toX(cursorSeconds); ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cursorX, 0); ctx.lineTo(cursorX, height); ctx.stroke();
  if (!compact) updateSelectionInfo();
}
function redrawWaveforms() { drawWaveform(waveformCanvas); drawWaveform(previewCanvas, true); }
function resetEditor() { waveformPeaks = []; waveformDuration = 0; selectionStart = null; selectionEnd = null; cursorSeconds = 0; cutSegments = []; splitPoints = []; currentAudioPath = null; audioPlayer.pause(); audioPlayer.removeAttribute('src'); audioPlayer.load(); audioPlayer.classList.remove('ready'); $('#reveal-output').disabled = true; $('#waveform-info').textContent = 'Sin audio cargado'; $('#preview-wave-info').textContent = 'Sin audio'; $('#preview-wave-wrap').classList.remove('ready'); $('#preview-empty').style.display = ''; $('#active-audio-bar').classList.remove('ready'); $('#active-audio-name').textContent = 'Genera o abre un audio para comenzar'; redrawWaveforms(); updateSelectionInfo(); }

async function loadAudioInEditor(filePath, url, label = 'Audio cargado') {
  currentAudioPath = filePath; audioPlayer.src = url; audioPlayer.classList.add('ready'); $('#active-audio-bar').classList.add('ready'); $('#active-audio-name').textContent = `${label} · ${filePath}`; $('#reveal-output').disabled = false;
  const analysis = await window.voiceStudio.analyzeAudio(filePath);
  waveformPeaks = analysis.peaks || []; waveformDuration = Number(analysis.duration) || 0; cursorSeconds = 0; selectionStart = null; selectionEnd = null; splitPoints = [];
  $('#waveform-info').textContent = `${formatTime(waveformDuration)} · ${waveformPeaks.length} puntos`; $('#preview-wave-info').textContent = `${formatTime(waveformDuration)} · onda real`; $('#preview-wave-wrap').classList.add('ready'); $('#preview-empty').style.display = 'none'; generationState.textContent = label; redrawWaveforms();
}
function addAudioTake(result, metadata = {}) { if (!currentProject) currentProject = projectTemplate('mi_proyecto'); const now = new Date().toISOString().slice(0, 19).replace('T', ' '); const index = currentProject.takes.length + 1; const take = { id: `take_${String(index).padStart(3, '0')}`, index, name: metadata.name || `Toma ${index}`, created_at: now, updated_at: now, _source_path: result.path, cuts: metadata.cuts || [], fx: metadata.fx || {}, tts: metadata.tts || { mode: 'Editor de audio', text: '' } }; currentProject.takes.push(take); currentProject.active_take_id = take.id; return take; }
function registerGeneratedTake(result) { const text = $('#voice-text').value.trim(); const engine = engineDefinitions[$('#engine').value]; const voice = $('#engine-voice')?.value || ''; addAudioTake(result, { name: text.slice(0, 38) || 'Toma generada', tts: { mode: engine.label, text, voice, rate: signed($('#motor-rate').value, '%'), pitch: signed($('#motor-pitch').value, 'Hz'), volume: signed($('#motor-volume').value, '%') } }); currentProject.creation = { system: engine.label, voice }; }
function currentEqBands() { return Object.fromEntries(EQ_BANDS.map(band => [band.key, Number($(`#${band.id}`).value) || 0])); }
function updateEqOutputs() { const values = currentEqBands(); const total = Object.values(values).reduce((sum, value) => sum + value, 0); EQ_BANDS.forEach(band => { const output = $(`#${band.id}-value`); if (output) output.textContent = `${signed(values[band.key], ' dB')}`; }); const average = Math.round((total / EQ_BANDS.length) * 10) / 10; $('#eq-summary').textContent = `EQ ${signed(average, ' dB')}`; $('#eq-footer').textContent = `EQ ${signed(average, ' dB')}`; }
function currentFxConfig() { const eqBands = currentEqBands(); return { intensity: Number($('#fx-intensity').value), echo_delay: Number($('#fx-echo-delay').value), bits: Number($('#fx-bits').value), metal: Number($('#fx-metal').value), radio_enabled: $('#fx-radio-enabled').checked, echo_enabled: $('#fx-echo-enabled').checked, robot_enabled: $('#fx-robot-enabled').checked, crusher_enabled: $('#fx-crusher-enabled').checked, eq_enabled: $('#fx-eq-enabled').checked, eq_bands: eqBands, eq_low: eqBands.eq_60, eq_mid: eqBands.eq_1000, eq_high: eqBands.eq_6000 }; }
function rememberLiveFxNode(node) { liveFxNodes.push(node); return node; }
function crusherCurve(bits, amount) { const size = 4096; const curve = new Float32Array(size); const levels = Math.max(2, 2 ** Math.max(2, Math.min(16, Math.round(bits)))); const mix = Math.max(0, Math.min(1, amount)); for (let index = 0; index < size; index++) { const sample = (index * 2) / (size - 1) - 1; const crushed = Math.round(sample * levels) / levels; curve[index] = sample * (1 - mix) + crushed * mix; } return curve; }
function releaseLiveFxGraph() { if (mediaSourceNode) { try { mediaSourceNode.disconnect(); } catch (_) {} } liveFxNodes.forEach(node => { try { node.disconnect(); } catch (_) {} }); liveFxNodes = []; }
function rebuildLiveFx() {
  if (!mediaSourceNode || !audioContext) return;
  releaseLiveFxGraph();
  const enabled = $('#live-fx-enabled').checked;
  const toggle = $('.live-fx-toggle'); const status = $('#live-fx-status'); toggle.classList.toggle('off', !enabled); status.textContent = enabled ? 'ACTIVO' : 'APAGADO'; status.style.color = enabled ? 'var(--green)' : 'var(--muted)';
  if (!enabled) { mediaSourceNode.connect(audioContext.destination); return; }
  const config = currentFxConfig(); const preset = $('#effect-preset').value; const active = (key, presetName) => config[key] || preset === presetName;
  let tail = mediaSourceNode;
  const append = node => { tail.connect(node); tail = rememberLiveFxNode(node); };
  const gain = audioContext.createGain(); gain.gain.value = Math.max(0, 1 + Number($('#edit-volume').value) / 100); append(gain);
  if (active('radio_enabled', 'radio')) { const highpass = audioContext.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 280; append(highpass); const lowpass = audioContext.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 3600; append(lowpass); const compressor = audioContext.createDynamicsCompressor(); compressor.threshold.value = -18; compressor.ratio.value = 3; append(compressor); }
  if (active('robot_enabled', 'robot') || active('crusher_enabled', 'bitcrusher')) { const crusher = audioContext.createWaveShaper(); const amount = active('robot_enabled', 'robot') ? Math.min(1, config.intensity / 100) : 1; crusher.curve = crusherCurve(config.bits, amount); crusher.oversample = '2x'; append(crusher); }
  if (config.eq_enabled || preset === 'warm') { const bands = config.eq_bands || {}; const eq = EQ_BANDS.map(band => [band.frequency, preset === 'warm' ? band.warm : Number(bands[band.key]) || 0]); eq.forEach(([frequency, value]) => { const filter = audioContext.createBiquadFilter(); filter.type = 'peaking'; filter.frequency.value = frequency; filter.Q.value = 1; filter.gain.value = Number(value) || 0; append(filter); }); }
  if (Math.abs(Number(config.metal)) >= .1) { const metal = audioContext.createBiquadFilter(); metal.type = 'peaking'; metal.frequency.value = 4200; metal.Q.value = 1; metal.gain.value = Number(config.metal); append(metal); }
  if (active('echo_enabled', 'echo')) { const dry = audioContext.createGain(); const wet = audioContext.createGain(); const delay = audioContext.createDelay(2); const feedback = audioContext.createGain(); const delaySeconds = Math.max(.02, Math.min(1.6, Number(config.echo_delay) / 1000)); delay.delayTime.value = delaySeconds; wet.gain.value = Math.max(.05, Math.min(.65, Number(config.intensity) / 240)); feedback.gain.value = .28; tail.connect(dry); dry.connect(audioContext.destination); tail.connect(delay); delay.connect(wet); wet.connect(audioContext.destination); delay.connect(feedback); feedback.connect(delay); [dry, wet, delay, feedback].forEach(rememberLiveFxNode); return; }
  tail.connect(audioContext.destination);
}
async function activateLiveFx() { if (!audioContext) { const AudioContextClass = window.AudioContext || window.webkitAudioContext; if (!AudioContextClass) throw new Error('Web Audio no está disponible en este runtime'); audioContext = new AudioContextClass(); mediaSourceNode = audioContext.createMediaElementSource(audioPlayer); } if (audioContext.state === 'suspended') await audioContext.resume(); rebuildLiveFx(); }
function registerEditedTake(result) { addAudioTake(result, { name: 'Edición de audio', cuts: cutSegments.slice(), fx: { effect: $('#effect-preset').value, volume: Number($('#edit-volume').value), config: currentFxConfig(), split_points: splitPoints.slice() } }); }
async function loadProjectAudio(project) { const active = project?.takes?.find(take => take.id === project.active_take_id); if (!active?.clean_audio) return resetEditor(); const info = await window.voiceStudio.getProjectAudioInfo(active.clean_audio); cutSegments = Array.isArray(active.cuts) ? active.cuts : []; await loadAudioInEditor(info.path, info.url, 'Toma cargada'); }

async function refreshRuntime() { setStatus('Comprobando runtime Python local…'); try { const [info, status] = await Promise.all([window.voiceStudio.getInfo(), window.voiceStudio.getStatus()]); const connected = status.source_root_exists && Boolean(status.python_runtime); runtimeLabel.textContent = connected ? 'Runtime conectado' : 'Runtime pendiente'; connectionLabel.textContent = connected ? 'Electron ↔ Python conectado' : 'Revisar runtime Python'; $('#connection-dot').style.background = connected ? 'var(--green)' : '#f0b45a'; $('#connection-dot').style.boxShadow = connected ? '0 0 13px rgba(85, 214, 154, .72)' : '0 0 13px rgba(240, 180, 90, .65)'; $('#source-path').textContent = info.sourceRoot; $('#settings-runtime-state').textContent = connected ? 'Conectado' : 'Pendiente'; $('#settings-source-state').textContent = info.sourceRoot || '—'; $('#settings-projects-state').textContent = info.projectsRoot || '—'; setStatus(connected ? 'Runtime listo para generar y editar audio.' : 'No se encontró el runtime Python original.'); } catch (error) { runtimeLabel.textContent = 'Puente no disponible'; connectionLabel.textContent = 'Error de conexión'; $('#settings-runtime-state').textContent = 'Error'; $('#settings-source-state').textContent = 'No disponible'; $('#settings-projects-state').textContent = 'No disponible'; setStatus(error.message); } }
function updateSttEngineUI() { const whisperCpp = $('#stt-engine').value === 'whispercpp'; $('#stt-runtime-label').hidden = !whisperCpp; $('#stt-select-runtime').hidden = !whisperCpp; $('#stt-model').placeholder = whisperCpp ? 'Ej.: ggml-small.bin o ruta al modelo' : 'Ej.: small o ruta a la carpeta del modelo'; $('#stt-select-model').textContent = whisperCpp ? 'Seleccionar modelo Whisper.cpp' : 'Usar modelo local de faster-whisper'; }
async function refreshSttStatus() { try { updateSttEngineUI(); const status = await window.voiceStudio.getSttStatus(); const whisper = status.whispercpp; const faster = status.faster_whisper; const selected = $('#stt-engine').value === 'whispercpp' ? whisper : faster; const message = $('#stt-engine').value === 'whispercpp' ? `Whisper.cpp: ${whisper.ready ? 'listo' : 'pendiente'} · ${whisper.models.length} modelo(s) local(es).` : `faster-whisper: ${faster.runtime_available ? 'runtime detectado' : 'runtime no instalado'} · ${faster.models.length} modelo(s) local(es).`; $('#stt-runtime-status').textContent = message; $('#stt-status').textContent = selected.ready ? 'Motor listo para transcribir.' : 'Instala el motor y modelo local para utilizarlo.'; } catch (error) { $('#stt-runtime-status').textContent = `No se pudo comprobar STT: ${error.message}`; } }
function showScreen(screen) { $$('[data-screen-section]').forEach(section => { section.hidden = section.dataset.screenSection !== screen; }); $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.screen === screen)); const headings = { generation: ['Generación de voz', 'Genera una voz y conserva el audio disponible para editarlo.'], clone: ['Clonador de voz', 'Crea voces clonadas localmente y envíalas directamente al editor.'], stt: ['STT / Transcripción', 'Transcribe audio con motores locales independientes de Voice Studio.'], projects: ['Proyectos', 'Abre y administra los proyectos guardados en la carpeta local del programa.'], editor: ['Editor de audio', 'Edita, mezcla, convierte y etiqueta el audio activo.'], settings: ['Configuración', 'Comprueba el runtime y ajusta el entorno de trabajo.'] }; const heading = headings[screen] || headings.generation; $('#screen-title').textContent = heading[0]; $('#screen-description').textContent = heading[1]; if (screen === 'projects') refreshProjects(); if (screen === 'stt') refreshSttStatus(); const frame = $('.tools-frame'); if (frame) frame.scrollTop = 0; requestAnimationFrame(redrawWaveforms); }
function formatProjectDate(value) { if (!value) return 'Sin fecha'; const date = new Date(String(value).replace(' ', 'T')); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }); }
function projectIconButton(type, title) { const button = document.createElement('button'); button.className = `icon-button ${type === 'delete' ? 'danger' : ''}`; button.type = 'button'; button.title = title; button.setAttribute('aria-label', title); button.innerHTML = type === 'open' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'; return button; }
function projectCell(value) { const cell = document.createElement('div'); cell.className = 'project-cell'; const strong = document.createElement('strong'); strong.textContent = value || '—'; cell.appendChild(strong); return cell; }
function createProjectRow(project) { const row = document.createElement('div'); row.className = 'project-row'; const name = document.createElement('div'); name.className = 'project-name'; const title = document.createElement('strong'); title.textContent = project.projectName || 'Proyecto sin nombre'; const date = document.createElement('small'); date.textContent = formatProjectDate(project.updatedAt); name.append(title, date); row.appendChild(name); row.appendChild(projectCell(formatTime(project.duration || 0))); row.appendChild(projectCell(project.system)); row.appendChild(projectCell(project.voice)); const actions = document.createElement('div'); actions.className = 'project-actions'; const open = projectIconButton('open', 'Abrir proyecto'); open.addEventListener('click', () => openSavedProject(project.filePath)); const remove = projectIconButton('delete', 'Borrar proyecto'); remove.addEventListener('click', () => deleteSavedProject(project)); actions.append(open, remove); row.appendChild(actions); return row; }
async function refreshProjects() { const list = $('#projects-list'); const empty = $('#projects-empty'); if (!list || !empty) return; list.replaceChildren(); try { const projects = await window.voiceStudio.listProjects(); projects.forEach(project => list.appendChild(createProjectRow(project))); empty.hidden = projects.length > 0; setStatus(projects.length ? `${projects.length} proyecto(s) local(es) encontrado(s).` : 'No hay proyectos guardados localmente.'); } catch (error) { empty.hidden = false; setStatus(`No se pudieron cargar los proyectos: ${error.message}`); } }
async function openSavedProject(filePath) { try { const result = await window.voiceStudio.openProject(filePath); if (result.canceled) return; currentProject = result.data; $('#project-name-input').value = result.data.project_name || ''; updateProjectLabel(result.filePath); await loadProjectAudio(currentProject); showScreen('editor'); setStatus(`Proyecto abierto: ${result.data.project_name || result.filePath}`); } catch (error) { setStatus(`No se pudo abrir el proyecto: ${error.message}`); } }
async function deleteSavedProject(project) { if (!window.confirm(`¿Borrar el proyecto "${project.projectName}" y sus audios?`)) return; try { await window.voiceStudio.deleteProject(project.filePath); const current = currentProjectFilePath && project.filePath && String(project.filePath).toLowerCase() === String(currentProjectFilePath).toLowerCase(); if (current) { currentProject = null; resetEditor(); updateProjectLabel(); } await refreshProjects(); setStatus(`Proyecto borrado: ${project.projectName}`); } catch (error) { setStatus(`No se pudo borrar el proyecto: ${error.message}`); } }
function focusEditor(tab = 'effects') { showScreen('editor'); $(`[data-editor-tab="${tab}"]`)?.click(); requestAnimationFrame(redrawWaveforms); }
function focusClone() { showScreen('clone'); }
function setEditorMode(mode) { editorMode = mode; ['cursor', 'select', 'cut'].forEach(name => $(`#${name}-tool`)?.classList.toggle('active-tool', name === mode)); waveformCanvas.style.cursor = mode === 'cursor' ? 'default' : 'crosshair'; }
function ratioAt(canvas, event) { const rect = canvas.getBoundingClientRect(); return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); }

$('#new-project').addEventListener('click', async () => { await window.voiceStudio.newProject(); currentProject = projectTemplate(); $('#project-name-input').value = ''; currentAudioPath = null; audioPlayer.removeAttribute('src'); audioPlayer.classList.remove('ready'); $('#reveal-output').disabled = true; updateProjectLabel(); generationState.textContent = 'Proyecto nuevo'; resetEditor(); showScreen('generation'); setStatus('Proyecto nuevo preparado. Escribe un nombre y pulsa Guardar.'); });
$('#project-modal-confirm').addEventListener('click', () => { const withName = !$('#project-modal-name-label').hidden; const name = withName ? $('#project-modal-name').value.trim() : ''; if (withName && !name) { $('.project-modal').classList.add('invalid'); $('#project-modal-message').textContent = 'Si no hay nombre no se guarda'; $('#project-modal-name').focus(); return; } closeProjectModal({ confirmed: true, name }); });
$('#project-modal-cancel').addEventListener('click', () => closeProjectModal({ confirmed: false }));
$('#project-modal-name').addEventListener('keydown', event => { if (event.key === 'Enter') $('#project-modal-confirm').click(); if (event.key === 'Escape') $('#project-modal-cancel').click(); });
async function requestProjectName() { const result = await openProjectModal({ title: 'Guardar proyecto', message: 'Si no hay nombre no se guarda', showName: true, confirmText: 'Guardar', defaultName: $('#project-name-input').value.trim() }); return result?.confirmed ? String(result.name || '').trim() : ''; }
$('#save-project').addEventListener('click', async () => { let projectName = ''; try { if (!window.voiceStudio?.saveProject) return setStatus('El guardado requiere iniciar LQTAC Voice Studio desde el EXE portable.'); if (!currentProject) currentProject = projectTemplate(); projectName = $('#project-name-input').value.trim(); if (!currentProjectFilePath && !projectName) { projectName = await requestProjectName(); if (!projectName) return; $('#project-name-input').value = projectName; } if (projectName) currentProject.project_name = projectName; let result = await window.voiceStudio.saveProject(currentProject); if (result.conflict) { const overwrite = await openProjectModal({ title: 'Proyecto ya existente', message: `No es por nada pero el proyecto ${projectName} ya lo estas usando.\n¿Estas seguro que lo quieres sobreescribir?`, boldWord: 'sobreescribir', showCancel: true, confirmText: 'Sobreescribir', cancelText: 'Cancelar' }); if (!overwrite?.confirmed) { setStatus('Guardado cancelado.'); return; } result = await window.voiceStudio.saveProject({ ...currentProject, __overwrite: true }); } if (result.canceled) return; currentProject = result.data; projectName = currentProject.project_name || projectName; $('#project-name-input').value = projectName; updateProjectLabel(result.filePath); await refreshProjects(); setStatus(`Proyecto guardado localmente: ${result.filePath}`); await openProjectModal({ title: 'Guardado correcto', message: `Proyecto ${projectName} Guardado correctamente`, confirmText: 'Aceptar', kind: 'success' }); } catch (error) { const detail = error?.message || String(error); setStatus(`No se pudo guardar el proyecto: ${detail}`); await openProjectModal({ title: 'Error al guardar', message: `El proyecto ${projectName || 'sin nombre'} ha generado el error ${detail} al guardar.`, confirmText: 'Aceptar', kind: 'error' }); } });
$('#open-project').addEventListener('click', () => showScreen('projects'));
$('#reveal-output').addEventListener('click', () => { if (currentAudioPath) window.voiceStudio.revealOutput(currentAudioPath).catch(error => setStatus(error.message)); });
$('#check-runtime').addEventListener('click', refreshRuntime);
$('#settings-check-runtime').addEventListener('click', refreshRuntime);
$('#settings-open-generation').addEventListener('click', () => showScreen('generation'));
$('#active-audio-generation').addEventListener('click', () => showScreen('generation'));
$('#projects-refresh').addEventListener('click', refreshProjects);
$('#stt-refresh').addEventListener('click', refreshSttStatus);
$('#stt-engine').addEventListener('change', refreshSttStatus);
$('#stt-select-audio').addEventListener('click', async () => { const result = await window.voiceStudio.selectAudioFile({ title: 'Seleccionar audio para transcribir' }); if (!result.canceled) { sttAudioFile = result.filePath; $('#stt-audio-file').textContent = sttAudioFile; } });
$('#stt-select-runtime').addEventListener('click', async () => { const result = await window.voiceStudio.selectSttRuntime({ title: 'Seleccionar whisper-cli.exe' }); if (!result.canceled) $('#stt-runtime').value = result.filePath; });
$('#stt-select-model').addEventListener('click', async () => { if ($('#stt-engine').value !== 'whispercpp') return setStatus('Para faster-whisper escribe el nombre o ruta de una carpeta de modelo local.'); const result = await window.voiceStudio.selectSttModel({ title: 'Seleccionar modelo Whisper.cpp' }); if (!result.canceled) $('#stt-model').value = result.filePath; });
$('#stt-run').addEventListener('click', async () => { const input = sttAudioFile || currentAudioPath; const engine = $('#stt-engine').value; if (!input) return setStatus('Selecciona un audio o genera uno antes de transcribir.'); if (engine === 'fasterwhisper' && $('#stt-translate').checked) { $('#stt-status').textContent = 'La traducción todavía no está disponible con faster-whisper local.'; return; } const button = $('#stt-run'); button.disabled = true; $('#stt-status').textContent = 'Transcribiendo audio localmente…'; try { const result = await window.voiceStudio.transcribe({ input_path: input, engine, language: $('#stt-language').value, translate: $('#stt-translate').checked, executable: $('#stt-runtime').value.trim(), model: $('#stt-model').value.trim() }); window.sttSegments = result.segments || []; $('#stt-output').value = $('#stt-show-times').checked ? window.sttSegments.map(s => '[' + s.time + '] ' + s.text).join('\n') : result.text || ''; $('#stt-status').textContent = `Transcripción completada con ${result.engine === 'whispercpp' ? 'Whisper.cpp' : 'faster-whisper'}.`; setStatus('Transcripción STT completada.'); } catch (error) { $('#stt-status').textContent = `Error STT: ${error.message}`; setStatus(`No se pudo transcribir: ${error.message}`); } finally { button.disabled = false; } });
$('#engine').addEventListener('change', event => { if (event.target.value === 'Clonador de voz') focusClone(); });
$('#engine').addEventListener('change', renderEngineFields);
$('#load-voices').addEventListener('click', async () => { setStatus('Cargando voces de Edge TTS…'); try { const voices = await window.voiceStudio.listVoices(); const select = $('#engine-voice'); const locale = ($('#engine-locale')?.value || '').trim().toLowerCase(); const filtered = voices.filter(voice => !locale || voice.locale?.toLowerCase().startsWith(locale)); select.replaceChildren(...filtered.map(voice => { const option = document.createElement('option'); option.value = voice.short_name; option.textContent = `${voice.short_name} · ${voice.gender || ''}`; return option; })); setStatus(`Voces Edge cargadas: ${select.options.length}.`); } catch (error) { setStatus(error.message); } });

$('#prepare-generation').addEventListener('click', async () => { const button = $('#prepare-generation'); const engine = $('#engine').value; const definition = engineDefinitions[engine]; button.disabled = true; generationState.textContent = 'Generando…'; setStatus(`Generando audio con ${definition.label}…`); try { const result = await window.voiceStudio.generateVoice({ engine, text: $('#voice-text').value, voice: $('#engine-voice')?.value, language: $('#engine-language')?.value, model: $('#engine-model')?.value, instruct: $('#engine-instruct')?.value, speed: $('#engine-speed')?.value, key: $('#engine-key')?.value, region: $('#engine-region')?.value, accent: $('#engine-accent')?.value, temperature: $('#engine-temperature')?.value, length_scale: $('#engine-length')?.value, rate: signed($('#motor-rate').value, '%'), pitch: signed($('#motor-pitch').value, 'Hz'), volume: signed($('#motor-volume').value, '%'), name: `${engine}_render` }); cutSegments = []; selectionStart = null; selectionEnd = null; await loadAudioInEditor(result.path, result.url, `${Math.round(result.bytes / 1024)} KB generado`); registerGeneratedTake(result); setStatus(`Audio generado con ${definition.label}.`); } catch (error) { generationState.textContent = 'Error de generación'; setStatus(error.message); } finally { button.disabled = false; } });
$('#clear-text').addEventListener('click', () => { $('#voice-text').value = ''; generationState.textContent = 'Texto limpiado'; setStatus('Texto limpiado.'); });
[['motor-rate', 'motor-rate-value', '%'], ['motor-pitch', 'motor-pitch-value', 'Hz'], ['motor-volume', 'motor-volume-value', '%'], ['edit-volume', 'edit-volume-value', '%'], ['fx-intensity', 'fx-intensity-value', '%'], ['fx-echo-delay', 'fx-echo-delay-value', 'ms'], ['fx-bits', 'fx-bits-value', ' bits'], ['fx-metal', 'fx-metal-value', 'dB']].forEach(([input, output, suffix]) => { $(`#${input}`)?.addEventListener('input', event => { if (input.startsWith('motor-')) $(`#${output}`).value = event.target.value; else setRangeOutput(output, event.target.value, suffix); rebuildLiveFx(); }); });
[['motor-rate','motor-rate-value'],['motor-pitch','motor-pitch-value'],['motor-volume','motor-volume-value']].forEach(([range, number]) => { $(`#${number}`).addEventListener('input', event => { const control = $(`#${range}`); const value = Math.max(Number(control.min), Math.min(Number(control.max), Number(event.target.value) || 0)); control.value = value; event.target.value = value; }); });
EQ_BANDS.forEach(band => $(`#${band.id}`)?.addEventListener('input', () => { updateEqOutputs(); rebuildLiveFx(); }));
[['clone-rate', 'clone-rate-value', '%'], ['clone-pitch', 'clone-pitch-value', 'Hz'], ['clone-volume', 'clone-volume-value', '%']].forEach(([input, output, suffix]) => { $(`#${input}`)?.addEventListener('input', event => setRangeOutput(output, event.target.value, suffix)); });

$('#clear-selection').addEventListener('click', () => { selectionStart = null; selectionEnd = null; redrawWaveforms(); });
$('#add-cut').addEventListener('click', () => { if (selectionStart === null || selectionEnd === null || Math.abs(selectionEnd - selectionStart) < .02) return setStatus('Selecciona un tramo de la onda antes de añadir un recorte.'); cutSegments.push([Math.min(selectionStart, selectionEnd), Math.max(selectionStart, selectionEnd)]); cutSegments.sort((a, b) => a[0] - b[0]); selectionStart = null; selectionEnd = null; redrawWaveforms(); setStatus('Recorte marcado en rojo.'); });
$('#undo-cut').addEventListener('click', () => { cutSegments.pop(); redrawWaveforms(); setStatus('Último recorte deshecho.'); });
$('#clear-cuts').addEventListener('click', () => { cutSegments = []; redrawWaveforms(); setStatus('Recortes limpiados.'); });
['cursor', 'select', 'cut'].forEach(mode => $(`#${mode}-tool`).addEventListener('click', () => setEditorMode(mode)));
function splitAtCursor() { if (!waveformDuration) return setStatus('Genera o abre un audio antes de dividirlo.'); const point = selectionStart !== null && selectionEnd !== null ? Math.max(selectionStart, selectionEnd) : cursorSeconds; if (point <= .02 || point >= waveformDuration - .02) return setStatus('Coloca el cursor dentro de la onda para dividir.'); if (!splitPoints.some(value => Math.abs(value - point) < .02)) splitPoints.push(point); splitPoints.sort((a, b) => a - b); cursorSeconds = point; redrawWaveforms(); setStatus(`División marcada en ${formatTime(point)}. Puedes añadir más con S.`); }
$('#split-audio').addEventListener('click', async () => { if (!currentAudioPath || !splitPoints.length) return splitAtCursor(); const button = $('#split-audio'); button.disabled = true; try { setStatus('Generando partes del audio…'); const result = await window.voiceStudio.splitAudio({ input_path: currentAudioPath, duration: waveformDuration, split_points: splitPoints, name: 'audio_dividido' }); let firstTake = null; result.files.forEach((file, index) => { const take = addAudioTake(file, { name: `Parte ${index + 1} de audio`, cuts: [] }); if (!firstTake) firstTake = take; }); if (firstTake) { currentProject.active_take_id = firstTake.id; await loadAudioInEditor(result.files[0].path, result.files[0].url, `${result.files.length} partes generadas`); } setStatus(`Audio dividido en ${result.files.length} tomas. Pulsa Guardar para conservarlas.`); } catch (error) { setStatus(error.message); } finally { button.disabled = false; } });
$('#play-selection').addEventListener('click', () => { if (!currentAudioPath) return setStatus('No hay audio cargado.'); const start = selectionStart === null ? 0 : Math.min(selectionStart, selectionEnd); const end = selectionEnd === null ? waveformDuration : Math.max(selectionStart, selectionEnd); audioPlayer.currentTime = start; audioPlayer.dataset.selectionEnd = end; audioPlayer.play(); });
audioPlayer.addEventListener('play', () => { activateLiveFx().catch(error => setStatus(`Audio en tiempo real no disponible: ${error.message}`)); });
audioPlayer.addEventListener('timeupdate', () => { cursorSeconds = audioPlayer.currentTime || 0; if (audioPlayer.dataset.selectionEnd && cursorSeconds >= Number(audioPlayer.dataset.selectionEnd)) { audioPlayer.pause(); delete audioPlayer.dataset.selectionEnd; } redrawWaveforms(); });
$('#apply-edit').addEventListener('click', async () => { if (!currentAudioPath) return setStatus('Genera o abre un audio antes de editarlo.'); const button = $('#apply-edit'); button.disabled = true; setStatus('Aplicando volumen, recortes y efectos configurados con FFmpeg…'); try { const result = await window.voiceStudio.renderAudio({ input_path: currentAudioPath, duration: waveformDuration, cuts: cutSegments, volume: Number($('#edit-volume').value), effect: $('#effect-preset').value, fx: currentFxConfig(), name: 'audio_edit' }); await loadAudioInEditor(result.path, result.url, `${Math.round(result.bytes / 1024)} KB editado`); registerEditedTake(result); cutSegments = []; selectionStart = null; selectionEnd = null; setStatus('Edición aplicada y registrada como nueva toma.'); } catch (error) { setStatus(error.message); } finally { button.disabled = false; } });

function wireWaveCanvas(canvas, compact = false) {
  canvas.addEventListener('pointerdown', event => { if (!waveformDuration) return; canvas.setPointerCapture(event.pointerId); dragStart = ratioAt(canvas, event) * waveformDuration; if (compact || editorMode === 'cursor') { cursorSeconds = dragStart; audioPlayer.currentTime = cursorSeconds; redrawWaveforms(); return; } selectionStart = dragStart; selectionEnd = dragStart; redrawWaveforms(); });
  canvas.addEventListener('pointermove', event => { if (compact || dragStart === null || editorMode === 'cursor') return; selectionEnd = ratioAt(canvas, event) * waveformDuration; redrawWaveforms(); });
  canvas.addEventListener('pointerup', event => { if (compact) { dragStart = null; return; } if (dragStart === null) return; if (editorMode !== 'cursor') { selectionEnd = ratioAt(canvas, event) * waveformDuration; if (editorMode === 'cut' && selectionStart !== null && selectionEnd !== null && Math.abs(selectionEnd - selectionStart) >= .02) { cutSegments.push([Math.min(selectionStart, selectionEnd), Math.max(selectionStart, selectionEnd)]); cutSegments.sort((a, b) => a[0] - b[0]); selectionStart = null; selectionEnd = null; setStatus('Recorte marcado directamente desde la onda.'); } } dragStart = null; redrawWaveforms(); });
}
wireWaveCanvas(waveformCanvas); wireWaveCanvas(previewCanvas, true);
document.addEventListener('keydown', event => { if (event.key.toLowerCase() === 's' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { event.preventDefault(); splitAtCursor(); } });

$$('.editor-tab').forEach(tab => tab.addEventListener('click', () => { $$('.editor-tab').forEach(item => item.classList.toggle('active', item === tab)); $$('.editor-tab-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.editorPanel === tab.dataset.editorTab)); }));
$('#effect-preset').addEventListener('change', event => { const preset = event.target.value; [['radio', 'fx-radio-enabled'], ['echo', 'fx-echo-enabled'], ['robot', 'fx-robot-enabled'], ['bitcrusher', 'fx-crusher-enabled']].forEach(([name, id]) => { if (preset === name) $(`#${id}`).checked = true; }); $('#fx-summary').textContent = preset === 'custom' ? 'Cadena manual: combina módulos y ajusta cada control.' : `Preset seleccionado: ${event.target.options[event.target.selectedIndex].text}. Puedes afinarlo con los controles.`; rebuildLiveFx(); });
$$('#fx-radio-enabled, #fx-echo-enabled, #fx-robot-enabled, #fx-crusher-enabled, #fx-eq-enabled').forEach(input => input.addEventListener('change', rebuildLiveFx));
$('#live-fx-enabled').addEventListener('change', rebuildLiveFx);

function renderFilesList(node, files) { node.textContent = files.length ? files.map((file, index) => `${index + 1}. ${file.split(/[\\/]/).pop()}`).join('\n') : 'No hay archivos seleccionados.'; }
$('#fusion-add').addEventListener('click', async () => { const result = await window.voiceStudio.selectAudioFiles({ title: 'Seleccionar audios para fusionar' }); if (!result.canceled) { fusionFiles = result.filePaths; renderFilesList($('#fusion-files'), fusionFiles); } });
$('#fusion-run').addEventListener('click', async () => { const files = fusionFiles.length ? fusionFiles : (currentAudioPath ? [currentAudioPath] : []); if (files.length < 2) return setStatus('Selecciona al menos dos audios para fusionar.'); try { const result = await window.voiceStudio.mergeAudio({ input_paths: files, mode: $('#fusion-mode').value, name: $('#fusion-name').value }); await loadAudioInEditor(result.path, result.url, 'Audio fusionado'); addAudioTake(result, { name: 'Fusión de audios' }); setStatus('Fusión creada como nueva toma.'); } catch (error) { setStatus(error.message); } });
$('#conversion-select').addEventListener('click', async () => { const result = await window.voiceStudio.selectAudioFile({ title: 'Seleccionar audio para convertir' }); if (!result.canceled) { conversionFile = result.filePath; $('#conversion-file').textContent = conversionFile; } });
$('#conversion-run').addEventListener('click', async () => { const input = conversionFile || currentAudioPath; if (!input) return setStatus('Selecciona o genera un audio para convertirlo.'); try { const result = await window.voiceStudio.convertAudio({ input_path: input, profile: $('#conversion-format').value, name: $('#conversion-name').value }); if (result.canceled) return setStatus('Conversión cancelada.'); await loadAudioInEditor(result.path, result.url, 'Audio convertido'); addAudioTake(result, { name: 'Conversión de audio' }); setStatus('Conversión creada como nueva toma.'); } catch (error) { setStatus(error.message); } });
$('#idtag-select').addEventListener('click', async () => { const result = await window.voiceStudio.selectAudioFile({ title: 'Seleccionar audio para IDTAG' }); if (!result.canceled) { idtagFile = result.filePath; $('#idtag-file').textContent = idtagFile; } });
$('#idtag-cover-select').addEventListener('click', async () => { const result = await window.voiceStudio.selectImageFile({ title: 'Seleccionar carátula IDTAG' }); if (!result.canceled) { idtagCoverFile = result.filePath; $('#idtag-cover-file').textContent = idtagCoverFile; $('#idtag-cover-image').src = result.url; $('#idtag-cover-preview').classList.add('has-image'); } });
$('#idtag-run').addEventListener('click', async () => { const input = idtagFile || currentAudioPath; if (!input) return setStatus('Selecciona o genera un audio para editar sus IDTAG.'); const tags = { title: $('#tag-title').value, artist: $('#tag-artist').value, album: $('#tag-album').value, album_artist: $('#tag-album-artist').value, genre: $('#tag-genre').value, date: $('#tag-date').value, track: $('#tag-track').value, comment: $('#tag-comment').value }; try { const result = await window.voiceStudio.writeIdTags({ input_path: input, cover_path: idtagCoverFile, tags, name: 'audio_idtag' }); await loadAudioInEditor(result.path, result.url, 'IDTAG guardados'); addAudioTake(result, { name: 'Audio con IDTAG' }); setStatus(idtagCoverFile ? 'Metadatos y carátula guardados como nueva toma.' : 'Metadatos IDTAG guardados como nueva toma.'); } catch (error) { setStatus(error.message); } });

async function refreshCloneProfiles(selectName = '') {
  try {
    cloneProfiles = await window.voiceStudio.listCloneProfiles();
    const select = $('#clone-profile');
    select.replaceChildren(...cloneProfiles.map(profile => { const option = document.createElement('option'); option.value = profile.name; option.textContent = `${profile.name} · ${profile.language}`; return option; }));
    if (!cloneProfiles.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'Sin perfiles guardados'; select.append(option); return; }
    select.value = selectName || select.value || cloneProfiles[0].name;
    const profile = cloneProfiles.find(item => item.name === select.value) || cloneProfiles[0];
    select.value = profile.name; $('#clone-profile-name').value = profile.name; $('#clone-language').value = profile.language || 'es'; cloneSampleFile = profile.sample; $('#clone-sample-file').textContent = profile.sample || 'Sin muestra seleccionada.'; $('#clone-reference-text').value = profile.reference_text || '';
  } catch (error) { $('#clone-status').textContent = `No se pudieron cargar los perfiles: ${error.message}`; }
}
$('#clone-profile').addEventListener('change', () => { const profile = cloneProfiles.find(item => item.name === $('#clone-profile').value); if (!profile) return; $('#clone-profile-name').value = profile.name; $('#clone-language').value = profile.language || 'es'; cloneSampleFile = profile.sample; $('#clone-sample-file').textContent = profile.sample || 'Sin muestra seleccionada.'; $('#clone-reference-text').value = profile.reference_text || ''; });
$('#clone-select-sample').addEventListener('click', async () => { const result = await window.voiceStudio.selectAudioFile({ title: 'Seleccionar WAV de referencia para clonar' }); if (!result.canceled) { cloneSampleFile = result.filePath; $('#clone-sample-file').textContent = cloneSampleFile; } });
$('#clone-save-profile').addEventListener('click', async () => { if (!$('#clone-profile-name').value.trim() || !cloneSampleFile || !$('#clone-reference-text').value.trim()) return setStatus('Completa nombre, WAV y transcripción exacta para guardar el perfil.'); try { $('#clone-status').textContent = 'Guardando perfil local…'; const result = await window.voiceStudio.saveCloneProfile({ name: $('#clone-profile-name').value, sample_path: cloneSampleFile, language: $('#clone-language').value, reference_text: $('#clone-reference-text').value }); await refreshCloneProfiles(result.name); setStatus(`Perfil de clonación guardado: ${result.name}`); } catch (error) { $('#clone-status').textContent = error.message; setStatus(error.message); } });
$('#clone-refresh').addEventListener('click', () => refreshCloneProfiles());
$('#clone-generate').addEventListener('click', async () => { const profile = $('#clone-profile').value; if (!profile) return setStatus('Selecciona un perfil de voz clonada.'); const button = $('#clone-generate'); button.disabled = true; $('#clone-status').textContent = 'Cargando modelo local y generando…'; setStatus('Generando con el clonador local; la primera vez puede tardar.'); try { const result = await window.voiceStudio.generateClone({ profile, engine: $('#clone-engine').value, text: $('#clone-text').value, rate: signed($('#clone-rate').value, '%'), pitch: signed($('#clone-pitch').value, 'Hz'), volume: signed($('#clone-volume').value, '%'), name: 'clone_render' }); await loadAudioInEditor(result.path, result.url, `${Math.round(result.bytes / 1024)} KB · voz clonada`); addAudioTake(result, { name: `Clon · ${profile}`, tts: { mode: 'Voz clonada', profile, engine: result.engine, text: $('#clone-text').value, rate: signed($('#clone-rate').value, '%'), pitch: signed($('#clone-pitch').value, 'Hz'), volume: signed($('#clone-volume').value, '%') } }); currentProject.creation = { system: 'Voz clonada', voice: profile }; $('#clone-status').textContent = `Audio generado con ${result.engine === 'openvoice' ? 'OpenVoice V2' : 'Qwen3 Base'}.`; setStatus('Voz clonada generada y cargada en el editor.'); } catch (error) { $('#clone-status').textContent = error.message; setStatus(error.message); } finally { button.disabled = false; } });

$('#preview-edit').addEventListener('click', () => focusEditor('effects')); $('#preview-cut').addEventListener('click', () => { setEditorMode('select'); focusEditor('effects'); setStatus('Modo selección activo: arrastra sobre la onda y pulsa Añadir recorte.'); }); $('#preview-fusion').addEventListener('click', () => focusEditor('fusion')); $('#preview-conversion').addEventListener('click', () => focusEditor('conversion')); $('#preview-idtag').addEventListener('click', () => focusEditor('idtag'));
function selectExportProfile() {
  return new Promise(resolve => {
    const modal = document.createElement('dialog'); modal.className = 'about-dialog';
    const title = document.createElement('h3'); title.textContent = 'Exportar audio';
    const label = document.createElement('label'); label.textContent = 'Formato de salida';
    const select = $('#conversion-format').cloneNode(true); select.removeAttribute('id'); label.append(select);
    const actions = document.createElement('div'); actions.className = 'transcript-toolbar';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancelar'; cancel.className = 'secondary-button';
    const confirm = document.createElement('button'); confirm.textContent = 'Elegir destino y exportar'; confirm.className = 'primary-button';
    function finish(value) { modal.close(); modal.remove(); resolve(value); }
    cancel.onclick = () => finish(null); confirm.onclick = () => finish(select.value);
    modal.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    actions.append(cancel, confirm); modal.append(title,label,actions); document.body.append(modal); modal.showModal();
  });
}
$('#export-audio-top').addEventListener('click', async () => {
  if (!currentAudioPath) return setStatus('Genera o abre un audio antes de exportar.');
  const button = $('#export-audio-top'); button.disabled = true;
  try {
    const profile = await selectExportProfile();
    if (!profile) return setStatus('Exportación cancelada.');
    setStatus('Elige nombre, formato y destino para renderizar el audio.');
    const result = await window.voiceStudio.exportAudio({input_path:currentAudioPath, profile, duration:waveformDuration, cuts:cutSegments, volume:Number($('#edit-volume').value), effect:$('#effect-preset').value, fx:currentFxConfig()});
    setStatus(result.canceled ? 'Exportación cancelada.' : 'Audio renderizado y guardado: ' + result.path);
  } catch(error) { setStatus('Error al exportar audio: ' + error.message); }
  finally { button.disabled = false; }
});
$$('.nav-item').forEach(item => item.addEventListener('click', () => { const screen = item.dataset.screen || 'generation'; if (screen === 'editor') focusEditor('effects'); else if (screen === 'clone') focusClone(); else showScreen(screen); }));
const resizer = $('#dashboard-resizer'); let resizing = false; resizer.addEventListener('pointerdown', event => { resizing = true; resizer.classList.add('dragging'); resizer.setPointerCapture(event.pointerId); }); resizer.addEventListener('pointermove', event => { if (!resizing) return; const grid = $('.dashboard-grid'); const rect = grid.getBoundingClientRect(); const left = Math.max(420, Math.min(rect.width - 380, event.clientX - rect.left)); grid.style.gridTemplateColumns = `${left}px 8px minmax(300px, 1fr)`; redrawWaveforms(); }); resizer.addEventListener('pointerup', () => { resizing = false; resizer.classList.remove('dragging'); });
window.addEventListener('resize', redrawWaveforms);
renderEngineFields(); setRangeOutput('edit-volume-value', 0, '%'); setRangeOutput('clone-rate-value', 0, '%'); setRangeOutput('clone-pitch-value', 0, 'Hz'); setRangeOutput('clone-volume-value', 0, '%'); updateEqOutputs(); updateProjectLabel(); showScreen('generation'); refreshRuntime(); refreshCloneProfiles();
