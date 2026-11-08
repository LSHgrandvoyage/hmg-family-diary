# Quickstart and Validation

현재 실행 가능한 것은 Spec Kit의 문서·경로 검사다. 앱 코드·Gradle wrapper·pnpm workspace·로컬
Supabase 설정은 후속 작업에서 생성한다. 아래 앱 실행 명령은 해당 작업 완료 후의 목표 인터페이스다.

## 지금 확인할 수 있는 것

저장소 루트에서 실행한다.

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/001-family-trip-memory
.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
uvx --from specify-cli==1.3.2 specify integration status
```

예상: spec/plan/tasks와 research/data-model/contracts/quickstart 존재, 설치 통합 codex 정상.
이 결과는 SDK·모델·앱 테스트가 아니다.

## 구현 후 준비 조건

- Node24/pnpm11, JDK17, Android SDK·Pleos 전용 AVD. G0 결과에 정확한 도구 버전을 기록한다.
- 로컬 Docker/Supabase CLI. 로컬 회원 가입 메일은 Mailpit에서 확인한다.
- `.env.example`를 기반으로 서버 전용 Supabase secret·LLM 키를 설정한다. CLI 출력에 비밀정보를 남기지 않는다.
- mock 생성기는 합성 사례 검증용이고 실제 LLM 성공으로 표시하지 않는다.
- G1/G2 미통과 시 `demo` build와 합성 파일만 사용한다. `pleos` build의 실제 캡처를 활성화하지 않는다.

## 구현 후 실행할 명령

T001~T011에서 다음 명령과 설정을 제공한다. 현재 이 명령으로 앱이 실행된다는 뜻은 아니다.

```sh
pnpm install --frozen-lockfile
pnpm exec supabase start
pnpm exec supabase db reset
pnpm dev:web
pnpm dev:worker
pnpm test:contracts
pnpm test:integration
pnpm test:e2e
pnpm eval:diary
```

Android 프로젝트에서 `./gradlew :app:assembleDemoDebug`와
`./gradlew :app:testDemoDebugUnitTest`를 제공한다.
G0~G2가 통과한 환경에서만 `./gradlew :app:assemblePleosDebug` 및 기기 테스트를 실행한다.
Android SDK 자격 정보·비공개 SDK 파일은 Git에 넣지 않는다.

## 1. G0~G2 차량 증거

전용 AVD/실차를 구분해 마이크 원본→재생→같은 입력 STT를 확인한다.
30초·3분·10분·20분의 합성 또는 동의된 발화에서 파일 경계·침묵·늦은 결과·정정을 시험한다.
원본 checksum, 구간 연결 정확도, 입력 길이·최대 메모리·파일 크기만 남기고 실제 음성은 Git에 넣지 않는다.
P→D, D에서 속도0, 상태불명, 서비스 단절, 포커스 상실에 캡처·재생 중단을 확인한다.
속도0를 주차 성공으로 기록하면 실패다.

## 2. US1 자유 입력

서로 다른 감정·여러 시점·명시 정정·잡담이 섞인 E01~E12를 사용한다.
사전 장소 선택 없이 녹음→분류→초안→묶음 검토→저장한다.
식당 ‘점심→아침’은 정정되고 ‘어제 카페’와 ‘다음 여행 계획’이 오늘 사건에 합쳐지면 실패다.
ID/화자/원본 구간을 확인하고 분리·병합·재포함 뒤에도 연결이 유지되는지 확인한다.
G3 실제 모델 평가는 요청 model·반환 model·prompt/schema 버전·입력 크기·시간·비용을 기록한다.

## 3. US2 양쪽 기기

두 가족 보관함 A/B를 만들고 A 휴대폰에서 A 차량을 연결한다.
준비된 A 기록을 차량과 모바일 Safari/Chrome에서 찾아 같은 checksum의 원본을 재생한다.
관련 구간부터 시작하고 전체 재생·일시정지·탐색을 확인한다.
B 인증, 무인증, 삭제 ID, 연결 해제된 차량으로 텍스트·음성·Range endpoint를 직접 요청해 접근을 차단한다.
반드시 실제 기기의 네트워크·인증 환경에서 수행하고 테스트용 localhost와 실기기 연결 주소를 혼동하지 않는다.

## 4. US3 오류·삭제

업로드 중단, 일기만 전송, 같은 키 재전송, 같은 ID/다른 bytes, 앱 종료,
모델 timeout, generation 중 revision 변경, generation 중 삭제를 시험한다.
완료 원본 보존·명시적인 partial 상태·중복 없음·저장본 덮어쓰기 없음을 확인한다.
차량 오프라인 상태에서 휴대폰이 세션을 삭제한 뒤 재접속해 tombstone 먼저 적용·사본 삭제·ack를 검증한다.
차량 연결 해제도 같은 방식으로 확인한다. 삭제가 안 된 오프라인 기기는 pending으로 표시돼야 한다.

## 5. 사용자 가치

문제 인터뷰3가족 후, 가능하면 사용성5가족을 진행한다. 참여자 모집·연락은 별도 사용자 지시에 따른다.
사전 분류 없이 완료한 수, 종료 후 능동 조작 시간, 실제 생성 대기, 30초 내 원본 찾기를 기록한다.
목표 달성 여부와 표본 크기를 함께 보고하며 관측 전에는 모두 미실행 상태다.

## 결과 기록

`docs/evidence/g0-environment.md`, `g1-capture.md`, `g2-parked.md`, `g3-generation.md`,
`g4-cross-device.md`, `usability.md`에 환경·입력 종류·기대/실제·실패·수정 커밋을 남긴다.
시연 영상에 실제·에뮬레이터·합성/mock 범위를 표시한다. 실패를 제외한 성공률이나
일부 기기만 성공한 결과를 전체 MVP 완료로 보고하지 않는다.
