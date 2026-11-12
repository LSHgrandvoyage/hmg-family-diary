#!/usr/bin/env python3
"""Build/sign contest release. Local key and passwords never enter the submission bundle."""
from pathlib import Path
import json, os, secrets, subprocess, sys

root = Path(__file__).resolve().parent.parent
private = root / '.tools' / 'signing'
private.mkdir(parents=True, exist_ok=True, mode=0o700)
key = private / 'chagok-contest.p12'
passwords = private / 'passwords.json'
env = os.environ.copy()
if not env.get('JAVA_HOME') and sys.platform == 'darwin':
    env['JAVA_HOME'] = subprocess.check_output(['/usr/libexec/java_home', '-v', '17'], text=True).strip()
keytool = str(Path(env['JAVA_HOME'])/'bin'/'keytool') if env.get('JAVA_HOME') else 'keytool'
if '--init-key' in sys.argv:
    if key.exists() or passwords.exists():
        raise SystemExit('Signing files already exist; refusing to overwrite them.')
    password = secrets.token_hex(32)
    with passwords.open('x') as f:
        os.chmod(passwords, 0o600)
        json.dump({'store_password': password, 'key_password': password}, f)
    env['CHAGOK_STORE_PASSWORD'] = password
    subprocess.run([keytool, '-genkeypair', '-keystore', str(key), '-storetype', 'PKCS12',
                    '-storepass:env', 'CHAGOK_STORE_PASSWORD', '-keypass:env', 'CHAGOK_STORE_PASSWORD',
                    '-alias', 'chagok-contest', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
                    '-dname', 'CN=ChagokChagok, OU=Contest, O=SaebyeokDevFam, C=KR'], env=env, check=True)
    os.chmod(key, 0o600)
    print('Created local dedicated signing key. Keep .tools/signing private and backed up.')
    raise SystemExit(0)
if not key.is_file() or not passwords.is_file():
    raise SystemExit('Run python3 scripts/build-contest-release.py --init-key once, or restore your existing local signing files.')
secret = json.loads(passwords.read_text())
env.update(CHAGOK_KEYSTORE=str(key), CHAGOK_STORE_PASSWORD=secret['store_password'], CHAGOK_KEY_PASSWORD=secret['key_password'])
tasks = [':app:assembleContestRelease', ':app:testContestReleaseUnitTest']
if '--tests' in sys.argv:
    tasks += ['-PtestRelease=true', ':app:assembleContestReleaseAndroidTest']
if os.name == 'nt':
    command = [str(root/'apps/vehicle/gradlew.bat')]
    cwd = root/'apps/vehicle'
else:
    command = [str(root/'scripts/vehicle-gradle.sh')]
    cwd = root
subprocess.run(command + tasks + ['--no-daemon', '--max-workers=2', '--console=plain'], cwd=cwd, env=env, check=True)
print('Built contestRelease with private signing credentials; APK is under apps/vehicle/app/build/outputs/apk/contest/release/.')
