# HMG Family Diary

차에서 자유롭게 풀어놓은 가족 이야기를 LLM이 분류·정제해 **일기와 실제 목소리**로 남겨,
차량과 휴대폰에서 다시 읽고 듣는 가족 여행 기록 서비스.

현재는 **Pleos Connect 2.1.0 에뮬레이터용 프로토타입**이다. 차량에서 녹음·공식 ON_DEVICE STT·확인문 수정·목업 일기 저장, 연결된 휴대폰에서 재열람·사진 첨부를 제공한다. 실제 OpenAI API는 호출하지 않는다.

C023에서 완성 일기의 자동 전송, 오프라인 전송 대기열, 재시작 복구와 삭제·충돌 보호를 추가했다. 연결 후에는 일기마다 공유를 누르지 않는다. C024에서 검색·차량 필터를 하나로 합치고 양쪽 라이트/다크 자동·수동 전환을 추가했다. C025에서 차량 TTS 플레이리스트를 추가했다.

C021에서 공식 FusedLocation 시작 위치, 공식 한국어 TTS, 화면과 분리한 원본·일기 청취, 차량 정보별 필터와 공유/수신 상태를 추가했다. 구현·실행 증거 및 실차 미검증 범위는 [현재 검증 기록](docs/evidence/compose-runtime.md#c021--공모전-보완)을 따른다.

**시연할 APK는 `probeDebug`다.** `demo`는 과거 합성 화면이며 `pleosRelease`는 플랫폼 검증 전 잠금 화면이다. [심사용 실행 안내](docs/contest/README.md)에 SDK 버전, 실행 순서, 시연 범위와 패키징 방법을 정리했다. 원본 AudioRecord 캡처·보관·휴대폰 전달의 공개 지원 범위와 실제 주행 허용은 별도 확인이 필요하다.

## 지금 실행하기

Docker만 있다면 화면을 빌드해 볼 수 있다. 일기·위치·목소리는 합성 자료다. 사용자가 선택한 사진은 서버로 전송하지 않고 같은 주소의 브라우저 IndexedDB에 저장한다. 새로고침 후 다시 볼 수 있지만 기기 간 공유되지 않고 브라우저 데이터를 지우면 삭제된다.

일기 상세의 **사진 추가**로 최대8장(JPG/PNG/WebP, 장당10MB)을 첨부·확대·삭제할 수 있다. HEIC는 JPG로 변환 후 추가한다. 바다 일기의 **다시 온 곳, 그때의 목소리**에서 과거 아반떼 기록을 열어 재생할 수 있다. 근접 판정은 샘플 녹음 좌표 기준이며 실제 차량 위치/주차 연동은 미검증이다. [사진·재방문 검증](docs/evidence/photos-recall-validation.md)

```sh
docker compose -f compose.preview.yaml up -d --build
# http://localhost:3018/demo
```

아이폰·아이패드에서는 APK를 실행할 수 없지만 같은 Wi-Fi의 Safari로 웹 미리 보기를 볼 수 있다.
LAN에 합성 미리 보기를 열 때는 `PREVIEW_BIND=0.0.0.0 docker compose -f compose.preview.yaml up -d`를 실행하고
`http://<맥북의 LAN IP>:3018/demo`에 접속한다. 현재 HTTP 공개 합성 미리 보기이며,
연결 시험용 서비스는 별도 Compose의 HTTPS·인증·비공개 미디어 경로를 사용한다.
종료는 `docker compose -f compose.preview.yaml down`이다.


### Docker 서버와 차량·휴대폰 연결

연결된 차량에서 일기를 최종 저장하면 **동일한 원본 WAV**·차량·녹음 위치와 함께 자동 전송한다. 휴대폰에서 읽기·듣기·원본 내려받기·사진 첨부를 할 수 있다. 작성 중 초안은 보내지 않으며, 연결 전 완성본도 첫 연결 후 전송한다. 오프라인 작업은 기기에 보존하고 연결 복구·앱 복귀·OS 허용 예약 작업에서 재시도한다. 사진과 삭제는 SSE 알림과 변경분 조회로 수신하고, 차량의 주차·유휴 상태에서 반영한다. [설치·실행·검증 범위](docs/evidence/compose-runtime.md)를 참고한다.

```sh
pnpm exec tsx scripts/setup-runtime.ts <맥북-LAN-IP>
docker compose --env-file .env.runtime --profile dev up -d --build
# 초기 기기 안내: http://<IP>:8080/
# 인증된 앱: https://<IP>:8443/login
# 개발 확인 메일: http://localhost:8025 (맥북에서만)
```

평소 재실행하거나 Wi-Fi/IP가 바뀌었을 때는 초기 `setup-runtime.ts`를 다시 실행하지 않는다. OrbStack을 켜고 저장소 루트에서 다음 순서로 실행한다.

```sh
# 터미널 1: 에뮬레이터가 꺼져 있을 때만
./scripts/run-vehicle-emulator.sh -allow-host-audio

# 터미널 2: 목업 일기 생성 서버가 꺼져 있을 때만 (실제 OpenAI 호출 없음)
DIARY_GENERATOR=mock pnpm probe:server

# 터미널 3: 에뮬레이터 부팅 후
pnpm exec tsx scripts/refresh-runtime.ts
```

마지막 명령은 현재 기본 네트워크의 IPv4를 찾아 `.env.runtime`의 주소2개만 갱신하고, Compose 실행·HTTPS 인증서 검증·차량 연결 주소 갱신·실행 중인 목업 서버의 adb 연결을 수행한다. 출력된 `/library` 주소를 같은 Wi-Fi의 휴대폰에서 연다. 에뮬레이터가 이미 실행 중이라면 마지막 명령만 실행하면 된다. VPN 등으로 자동 감지가 안 되면 `pnpm exec tsx scripts/refresh-runtime.ts 192.168.0.10`처럼 실제 Wi-Fi IP를 직접 넘긴다. 기존 비밀·볼륨·차량 페어링·일기는 유지한다. IP가 바뀌면 휴대폰 브라우저에서는 다시 로그인할 수 있다.

종료할 때는 에뮬레이터 창을 닫고, 목업 서버 터미널에서 Ctrl+C, Docker는 `docker compose --env-file .env.runtime --profile dev stop`을 실행한다.

아이폰은 설치 안내에서 개발 CA를 설치/신뢰한 뒤 앱을 연다. 보호자 보관함 생성·메일 확인·로그인 → 차량 연결 코드 발급 → 차량의 ‘차량과 사용 안내’에서 코드 입력 → 저장한 목업 일기 공유 순서다. OpenAI는 여전히 호출하지 않는다. 현재 개발용 합성 자료 검증 단계이며 실제 iPhone 파일 앱 저장, 외부 SMTP, 백업/복원, 제품 기기 암호화와 실제 주차·위치는 별도 검증 대상이다.

Node24/pnpm11.13.1 로컬 개발:

```sh
pnpm install --frozen-lockfile
pnpm fixture:audio
pnpm dev:web
# http://localhost:3000/demo
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e # 설치된 Chrome 사용
```

Android(JDK17 + SDK35/build-tools35.0.0):

```sh
cd apps/vehicle
./gradlew :app:assembleDemoDebug :app:testDemoDebugUnitTest
# app/build/outputs/apk/demo/debug/app-demo-debug.apk
adb install -r app/build/outputs/apk/demo/debug/app-demo-debug.apk
```

`demo`는 합성 정책 확인용, `pleos`는 실제 주차 확인 전 잠기는 별도 소스다.
일반 AVD에서도 demo 설치는 가능하지만 실제 차량 API 검증에는 공식 Pleos 환경이 필요하다.
현재 체크아웃의 SDK는 `.tools/android-sdk`, Gradle 캐시는 `.tools/gradle`이며 필요하면
`ANDROID_HOME`/`GRADLE_USER_HOME`에 지정한다. 개발 도구·AVD·음원은 Git에서 제외한다.
이 맥북의 준비된 Pleos 창을 다시 열려면 저장소 루트에서 `./scripts/run-vehicle-emulator.sh`를 실행한다.

### 맥북에서 녹음 실험하기

```sh
# 터미널 1: 에뮬레이터 창과 호스트 마이크 입력 허용 (녹음은 앱에서 직접 시작)
./scripts/run-vehicle-emulator.sh -allow-host-audio
# 터미널 2: 부팅이 끝난 뒤 빌드·설치·실행
./scripts/install-capture-probe.sh
```

`가족의 이야기 · 차량 미리 보기`에서 **모의 P 확인 → 공동 녹음 안내 확인 → 새 이야기 → 녹음 시작**을 누른다.
첫 Android 마이크 권한 허용 후에는 모의 P를 다시 확인하고 시작한다. macOS에서 마이크 허용을 요청하면 허용한다.
입력이 들리지 않으면 에뮬레이터 `… → Microphone → Enable Host Microphone Access`를 확인한다.
말한 뒤 **녹음 마치기 → 내용 확인 → 음성을 글로 옮기기** 순서로 진행한다.
**원본 재생**으로 같은 녹음을 듣고, 화자·확인문 저장 → 전송 안내 확인 → 일기 초안 만들기 → 검토한 일기 이 기기에 저장을 누른다.
저장 후 **일기 읽기**로 이동하며, 보관함에서 다시 열 수 있다. **원래 이야기**에는 전체 녹음 한 구간과 인식문을 표시한다. 재생·일시정지·탐색·종료를 지원한다.
중단·화면 이탈 후 자동 재개하지 않으며 모의 P를 다시 확인한다.

`probeDebug`는 에뮬레이터 전용이며 release 빌드가 없다. 파일은 앱 전용 평문 실험 저장소에 남으며
음성 파일은 서버로 전송되지 않는다. 아래 생성 동작은 사용자가 확인한 텍스트·별칭·녹음 시각만 전송한다.
상세 화면의 **이 이야기 삭제**는 선택한 완료 원본·인식문·수정문·일기·차량 맥락·첨부 사진을 삭제한다. 다른 기록은 유지한다. 미완료 캡처 파일은 보관함에 표시하지 않는다.
실제 주차·암호화 저장·기기 동기화의 제품 구현을 대신하지 않는다. [검증 결과와 남은 과제](docs/evidence/g1-capture.md)

### 녹음부터 저장까지 (C016 현재 화면)

녹음 시작과 함께 같은 PCM을 Pleos ON_DEVICE STT에 전달하고 오른쪽에 인식 중인 문장을 표시한다. **끝내고 이야기 확인 → 화자/내용 수정 → 일기로 만들기 → 미리보기 → 일기 저장** 순서로 차량에서 끝낸다. 별도의 확인문 저장 버튼이나 휴대폰 확정은 필요 없다. 마지막 인식 결과를 기다리는 동안 상태가 표시되며, 실패한 경우 원본 다시 인식 또는 직접 입력으로 진행한다. 원본은 그대로 보관하고 생성은 목업이다. 휴대폰 공유는 저장 후 별도로 선택한다.

### 목업 생성 서버 연결 및 기존 상세 검토 경로

앱에서 보관함의 기록 선택 → **내용 확인 → 음성을 글로 옮기기**로 진행한다.
원본을 들으며 화자 별칭·녹음 시각·확인문을 확인한 뒤 **확인문 저장**을 누른다.
이전 실험 파일의 시각은 파일 수정 시각으로 제안하므로 확인한다. 새 녹음은 시작 시각을 보관한다.
수정문과 원래 인식문은 분리 보관되며 앱을 다시 열어도 남는다.

```sh
# 저장소 루트, Node24. .env.probe는 Git에서 제외된다.
# .env.probe.example을 참고해 .env.probe에 DIARY_GENERATOR=mock을 둔다.
# 미설정 기본값도 mock이며, 키가 있어도 이 모드에서는 API를 호출하지 않는다.
pnpm probe:server
# 별도 터미널: 실행 중인 에뮬레이터를 로컬 서버에 연결 (음성 전송 없음)
./scripts/connect-diary-probe.sh
# 연결 모드가 적용되도록 앱을 다시 연다.
```

앱에서 텍스트 전송 안내 확인 → **일기 초안 만들기** → 초안 검토 → **검토한 일기 이 기기에 저장**.
키는 맥북 서버에만 두며 localhost:4319와 adb reverse·로컬 연결 토큰을 사용한다.
목업은 원문·화자·근거를 보존하는 시험 응답이며 실제 AI 분류·정제 결과가 아니다. 저장 후에도 목업 표시를 유지한다.
나중에 실제 연결할 때만 DIARY_GENERATOR=openai와 OPENAI_API_KEY/OPENAI_MODEL을 설정한다.
모드를 바꾸면 서버 재시작 → 연결 스크립트 → 앱 재실행을 한다. 요청 모드가 다르면 공급자 호출 전에 거부한다.
OpenAI 모드에서 설정/응답 오류가 나면 기존 초안을 유지하며 목업으로 자동 대체하지 않는다.
**차량과 사용 안내**에서 차 별명·제조사·모델·차종·연식·선택적 번호를 입력한다. 다음 녹음 시작에 스냅샷으로 남으며 과거 기록은 바꾸지 않는다.
실제 GPS는 미연결이다. 기본은 위치 미수집, 샘플 위치를 켜면 녹음 시작 시점의 모의 관측으로 표시한다. 이전 원본의 누락된 맥락을 현재 값으로 채우지 않는다.
사진 첨부는 **휴대폰/웹의 사진 추가**에서 한다. 차량에는 파일 선택 버튼이 없으며 보관된 사진의 확대·개별 삭제만 제공한다. 현재 웹 사진은 브라우저 로컬이므로 서버 동기화 연결 전에는 차량에 자동으로 나타나지 않는다.
현재 근거 듣기는 전체 원본이며 세부 구간·다중 화자 선택·휴대폰 동기화는 후속 작업이다.
이 로컬 연결은 인증·DB·작업자·HTTPS를 갖춘 제품용 Compose 서버와 별도인 실험 경로다.

프롬프트·내용 품질 실험은 `claude-web-experiments` 스킬의 Claude 웹 구독 경로로 진행한다.
앱의 OpenAI Responses 연동을 웹 자동화로 대체하지 않는다. 실험 준비·남은 검증은 위 증거 문서에 기록한다.

전체 서버 목표는 Docker Compose의 web·worker·PostgreSQL·Caddy, Better Auth와 비공개 AudioStore다.
`compose.preview.yaml`은 화면 확인 전용이며 T039 운영 계약을 충족하는 구성이 아니다.

## 먼저 읽을 문서

1. [제품 정의](docs/product-brief.md): 타깃, 해결할 문제, 베스트 시나리오, 성공 기준
2. [첫 기능 명세](specs/001-family-trip-memory/spec.md): 사용자 여정, 요구사항, 수용 조건
3. [제품 결정 이력](docs/decisions.md): 원본 음성·양쪽 기기 재생의 첫 버전 포함 결정
4. [구현 전 기술 근거](docs/technical-evidence.md): 실제 검증이 필요한 차량 기능
5. [헌장](.specify/memory/constitution.md): 개발·기록·검증 원칙
6. [명세 품질 점검](specs/001-family-trip-memory/checklists/requirements.md)
7. [구현 계획](specs/001-family-trip-memory/plan.md) · [조사·기술 결정](specs/001-family-trip-memory/research.md)
8. [작업 목록](specs/001-family-trip-memory/tasks.md) · [검증 절차](specs/001-family-trip-memory/quickstart.md)
9. [데이터 모델](specs/001-family-trip-memory/data-model.md) · [API 계약](specs/001-family-trip-memory/contracts/http-api.md)
10. [Docker 실행·음성 저장·클라우드 이전 계약](specs/001-family-trip-memory/contracts/runtime-and-storage.md)
11. [시스템·데이터·서비스 아키텍처](docs/architecture/README.md): 도식 3종, SVG·PNG·Mermaid 원본

## Spec Kit

공식 `specify-cli==1.3.2`로 초기화했다. Codex용 skills, Bash 스크립트,
기본 템플릿과 SDD workflow를 포함한다. 에이전트 이벤트 자동 실행은 사용하지 않는다.
Git 작업은 일반 Git으로 관리한다.

새 체크아웃에서 버전과 설치 상태를 확인한다. Python 3.11+와 uv가 필요하다.

```sh
uvx --from specify-cli==1.3.2 specify version
uvx --from specify-cli==1.3.2 specify integration status
```

이 저장소를 작업 폴더로 열고 에이전트 채팅에서 아래 순서로 진행한다.
이름은 쉘 명령이 아니라 설치된 skill 호출이다.

- `$speckit-constitution`: 현재 헌장 1.1.0. 원칙 변경이 있을 때 갱신
- `$speckit-specify`: 현재 `specs/001-family-trip-memory/spec.md` 기준선 작성 완료
- `$speckit-clarify`: 추가 제품 판단이 필요할 때 사용
- `$speckit-plan`: 기술 조사·조건부 구현 계획 작성 완료. 실제 차량 G0~G2는 미통과
- `$speckit-tasks`: 40개 작업 중 setup·Android 골격·합성 사례·계약 검증 완료; 나머지는 작업 목록 참조
- `$speckit-analyze`: spec·plan·tasks 정합성 읽기 검토
- `$speckit-implement`: 진행 중. 실제 캡처·주차 포트와 서버 기반 구현이 남음

새 체크아웃의 기능 선택은 다음과 같이 지정한다. `.specify/feature.json`은
spec-kit이 관리하는 기기별 상태여서 Git에 포함하지 않는다.

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/001-family-trip-memory
```

에이전트에는 위 기능 디렉터리를 명시해도 된다. 현재 실행 명령은 위의 합성 미리 보기와 Android 빌드 절을 따른다.
명세 수정 뒤 제품 정의·수용 조건·체크리스트를 같이 검토한다.

## 출처와 초기화

[GitHub Spec Kit](https://github.com/github/spec-kit)의 공식 PyPI 배포판을 사용했다.
초기화 명령은 다음과 같다. 이미 초기화된 이 체크아웃에 다시 실행할 필요는 없다.

```sh
uvx --from specify-cli==1.3.2 specify init hmg-family-diary \
  --integration codex --integration-options='--skills --events false' \
  --script sh --non-interactive --ignore-agent-tools
```

재사용한 Spec Kit 구성요소의 MIT 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있다.
애플리케이션 자체의 공개 라이선스는 아직 지정하지 않았다.
실제 가족 녹음·개인 기록·정확한 위치·계정 비밀정보는 저장소에 추가하지 않는다.

### 차곡 디자인 (2026-11-10)

현재 연결 앱 화면은 `/library`(모바일 보관함), `/devices`(차량 연결)다. `/demo`는 이전 합성 미리 보기로 남겨 두었다. 사용자 제공 HTML의8개 화면 DOM·인라인 스타일·Noto Sans KR/Space Grotesk를 그대로 번들하고, 모바일은 같은 출처의 API, 차량 probe는 제한된 로컬 WebView bridge로 기존 기능을 연결한다. 이전 C013의 근사 디자인은 C014로 대체했다. 실제 기능 범위/검증 증거는 `docs/evidence/compose-runtime.md`의 C014에 기록했다. AI 생성은 계속 목업이다.

### 주행 음성 모드 시험 (C019, 에뮬레이터 전용)

공동 녹음 안내와 모의 P 확인 후 앱 우측 상단 **시험: 주행으로 전환**을 누르면 음성 전용 화면을 확인할 수 있다. 처음부터 **모의 주행 · 음성 기능 허용 시험**을 선택해도 된다. 녹음 시작/일시정지/종료와 원본 청취/이전·다음만 제공한다. 문장 수정·사진·일기 본문은 숨기고 native 명령/사진 접근도 차단한다. **시험: 주차로 전환**하면 미완성 녹음의 검토를 이어간다. 모의 주행은 에뮬레이터 플랫폼의 실제 기어 표시와 별개이며 실차 허용 검증을 뜻하지 않는다. 앱 화면 이탈·동의 해제·상태불명·오디오 포커스 상실은 중단하며 자동 재개하지 않는다. 현재 녹음 시작은 버튼 기반이고, 백그라운드 지속 녹음/차량 음성 명령 시작은 미구현이다.


### C020 녹음과 내비·SSE 확인

- 주차 신호는 에뮬레이터 AAOS의 기어/UX 제한에서 읽는다. 공동 녹음 안내 확인 후 녹음을 시작하고 내비 앱으로 이동하면 녹음 서비스가 유지된다. 다시 차곡으로 돌아오면 같은 경과시간/이야기에 복귀한다. 알림의 **녹음 마치기**로 종료할 수 있다.
- 주행 때는 음성 조작만 보이고 전사문·사진·검토는 주차 뒤에 제공한다. 실차 카테고리 허용 검증은 별도다. 원본 **재생**의 다른 앱 전환 후 유지는 아직 제공하지 않는다.
- 정상 화면에서 시험 전환 버튼은 숨긴다. gate의 모의 P/주행을 명시적으로 선택했을 때만 시험 버튼을 보인다. **차량 신호 사용**을 누르면 실제 AAOS 관측으로 돌아간다.
- 연결된 기기는 전면 SSE 변경 알림+cursor 조회로 받는다. 느린 polling fallback은 없다. 재연결하면 놓친 변경을 받고, 스트림이 계속 막히면 수동 동기화/새로고침을 사용한다.
- 맥 IP 변경 시 `pnpm exec tsx scripts/refresh-runtime.ts`. 앱 실행은 `./scripts/run-vehicle-emulator.sh -allow-host-audio`. 검사에서는 마이크 없는 별도 headless 실행을 사용한다.


### 화면 설정과 검색 (C024)

- 일기 목록의 **검색·필터**에서 검색어와 기록 당시 차량을 함께 적용하거나 초기화한다.
- 모바일: **가족 → 화면 설정 → 자동 / 라이트 / 다크**. 브라우저별로 선택을 저장한다.
- 차량: 주차 확인 후 **설정 → 화면 모드**. 자동은 차량 시스템의 주간·야간 설정을 따른다. 실제 터널 전환은 플랫폼의 신호 전달이 필요하다.
- 자동 전환 중 녹음·원본 청취·수정 중 입력을 유지한다. 합성 UI/에뮬레이터 증거는 `docs/evidence/compose-runtime.md` C024에 있다.


### 차량 일기 이어 듣기 (C025)

- 주차 중 **일기 → 일기 N편 이어 듣기**: 검색·차량 필터에 맞는 완성본을 최신순으로 재생한다. 월 표시와 무관하게 해당 조건의 전체 결과를 사용한다.
- **이전 일기 / 다음 일기 / 듣기 종료**를 제공한다. 마지막 일기에서 종료하며 반복하지 않는다. 상세의 한 편 읽기와 원본 녹음 듣기는 별도다.
- 모의 주행 음성 화면에서는 **일기 듣기**로 선택한 완성 일기부터 시작한다. 선택이 부적합하면 최신 완성본부터 시작한다. 주차 중 설정한 큐는 주행·내비게이션 화면 이탈에도 유지된다.
- 포커스 상실·안내 음성·UNKNOWN·엔진 오류·사용자 종료 후 자동 재개하지 않는다. SDK가 정확한 일시정지 위치를 제공한다고 가정하지 않으며, 다시 시작하면 해당 일기의 처음부터 읽는다.
- 이번 구현은 차량용이다. 모바일 웹 TTS와 실차/마켓 주행 허용 검증은 별도다. `PlaylistDeviceTest`, `scripts/test-c025-ui.ts`와 증거 문서의 C025를 참고한다.
