const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { pathToFileURL } = require('node:url');

const DEV_SOURCE_ROOT = path.resolve(__dirname, '..', 'LQTAC_VS');
const PACKAGED_SOURCE_ROOT = path.join(process.resourcesPath || __dirname, 'LQTAC_VS');
const EXECUTABLE_ROOT = path.dirname(process.execPath);
const sourceCandidates = [
  process.env.LQTAC_VOICE_SOURCE_ROOT,
  PACKAGED_SOURCE_ROOT,
  DEV_SOURCE_ROOT,
  path.join(EXECUTABLE_ROOT, 'resources', 'LQTAC_VS'),
  path.join(EXECUTABLE_ROOT, 'LQTAC_VS')
].filter(Boolean);
const SOURCE_ROOT = sourceCandidates.find(candidate => fs.existsSync(candidate)) || PACKAGED_SOURCE_ROOT;
const BRIDGE_SCRIPT = path.join(__dirname, 'backend', 'voice_bridge.py');
const PROJECTS_ROOT = process.env.LQTAC_VOICE_PROJECTS_ROOT || (app.isPackaged
  ? path.join(path.dirname(process.execPath), 'data', 'projects')
  : path.join(__dirname, 'data', 'projects'));

app.setName('Voice Studio by LQTAC Electron');
if (process.platform === 'win32') app.setAppUserModelId('LQTAC.VoiceStudio.Electron');

let mainWindow;
let currentProjectPath = null;
ipcMain.handle('project:export', async (_event, payload) => {
  const data = structuredClone(payload);
  if (data.project_format !== 'tacvs') throw new Error('Formato de proyecto no válido.');
  const selected = await dialog.showOpenDialog(mainWindow, { title: 'Carpeta de destino del proyecto', properties: ['openDirectory', 'createDirectory'] });
  if (selected.canceled) return { canceled: true };
  const name = path.basename(projectFileName(data.project_name), '.tacvs');
  let root = path.join(selected.filePaths[0], name);
  for (let i = 2; fs.existsSync(root); i++) root = path.join(selected.filePaths[0], `${name}_${i}`);
  fs.mkdirSync(root, { recursive: true });
  for (const [i, take] of (data.takes || []).entries()) {
    const source = take._source_path || (take.clean_audio && currentProjectPath ? path.resolve(path.dirname(currentProjectPath), take.clean_audio) : null);
    if (!source || !fs.existsSync(source)) throw new Error(`No se encuentra el audio de la toma ${i + 1}.`);
    const relative = path.join('assets', `take_${i + 1}${path.extname(source)}`);
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.copyFileSync(source, path.join(root, relative));
    take.clean_audio = relative.replaceAll(path.sep, '/'); delete take._source_path;
  }
  const filePath = path.join(root, `${name}.tacvs`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return { filePath };
});
ipcMain.handle('audio:batch', async (_event, options) => {
  const selected = options.inputs ? {canceled:false, filePaths:options.inputs} : await dialog.showOpenDialog(mainWindow, { title: options.folder ? 'Seleccionar carpeta de audio' : 'Seleccionar audios', properties: options.folder ? ['openDirectory'] : ['openFile', 'multiSelections'], filters: [{ name: 'Audio', extensions: ['mp3','wav','flac','ogg','m4a','aac','wma'] }] });
  if (selected.canceled) return { canceled: true };
  const inputs = [];
  function scan(root) { for (const entry of fs.readdirSync(root, { withFileTypes: true })) { const file = path.join(root, entry.name); if (entry.isDirectory()) scan(file); else if (entry.isFile() && /\.(mp3|wav|flac|ogg|m4a|aac|wma)$/i.test(entry.name)) inputs.push(file); } }
  if (options.folder && !options.inputs) scan(selected.filePaths[0]); else inputs.push(...selected.filePaths);
  if (!inputs.length) throw new Error('No se encontraron archivos de audio.');
  if (options.selectOnly) return {inputs, folder:options.folder ? selected.filePaths[0] : null};
  const destination = await dialog.showOpenDialog(mainWindow, { title: 'Carpeta de salida de los audios convertidos', properties: ['openDirectory','createDirectory'] });
  if (destination.canceled) return { canceled: true };
  const errors = []; let count = 0;
  for (const input of inputs) {
    const index = inputs.indexOf(input);
    _event.sender.send('audio:batchProgress', {index, total:inputs.length, input, state:'converting', directory:destination.filePaths[0]});
    try {
      const result = await bridge.request('audio:convert', { input_path: input, profile: options.profile, name: path.parse(input).name + '_convertido' });
      const stem = path.parse(input).name; const ext = path.extname(result.path);
      let target = path.join(destination.filePaths[0], stem + ext);
      for (let n = 2; fs.existsSync(target); n++) target = path.join(destination.filePaths[0], `${stem}_${n}${ext}`);
      for (const file of result.files || [result]) { let out = path.join(destination.filePaths[0], path.parse(target).name + path.extname(file.path)); for(let n=2;fs.existsSync(out);n++) out=path.join(destination.filePaths[0],path.parse(target).name+'_'+n+path.extname(file.path)); fs.copyFileSync(file.path,out,fs.constants.COPYFILE_EXCL); } count++;
      _event.sender.send('audio:batchProgress', {index, total:inputs.length, input, state:'done'});
    } catch (error) { errors.push(`${path.basename(input)}: ${error.message}`); _event.sender.send('audio:batchProgress', {index, total:inputs.length, input, state:'error', error:error.message}); }
  }
  return { count, total: inputs.length, errors, directory: destination.filePaths[0] };
});
ipcMain.handle('help:manual', async () => {
  const manual = path.join(__dirname, 'assets', 'manual-local.pdf');
  const error = await shell.openPath(manual);
  if (error) throw new Error(error);
});
ipcMain.handle('app:openExternal', async (_event, requestedUrl) => {
  const allowed = new Set([
    'https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices',
    'https://learn.microsoft.com/azure/ai-services/speech-service/overview'
  ]);
  if (!allowed.has(requestedUrl)) throw new Error('Enlace externo no permitido.');
  await shell.openExternal(requestedUrl);
  return true;
});
ipcMain.handle('azure:environment', () => ({
  key: process.env.SPEECH_KEY || process.env.AZURE_SPEECH_KEY || '',
  region: process.env.SPEECH_REGION || process.env.AZURE_SPEECH_REGION || '',
  voice: process.env.AZURE_SPEECH_VOICE || 'es-ES-ElviraNeural'
}));
ipcMain.handle('stt:export', async (_event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Guardar transcripción', defaultPath: 'Transcripción.docx', filters: [{ name: 'Documento Word (.docx)', extensions: ['docx'] }, { name: 'Texto sin formato (.txt)', extensions: ['txt'] }] });
  if (result.canceled) return { canceled: true };
  const format = path.extname(result.filePath).toLowerCase() === '.txt' ? 'txt' : 'docx';
  return bridge.request('stt:export', { ...data, output_path: result.filePath, format });
});

class PythonBridge {
  constructor() {
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
  }

  pythonExecutable() {
    const candidates = [
      path.join(SOURCE_ROOT, 'runtime', '.venv', 'Scripts', 'python.exe'),
      path.join(SOURCE_ROOT, 'tools', 'python', 'Python311', 'python.exe'),
      path.join(SOURCE_ROOT, 'tools', 'python', 'Python312', 'python.exe')
    ];
    const executable = candidates.find(candidate => fs.existsSync(candidate));
    if (!executable) {
      throw new Error(`No se encuentra el runtime Python portable. Carpeta buscada: ${SOURCE_ROOT}`);
    }
    return executable;
  }

  start() {
    if (this.child) return;
    const outputRoot = process.env.LQTAC_VOICE_OUTPUT_ROOT || (app.isPackaged
      ? path.join(path.dirname(process.execPath), 'data', 'outputs')
      : path.join(__dirname, 'data', 'outputs'));
    const sttRoot = process.env.LQTAC_STT_ROOT || (app.isPackaged
      ? path.join(path.dirname(process.execPath), 'data', 'stt')
      : path.join(__dirname, 'data', 'stt'));
    try { fs.mkdirSync(outputRoot, { recursive: true }); } catch (error) { console.warn('No se pudo crear la carpeta de salida portable:', error.message); }
    try { fs.mkdirSync(sttRoot, { recursive: true }); } catch (error) { console.warn('No se pudo crear la carpeta STT portable:', error.message); }
    const pythonExecutable = this.pythonExecutable();
    this.child = spawn(pythonExecutable, ['-u', BRIDGE_SCRIPT], {
      cwd: SOURCE_ROOT,
      env: {
        ...process.env,
        LQTAC_SOURCE_ROOT: SOURCE_ROOT,
        LQTAC_VOICE_OUTPUT_ROOT: outputRoot,
        LQTAC_STT_ROOT: sttRoot,
        PYTHONUTF8: '1'
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.consume(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', chunk => console.warn('[python-bridge]', chunk.trim()));
    this.child.on('error', error => this.failPending(error));
    this.child.on('close', code => {
      this.failPending(new Error(`El puente Python terminó con código ${code ?? 'desconocido'}.`));
      this.child = null;
    });
  }

  consume(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        if (message.ok === false) pending.reject(new Error(message.error || 'Error del puente Python.'));
        else pending.resolve(message.result);
      } catch (error) {
        console.warn('[python-bridge] Respuesta no válida:', error.message);
      }
    }
  }

  request(op, payload = {}) {
    this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ id, op, ...payload })}\n`);
    });
  }

  failPending(error) {
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }

  stop() {
    if (!this.child) return;
    this.child.stdin.end();
    this.child.kill();
    this.child = null;
  }
}

const bridge = new PythonBridge();

ipcMain.handle('voice:status', () => bridge.request('status'));
ipcMain.handle('stt:status', () => bridge.request('stt:status'));
ipcMain.handle('stt:transcribe', (_event, payload) => bridge.request('stt:transcribe', payload));
ipcMain.handle('voice:ping', () => bridge.request('ping'));
ipcMain.handle('voice:listVoices', () => bridge.request('edge:list_voices'));
ipcMain.handle('voice:generate', async (_event, payload) => {
  const result = await bridge.request('voice:generate', payload);
  return { ...result, url: pathToFileURL(result.path).href };
});
ipcMain.handle('voice:generateEdge', async (_event, payload) => {
  const result = await bridge.request('edge:generate', payload);
  return { ...result, url: pathToFileURL(result.path).href };
});
ipcMain.handle('clone:listProfiles', () => bridge.request('clone:list_profiles'));
ipcMain.handle('clone:saveProfile', (_event, payload) => bridge.request('clone:save_profile', payload));
ipcMain.handle('clone:generate', async (_event, payload) => {
  const result = await bridge.request('clone:generate', payload);
  return { ...result, url: pathToFileURL(result.path).href };
});
ipcMain.handle('audio:analyze', (_event, payload) => bridge.request('audio:analyze', payload));
ipcMain.handle('audio:render', async (_event, payload) => {
  const result = await bridge.request('audio:render', payload);
  return { ...result, url: pathToFileURL(result.path).href };
});
ipcMain.handle('audio:export', async (_event, payload) => {
  const extensions = {mp3:'mp3', wav:'wav', mp3_original:'mp3', mp3_48k:'mp3', wav_24k:'wav', sln_8k:'sln', sln16:'sln16', universal_pack:'mp3', asterisk_pack:'wav', mp3_mono_96:'mp3', wav_16k:'wav', wav_8k:'wav', mp3_8k:'mp3', ulaw_8k:'ulaw', alaw_8k:'alaw'};
  const extension = extensions[payload.profile];
  if (!extension) throw new Error('Selecciona un formato de exportación válido.');
  const selected = await dialog.showSaveDialog(mainWindow, { title: 'Exportar audio renderizado', defaultPath: `Voice Studio.${extension}`, filters: [{ name: payload.profile, extensions: [extension] }] });
  if (selected.canceled) return { canceled: true };
  const pack = ['universal_pack','asterisk_pack'].includes(payload.profile);
  let outputPath = selected.filePath;
  if (pack) {
    const stem = path.parse(selected.filePath).name; let folder = path.join(path.dirname(selected.filePath), stem + '_pack');
    for (let i = 2; fs.existsSync(folder); i++) folder = path.join(path.dirname(selected.filePath), stem + '_pack_' + i);
    fs.mkdirSync(folder); outputPath = path.join(folder, path.basename(selected.filePath));
  }
  const result = await bridge.request('audio:export', { ...payload, output_path: outputPath });
  return { ...result, canceled: false };
});
ipcMain.handle('audio:merge', async (_event, payload) => {
  const result = await bridge.request('audio:merge', payload);
  return { ...result, url: pathToFileURL(result.path).href };
});
ipcMain.handle('audio:convert', async (_event, payload) => {
  const selected = await dialog.showSaveDialog(mainWindow, { title: 'Guardar audio convertido', defaultPath: `${payload.name || 'audio_convertido'}${({wav:'.wav',wav_16k:'.wav',wav_8k:'.wav',ulaw_8k:'.ulaw',alaw_8k:'.alaw'})[payload.profile] || '.mp3'}` });
  if (selected.canceled) return { canceled: true };
  let outputPath = selected.filePath;
  if (['universal_pack','asterisk_pack'].includes(payload.profile)) {
    let folder = selected.filePath + '_pack';
    for (let i = 2; fs.existsSync(folder); i++) folder = selected.filePath + '_pack_' + i;
    fs.mkdirSync(folder); outputPath = path.join(folder, path.basename(selected.filePath));
  }
  const result = await bridge.request('audio:convert', {...payload, output_path: outputPath});
  return { ...result, url: pathToFileURL(result.path).href };
});
ipcMain.handle('audio:idtag', async (_event, payload) => {
  const result = await bridge.request('audio:idtag', payload);
  return { ...result, url: pathToFileURL(result.path).href };
});
ipcMain.handle('audio:split', async (_event, payload) => {
  const result = await bridge.request('audio:split', payload);
  return { ...result, files: result.files.map(file => ({ ...file, url: pathToFileURL(file.path).href })) };
});
const audioFilters = [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'mp4', 'ogg', 'aac', 'ulaw', 'alaw', 'sln'] }];
ipcMain.handle('audio:selectFiles', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, { title: options.title || 'Seleccionar audios', properties: ['openFile', 'multiSelections'], filters: audioFilters });
  return result.canceled ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: result.filePaths };
});
ipcMain.handle('audio:selectFile', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, { title: options.title || 'Seleccionar audio', properties: ['openFile'], filters: audioFilters });
  return result.canceled ? { canceled: true, filePath: null } : { canceled: false, filePath: result.filePaths[0] || null };
});
ipcMain.handle('audio:selectImageFile', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, { title: options.title || 'Seleccionar carátula', properties: ['openFile'], filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
  const filePath = result.filePaths[0] || null;
  return result.canceled || !filePath ? { canceled: true, filePath: null, url: null } : { canceled: false, filePath, url: pathToFileURL(filePath).href };
});
ipcMain.handle('stt:selectModel', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, { title: options.title || 'Seleccionar modelo STT', properties: ['openFile'], filters: [{ name: 'Modelo Whisper.cpp', extensions: ['bin', 'gguf'] }, { name: 'Todos los archivos', extensions: ['*'] }] });
  return result.canceled ? { canceled: true, filePath: null } : { canceled: false, filePath: result.filePaths[0] || null };
});
ipcMain.handle('stt:selectRuntime', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, { title: options.title || 'Seleccionar whisper-cli.exe', properties: ['openFile'], filters: [{ name: 'Ejecutable Whisper.cpp', extensions: ['exe'] }] });
  return result.canceled ? { canceled: true, filePath: null } : { canceled: false, filePath: result.filePaths[0] || null };
});

function projectFileName(value) {
  const clean = String(value || 'mi_proyecto').replace(/[<>:"/\\|?*]/g, '_').trim() || 'mi_proyecto';
  return clean.toLowerCase().endsWith('.tacvs') ? clean : `${clean}.tacvs`;
}

function projectPathIsInside(projectDir, target) {
  const relative = path.relative(path.resolve(projectDir), path.resolve(target));
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function ensureProjectsRoot() {
  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
  return PROJECTS_ROOT;
}

function uniqueProjectPath(fileName) {
  const cleanName = projectFileName(fileName);
  const extension = path.extname(cleanName);
  const baseName = path.basename(cleanName, extension);
  let candidate = path.join(PROJECTS_ROOT, cleanName);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(PROJECTS_ROOT, `${baseName} (${index})${extension}`);
    index += 1;
  }
  return candidate;
}

function projectAudioPath(projectPath, relativePath) {
  if (!projectPath || typeof relativePath !== 'string') return null;
  const projectDir = path.dirname(projectPath);
  const target = path.resolve(projectDir, relativePath);
  return projectPathIsInside(projectDir, target) && fs.existsSync(target) ? target : null;
}

function projectCreationInfo(project) {
  const active = Array.isArray(project?.takes)
    ? project.takes.find(take => take.id === project.active_take_id) || project.takes[project.takes.length - 1]
    : null;
  const tts = active?.tts && typeof active.tts === 'object' ? active.tts : {};
  const creation = project?.creation && typeof project.creation === 'object' ? project.creation : {};
  return {
    system: String(creation.system || tts.mode || tts.engine || '—'),
    voice: String(creation.voice || tts.voice || tts.profile || tts.engine || '—')
  };
}

async function projectSummary(filePath) {
  const project = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (project.project_format !== 'tacvs') throw new Error('Formato no válido.');
  const active = Array.isArray(project.takes)
    ? project.takes.find(take => take.id === project.active_take_id) || project.takes[project.takes.length - 1]
    : null;
  const audioPath = projectAudioPath(filePath, active?.clean_audio);
  let duration = Number(active?.duration) || 0;
  if (audioPath) {
    try { duration = Number((await bridge.request('audio:analyze', { input_path: audioPath })).duration) || duration; } catch (_) {}
  }
  const creation = projectCreationInfo(project);
  return {
    filePath,
    projectName: project.project_name || path.basename(filePath, '.tacvs'),
    updatedAt: project.updated_at || project.created_at || '',
    duration: Math.round(duration * 1000) / 1000,
    system: creation.system,
    voice: creation.voice,
    takes: Array.isArray(project.takes) ? project.takes.length : 0
  };
}

ipcMain.handle('project:reset', () => {
  currentProjectPath = null;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle('Voice Studio by LQTAC — Proyecto nuevo');
  return true;
});

ipcMain.handle('project:save', async (_event, data) => {
  if (!data || data.project_format !== 'tacvs') throw new Error('Formato de proyecto no válido.');
  const overwrite = Boolean(data.__overwrite);
  delete data.__overwrite;
  ensureProjectsRoot();
  const requestedPath = path.join(PROJECTS_ROOT, projectFileName(data.project_name));
  if (fs.existsSync(requestedPath) && !overwrite) return { canceled: false, conflict: true, filePath: requestedPath, projectName: data.project_name };
  if (!currentProjectPath || overwrite) currentProjectPath = overwrite ? requestedPath : uniqueProjectPath(data.project_name);

  const projectDir = path.dirname(currentProjectPath);
  const assetsRoot = path.join(projectDir, `${path.basename(currentProjectPath, path.extname(currentProjectPath))}_assets`);
  for (const take of Array.isArray(data.takes) ? data.takes : []) {
    if (!take._source_path) continue;
    const source = path.resolve(String(take._source_path));
    if (!fs.existsSync(source)) throw new Error(`No existe el audio generado: ${source}`);
    const takeDir = path.join(assetsRoot, 'takes', String(take.id || 'take_001'));
    fs.mkdirSync(takeDir, { recursive: true });
    const cleanPath = path.join(takeDir, `clean${path.extname(source) || '.mp3'}`);
    fs.copyFileSync(source, cleanPath);
    take.clean_audio = path.relative(projectDir, cleanPath).replaceAll(path.sep, '/');
    delete take._source_path;
  }
  data.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(currentProjectPath, JSON.stringify(data, null, 2), 'utf8');
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(`${path.basename(currentProjectPath)} — Voice Studio by LQTAC`);
  return { canceled: false, filePath: currentProjectPath, data };
});

ipcMain.handle('project:list', async () => {
  ensureProjectsRoot();
  const files = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.tacvs'))
    .map(entry => path.join(PROJECTS_ROOT, entry.name));
  const projects = [];
  for (const filePath of files) {
    try { projects.push(await projectSummary(filePath)); } catch (_) {}
  }
  return projects.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
});

ipcMain.handle('project:open', async (_event, requestedPath) => {
  if (typeof requestedPath !== 'string' || !requestedPath.trim()) return { canceled: true };
  const filePath = path.resolve(requestedPath);
  if (!projectPathIsInside(PROJECTS_ROOT, filePath) || !filePath.toLowerCase().endsWith('.tacvs') || !fs.existsSync(filePath)) {
    throw new Error('El proyecto debe estar dentro de la carpeta local de proyectos.');
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (data.project_format !== 'tacvs') throw new Error('El archivo no parece un proyecto .tacvs válido.');
  currentProjectPath = filePath;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(`${path.basename(filePath)} — Voice Studio by LQTAC`);
  return { canceled: false, filePath, data };
});

ipcMain.handle('project:delete', async (_event, requestedPath) => {
  if (typeof requestedPath !== 'string' || !requestedPath.trim()) throw new Error('Proyecto no indicado.');
  const filePath = path.resolve(requestedPath);
  if (!projectPathIsInside(PROJECTS_ROOT, filePath) || !filePath.toLowerCase().endsWith('.tacvs')) throw new Error('Proyecto no válido.');
  if (!fs.existsSync(filePath)) return { deleted: false };
  fs.rmSync(filePath, { force: true });
  const assetsDir = path.join(PROJECTS_ROOT, `${path.basename(filePath, path.extname(filePath))}_assets`);
  if (projectPathIsInside(PROJECTS_ROOT, assetsDir) && fs.existsSync(assetsDir)) fs.rmSync(assetsDir, { recursive: true, force: true });
  if (currentProjectPath && path.resolve(currentProjectPath) === filePath) {
    currentProjectPath = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle('Voice Studio by LQTAC — Proyecto nuevo');
  }
  return { deleted: true, filePath };
});

ipcMain.handle('project:audioInfo', (_event, relativePath) => {
  if (!currentProjectPath || typeof relativePath !== 'string') throw new Error('No hay un proyecto abierto.');
  const target = projectAudioPath(currentProjectPath, relativePath);
  if (!target) throw new Error('No se encuentra el audio de la toma.');
  return { path: target, url: pathToFileURL(target).href };
});

ipcMain.handle('voice:revealOutput', (_event, filePath) => {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) throw new Error('No se encuentra el archivo de audio.');
  shell.showItemInFolder(filePath);
  return true;
});
ipcMain.handle('app:info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  sourceRoot: SOURCE_ROOT,
  projectsRoot: PROJECTS_ROOT,
  bridgeScript: BRIDGE_SCRIPT
}));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: 'Voice Studio by LQTAC',
    backgroundColor: '#070B18',
    icon: path.join(__dirname, 'assets', 'voice-studio-wave-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => bridge.stop());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
