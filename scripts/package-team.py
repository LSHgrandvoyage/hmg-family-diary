#!/usr/bin/env python3
"""Local Windows team source/Compose + APK ZIP. No images, volumes or credentials."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import subprocess, hashlib, json
root = Path(__file__).resolve().parent.parent
subprocess.run(['python3', str(root/'scripts/package-contest.py')], cwd=root, check=True)
out = root/'dist/team-windows'
out.mkdir(parents=True, exist_ok=True)
zip_path=out/'hmg-family-diary-team-windows.zip'
apk=root/'dist/contest/app-probe-debug.apk'
manifest=json.loads((root/'dist/contest/manifest.json').read_text())
manifest['kind']='windows-local-team-test-source-bundle'
manifest['notes'] += ['No prebuilt Docker images: first up builds for the teammate CPU.', 'Windows host execution is pending teammate verification.', 'probeDebug APK is emulator-only; not a contest release APK.']
with ZipFile(root/'dist/contest/source.zip') as source, ZipFile(zip_path,'w',ZIP_DEFLATED) as archive:
    for name in source.namelist():
        archive.writestr(name,source.read(name))
    archive.write(apk,'hmg-family-diary/apk/app-probe-debug.apk')
    archive.writestr('hmg-family-diary/TEAM-MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    archive.writestr('hmg-family-diary/START-HERE.txt', 'Windows: open docs/team/windows-testing.md.\nRequires Docker Desktop (Linux containers), Node 24, and Pleos emulator for vehicle tests.\nPowerShell: node scripts/team-test.mjs init <LAN-IPv4>\nThen: node scripts/team-test.mjs up\nStop: node scripts/team-test.mjs stop\nDo not share .env.team or private media.\n')
sha=hashlib.sha256(zip_path.read_bytes()).hexdigest()
(zip_path.with_suffix('.zip.sha256')).write_text(f'{sha}  {zip_path.name}\n')
print(f'Team ZIP: {zip_path} ({zip_path.stat().st_size} bytes)')
print('Contains source/Compose and emulator debug APK. No Docker images or developer data.')
