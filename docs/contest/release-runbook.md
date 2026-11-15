# 차곡차곡 실행 안내 · 새벽개발팸

현재 제출물은 **contestRelease 0.2.13 / code14**입니다. 공식 Pleos 에뮬레이터용 서명 release이며 실제 차량/마켓 승인 버전이 아닙니다. 일기 생성은 `AI 생성 일기 목업 입니다.`라는 고정 결과를 앱 내부에서 반환합니다. 실제 AI API·자동 화자 식별은 사용하지 않습니다.

## 어디에서 명령을 실행하나요?

| 받은 자료 | APK 설치 명령 위치 | 서버·빌드 명령 위치 |
|---|---|---|
| GitHub 저장소 clone / Download ZIP | `apk` 폴더가 보이는 저장소 루트 | 같은 저장소 루트 |
| `새벽개발팸_차곡차곡_제출용.zip` | 압축을 푼 뒤 `apk`와 `source`가 보이는 폴더 | 그 안의 `source` 폴더 |

이하 **자료 루트**는 APK 설치 위치, **소스 루트**는 `compose.team.yaml`과 `scripts`가 보이는 위치를 뜻합니다. GitHub와 별도 제출 ZIP의 폴더 구조를 혼동하지 마세요.

제출 ZIP에는 `apk/새벽개발팸_차곡차곡_release.apk`, `source/`, 실행 안내, 검증 결과, `manifest.json`, `source-files.sha256`, `SHA256SUMS.txt`가 있습니다. Docker 이미지·SDK/AVD·DB·개인 녹음·사진·계정 비밀·서명 키는 없습니다. 컨테이너는 실행 시 각 PC에서 빌드합니다.

## 먼저 선택: 처음 설치인가요, 업데이트인가요?

**이미 실행했던 PC에서는 `init`을 다시 하지 않습니다.** 새 ZIP에 이전 비밀번호는 없으므로 기존 `.env.team`과 `.tools/team`을 보존합니다. 새 폴더로 옮겼다면 기존 설정부터 복사한 뒤 `up`으로 재빌드합니다. 데이터 볼륨만 남겨 놓고 새 비밀번호를 만들면 DB 인증에 실패합니다.

```powershell
# 기존 설정을 보존한 소스 루트에서 실행
node .\scripts\team-test.mjs up
```

처음 실행하고 기존 팀 데이터도 없는 PC에서만 아래 최초 설치의 `init`을 한 번 사용합니다. APK 업데이트는 기존 앱을 지우지 않고 `install -r`로 합니다.

## 1. 차량 앱 설치

[공식 Pleos 설치 안내](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator)를 따라 호스트 CPU에 맞는 Pleos Connect2.1.0 이미지를 설치합니다. Mac ARM AVD를 Windows로 복사하지 않습니다. Cold boot와 [GPU·마이크 설정](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/configure-pleos-connect-emulator)을 확인합니다.

검증 환경: **macOS ARM64 / Pleos Connect2.1.0 / API34 ARM64 / Emulator37.2.13 / 2560×1440**, 차량 UI 참조 **1280×720**입니다. Windows의 실행 재현과 실차 검증은 별도입니다.

Windows PowerShell, **자료 루트**:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb -s emulator-5554 install -r '.\apk\새벽개발팸_차곡차곡_release.apk'
```

`emulator-5554`는 `devices`에 나온 값으로 바꾸며, adb 서버 포트5037과 혼동하지 않습니다. PowerShell은 `$adb devices`가 아니라 **`& $adb devices`**로 실행합니다.

macOS, **자료 루트**:

```sh
diary_adb="$HOME/Library/Android/sdk/platform-tools/adb"
"$diary_adb" devices
"$diary_adb" -s emulator-5554 install -r './apk/새벽개발팸_차곡차곡_release.apk'
```

SDK를 다른 곳에 설치했다면 경로를 바꿉니다. 에뮬레이터에서 차곡차곡을 실행하고 마이크 권한·첫 사용 안내를 확인합니다. 사용자 시작 전에는 녹음하지 않습니다. 우측 상단 시험 P/D 버튼은 에뮬레이터 시연용입니다.

**서버 없이 가능한 흐름:** 녹음 → 종료 → 인식문 확인·수정 → 일기로 만들기 → 목업 일기 저장 → 원본 목소리 / 일기 TTS. 개발자 PC의 목업 서버나 adb reverse4319가 필요하지 않습니다.

## 2. 휴대폰 연동 서버 최초 설치

Docker Desktop을 실행하고 Node.js24를 설치합니다. Windows는 WSL2 / Linux containers를 사용합니다. 서버 실행만 할 때 별도 pnpm 설치는 필요하지 않습니다. PC와 휴대폰을 같은 네트워크에 연결합니다.

Windows PowerShell, **소스 루트**:

```powershell
node --version
docker version
ipconfig
# 예시 IP를 PC의 실제 Wi-Fi/이더넷 IPv4로 바꿉니다.
node .\scripts\team-test.mjs init 192.168.0.25
node .\scripts\team-test.mjs up
node .\scripts\team-test.mjs configure-release emulator-5554 "$adb"
```

macOS에서도 같은 소스 루트에서 `node scripts/team-test.mjs init <PC-IP>`, `node scripts/team-test.mjs up`, `node scripts/team-test.mjs configure-release <실제-serial> "$diary_adb"` 순서입니다. `<...>`는 실제 값으로 바꿉니다.

처음 `up`은 인터넷에서 기반 이미지·의존성을 받아 현재 CPU용으로 빌드합니다. 외부 클라우드 서버는 필요하지 않으며 PC마다 별도의 보관함이 만들어집니다.

차량에 서버 주소·공개 CA 확인창이 뜨면 본인 PC인지 확인한 뒤 **설정 적용**을 누릅니다. 이 단계는 서버 등록이며 가족 연결은 아래6자리 코드 단계에서 합니다. 이미 연결된 앱에 다른 서버 CA를 무조건 덮어쓰지 않습니다.

| 용도 | 주소 |
|---|---|
| 휴대폰 / PC 웹 | `https://<PC-IP>:18443/library` |
| 공개 개발 CA 설치 안내 | `http://<PC-IP>:18080/` |
| 가입 확인 메일함 (PC에서만) | `http://localhost:18025` |

18080 페이지에서 이 테스트 PC의 공개 CA 인증서를 설치·신뢰합니다. Windows는 현재 사용자의 신뢰할 수 있는 루트 인증 기관, iPhone은 프로파일 설치 후 설정 → 일반 → 정보 → 인증서 신뢰 설정을 확인합니다. 로컬 HTTPS를 신뢰하기 위한 인증서이며 가족 연결을 대신하지 않습니다.

가입 확인 메일은 실제 메일 주소로 발송하지 않고 PC의18025 개발 메일함에 도착합니다. 웹 가입·이메일 확인·로그인 → 차량 연결 코드 발급 → 차량 설정에서 **6자리 입력** 순서로 연결합니다.

네트워크가 막히면 PC/폰의 같은 네트워크 여부와 게스트 격리, Windows 사설 네트워크 방화벽의18080/18443을 확인합니다. DB·목업·개발 메일함 포트는 외부에 공개하지 않습니다. 파일 선택기가 없는 Pleos 환경에서도 위 `configure-release`로 설정할 수 있습니다.

## 3. 확인할 사용 흐름

1. 차량에서 녹음을 시작하고 파형·실시간 STT를 확인합니다. 종료 후 인식문을 수정합니다.
2. 일기로 만들기를 눌러 **고정 목업** 결과를 저장합니다. 원본은 실제 녹음 그대로입니다.
3. 원본 전체와 발언별 타임라인을 듣습니다. 기존 시간 정보 없는 기록은 전체 재생을 제공합니다.
4. 연결된 휴대폰에 완성 일기가 자동으로 나타나는지 확인하고 사진을 추가합니다. 차량은 주차·유휴 상태에서 변경을 반영합니다.
5. 차량의 일기/목소리 전환, 이전·재생/일시정지·다음·반복과 공통 플레이어를 확인합니다. 기본은 선택한 기록 재생이며 반복 선택 시 마지막 뒤 처음으로 이어집니다.
6. 차량 라이트/다크/자동과 모바일 라이트/다크 수동을 확인합니다. 모의 주행은 최근 STT2줄 또는 낭독 현재 문장 주변만 표시하고, 사진·전체 본문·수정은 주차 후에 제공합니다.

TTS 총길이와 단어별 시간은 제공하지 않습니다. 경과시간 및 현재 낭독 문장을 표시하며, 고정 목업 일기는 한 문장만 표시되는 것이 정상입니다.

## 4. 종료·재실행·IP 변경

**소스 루트**에서 실행합니다.

```powershell
node .\scripts\team-test.mjs stop
# 에뮬레이터 창도 별도로 닫습니다.
# 평소 재실행
node .\scripts\team-test.mjs up --no-build
# 소스 변경 후에는 --no-build 없이 재빌드
node .\scripts\team-test.mjs up
# IP 변경: 예시를 새 실제 LAN IPv4로 교체
node .\scripts\team-test.mjs address 192.168.0.30
node .\scripts\team-test.mjs up --no-build
node .\scripts\team-test.mjs configure-release emulator-5554 "$adb"
```

named volume에 계정·일기·원본·사진이 유지됩니다. 평소 종료에 `down -v`나 volume 삭제를 사용하지 않습니다. 볼륨 유지 자체는 별도 백업을 의미하지 않습니다.

## 기존 설정을 잃어버린 경우


새 폴더에서 `init`을 다시 실행하면 새 비밀번호가 만들어집니다. Docker의 기존 DB 볼륨은 이전 비밀번호를 유지하므로 `password authentication failed for user "diary_migrate"`로 migrate가 실패할 수 있습니다. DB가 healthy여도 web/proxy가 Created이면 웹 서버는 아직 실행되지 않은 상태입니다.

새 실행 도구는 기존 팀 데이터 볼륨이 있으면 `init`을 막습니다. 이전 `.env.team`이 있다면 새 source에 복원하고 `up`을 실행하세요. 이전 파일이 없지만 기록을 보존해야 한다면 초기화하지 말고 별도 복구를 진행합니다.

**서버 데이터를 지워도 되는 경우에만** 아래 초기화를 사용합니다. 팀 서버의 계정·연결·일기·원본·사진·목업 상태를 삭제합니다. `hmg-family-diary-team`의 공개 CA/설정 볼륨은 보존하므로 같은 주소라면 인증서 재설치가 필요 없습니다. 다른 Docker 프로젝트는 대상이 아닙니다.

이미 새 `init`으로 만든 현재 `.env.team`이 있으면 그대로 유지합니다. `source` 폴더에서 각 명령이 정상 종료된 뒤 다음 명령을 실행하세요.

```powershell
docker compose --env-file .env.team -f compose.team.yaml -p hmg-family-diary-team down
docker volume rm hmg-family-diary-team_pg_data hmg-family-diary-team_audio_data hmg-family-diary-team_photo_data hmg-family-diary-team_probe_data
node .\scripts\team-test.mjs up --no-build
```

위 경로에서는 `init`을 다시 실행하지 않으며 `down -v`를 사용하지 않습니다.

현재 `.env.team`도 없어서 새 도구의 `init`이 중단된 경우에는 위 Compose 명령을 쓸 수 없습니다. **동일하게 서버 데이터 삭제를 선택한 경우에만**, PowerShell에서 정확한 팀 프로젝트 컨테이너를 정리한 후 데이터 볼륨을 지우고 최초 설정을 만듭니다.

```powershell
$teamContainers = @(docker ps -aq --filter "label=com.docker.compose.project=hmg-family-diary-team")
if ($teamContainers.Count -gt 0) { docker stop $teamContainers }
if ($teamContainers.Count -gt 0) { docker rm $teamContainers }
docker volume rm hmg-family-diary-team_pg_data hmg-family-diary-team_audio_data hmg-family-diary-team_photo_data hmg-family-diary-team_probe_data
# 이 분기만 현재 .env.team이 없으므로 실제 PC IPv4로 최초 설정을 만듭니다.
node .\scripts\team-test.mjs init 192.168.0.25
node .\scripts\team-test.mjs up
```

 서버 초기화로 기존 차량 인증도 무효가 됩니다. 차량이 접속하면 이전 보관함의 공유 사본이 정리될 수 있습니다. 웹에서 새로 가입하고, PC의 `http://localhost:18025`에서 이메일을 확인한 다음 휴대폰에서 새6자리 코드를 발급해 차량을 다시 연결하세요. APK 재설치/앱 데이터 초기화는 기본 복구 절차가 아닙니다.

정상 완료는 `up`의 HTTPS health 확인과 Web 주소 출력으로 확인합니다. 웹은 `https://<PC-IP>:18443/library`입니다. 실패하면 상태와 로그를 확인합니다.

```powershell
node .\scripts\team-test.mjs status
docker compose --env-file .env.team -f compose.team.yaml -p hmg-family-diary-team logs --no-color --tail 60 migrate
```

이전 실행 도구에 `status`가 없으면 `docker compose --env-file .env.team -f compose.team.yaml -p hmg-family-diary-team ps -a`를 사용합니다. `.env.team`의 비밀번호는 로그와 함께 공유하지 않습니다.


## 맥북의 기존 8443 개발 서버에 연결하기

이미 `.env.runtime`/`compose.yaml`로 실행 중인 환경에서는 팀 서버를 중복으로 만들지 않습니다. **기존 개발 저장소 루트**에서:

```sh
docker compose --env-file .env.runtime --profile dev up -d --build
node scripts/configure-runtime.mjs emulator-5580 .tools/android-sdk/platform-tools/adb
```

serial과 adb 경로는 실제 환경에 맞춥니다. 기본 서버의 웹은 `https://<PC-IP>:8443/library`, 설치 안내는8080, 개발 메일함은 `http://localhost:8025`입니다. 팀 서버의18443/18080/18025·CA와 혼용하지 않습니다.

종료는 `docker compose --env-file .env.runtime --profile dev stop`입니다. IP가 바뀐 기존 환경의 주소 갱신은 `pnpm exec tsx scripts/refresh-runtime.ts`로 수행합니다. 이미 있는 환경 설정을 재초기화하지 않습니다.

## 소스에서 APK 빌드

Android SDK35 / Build Tools35.0.0, JDK17+, Python3를 준비합니다. Gradle8.10.2, AGP8.8.2, Kotlin2.0.0은 프로젝트에서 지정합니다. 공식 SDK는 STT/TTS3.3.1, FusedLocation1.1.3입니다. `ANDROID_HOME` 또는 `apps/vehicle/local.properties`에 SDK 경로를 지정합니다.

소스 루트에서:

```text
python3 scripts/build-contest-release.py --init-key
python3 scripts/build-contest-release.py
```

Windows의 Python 실행명은 `py -3`일 수 있습니다. 첫 명령은 키가 없을 때 한 번만 실행합니다. 기존 배포 키는 포함하지 않으므로 직접 재빌드한 APK의 서명은 제출 APK와 다를 수 있습니다. 이 경우 별도 시험 AVD를 사용하세요. `apk/`에는 검증된 제출 APK만 유지하며 빌드 결과를 자동 게시하지 않습니다.

## 구현 범위와 남은 검증

- 일기 생성은 고정 목업, 자동차 화자 LLM 정리와 자동 화자 식별은 향후 계획입니다.
- 공식 ON_DEVICE STT/TTS, 원본/사진/동기화는 에뮬레이터·로컬 서버 구현입니다. 차량 음성을 외부 STT에 보내지 않습니다.
- Android AudioRecord 원본 취득·장기 보관·휴대폰 전송의 전체 공식 지원/공모전 적합성은 미확인입니다. 실제 차량·마켓 주행 UX 및 통화/내비 혼합 음량도 별도 검증 대상입니다.
- 공개 SDK를 사용했다는 사실과 앱 전체가 공식 승인을 받았다는 주장은 구분합니다. 본 자료는 승인서가 아닙니다.

관련 문서는 소스 루트의 `docs/contest/platform-review-2026-11-15.md`, `docs/evidence/c052-narration-lyrics.md`와 `docs/evidence/c053-public-submission.md`입니다. 제출 ZIP에서는 소스 루트 앞에 `source/`가 붙습니다.

## 제출 묶음의 용도

현재는 공개 GitHub 저장소에 소스와 APK를 함께 제출합니다. 별도 ZIP은 같은 소스 커밋과 APK를 받는 실행용 보조 자료입니다. ZIP의 `manifest.json`은 제출 소스 커밋과 APK 빌드 기준 커밋을 구분하며, 문서 변경만으로 APK를 재빌드했다고 표시하지 않습니다. 지원서·동의서와 화면 PDF/영상은 ZIP 밖에서 별도 제출합니다.
