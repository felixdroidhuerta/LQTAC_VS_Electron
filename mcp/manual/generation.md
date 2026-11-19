# Generación y revisiones

## Pruebas

`voice_generate_audition` produce una muestra y su manifiesto. Usa un fragmento representativo, preferiblemente de 5 a 15 segundos. Conserva exactamente el mismo texto al comparar voces.

## Narración definitiva

`voice_generate_narration` necesita como mínimo `text` y `engine`. Deben indicarse también `voice` e `language` cuando el motor los utilice. `output_profile=wav` es la opción recomendada para montaje; MP3 es apropiado para entrega ligera.

Los campos `cinema_project`, `scene_id`, `track_name`, `position_seconds` y `target_duration` se copian al manifiesto para coordinar el montaje.

## Escenas

`voice_generate_batch` inicia un trabajo y devuelve `job_id`. Coloca la configuración común en `defaults` y el texto/posición de cada toma en `scenes`. Consulta `voice_job_status` hasta `completed`, `completed_with_errors` o `failed`.

## Revisiones

No sobrescribas audios anteriores. El servidor crea nombres incrementales. Para cambiar una frase, genera una nueva toma con el mismo `scene_id`; Cinema Studio puede sustituir el clip conservando la posición y mantener el archivo anterior para volver atrás.

