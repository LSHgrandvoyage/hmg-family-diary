#!/usr/bin/env python3
"""Freeze clean source and signed release in a local submission bundle. Never upload."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json, os, re, subprocess
root = Path(__file__).resolve().parent.parent
if subprocess.check_output(['git','status','--porcelain'],cwd=root).strip():
    raise SystemExit('Commit verified source first. Refusing to package an uncommitted submission.')
commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
apk = root/'apps/vehicle/app/build/outputs/apk/contest/release/app-contest-release.apk'
if not apk.is_file(): raise SystemExit('Build the signed contestRelease APK first.')
sdk = Path(os.environ.get('ANDROID_HOME',root/'.tools/android-sdk'))
build_tools = sdk/'build-tools/35.0.0'
env=os.environ.copy()
if not env.get('JAVA_HOME') and Path('/usr/libexec/java_home').exists():
    env['JAVA_HOME']=subprocess.check_output(['/usr/libexec/java_home','-v','17'],text=True).strip()
java_binary = str(Path(env['JAVA_HOME'])/'bin'/'java') if env.get('JAVA_HOME') else 'java'
java_version = subprocess.run([java_binary, '-version'], env=env, check=True, capture_output=True, text=True).stderr.splitlines()[0]
verified = subprocess.check_output([str(build_tools/'apksigner'),'verify','--verbose','--print-certs',str(apk)],env=env,text=True)
badging = subprocess.check_output([str(build_tools/'aapt'),'dump','badging',str(apk)],text=True)
assert "name='io.hmg.familydiary.contest'" in badging
assert "application-label:'차곡차곡'" in badging
assert 'application-debuggable' not in badging
subprocess.run(['python3',str(root/'scripts/package-contest.py'),'--source-only'],cwd=root,check=True)
name='새벽개발팸_차곡차곡_제출용'
parent=root/'dist/submission'/commit[:7]
out=parent/name
out.mkdir(parents=True,exist_ok=False)
with ZipFile(root/'dist/contest/source.zip') as z:
    for item in z.infolist():
        relative=Path(item.filename).relative_to('hmg-family-diary')
        assert '..' not in relative.parts
        assert not any(p in {'.git','.tools','node_modules','private-data','recordings','build'} for p in relative.parts)
        assert relative.suffix not in {'.p12','.jks','.keystore','.pem','.key','.wav','.m4a','.dump','.apk'}
        assert not relative.name.startswith('.env') or relative.name in {'.env.example','.env.probe.example'}
        target=out/'source'/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(item))
        mode=(item.external_attr>>16)&0o777
        if mode:target.chmod(mode)
(out/'apk').mkdir()
target_apk=out/'apk/새벽개발팸_차곡차곡_release.apk';target_apk.write_bytes(apk.read_bytes())
(out/'README.md').write_bytes((root/'docs/contest/release-runbook.md').read_bytes())
(out/'검증결과.md').write_text((root/'docs/evidence/c047-repeat-all.md').read_text().replace('../../specs/', 'source/specs/').replace('(connected-ui/', '(source/docs/evidence/connected-ui/'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_files={p.relative_to(out/'source').as_posix():sha(p) for p in sorted((out/'source').rglob('*')) if p.is_file()}
(out/'source-files.sha256').write_text(''.join(f'{v}  source/{k}\n' for k,v in source_files.items()))
manifest={'team':'새벽개발팸','app':'차곡차곡','source_commit':commit,'source_state':'committed-tree','package':'io.hmg.familydiary.contest','variant':'contestRelease','debuggable':False,'version':re.search(r"versionName='([^']+)'",badging).group(1),'apk_path':target_apk.relative_to(out).as_posix(),'apk_sha256':sha(target_apk),'signer_sha256':re.search(r'Signer #1 certificate SHA-256 digest: ([a-f0-9]+)',verified).group(1),'source_files':len(source_files),'source_hashes_sha256':sha(out/'source-files.sha256'),'environment':{'pleos':'2.1.0 API34 ARM64','emulator':'37.2.13','physical_screen':'2560x1440','reference_ui':'1280x720','compile_target_sdk':35,'gradle':'8.10.2','agp':'8.8.2','kotlin':'2.0.0','java_target':'17','packaging_java':java_version,'host':'macOS ARM64'},'limits':['Emulator-only prototype, not a vehicle/market approval.','Fixed local mock: AI 생성 일기 목업 입니다.','Windows host execution remains unverified.','Original vehicle audio capture/storage/sync policy remains unconfirmed.']}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
checks=[target_apk,out/'README.md',out/'검증결과.md',out/'manifest.json',out/'source-files.sha256']
(out/'SHA256SUMS.txt').write_text(''.join(f'{sha(p)}  {p.relative_to(out).as_posix()}\n' for p in checks))
archive=parent/(name+'.zip')
with ZipFile(archive,'w',ZIP_DEFLATED) as z:
    for p in sorted(out.rglob('*')):
        if p.is_file():z.write(p,p.relative_to(parent))
archive.with_suffix('.zip.sha256').write_text(f'{sha(archive)}  {archive.name}\n')
print(f'Submission folder: {out}\nUpload ZIP: {archive}\nCommit: {commit}\nAPK SHA-256: {sha(target_apk)}')
