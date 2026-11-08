# HMG Family Diary

차에서 자유롭게 풀어놓은 가족 이야기를 LLM이 분류·정제해 **일기와 실제 목소리**로 남겨,
차량과 휴대폰에서 다시 읽고 듣는 가족 여행 기록 서비스.

첫 구현을 시작했다. Mac ARM64의 **Pleos Connect2.1.0 에뮬레이터에 demo APK를 설치·실행**했고,
월별 보관함·기간 선택·검색·일기·전체 녹음과 원문 타임라인을 확인하는 합성 모바일 웹 미리 보기를 Docker로 실행했다.
[k-style-ui-ux 적용 기록](docs/design/k-style-redesign.md)과 [타임라인 검증](docs/evidence/timeline-validation.md)을 참고한다.
차량 정보·녹음 시작 위치·이 차의 추억 모아보기도 합성 자료로 제공한다. [차량 기능 설계](docs/research/vehicle-memory.md) · [차량 화면 검증](docs/evidence/vehicle-context-validation.md)
별도 에뮬레이터 실험 앱에 AudioRecord 녹음·원본 저장·재생과 Pleos ON_DEVICE STT를 연결했다.
무음 입력 저장·재생과 합성 음성의 인식 콜백을 확인했고, 사용자가 맥북 마이크의 실제 녹음·원본 청취도 확인했다.
host GPU 환경에서 이전에 실패했던 합성 문장 전체 인식과 반복 발화·말끝 보존을 확인했다.
실제 자유 발화와 장시간 입력의 정확도는 별도 검증 대상이다. [STT 분리 검증](docs/evidence/stt-validation.md)
실험 앱에는 원본 듣기→인식문 확인·수정→목업 초안 요청→기기 저장·재열람 흐름을 연결했다.
현재 기본은 **목업 모드(API 호출 없음)**이며 확인문을 그대로 돌려준다. [목업 연결 검증](docs/evidence/mock-generation.md)
실제 모델 응답은 키·모델 설정 후 검증해야 하며 내용 품질 실험은 Claude 웹으로 분리한다. [검토·생성 검증](docs/evidence/review-generation.md)
제품의 실제 녹음/STT/LLM/인증/동기화 및 차량/위치 자동 수집은 아직 미완료이며 전체 MVP 완료가 아니다.
[현재 구현·미구현 범위](docs/evidence/implementation-progress.md) · [기기·APK 검증](docs/evidence/g0-environment.md)

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
개인 기록용 서비스는 후속 작업에서 HTTPS·인증·비공개 미디어로 구성한다.
종료는 `docker compose -f compose.preview.yaml down`이다.

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

`가족의 이야기 · 녹음 실험`에서 **모의 P 확인 → 공동 녹음 안내 확인 → 녹음 시작**을 누른다.
첫 Android 마이크 권한 허용 후에는 모의 P를 다시 확인하고 시작한다. macOS에서 마이크 허용을 요청하면 허용한다.
입력이 들리지 않으면 에뮬레이터 `… → Microphone → Enable Host Microphone Access`를 확인한다.
말한 뒤 **녹음 마침 → 선택한 원본 듣기 → 같은 원본으로 STT** 순서로 시험한다.
최신 원본이 선택되며 이전 파일은 목록에서 선택한다. 중단·화면 이탈 후 자동 재개하지 않는다.

`probeDebug`는 에뮬레이터 전용이며 release 빌드가 없다. 파일은 앱 전용 평문 실험 저장소에 남으며
음성 파일은 서버로 전송되지 않는다. 아래 생성 동작은 사용자가 확인한 텍스트·별칭·녹음 시각만 전송한다.
**실험 원본 전체 삭제**로 미완료 파일·인식문·수정문·초안까지 지울 수 있다.
실제 주차·암호화 저장·기기 동기화의 제품 구현을 대신하지 않는다. [검증 결과와 남은 과제](docs/evidence/g1-capture.md)

### 인식문을 확인하고 일기 초안 요청하기

앱에서 원본 선택 → 같은 원본으로 STT → 아래 **이야기를 일기로**로 이동한다.
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
