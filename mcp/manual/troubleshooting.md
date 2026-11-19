# Diagnóstico

## No se encuentra Python

Comprueba `voice_studio_status`. El portable debe contener `resources/LQTAC_VS/runtime/.venv/Scripts/python.exe` o uno de los runtimes alternativos de `tools/python`.

## Un motor aparece no disponible

No intentes generarlo. Consulta `voice_catalog` y elige otro motor o informa al usuario del runtime/modelo que falta. Azure requiere clave y región. Edge y Matxa requieren Internet.

## La generación tarda

Qwen y los clonadores pueden cargar modelos grandes. En lotes usa `voice_generate_batch` y consulta `voice_job_status`; no reinicies el servidor mientras el trabajo esté activo.

## El audio no encaja en la escena

Consulta su duración real. Ajusta velocidad dentro de valores moderados o reformula el texto con autorización. Mantén el mismo motor, modelo y voz para conservar continuidad.

## Cinema Studio no encuentra el audio

Usa siempre la ruta absoluta `audio_path` devuelta por Voice Studio. Importa el archivo antes de insertarlo en una pista.

