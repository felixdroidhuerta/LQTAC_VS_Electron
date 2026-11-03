"""Perfiles equivalentes a OUTPUT_PROFILES de Voice Studio Python."""
PROFILES = {
    'mp3': ('.mp3', ['-acodec','libmp3lame','-ar','44100','-ac','2','-b:a','128k','-id3v2_version','3']),
    'wav': ('.wav', ['-acodec','pcm_s16le','-ar','44100','-ac','2']),
    'mp3_original': ('.mp3', ['-acodec','libmp3lame','-q:a','2']),
    'mp3_mono_96': ('.mp3', ['-acodec','libmp3lame','-ar','24000','-ac','1','-b:a','96k','-id3v2_version','3']),
    'mp3_48k': ('.mp3', ['-acodec','libmp3lame','-ar','48000','-ac','1','-b:a','192k','-id3v2_version','3']),
    'mp3_8k': ('.mp3', ['-acodec','libmp3lame','-ar','8000','-ac','1','-b:a','24k']),
    'wav_8k': ('.wav', ['-acodec','pcm_s16le','-ar','8000','-ac','1']),
    'wav_16k': ('.wav', ['-acodec','pcm_s16le','-ar','16000','-ac','1']),
    'wav_24k': ('.wav', ['-acodec','pcm_s16le','-ar','24000','-ac','1']),
    'ulaw_8k': ('.ulaw', ['-f','mulaw','-acodec','pcm_mulaw','-ar','8000','-ac','1']),
    'alaw_8k': ('.alaw', ['-f','alaw','-acodec','pcm_alaw','-ar','8000','-ac','1']),
    'sln_8k': ('.sln', ['-f','s16le','-acodec','pcm_s16le','-ar','8000','-ac','1']),
    'sln16': ('.sln16', ['-f','s16le','-acodec','pcm_s16le','-ar','16000','-ac','1']),
}
PACKS = {'universal_pack': ['mp3','wav'], 'asterisk_pack': ['wav_8k','ulaw_8k','alaw_8k','sln_8k','sln16']}


def export_files(message, source, ffmpeg, default_output):
    import subprocess
    import shutil
    from pathlib import Path
    profile = message.get('profile', 'mp3')
    if profile not in PROFILES and profile not in PACKS:
        raise ValueError('Perfil de salida desconocido.')
    profiles = PACKS.get(profile, [profile])
    base = Path(message['output_path']) if message.get('output_path') else default_output(message.get('name') or source.stem + '_convertido', PROFILES[profiles[0]][0])
    files = []
    for item in profiles:
        extension, options = PROFILES[item]
        target = base.with_suffix(extension)
        if target.resolve() == source.resolve():
            raise ValueError('El destino debe ser distinto del archivo original.')
        if item == 'mp3_original' and source.suffix.lower() == '.mp3':
            shutil.copyfile(source, target)
        else:
            result = subprocess.run([str(ffmpeg), '-v','error','-y','-i',str(source),'-vn',*options,str(target)], capture_output=True, timeout=300, creationflags=subprocess.CREATE_NO_WINDOW if __import__('os').name == 'nt' else 0)
            if result.returncode:
                raise RuntimeError(result.stderr.decode('utf-8', errors='replace'))
        files.append({'path': str(target), 'bytes': target.stat().st_size})
    return {**files[0], 'files': files, 'profile': profile}
