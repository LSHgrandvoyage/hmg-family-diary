#!/usr/bin/env python3
"""Freeze clean source and signed release in a local submission bundle. Never upload."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json, os, re, subprocess
root = Path(__file__).resolve().parent.parent
if subprocess.check_output(['git','status','--porcelain'],cwd=root).strip():
    raise SystemExit('Commit verified source first. Refusing to package an uncommitted submission.')
commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
artifact = json.loads((root/'docs/contest/release-artifact.json').read_text())
apk = root/artifact['apk_path']
if not apk.is_file(): raise SystemExit('Place the verified release APK at the declared repository apk/ path first.')
if hashlib.sha256(apk.read_bytes()).hexdigest() != artifact['apk_sha256']:
    raise SystemExit('APK differs from the reviewed release-artifact.json. Verify the new build before packaging.')
apk_build_commit = artifact['apk_build_source_commit']
subprocess.run(['git','cat-file','-e',apk_build_commit+'^{commit}'],cwd=root,check=True)
if subprocess.run(['git','diff','--quiet',apk_build_commit,commit,'--','apps/vehicle','apps/web/public/faithful'],cwd=root).returncode:
    raise SystemExit('APK inputs changed since its declared build commit; build and verify a new release first.')
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
assert re.search(r"versionName='([^']+)'",badging).group(1) == artifact['version']
assert int(re.search(r"versionCode='([^']+)'",badging).group(1)) == artifact['version_code']
assert re.search(r'Signer #1 certificate SHA-256 digest: ([a-f0-9]+)',verified).group(1) == artifact['signer_sha256']
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
(out/'검증결과.md').write_text('# 차곡차곡 제출 검증\n\n'
    + f'제출 소스 커밋: `{commit}`\n\nAPK 빌드 기준 커밋: `{apk_build_commit}`\n\n'
    + '문서/패키징 변경과 APK 빌드를 구분합니다. 앱 소스와 APK 입력 자산은 빌드 기준 이후 동일합니다.\n\n'
    + '- [기능 실행·검증 근거 C052](source/docs/evidence/c052-narration-lyrics.md)\n'
    + '- [공개 제출·패키징 검증 C053](source/docs/evidence/c053-public-submission.md)\n'
    + '- [플랫폼 지원 재검토](source/docs/contest/platform-review-2026-11-15.md)\n\n'
    + 'AI 생성은 고정 목업입니다. 원본 음성 전체 경로의 공식 허용과 실차/마켓 정책은 미확인입니다. Windows 전체 재현·실차 검증 완료를 주장하지 않습니다.\n')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_files={p.relative_to(out/'source').as_posix():sha(p) for p in sorted((out/'source').rglob('*')) if p.is_file()}
(out/'source-files.sha256').write_text(''.join(f'{v}  source/{k}\n' for k,v in source_files.items()))
manifest={'team':'새벽개발팸','app':'차곡차곡','source_commit':commit,'source_state':'committed-tree','package':'io.hmg.familydiary.contest','variant':'contestRelease','debuggable':False,'version':re.search(r"versionName='([^']+)'",badging).group(1),'apk_path':target_apk.relative_to(out).as_posix(),'apk_sha256':sha(target_apk),'signer_sha256':re.search(r'Signer #1 certificate SHA-256 digest: ([a-f0-9]+)',verified).group(1),'source_files':len(source_files),'source_hashes_sha256':sha(out/'source-files.sha256'),'environment':{'pleos':'2.1.0 API34 ARM64','emulator':'37.2.13','physical_screen':'2560x1440','reference_ui':'1280x720','compile_target_sdk':35,'gradle':'8.10.2','agp':'8.8.2','kotlin':'2.0.0','java_target':'17','packaging_java':java_version,'host':'macOS ARM64'},'limits':['Emulator-only prototype, not a vehicle/market approval.','Fixed local mock: AI 생성 일기 목업 입니다.','Windows host execution remains unverified.','Original vehicle audio capture/storage/sync policy remains unconfirmed.']}
manifest.update({'apk_build_source_commit':apk_build_commit,'version_code':artifact['version_code'],
                 'repository':'https://github.com/LSHgrandvoyage/hmg-family-diary',
                 'submission_route':'public-github-source-and-apk; zip-is-a-companion-bundle'})
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
checks=[target_apk,out/'README.md',out/'검증결과.md',out/'manifest.json',out/'source-files.sha256']
(out/'SHA256SUMS.txt').write_text(''.join(f'{sha(p)}  {p.relative_to(out).as_posix()}\n' for p in checks))
archive=parent/(name+'.zip')
with ZipFile(archive,'w',ZIP_DEFLATED) as z:
    for p in sorted(out.rglob('*')):
        if p.is_file():z.write(p,p.relative_to(parent))
archive.with_suffix('.zip.sha256').write_text(f'{sha(archive)}  {archive.name}\n')
print(f'Submission folder: {out}\nUpload ZIP: {archive}\nCommit: {commit}\nAPK SHA-256: {sha(target_apk)}')
