# Conectar Voice Studio MCP

El servidor se inicia con `VOICE_STUDIO_MCP.cmd`, situado junto al EXE portable. No necesita Node instalado: utiliza Electron como runtime.

## Claude Desktop

Configura una entrada equivalente usando la ruta absoluta:

```json
{
  "mcpServers": {
    "voice-studio": {
      "command": "C:\\ruta\\Voice_Studio_by_LQTAC\\VOICE_STUDIO_MCP.cmd"
    }
  }
}
```

## Codex

Añade un servidor MCP local `voice-studio`, transporte `stdio`, cuya orden sea la ruta absoluta de `VOICE_STUDIO_MCP.cmd`. La sintaxis del archivo puede variar según el cliente; también puede configurarse desde su administrador de MCP.

## Comprobación

Deben aparecer `voice_catalog`, `voice_generate_audition`, `voice_generate_narration`, `voice_generate_batch` y los recursos `voice-studio://manual/...`.

Si aparece un error de Python, comprueba `resources\LQTAC_VS\runtime\.venv\Scripts\python.exe`.

