# Tasks: 가족의 자유로운 이야기와 원본 목소리

**Input**: `specs/001-family-trip-memory/`의 spec·plan·research·data-model·contracts.

**Status**: Docker Compose 변경 반영, 총40개. 추가 ID T039는 공통 기반 단계에 배치하며 번호보다 선행 조건이 실행 순서를 결정한다. 구현 진행 중. 현재 완료/부분 구현은 `docs/evidence/implementation-progress.md`를 참조한다. 실제 플랫폼 G0~G2는 전체 통과 전이다.

**Tests**: spec SC-002/004/005/006/007과 헌장의 원본·권한·삭제·충실도 검증을 구현 작업에 포함한다.
문서 편집만 확인하는 앱 테스트는 만들지 않는다. 경계·오류 테스트는 해당 구현과 함께 작성하고 실패/통과를 확인한다.

**Format**: `[ID] [P?] [Story?] 설명·경로·완료 기준`. [P]는 지정된 선행 작업 완료 후 다른 파일에서 수행할 수 있다는 뜻이다.

진행 중인 독립 probe 묶음: T017/T020의 인식문 검토·확인 revision·생성 adapter·실험용 loopback 연결.
2026-11-09: Haiku 5.5 웹 내용 실험6건을 실행·보존했다. [부분 증거](../../docs/evidence/g3-generation.md). T035/G3 전체 완료가 아니며 체크 상태는 유지한다.
2026-11-09 보정: 프롬프트 v2/v3·검토 표시 계약과 회귀 검사를 반영했다. [보정 실험9건](../../docs/evidence/g3-generation-v2.md): 형식8/9 통과, 의미 오류 일부 잔존. T018/T035/G3는 미완료 유지.
2026-11-09 목업: API 연결을 미루고 확인문 기반 목업·모드 불일치 차단·저장본 표식을 구현했다. [로컬 종단 검증](../../docs/evidence/mock-generation.md). 제품 동기화/T018/G3 완료로 간주하지 않는다.
2026-11-09 차량 UI: T020/T027/T043/T045의 로컬 화면을 보관함·녹음·상세로 연결했다. [검증 범위](../../docs/evidence/vehicle-ui.md). 기존 앱 ID/원본을 유지하고 모의 P·목업·미수집 위치를 표시한다. 인증/동기화/실차 선행 조건은 미완료다.
제품 선행 조건을 통과한 것으로 체크하지 않는다. 실행 범위와 결과는 `docs/evidence/review-generation.md`에 기록한다.

## Phase 1: Setup and platform evidence

- [X] T001 pnpm workspace와 `apps/web/package.json`, `workers/diary/package.json`, `packages/{contracts,diary,storage}/package.json`, `.env.example`를 만들고 Node24·Next16·TypeScript·Better Auth·pg 의존성을 lockfile에 고정한다. 현재 구현된 dev/build/test/fixture 명령을 실제 script로 연결한다. db:migrate/status는 T007, worker는 T011, eval은 T035 구현 때 연결한다. 비밀키는 서버 전용으로 검증한다.
- [X] T002 [P] `apps/vehicle/settings.gradle.kts`, `apps/vehicle/build.gradle.kts`, `apps/vehicle/app/build.gradle.kts`에 JDK17·제품 min28과 plan의 공식 샘플 조합을 검증해 고정한다. demo/pleos flavor·Gradle wrapper를 제공하고 mock 상태가 pleos release에서 켜지지 않게 한다. 선행 T001.
- [X] T003 [P] `tests/fixtures/freeform/`에 E01~E12의 합성 텍스트·정정·기대 사건/화자/구간 자료와 음성 fixture 생성 절차를 만든다. 실제 가족 자료는 넣지 않는다. 선행 T001.
- [ ] T004 `docs/evidence/g0-environment.md`에 JDK·Android SDK·Pleos AVD·의존성·권한 초기화의 실제 결과를 기록한다. `apps/vehicle/app/src/main/java/io/hmg/familydiary/platform/CapabilityProbe.kt`에서 지원 여부를 확인한다. 일반 AVD를 Pleos 성공으로 기록하지 않는다. 선행 T002.
- [ ] T005 `apps/vehicle/app/src/probe/java/io/hmg/familydiary/platform/CaptureProbe.kt`와 `docs/evidence/g1-capture.md`로 허용된 원본 PCM→파일→재생→같은 입력 STT,30초/3분/10분/20분,구간·침묵·종료를 검증한다. 별도 emulator-only probeDebug에서 실행하며 제품 빌드에 실험 UI를 넣지 않는다. 포맷·파일 조각 크기·운영 한도를 기록한다. 원본 접근 실패는 G1 실패이며 텍스트 성공으로 대체하지 않는다. 선행 T004.
- [ ] T006 `apps/vehicle/app/src/main/java/io/hmg/familydiary/platform/ParkedProbe.kt`와 `docs/evidence/g2-parked.md`에서 허용된 주차 신호·UX restriction·focus loss를 검증한다. P→D·D속도0·UNKNOWN·연결단절 때 중단 증거를 남긴다. 불명은 사용 잠금. 선행 T004.

**Checkpoint:** G0~G2는 아직 미통과다. 실패가 나도 T007~T012와 합성 자료 기반 기능 구현은 진행 가능하지만
실제 capture 활성화·실차 완료 선언은 금지한다. 해당 실패 원인·환경을 기록하고 지원 경로를 확인한다.
운영사에게 메시지를 보내는 작업은 이 목록에 포함하지 않는다.

## Phase 2: Foundational

- [ ] T007 `db/migrations/0001_auth.sql`, `0002_core.sql`에 UUID 기반 인증 스키마와 data-model의 모델·관계·vault 격리·FK·unique·RLS를 구현한다. migrate/auth/domain 역할을 분리하고 런타임은 비소유자·non-BYPASSRLS, 트랜잭션별 vault context를 사용한다. 사전 vault 조회·기기 인증·job claim의 제한 함수 경로와 고정 search_path/호출 권한을 구현한다. `owner_user_id unique`, 이름 `1~40자`, title/label `1~120자`, `sequence≥0`, `duration_ms>0`, `bytes>0`, `sha256 64자리 hex`, `(session_id,sequence) unique`, `0≤start_ms<end_ms`, 유효 IANA timezone, 같은 session/vault 참조를 강제한다. 삭제된 ID 재생성 금지도 포함한다. 선행 T001.
- [ ] T008 `apps/vehicle/app/src/main/java/io/hmg/familydiary/data/LocalStore.kt`에 불변 AudioChunk·원문·수정문·revision·outbox를 구현한다. 암호화 파일과 키 관리, atomic finalize/checksum, 재시작 복구를 제공한다. 불완전 tail은 완료로 표시하지 않는다. 선행 T002,T003.
- [ ] T009 `apps/web/src/server/auth.ts`, `apps/web/src/server/vault.ts`에 Better Auth의 `/api/auth/*` 가입·검증·재설정·DB 세션(cookieCache off) 및 Origin/CSRF 검사와 차량 토큰 hash/만료/폐기 검증, 모든 참조의 vault 검사를 공통화한다. client 직접 DB/볼륨 접근을 막는다. 라이브러리 생성 SQL은 T007과 맞추고 웹 세션 폐기·재설정 후 전체 세션 폐기를 시험한다. 선행 T007.
- [X] T010 `packages/contracts/src/diary.ts`, `packages/contracts/src/http.ts`에 JSON Schema·HTTP 계약 검증을 구현한다. 같은 입력 source ID·member·시간 범위, member audience의 ID/shared의 null, 유효 YYYY-MM-DD, 모든 입력의 사용/제외 추적을 검증한다. 선행 T001,T003.
- [ ] T011 `workers/diary/src/runner.ts`, `apps/web/src/server/jobs.ts`에 queued/running/succeeded/failed/cancelled·lease·최대3회 재시도·멱등성·revision 재검사를 구현한다. 재시작 후 작업을 잃지 않고 삭제된 세션의 결과를 반영하지 않는다. 선행 T007,T009,T010.
- [ ] T012 `apps/web/src/server/config.ts`, `db/tests/isolation.sql`, `docs/evidence/storage-policy.md`에 공급자·모델·용량 설정과 데이터 수집 안내 기준을 준비한다. 정상 삭제 목표24시간·미반영 기기 pending·백업/tombstone 재적용을 기록한다. 실제 사용자 자료 수집 전 SMTP·백업·삭제 저널 설정 검증; 개발은 합성 자료만 사용한다. 선행 T007,T009,T039.

- [ ] T039 `compose.yaml`, `infra/{web.Dockerfile,worker.Dockerfile,Caddyfile}`, `docs/evidence/compose-runtime.md`에 runtime-and-storage 계약의 web/worker/db/proxy·dev Mailpit·migrate를 구성한다. 이미지 digest/lockfile·비루트 실행·영속 볼륨·healthcheck·SQL 성공 후 시작·HTTPS origin·서버 전용 비밀을 검증한다. 인증 API의 가입/메일 검증/로그아웃/재설정 및 테스트 클라이언트·휴대폰의 HTTPS 통신, DB 비공개·재시작 복구를 기록한다. 선행 T001,T007,T009,T011.

**Checkpoint:** 데이터·인증·계약·로컬 저장·작업 복구를 공통 기반으로 둔다.
G1/G2에 의존하지 않는 구현은 mock 포트로 시작하되 실제 경로의 성공과 구분한다.

## Phase 3: US1 — 자유로운 이야기에서 근거 있는 일기 (P1)

**Goal:** 사전 분류 없이 여러 이야기를 말하고 원본과 연결된 초안을 묶음 검토·저장한다.
**Independent test:** 미리 연결된 보관함/차량 fixture와 합성 다중 사건·정정 입력으로
인식→정리→편집→저장을 검증한다. 실제 첫 연결 UI는 US2에서 제공한다.
실제 마이크 증거는 G1이 별도로 필요하다.

- [ ] T013 [US1] `packages/diary/src/organizer.test.ts`, `apps/vehicle/app/src/test/java/io/hmg/familydiary/CaptureCoordinatorTest.kt`에 반대 감정·정정·시점·없는 ID·늦은 인식 결과·UNKNOWN 중단의 실패 사례를 작성한다. 선행 T003,T008,T010. FR-001~006,013~015.
- [ ] T014 [US1] `apps/vehicle/app/src/main/java/io/hmg/familydiary/capture/CaptureCoordinator.kt`에 수동 화자 선택, 연속 세션·조각 저장, 명시 시작/종료·중단을 구현한다. 주제별 재녹음 금지, 선택 화자 generation ID 고정, 주차/focus 상실 즉시 입력·재생 중단. 실제 포트는 G1/G2 통과 후 활성화. 선행 T008,T013. FR-001~003,013.
- [ ] T015 [US1] `apps/vehicle/app/src/main/java/io/hmg/familydiary/platform/PleosSpeechAdapter.kt`에 검증된 PCM 포맷·ON_DEVICE 전송·완료 이벤트·구간 시간축을 연결한다. 중간 결과 표시와 완료 저장을 분리하고 STT 실패 시 원본을 보존한다. 선행 T005,T014. FR-003,010.
- [ ] T016 [US1] `packages/storage/src/{audio-store,local-audio-store}.ts`, `apps/web/src/server/capture.ts`, `apps/web/src/app/api/v1/sessions/route.ts`에 session/utterance/audio/finish endpoint를 구현한다. binary checksum·불변 파일·같은 ID 다른 bytes409·manifest 누락409·사전 장소 입력 없음. AudioStore의 경로 제한·불변 쓰기·임시 파일·삭제 경합 잠금·중단 복구를 포함한다. 선행 T007,T009,T010,T039. FR-003,004,008.
- [ ] T017 [US1] `packages/diary/src/generator.ts`, `packages/diary/src/evidence.ts`에 Responses adapter, strict schema, store:false, 거절/불완전/범위 오류 처리, 원본 근거 검증을 구현한다. 원본 음성·정밀 좌표는 생성 공급자에 전송하지 않는다. 선행 T010,T011,T013. FR-005,013,014.
- [ ] T018 [US1] `packages/diary/src/organizer.ts`, `packages/diary/src/prompts.ts`에 사건·시점·정정·충돌·제외 내용 정리와 긴 입력 window 사실 추출→전체 재정리를 구현한다. 뒤쪽 정정이 앞 사건에 반영되고 원본 ID를 보존해야 한다. 선행 T017. FR-013~015.
- [ ] T019 [US1] `apps/web/src/server/drafts.ts`에 expected_revision 편집·분리/병합/이동·excluded_spans 재포함·확정 버전을 구현한다. 수정문은 새 버전이며 원본 불변, source 연결 유지. 선행 T010,T016,T018. FR-004~006,015.
- [ ] T020 [US1] `apps/vehicle/app/src/main/java/io/hmg/familydiary/ui/RecordScreen.kt`, `ReviewScreen.kt`에 공동 녹음 안내·선택 화자·연속 녹음·묶음 검토·오류 상태·저장을 연결한다. 내용 분류는 LLM이 수행하고 최종 검토만 사용자에게 제공한다. 선행 T014~T019. FR-002,004~006,012,013,015.
- [ ] T021 [US1] `apps/web/tests/api/capture.test.ts`, `docs/evidence/us1.md`에서 임시 원본·모델 실패·분류 수정·재포함·원본 탐색 연결을 검증한다. T013 테스트 통과와 mock/실제 환경 구분을 기록한다. 선행 T020. SC-002,007.

## Phase 4: US2 — 차량과 휴대폰에서 다시 읽고 듣기 (P1)

**Goal:** 연결된 두 표면에서 같은 보관함을 읽고 관련 원본 구간·전체 음성을 재생한다.
**Independent test:** 준비된 합성 저장본으로 새 녹음 없이 검증한다.

- [ ] T022 [US2] `apps/web/src/server/pairing.ts`, `apps/web/tests/api/pairing.test.ts`에 보호자 승인·차량 교환·해제·purge receipt 계약을 구현한다. secret256bit, code8자리,5분 만료, 최대5회, 한 번 교환, 활성 차량1대, token_hash만 저장, 발급 후30일 만료·재연결 필요, rate limit 적용. 선행 T009. FR-007.
- [ ] T023 [US2] `apps/web/src/app/login/page.tsx`, `apps/web/src/app/devices/page.tsx`에 보호자 인증·차량 이름 확인·연결/해제·pending 표시를 구현한다. 보호자 인증 쿠키·자격 증명을 차량에 전달하지 않는다. 선행 T012,T022. FR-007,012.
- [ ] T024 [US2] `apps/vehicle/app/src/main/java/io/hmg/familydiary/pairing/PairingScreen.kt`에 code 표시·승인 대기·token 교환·안전한 저장을 구현한다. 초과/만료·재사용 실패가 구분돼야 한다. 선행 T008,T022. FR-007.
- [ ] T025 [US2] `apps/web/src/server/library.ts`, `apps/web/src/server/media.ts`에 날짜/장소 목록·세션 읽기·인증된 Range 미디어 프록시를 구현한다. 기본20/최대50, 비삭제 vault 필터, private no-store, partial 상태, 공개 URL 없음. 선행 T009,T016. FR-008,009.
- [ ] T026 [US2] `apps/web/src/app/library/page.tsx`, `apps/web/src/app/library/[id]/page.tsx`, `apps/web/src/components/AudioPlayer.tsx`에 연월별 보관함·기간 선택·읽기·전체 녹음과 원문 타임라인·구간 선택 시 해당 시점부터 연속 재생·현재 구간 표시·일시정지·탐색·종료·재시도를 구현한다. blob은 종료/로그아웃 때 해제하고 영구 음성 캐시를 만들지 않는다. 선행 T023,T025. FR-008,009,012.
- [ ] T027 [US2] `apps/vehicle/app/src/main/java/io/hmg/familydiary/ui/LibraryScreen.kt`, `playback/AudioPlayer.kt`에 같은 기록 읽기·manifest 재생·source span 탐색을 구현한다. UNKNOWN/출발/focus loss 중단, 자동 재개 없음. 선행 T006,T024,T025. FR-001,009.
- [ ] T028 [US2] `apps/web/tests/api/access.test.ts`, `apps/web/tests/e2e/library.spec.ts`에 A/B 보관함·무인증·해제 token·Range 재사용 차단과 모바일 화면의 부분 전송/재생을 검증한다. 선행 T022~T027. SC-003,005,006.

## Phase 5: US3 — 재접속·삭제·기록 복구 (P1)

**Goal:** 완료 원본을 잃지 않고 다시 시도하며, 삭제·해제된 기록이 되살아나지 않는다.
**Independent test:** 준비된 captured/partial/confirmed/deleted 자료에 장애를 주입한다.

- [ ] T029 [US3] `apps/web/src/server/sync.ts`, `apps/web/tests/api/sync.test.ts`에 단조 cursor·snapshot·tombstone 우선 적용·sync ack를 구현한다. 오래된 cursor는 snapshot_required, 삭제 ID 쓰기는410. 선행 T007,T009,T016. FR-008,010,011.
- [ ] T030 [US3] `apps/vehicle/app/src/main/java/io/hmg/familydiary/sync/SyncWorker.kt`에 reconnect 시 pull→삭제 적용→outbox 전송→ack 순서와 멱등 재시도를 구현한다. 같은 key 다른 body409, 완료 음성 보존·partial 표시. 선행 T008,T024,T029. FR-008,010.
- [ ] T031 [US3] `apps/web/src/server/deletion.ts`, `workers/diary/src/purge.ts`에 전체 세션 삭제를 구현한다. tombstone 먼저 확정해 읽기·생성·쓰기 차단, 모든 버전/원문/음성 삭제, 백업 복원 전 tombstone 재적용, 실제 서버/기기 삭제 상태 구분. 선행 T011,T012,T029. FR-011.
- [ ] T032 [US3] `apps/vehicle/app/src/main/java/io/hmg/familydiary/security/PurgeHandler.kt`에 revocation 확인 후 재생 중단·로컬 보관함 사본/키 제거·일회성 purge ack를 구현한다. 오프라인 완료를 주장하지 않는다. 선행 T022,T030,T031. FR-007,011.
- [ ] T033 [US3] `apps/web/src/components/SyncStatus.tsx`, `apps/vehicle/app/src/main/java/io/hmg/familydiary/ui/SyncStatus.kt`에 텍스트/음성 준비 상태·재시도·저장본 버전 충돌·삭제 확인·pending 기기를 표시한다. 사건 제외와 전체 녹음 삭제를 구분한다. 선행 T030~T032. FR-008,010~012.
- [ ] T034 [US3] `apps/web/tests/api/races.test.ts`, `apps/vehicle/app/src/test/java/io/hmg/familydiary/RecoveryTest.kt`에 앱 종료·삭제/업로드/생성 경합·기기 해제·재접속·늦은 작업 완료를 검증한다. 삭제 기록 부활·중복·음성 불일치0건. 선행 T033. SC-004,005.

## Phase 6: Cross-cutting validation and delivery

- [ ] T035 `scripts/eval-diary.ts`, `docs/evidence/g3-generation.md`에 E01~E12 실제 모델 평가와 schema/근거/의미 검토를 기록한다. model·prompt/schema 버전·시간·비용과 20회 지연 p95를 보고한다. 원본 ID/시점/정정 누락 사례는 수정 후 재평가한다. 선행 T018,T021. SC-002,007.
- [ ] T036 `docs/evidence/g4-cross-device.md`, `apps/vehicle/app/src/androidTest/java/io/hmg/familydiary/ReplayTest.kt`에 실제 차량 환경·모바일 Safari/Chrome의 동일 원본·탐색 오차·partial·권한·삭제·주차 중단을 검증한다. 선행 T028,T034,T035,T040, G0~G2 통과. SC-003~006.
- [ ] T037 `docs/evidence/usability.md`에 문제 인터뷰3가족·사용성5가족의 관찰 양식과 실제 관측을 구분해 기록한다. 연락·모집은 사용자 지시가 있을 때만 수행한다. 발화·능동 조작·생성 대기를 따로 측정하고 스마트폰 대안과 비교한다. 선행 T036. SC-001,003.
- [ ] T038 `.github/workflows/verify.yml`, `README.md`, `docs/evidence/release.md`에 계약/도메인/API/빌드 검사와 quickstart 재현 결과를 연결한다. 자격 증명이 필요한 검사·미실행 실차 검사는 별도 표시하고 성공으로 건너뛰지 않는다. APK·시연 자료의 실제/합성 범위와 알려진 제한을 기록한다. 선행 T034~T037,T039,T040.

- [ ] T040 `packages/storage/src/local-audio-store.test.ts`, `scripts/{backup,restore-verify}.ts`, `docs/evidence/backup-restore.md`에 실제 파일 Range/416·checksum·경로 탈출·disk-full·원자 확정 중단·고아 파일·삭제 경합 검증을 추가한다. 컨테이너 재생성 후 영속성, 쓰기 중단 구간의 DB/파일 백업과 별도 임시 프로젝트 복원, 최신 삭제/기기 폐기 표식 우선 적용과 같은 ID/원본 재생을 확인한다. 현재 볼륨을 덮어쓰지 않는다. 선행 T016,T025,T031,T034,T039. FR-003,008~011; SC-004,005.

## Dependencies & Execution Order

`T001 → (T002 → T004 → T005/T006, T003)`.
공통 기반 `T007~T012`와 T039는 해당 경로의 선행 조건대로 진행한다.
`T007 → T009 → T011 → T039 → T012/T016`으로 인증·DB·Compose 실행 경계를 갖춘다.
T040은 복구 구현 이후, 최종 기기 검증 T036 이전에 완료한다.
G1/G2 실패 시 서버·웹·합성 포트 개발은 가능하지만 실제 캡처 T015·실차 재생 T027·종단 검증 T036은 조건을 충족해야 한다.

US1은 기반 위에서 작성→정리→검토를 연결한다.
US2의 pairing과 library는 준비된 fixture로 US1의 화면 완성 전에 개발·검증할 수 있다.
US3는 기반 모델과 API를 사용해 오류 복구를 검증하며 최종 통합은 US1/US2와 함께 한다.
세 스토리 모두 P1이며 한 스토리만 완료해 전체 MVP라고 보고하지 않는다.

## Parallel Examples

- Setup: T001 이후 T002(Android 도구)와 T003(합성 fixture)는 다른 파일에서 진행 가능.
- US1: 공통 기반 후 T016(수집 API)과 T017(생성 adapter)은 서로 다른 파일에서 진행 가능.
- US2: T025 완료 후 T026(휴대폰)과 T027(차량)은 각각의 선행 조건이 충족되면 병행 가능.
- US3: T029/T022/T011 준비 후 T030(차량 sync)과 T031(서버 삭제)은 계약에 따라 병행 가능.

이는 작업 의존성 설명이며 추가 에이전트 실행을 요청한 것은 아니다.

## Coverage

| 요구사항 | 구현·검증 작업 |
|---|---|
| FR-001 | T006,T013,T014,T027,T036 |
| FR-002 | T014,T020 |
| FR-003 | T005,T008,T014~T016,T021,T040 |
| FR-004 | T016,T019,T020 |
| FR-005 | T010,T017~T021,T035 |
| FR-006 | T019,T020,T021 |
| FR-007 | T009,T022~T024,T028,T032,T039 |
| FR-008 | T016,T025,T026,T029,T030,T033,T040 |
| FR-009 | T025~T028,T036,T040 |
| FR-010 | T008,T011,T015,T029,T030,T034,T040 |
| FR-011 | T029,T031~T034,T040 |
| FR-012 | T012,T020,T023,T026,T033 |
| FR-013 | T003,T014,T017,T018,T020,T035 |
| FR-014 | T003,T013,T018,T035 |
| FR-015 | T010,T013,T018~T021,T035 |
| SC-001 | T020,T037 |
| SC-002 | T003,T013,T021,T035 |
| SC-003 | T026~T028,T036,T037 |
| SC-004 | T008,T029~T034,T036,T040 |
| SC-005 | T009,T028,T032,T034,T036,T039,T040 |
| SC-006 | T006,T013,T027,T028,T036 |
| SC-007 | T003,T013,T018,T019,T035 |

## Implementation Strategy

먼저 실제 플랫폼 증거와 합성 계약 검증으로 가장 큰 불확실성을 줄인다.
US1 작은 흐름은 중간 시연으로만 취급하고 US2·US3를 붙여 첫 버전을 완결한다.
명세 범위·원본 음성·양쪽 기기 재생을 유지하며, 한도가 발견되면 사실과 제품 영향을 문서에 기록한다.

## 차량 기억 확장 — FR-016, FR-017

- [ ] T041 VehicleProfile/SessionContext DB·입력 검증·같은 vault 차량 소유 확인·profile/context revision 편집·차량별 목록·삭제/동기화를 구현한다. 프로필 변경 후 옛 snapshot 불변을 검증한다. 선행 T007,T009,T016,T025,T031.
- [ ] T042 Android RecordingContext adapter에서 녹음 시작 시각과 차량 프로필/위치를 결합한다. CarInfo/FusedLocation capability·권한·반환형·시각 단위·null·stale·미지원·거절을 G5로 검증한다. 실제 위치와 생성/열람 위치 혼입 금지. 선행 T004,T006,T014,T041.
- [ ] T043 차량·휴대폰 상세에 당시 차와 녹음 위치 상태를 표시하고 차량별 회상 목록을 연결한다. 권한·기기 동기화·번호/위치 삭제 포함 실제 G4 회귀 검증. 선행 T026,T027,T041,T042. 현재 합성 웹 미리 보기만으로 완료 처리하지 않는다.

추적: FR-016 → T041~T043, FR-017 → T041~T043. 기존 40개 작업은 유지한다.

## 사진·재방문 확장 — FR-018, FR-019

- [ ] T044 PhotoStore/Photo DB·인증된 업로드/읽기/삭제·8장/10MB 제한·디코딩/EXIF 제거·비공개 볼륨·동시 쓰기/백업/세션 삭제를 구현한다. 선행 T007,T009,T025,T031,T039.
- [ ] T045 휴대폰 사진 첨부·확대·삭제·재시도와 차량 읽기를 서버에 연결하고 저장/동기화 상태, 권한 거부, 다른 가족 격리, 삭제 복구를 실제로 검증한다. 현재 브라우저 IndexedDB 미리 보기로 완료 처리하지 않는다. 선행 T026,T027,T044.
- [ ] T046 동일 vault 녹음 위치의 근접 과거 기록 API·주차 확인 gating·사용자 시작 재생을 연결한다. 실제 위치 단위/정확도/미지원/stale·기기 권한·삭제·차 교체 후 과거 기억을 G4/G5에서 검증한다. 선행 T025,T027,T041,T042.

추적: FR-018 → T044,T045; FR-019 → T046. 사진 자동 수집과 상시 위치 추적은 추가하지 않는다.

## Docker 연결 slice — 2026-11-09

T007/T009/T016/T022~T034/T039/T045의 부분 구현을 연결한다. 전체 일반화 모델·청크 프로토콜·제품 기기 암호화·G1/G2/G3 및 백업 복원(T040)의 체크를 대신하지 않는다.

- [X] C001 확인된 로컬 목업 snapshot과 실제 단일 WAV를 명시적으로 공유하는 HTTPS API·DB RLS·기기 토큰을 연결한다.
- [X] C002 보호자 가입·메일 확인·로그인·재설정·차량 코드 및 연결 해제를 구현한다. 개발 메일은 Mailpit에만 전달한다.
- [X] C003 휴대폰 일기·원본 재생/탐색/다운로드·비공개 사진 업로드와 차량 수신·삭제를 연결한다.
- [X] C004 합성 자료로 API 격리·삭제·원본 동일성 및 에뮬레이터 양방향 흐름을 시험한다.
- [ ] C005 실제 iPhone Safari의 인증서 설치·로그인·원본 재생·파일 앱 저장을 사용자가 확인한다.

실행 범위와 실패/보정 이력은 `docs/evidence/compose-runtime.md`에 기록한다.
