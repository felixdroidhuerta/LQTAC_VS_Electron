"""Preparación y publicación privada de la distribución, sin datos personales."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request
import urllib.error
import zipfile
import time
import http.client
import urllib.parse
import shutil

ROOT = Path(__file__).resolve().parent
PORTABLE = ROOT.parent / 'LQTAC_Voice_Studio_Electron_Portable_v0.1.0'
OUT = ROOT.parent / 'LQTAC_VS_Electron_Release_v0.1.0'
REPO = 'felixdroidhuerta/LQTAC_VS_Electron'

def token():
    result = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', capture_output=True, text=True, check=True)
    credentials = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    return credentials['password']

def api(route, payload=None, method=None):
    request = urllib.request.Request('https://api.github.com/' + route, data=json.dumps(payload).encode() if payload is not None else None, method=method)
    request.add_header('Authorization', 'Bearer ' + token())
    request.add_header('Accept', 'application/vnd.github+json')
    request.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'GitHub HTTP {error.code}: {route}') from None

def safe(relative):
    parts = relative.parts
    low = [p.lower() for p in parts]
    if any(p in {'__pycache__','.git','logs','outputs','projects','temp','voice_samples','.cache','downloads'} for p in low): return False
    if any(p.startswith('.env') or p in {'token','stored_tokens','.git-credentials'} for p in low): return False
    if relative.suffix.lower() in {'.log','.bak','.pyc','.zip'}: return False
    if 'config' in low and relative.suffix.lower() == '.json' and relative.name != 'voice_profiles.json': return False
    return True

def prepare():
    OUT.mkdir(exist_ok=True)
    target = OUT / 'Voice_Studio_by_LQTAC_Electron_v0.1.0.zip'
    if target.exists(): raise RuntimeError('El archivo de distribución ya existe. No se sobrescribe.')
    files = sorted(p for p in PORTABLE.rglob('*') if p.is_file() and not p.is_symlink() and safe(p.relative_to(PORTABLE)))
    print(f'Empaquetando {len(files)} archivos, sin proyectos, audios personales ni muestras de voz.', flush=True)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=3, allowZip64=True) as archive:
        for index, file in enumerate(files):
            relative = file.relative_to(PORTABLE)
            arcname = 'Voice_Studio_by_LQTAC/' + relative.as_posix()
            if relative.name == 'voice_profiles.json':
                archive.writestr(arcname, '{}')
            else:
                archive.write(file, arcname)
            if index % 2000 == 0: print(f'{index}/{len(files)} archivos', flush=True)
    with zipfile.ZipFile(target) as archive:
        bad = archive.testzip()
        if bad: raise RuntimeError('ZIP dañado: ' + bad)
    print(f'ZIP verificado: {target.stat().st_size} bytes', flush=True)
    return target

def digest(file):
    result = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b''): result.update(chunk)
    return result.hexdigest()

def publish():
    target = OUT / 'Voice_Studio_by_LQTAC_Electron_v0.1.0.zip'
    if not target.exists(): raise RuntimeError('Primero prepara el ZIP.')
    assets = []
    if target.stat().st_size > 1900 * 1024 * 1024:
        parts = []
        with target.open('rb') as source:
            number = 1
            while source.tell() < target.stat().st_size:
                part = OUT / (target.name + f'.{number:03d}')
                with part.open('wb') as dest:
                    remaining = 1024 * 1024 * 1024
                    while remaining:
                        block = source.read(min(8 * 1024 * 1024, remaining))
                        if not block: break
                        dest.write(block); remaining -= len(block)
                parts.append({'name':part.name,'sha256':digest(part)})
                assets.append(part); number += 1
        manifest = OUT / 'SHA256SUMS.json'
        manifest.write_text(json.dumps({'zip':target.name,'sha256':digest(target),'parts':parts}, indent=2), encoding='utf-8')
        restore = OUT / 'RECONSTRUIR_PORTABLE.ps1'
        shutil.copyfile(ROOT / restore.name, restore)
        assets.extend([manifest, restore])
    else:
        assets.append(target)
    releases = api('repos/' + REPO + '/releases')
    release = next((r for r in releases if r['tag_name'] == 'v0.1.0'), None)
    if not release:
        release = api('repos/' + REPO + '/releases', {'tag_name':'v0.1.0','name':'Voice Studio by LQTAC - Electron portable v0.1.0','draft':True,'body':'Portable Windows x64 independiente con motores Python y STT incluidos. Sin proyectos, muestras ni perfiles personales. Descarga todos los archivos. Si el ZIP está dividido, descarga las partes .001, .002, etc., SHA256SUMS.json y RECONSTRUIR_PORTABLE.ps1 en una misma carpeta; ejecuta el script y extrae el ZIP completo. No basta con descargar el código fuente. Edge TTS requiere Internet. Los demás motores requieren sus modelos locales. Para clonar, crea tus perfiles de voz.'})
    existing = {asset['name']:asset for asset in release.get('assets', [])}
    for file in assets:
        if file.name in existing and existing[file.name]['size'] == file.stat().st_size:
            print('Ya subido: ' + file.name, flush=True); continue
        url = urllib.parse.urlsplit(release['upload_url'].split('{')[0] + '?name=' + urllib.parse.quote(file.name))
        connection = http.client.HTTPSConnection(url.hostname, timeout=300)
        connection.putrequest('POST', url.path + '?' + url.query)
        connection.putheader('Authorization', 'Bearer ' + token())
        connection.putheader('Content-Type', 'application/octet-stream')
        connection.putheader('Content-Length', str(file.stat().st_size))
        connection.putheader('User-Agent', 'LQTAC-Release'); connection.endheaders()
        print('Subiendo ' + file.name, flush=True)
        sent = 0
        with file.open('rb') as stream:
            for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
                connection.send(block); sent += len(block)
                if sent % (128 * 1024 * 1024) == 0: print(f'{file.name}: {sent // (1024 * 1024)} MiB', flush=True)
        response = connection.getresponse(); response.read()
        if response.status != 201: raise RuntimeError(f'No se pudo subir {file.name}: HTTP {response.status}')
        connection.close()
    verified = api('repos/' + REPO + '/releases/' + str(release['id']))
    sizes = {asset['name']:asset['size'] for asset in verified['assets']}
    if not all(sizes.get(file.name) == file.stat().st_size for file in assets): raise RuntimeError('La Release no contiene todos los archivos completos.')
    result = api('repos/' + REPO + '/releases/' + str(release['id']), {'draft':False}, 'PATCH')
    print('PUBLICADO: ' + result['html_url'], flush=True)

if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'repo':
        try:
            result = api('repos/' + REPO)
        except RuntimeError as error:
            if 'HTTP 404' not in str(error): raise
            result = api('user/repos', {'name':'LQTAC_VS_Electron', 'private':True, 'description':'Voice Studio by LQTAC: aplicación Electron y distribución portable Windows con TTS, STT y edición de audio.'})
        if not result['private']: raise RuntimeError('Se esperaba un repositorio privado.')
        print(result['html_url'])
    elif sys.argv[1] == 'prepare': prepare()
    elif sys.argv[1] == 'publish': publish()
