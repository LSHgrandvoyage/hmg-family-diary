# 차곡차곡 — 새벽개발팸

차 안에서 가족이 자유롭게 나눈 이야기를 녹음하고, 일기와 당시 목소리·사진으로 다시 보는 차량용 가족 기록 앱입니다.

이 묶음은 1차 제출 검토용 **서명된 contestRelease APK와 해당 소스**입니다. 앱은 공식 Pleos 에뮬레이터용이며 실제 차량/마켓 승인 완료 버전은 아닙니다. 일기 생성은 `AI 생성 일기 목업 입니다.`라는 고정 문구를 앱 내부에서 반환합니다. 실제 AI API·자동 화자 식별은 사용하지 않습니다.

## 파일 구성

- `apk/새벽개발팸_차곡차곡_release.apk`: 실행 가능한 release 빌드. 패키지 `io.hmg.familydiary.contest`, 버전0.2.5. 디버깅 비활성, 별도 전용 키 서명.
- `source/`: 해당 커밋의 소스, Docker 실행 설정, 개발·검증 문서.
- `manifest.json`, `SHA256SUMS.txt`: 소스 커밋, 빌드 환경, APK/소스 무결성 정보.
- `검증결과.md`: 실제 실행 범위와 미검증 사항.

개발용 `io.hmg.familydiary.probe`와 별도 설치되므로 기존 개발 앱의 데이터는 변경하지 않습니다. 키·비밀번호·개인 녹음·사진·DB·SDK/AVD·Docker 이미지는 포함하지 않습니다.

## 1. 차량 앱만 먼저 실행하기

[공식 설치 안내](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator)에 따라 Pleos Connect2.1.0 에뮬레이터를 설치하고 Cold boot합니다. Windows는 호스트에 맞는 공식 이미지를 사용하며, Mac ARM AVD를 복사하지 않습니다. [GPU·마이크 설정 안내](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/configure-pleos-connect-emulator)도 확인합니다.

검증 환경은 Mac ARM64 / Pleos Connect2.1.0 API34 ARM64 / Emulator37.2.13, 물리 화면2560×1440, 차량 UI 참조1280×720입니다. Windows 실제 실행은 별도 확인이 필요합니다.

Windows PowerShell에서 제출 폴더로 이동한 뒤:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
# 실제 출력된 serial을 사용합니다. 아래는 예시입니다.
& $adb -s emulator-5554 install -r '.\apk\새벽개발팸_차곡차곡_release.apk'
```

SDK 경로가 다르면 `$adb`를 수정합니다. 에뮬레이터에서 **차곡차곡**을 실행하고 마이크 권한을 허용합니다. 첫 안내에서 녹음·보관·가족 공유 내용을 읽고 함께 탄 가족에게 알렸음을 확인한 뒤 **시작하기**를 누릅니다. 녹음 홈에서 **녹음 시작**을 눌러야 녹음됩니다. 초기 화면에는 모의 상태 선택이 없으며, 신호가 없는 에뮬레이터는 최초 확인 때 기본 시험 P로 시작합니다. 앱 우측 상단의 **시험: 주행으로 전환 / 주차로 전환**을 사용합니다. 이미 알려진 차량 상태는 유지하며 시험 P/D를 실제 차량 승인으로 간주하지 않습니다.

**별도 서버 없이 가능한 흐름:** 녹음 → 종료 → 확인문 수정 → 일기로 만들기 → 고정 목업 확인 → 저장 → 원본 목소리 재생 / 일기 TTS. 원본 음성과 인식문은 실제 입력으로 보존하며, 고정 목업으로 바꾸지 않습니다. 외부 AI·개발자 PC의 목업 서버·adb reverse4319가 필요하지 않습니다.

## 2. 휴대폰 연동 서버 실행하기

Docker Desktop(WSL2, Linux containers)과 Node24를 설치합니다. 개발 의존성의 별도 pnpm 설치는 필요하지 않습니다. PC와 휴대폰을 같은 네트워크에 연결합니다.

```powershell
cd .\source
ipconfig
# 아래 주소를 PC의 실제 LAN IPv4로 바꿉니다.
node .\scripts\team-test.mjs init 192.168.0.25
node .\scripts\team-test.mjs up
node .\scripts\team-test.mjs configure-release emulator-5554 "$adb"
```

첫 실행은 인터넷에서 의존성과 기반 이미지를 받아 PC 아키텍처에 맞게 빌드합니다. 외부 클라우드 서버는 필요하지 않습니다. 팀원 PC마다 별도 보관함이 만들어집니다.

`configure-release`는 **서버 주소·공개 CA만** 앱에 전달합니다. 차량 화면에서 본인 PC 주소인지 확인하고 **설정 적용**을 누릅니다. 비디버그 앱이므로 `run-as`를 쓰는 기존 debug 연결 명령은 사용하지 않습니다. 진행 중인 녹음/편집을 마치고 주차 상태에서 설정합니다. 이미 연결된 앱에는 기존 서버와 다른 CA를 적용할 수 없습니다.

| 용도 | 주소 |
|---|---|
| 휴대폰/PC 웹 | `https://<PC-IP>:18443/library` |
| 공개 개발 CA 설치 안내 | `http://<PC-IP>:18080/` |
| 가입 확인 메일함 — PC에서만 | `http://localhost:18025` |

휴대폰은18080 안내에 따라 인증서를 설치하고 신뢰한 뒤18443으로 접속합니다. Windows 인증서 설정과 방화벽 안내는 `source/docs/team/windows-testing.md`에 있습니다. 가입 메일은 실제 이메일로 발송하지 않으며 PC의18025 개발 메일함에서 확인합니다.

웹에서 가입·로그인 → 차량 연결 코드 발급 → 차량 설정의 휴대폰 연결에 코드 입력 순서로 연결합니다. 이후 완성 일기는 매번 공유를 누르지 않아도 자동 전송됩니다. 사진 변경은 차량이 주차·유휴 상태일 때 반영됩니다.

설정 파일이 필요한 경우 `node .\scripts\team-test.mjs export`로 `.tools/team/chagok-server.json`을 생성합니다. 앱의 ‘테스트 서버 설정 가져오기’에서 파일을 선택하거나 내용을 붙여넣을 수 있습니다. Pleos 활성 사용자에서 파일 선택기를 지원하지 않을 수 있으므로 `configure-release`를 권장합니다.

## 3. 시연 순서

1. 첫 안내 확인 → 시작하기 → 녹음 홈의 녹음 시작을 누른 뒤 자유롭게 이야기하고 파형/녹음 시간을 확인합니다.
2. 종료 후 인식문을 수정하고 일기를 만듭니다. 본문은 고정 목업임을 확인합니다.
3. 저장한 일기에서 전체 원본·발언별 타임라인을 확인합니다. 시간 정보가 없는 이전 기록은 전체 재생을 제공합니다.
4. 연결된 휴대폰에서 자동 수신, 사진 추가, 원본 청취를 확인합니다.
5. 차량의 TTS 이어듣기·종료, 라이트/다크/자동 전환을 확인합니다. 휴대폰 테마는 수동 전환입니다.
6. 모의 주행에서는 문장 수정/사진/긴 본문을 숨기고 음성 기능만 제공합니다. 미녹음 상태에서 P로 복귀하면 녹음 홈으로 돌아옵니다.

## 4. 종료와 다음 실행

서버 명령은 `source` 폴더에서 실행합니다.

```powershell
node .\scripts\team-test.mjs stop
# 에뮬레이터 창도 별도로 닫습니다.
# 다음 실행
node .\scripts\team-test.mjs up --no-build
# IP 변경 시 비밀번호를 새로 만들지 않습니다.
node .\scripts\team-test.mjs address 192.168.0.30
node .\scripts\team-test.mjs up --no-build
node .\scripts\team-test.mjs configure-release emulator-5554 "$adb"
```

일기·원본·사진은 named volume에 유지됩니다. `down -v`나 Docker volume 삭제는 데이터를 지우므로 종료 명령으로 쓰지 않습니다. Docker volume 유지 자체는 별도 백업을 뜻하지 않습니다.

## 5. 소스 빌드

Android SDK35/build-tools35.0.0, JDK17+, Gradle wrapper8.10.2, AGP8.8.2, Kotlin2.0.0을 사용합니다. 공식 SDK는 STT/TTS3.3.1, FusedLocation1.1.3입니다. Python3 및 Android SDK 경로를 설정한 뒤 `source`에서:

```text
python3 scripts/build-contest-release.py --init-key
python3 scripts/build-contest-release.py
```

Windows의 Python 실행명은 설치에 따라 `py -3`일 수 있습니다. `apps/vehicle/local.properties` 또는 `ANDROID_HOME`에 SDK를 지정합니다. 최초 명령은 자신의 로컬 전용 키를 만들며 기존 키를 덮어쓰지 않습니다. 배포 APK의 서명 키는 포함하지 않으므로 본인이 재빌드한 APK는 새 키로 서명됩니다. 기존 배포 APK와 서명이 다른 재빌드 APK를 설치하려면 별도 시험 환경을 사용합니다.

## 6. 구현 범위와 제한

- 공식 STT/TTS와 원본 캡처·재생, 원본 구간, 사진, HTTPS 인증/동기화는 에뮬레이터/로컬 서버 구현입니다. 자동차 화자 LLM 정리와 자동 화자 분리는 목업/향후 계획입니다.
- 차량 마이크 원본 취득·보관·휴대폰 전송의 전체 공식 허용 범위는 아직 확인되지 않았습니다. 현재 구현을 플랫폼 승인 완료로 주장하지 않습니다.
- 실제 차량의 주행 UX·마이크·포커스·내비 음량 혼합과 마켓 심사는 별도입니다. 모의 P/D가 실차 허용을 입증하지 않습니다.
- 자세한 근거는 `source/docs/contest/platform-review-2026-11-12.md`, 실제 실행 범위는 `검증결과.md`를 확인합니다.

[공식 접수 안내](https://appdevchallenge.auto-hmg.io/guide/submission)에 따라 비공개 저장소 대신 소스+APK 압축파일의 다운로드 링크를 제출할 수 있습니다. 이 묶음의 생성은 메일 접수·링크 업로드·심사 승인 완료를 뜻하지 않습니다. 지원서와 전원 동의서는 별도로 첨부합니다.

## 연결 설정과 인증서 (C037)

이 버전은 숫자6자리 연결 코드를 사용합니다. APK와 서버 소스를 함께 업데이트하고 휴대폰에서 새 코드를 발급하세요. 기존 차량 연결·기록은 유지됩니다.

- 브라우저에 설치하는 공개 CA 인증서: 이 PC가 만든 HTTPS 인증서를 신뢰하도록 합니다. 로컬 IP 서버에는 공인 인증서가 없으므로 테스트 환경에서 사용합니다. 인증서만으로 서버 주소나 가족 보관함이 차량에 등록되지는 않습니다.
- 차량의 `연결 서버 설정`: 같은 PC의 HTTPS 주소와 공개 CA를 앱에 등록합니다. 파일 선택기는 선택 경로이며, Pleos가 파일 선택을 지원하지 않으면 아래 PC 명령을 사용합니다.
- 휴대폰에서 만든6자리 코드: 서버가 등록된 차량을 내 가족 보관함에 연결합니다. 만료시간5분이며 한 번만 사용할 수 있습니다.

이미 Docker 서버를 켰고 인증서를 설치했다면, **제출 폴더 안 `source` 폴더**에서 PowerShell로 실행합니다.

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
# 목록에 나온 실제 기기 ID를 사용합니다. 5037은 기기 ID가 아닙니다.
node .\scripts\team-test.mjs configure-release emulator-5554 "$adb"
```

차량 확인창의 주소가 본인 PC 주소인지 확인하고 `설정 적용`을 누릅니다. 이후 휴대폰에서 새 연결 코드를 만들고 차량에 입력합니다. 파일 선택이나 에뮬레이터에 인증서를 따로 설치할 필요 없이 이 명령이 주소·공개 CA를 전달합니다.

Windows 업데이트는 기존 source 폴더에 새 소스를 덮어쓰되 `.env.team`과 `.tools/team`을 보존한 뒤 `node .\scripts\team-test.mjs up`으로 이미지를 재빌드합니다. `up --no-build`는 이전8자리 서버를 계속 사용할 수 있으므로 업데이트 때는 사용하지 않습니다. APK는 기존 앱을 삭제하지 않고 `adb install -r`로 업데이트합니다.

## 0.2.2 기존 원본 전송 실패 복구

이 버전은2초대 WAV 길이의 소수점 오차와 차단된 원본 재시도를 보정합니다. 기존 `.env.team`/`.tools/team` 및 Docker 볼륨을 유지한 채 새 source로 서버를 재빌드하고, APK는 install -r로 업데이트하세요. 기존 차량 연결은 다시 만들 필요가 없습니다. 주차 상태에서 녹음·재생·편집을 마친 뒤 설정의 `지금 동기화`를 누릅니다. 이전 원본 검증 실패는 원본과 본문을 바꾸지 않고 재시도합니다. 작성 중 일기는 완성 전까지 기기에만 보관됩니다.

새 APK에는6자리 연결 코드 변경도 포함됩니다. 이미 연결된 차량은 기존 연결을 유지합니다. 주행 청취는 기본 일기 이어 듣기이며 같은 일기의 원본으로 전환합니다. 원본의 가운데 버튼은 재생/일시정지, TTS는 재생/정지입니다. TTS 정지 후 다시 재생하면 해당 일기 처음부터 읽습니다.


## 0.2.3 첫 사용 안내와 명세 정리

첫 화면은 기존 라이트/다크 디자인에 맞춘 녹음·보관 안내입니다. P/주행/차량 신호 체크박스를 제거했고, 명시적 안내 확인 후 녹음 홈으로 들어갑니다. 위치·연결 서버 설정은 설정 화면에 있습니다. 최초 시험 P 설정 이후 UNKNOWN은 미디어를 차단하며 자동으로 P로 돌리지 않습니다.

기능 정본은 `source/specs/README.md`의8개 디렉터리에서 확인합니다. 기존 단일 명세는 사후 정리 이력으로 보존했고 새 기능은 spec/plan/tasks/검증 근거를 연결합니다.0.2.2의 원본 전송 복구와 단일 주행 플레이어도 포함합니다.

기존0.2.2 테스트 앱은 새 APK를 `install -r`로 덮어 설치합니다.0.2.0/0.2.1에서 올리는 경우 원본 길이 검증 수정이 서버에도 반영되도록 새 source를 적용하고 `node .\scripts\team-test.mjs up`으로 재빌드합니다. `.env.team`·`.tools/team`·Docker 볼륨과 앱 데이터를 유지합니다.

## 0.2.4 차곡차곡 로고 적용

사용자 제공 로고를 Android 실행 아이콘·초기 안내, 차량 왼쪽 메뉴, 모바일 보관함 상단에 적용했습니다. 모바일 앱 이름은 차곡차곡으로 표시합니다. 라이트·다크에서도 원본 색상과 비율을 유지합니다.

기존0.2.3 앱은 새 APK를 `install -r`로 덮어 설치하면 연결·기록을 유지합니다. 모바일은 이번 source로 서버를 재빌드한 뒤 새로고침합니다(Windows 팀 환경: `node .\scripts\team-test.mjs up`). 앱 아이콘이 런처의 최근 앱 칸에 이전 모양으로 남으면 앱 목록을 다시 열어 확인합니다. 앱 데이터나 Docker 볼륨을 삭제할 필요는 없습니다.

검증 범위: 독립 headless 웹, macOS의 공식 Pleos 에뮬레이터. Windows/실차 확인은 별도입니다. 세부 근거는 `검증결과.md`와 `source/docs/evidence/c041-brand-logo.md`에 있습니다.

## 맥북 기본 Compose 서버(8443)에 제출용 앱 연결하기

이미 `.env.runtime`/`compose.yaml`로 실행 중인 개발 환경에서는 팀 서버를 새로 만들지 않습니다. 저장소 루트(제출 묶음에서는 기존 runtime 설정을 보존한 source)에서 실행합니다.

```sh
# 코드 업데이트 때는 반드시 재빌드한다. 볼륨과 .env.runtime은 그대로 유지한다.
docker compose --env-file .env.runtime --profile dev up -d --build
# adb devices에서 확인한 에뮬레이터 ID
node scripts/configure-runtime.mjs emulator-5580
```

차량 확인창에서 `.env.runtime`의 서버 주소를 확인하고 **설정 적용**을 누릅니다. 휴대폰 페이지를 새로고침한 뒤 새6자리 코드를 발급해 차량 설정의 **휴대폰 연결하기**에 입력합니다. 기존에 연결된 차량은 다시 페어링할 필요가 없습니다. 서버 주소/공개 CA 전달은 가족 연결 완료와 다릅니다. 주차·유휴 상태에서 실행하세요.

이 명령은 기본 서버(일반적으로8443) 전용입니다. `.env.team`/18443 팀 서버는 기존 `team-test.mjs configure-release` 명령을 사용합니다. 화면이4칸/8자리로 보이면 이전 이미지가 실행 중일 수 있으므로 단순 재시작 대신 `--build` 후 새로고침하세요. [C042 검증](../evidence/c042-runtime-connection.md)을 참고하세요. 이번 실행 도구 추가는0.2.4 APK를 그대로 사용합니다.


## 0.2.5 연결 안내와 주행 화면 개편

- 휴대폰 보관함의 차량 상태는 실제 활성 연결 기준으로 `연결됨`을 표시합니다. 연결 전에는 코드 만들기 → 차량 설정에서 입력 → 완료 확인 순서를 안내합니다. 연결 후에는 코드 칸과 `보관함으로`를 없애고 차량 관리만 제공합니다.
- 휴대폰의 테마 전환은 원형 배경 없는 해/달 아이콘입니다. 터치 영역과 접근성 이름은 유지합니다.
- 차량 주행 화면은 대기/녹음 중/녹음 멈춤/일기 듣기4가지 새 디자인입니다. 녹음의 `이 순간 표시`는 없으며 실제 입력 파형을 표시합니다. 원본 듣기는 실제 재생 진행률, TTS는 실제 낭독 경과시간을 표시합니다. 현재 SDK에 TTS 총길이·일시정지가 없어 TTS 정지 후 재생은 현재 일기 처음부터 시작합니다.
- `녹음하러 가기`는 재생을 종료하고 대기 화면으로 이동합니다. 녹음은 다시 시작 버튼을 눌러야 시작됩니다.
- 기존 설치는 같은 서명의 APK를 `adb install -r`로 갱신합니다. 앱/DB 데이터를 지우지 않습니다. 현재 웹은 이미지를 재빌드해 반영해야 합니다.

검증: 명세 정합성·TypeScript·Android23개 단위 검사·release 빌드, 독립 headless의 합성 모바일/주행 양쪽 테마, 실제 Compose 정적 자산, 로고 회귀, 기존 에뮬레이터 덮어 설치·초기 화면 로드. 이번 변경에서 실차/Windows/사용자 실제 가족 기록의 음성 재생은 재검증하지 않았습니다. 자세한 결과는 `검증결과.md`에 있습니다.
