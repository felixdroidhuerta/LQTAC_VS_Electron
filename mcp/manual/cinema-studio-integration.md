# Integración con Cinema Studio

El agente anfitrión coordina los MCP de Voice Studio y Cinema Studio. Los servidores permanecen independientes.

## Flujo seguro

1. Lee `cinema_project` y conserva su `revision`.
2. Identifica escenas, posiciones y duraciones disponibles.
3. Guarda una copia LQTS con `cinema_save` antes de sustituir un montaje existente.
4. Consulta `voice_catalog` y resuelve con el usuario las decisiones creativas.
5. Genera pruebas si la voz no está elegida.
6. Genera una toma por escena en WAV, incluyendo `scene_id`, `position_seconds` y `target_duration`.
7. Usa `cinema_import` con las rutas devueltas.
8. Lee nuevamente `cinema_project` si la revisión ha cambiado.
9. Usa `cinema_edit` para crear una pista de audio llamada `Narración` e insertar cada archivo en su posición.
10. Ajusta fundidos y niveles sin destruir los originales.
11. Guarda el LQTS y comprueba el resultado con `cinema_preview`.

## Sincronía

Compara `duration` con `target_duration`. Si la diferencia es pequeña, ajusta silencios o velocidad moderada. Si es grande, pide permiso para resumir/reformular el texto o modificar el montaje. Nunca cortes palabras para encajar una escena.

## Mezcla

La narración debe ir en una pista separada. Cuando haya música, aplica reducción de nivel durante la voz y fundidos breves en los bordes. Mantén los audios originales importados para permitir revisiones.

