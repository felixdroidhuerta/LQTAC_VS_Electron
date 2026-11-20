# Conectar Voice Studio MCP

Voice Studio incluye un servidor MCP local (`mcp/server.cjs`) que funciona por `stdio`. No necesita Node instalado ni que Voice Studio esté abierto: el propio EXE portable hace de runtime cuando se lanza con `ELECTRON_RUN_AS_NODE=1`.

En todas las opciones hace falta la **ruta absoluta** de la carpeta portable, que llamaremos `<PORTABLE>` (la carpeta que contiene `LQTAC Voice Studio Electron.exe`).

## Opción 1 · Desde la propia aplicación (recomendada)

1. Abre Voice Studio → **Ajustes** → **Configurar conexión MCP**.
2. El diálogo muestra si `voice-studio` ya está registrado en Claude Code y en Codex (*Registrado*, *Registrado con otras rutas*, *No registrado*).
3. Elige el cliente en **Configuración para** y pulsa **Registrar en Claude Code** / **Registrar en Codex**.
   - La aplicación escribe la entrada con las rutas reales del EXE, por lo que evita los problemas de copiar y pegar rutas (ver *Usuarios con caracteres especiales*).
   - Antes de modificar el archivo guarda una copia `*.bak-voicestudio`.
4. Abre una **sesión nueva** del cliente: los servidores MCP solo se cargan al iniciar sesión.

Con **Copiar configuración** obtienes el texto para configurarlo a mano en cualquiera de los formatos siguientes.

## Opción 2 · Claude Code (comando)

```powershell
claude mcp add voice-studio --scope user -e ELECTRON_RUN_AS_NODE=1 -- "<PORTABLE>\LQTAC Voice Studio Electron.exe" "<PORTABLE>\resources\app\mcp\server.cjs"
```

- `--scope user` lo deja disponible en todos los proyectos (se guarda en `%USERPROFILE%\.claude.json`).
- Si `claude` no está en el `PATH` (por ejemplo, usando solo la app de escritorio), usa la opción 3.
- Comprueba la conexión abriendo una sesión nueva y ejecutando `/mcp`.

## Opción 3 · Claude Code / Claude Desktop (JSON)

Añade la entrada dentro de `mcpServers` en `%USERPROFILE%\.claude.json` (Claude Code, ámbito usuario), en un `.mcp.json` de proyecto, o en la configuración de Claude Desktop:

```json
{
  "mcpServers": {
    "voice-studio": {
      "type": "stdio",
      "command": "<PORTABLE>\LQTAC Voice Studio Electron.exe",
      "args": ["<PORTABLE>\resources\app\mcp\server.cjs"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

No sustituyas el archivo entero: añade solo la clave `voice-studio` y conserva los demás servidores.

Alternativa sin variables de entorno: `"command": "<PORTABLE>\VOICE_STUDIO_MCP.cmd"` sin `args` ni `env` (el `.cmd` ya fija `ELECTRON_RUN_AS_NODE`).

## Opción 4 · Codex

Añade este bloque a `%USERPROFILE%\.codex\config.toml` (o a `%CODEX_HOME%\config.toml`):

```toml
[mcp_servers.voice-studio]
command = '<PORTABLE>\LQTAC Voice Studio Electron.exe'
args = ['<PORTABLE>\resources\app\mcp\server.cjs']
startup_timeout_sec = 30
tool_timeout_sec = 180

[mcp_servers.voice-studio.env]
ELECTRON_RUN_AS_NODE = "1"
```

## Usuarios con caracteres especiales en la ruta

Algunos perfiles de Windows tienen en el nombre de usuario un **espacio de no separación** (U+00A0) en vez de un espacio normal, por ejemplo `C:\Users\Nombre Apellido`. A simple vista es idéntico, pero si la ruta se escribe a mano o el texto se copia y pega por un medio que normaliza espacios, la ruta deja de existir y el servidor no arranca (en `/mcp` aparece como *failed* o *connection closed*).

Para comprobarlo en PowerShell:

```powershell
([Environment]::GetFolderPath('MyDocuments')).ToCharArray() | Where-Object { [int]$_ -eq 160 }
```

Si devuelve algo, no escribas la ruta a mano. Opciones:

- Usa el botón **Registrar en Claude Code** de la aplicación (opción 1).
- O construye la ruta a partir de la carpeta real:

  ```powershell
  $p = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'LQTAC_Voice_Studio_Electron_Portable'
  claude mcp add voice-studio --scope user -e ELECTRON_RUN_AS_NODE=1 -- "$p\LQTAC Voice Studio Electron.exe" "$p\resources\app\mcp\server.cjs"
  ```

  Ajusta el nombre de la carpeta si el portable está en otro sitio.

## Comprobación

En una sesión nueva del cliente deben aparecer las herramientas `voice_studio_status`, `voice_catalog`, `voice_generate_audition`, `voice_generate_narration`, `voice_generate_batch`, `voice_job_status`, etc., y los recursos `voice-studio://manual/...`.

Prueba manual del arranque, sin cliente MCP (debe quedarse esperando en silencio; ciérralo con Ctrl+C):

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'; & "<PORTABLE>\LQTAC Voice Studio Electron.exe" "<PORTABLE>\resources\app\mcp\server.cjs"
```

Si aparece un error de Python, comprueba `resources\LQTAC_VS\runtime\.venv\Scripts\python.exe` (ver `mcp/manual/troubleshooting.md`).
