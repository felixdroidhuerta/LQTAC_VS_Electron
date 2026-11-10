"""Puente local inicial entre Electron y los motores Python de Voice Studio.

La primera fase solo valida el runtime y expone el contrato JSON-lines.
Los comandos de generación se añadirán aquí sin importar la UI CustomTkinter.
"""

from __future__ import annotations

import json
import os
import sys
import asyncio
import re
import time
import math
import struct
import subprocess
import shutil
from pathlib import Path


SOURCE_ROOT = Path(os.environ.get("LQTAC_SOURCE_ROOT", Path(__file__).resolve().parents[2] / "LQTAC_VS"))
OUTPUT_ROOT = Path(os.environ.get("LQTAC_VOICE_OUTPUT_ROOT", Path(__file__).resolve().parents[1] / "data" / "outputs"))
STT_ROOT = Path(os.environ.get("LQTAC_STT_ROOT", Path(__file__).resolve().parents[1] / "data" / "stt"))
PROFILES_FILE = SOURCE_ROOT / "config" / "voice_profiles.json"
QWEN_SPEAKERS = ["serena", "ryan", "dylan", "aiden", "eric", "ono_anna", "sohee", "uncle_fu", "vivian"]
QWEN_LANGUAGES = ["Auto", "Spanish", "English", "Portuguese", "French", "Italian", "German", "Chinese", "Japanese", "Korean", "Russian"]
MELO_LANGUAGES = ["Español", "English", "Français", "中文", "日本語", "한국어"]
MATXA_SPEAKERS = {"balear": ["quim", "olga"], "central": ["grau", "elia"], "nord-occidental": ["pere", "emma"], "valencia": ["lluc", "gina"]}


def python_candidates() -> list[Path]:
    return [
        SOURCE_ROOT / "runtime" / ".venv" / "Scripts" / "python.exe",
        SOURCE_ROOT / "tools" / "python" / "Python311" / "python.exe",
        SOURCE_ROOT / "tools" / "python" / "Python312" / "python.exe",
    ]


def status() -> dict:
    return {
        "source_root": str(SOURCE_ROOT),
        "source_root_exists": SOURCE_ROOT.exists(),
        "python_runtime": next((str(path) for path in python_candidates() if path.exists()), None),
        "assets_exists": (SOURCE_ROOT / "data" / "assets").exists(),
        "profiles_exists": (SOURCE_ROOT / "config" / "voice_profiles.json").exists(),
        "output_root": str(OUTPUT_ROOT),
        "engines": [
            {"id": "edge", "name": "Edge TTS", "state": "ready"},
            {"id": "azure", "name": "Azure Speech", "state": "ready"},
            {"id": "qwen", "name": "Qwen TTS", "state": "available"},
            {"id": "melo", "name": "MeloTTS", "state": "available"},
            {"id": "matxa", "name": "Matxa alVoCat CA", "state": "available"},
            {"id": "openvoice", "name": "OpenVoice V2", "state": "available"},
        ],
    }


def list_edge_voices() -> list[dict]:
    import edge_tts

    voices = asyncio.run(edge_tts.list_voices())
    return [
        {
            "short_name": item.get("ShortName"),
            "locale": item.get("Locale"),
            "gender": item.get("Gender"),
            "friendly_name": item.get("FriendlyName"),
        }
        for item in voices
        if item.get("ShortName")
    ]


def safe_output_name(value: str | None) -> str:
    value = (value or "voice_render").strip()
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return (value or "voice_render")[:80]


def ffmpeg_executable() -> Path:
    candidates = [
        SOURCE_ROOT / "tools" / "ffmpeg" / "bin" / "ffmpeg.exe",
        SOURCE_ROOT / "tools" / "ffmpeg" / "ffmpeg.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("No se encuentra FFmpeg dentro del runtime portable.")


def audio_path(value: str | None) -> Path:
    if not value:
        raise ValueError("Falta el archivo de audio.")
    path = Path(value).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"No existe el audio: {path}")
    return path


def output_file(name: str, extension: str = ".mp3") -> Path:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    suffix = extension if str(extension).startswith(".") else f".{extension}"
    return OUTPUT_ROOT / f"{safe_output_name(name)}_{int(time.time() * 1000)}{suffix}"


def parse_percent(value: object, default: float = 0.0) -> float:
    try:
        raw = str(value if value is not None else default).strip().replace("%", "").replace("+", "")
        return max(-90.0, min(200.0, float(raw)))
    except Exception:
        return default


def clone_profiles() -> dict:
    if not PROFILES_FILE.exists():
        return {}
    try:
        data = json.loads(PROFILES_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception as error:
        raise RuntimeError(f"No se pudieron leer los perfiles de voz: {error}")


def clone_profile_path(value: object) -> Path:
    path = Path(str(value or ""))
    if not path.is_absolute():
        path = SOURCE_ROOT / path
    return path.resolve()


def list_clone_profiles() -> list[dict]:
    result = []
    for name, profile in clone_profiles().items():
        profile = profile if isinstance(profile, dict) else {}
        sample = profile.get("sample") or profile.get("reference_audio") or ""
        result.append({"name": name, "language": profile.get("language") or "es", "sample": str(clone_profile_path(sample)) if sample else "", "reference_text": profile.get("ref_text") or profile.get("reference_text") or ""})
    return sorted(result, key=lambda item: item["name"].lower())


def save_clone_profile(message: dict) -> dict:
    name = str(message.get("name") or "").strip()
    sample = audio_path(message.get("sample_path"))
    language = str(message.get("language") or "es").strip().lower()
    reference_text = str(message.get("reference_text") or "").strip()
    if not name:
        raise ValueError("Falta el nombre del perfil.")
    if sample.suffix.lower() != ".wav":
        raise ValueError("La muestra de clonación debe ser un archivo WAV.")
    if not reference_text:
        raise ValueError("Falta la transcripción exacta de la muestra WAV.")
    samples_dir = SOURCE_ROOT / "data" / "voice_samples"
    samples_dir.mkdir(parents=True, exist_ok=True)
    target = samples_dir / f"{safe_output_name(name)}.wav"
    shutil.copy2(sample, target)
    profiles = clone_profiles()
    relative = target.relative_to(SOURCE_ROOT).as_posix()
    profiles[name] = {"sample": relative, "reference_audio": relative, "language": language, "accent": "es-ES" if language == "es" else language, "ref_text": reference_text, "reference_text": reference_text, "engines": {"qwen3_base": {"enabled": True, "model": "Qwen/Qwen3-TTS-12Hz-0.6B-Base", "sample": relative, "ref_audio": relative, "ref_text": reference_text}, "openvoice_v2": {"enabled": True, "model": "OpenVoice V2 + MeloTTS", "sample": relative, "ref_audio": relative, "ref_text": reference_text}}}
    PROFILES_FILE.parent.mkdir(parents=True, exist_ok=True)
    PROFILES_FILE.write_text(json.dumps(profiles, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"name": name, "sample": str(target), "language": language, "reference_text": reference_text}


def clone_generate(message: dict) -> dict:
    profile_name = str(message.get("profile") or "").strip()
    text = str(message.get("text") or "").strip()
    engine = str(message.get("engine") or "qwen").lower()
    if not profile_name or profile_name not in clone_profiles():
        raise ValueError("Selecciona un perfil de voz clonada.")
    if not text:
        raise ValueError("Escribe el texto que quieres generar con la voz clonada.")
    profile = clone_profiles()[profile_name]
    sample_value = profile.get("sample") or profile.get("reference_audio")
    reference_text = profile.get("ref_text") or profile.get("reference_text") or ""
    sample = clone_profile_path(sample_value)
    if not sample.exists():
        raise FileNotFoundError(f"No existe la muestra del perfil: {sample}")
    if not reference_text:
        raise ValueError("El perfil no tiene transcripción de referencia.")
    temp_path = output_file("clone_source", ".wav")
    if engine in ("openvoice", "openvoice_v2"):
        python_path = SOURCE_ROOT / "runtime" / ".venv_melo" / "Scripts" / "python.exe"
        script = SOURCE_ROOT / "app" / "openvoice_local_generate.py"
        checkpoints = SOURCE_ROOT / "runtime" / "openvoice" / "checkpoints_v2"
        if not python_path.exists() or not script.exists():
            raise FileNotFoundError("No está disponible el runtime local de OpenVoice V2.")
        command = [str(python_path), str(script), "--text", text, "--output", str(temp_path), "--language", str(profile.get("language") or "es"), "--ref-audio", str(sample), "--checkpoints", str(checkpoints), "--speed", str(max(.5, min(2.0, 1.0 + parse_percent(message.get("rate"), 0) / 100.0)))]
    else:
        python_path = SOURCE_ROOT / "runtime" / ".venv_qwen" / "Scripts" / "python.exe"
        script = SOURCE_ROOT / "app" / "qwen_local_generate.py"
        if not python_path.exists() or not script.exists():
            raise FileNotFoundError("No está disponible el runtime local de Qwen3 TTS.")
        language_names = {"es": "Spanish", "en": "English", "fr": "French", "it": "Italian", "de": "German", "pt": "Portuguese", "zh": "Chinese", "ja": "Japanese", "ko": "Korean", "ru": "Russian"}
        language = str(profile.get("language") or "es").lower()
        command = [str(python_path), str(script), "--text", text, "--output", str(temp_path), "--language", language_names.get(language, "Spanish"), "--model", "Qwen/Qwen3-TTS-12Hz-0.6B-Base", "--ref-audio", str(sample), "--ref-text", reference_text]
    process = subprocess.run(command, cwd=str(SOURCE_ROOT), capture_output=True, text=True, check=False, timeout=1800)
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "El motor de clonación falló sin detalle.").strip()
        raise RuntimeError(detail[-4000:])
    if not temp_path.exists():
        raise RuntimeError("El motor de clonación no generó el WAV esperado.")
    rendered = render_audio({"input_path": str(temp_path), "volume": parse_percent(message.get("volume"), 0), "effect": "none", "cuts": [], "duration": 0, "name": "clone_render"})
    temp_path.unlink(missing_ok=True)
    return {"path": rendered["path"], "bytes": rendered["bytes"], "profile": profile_name, "engine": engine}


def analyze_audio(message: dict) -> dict:
    source = audio_path(message.get("input_path"))
    sample_rate = 8000
    command = [str(ffmpeg_executable()), "-hide_banner", "-loglevel", "error", "-t", "900", "-i", str(source), "-ac", "1", "-ar", str(sample_rate), "-f", "s16le", "pipe:1"]
    process = subprocess.run(command, capture_output=True, check=False, timeout=120)
    if process.returncode != 0:
        raise RuntimeError((process.stderr or b"No se pudo leer el audio.").decode("utf-8", errors="replace").strip())
    raw = process.stdout or b""
    usable = len(raw) - (len(raw) % 2)
    samples = struct.unpack(f"<{usable // 2}h", raw[:usable]) if usable else ()
    duration = len(samples) / sample_rate if samples else 0.0
    bucket_count = min(1400, max(80, len(samples) // 80)) if samples else 0
    peaks = []
    if bucket_count:
        bucket_size = max(1, math.ceil(len(samples) / bucket_count))
        for index in range(bucket_count):
            bucket = samples[index * bucket_size:(index + 1) * bucket_size]
            peaks.append(round(max((abs(sample) for sample in bucket), default=0) / 32768.0, 4))
    return {"path": str(source), "duration": round(duration, 3), "sample_rate": sample_rate, "peaks": peaks}


def effect_filters(message: dict) -> list[str]:
    filters = []
    volume = parse_percent(message.get("volume"), 0.0)
    if abs(volume) > 0.01:
        filters.append(f"volume={max(0.0, 1.0 + volume / 100.0):.3f}")
    effect = str(message.get("effect") or "none").lower()
    config = message.get("fx") if isinstance(message.get("fx"), dict) else {}
    intensity = max(0.0, min(1.5, float(config.get("intensity", 100) or 0) / 100.0))
    enabled = {str(key) for key, value in config.items() if key.endswith("_enabled") and value}
    if effect == "radio": enabled.add("radio_enabled")
    if effect == "echo": enabled.add("echo_enabled")
    if effect == "robot": enabled.add("robot_enabled")
    if effect == "bitcrusher": enabled.add("crusher_enabled")
    if effect == "warm": config.setdefault("metal", 3)
    if "radio_enabled" in enabled:
        low = max(120, min(700, int(float(config.get("radio_low", 280) or 280))) )
        high = max(low + 500, min(8000, int(float(config.get("radio_high", 3600) or 3600))))
        ratio = max(1.0, min(12.0, 1.0 + 2.0 * max(intensity, .1)))
        filters.extend([f"highpass=f={low}", f"lowpass=f={high}", f"acompressor=threshold=-18dB:ratio={ratio:.2f}:attack=20:release=120"])
    if "echo_enabled" in enabled:
        delay = max(20, min(1600, int(float(config.get("echo_delay", 650) or 650))))
        decay = max(0.05, min(0.9, .28 * max(intensity, .1)))
        filters.append(f"aecho=0.8:0.88:{delay}:{decay:.3f}")
    if "robot_enabled" in enabled:
        bits = max(4, min(16, int(float(config.get("bits", 8) or 8))))
        filters.extend([f"acrusher=bits={bits}:mix={max(.15, min(1.0, .7 * max(intensity, .1))):.3f}", "aecho=0.8:0.7:45:0.35"])
    if "crusher_enabled" in enabled:
        bits = max(4, min(16, int(float(config.get("bits", 6) or 6))))
        filters.append(f"acrusher=bits={bits}:mix={max(.15, min(1.0, intensity)):.3f}")
    metal = float(config.get("metal", 0) or 0)
    if abs(metal) >= .1:
        filters.append(f"equalizer=f=4200:t=q:w=1:g={max(-12, min(12, metal)):.1f}")
    if effect == "warm":
        filters.extend(["equalizer=f=160:t=q:w=1:g=2", "equalizer=f=5000:t=q:w=1:g=-1"])
    if config.get("eq_enabled"):
        bands = config.get("eq_bands") if isinstance(config.get("eq_bands"), dict) else {}
        legacy = ((60, "eq_low"), (170, "eq_low"), (310, "eq_low"), (600, "eq_mid"), (1000, "eq_mid"), (3000, "eq_mid"), (6000, "eq_high"), (12000, "eq_high"))
        for freq, key in legacy:
            band_key = f"eq_{freq}"
            gain = max(-12.0, min(12.0, float(bands.get(band_key, config.get(key, 0)) or 0)))
            if abs(gain) >= .1:
                filters.append(f"equalizer=f={freq}:t=q:w=1:g={gain:.1f}")
    return filters


def clean_cuts(value: object, duration: float) -> list[tuple[float, float]]:
    result = []
    for item in value if isinstance(value, list) else []:
        try:
            start, end = sorted((max(0.0, float(item[0])), min(duration, float(item[1]))))
            if end - start >= 0.02:
                result.append((start, end))
        except Exception:
            continue
    result.sort()
    merged = []
    for start, end in result:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def render_audio(message: dict) -> dict:
    source = audio_path(message.get("input_path"))
    duration = float(message.get("duration") or analyze_audio({"input_path": str(source)})["duration"])
    cuts = clean_cuts(message.get("cuts"), duration)
    filters = effect_filters(message)
    filter_parts = []
    output_chain = "[0:a]"
    if cuts:
        keep = []
        cursor = 0.0
        for start, end in cuts:
            if start - cursor >= 0.02:
                keep.append((cursor, start))
            cursor = max(cursor, end)
        if duration - cursor >= 0.02:
            keep.append((cursor, duration))
        if keep:
            labels = []
            for index, (start, end) in enumerate(keep):
                label = f"[cut{index}]"
                filter_parts.append(f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS{label}")
                labels.append(label)
            if len(labels) == 1:
                output_chain = labels[0]
            else:
                output_chain = "[joined]"
                filter_parts.append("".join(labels) + f"concat=n={len(labels)}:v=0:a=1{output_chain}")
    if filters:
        filter_parts.append(f"{output_chain}{','.join(filters)}[outa]")
        output_map = "[outa]"
    else:
        filter_parts.append(f"{output_chain}anull[outa]")
        output_map = "[outa]"
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    output_path = Path(message['output_path']).resolve() if message.get('output_path') else output_file(message.get('name') or 'edited_audio', '.mp3')
    if output_path == source.resolve():
        raise ValueError('Elige un archivo de destino distinto del audio de origen.')
    codec = ['-codec:a', 'pcm_s16le', '-f', 'wav'] if message.get('output_format') == 'wav' else ['-codec:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3']
    if message.get('profile'):
        codecs = {
            'mp3': ['-codec:a','libmp3lame','-ar','44100','-ac','2','-b:a','128k','-id3v2_version','3','-f','mp3'],
            'wav': ['-codec:a','pcm_s16le','-ar','44100','-ac','2','-f','wav'],
            'mp3_mono_96': ['-codec:a','libmp3lame','-ar','24000','-ac','1','-b:a','96k','-id3v2_version','3','-f','mp3'],
            'wav_16k': ['-codec:a','pcm_s16le','-ar','16000','-ac','1','-f','wav'],
            'wav_8k': ['-codec:a','pcm_s16le','-ar','8000','-ac','1','-f','wav'],
            'mp3_8k': ['-codec:a','libmp3lame','-ar','8000','-ac','1','-b:a','24k','-id3v2_version','3','-f','mp3'],
            'ulaw_8k': ['-codec:a','pcm_mulaw','-ar','8000','-ac','1','-f','mulaw'],
            'alaw_8k': ['-codec:a','pcm_alaw','-ar','8000','-ac','1','-f','alaw'],
        }
        if message['profile'] not in codecs:
            raise ValueError('Formato de exportación no válido.')
        codec = codecs[message['profile']]
    command = [str(ffmpeg_executable()), "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-filter_complex", ";".join(filter_parts), "-map", output_map, "-vn"] + codec + [str(output_path)]
    process = subprocess.run(command, capture_output=True, check=False, timeout=180)
    if process.returncode != 0:
        raise RuntimeError((process.stderr or b"No se pudo aplicar la edicion.").decode("utf-8", errors="replace").strip())
    return {"path": str(output_path), "bytes": output_path.stat().st_size, "duration": duration, "cuts": cuts, "effect": message.get("effect") or "none"}


def merge_audio(message: dict) -> dict:
    sources = [audio_path(value) for value in (message.get("input_paths") or [])]
    if len(sources) < 2:
        raise ValueError("Selecciona al menos dos audios para fusionar.")
    mode = str(message.get("mode") or "concat").lower()
    output_path = output_file(message.get("name") or "audio_fusionado", ".mp3")
    command = [str(ffmpeg_executable()), "-hide_banner", "-loglevel", "error", "-y"]
    for source in sources:
        command.extend(["-i", str(source)])
    labels = [f"[{index}:a]" for index in range(len(sources))]
    if mode == "mix":
        filter_complex = "".join(labels) + f"amix=inputs={len(labels)}:duration=longest:normalize=0[outa]"
    else:
        filter_complex = "".join(labels) + f"concat=n={len(labels)}:v=0:a=1[outa]"
    command.extend(["-filter_complex", filter_complex, "-map", "[outa]", "-codec:a", "libmp3lame", "-q:a", "2", str(output_path)])
    process = subprocess.run(command, capture_output=True, check=False, timeout=300)
    if process.returncode != 0:
        raise RuntimeError((process.stderr or b"No se pudo fusionar el audio.").decode("utf-8", errors="replace").strip())
    return {"path": str(output_path), "bytes": output_path.stat().st_size}


def convert_audio(message: dict) -> dict:
    from export_profiles import export_files
    return export_files(message, audio_path(message.get('input_path')), ffmpeg_executable(), output_file)
    # Legacy profile definitions retained below for reference.
    source = audio_path(message.get("input_path"))
    profile = str(message.get("profile") or "mp3")
    profiles = {
        "mp3": (".mp3", ["-vn", "-acodec", "libmp3lame", "-ar", "44100", "-ac", "2", "-b:a", "128k", "-id3v2_version", "3"]),
        "wav": (".wav", ["-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2"]),
        "mp3_mono_96": (".mp3", ["-vn", "-acodec", "libmp3lame", "-ar", "24000", "-ac", "1", "-b:a", "96k", "-id3v2_version", "3"]),
        "wav_16k": (".wav", ["-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1"]),
        "wav_8k": (".wav", ["-vn", "-acodec", "pcm_s16le", "-ar", "8000", "-ac", "1"]),
        "mp3_8k": (".mp3", ["-vn", "-acodec", "libmp3lame", "-ar", "8000", "-ac", "1", "-b:a", "24k", "-id3v2_version", "3"]),
        "ulaw_8k": (".ulaw", ["-f", "mulaw", "-acodec", "pcm_mulaw", "-ar", "8000", "-ac", "1"]),
        "alaw_8k": (".alaw", ["-f", "alaw", "-acodec", "pcm_alaw", "-ar", "8000", "-ac", "1"]),
    }
    extension, options = profiles.get(profile, profiles["mp3"])
    output_path = output_file(message.get("name") or source.stem + "_convertido", extension)
    command = [str(ffmpeg_executable()), "-hide_banner", "-loglevel", "error", "-y", "-i", str(source)] + options + [str(output_path)]
    process = subprocess.run(command, capture_output=True, check=False, timeout=300)
    if process.returncode != 0:
        raise RuntimeError((process.stderr or b"No se pudo convertir el audio.").decode("utf-8", errors="replace").strip())
    return {"path": str(output_path), "bytes": output_path.stat().st_size, "profile": profile}


def write_idtags(message: dict) -> dict:
    source = audio_path(message.get("input_path"))
    tags = message.get("tags") if isinstance(message.get("tags"), dict) else {}
    extension = source.suffix.lower() or ".mp3"
    output_path = output_file(message.get("name") or f"{source.stem}_idtag", extension)
    cover = None
    if message.get("cover_path") and extension == ".mp3":
        cover = audio_path(message.get("cover_path"))
    command = [str(ffmpeg_executable()), "-hide_banner", "-loglevel", "error", "-y", "-i", str(source)]
    if cover:
        command.extend(["-i", str(cover), "-map", "0:a", "-map", "1:v", "-c:v", "mjpeg", "-disposition:v", "attached_pic"])
    for key, value in tags.items():
        if value is not None and str(value).strip():
            command.extend(["-metadata", f"{key}={str(value).strip()}"])
    if extension == ".mp3":
        command.extend(["-codec:a", "copy", "-id3v2_version", "3"])
    elif extension in (".wav", ".wave"):
        command.extend(["-codec:a", "copy"])
    else:
        command.extend(["-codec:a", "copy"])
    command.append(str(output_path))
    process = subprocess.run(command, capture_output=True, check=False, timeout=180)
    if process.returncode != 0:
        raise RuntimeError((process.stderr or b"No se pudieron guardar los IDTAG.").decode("utf-8", errors="replace").strip())
    return {"path": str(output_path), "bytes": output_path.stat().st_size, "tags": tags, "cover": str(cover) if cover else None}


def split_audio(message: dict) -> dict:
    source = audio_path(message.get("input_path"))
    duration = float(message.get("duration") or analyze_audio({"input_path": str(source)})["duration"])
    points = sorted({max(0.01, min(duration - 0.01, float(value))) for value in (message.get("split_points") or []) if 0 < float(value) < duration})
    if not points:
        raise ValueError("Coloca el cursor en la onda y pulsa S para crear una división.")
    bounds = [0.0] + points + [duration]
    files = []
    for index, (start, end) in enumerate(zip(bounds, bounds[1:]), 1):
        output_path = output_file(f"{message.get('name') or source.stem}_parte_{index:02d}", ".mp3")
        command = [str(ffmpeg_executable()), "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(source), "-codec:a", "libmp3lame", "-q:a", "2", str(output_path)]
        process = subprocess.run(command, capture_output=True, check=False, timeout=180)
        if process.returncode != 0:
            raise RuntimeError((process.stderr or b"No se pudo dividir el audio.").decode("utf-8", errors="replace").strip())
        files.append({"path": str(output_path), "bytes": output_path.stat().st_size, "start": start, "end": end})
    return {"files": files, "points": points}


def generate_edge(message: dict) -> dict:
    text = str(message.get("text") or "").strip()
    voice = str(message.get("voice") or "es-ES-ElviraNeural").strip()
    rate = str(message.get("rate") or "+0%").strip()
    pitch = str(message.get("pitch") or "+0Hz").strip()
    volume = parse_percent(message.get("volume"), 0.0)
    if not text:
        raise ValueError("Escribe un texto antes de generar audio.")
    if len(text) > 100_000:
        raise ValueError("El texto supera el límite de 100.000 caracteres.")
    if not re.fullmatch(r"[A-Za-z]{2,3}-[A-Za-z]{2,4}-[A-Za-z0-9-]+", voice):
        raise ValueError("Voz Edge no válida.")
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_ROOT / f"{safe_output_name(message.get('name'))}_{int(time.time() * 1000)}.mp3"

    async def render() -> None:
        import edge_tts

        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume="+0%")
        await communicate.save(str(output_path))

    asyncio.run(render())
    if abs(volume) > 0.01:
        adjusted = render_audio({"input_path": str(output_path), "volume": volume, "effect": "none", "cuts": [], "duration": 0, "name": "edge_volume"})
        output_path.unlink(missing_ok=True)
        output_path = Path(adjusted["path"])
    return {"path": str(output_path), "voice": voice, "volume": volume, "bytes": output_path.stat().st_size}


def _apply_voice_adjustments(path: Path, message: dict, name: str) -> Path:
    rate = parse_percent(message.get("rate"), 0.0)
    pitch = float(str(message.get("pitch") or "0").replace("Hz", "").replace("+", "") or 0)
    volume = parse_percent(message.get("volume"), 0.0)
    if abs(rate) < .01 and abs(pitch) < .01 and abs(volume) < .01:
        return path
    candidates = [SOURCE_ROOT / "tools" / "sox" / "sox.exe", SOURCE_ROOT / "tools" / "sox" / "sox-14-4-2" / "sox.exe"]
    sox = next((item for item in candidates if item.exists()), None)
    if not sox:
        raise FileNotFoundError("SoX no está disponible para aplicar velocidad, tono y volumen.")
    result = output_file(name, ".wav")
    command = [str(sox), str(path), str(result)]
    if abs(volume) >= .01: command += ["vol", f"{max(0.0, (100 + volume) / 100):.3f}"]
    if abs(pitch) >= .01: command += ["pitch", str(pitch * 10)]
    if abs(rate) >= .01: command += ["tempo", f"{max(.5, (100 + rate) / 100):.3f}"]
    process = subprocess.run(command, capture_output=True, check=False)
    if process.returncode != 0:
        raise RuntimeError((process.stderr or b"SoX no pudo aplicar los ajustes.").decode("utf-8", errors="replace").strip())
    path.unlink(missing_ok=True)
    return result


def generate_voice(message: dict) -> dict:
    engine = str(message.get("engine") or "edge").lower()
    if engine == "edge":
        return generate_edge(message)
    text = str(message.get("text") or "").strip()
    if not text:
        raise ValueError("Escribe un texto antes de generar audio.")
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_ROOT / f"{safe_output_name(message.get('name') or engine)}_{int(time.time() * 1000)}.wav"
    if engine == "qwen":
        python = SOURCE_ROOT / "runtime" / ".venv_qwen" / "Scripts" / "python.exe"
        script = SOURCE_ROOT / "app" / "qwen_local_generate.py"
        if not python.exists() or not script.exists():
            raise FileNotFoundError("Qwen TTS no está instalado en el runtime portable.")
        command = [str(python), str(script), "--text", text, "--output", str(output), "--speaker", str(message.get("voice") or "serena"), "--language", str(message.get("language") or "Spanish"), "--model", str(message.get("model") or "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice")]
        if str(message.get("instruct") or "").strip():
            command += ["--instruct", str(message["instruct"]).strip()]
    elif engine == "melo":
        python = SOURCE_ROOT / "runtime" / ".venv_melo" / "Scripts" / "python.exe"
        script = SOURCE_ROOT / "app" / "melo_local_generate.py"
        if not python.exists() or not script.exists():
            raise FileNotFoundError("MeloTTS no está instalado en el runtime portable.")
        command = [str(python), str(script), "--text", text, "--output", str(output), "--language", str(message.get("language") or "Español"), "--speaker", str(message.get("voice") or "ES"), "--speed", str(max(.5, min(2.0, float(message.get("speed") or 1.0))))]
    elif engine == "azure":
        key = str(message.get("key") or os.environ.get("SPEECH_KEY") or os.environ.get("AZURE_SPEECH_KEY") or "").strip()
        region = str(message.get("region") or os.environ.get("SPEECH_REGION") or os.environ.get("AZURE_SPEECH_REGION") or "").strip()
        if not key or not region:
            raise ValueError("Azure Speech necesita la clave y la región.")
        import azure.cognitiveservices.speech as speechsdk
        from xml.sax.saxutils import escape
        voice = str(message.get("voice") or "es-ES-ElviraNeural").strip()
        config = speechsdk.SpeechConfig(subscription=key, region=region)
        config.speech_synthesis_voice_name = voice
        audio = speechsdk.audio.AudioOutputConfig(filename=str(output))
        synth = speechsdk.SpeechSynthesizer(speech_config=config, audio_config=audio)
        locale = "-".join(voice.split("-")[:2])
        ssml = f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{escape(locale)}"><voice name="{escape(voice)}"><prosody rate="{escape(str(message.get("rate") or "+0%"))}" pitch="{escape(str(message.get("pitch") or "+0Hz"))}" volume="{escape(str(message.get("volume") or "+0%"))}">{escape(text)}</prosody></voice></speak>'
        result = synth.speak_ssml_async(ssml).get()
        if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
            raise RuntimeError(f"Azure Speech no pudo sintetizar: {getattr(result, 'cancellation_details', result.reason)}")
        return {"path": str(output), "voice": voice, "engine": engine, "bytes": output.stat().st_size}
    elif engine == "matxa":
        if len(text) > 500:
            raise ValueError("Matxa limita el texto a 500 caracteres por generación.")
        from gradio_client import Client
        accent = str(message.get("accent") or "balear")
        speakers = MATXA_SPEAKERS.get(accent)
        if not speakers:
            raise ValueError("Acento Matxa no válido.")
        speaker = str(message.get("voice") or speakers[0])
        if speaker not in speakers:
            speaker = speakers[0]
        client = Client("projecte-aina/matxa-alvocat-tts-ca")
        try:
            client.predict(accent, api_name="/rs_change")
        except Exception:
            pass
        result = client.predict(text, accent, speaker, float(message.get("temperature") or .2), float(message.get("length_scale") or .89), api_name="/predict")
        if isinstance(result, (list, tuple)): result = result[0] if result else None
        if isinstance(result, dict): result = result.get("path") or result.get("name") or result.get("file")
        if not result or not Path(str(result)).exists():
            raise RuntimeError("Matxa no devolvió un audio accesible.")
        shutil.copyfile(Path(str(result)), output)
    else:
        raise ValueError("Motor de voz no válido.")
    process = subprocess.run(command, cwd=str(SOURCE_ROOT), capture_output=True, text=True, check=False) if engine in ("qwen", "melo") else None
    if process and process.returncode != 0:
        raise RuntimeError((process.stderr or process.stdout or f"{engine} falló sin detalle.").strip()[-4000:])
    if not output.exists() or output.stat().st_size == 0:
        raise RuntimeError(f"{engine} terminó sin generar audio.")
    output = _apply_voice_adjustments(output, message, f"{engine}_adjusted")
    return {"path": str(output), "voice": str(message.get("voice") or ""), "engine": engine, "bytes": output.stat().st_size}


def stt_segments(path):
    import re
    raw = path.read_text(encoding='utf-8-sig', errors='replace')
    segments = []
    for block in re.split(r'\r?\n\s*\r?\n', raw.strip()):
        lines = block.splitlines()
        if len(lines) >= 3 and ' --> ' in lines[1]:
            segments.append({'time': lines[1].split(' --> ')[0].split(',')[0], 'text': ' '.join(lines[2:])})
    return segments


def stt_status() -> dict:
    whisper_dir = STT_ROOT
    whisper_exe = whisper_dir / "bin" / "Release" / "whisper-cli.exe"
    whisper_models_dir = whisper_dir / "models"
    whisper_models = [path.name for path in whisper_models_dir.glob("*.bin")] + [path.name for path in whisper_models_dir.glob("*.gguf")]
    faster_dir = STT_ROOT / "faster"
    faster_exe = faster_dir / "bin" / "lqtac-faster-whisper.exe"
    faster_models_dir = faster_dir / "models"
    faster_models = [path.name for path in faster_models_dir.iterdir() if path.is_dir()] if faster_models_dir.exists() else []
    faster_model_ready = (faster_models_dir / "small" / "model.bin").exists()
    return {"root": str(STT_ROOT), "whispercpp": {"ready": whisper_exe.exists() and bool(whisper_models), "executable": str(whisper_exe), "models": whisper_models}, "faster_whisper": {"ready": faster_exe.exists() and faster_model_ready, "runtime_available": faster_exe.exists(), "executable": str(faster_exe), "models": faster_models}}


def stt_whispercpp(message: dict) -> dict:
    source = audio_path(message.get("input_path"))
    executable = Path(message.get("executable") or STT_ROOT / "bin" / "Release" / "whisper-cli.exe").expanduser().resolve()
    model = Path(message.get("model") or STT_ROOT / "models" / "ggml-small.bin").expanduser().resolve()
    if not executable.exists():
        raise FileNotFoundError("Whisper.cpp no está instalado. Falta data/stt/bin/Release/whisper-cli.exe.")
    if not model.exists():
        raise FileNotFoundError("No se encontró el modelo de Whisper.cpp. Selecciona un archivo GGML/GGUF local.")
    work_dir = OUTPUT_ROOT / "stt"
    work_dir.mkdir(parents=True, exist_ok=True)
    wav_path = work_dir / f"stt_input_{int(time.time() * 1000)}.wav"
    prefix = work_dir / f"whispercpp_{int(time.time() * 1000)}"
    convert = subprocess.run([str(ffmpeg_executable()), "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(wav_path)], capture_output=True, check=False, timeout=180)
    if convert.returncode != 0:
        raise RuntimeError((convert.stderr or b"No se pudo preparar el audio.").decode("utf-8", errors="replace").strip())
    base = executable.parent
    language = str(message.get("language") or "auto")
    threads = str(max(1, min(8, os.cpu_count() or 4)))
    command = [str(executable), "-m", os.path.relpath(model, base), "-f", os.path.relpath(wav_path, base), "-l", language, "-t", threads, "-ng", "-osrt", "-of", os.path.relpath(prefix, base), "-pp", "-ml", "80", "-sow"]
    if message.get("translate"): command.append("-tr")
    process = subprocess.run(command, cwd=str(base), capture_output=True, check=False, timeout=1800)
    wav_path.unlink(missing_ok=True)
    if process.returncode != 0:
        raise RuntimeError((process.stderr or process.stdout or b"Whisper.cpp no pudo transcribir el audio.").decode("utf-8", errors="replace").strip()[-4000:])
    text_path = prefix.with_suffix(".srt")
    if not text_path.exists():
        raise RuntimeError("Whisper.cpp terminó sin generar el archivo de transcripción.")
    segments = stt_segments(text_path)
    return {"engine": "whispercpp", "text": '\n'.join(s['text'] for s in segments), "segments": segments, "text_path": str(text_path)}


def stt_faster_whisper(message: dict) -> dict:
    source = audio_path(message.get("input_path"))
    root = STT_ROOT / "faster"
    executable = root / "bin" / "lqtac-faster-whisper.exe"
    model_name = str(message.get("model") or "small").strip()
    model_path = Path(model_name).expanduser()
    if not model_path.exists():
        model_path = root / "models" / model_name
    if not executable.exists() or not model_path.exists():
        raise FileNotFoundError("Faster Whisper INT8 no está preparado. Faltan el ejecutable portable o el modelo local.")
    language = str(message.get("language") or "auto")
    work_dir = OUTPUT_ROOT / "stt"
    work_dir.mkdir(parents=True, exist_ok=True)
    wav_path = work_dir / f"stt_input_{int(time.time() * 1000)}.wav"
    srt_path = work_dir / f"faster_{int(time.time() * 1000)}.srt"
    convert = subprocess.run([str(ffmpeg_executable()), "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(wav_path)], capture_output=True, check=False, timeout=180)
    if convert.returncode != 0:
        raise RuntimeError((convert.stderr or b"No se pudo preparar el audio.").decode("utf-8", errors="replace").strip())
    base = executable.parent
    relative = lambda value: os.path.relpath(str(value), str(base))
    command = [str(executable), "--model", relative(model_path), "--input", relative(wav_path), "--output", relative(srt_path), "--language", language, "--threads", "8"]
    process = subprocess.run(command, cwd=str(base), capture_output=True, check=False, timeout=1800)
    wav_path.unlink(missing_ok=True)
    if process.returncode != 0:
        raise RuntimeError((process.stderr or process.stdout or b"Faster Whisper no pudo transcribir el audio.").decode("utf-8", errors="replace").strip()[-4000:])
    if not srt_path.exists():
        raise RuntimeError("Faster Whisper terminó sin generar la transcripción.")
    raw = srt_path.read_text(encoding="utf-8", errors="replace")
    text = "\n".join(line.strip() for line in raw.splitlines() if line.strip() and not line.strip().isdigit() and " --> " not in line)
    return {"engine": "fasterwhisper", "text": text, "segments": stt_segments(srt_path), "text_path": str(srt_path)}


def stt_transcribe(message: dict) -> dict:
    engine = str(message.get("engine") or "whispercpp").lower()
    if engine == "whispercpp":
        return stt_whispercpp(message)
    if engine == "fasterwhisper":
        return stt_faster_whisper(message)
    raise ValueError("Motor STT no válido.")


def export_transcript(message):
    import zipfile
    from xml.sax.saxutils import escape, quoteattr
    target = Path(message['output_path'])
    if message.get('format') != 'docx':
        target.write_text(str(message.get('text', '')), encoding='utf-8')
    else:
        paragraphs = []
        for paragraph in message.get('paragraphs', []):
            runs = []
            for run in paragraph:
                props = '<w:rFonts w:ascii=' + quoteattr(str(run.get('font', 'Segoe UI'))) + ' w:hAnsi=' + quoteattr(str(run.get('font', 'Segoe UI'))) + '/>'
                props += '<w:sz w:val="' + str(max(12, min(192, int(float(run.get('size', 14)) * 2)))) + '"/>'
                for key, tag in [('bold','b'),('italic','i'),('strike','strike')]:
                    if run.get(key): props += '<w:' + tag + '/>'
                if run.get('underline'): props += '<w:u w:val="single"/>'
                runs.append('<w:r><w:rPr>' + props + '</w:rPr><w:t xml:space="preserve">' + escape(run.get('text', '')) + '</w:t></w:r>')
            paragraphs.append('<w:p>' + ''.join(runs) + '</w:p>')
        with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
            archive.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
            archive.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + ''.join(paragraphs) + '<w:sectPr/></w:body></w:document>')
    return {'path': str(target)}


def handle(message: dict) -> object:
    operation = message.get("op")
    if operation == 'audio:export':
        import tempfile
        with tempfile.TemporaryDirectory(prefix='voice-render-') as work:
            intermediate = Path(work) / 'render.wav'
            render_audio({**message, 'profile': None, 'output_format': 'wav', 'output_path': str(intermediate)})
            return convert_audio({**message, 'input_path': str(intermediate)})
    if operation == 'stt:export':
        return export_transcript(message)
    if operation == "ping":
        return {"pong": True, "python": sys.executable}
    if operation == "status":
        return status()
    if operation == "stt:status":
        return stt_status()
    if operation == "stt:transcribe":
        return stt_transcribe(message)
    if operation == "edge:list_voices":
        return list_edge_voices()
    if operation == "edge:generate":
        return generate_edge(message)
    if operation == "voice:generate":
        return generate_voice(message)
    if operation == "clone:list_profiles":
        return list_clone_profiles()
    if operation == "clone:save_profile":
        return save_clone_profile(message)
    if operation == "clone:generate":
        return clone_generate(message)
    if operation == "audio:analyze":
        return analyze_audio(message)
    if operation == "audio:render":
        return render_audio(message)
    if operation == "audio:merge":
        return merge_audio(message)
    if operation == "audio:convert":
        return convert_audio(message)
    if operation == "audio:idtag":
        return write_idtags(message)
    if operation == "audio:split":
        return split_audio(message)
    raise ValueError(f"Operación no soportada: {operation}")


for raw_line in sys.stdin:
    if not raw_line.strip():
        continue
    message = json.loads(raw_line)
    response = {"id": message.get("id")}
    try:
        response["result"] = handle(message)
    except Exception as error:  # pragma: no cover - contrato del proceso puente
        response["ok"] = False
        response["error"] = str(error)
    else:
        response["ok"] = True
    print(json.dumps(response, ensure_ascii=False), flush=True)
