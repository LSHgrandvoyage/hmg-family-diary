#!/usr/bin/env python3
"""Build a local review bundle from explicit source paths. Never publish or include runtime state."""
from pathlib import Path
import hashlib, json, shutil, subprocess, zipfile, sys

root = Path(__file__).resolve().parent.parent
out = root / 'dist' / 'contest'
apk = root / 'apps/vehicle/app/build/outputs/apk/probe/debug/app-probe-debug.apk'
source_only = "--source-only" in sys.argv
if not source_only and not apk.is_file():
    raise SystemExit('Build :app:assembleProbeDebug first.')
roots = ('apps/', 'packages/', 'workers/', 'db/', 'infra/', 'scripts/', 'tests/', 'specs/', 'docs/contest/', '.specify/memory/', '.specify/scripts/', '.specify/templates/', '.specify/workflows/', '.agents/skills/speckit-')
fixed = {'AGENTS.md', 'docs/evidence/c040-spec-reorganization.md', 'docs/evidence/compose-runtime.md', 'docs/evidence/g0-environment.md', 'docs/product-brief.md', 'docs/evidence/connected-ui/c021-phone-filter.png', 'docs/evidence/connected-ui/c021-car-filter.png', 'README.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts', 'compose.yaml', 'compose.preview.yaml', '.dockerignore', '.gitignore', '.env.example', '.env.probe.example'}
fixed.update('docs/evidence/connected-ui/'+name for name in ('c025-car-1280-light.png','c025-car-1280-dark.png','c025-detail-active-dark.png','c025-driving.png'))
fixed.update('docs/evidence/connected-ui/'+name for name in ('c026-phone-light.png','c026-phone-dark.png','c026-car-light.png','c026-car-dark.png'))
fixed.add('docs/evidence/connected-ui/c026-runtime-phone-timeline.png')
fixed.update({'docs/evidence/c026-original-timeline.md','docs/evidence/stt-timeline-diagnostic.json','docs/evidence/stt-timeline-tail.json','docs/evidence/stt-timeline-baseline.json'})
fixed.add('docs/evidence/c027-navigation-theme-wave.md')
fixed.add('docs/evidence/c028-controls-and-playback.md')
fixed.add('docs/evidence/c029-settings-redesign.md')
fixed.add('docs/evidence/c030-common-vehicle-rail.md')
fixed.add('docs/evidence/c031-unified-vehicle-name.md')
fixed.add('docs/evidence/c032-driving-reference-and-home.md')
fixed.add('docs/evidence/c037-pairing-and-setup.md')
fixed.add('docs/evidence/c038-sync-recovery-driving-listen.md')
fixed.add('docs/evidence/c039-first-run.md')
fixed.add('docs/evidence/c041-brand-logo.md')
fixed.add('docs/evidence/c042-runtime-connection.md')
fixed.add('docs/evidence/c043-connection-driving.md')
fixed.add('docs/evidence/c044-driving-entry-playback.md')
fixed.add('docs/evidence/c045-listen-and-transcript.md')
fixed.add('docs/evidence/c046-explicit-playback.md')
fixed.add('docs/evidence/c047-repeat-all.md')
fixed.add('docs/evidence/c048-sync-status-player.md')
fixed.add('docs/evidence/c049-team-startup.md')
fixed.add('docs/evidence/c050-vehicle-interaction.md')
fixed.add('docs/evidence/c051-narration-navigation.md')
fixed.add('docs/evidence/c052-narration-lyrics.md')
fixed.update('docs/evidence/connected-ui/c052-'+name+'.png' for name in ('lyrics-light','lyrics-dark','long-light'))
fixed.update('docs/evidence/connected-ui/c051-tts-'+theme+'.png' for theme in ('light','dark'))
fixed.update('docs/evidence/connected-ui/c050-'+name+'-'+theme+'.png' for name in ('processing','listening') for theme in ('light','dark'))
fixed.update('docs/evidence/connected-ui/c048-'+name+'-'+theme+'.png' for name in ('car-home','car-list','mobile') for theme in ('light','dark'))
fixed.update('docs/evidence/connected-ui/c047-driving-list-'+theme+'.png' for theme in ('light','dark'))
fixed.update('docs/evidence/connected-ui/c046-'+name+'.png' for name in ('driving-list-dark', 'driving-list-light', 'parked-player-dark', 'parked-player-light', 'detail-active-dark', 'detail-active-light'))
fixed.update('docs/evidence/connected-ui/c045-'+name+'.png' for name in ('driving-list-dark','driving-list-light','parked-player-dark','parked-player-light','driving-caption-dark','driving-caption-light','parked-transcript-light'))
fixed.update('docs/evidence/connected-ui/c044-'+name+'.png' for name in ('welcome-initial-dark', 'welcome-all-light', 'driving-caption-dark', 'driving-adaptive-light', 'parked-original-dark', 'parked-tts-light', 'mobile-family-light'))
fixed.update('docs/evidence/connected-ui/c043-'+name+'.png' for name in ('mobile-home-light', 'mobile-connected-dark', 'mobile-steps-light', 'driving-idle-dark', 'driving-recording-dark', 'driving-paused-dark', 'driving-listening-dark', 'driving-original-dark', 'driving-listening-light'))
fixed.update('docs/evidence/connected-ui/c042-pairing-'+theme+'.png' for theme in ('light','dark'))
fixed.update('docs/evidence/connected-ui/c041-'+name+'.png' for name in ('phone-375-light', 'phone-375-dark', 'carhome-light', 'carsettings-dark', 'native-home', 'native-welcome-light', 'native-welcome-dark', 'launcher'))
fixed.update('docs/evidence/connected-ui/c039-'+name+'.png' for name in ('welcome-light','welcome-dark','entered-home'))
fixed.update({'docs/evidence/c035-contest-release.md','docs/evidence/connected-ui/c035-settings-light.png','docs/evidence/connected-ui/c035-settings-dark.png'})
fixed.update({'.gitattributes','compose.team.yaml','infra/Caddyfile.team','docs/team/windows-testing.md','docs/evidence/c033-fixed-mock.md','docs/evidence/c034-team-deployment.md'})
fixed.update('docs/evidence/connected-ui/c032-driving-'+state+'-'+theme+'.png' for state in ('idle','recording') for theme in ('dark','light'))
fixed.add('docs/evidence/connected-ui/c031-phone-name.png')
fixed.update('docs/evidence/connected-ui/'+name for name in ('c030-carsettings-dark.png','c030-carhome-dark.png','c030-carlist-dark.png','c030-carsettings-light.png'))
fixed.update('docs/evidence/connected-ui/'+name for name in ('c029-settings-dark.png','c029-settings-light.png','c029-phone-375-dark.png'))
fixed.update('docs/evidence/connected-ui/'+name for name in ('c028-phone-375-family-light.png','c028-phone-375-family-dark.png','c028-phone-375-search-light.png','c028-phone-375-search-dark.png'))
fixed.update('docs/evidence/connected-ui/'+name for name in ('c027-phone-375-light.png','c027-phone-375-dark.png','c027-car-1280-light.png','c027-car-1280-dark.png','c027-recording-light.png','c027-recording-dark.png'))
names = subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=root).decode().split('\0')
allowed_suffixes = {'.ts','.tsx','.js','.mjs','.cjs','.css','.html','.json','.yaml','.yml','.toml','.md','.txt','.sql','.sh','.py','.kt','.kts','.xml','.properties','.woff2','.ttf','.svg','.png'}
selected = []
for name in sorted(set(names)):
    if not name or not (name in fixed or name.startswith(roots)):
        continue
    p = root/name
    if not p.is_file() or p.is_symlink():
        continue
    if any(part in {'.git','.gradle','.tools','build','node_modules','.next','private-data','recordings','dist'} for part in p.relative_to(root).parts):
        continue
    if p.name.startswith('.env') and name not in {'.env.example','.env.probe.example'}:
        continue
    if name not in fixed and p.suffix not in allowed_suffixes and p.name not in {'gradlew','gradlew.bat','Caddyfile','runtime.Dockerfile','preview.Dockerfile','gradle-wrapper.jar'}:
        continue
    if p.suffix in {'.ts','.js','.json','.yaml','.yml','.txt','.md','.properties','.sh'}:
        content=p.read_bytes()
        if b'-----BEGIN PRIVATE KEY-----' in content or b'-----BEGIN RSA PRIVATE KEY-----' in content:
            raise SystemExit('Private key material detected in source candidate. Packaging stopped.')
    selected.append((name,p))
out.mkdir(parents=True,exist_ok=True)
if not source_only: shutil.copyfile(apk,out/'app-probe-debug.apk')
with zipfile.ZipFile(out/'source.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for name,p in selected: archive.write(p, 'hmg-family-diary/'+name)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
dirty=bool(subprocess.check_output(['git','status','--porcelain'],cwd=root).strip())
manifest={'kind':'emulator-prototype-review-bundle','source_state':'working-tree' if dirty else 'committed-tree','base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip(),'apk_sha256':None if source_only else sha(out/'app-probe-debug.apk'),'source_zip_sha256':sha(out/'source.zip'),'source_files':{name:sha(p) for name,p in selected},'notes':[('Uncommitted working tree snapshot; not a claimed final commit.' if dirty else 'Clean source checkout at base_commit; not automatically a final contest submission.'),'AI remains mock. No SDK/AVD, runtime secrets or private media included.','APK was built locally; rebuild from source for independently reproducible validation.']}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
shutil.copyfile(root/'docs/contest/README.md',out/'README.md')
print(f'Created local review bundle: {out} ({len(selected)} source files)')
