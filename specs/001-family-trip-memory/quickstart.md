# Quickstart and Validation

첫 구현에서는 [README의 실행 명령](../../README.md)으로 합성 웹 미리 보기·APK 빌드·계약/파일 테스트를 실행할 수 있다.
실제 플랫폼과 전체 서비스는 아직 미완성이다. 아래 전체 서비스 명령은 해당 후속 작업의 목표다.

## 현재 구현 검증

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
docker compose -f compose.preview.yaml up -d --build
```

39개 TS 테스트,4개 Android JVM 테스트,4개 Chrome 화면·재생 테스트 결과를
[실행 증거](../../docs/evidence/preview-validation.md)에 기록했다.
실제 iPhone/iPad/Safari·Speech/Vehicle SDK·LLM·인증·삭제 종단 검증은 별도이며 아직 통과하지 않았다.
`db:migrate/status`, `dev:worker`, `eval:diary`, 서비스 `test:integration`은 구현할 때 추가하며 현재 script에 없다.

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
- Docker Engine/Desktop과 Compose v2. 개발 프로필 Mailpit에서 합성 계정 검증·재설정 메일을 확인한다.
- `.env.example`의 DB 역할별 연결·Better Auth 비밀·HTTPS origin·원본 경로·SMTP·LLM 키를 설정한다.
  설정 목록과 권한은 [실행·저장 계약](contracts/runtime-and-storage.md)을 따른다. 비밀은 출력하지 않는다.
- mock 생성기는 합성 사례 검증용이고 실제 LLM 성공으로 표시하지 않는다.
- G1/G2 미통과 시 `demo` build와 합성 파일만 사용한다. `pleos` build의 실제 캡처를 활성화하지 않는다.

## 구현 후 실행할 명령

T001~T011 및 T039에서 다음 명령과 설정을 제공한다. 현재 이 명령으로 앱이 실행된다는 뜻은 아니다.

```sh
pnpm install --frozen-lockfile
docker compose --profile dev config --quiet
docker compose --profile dev up -d --build
pnpm db:migrate:status
pnpm test:contracts
pnpm test:integration
pnpm test:e2e
pnpm eval:diary
```

Compose의 db 준비 → 일회성 migrate 성공 → web/worker 시작을 확인한다.
`pnpm db:migrate:status`는 동일 대상 DB의 적용 상태만 확인하는 구현 목표 명령이다.
`pnpm test:integration`은 별도 임시 DB/볼륨으로 실행하고 개발 데이터베이스를 초기화하지 않는다.
종료는 `docker compose --profile dev down`이며 데이터 볼륨 삭제 옵션을 기본 절차에 넣지 않는다.
외부 접속은 proxy의 HTTPS를 사용하고 Mailpit UI는 호스트에서만 연다.

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

## 6. Compose와 복원 검증

T039: 비밀 없는 `config --quiet`, 이미지 빌드, DB healthcheck, SQL 적용 실패 시 앱 시작 차단,
인증 가입→검증→로그인→로그아웃→재설정, 폐기된 세션 거부를 확인한다.
테스트 클라이언트·휴대폰에서 같은 HTTPS 서버에 접속한다. 인증서 무시로 성공 처리하지 않는다.
실제 차량·휴대폰의 원본 재생 종단 검증은 T036에서 수행한다.

T040: 컨테이너 재생성 후 원본·DB 보존, 디스크 부족·잘못된 Range·경로 탈출,
파일 확정/DB 반영 중단·삭제/업로드 경합을 검증한다.
합성 DB·파일 백업을 **별도 프로젝트**에 복원하고 최신 삭제/기기 폐기 표식 적용 뒤 ID·checksum·재생을 비교한다.
기존 볼륨은 그대로 둔다. 결과는 `docs/evidence/compose-runtime.md`, `backup-restore.md`에 기록한다.
클라우드 이전 실행은 이 단계에 포함하지 않으며 동일 계약을 향후 adapter 검증에 재사용한다.

## 결과 기록

`docs/evidence/g0-environment.md`, `g1-capture.md`, `g2-parked.md`, `g3-generation.md`,
`g4-cross-device.md`, `usability.md`에 환경·입력 종류·기대/실제·실패·수정 커밋을 남긴다.
시연 영상에 실제·에뮬레이터·합성/mock 범위를 표시한다. 실패를 제외한 성공률이나
일부 기기만 성공한 결과를 전체 MVP 완료로 보고하지 않는다.
