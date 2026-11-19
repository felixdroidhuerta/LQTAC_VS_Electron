# Voice Studio MCP

Este servidor permite a Codex o Claude consultar los motores reales de Voice Studio, elegir una voz con información comprobada, generar pruebas y producir narraciones listas para Cinema Studio.

## Regla principal

Antes de generar audio debe llamarse a `voice_catalog`. Nunca se debe inventar un motor, modelo, idioma, voz, perfil o formato.

## Orden recomendado

1. `voice_studio_status` para comprobar el runtime.
2. `voice_catalog` para conocer opciones instaladas.
3. Preguntar al usuario idioma, acento, voz o estilo solo cuando sean decisiones creativas no resueltas.
4. `voice_generate_audition` para crear una o varias muestras breves.
5. Pedir al usuario que elija cuando existan alternativas relevantes.
6. `voice_generate_narration` o `voice_generate_batch` para producir las tomas definitivas.
7. Entregar `audio_path`, `duration` y los datos `cinema` al MCP de Cinema Studio.

Cada audio genera un manifiesto JSON reproducible con texto, motor, voz, ajustes, duración, SHA-256 y posición prevista en el montaje.

