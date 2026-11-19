'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const NAME = 'voice-studio';
const SERVER = path.join(__dirname, 'server.cjs');
const toml = value => /['\r\n]/.test(value) ? JSON.stringify(value) : `'${value}'`;
const quote = value => /[\s"&|<>^]/.test(value) ? '"' + value.replace(/"/g, '\\"') + '"' : value;
const files = {
  claude: () => path.join(os.homedir(), '.claude.json'),
  codex: () => path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml')
};

function clients(command) {
  const entry = { type: 'stdio', command, args: [SERVER], env: { ELECTRON_RUN_AS_NODE: '1' } };
  const codexBlock = [
    `[mcp_servers.${NAME}]`, `command = ${toml(command)}`, `args = [${toml(SERVER)}]`,
    'startup_timeout_sec = 30', 'tool_timeout_sec = 180', '',
    `[mcp_servers.${NAME}.env]`, 'ELECTRON_RUN_AS_NODE = "1"'
  ];
  return {
    name: NAME, entry,
    configuration: { mcpServers: { [NAME]: { command, args: [SERVER], env: entry.env } } },
    claudeJson: { mcpServers: { [NAME]: entry } }, codexBlock,
    codex: ['# Codex: añade este bloque a %USERPROFILE%\\.codex\\config.toml', ...codexBlock, ''].join('\n'),
    claudeCommand: `claude mcp add ${NAME} --scope user -e ELECTRON_RUN_AS_NODE=1 -- ${quote(command)} ${quote(SERVER)}`
  };
}
function codexSection(lines) {
  const head = `[mcp_servers.${NAME}]`, sub = `[mcp_servers.${NAME}.`;
  const start = lines.findIndex(line => line.trim() === head); if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !(lines[end].trim().startsWith('[') && !lines[end].trim().startsWith(sub))) end++;
  while (end > start + 1 && !lines[end - 1].trim()) end--;
  return { start, end };
}
const readText = async file => { try { return await fsp.readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
async function status(command) {
  const config = clients(command), result = {};
  const claude = await readText(files.claude());
  if (claude === null) result.claude = 'no-client';
  else {
    let entry; try { entry = JSON.parse(claude).mcpServers?.[NAME]; } catch (_) {}
    result.claude = !entry ? 'missing' : entry.command === command && JSON.stringify(entry.args) === JSON.stringify(config.entry.args) && entry.env?.ELECTRON_RUN_AS_NODE === '1' ? 'ok' : 'different';
  }
  const codex = await readText(files.codex());
  if (codex === null) result.codex = fs.existsSync(path.dirname(files.codex())) ? 'missing' : 'no-client';
  else {
    const lines = codex.split(/\r?\n/), section = codexSection(lines);
    result.codex = !section ? 'missing' : lines.slice(section.start, section.end).map(line => line.trim()).filter(Boolean).join('\n') === config.codexBlock.filter(Boolean).join('\n') ? 'ok' : 'different';
  }
  return result;
}
async function writeSafely(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) await fsp.copyFile(file, file + '.bak-voicestudio');
  const temporary = file + '.tmp-voicestudio';
  await fsp.writeFile(temporary, text); await fsp.rename(temporary, file);
}
async function install(target, command) {
  const config = clients(command);
  if (target === 'claude') {
    const file = files.claude(), text = await readText(file); let data = {};
    if (text !== null) { try { data = JSON.parse(text); } catch (_) { throw new Error(`No se puede leer ${file}: no es JSON válido.`); } }
    data.mcpServers = { ...(data.mcpServers || {}), [NAME]: config.entry };
    await writeSafely(file, JSON.stringify(data, null, 2)); return file;
  }
  if (target === 'codex') {
    const file = files.codex(), text = await readText(file) ?? '', eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/), section = codexSection(lines);
    if (section) lines.splice(section.start, section.end - section.start, ...config.codexBlock);
    else { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); if (lines.length) lines.push(''); lines.push(...config.codexBlock); }
    await writeSafely(file, lines.join(eol).replace(/(\r?\n)*$/, eol)); return file;
  }
  throw new Error('Cliente MCP no válido.');
}
module.exports = { NAME, SERVER, files, clients, status, install, codexSection };

