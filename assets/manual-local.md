# LQTAC Voice Studio V1.14

## Novedades de V1.14

- STT local independiente con Whisper.cpp y faster-whisper, modelos Small multilingües en `data/stt`.
- Acceso mediante STT / Transcripción, después de IDTAG. Controles de motor, idioma y audio en el marco derecho; resultado editable en el central.
- Editor de transcripciones con fuente, tamaño, negrita, cursiva, subrayado y tachado sobre la selección.
- Exportación a DOCX conservando formato y a TXT sin formato.
- Detección automática de idioma explícita y ejecución con rutas relativas para Whisper.cpp.

Para usar STT, `data/stt` debe contener `bin/Release/whisper-cli.exe`, `models/ggml-small.bin`, `faster/bin/lqtac-faster-whisper.exe` con sus dependencias y `faster/models/small`. Cada distribución usa sus propios motores. El código fuente por sí solo no incluye los modelos binarios grandes.

LQTAC Voice Studio es una aplicacion local para Windows orientada a generar, clonar, editar, convertir y exportar locuciones de voz. La version V1.14 combina una interfaz de escritorio en Python con motores TTS, editor de forma de onda, proyectos portables `.tacvs`, presets de efectos FFmpeg, conversor de audio, perfiles de voz reutilizables, icono propio de aplicacion y splash de carga suave con arranque sin CMD mediante `INICIAR.vbs`.

El flujo principal es:

```text
Texto o audio externo -> Generacion / carga -> WAV limpio -> Edicion -> FX -> Exportacion final
```

La regla central de esta build es:

```text
Exportar = exactamente lo que se escucha con la edicion y los FX activos
```

---

## Indice

- [Resumen rapido](#resumen-rapido)
- [Requisitos](#requisitos)
- [Instalacion](#instalacion)
- [Inicio](#inicio)
- [Splash de carga y arranque sin CMD](#splash-de-carga-y-arranque-sin-cmd)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Arquitectura tecnica](#arquitectura-tecnica)
- [Interfaz principal](#interfaz-principal)
- [Motores de generacion](#motores-de-generacion)
- [Guia Azure Speech](GUIA_AZURE_SPEECH.md)
- [Clonador de voz](#clonador-de-voz)
- [Conversor de audio](#conversor-de-audio)
- [Editor de audio](#editor-de-audio)
- [Efectos FX](#efectos-fx)
- [Exportacion](#exportacion)
- [Proyectos TACVS](#proyectos-tacvs)
- [Perfiles de voz](#perfiles-de-voz)
- [Temporales, logs y datos persistentes](#temporales-logs-y-datos-persistentes)
- [Scripts incluidos](#scripts-incluidos)
- [Solucion de problemas](#solucion-de-problemas)
- [Mantenimiento y desarrollo](#mantenimiento-y-desarrollo)
- [Historial de version](#historial-de-version)

---

## Version Estable Actual

```text
LQTAC Voice Studio V1.14
```

Esta version parte de la V1.13.4 definitiva e incorpora splash de carga suave, arranque sin CMD mediante `INICIAR.vbs` y logs detallados de arranque. El comportamiento aceptado de proyectos, FX y exportacion se mantiene sin cambios.

---

## Resumen Rapido

### Que hace

- Genera voz con Edge TTS usando voces online de Microsoft.
- Genera voz local con Qwen TTS si esta instalado el entorno `runtime\.venv_qwen`.
- Genera voz local con MeloTTS y clona voces con OpenVoice V2 usando muestras WAV.
- Clona voz desde muestras WAV usando Qwen3 Base, OpenVoice V2 y una transcripcion de referencia.
- Carga audio externo y lo convierte a formatos utiles para comparticion, archivo o telefonia.
- Muestra una forma de onda interactiva.
- Permite seleccionar tramos, marcar recortes destructivos para exportacion, ecualizar y aplicar FX.
- Guarda sesiones editables como proyectos `.tacvs` con tomas sucesivas.
- Exporta audio final en MP3, WAV, formatos Asterisk y packs multiples.
- Arranca con splash de carga suave y puede iniciarse sin ventana CMD mediante `INICIAR.vbs`.

### Que no hace en esta build

- No implementa multipista.
- No genera salida G.729 codificada; puede aceptar `.g729` como entrada si FFmpeg lo decodifica.
- No integra todavia XTTS, Fish Speech, CosyVoice ni F5-TTS como motores activos del clonador, aunque el perfil maestro deja preparada su estructura.
- No aplica pitch manual post-generacion en FX manuales. El pitch fiable se ajusta antes de generar la voz o dentro de presets oficiales cerrados.

---

## Requisitos

### Sistema

- Windows 10/11 de 64 bits.
- PowerShell disponible.
- Espacio suficiente para entornos Python, modelos y dependencias.
- Conexion a internet durante la instalacion si no estan ya incluidos los instaladores/modelos necesarios.

### Dependencias locales esperadas

La aplicacion esta pensada para trabajar con herramientas locales dentro de la carpeta del programa:

```text
tools/ffmpeg/bin/ffmpeg.exe
tools/sox/sox.exe
runtime/.venv/Scripts/python.exe
runtime/.venv_qwen/Scripts/python.exe
```

Si falta el entorno principal, `INICIAR.bat` no arranca la app y pide ejecutar `INSTALAR.bat`.

Si falta FFmpeg, las operaciones de previsualizacion, conversion, waveform, FX y exportacion que dependen de FFmpeg muestran error claro.

Si falta Qwen local, las funciones de Qwen TTS y clonador muestran un aviso indicando que falta `runtime\.venv_qwen`.

---

## Instalacion

Ejecutar:

```bat
INSTALAR.bat
```

El instalador llama a:

```text
installers/install.ps1
```

### Que prepara el instalador

- Python 3.11 local en `tools\python\Python311`.
- Python 3.12 local en `tools\python\Python312`.
- Si la carpeta del proyecto esta en OneDrive o el instalador no puede escribirla, usa automaticamente `C:\Users\<usuario>\AppData\Local\LQTAC_VS\python\Python311` y `Python312` como respaldo por usuario.
- Puede usar instaladores Python ya incluidos en `tools\python\installers` o `downloads`; se comprueban tamano, cabecera PE y MD5 antes de ejecutarlos.
- Entorno principal `runtime\.venv`.
- Entorno Qwen `runtime\.venv_qwen`.
- Entorno MeloTTS/OpenVoice `runtime\.venv_melo`.
- Dependencias de UI, Edge TTS, Qwen y XTTS segun los `requirements`.
- Edge TTS se instala desde PyPI, sin exigir que Git este instalado en Windows.
- Checkpoints OpenVoice V2 en `runtime\openvoice\checkpoints_v2`.
- FFmpeg local en `tools\ffmpeg`.
- SoX local en `tools\sox`.
- Microsoft Visual C++ Redistributable x64 cuando hace falta para dependencias de audio.
- Log de instalacion en `logs\install.log`.

### Entornos creados

Azure Speech es un motor alternativo opcional que usa el SDK oficial de Microsoft.
La dependencia se instala junto con la interfaz y Edge TTS.

```text
runtime/.venv
```

Entorno principal de la aplicacion. Usa Python 3.11 e instala:

```text
customtkinter
pygame
edge-tts
sounddevice
soundfile
coqui-tts[codec]
torchcodec
transformers
```

```text
runtime/.venv_qwen
```

Entorno aislado para Qwen local. Usa Python 3.12 e instala:

```text
qwen-tts
soundfile
transformers
accelerate
huggingface-hub
```

### Instalacion parcial

El script PowerShell acepta parametros:

```powershell
installers\install.ps1 -SkipXTTS
installers\install.ps1 -SkipQwen
```

Esto sirve para preparar solo parte del entorno cuando se quiere reducir tiempo, evitar dependencias pesadas o depurar una instalacion.

---

## Inicio

### Arranque recomendado sin CMD

Ejecutar:

```text
INICIAR.vbs
```

Este es el arranque recomendado para uso normal. Muestra el splash de carga y lanza la aplicacion principal usando `pythonw.exe` cuando esta disponible, evitando que quede abierta una ventana de CMD.

### Arranque alternativo con BAT

Ejecutar:

```bat
INICIAR.bat
```

Sirve como fallback si se quiere arrancar de forma tradicional. Tambien anade al `PATH`:

```text
tools/ffmpeg/bin
tools/sox
```

### Arranque de depuracion

Ejecutar solo para diagnostico:

```bat
INICIAR_DEBUG.bat
```

Este modo deja trazas de arranque y sirve para detectar problemas si el splash no abre la app, si falta Python o si falla algun recurso local.

### Flujo de arranque V1.14

```text
INICIAR.vbs / INICIAR.bat
  -> app/launcher_splash.py
  -> comprobacion de entorno local
  -> splash de carga
  -> app/app_modern.py
  -> APP_READY
  -> cierre del splash
```

---

## Splash De Carga Y Arranque Sin CMD

La V1.14 incorpora un launcher previo:

```text
app/launcher_splash.py
```

Su funcion es mostrar una ventana de carga antes de crear la ventana principal. El splash mantiene la barra de progreso entre el 88% y el 99% hasta que la aplicacion principal escribe la marca de preparado:

```text
APP_READY
```

Cuando detecta que la ventana principal esta visible, marca el 100% y se cierra. Esto evita la sensacion de bloqueo entre el final del splash y la apertura real de la app.

### Logs de arranque

Cada arranque genera logs en:

```text
logs/startup_latest.log
logs/startup_YYYYMMDD_HHMMSS.log
logs/startup_vbs.log
logs/startup_debug_bat.log
```

`startup_latest.log` es el mas util para diagnostico rapido.

El log registra:

- Python usado.
- Carpeta base.
- Presencia de FFmpeg local.
- Presencia de SoX local.
- Carga del splash.
- Comando usado para lanzar `app_modern.py`.
- Estado de ventana principal.
- Marca `APP_READY`.

## Estructura Del Proyecto

```text
LQTAC_VS_V1.14/
  INICIAR.vbs
  INICIAR.bat
  INICIAR_DEBUG.bat
  INSTALAR.bat
  LIMPIAR_ENTORNOS.bat
  README.md

  app/
    app_modern.py
    launcher_splash.py
    qwen_local_generate.py
    melo_local_generate.py
    openvoice_local_generate.py

  config/
    requirements_ui.txt
    requirements_edge.txt
    requirements_qwen.txt
    requirements_xtts.txt
    requirements_melo.txt
    requirements_openvoice.txt
    voice_profiles.json

  data/
    assets/
      app_icon.ico
      app_icon_32.png
      app_icon_64.png
      app_icon_128.png
      app_icon_256.png
      lqtac_logo_header.png
      lqtac_voice_studio_logo.png
    effects_presets/
      megafonia.json
      radio_vieja.json
      robot_metalico.json
      robot_ochentero.json
    temp/
    voice_samples/
      Diego.wav
      Felix.wav
      Johnny_5.wav
      Mama.wav
      Nano.wav
      Sara_11Lab.wav

  downloads/
    vc_redist.x64.exe

  installers/
    install.ps1

  logs/
    install.log
    startup_latest.log
    startup_YYYYMMDD_HHMMSS.log
    startup_vbs.log
    startup_debug_bat.log

  runtime/
    .venv/
    .venv_qwen/

  tools/
    ffmpeg/
    sox/
    python/
```

### Carpetas importantes

`app/`

Contiene el codigo principal. `app_modern.py` es la aplicacion grafica completa. `qwen_local_generate.py` es el puente CLI que carga Qwen y genera WAV.

`config/`

Contiene requisitos Python y el fichero de perfiles de voz. `voice_profiles.json` es persistente y conviene conservarlo entre versiones.

`data/assets/`

Iconos y logos usados por la interfaz.

`data/effects_presets/`

Presets FX en JSON. Los presets oficiales incluyen filtros FFmpeg literales.

`data/temp/`

Audios temporales para previsualizacion, decodificacion, FX, waveform y exportacion intermedia. Se puede limpiar si la app esta cerrada.

`data/voice_samples/`

Muestras WAV para clonacion de voz. Esta carpeta es persistente.

`runtime/`

Entornos virtuales. Se pueden borrar y reconstruir con `LIMPIAR_ENTORNOS.bat` + `INSTALAR.bat`.

`tools/`

Herramientas portables: FFmpeg, SoX y Python local.

---

## Arquitectura Tecnica

### Lenguaje y GUI

- Python.
- CustomTkinter para la interfaz.
- Tkinter nativo para dialogos, menus y selectores de archivo.
- PIL/Pillow opcional para cargar imagenes y logos.
- Launcher separado `app/launcher_splash.py` para splash de carga y arranque sin CMD.

### Audio y reproduccion

- `pygame.mixer` para reproducir vistas previas.
- FFmpeg para decodificar, normalizar, aplicar filtros, recortar y exportar.
- SoX para ajustes de audio post-generacion cuando esta disponible.
- `wave` y lectura PCM para dibujar forma de onda.

### Motores TTS

- Edge TTS mediante `edge_tts`.
- MeloTTS local mediante `melotts` en el entorno aislado `runtime\.venv_melo`.
- Qwen local mediante `qwen_tts`.
- Clonacion Qwen mediante `generate_voice_clone`.

### Modelo de datos

- Perfiles de voz: JSON en `config/voice_profiles.json`.
- Presets FX: JSON en `data/effects_presets/`.
- Proyectos: JSON `.tacvs` con carpeta de assets asociada.

### Hilos

Las operaciones pesadas de generacion, conversion y exportacion se ejecutan en `threading.Thread(..., daemon=True)` para evitar bloquear la interfaz.

---

## Interfaz Principal

La ventana esta organizada en tres zonas:

### Panel izquierdo: Generacion TTS

Contiene el selector de motor:

- Edge TTS.
- MeloTTS.
- Qwen TTS.
- Clonador TTS.

Tambien existe un boton independiente de conversor de audio, porque convertir audio no es un motor TTS.

El panel puede colapsarse. Al colapsarlo aparece un rail lateral `TTS` para recuperarlo.

### Centro: Editor y reproductor

Incluye:

- Nombre del audio actual.
- Boton de carga de audio.
- Forma de onda interactiva.
- Reproductor con play, pausa, stop, posicion, volumen y velocidad.
- Herramienta de seleccion.
- Herramienta de corte.
- Campos de inicio y fin de seleccion.
- Indicadores de seleccion, recortes y FX activos.

### Panel derecho: FX y exportacion

Incluye:

- Selector de presets FX.
- Guardado de presets personalizados.
- Creacion de FX manual nuevo.
- Cadena de efectos.
- Sliders de intensidad, bitcrusher, eco y brillo metalico.
- Ecualizador.
- Formato de exportacion.
- Carpeta de salida.
- Boton `PREVIEW FX`.

El panel FX tambien se puede colapsar y recuperar mediante el rail `FX`.

### Barra superior

Incluye:

- Nuevo proyecto.
- Abrir proyecto.
- Guardar proyecto.
- Exportar.
- Selector de motor TTS.
- Boton de conversor audio.
- Ayuda.

---

## Motores De Generacion

## Edge TTS

Edge TTS usa `edge_tts` para listar voces y generar un MP3 temporal.

### Controles

- Filtro de voces, por defecto `es-`.
- Boton `Cargar voces`.
- Selector de voz.
- Preset expresivo.
- Velocidad.
- Tono.
- Volumen.
- Caja de texto.
- Escuchar vista previa.
- Guardar audio.
- Limpiar texto.

### Presets Edge

```text
Neutro
Alegre
Entusiasta
Triste
Intimo
Serio
Epico
Urgente
Calmado
```

Cada preset ajusta velocidad, tono y volumen. Luego el usuario puede afinar manualmente.

### Flujo interno

```text
Texto -> edge_tts.Communicate -> MP3 temporal -> ajuste de volumen -> preview/export
```

Si se exporta a un formato distinto, FFmpeg convierte el temporal al perfil seleccionado.

## Azure Speech

En la aplicación, elige Azure Speech e introduce la clave del recurso Speech, su región
(por ejemplo westeurope) y el nombre de voz (por ejemplo es-ES-ElviraNeural).

También se pueden cargar desde las variables de entorno SPEECH_KEY, SPEECH_REGION y
AZURE_SPEECH_VOICE. La clave se mantiene solo en memoria durante la sesión y no se
guarda en proyectos .tacvs.

La guía completa para crear el recurso, obtener `KEY 1`/`KEY 2` y localizar la región está en:

[GUIA_AZURE_SPEECH.md](GUIA_AZURE_SPEECH.md)

Enlace directo para solicitar/crear el recurso:

[Crear recurso Azure AI Speech](https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices)

## MeloTTS Local

MeloTTS es un motor local gratuito con voz española y sin cuota de uso. Se instala
en un entorno separado para no interferir con Qwen, XTTS o Azure:

```text
runtime/.venv_melo/Scripts/python.exe
```

El puente de generación es:

```text
app/melo_local_generate.py
```

La primera generación puede tardar más porque el motor prepara o descarga sus
modelos. Después funciona sin conexión. El selector permite elegir idioma, voz,
velocidad y aplicar los ajustes generales de tono y volumen.

## OpenVoice V2 Local

OpenVoice V2 aparece dentro del panel `Clonador TTS`. Para usarlo:

1. Crea o selecciona un perfil con un WAV de referencia y su transcripción.
2. En `Motor/modelo para generar`, selecciona `OpenVoice V2`.
3. Escribe el texto y pulsa `Escuchar` o `Guardar`.

El flujo local es:

```text
Texto -> MeloTTS base -> OpenVoice V2 tone color converter -> WAV -> ajustes/exportacion
```

OpenVoice V2 necesita los checkpoints en `runtime/openvoice/checkpoints_v2`. `INSTALAR.bat` los descarga automáticamente cuando no están presentes.

## Qwen TTS Local

Qwen TTS genera audio local desde el entorno:

```text
runtime/.venv_qwen/Scripts/python.exe
```

El script puente es:

```text
app/qwen_local_generate.py
```

### Voces integradas

```text
serena
ryan
dylan
aiden
eric
ono_anna
sohee
uncle_fu
vivian
```

### Idiomas disponibles

```text
Auto
Spanish
English
Portuguese
French
Italian
German
Chinese
Japanese
Korean
Russian
```

### Modelo por defecto

```text
Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice
```

### Controles

- Voz.
- Idioma.
- Modelo Hugging Face.
- Instruccion opcional.
- Velocidad.
- Tono.
- Volumen.
- Texto.
- Escuchar.
- Guardar.

### Flujo interno

```text
Texto -> qwen_local_generate.py -> Qwen3TTSModel.generate_custom_voice -> WAV temporal -> ajustes -> preview/export
```

El puente selecciona automaticamente:

- `cuda:0` si hay CUDA.
- `cpu` si no hay GPU disponible.
- `bfloat16` si CUDA lo soporta.
- `float16` en CUDA sin BF16.
- `float32` en CPU.

---

## Clonador De Voz

El clonador crea perfiles maestros de voz a partir de una muestra WAV y una transcripcion de referencia.

### Motores activos

En esta versión los motores operativos reales del clonador son:

```text
Qwen3 Base
OpenVoice V2
```

Modelo por defecto:

```text
Qwen/Qwen3-TTS-12Hz-0.6B-Base
```

### Motores preparados pero no integrados

El perfil maestro guarda estructura para:

```text
XTTS
Fish Speech
CosyVoice
F5-TTS
```

Estos aparecen como motores previstos, pero la build Lite no los ejecuta todavía. Si se elige uno de los motores no integrados, la aplicacion informa que esta preparado en el perfil pero no disponible en esta version.

### Crear perfil de voz

1. Escribir nombre del perfil.
2. Elegir idioma.
3. Seleccionar un WAV de referencia.
4. Escribir la transcripcion exacta o aproximada del WAV.
5. Pulsar `Guardar perfil`.

La muestra se copia a:

```text
data/voice_samples/<nombre_seguro>.wav
```

El perfil se guarda en:

```text
config/voice_profiles.json
```

### Usar perfil de voz

1. Seleccionar perfil guardado.
2. Seleccionar motor: `Qwen3 Base` u `OpenVoice V2`.
3. Elegir preset emocional.
4. Ajustar velocidad, tono y volumen.
5. Escribir texto.
6. Escuchar o guardar.

### Presets emocionales del clonador

El clonador reutiliza los presets de expresion tipo Edge. Algunos presets decoran el texto antes de mandarlo al motor:

- `Intimo`: suaviza pausas usando puntos suspensivos.
- `Triste`: introduce saltos de linea despues de puntos.
- `Epico`: anade una frase de enfasis al final.

---

## Conversor De Audio

El conversor permite cargar audio externo y exportarlo a los perfiles disponibles.

### Formatos aceptados como entrada

```text
wav
mp3
m4a
aac
ogg
flac
ulaw
alaw
sln
sln16
g729
```

La capacidad real depende de FFmpeg.

### Controles

- Seleccionar archivo.
- Nombre base de salida.
- Previsualizar.
- Convertir.

### Flujo interno

```text
Audio externo -> FFmpeg -> WAV temporal -> exportacion al perfil seleccionado
```

Si se elige `MP3 original` pero la entrada no es MP3, la aplicacion evita crear un falso MP3 y convierte a `MP3 estandar universal`.

---

## Editor De Audio

### Forma de onda

La clase `WaveformCanvas` dibuja la onda de audio y gestiona:

- Cursor de reproduccion.
- Seleccion de tramo.
- Marcado de recortes.
- Visualizacion de recortes en rojo.
- Menu contextual para descartar recortes.

### Herramientas

`Seleccionar`

Permite marcar un rango de audio. La seleccion puede sincronizarse con los campos de inicio y fin.

`Cortar`

Marca un tramo para eliminarlo en la exportacion. El recorte no destruye el audio original inmediatamente.

`Eliminar` / `Deshacer`

Elimina el ultimo recorte marcado.

### Reproductor

El reproductor permite:

- Play.
- Pausa.
- Stop.
- Seek.
- Volumen.
- Velocidad de escucha.

La velocidad de escucha se aplica para previsualizacion. La exportacion con ajustes aplica seleccion, recortes, EQ y FX, pero no usa la velocidad del reproductor como transformacion final del archivo.

### Seleccion y recortes

La exportacion puede:

1. Tomar solo el tramo seleccionado.
2. Eliminar recortes marcados dentro de ese tramo.
3. Aplicar EQ.
4. Aplicar FX si hay filtro activo.
5. Convertir al formato de salida.

---

## Efectos FX

Los FX se basan en filtros FFmpeg.

### Presets oficiales cerrados

Los presets oficiales usan literalmente el campo `ffmpeg_filter` del JSON. No se reinterpretan con sliders, porque eso fue una fuente de inestabilidad en builds anteriores.

Presets incluidos:

```text
Robot ochentero
Robot metalico
Radio vieja
Megafonia
```

### Robot Ochentero

Archivo:

```text
data/effects_presets/robot_ochentero.json
```

Filtro:

```text
highpass=f=120,equalizer=f=2500:t=q:w=1:g=7,acrusher=bits=8:mix=0.55,aecho=0.8:0.88:45:0.35
```

### Robot Metalico

Archivo:

```text
data/effects_presets/robot_metalico.json
```

Filtro:

```text
highpass=f=150,equalizer=f=1800:t=q:w=1:g=5,equalizer=f=3600:t=q:w=1:g=6,acrusher=bits=7:mix=0.65,acompressor=threshold=-20dB:ratio=5:attack=10:release=120,aecho=0.75:0.82:35:0.28
```

### Radio Vieja

Archivo:

```text
data/effects_presets/radio_vieja.json
```

Filtro:

```text
highpass=f=350,lowpass=f=3400,equalizer=f=1200:t=q:w=1:g=5,acompressor=threshold=-18dB:ratio=4:attack=20:release=200
```

### Megafonia

Archivo:

```text
data/effects_presets/megafonia.json
```

Filtro:

```text
highpass=f=250,lowpass=f=4500,equalizer=f=2200:t=q:w=1:g=6,acompressor=threshold=-16dB:ratio=6:attack=8:release=160,aecho=0.7:0.78:28:0.22
```

### FX manual

El modo `Ninguno` permite crear una cadena editable:

- Robot.
- Bitcrusher.
- Echo.
- EQ.

Sliders:

- Mezcla / Intensidad.
- Bitcrusher, de 16 limpio a 4 bits.
- Eco, de 0 a 120 ms.
- Brillo metalico, de -6 a +12 dB.

El pitch post-generacion esta desactivado por estabilidad. El mensaje visible en la UI recuerda usar el control `Tono` antes de generar.

### Presets personalizados

El boton `Guardar` guarda un preset JSON nuevo en:

```text
data/effects_presets/
```

El preset personalizado puede incluir:

- `id`.
- `name`.
- `description`.
- `engine`.
- `ffmpeg_filter`.
- `chain`.
- `chain_enabled`.
- `sliders`.

---

## Exportacion

La exportacion se hace desde el boton superior `Exportar` o desde los botones de guardado de cada motor.

### Perfiles de salida

```text
MP3 estandar universal 44.1kHz 128kbps stereo
WAV estandar universal 44.1kHz 16-bit stereo
Pack universal MP3 + WAV estandar
MP3 original
MP3 24kHz 96kbps mono
MP3 48kHz 192kbps mono
WAV PCM 8kHz mono
WAV PCM 16kHz mono
WAV PCM 24kHz mono
Asterisk ULAW 8kHz
Asterisk ALAW 8kHz
Asterisk SLN 8kHz
Asterisk SLN16 16kHz
Pack Asterisk
```

### Perfil recomendado

Para compartir por WhatsApp, movil, navegador y reproductores comunes:

```text
MP3 estandar universal 44.1kHz 128kbps stereo
```

Para archivo editable o maxima compatibilidad sin perdida MP3:

```text
WAV estandar universal 44.1kHz 16-bit stereo
```

### Packs

`Pack universal MP3 + WAV estandar`

Genera dos archivos:

- MP3 44.1 kHz, stereo, 128 kbps.
- WAV PCM 16-bit, 44.1 kHz, stereo.

`Pack Asterisk`

Genera varios formatos orientados a centralitas:

- WAV 8 kHz mono.
- ULAW 8 kHz.
- ALAW 8 kHz.
- SLN 8 kHz.
- SLN16 16 kHz.

### Orden de procesado al exportar desde el editor

```text
Audio actual
  -> seleccion, si existe
  -> eliminacion de recortes marcados
  -> ecualizador, si esta activo
  -> FX, si hay filtro activo
  -> conversion FFmpeg al perfil seleccionado
```

---

## Proyectos TACVS

La extension de proyecto es:

```text
.tacvs
```

Significado:

```text
TengoAquiColgado Voice Studio
```

Un proyecto `.tacvs` es un JSON portable que debe mantenerse junto a su carpeta de assets.

### Estructura generada

Si se crea:

```text
MiProyecto.tacvs
```

se genera:

```text
MiProyecto_assets/
  takes/
    take_001/
      clean.wav
    take_002/
      clean.wav
  exports/
```

### Que guarda el `.tacvs`

- Nombre de aplicacion.
- Formato `tacvs`.
- Version de formato.
- Version de app.
- Nombre del proyecto.
- Fecha de creacion.
- Fecha de actualizacion.
- Toma activa.
- Lista de tomas.
- Ruta relativa del audio limpio de cada toma.
- Estado TTS.
- Texto usado.
- Voz, idioma, modelo o perfil.
- Recortes.
- FX.
- EQ.

### Guardar proyecto

En V1.14, `Guardar proyecto` crea una nueva toma/snapshot si hay audio activo.

Esto significa:

```text
Guardar proyecto = conservar el estado actual como nueva toma
Exportar = crear el audio final entregable
```

### Abrir proyecto

Al abrir un `.tacvs`:

1. Se valida que `project_format` sea `tacvs`.
2. Se localiza la carpeta `*_assets`.
3. Se carga la toma activa si existe.
4. Se restaura audio, recortes y FX.
5. Si no hay tomas, se informa que el proyecto no tiene audio recuperable.

### Rutas portables

Las rutas de audio se guardan relativas al directorio del `.tacvs`, por lo que se puede mover el proyecto siempre que se mantengan juntos:

```text
MiProyecto.tacvs
MiProyecto_assets/
```

---

## Perfiles De Voz

Los perfiles se guardan en:

```text
config/voice_profiles.json
```

### Formato actual

La app normaliza perfiles al esquema:

```text
lqtac_voice_profile_v2
```

Cada perfil puede incluir:

- `name`.
- `sample`.
- `reference_audio`.
- `language`.
- `accent`.
- `ref_text`.
- `reference_text`.
- `style`.
- `engines`.

### Motor Qwen en el perfil

La clave activa para Qwen es:

```text
qwen3_base
```

Incluye:

- `enabled`.
- `engine`.
- `model`.
- `sample`.
- `ref_audio`.
- `ref_text`.

### Rutas portables

Las muestras internas se guardan con rutas relativas:

```text
data/voice_samples/Felix.wav
```

La app tambien acepta rutas antiguas absolutas y variables:

```text
${LQTAC_ROOT}/...
%LQTAC_ROOT%/...
```

### Perfiles incluidos

Esta build incluye muestras WAV y perfiles para:

```text
Johnny 5
Nano
Mama
Felix
Diego
```

Tambien existe la muestra:

```text
Sara_11Lab.wav
```

---

## Temporales, Logs Y Datos Persistentes

### Se puede borrar

Con la app cerrada, normalmente se puede limpiar:

```text
data/temp/
logs/
runtime/.venv/
runtime/.venv_qwen/
```

Los entornos `runtime` se reconstruyen con `INSTALAR.bat`.

### Conviene conservar

```text
config/voice_profiles.json
data/voice_samples/
data/effects_presets/
```

Si se migra a una version nueva, lo mas seguro es copiar solo:

```text
config/voice_profiles.json
data/voice_samples/
```

Y revisar manualmente los presets personalizados de:

```text
data/effects_presets/
```

---

## Scripts Incluidos

## INICIAR.vbs

Arranque recomendado para usuario final.

Lanza la aplicacion sin dejar visible una ventana CMD. Internamente ejecuta el launcher:

```text
app/launcher_splash.py
```

y este lanza despues:

```text
app/app_modern.py
```

## INICIAR.bat

Arranque alternativo y fallback.

Prepara `PATH` con herramientas locales:

```text
tools/ffmpeg/bin
tools/sox
```

Despues lanza el launcher de splash usando el Python del entorno principal.

## INICIAR_DEBUG.bat

Arranque de diagnostico.

Genera trazas adicionales en:

```text
logs/startup_debug_bat.log
```

Usarlo solo cuando el arranque normal falle o se necesite ver que paso antes de abrir la app.

## INSTALAR.bat

Lanza el instalador PowerShell:

```text
installers/install.ps1
```

Prepara Python local, entornos virtuales, dependencias, FFmpeg, SoX y VC++ Redistributable.

El instalador oficial de Python se ejecuta sin privilegios de administrador. Si no logra crear `python.exe` dentro de `tools\python` (algo que puede ocurrir en carpetas sincronizadas por OneDrive), reintenta en la carpeta local del usuario y deja el detalle de cada intento en `logs\install.log` y `logs\python-*-installer.log`.

## LIMPIAR_ENTORNOS.bat

Borra:

```text
runtime/.venv
runtime/.venv_qwen
```

No borra:

```text
config/voice_profiles.json
data/voice_samples
```

---

## Solucion De Problemas

### Al abrir dice que no existe el entorno principal

Ejecutar:

```bat
INSTALAR.bat
```

Si falla, revisar:

```text
logs/install.log
```

### FFmpeg no encontrado

Comprobar:

```text
tools/ffmpeg/bin/ffmpeg.exe
```

Si no existe, ejecutar `INSTALAR.bat`. El instalador intenta usar recursos locales/offline primero y despues descargar FFmpeg si hace falta.

### SoX no encontrado

Comprobar:

```text
tools/sox/sox.exe
```

Qwen y algunos ajustes de audio pueden necesitarlo. Ejecutar `INSTALAR.bat` para reconstruirlo.

### Qwen local no instalado

Comprobar:

```text
runtime/.venv_qwen/Scripts/python.exe
app/qwen_local_generate.py
```

Si falta el entorno:

```bat
INSTALAR.bat
```

O instalar solo Qwen evitando rehacer XTTS:

```powershell
installers\install.ps1 -SkipXTTS
```

### Edge TTS no carga voces

Comprobar:

- Conexion a internet.
- Que `edge-tts` esta instalado en `runtime\.venv`.
- Que el filtro no sea demasiado restrictivo.

Prueba con filtro:

```text
es-
```

### El proyecto abre pero no reproduce audio

Puede pasar si el `.tacvs` antiguo no contiene tomas o referencias validas.

Comprobar que existe:

```text
<Proyecto>_assets/takes/take_001/clean.wav
```

Si `takes` esta vacio dentro del `.tacvs`, ese proyecto no contiene audio recuperable. V1.14 evita que vuelva a ocurrir en proyectos nuevos.

### WhatsApp rechaza un MP3

Usar:

```text
MP3 estandar universal 44.1kHz 128kbps stereo
```

Evitar `MP3 original` si el audio original viene de un motor que produce MPEG/24 kHz poco compatible.

### El pitch de FX no aparece

Es intencionado. El pitch post-generacion fue desactivado por estabilidad. Usar `Tono` antes de generar la voz.

### El splash aparece pero no abre la app

Revisar:

```text
logs/startup_latest.log
```

Buscar especialmente:

```text
APP_READY
state=normal
mapped=1
```

Si aparece `state=withdrawn` o `mapped=0`, la aplicacion se ha creado pero la ventana principal no se ha mostrado correctamente.

### El splash llega al 100% demasiado pronto

En V1.14 el 100% debe coincidir con `APP_READY`. Si no ocurre, revisar:

```text
logs/startup_latest.log
```

y comprobar si el launcher esta detectando correctamente la marca `APP_READY`.

### Se abre una ventana CMD

Para uso normal abrir siempre:

```text
INICIAR.vbs
```

`INICIAR.bat` e `INICIAR_DEBUG.bat` pueden mostrar consola porque son arranques alternativos o de diagnostico.

### Caracteres raros en algunos textos

Algunos textos historicos de la app o README anterior parecen haber pasado por una codificacion incorrecta. El codigo funcional usa UTF-8 para leer y escribir JSON, pero si se ven caracteres raros en textos antiguos conviene reescribirlos en UTF-8 limpio.

---

## Mantenimiento Y Desarrollo

### Punto de entrada

```text
app/app_modern.py
```

La clase principal es:

```python
class App(ctk.CTk)
```

La forma de onda esta en:

```python
class WaveformCanvas(ctk.CTkCanvas)
```

El puente de Qwen esta en:

```text
app/qwen_local_generate.py
```

El launcher de splash esta en:

```text
app/launcher_splash.py
```

### Constantes importantes

```python
APP_NAME = "LQTAC Voice Studio V1.14"
CONFIG_DIR = BASE_DIR / "config"
DATA_DIR = BASE_DIR / "data"
RUNTIME_DIR = BASE_DIR / "runtime"
TOOLS_DIR = BASE_DIR / "tools"
PROFILES_FILE = CONFIG_DIR / "voice_profiles.json"
TEMP_DIR = DATA_DIR / "temp"
VOICE_SAMPLES_DIR = DATA_DIR / "voice_samples"
EFFECT_PRESETS_DIR = DATA_DIR / "effects_presets"
```

### Contratos importantes

1. Los presets oficiales FX deben usar su `ffmpeg_filter` literal.
2. La exportacion final debe aplicar lo que se escucha: seleccion, recortes, EQ y FX.
3. Los perfiles de voz deben guardar rutas portables cuando el audio esta dentro del proyecto.
4. `Guardar proyecto` debe crear toma nueva si hay audio activo.
5. `Exportar` no debe confundirse con `Guardar proyecto`.
6. El pitch manual post-generacion debe permanecer desactivado salvo que se rediseñe con una estrategia estable.
7. El splash no debe marcar 100% hasta que la app principal confirme `APP_READY`.

### Archivos que no conviene versionar como estado final

```text
runtime/
data/temp/
logs/
__pycache__/
```

### Archivos que si representan configuracion o assets

```text
config/requirements_*.txt
config/voice_profiles.json
data/assets/
data/effects_presets/
data/voice_samples/
app/
```

---



---

## Instalador Windows Hibrido

La rama de instalador profesional de V1.14 incluye un script de Inno Setup:

```text
LQTAC_Voice_Studio_Setup_V1.14.iss
```

Y un compilador asistido:

```bat
CREAR_INSTALADOR.bat
```

El instalador generado crea una instalacion por usuario en:

```text
%LOCALAPPDATA%\LQTAC\LQTAC Voice Studio
```

La decision de instalar en LocalAppData evita problemas de permisos con `Program Files`, porque Voice Studio necesita escribir en:

```text
logs/
runtime/
data/temp/
config/voice_profiles.json
data/effects_presets/
```

El instalador crea accesos directos con icono propio y usa `INICIAR.vbs` para mantener el arranque sin ventana CMD.

La preparacion de dependencias se mantiene en `INSTALAR.bat` y puede ejecutarse al finalizar la instalacion si el usuario marca la opcion correspondiente.

## Historial De Version

### V1.1

Base inicial con TTS, reproductor, waveform, recortes, FFmpeg/SoX local y FX basicos.

### V1.11

Rework visual: panel de TTS lateral, editor central, panel FX lateral, paneles colapsables y exportacion unificada.

### FIX1-FIX5

Correcciones progresivas de UI, colapsado, redimensionado, cadena FX y sliders.

### FIX6 LOGO

Integracion de logo en la UI.

### FIX9 FX STABLE

Intento de estabilizacion de FX. Todavia mezclaba presets oficiales con logica editable.

### FIX10 FX PRESETS OFICIALES

Separacion real:

- Presets oficiales con `ffmpeg_filter` literal.
- Modo manual con sliders y cadena editable.

### FIX11 LIMPIO

Limpieza de distribucion:

- Documentacion centralizada en `README.md`.
- Eliminacion de documentos antiguos dispersos.
- Eliminacion de BAT duplicado.
- Limpieza de backups y `__pycache__`.

### FIX12 PITCH FINO

Intento de suavizar pitch manual post-generacion con rango fino.

### V1.12 / FIX13

Decision estable: eliminar pitch manual de FX post-generacion. El pitch queda antes de generar audio o dentro de presets oficiales cerrados.

### V1.13

Primera version de proyectos `.tacvs` con tomas y assets portables.

### V1.13.2

Correcciones de guardado/apertura de proyectos:

- Registrar toma si hay audio cargado.
- Informar proyectos sin tomas.
- Reproducir audios de proyecto normalizandolos temporalmente a WAV PCM si hace falta.

### V1.13.3

`Guardar proyecto` crea tomas sucesivas:

```text
take_001
take_002
take_003
```

### V1.13.4

Cambios principales:

- Icono propio de aplicacion.
- Iconos PNG en varios tamanos.
- Aplicacion de icono en ventana principal y ventana Acerca de.
- Carga de logos como `CTkImage`.
- Selector desplegable de motores TTS.
- Conversor de audio separado de motores TTS.
- Rail lateral `TTS` al colapsar panel de generacion.
- Etiqueta visible de version corregida a V1.13.4.

### V1.14

Cambios principales:

- Splash de carga suave.
- Arranque sin CMD mediante `INICIAR.vbs`.
- Logs detallados de arranque.
- README completo actualizado.
- AppUserModelID de Windows para que el icono propio se muestre correctamente en la barra de tareas cuando se arranca con `pythonw.exe`/VBS.


Base estable actual.

Cambios principales:

- Conserva la V1.13.4 definitiva.
- Anade splash de carga suave previo a la app principal.
- Arranque sin CMD mediante `INICIAR.vbs`.
- Launcher separado en `app/launcher_splash.py`.
- Logs detallados de arranque en `logs/startup_latest.log` e historicos `startup_YYYYMMDD_HHMMSS.log`.
- El splash espera a `APP_READY` antes de cerrar y marcar 100%.
- No cambia motores TTS, FX, proyectos ni exportacion respecto a la base estable aceptada.

---

## Copia Segura Para Migrar A Otra Carpeta

Para mover la instalacion completa, copiar la carpeta entera:

```text
LQTAC_VS_V1.14/
```

Para migrar solo voces y perfiles a una version limpia:

```text
config/voice_profiles.json
data/voice_samples/
```

Para migrar proyectos:

```text
MiProyecto.tacvs
MiProyecto_assets/
```

Mantener siempre juntos el `.tacvs` y su carpeta `*_assets`.
