# Referencia de herramientas MCP

## Descubrimiento

`voice_studio_status` comprueba el runtime Python y las carpetas. `voice_catalog` devuelve motores, disponibilidad, modelos, idiomas, voces, acentos, perfiles y formatos. Usa `include_voices=false` para un resumen sin consultar por red las voces Edge; para elegir una voz Edge usa `engine=edge` e `include_voices=true`.

## Generación

- `voice_generate_audition`: prueba breve para comparar narradores.
- `voice_generate_narration`: toma definitiva con manifiesto para Cinema Studio.
- `voice_generate_batch`: trabajo asíncrono por escenas.
- `voice_job_status`: progreso y resultados del lote.

Los campos `cinema_project`, `scene_id`, `track_name`, `position_seconds` y `target_duration` relacionan la toma con el montaje.

## Clonación

`voice_list_clone_profiles` lista perfiles existentes. `voice_save_clone_profile` registra una muestra autorizada; la transcripción debe coincidir exactamente con el WAV y el agente debe confirmar que el usuario puede utilizar esa voz.

## Audio y texto

- `voice_analyze_audio`: duración y onda.
- `voice_render_audio`: recortes, volumen y efectos.
- `voice_convert_audio`: perfiles del catálogo.
- `voice_merge_audio`: concatenación o mezcla.
- `voice_split_audio`: división por segundos.
- `voice_transcribe`: Whisper.cpp o faster-whisper.

## Proyectos

- `voice_project_list` y `voice_project_read`: inventario y lectura TACVS.
- `voice_project_save`: exige `overwrite=true` para reemplazar.
- `voice_project_delete`: exige `confirm="BORRAR"` y solo actúa dentro de la carpeta local de proyectos.

El MCP no concede acceso general al equipo: su alcance se limita a Voice Studio, las rutas de audio indicadas y la carpeta local de proyectos.

