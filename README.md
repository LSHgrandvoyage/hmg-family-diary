# 차곡차곡 · 새벽개발팸

차 안에서 가족이 자유롭게 나눈 이야기를 녹음하고, 일기와 당시의 목소리·사진으로 다시 만나는 차량용 가족 기록 앱입니다.

현대자동차그룹 차량용 앱 개발 공모전 제출용 **Pleos Connect 에뮬레이터 프로토타입**입니다. 차량 앱은 Android APK, 휴대폰은 모바일 웹입니다. 자동차 화자의 일기 생성은 현재 **`AI 생성 일기 목업 입니다.`라는 고정 결과**이며 외부 AI API를 호출하지 않습니다.

## 제출 APK와 실행 안내

| 항목 | 내용 |
|---|---|
| 팀 / 앱 | 새벽개발팸 / 차곡차곡 |
| APK 위치 | `apk/새벽개발팸_차곡차곡_release.apk` |
| 다운로드 | [release APK 내려받기](https://raw.githubusercontent.com/LSHgrandvoyage/hmg-family-diary/main/apk/새벽개발팸_차곡차곡_release.apk) |
| 버전 / 패키지 | 0.2.13 (versionCode 14) / `io.hmg.familydiary.contest` |
| 빌드 | 전용 키로 서명한 `contestRelease`, `debuggable=false` |
| 상세 설치 안내 | [Windows·macOS / 최초 설치·업데이트·복구](docs/contest/release-runbook.md) |
| 파일 무결성 | [APK 메타데이터와 SHA256](docs/contest/release-artifact.json) |

**서버 없이도** 차량에서 녹음 → 실시간 STT → 인식문 확인·수정 → 목업 일기 저장 → 원본 목소리 / 일기 TTS를 시험할 수 있습니다. **휴대폰 연결·사진·동기화**에는 아래 Docker 서버가 필요합니다. 외부 클라우드 서버는 필요하지 않습니다.

## 빠른 실행: Windows PowerShell

준비물은 Android Studio와 [공식 Pleos Connect 에뮬레이터](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator), Docker Desktop(WSL2 / Linux containers), Node.js **24**입니다. SDK·AVD·Docker 이미지는 저장소에 포함하지 않습니다. 호스트 CPU에 맞는 Pleos 이미지를 설치하고 Cold boot 및 [호스트 마이크 입력](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/configure-pleos-connect-emulator)을 설정합니다.

### 1. APK 설치

저장소 루트에서 실행합니다. `emulator-5554`는 예시이므로 `devices`에 나온 실제 serial로 바꿉니다. `5037`은 adb 서버 포트이며 기기 serial이 아닙니다.

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb -s emulator-5554 install -r '.\apk\새벽개발팸_차곡차곡_release.apk'
```

에뮬레이터에서 **차곡차곡**을 열고 마이크 권한과 첫 사용 안내를 확인합니다. 직접 녹음 시작을 누르기 전에는 녹음하지 않습니다. `probeDebug`나 `pleosRelease`가 아니라 위 APK를 사용합니다.

### 2. 휴대폰 연동 서버 실행

GitHub에서 받았다면 저장소 루트, 별도 제출 ZIP을 풀었다면 그 안의 **`source` 폴더**에서 서버 명령을 실행합니다. 아래 IP는 예시이며 `ipconfig`에서 확인한 PC의 실제 Wi-Fi/이더넷 IPv4로 바꿉니다.

```powershell
node --version
docker version
ipconfig
# 처음 실행하고 기존 팀 데이터도 없을 때만 init을 한 번 실행합니다.
node .\scripts\team-test.mjs init 192.168.0.25
node .\scripts\team-test.mjs up
node .\scripts\team-test.mjs configure-release emulator-5554 "$adb"
```

Docker Desktop을 먼저 실행해야 합니다. 첫 `up`은 현재 PC에 맞게 이미지를 빌드하므로 인터넷 연결이 필요합니다. 차량 화면에서 서버 주소를 확인하고 **설정 적용**을 누릅니다. 이 단계는 서버 등록이며 가족 보관함 연결은 다음 단계에서 합니다.

| 용도 | 주소 |
|---|---|
| 휴대폰 / PC 웹 | `https://<PC-IP>:18443/library` |
| 테스트 HTTPS 인증서 설치 안내 | `http://<PC-IP>:18080/` |
| 가입 확인 메일함 (PC에서만) | `http://localhost:18025` |

PC와 휴대폰을 같은 네트워크에 연결하고 안내 페이지에서 **이 테스트 PC가 발급한 공개 CA 인증서**를 설치·신뢰합니다. 가입 확인 메일은 실제 이메일로 발송하지 않고 위 개발 메일함에 도착합니다. 웹 가입·이메일 확인·로그인 → 차량 연결 코드 발급 → 차량 설정에서 **6자리 코드 입력** 순서로 연결합니다.

연결 후 완성한 일기는 원본과 함께 자동 동기화합니다. 작성 중 초안은 기기에 남습니다. 사진 변경은 SSE 알림과 변경분 조회로 받으며 차량의 주차·유휴 상태에서 반영합니다.

### 3. 재실행·업데이트·종료

이미 실행했던 PC에서는 `init`을 반복하지 않습니다. 기존 `.env.team`, `.tools/team`과 Docker 볼륨을 보존합니다.

```powershell
# 평소 다시 켜기
node .\scripts\team-test.mjs up --no-build
# 소스 업데이트 후 재빌드
node .\scripts\team-test.mjs up
# 상태 확인
node .\scripts\team-test.mjs status
# 서버 종료: 기록과 계정 유지
node .\scripts\team-test.mjs stop
```

에뮬레이터 창도 별도로 닫습니다. APK 업데이트는 `install -r`로 수행합니다. IP 변경은 [상세 실행 안내](docs/contest/release-runbook.md), DB 인증 오류·설정 분실은 [복구 안내](docs/contest/release-runbook.md#기존-설정을-잃어버린-경우)를 확인하세요. 평소 종료에 `down -v`를 사용하지 않습니다.

macOS의 adb 경로와 기존 **8443 개발 서버** 연결법도 상세 안내에 있습니다. 신규 팀 서버(18443)와 기존 개발 서버(8443)의 주소·인증서를 혼용하지 않습니다.

## 주요 구현

- 자유 발화 녹음, Pleos ON_DEVICE STT, 인식문 수정, 고정 목업 일기 저장.
- 전체 원본 오디오와 발언별 타임라인, 차량 TTS와 일기/목소리 전환, 선택 재생·반복.
- 휴대폰 6자리 연결, 완성 일기 자동 동기화, 사진 첨부·조회·삭제, 검색과 차량 필터.
- 기록 당시 차량 정보와 녹음 시작 위치 보존. 미지원 정보는 임의로 채우지 않습니다.
- 차량 주차/모의 주행 화면, 사용자가 시작한 오디오의 화면 밖 지속과 포커스 상실 대응, 공통 플레이어.
- 차량 라이트/다크/자동 전환, 모바일 라이트/다크 수동 전환.

## 테스트 환경과 필요한 설정

| 구분 | 기준 |
|---|---|
| 실행 검증 호스트 | macOS ARM64 |
| 차량 환경 | Pleos Connect **2.1.0**, Android API **34**, ARM64 이미지 |
| Android Emulator | **37.2.13** |
| 에뮬레이터 화면 | 물리 **2560×1440**, 앱 참조 UI **1280×720** |
| Android 빌드 | compile/target SDK 35, Build Tools 35.0.0, JDK 17+, Gradle 8.10.2, AGP 8.8.2, Kotlin 2.0.0 |
| 사용 Pleos SDK | SpeechToText 3.3.1, TextToSpeech 3.3.1, FusedLocation 1.1.3 |
| 서버 실행 | Node.js 24, Docker Compose v2, PostgreSQL 18, HTTPS 프록시, 개발 메일함 |
| 초기 설정 | 마이크 허용, 호스트 마이크 입력, 로컬 HTTPS 인증서 신뢰, 차량 서버 등록, 6자리 가족 연결 |

Windows에서는 해당 호스트용 공식 이미지를 사용합니다. macOS 검증을 Windows·실차 검증으로 간주하지 않습니다. 앱의 시험 P/D 전환은 실제 차량 주행 허용의 근거가 아닙니다.

## 구현 범위와 미확인 사항

AI 일기 생성은 목업이며 자동 화자 식별은 구현하지 않았습니다. 원본 음성과 STT 결과는 실제 입력이며 고정 목업으로 대체하지 않습니다. 차량 음성을 외부 STT 서비스로 전송하지 않습니다.

원본 오디오는 Android AudioRecord로 확보한 PCM을 WAV로 보관하고 Pleos `sendAudio()`에 전달하는 에뮬레이터 구현입니다. **차량 마이크 원본 취득·장기 보관·휴대폰 전송 전체 경로의 공식 지원/공모전 적합성은 미확인**입니다. 실차·마켓 주행 정책, 실제 통화/내비 혼합 음량, 운영 SMTP·백업 복구·클라우드 배포도 별도 검증이 필요합니다. [공식 문서 재검토](docs/contest/platform-review-2026-11-15.md)와 [기능 검증 근거](docs/evidence/c052-narration-lyrics.md)를 구분해 읽어 주세요.

## 소스·문서

- [기능별 SDD 명세](specs/README.md) · [제품 정의](docs/product-brief.md) · [헌장](.specify/memory/constitution.md)
- [설치·업데이트·복구](docs/contest/release-runbook.md) · [제출 체크리스트](docs/contest/submission-checklist.md)
- [시스템·데이터·서비스 아키텍처](docs/architecture/README.md) · [오픈소스 고지](THIRD_PARTY_NOTICES.md)
- [과거 개발 기록](docs/evidence/compose-runtime.md): 과거 버전 화면·명령과 현재 실행 안내를 구분합니다.

개발 의존성은 Node24/pnpm11.13.1 기준입니다. `pnpm install --frozen-lockfile` 후 `pnpm test`, `pnpm typecheck`를 실행합니다. Android 재빌드는 [서명·빌드 절차](docs/contest/release-runbook.md#소스에서-apk-빌드)를 따릅니다. 배포 서명 키는 공개하지 않으므로 직접 재빌드한 APK와 제출 APK는 서명이 다를 수 있습니다.

개인 계정·DB·음성·사진·정확한 위치·환경 비밀·서명 키는 저장소와 제출 ZIP에 포함하지 않습니다. 별도 제출 ZIP은 소스+APK 실행용 보조 묶음이며 지원서·동의서는 별도로 제출합니다.
