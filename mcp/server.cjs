#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const APP_ROOT = path.resolve(__dirname, '..');
const EXECUTABLE_ROOT = path.dirname(process.execPath);
const SOURCE_CANDIDATES = [
  process.env.LQTAC_VOICE_SOURCE_ROOT,
  path.resolve(APP_ROOT, '..', 'LQTAC_VS'),
  path.resolve(APP_ROOT, '..', '..', 'LQTAC_VS'),
  path.join(EXECUTABLE_ROOT, 'resources', 'LQTAC_VS'),
  path.join(EXECUTABLE_ROOT, 'LQTAC_VS'),
  path.resolve(APP_ROOT, '..', '..', '..', 'LQTAC_VS')
].filter(Boolean);
const SOURCE_ROOT = SOURCE_CANDIDATES.find(candidate => fs.existsSync(candidate)) || SOURCE_CANDIDATES[0];
const BRIDGE_SCRIPT = path.join(APP_ROOT, 'backend', 'voice_bridge.py');
const IS_PACKAGED_LAYOUT = path.basename(path.dirname(APP_ROOT)).toLowerCase() === 'resources' && fs.existsSync(path.resolve(APP_ROOT, '..', 'LQTAC_VS'));
const DEFAULT_DATA_ROOT = IS_PACKAGED_LAYOUT ? path.resolve(APP_ROOT, '..', '..', 'data') : path.join(APP_ROOT, 'data');
const DATA_ROOT = process.env.LQTAC_VOICE_DATA_ROOT || (process.env.LQTAC_VOICE_OUTPUT_ROOT ? path.dirname(process.env.LQTAC_VOICE_OUTPUT_ROOT) : DEFAULT_DATA_ROOT);
const OUTPUT_ROOT = process.env.LQTAC_VOICE_OUTPUT_ROOT || path.join(DATA_ROOT, 'outputs');
const MCP_ROOT = path.join(DATA_ROOT, 'mcp');
const MANIFEST_ROOT = path.join(MCP_ROOT, 'manifests');
const PROJECTS_ROOT = path.join(DATA_ROOT, 'projects');
const MANUAL_ROOT = path.join(__dirname, 'manual');
const jobs = new Map();

for (const directory of [OUTPUT_ROOT, MCP_ROOT, MANIFEST_ROOT, PROJECTS_ROOT]) fs.mkdirSync(directory, { recursive: true });

function pythonExecutable() {
  const candidates = [
    path.join(SOURCE_ROOT, 'runtime', '.venv', 'Scripts', 'python.exe'),
    path.join(SOURCE_ROOT, 'tools', 'python', 'Python311', 'python.exe'),
    path.join(SOURCE_ROOT, 'tools', 'python', 'Python312', 'python.exe')
  ];
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error(`No se encuentra Python portable dentro de ${SOURCE_ROOT}`);
  return executable;
}

class Bridge {
  constructor() { this.child = null; this.pending = new Map(); this.nextId = 1; this.buffer = ''; }
  start() {
    if (this.child) return;
    this.child = spawn(pythonExecutable(), ['-u', BRIDGE_SCRIPT], {
      cwd: SOURCE_ROOT,
      windowsHide: true,
      env: { ...process.env, LQTAC_SOURCE_ROOT: SOURCE_ROOT, LQTAC_VOICE_OUTPUT_ROOT: OUTPUT_ROOT, PYTHONUTF8: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk;
      for (;;) {
        const index = this.buffer.indexOf('\n');
        if (index < 0) break;
        const line = this.buffer.slice(0, index).trim(); this.buffer = this.buffer.slice(index + 1);
        if (!line) continue;
        try {
          const response = JSON.parse(line); const pending = this.pending.get(response.id);
          if (!pending) continue;
          this.pending.delete(response.id);
          response.ok ? pending.resolve(response.result) : pending.reject(new Error(response.error || 'Error desconocido del motor de voz.'));
        } catch (_) {}
      }
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', chunk => process.stderr.write('[Voice Studio] ' + chunk));
    this.child.on('exit', code => {
      const error = new Error(`El runtime de Voice Studio terminó con código ${code}.`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear(); this.child = null;
    });
  }
  request(op, payload = {}) {
    this.start();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify({ id, op, ...payload }) + '\n');
    });
  }
}
const bridge = new Bridge();

function safeName(value, fallback = 'narracion') {
  const cleaned = String(value || fallback).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|[._]+$/g, '');
  return (cleaned || fallback).slice(0, 80);
}
function sha256(file) { const hash = crypto.createHash('sha256'); hash.update(fs.readFileSync(file)); return hash.digest('hex'); }
function uniqueTarget(directory, stem, extension) {
  fs.mkdirSync(directory, { recursive: true });
  let target = path.join(directory, stem + extension);
  for (let index = 2; fs.existsSync(target); index++) target = path.join(directory, `${stem}_${index}${extension}`);
  return target;
}
function profileExtension(profile, source) {
  if (profile?.includes('wav') || profile === 'asterisk_pack') return '.wav';
  if (profile === 'ulaw_8k') return '.ulaw'; if (profile === 'alaw_8k') return '.alaw';
  if (profile === 'sln_8k') return '.sln'; if (profile === 'sln16') return '.sln16';
  return path.extname(source) || '.mp3';
}
async function finalizeAudio(result, args, kind) {
  let audio = result;
  if (args.output_profile && !['original', 'source'].includes(args.output_profile)) {
    audio = await bridge.request('audio:convert', { input_path: result.path, profile: args.output_profile, name: safeName(args.name || kind) });
    if (audio.files?.length) audio = audio.files[0];
  }
  const source = audio.path;
  const directory = args.output_directory ? path.resolve(args.output_directory) : path.join(OUTPUT_ROOT, 'mcp');
  const target = uniqueTarget(directory, safeName(args.name || kind), profileExtension(args.output_profile, source));
  fs.copyFileSync(source, target);
  const analysis = await bridge.request('audio:analyze', { input_path: target });
  const manifest = {
    schema: 'lqtac.voice-asset.v1', id: crypto.randomUUID(), created_at: new Date().toISOString(), kind,
    audio_path: target, duration: analysis.duration, sha256: sha256(target), text: args.text,
    engine: args.engine, model: args.model || null, language: args.language || null, voice: args.voice || args.profile || null,
    accent: args.accent || null, style: args.instruct || args.style || null,
    adjustments: { rate: args.rate ?? 0, pitch_hz: args.pitch ?? 0, volume: args.volume ?? 0 },
    output_profile: args.output_profile || 'original',
    cinema: { project: args.cinema_project || null, scene_id: args.scene_id || null, track_name: args.track_name || 'Narración', position_seconds: args.position_seconds ?? null, target_duration: args.target_duration ?? null }
  };
  const manifestPath = path.join(MANIFEST_ROOT, manifest.id + '.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { ...manifest, manifest_path: manifestPath };
}

async function generate(args, kind = 'narration') {
  if (!args.text?.trim()) throw new Error('Falta el texto que debe pronunciarse.');
  if (!args.engine) throw new Error('Falta engine. Consulta primero voice_catalog.');
  const payload = {
    ...args, text: args.text.trim(), name: safeName(args.name || kind),
    rate: `${Number(args.rate || 0) >= 0 ? '+' : ''}${Number(args.rate || 0)}%`,
    pitch: `${Number(args.pitch || 0) >= 0 ? '+' : ''}${Number(args.pitch || 0)}Hz`,
    volume: `${Number(args.volume || 0) >= 0 ? '+' : ''}${Number(args.volume || 0)}%`
  };
  const result = args.engine === 'clone'
    ? await bridge.request('clone:generate', { ...payload, profile: args.profile, engine: args.clone_engine || 'qwen' })
    : await bridge.request('voice:generate', payload);
  return finalizeAudio(result, args, kind);
}

function startBatch(args) {
  if (!Array.isArray(args.scenes) || !args.scenes.length) throw new Error('scenes debe contener al menos una escena.');
  const id = crypto.randomUUID();
  const job = { id, state: 'queued', created_at: new Date().toISOString(), total: args.scenes.length, completed: 0, results: [], errors: [] };
  jobs.set(id, job);
  (async () => {
    job.state = 'running'; job.started_at = new Date().toISOString();
    for (let index = 0; index < args.scenes.length; index++) {
      const scene = args.scenes[index];
      try {
        const result = await generate({ ...args.defaults, ...scene, name: scene.name || `escena_${index + 1}`, scene_id: scene.scene_id || String(index + 1) }, 'scene_narration');
        job.results.push(result);
      } catch (error) { job.errors.push({ index, scene_id: scene.scene_id || String(index + 1), error: error.message }); }
      job.completed = index + 1;
    }
    job.state = job.errors.length ? (job.results.length ? 'completed_with_errors' : 'failed') : 'completed';
    job.finished_at = new Date().toISOString();
  })();
  return job;
}

function projectFile(value) {
  const requested = String(value || '').trim();
  const target = path.isAbsolute(requested) ? path.resolve(requested) : path.join(PROJECTS_ROOT, safeName(requested, 'proyecto') + '.tacvs');
  const root = path.resolve(PROJECTS_ROOT) + path.sep;
  if (!path.resolve(target).startsWith(root) || path.extname(target).toLowerCase() !== '.tacvs') throw new Error('El proyecto debe estar dentro de la carpeta local de proyectos y usar .tacvs.');
  return target;
}
function listProjects() {
  return fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true }).filter(item => item.isFile() && item.name.toLowerCase().endsWith('.tacvs')).map(item => {
    const file = path.join(PROJECTS_ROOT, item.name); let data = {};
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
    return { name: data.project_name || path.basename(item.name, '.tacvs'), path: file, updated_at: data.updated_at || fs.statSync(file).mtime.toISOString(), creation: data.creation || null, takes: Array.isArray(data.takes) ? data.takes.length : 0 };
  });
}

const adjustmentProperties = {
  rate: { type: 'number', minimum: -50, maximum: 50, description: 'Velocidad en porcentaje.' },
  pitch: { type: 'number', minimum: -100, maximum: 100, description: 'Tono en Hz.' },
  volume: { type: 'number', minimum: -50, maximum: 50, description: 'Volumen en porcentaje.' }
};
const generationProperties = {
  text: { type: 'string' }, engine: { type: 'string', enum: ['edge', 'azure', 'qwen', 'melo', 'matxa', 'clone'] },
  voice: { type: 'string' }, language: { type: 'string' }, model: { type: 'string' }, instruct: { type: 'string' },
  profile: { type: 'string', description: 'Perfil guardado para engine=clone.' }, clone_engine: { type: 'string', enum: ['qwen', 'openvoice'] },
  accent: { type: 'string' }, speed: { type: 'number' }, temperature: { type: 'number' }, length_scale: { type: 'number' },
  ...adjustmentProperties, output_profile: { type: 'string' }, output_directory: { type: 'string' }, name: { type: 'string' },
  cinema_project: { type: 'string' }, scene_id: { type: 'string' }, track_name: { type: 'string' }, position_seconds: { type: 'number' }, target_duration: { type: 'number' }
};
const tools = [
  { name: 'voice_studio_status', description: 'Comprueba runtime, motores y carpetas de Voice Studio.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'voice_catalog', description: 'Consulta motores, modelos, idiomas, voces, perfiles y formatos realmente disponibles. Debe usarse antes de elegir una voz.', inputSchema: { type: 'object', properties: { engine: { type: 'string' }, include_voices: { type: 'boolean', default: true } }, additionalProperties: false } },
  { name: 'voice_generate_audition', description: 'Genera una prueba corta para que el usuario pueda escoger narrador.', inputSchema: { type: 'object', required: ['text', 'engine', 'voice'], properties: generationProperties, additionalProperties: false } },
  { name: 'voice_generate_narration', description: 'Genera una narración y un manifiesto con metadatos listos para Cinema Studio.', inputSchema: { type: 'object', required: ['text', 'engine'], properties: generationProperties, additionalProperties: false } },
  { name: 'voice_generate_batch', description: 'Inicia la generación asíncrona de narraciones por escenas.', inputSchema: { type: 'object', required: ['scenes'], properties: { defaults: { type: 'object', properties: generationProperties }, scenes: { type: 'array', minItems: 1, items: { type: 'object', required: ['text'], properties: generationProperties } } }, additionalProperties: false } },
  { name: 'voice_job_status', description: 'Consulta progreso y resultados de una generación por escenas.', inputSchema: { type: 'object', required: ['job_id'], properties: { job_id: { type: 'string' } }, additionalProperties: false } },
  { name: 'voice_analyze_audio', description: 'Analiza duración, frecuencia de análisis y forma de onda de un audio.', inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } }, additionalProperties: false } },
  { name: 'voice_list_clone_profiles', description: 'Lista perfiles de clonación disponibles.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'voice_save_clone_profile', description: 'Crea un perfil local autorizado a partir de un WAV y su transcripción exacta.', inputSchema: { type: 'object', required: ['name', 'sample_path', 'reference_text'], properties: { name: { type: 'string' }, sample_path: { type: 'string' }, reference_text: { type: 'string' }, language: { type: 'string', default: 'es' } }, additionalProperties: false } },
  { name: 'voice_transcribe', description: 'Transcribe un audio con Whisper.cpp o faster-whisper.', inputSchema: { type: 'object', required: ['input_path', 'engine'], properties: { input_path: { type: 'string' }, engine: { type: 'string', enum: ['whispercpp', 'fasterwhisper'] }, language: { type: 'string', default: 'auto' }, translate: { type: 'boolean' }, model: { type: 'string' }, executable: { type: 'string' } }, additionalProperties: false } },
  { name: 'voice_convert_audio', description: 'Convierte un audio a uno de los perfiles devueltos por voice_catalog.', inputSchema: { type: 'object', required: ['input_path', 'profile'], properties: { input_path: { type: 'string' }, profile: { type: 'string' }, name: { type: 'string' } }, additionalProperties: false } },
  { name: 'voice_merge_audio', description: 'Fusiona varios audios en secuencia o mezcla.', inputSchema: { type: 'object', required: ['input_paths'], properties: { input_paths: { type: 'array', minItems: 2, items: { type: 'string' } }, mode: { type: 'string', enum: ['append', 'mix'], default: 'append' }, name: { type: 'string' } }, additionalProperties: false } },
  { name: 'voice_split_audio', description: 'Divide un audio en los puntos indicados en segundos.', inputSchema: { type: 'object', required: ['input_path', 'split_points'], properties: { input_path: { type: 'string' }, split_points: { type: 'array', items: { type: 'number' } }, duration: { type: 'number' }, name: { type: 'string' } }, additionalProperties: false } },
  { name: 'voice_render_audio', description: 'Aplica recortes, volumen y efectos configurados a un audio.', inputSchema: { type: 'object', required: ['input_path'], properties: { input_path: { type: 'string' }, duration: { type: 'number' }, cuts: { type: 'array', items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } } }, volume: { type: 'number' }, effect: { type: 'string' }, fx: { type: 'object' }, name: { type: 'string' } }, additionalProperties: false } },
  { name: 'voice_project_list', description: 'Lista proyectos TACVS locales.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'voice_project_read', description: 'Lee un proyecto TACVS local completo.', inputSchema: { type: 'object', required: ['project'], properties: { project: { type: 'string' } }, additionalProperties: false } },
  { name: 'voice_project_save', description: 'Guarda un proyecto TACVS local. No sobrescribe salvo overwrite=true.', inputSchema: { type: 'object', required: ['name', 'project'], properties: { name: { type: 'string' }, project: { type: 'object' }, overwrite: { type: 'boolean', default: false } }, additionalProperties: false } },
  { name: 'voice_project_delete', description: 'Borra un proyecto local solo con confirm="BORRAR".', inputSchema: { type: 'object', required: ['project', 'confirm'], properties: { project: { type: 'string' }, confirm: { type: 'string', enum: ['BORRAR'] } }, additionalProperties: false } }
];

const manualFiles = fs.existsSync(MANUAL_ROOT) ? fs.readdirSync(MANUAL_ROOT).filter(name => name.endsWith('.md')) : [];
const resources = manualFiles.map(name => ({ uri: `voice-studio://manual/${name.replace(/\.md$/, '')}`, name: name.replace(/\.md$/, '').replaceAll('-', ' '), mimeType: 'text/markdown' }));
resources.push({ uri: 'voice-studio://capabilities', name: 'Capacidades actuales de Voice Studio', mimeType: 'application/json' });

function content(value) { return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }], structuredContent: typeof value === 'object' ? value : undefined }; }
async function callTool(name, args = {}) {
  if (name === 'voice_studio_status') return content({ ...(await bridge.request('status')), mcp: { source_root: SOURCE_ROOT, output_root: OUTPUT_ROOT, manual_resources: resources.length } });
  if (name === 'voice_catalog') return content(await bridge.request('voice:catalog', args));
  if (name === 'voice_generate_audition') return content(await generate({ ...args, text: args.text.slice(0, 600), name: args.name || 'prueba_voz' }, 'audition'));
  if (name === 'voice_generate_narration') return content(await generate(args, 'narration'));
  if (name === 'voice_generate_batch') return content(startBatch(args));
  if (name === 'voice_job_status') { const job = jobs.get(args.job_id); if (!job) throw new Error('Trabajo no encontrado en esta sesión MCP.'); return content(job); }
  if (name === 'voice_analyze_audio') return content(await bridge.request('audio:analyze', { input_path: args.path }));
  if (name === 'voice_list_clone_profiles') return content(await bridge.request('clone:list_profiles'));
  if (name === 'voice_save_clone_profile') return content(await bridge.request('clone:save_profile', args));
  if (name === 'voice_transcribe') return content(await bridge.request('stt:transcribe', args));
  if (name === 'voice_convert_audio') return content(await bridge.request('audio:convert', args));
  if (name === 'voice_merge_audio') return content(await bridge.request('audio:merge', args));
  if (name === 'voice_split_audio') return content(await bridge.request('audio:split', args));
  if (name === 'voice_render_audio') return content(await bridge.request('audio:render', args));
  if (name === 'voice_project_list') return content({ projects: listProjects(), root: PROJECTS_ROOT });
  if (name === 'voice_project_read') { const file = projectFile(args.project); if (!fs.existsSync(file)) throw new Error('Proyecto no encontrado.'); return content({ path: file, project: JSON.parse(fs.readFileSync(file, 'utf8')) }); }
  if (name === 'voice_project_save') { const file = projectFile(args.name); if (fs.existsSync(file) && !args.overwrite) throw new Error('El proyecto ya existe. Confirma overwrite=true para sustituirlo.'); const data = { ...args.project, project_format: 'tacvs', project_name: args.project.project_name || args.name, updated_at: new Date().toISOString() }; fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); return content({ path: file, project: data }); }
  if (name === 'voice_project_delete') { if (args.confirm !== 'BORRAR') throw new Error('Confirmación no válida.'); const file = projectFile(args.project); if (!fs.existsSync(file)) throw new Error('Proyecto no encontrado.'); fs.unlinkSync(file); return content({ deleted: true, path: file }); }
  throw new Error(`Herramienta desconocida: ${name}`);
}

async function readResource(uri) {
  if (uri === 'voice-studio://capabilities') return JSON.stringify(await bridge.request('voice:catalog', { include_voices: false }), null, 2);
  const prefix = 'voice-studio://manual/';
  if (!uri.startsWith(prefix)) throw new Error('Recurso no encontrado.');
  const name = uri.slice(prefix.length);
  const target = path.join(MANUAL_ROOT, name + '.md');
  if (!path.resolve(target).startsWith(path.resolve(MANUAL_ROOT)) || !fs.existsSync(target)) throw new Error('Capítulo no encontrado.');
  return fs.readFileSync(target, 'utf8');
}

const prompts = [{ name: 'crear_narracion_para_cinema', description: 'Planifica y genera una narración coordinada con Cinema Studio.', arguments: [{ name: 'objetivo', required: true }, { name: 'idioma', required: false }, { name: 'estilo', required: false }] }];
function promptMessages(args) {
  return [{ role: 'user', content: { type: 'text', text: `Objetivo: ${args.objetivo}\nIdioma preferido: ${args.idioma || 'preguntar si no se deduce'}\nEstilo: ${args.estilo || 'preguntar'}\n\nLee primero voice-studio://manual/cinema-studio-integration. Consulta voice_catalog antes de proponer voces. Si hay varias opciones creativamente distintas, genera pruebas y pide al usuario que elija. Lee el proyecto de Cinema Studio antes de editar, guarda una copia LQTS y coloca las narraciones en una pista Narración respetando posiciones y escenas.` } }];
}

async function handle(message) {
  const method = message.method;
  if (method === 'initialize') return { protocolVersion: message.params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } }, serverInfo: { name: 'voice-studio-mcp', version: '0.1.0', title: 'Voice Studio by LQTAC' }, instructions: 'Consulta voice_catalog antes de generar. Usa los manuales MCP para coordinar narraciones con Cinema Studio.' };
  if (method === 'ping') return {};
  if (method === 'tools/list') return { tools };
  if (method === 'tools/call') return callTool(message.params?.name, message.params?.arguments || {});
  if (method === 'resources/list') return { resources };
  if (method === 'resources/read') return { contents: [{ uri: message.params.uri, mimeType: message.params.uri.endsWith('capabilities') ? 'application/json' : 'text/markdown', text: await readResource(message.params.uri) }] };
  if (method === 'prompts/list') return { prompts };
  if (method === 'prompts/get') { if (message.params?.name !== prompts[0].name) throw new Error('Prompt no encontrado.'); return { description: prompts[0].description, messages: promptMessages(message.params.arguments || {}) }; }
  if (method?.startsWith('notifications/')) return null;
  throw Object.assign(new Error(`Método no soportado: ${method}`), { code: -32601 });
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  for (;;) {
    const index = input.indexOf('\n'); if (index < 0) break;
    const line = input.slice(0, index).trim(); input = input.slice(index + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch (_) { continue; }
    Promise.resolve(handle(message)).then(result => {
      if (message.id === undefined || result === null) return;
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n');
    }).catch(error => {
      if (message.id === undefined) return;
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: error.code || -32000, message: error.message } }) + '\n');
    });
  }
});
process.stdin.on('end', () => { if (bridge.child) setTimeout(() => bridge.child?.kill(), 5000); });
process.on('SIGINT', () => { if (bridge.child) bridge.child.kill(); process.exit(0); });
process.on('SIGTERM', () => { if (bridge.child) bridge.child.kill(); process.exit(0); });

