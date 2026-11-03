# Voice Studio by LQTAC - Electron

Repositorio independiente: `felixdroidhuerta/LQTAC_VS_Electron`.

## Descargar el portable

La distribución Windows está en **Releases**, con Electron, el backend Python, herramientas y modelos STT incluidos. No se incluyen proyectos, grabaciones ni perfiles personales de clonación. Para clonar una voz, crea tu propio perfil dentro de la aplicación.

Si la descarga aparece dividida en partes, descarga todas las partes y el script de reconstrucción a la misma carpeta. Ejecuta el script para reconstruir el ZIP y después extrae su contenido completo. Abre `LQTAC Voice Studio Electron.exe` dentro de la carpeta extraída. Edge TTS necesita conexión a Internet; STT usa los motores locales incluidos.

El código fuente no contiene los runtimes ni los modelos binarios grandes: esos componentes se distribuyen en la Release. Para desarrollo, instala dependencias con `pnpm install` y prepara el backend Python descrito debajo.

Migración de Voice Studio desde CustomTkinter hacia Electron, con edición de audio local y portable.

## Arquitectura

- Electron controla la ventana y la nueva UI HTML/CSS/JS.
- `preload.cjs` expone una API mínima y segura al renderer.
- `backend/voice_bridge.py` mantiene un puente JSON-lines con el runtime Python original.
- Durante desarrollo, el runtime original se resuelve automáticamente en `..\LQTAC_VS`.
- El logo actualizado vive en `assets/lqtac_voice_studio_logo.png`.

## Arranque

```powershell
pnpm install
pnpm start
```

También se puede indicar otra ubicación del proyecto Python:

```powershell
$env:LQTAC_VOICE_SOURCE_ROOT = 'C:\ruta\a\LQTAC_VS'
pnpm start
```

## Estado de la migración

La interfaz incluye generación Edge con controles deslizantes de velocidad, tono y volumen; clonación local con perfiles Qwen3 Base/OpenVoice V2; forma de onda real en vista previa y editor; cursor de posición; selección; recortes; división con `S`; reproducción de selección; FX configurables; fusión; conversión; IDTAG y carátula. Las operaciones de audio se ejecutan con FFmpeg dentro del runtime portable.

## Versión portable

Para crear una carpeta que no requiera instalar Electron ni Python en el equipo destino, ejecuta `CREAR_PORTABLE_LQTAC_VOICE_STUDIO.bat` o:

```powershell
pnpm install
powershell -ExecutionPolicy Bypass -File .\BUILD_PORTABLE.ps1
```

El resultado se genera fuera del proyecto, en `Documents\LQTAC_Voice_Studio_Electron_Portable_v0.1.0`. Copia la carpeta completa y ejecuta `INICIAR_LQTAC_VOICE_STUDIO.bat`.

Si ya existe el portable y solo quieres aplicar cambios de UI o lógica, ejecuta `ACTUALIZAR_PORTABLE_LQTAC_VOICE_STUDIO.bat`; no vuelve a copiar los modelos pesados.
