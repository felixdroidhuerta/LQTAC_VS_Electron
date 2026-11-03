(() => {
const oldTranscript = document.querySelector('#stt-output');
const editor = document.createElement('div');
editor.id = oldTranscript.id;
editor.className = oldTranscript.className;
editor.contentEditable = 'true';
editor.setAttribute('role', 'textbox');
editor.setAttribute('aria-label', 'Editor de transcripción');
editor.style.cssText = 'min-height:320px;padding:14px;white-space:pre-wrap;overflow:auto;border:1px solid #2b3c60;border-radius:9px;background:#080f20;font:14px "Segoe UI";';
Object.defineProperty(editor, 'value', { get() { return this.innerText; }, set(value) { this.innerText = value; } });
oldTranscript.replaceWith(editor);
const toolbar = document.createElement('div');
toolbar.className = 'transcript-toolbar';
editor.parentElement.before(toolbar);
let selectionRange;
document.addEventListener('selectionchange', () => { const s = getSelection(); if (s.rangeCount && editor.contains(s.anchorNode)) selectionRange = s.getRangeAt(0).cloneRange(); });
function format(command, value) {
  editor.focus();
  if (selectionRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(selectionRange); }
  document.execCommand(command, false, value);
}
function button(label, action, parent = toolbar) { const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary-button'; b.textContent = label; b.onclick = action; parent.append(b); return b; }
function select(values, command) { const s = document.createElement('select'); for (const value of values) s.add(new Option(value, value)); s.onchange = () => format(command, s.value); toolbar.append(s); }
select(['Segoe UI','Arial','Calibri','Times New Roman','Consolas'], 'fontName');
const size = document.createElement('select');
for (const n of [10,12,14,16,18,24,32,48]) size.add(new Option(n, n));
size.value = '14'; toolbar.append(size);
size.onchange = () => { format('fontSize', '7'); editor.querySelectorAll('font[size="7"]').forEach(node => { node.removeAttribute('size'); node.style.fontSize = size.value + 'px'; }); };
for (const [label, command] of [['Negrita','bold'],['Cursiva','italic'],['Subrayado','underline'],['Tachado','strikeThrough'],['Deshacer','undo'],['Rehacer','redo']]) button(label, () => format(command));
editor.addEventListener('paste', event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); });
function paragraphs() {
  const result = [[]];
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const css = getComputedStyle(node.parentElement);
      const parts = node.textContent.split('\n');
      parts.forEach((text, index) => { if (index) result.push([]); result.at(-1).push({text, font: css.fontFamily.split(',')[0].replaceAll('"',''), size: parseFloat(css.fontSize) * .75, bold: Number(css.fontWeight) >= 600 || css.fontWeight === 'bold', italic: css.fontStyle === 'italic', underline: css.textDecorationLine.includes('underline') || !!node.parentElement.closest('u'), strike: css.textDecorationLine.includes('line-through') || !!node.parentElement.closest('strike,s')}); });
    } else if (node.nodeName === 'BR') result.push([]);
    else { if (['DIV','P'].includes(node.nodeName) && result.at(-1).length) result.push([]); node.childNodes.forEach(walk); }
  }
  editor.childNodes.forEach(walk); return result;
}
const actions = document.createElement('div'); actions.className = 'transcript-toolbar'; editor.parentElement.after(actions);
button('Guardar texto', async () => {
  try { const result = await window.voiceStudio.exportTranscript({text:editor.innerText, paragraphs:paragraphs()}); if (!result.canceled) document.querySelector('#status-message').textContent = 'Transcripción guardada: ' + result.path; }
  catch (error) { document.querySelector('#status-message').textContent = 'Error al guardar: ' + error.message; }
}, actions);
const top = document.querySelector('.topbar-actions');
const help = document.createElement('details');
help.className = 'help-dropdown';
const summary = document.createElement('summary'); summary.textContent = 'Ayuda ▾'; summary.className = 'secondary-button'; help.append(summary); top.append(help);
const menu = document.createElement('div'); menu.className = 'help-menu'; help.append(menu);
button('Manual', async () => { help.open = false; try { await window.voiceStudio.openManual(); } catch (error) { document.querySelector('#status-message').textContent = error.message; } }, menu);
menu.append(document.createElement('hr'));
document.addEventListener('click', event => { if (!help.contains(event.target)) help.open = false; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') help.open = false; });
const about = document.createElement('dialog');
about.className = 'about-dialog';
about.innerHTML = '<img class="about-icon" src="../assets/voice-studio-wave-icon.png" alt=""><h2>Voice Studio</h2><div class="brand-signature">by <img src="../assets/lqtac-wordmark.png" alt="LQTAC"></div><p>Versión Python de referencia: V1.14 · Electron 0.1.0</p><p>Generación, clonación y transcripción de voz.<br>Edición de audio, efectos y proyectos.<br>Proyecto LoQueTengoAquiColgado Voice Studio.</p><p>Creado por LoQueTengoAquiColgado.<br>Asistencia técnica y desarrollo iterativo con ChatGPT.</p><p>Componentes locales: FFmpeg, SoX, Edge TTS, Azure Speech, MeloTTS, OpenVoice V2, Qwen Local y Clonador.</p>';
document.body.append(about);
button('Cerrar', () => about.close(), about);
button('Acerca de…', () => { help.open = false; about.showModal(); }, menu);
})();
