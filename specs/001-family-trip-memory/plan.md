# Implementation Plan: 가족의 자유로운 이야기와 원본 목소리

**Branch**: `main` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: `specs/001-family-trip-memory/spec.md` · 헌장 1.3.0

**Revision**: 2026-11-08 사용자 결정으로 Supabase 계획을 Docker Compose 단일 호스트 구성으로 대체했다.
앱·컨테이너는 아직 구현·실행하지 않았다. [실행·저장 계약](contracts/runtime-and-storage.md)을 따른다.

## Summary

차량 Android 앱이 가족의 자유 발화 원본과 인식문을 보존한다. 서버는 발화의 사건·시점·장소를
분류해 근거가 있는 일기 초안을 만들며, 사용자는 묶음 검토한다. 보호자는 휴대폰 웹과 주차된
차량에서 같은 보관함의 일기·원본 구간을 읽고 듣는다. 가족·기기 연결, 부분 전송, 재시도,
삭제와 연결 해제를 첫 버전에 포함한다. 기능 범위는 줄이지 않는다.

계획·계약은 작성 완료했으며 **실제 차량 연동은 G0~G2 통과 전 미검증**이다.
이는 해결할 제품 질문이 남았다는 뜻이 아니라 실행으로 확인할 외부 플랫폼 의존성이다.

## Technical Context

**Language/Version**: 차량 Kotlin, JDK17, 제품 minSDK28. 초기 재현은 공식 샘플 Kotlin2.0.0,
AGP8.8.2, Gradle8.10.2, compile/target35 조합을 시험한다. 버전표의 호환성은 G0에서 빌드로 확인한다.
서버·웹은 TypeScript, Node24, pnpm11, Next.js16 App Router. 설치 시 패치 버전과 lockfile을 고정한다.

**Primary Dependencies**: Pleos STT/Vehicle(필수), FusedLocation(선택 capability; 없으면 위치 관측 null), Android 오디오·Room·WorkManager,
Next.js/React, Better Auth + pg, PostgreSQL18, Docker Compose v2, Caddy, 로컬 파일 저장 adapter,
개발용 Mailpit, OpenAI Responses와 JSON Schema 검증. 라이브러리 패치와 컨테이너 digest는 구현 시 검증·고정한다.
모델 초기 평가 후보는 `gpt-5.6-terra`; 계정 사용 가능성·한국어 품질·비용은 G3에서 확인한다.
공급자 호출은 `DiaryGenerator` 인터페이스 뒤에 두고 클라이언트에 비밀키를 넣지 않는다.

**Storage**: 차량 앱 전용 영역의 암호화된 원본 파일과 Room outbox,
PostgreSQL의 인증·보관함·기록·작업·삭제 상태(`pg_data` 볼륨),
API와 작업자가 공유하는 비공개 원본 파일(`audio_data` 볼륨).
`AudioStore` 인터페이스로 파일 경로와 제품 로직을 분리한다. 볼륨은 백업을 대신하지 않는다.
휴대폰은 첫 버전에서 인증된 온라인 읽기·재생을 제공하고 음성 영구 캐시를 만들지 않는다.

**Testing**: Kotlin 단위/기기 테스트, Vitest 계약·도메인·API 검증,
Compose PostgreSQL·파일 저장·인증·볼륨 복원 통합 검증, Playwright 휴대폰 흐름, 합성 한국어 LLM 평가 fixture.
앱 테스트는 아직 실행하지 않았다. 위험도가 높은 원본 연결·권한·삭제·생성 충실도를 우선 검증한다.

**Target Platform**: Pleos 전용 AVD/API34와 지원 차량, 모바일 Safari16.4+·Chrome111+ 웹.
브라우저 최소 버전은 프레임워크 지원 기준이며 실제 음성 재생·탐색 호환성을 별도 시험한다.

**Project Type**: Android 차량 앱 + 모바일 웹/API + 동일 코드베이스의 Node 작업자.
Docker Compose의 web·worker·db·proxy를 단일 호스트에서 실행하는 프로토타입을 먼저 만든다.
Mailpit는 개발 프로필, migrate는 일회성 실행이다. 실기기에는 신뢰되는 HTTPS origin을 사용한다.
이후 같은 이미지를 클라우드 VM에 배포하고 DB·파일 저장소를 단계적으로 이전한다.
배포 공급자·유료 자원 생성은 이번 계획에서 실행하지 않는다.

**Performance Goals**: spec의 SC-001~007을 유지한다. 추가 엔지니어링 목표는 10분 합성 입력의
초안 생성 대기 p95 45초 이내(20회 평가, 입력 크기·모델·비용 기록), 원본 탐색 오차 1초 이내다.
30초·3분·10분·20분 입력을 시험하되 이 길이는 사용자의 발화 형식 제한이 아니다.

**Constraints**: 원본 캡처와 검증된 주차 상태 없이는 실차 입력을 활성화하지 않는다.
속도0·제동 페달·UX 제한 없음만으로 주차를 확정하지 않는다. 공개 다운로드 링크 금지.
화자 수동 선택 유지, 상시 녹음·자동 화자 식별·휴대폰 신규 녹음은 제외한다.
서비스 길이·용량 한도는 G1 실험 결과로 정해 수집 전에 표시한다.

**Scale/Scope**: 보호자1명·차량1대·휴대폰1대/보관함. 초기 5가족 사용성 검증 규모.
한 입력 세션의 여러 사건을 다루며, 별도 벡터 DB·Redis·에이전트 다중 호출 체계는 도입하지 않는다.

## Constitution Check

| 원칙 | 설계 전 판단 | 설계 후 확인 |
|---|---|---|
| I 문제에서 시작 | 제품·19개 FR·7개 SC 기준 | [tasks.md](tasks.md)의 커버리지로 추적 |
| II 기억·목소리 보존 | 원본을 같은 입력의 근거로 유지 | 불변 음성·수정 버전·구간 FK 및 의미 검증 |
| III 주차 맥락 | fail-closed | G2 실제 신호 판정 + UX restriction + focus 중단 |
| IV 접근·삭제 | 보관함/기기 권한 적용 | 인증 프록시, tombstone, 온라인 해제·오프라인 대기 |
| V 실행 증거 | 문서와 실행 분리 | G0~G4 결과를 `docs/evidence/`에 기록, 미실행 작업 미체크 |
| VI 자유 입력 | 장소·주제별 발화 강제 없음 | 내부 조각과 사용자 세션 분리, 정정·시점 전역 정리 |

원칙 위반은 없다. G1/G2 미통과는 제품의 차량 통합 완료를 막으며,
합성 자료를 이용한 계약·서버·휴대폰 작업까지 막지는 않는다.

## Project Structure

### Documentation (this feature)

```text
specs/001-family-trip-memory/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── capture-and-generation.md
│   ├── diary-output.schema.json
│   └── runtime-and-storage.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

아래는 구현할 경로다. 현재 앱 코드가 이미 존재한다는 뜻이 아니다.

```text
apps/
├── vehicle/                         # Gradle Android root
│   └── app/src/{main,test,androidTest}/
└── web/                             # Next mobile UI + /api/v1
    ├── src/{app,server,components}/
    └── tests/{api,e2e}/
packages/
├── contracts/src/                   # JSON Schema validation/types
├── diary/src/                       # generation, evidence validation, jobs
└── storage/src/                     # AudioStore + local filesystem adapter
workers/diary/src/                   # durable DB job runner
db/{migrations,tests}/               # auth/core SQL, roles and isolation
infra/{web.Dockerfile,worker.Dockerfile,Caddyfile}
compose.yaml                        # prototype runtime, not yet created
tests/fixtures/                     # synthetic data only
scripts/                            # contract checks and evaluation commands
docs/evidence/                      # actual environment/experiment results
```

**Structure Decision**: 차량 SDK 의존부는 Android에 한정한다. 웹과 작업자가 같은 TypeScript
계약·일기 로직을 공유한다. 요청 처리 중 장시간 LLM 호출을 붙잡지 않고 DB 작업을 남긴다.

## Design and Delivery Gates

| Gate | 통과 증거 | 실패 시 행동 |
|---|---|---|
| G0 환경 | Pleos AVD 실행·버전·SDK 초기화·권한 로그 | 일반 Android 실행으로 대체 입증하지 않음 |
| G1 원본·STT | 허용된 입력 경로로 파일 저장·재생, 같은 PCM 인식, 구간 정합성·긴 입력 | 캡처 기능 잠금. 합성 파일로 다른 구성 개발, 실제 음성 완료 주장 금지 |
| G2 주차 | 검증된 주차 판정, P→D·D속도0·상태불명·연결단절·focus loss | 실차 녹음·열람·재생 잠금. UX 제한만으로 P를 추정하지 않음 |
| G3 생성 | 합성 사례의 정정·시점·근거·반대 감정·입력 길이 평가 | 이전 초안·원본 유지. 모델/프롬프트 조정 후 재평가 |
| G4 양쪽 기기 | 같은 음성 checksum·구간 재생, 권한 차단·부분 전송·삭제 복구 | 시연 기능 완료 표기 보류, 실패 단위 수정 |

**첫 구현 묶음:** G0/G1/G2 실험 앱과 합성 자료 기반 계약 검증을 시작한다.
이후 차량 기록→웹 재청취의 작은 종단 흐름을 만들고 오류·삭제까지 완결한다.
US1만 구현한 상태는 전체 MVP 완료가 아니다. US1·US2·US3 모두 첫 버전 요구사항이다.

일정은 검증 순서로 관리한다. 최초 환경·캡처 검증에 1작업일을 우선 배정하며,
확인된 제한 때문에 일정이 달라지면 원본/휴대폰 기능을 몰래 제외하지 않는다.
접수 영상에는 mock·합성 자료·실제 연결 여부를 구분한다.

## Complexity Tracking

정당화할 헌장 위반 없음. 작업자는 긴 생성·삭제 재시도를 요청 처리와 분리하기 위해 필요하다.
별도 큐 제품 대신 Postgres의 작업 행·lease·재시도를 사용한다.
근거·설계 결정은 [research.md](research.md), 필드와 전이는 [data-model.md](data-model.md),
실행 검증 절차는 [quickstart.md](quickstart.md)를 따른다.

## UI revision — 2026-11-08

FR-009/US2-2의 탐색은 기록 연월별 묶음·기간 선택·검색으로 구성한다. 날짜/장소 API 계약의
기존 date_from/date_to 범위를 활용할 수 있으며 장소는 메타데이터와 검색에 남긴다.
원문과 전체 녹음은 하나의 재생 상태를 공유한다. 구간 선택은 session 시각으로 seek 후
재생을 시작하고 구간 끝에서 중단하지 않는다. manifest 경계도 전체 녹음의 연속 재생으로
다룬다. 웹 합성 미리 보기에는 단일 8초 시험음으로 UI 동작만 반영했으며 실제 다중 chunk
연결·권한·Safari/차량 재생은 T025~T028/G4에서 따로 검증한다.

## Vehicle memory revision — 2026-11-08 (constitution 1.2.0)

FR-016/017을 첫 버전 메타데이터로 추가한다. 차 별명·차종·모델·연식·선택적 번호는
VehicleProfile에서 SessionContext로 복사한다. 녹음 시작 시 차량 위치의 출처·시각·지원 상태를
고정한다. 조회 시 현재 프로필/현재 위치와 다시 조합하지 않는다. 차량별 과거 기록을 조회하되
활성 차량 연결은 한 대를 유지한다. 자세한 모델/계약과 [기술 근거](../../docs/research/vehicle-memory.md)를 따른다.

G5는 SDK capability·위치 권한·timestamp 단위/최신성·차량 변경·미지원 환경 검증이다.
웹은 먼저 가상 snapshot/위치와 미확인 상태로 흐름을 제공한다. 차별 조회/표시와 순수 snapshot
정책의 단위 검증은 가능하지만 Android 수집·DB 영속·인증된 동기화의 대체 증거가 아니다.

## Photo and recall revision — 2026-11-08

사진 첨부는 FR-018로 첫 버전에 포함한다. 웹 미리 보기는 브라우저 IndexedDB에 정규화한 사진 사본만 저장하며 서버 업로드/기기 동기화로 표시하지 않는다. 인증된 서비스 구현은 PhotoStore와 비공개 photo_data 볼륨을 사용하며 HTTP·삭제·백업 계약에 포함한다. Supabase는 추가하지 않는다.

FR-019는 같은 vault의 녹음 위치 좌표를 Haversine 거리로 비교해 300m 이내 과거 기록을 최신순 최대3개로 반환한다. 반경은 초기 정책이다. 좌표가 없거나 현재 위치 상태가 미확인이면 결과를 만들지 않는다. API 인증과 주차 gating은 T046의 실제 통합 검증 대상이다. 웹 fixture의 주차/위치는 시연 가정이며 실제 SDK 증거가 아니다.

## G1 probe revision — 2026-11-08

T005 실험은 별도 `probeDebug` 패키지에서 실행한다. release variant는 만들지 않고 런타임에도
에뮬레이터 여부를 확인한다. 실험자가 모의 P와 공동 녹음 안내를 명시적으로 확인해야 시작한다.
AudioRecord의 16kHz/16-bit/mono PCM을 앱 전용 WAV에 보존하고 동일 payload만 Pleos
SpeechToText3.3.1 ON_DEVICE에 전달한다. `request()`로 별도 마이크를 켜지 않는다.
초기 캡처 probe는 네트워크 권한을 제거했다. 후속 review-to-draft probe의 텍스트 전송 예외는 아래 절을 따른다.
원본·개인 인식문을 Git/앱 로그로 내보내지 않는다.
실험 파일은 앱 전용 평문이며 제품의 암호화 LocalStore(T008), chunk 복구, 동기화를 대신하지 않는다.
probe UI에서 전체 삭제를 제공한다. 실제 주차·UX 신호 연결 전 pleos 제품 flavor는 잠금을 유지한다.
합성 PCM 주입/무음 캡처/사용자 실제 발화 검증은 각각 구분해 G1에 기록한다.

STT 누락 조사에서는 테스트 APK의 합성 asset만 사용해 100ms/200ms 청크와 단일 버퍼 전송을 비교한다.
SDK 원시 이벤트(중간/최종/EPD/종료)와 전송 바이트 수를 기록하고, 앱의 결과 누적 및 종료 처리와
엔진 자체 출력을 분리한다. 실제 사용자 녹음은 진단 입력·로그에 사용하지 않는다.

## Review-to-draft probe — 2026-11-08

FR-003/005/006/010/013/014의 다음 실험은 기존 probe에서 원본 재생→인식문 수정·확인→생성→초안 검토·기기 저장이다.
인식문 이력, 수정문, 수동 화자 별칭, 입력 revision, 원본 SHA256, 초안과 확정 revision을 앱 전용 AtomicFile에 보존한다.
수정 시 확인·확정 상태를 무효화하고 이전 초안은 이전 버전으로 남긴다. 늦은 생성 응답은 다른 원본/수정 revision에 적용하지 않는다.
미검증 EPD를 대신해 이 단계의 근거는 녹음 전체 범위이며 세부 구간 시각을 LLM이 추정하지 않게 한다.

실험용 HTTP 서비스는 맥북 127.0.0.1:4319에만 열고 adb reverse로 연결한다. 256-bit 로컬 연결 토큰으로 보호하며
공개 웹/API·가족 인증·동기화를 대체하지 않는다. probe에만 INTERNET과 localhost cleartext 예외를 추가한다.
사용자가 화면의 전송 안내를 확인하고 생성 버튼을 눌러야 확인문·별칭·날짜가 전달된다. 음성·번호·위치는 전달하지 않는다.
API 키는 서버 전용 환경변수이며 Responses store:false, strict schema와 기존 근거 검증을 적용한다.
키/모델 미설정, 거절·불완전·잘못된 근거는 명시적 실패로 표시한다. 자동으로 합성 일기를 반환하지 않는다.
이 단계는 T017/T020의 독립 실험 기반이며 T011 durable jobs, T018 long-input windows, 제품 인증 경로 완료가 아니다.

사용자 결정: 실제 앱 생성 adapter는 OpenAI API로 구현하되 프롬프트·내용 품질 실험은
claude-web-experiments 스킬의 Claude 웹 구독으로 수행한다. 웹의 역할·모델·설정·지연을 API와 동일하다고 주장하지 않는다.

### 2026-11-09 사용자 결정: API 연결을 미루고 목업으로 진행

로컬 probe는 `DIARY_GENERATOR=mock`을 기본으로 실행한다. 목업은 확인문을 그대로 반환하는
결정적 응답이며 각 입력의 화자·전체 원본 범위·session/revision을 보존한다. 실제 LLM 분류·정제 결과라고 표시하지 않는다.
목업 생성/저장/재열람에 ‘목업 · AI 정리 전’을 표시하고 데이터에 generation_mode를 보존한다.
OpenAI 모드는 명시적 설정으로만 켜며, 오류 시 목업으로 자동 대체하지 않는다.
클라이언트의 요청 모드와 서버 모드가 다르면 외부 호출 전에 거부한다. 연결 스크립트가 로컬 모드를 기기에 전달한다.
합성 자료로 확인문 수정→HTTP 목업 응답→검토/저장→재열람/원본 재생 및 revision 무효화를 검증한다.
제품 서버·가족 인증·양쪽 동기화/G3 완료를 대신하지 않는다.

## Generation revision — 2026-11-09

### 차량 화면 통합 — 2026-11-09

사용자 승인으로 기존 probe의 검증된 캡처/STT/목업/ReviewStore를 차량 UI에 연결한다.
같은 앱 ID·저장 디렉터리를 유지해 기존 녹음을 보존하고 웹의 k-style 색·간격·월별 탐색을
Android View 기반 보관함/녹음/상세 화면으로 옮긴다. 상세는 일기 읽기·전체 원본 플레이어·확인/생성을 분리한다.
검증되지 않은 단어별 시간축을 만들지 않으며 현재 STT는 전체 원본 한 구간으로 표시한다.
수동 차량 프로필과 녹음 시작 시점의 context 스냅샷을 별도 AtomicFile에 보관한다.
위치 기본값은 미연결이고 사용자가 켠 합성 위치는 출처·관측 시각과 함께 모의로 표시한다.
사진은 사용자가 선택한 파일만 제한·디코딩 후 앱 전용 공간에 저장한다. 폰 동기화나 실차 검증 완료로 표시하지 않는다.
읽기/녹음/생성/재생은 모의 P·공동 안내·foreground 조건을 유지하고 이탈 시 중단한다.
검증은 합성 자료의 UI 탐색·생성·저장·재열람·재생/탐색·중단·context 불변·사진 격리/삭제 및
가로 화면/큰 글자/좁은 화면을 포함한다. 실제 개인 녹음은 캡처·출력·스크린샷에 사용하지 않는다.

family-diary-v2는 일반 장소명 보존, 합의 없는 화자 충돌의 개별 표현, 검토 표시 일치를 명시한다.
wire schema_version=1은 유지하고 계약 검증기가 source ID로 질문과 그룹을 연결해 불일치를 거부한다.
같은 발화가 여러 그룹에 있으면 모두 보수적으로 표시한다. 선택 정보의 null 자체는 질문을 강제하지 않는다.
기존 관측 실패 E06/E07/E09는 회귀 입력으로, 사전 작성 E13/E14/E15는 새 평가로 분리한다.
전후 원문·프롬프트/스키마 해시를 보존한다. 실제 API·전체 G3 검증과 별개로 결과를 기록한다.

추가 v3는 모호한 지시 대상의 임의 확정 금지와 정확한 하루를 모르는 date:null, 코드 펜스 없는 출력을 명시한다.
v2 평가에서 발견한 E13/E14를 회귀 자료로 전환하고 새로운 E16을 분리한다. 원래 3항목의 v2 검사와
v3 추가 검사 범위를 구분하며, 재시도 성공만 남기는 대신 버전별 첫 응답을 모두 보존한다.

### 차량 파일 선택 제외 — 2026-11-09

사용자 확인: 차량 에뮬레이터 파일 저장 미지원. 사진 첨부는 휴대폰/웹에 두고 차량의 파일 선택 호출을 제거한다.
기존 사진 열람·확대·삭제는 유지한다. 차량 UI 검사는 합성 사진을 저장소에 준비해 수행하며 폰 동기화로 주장하지 않는다.

## Docker 연결 구현 — 2026-11-09

사용자가 차량과 휴대폰의 같은 기록 읽기·원본 듣기·휴대폰 사진 첨부 동기화를 승인했다.
기존 probe의 완료 WAV·검토한 일기를 업로드하는 단일 원본 snapshot 경로부터 구현한다.
범용 다중 chunk/서버 생성 작업의 모든 endpoint를 구현했다고 주장하지 않는다.
Better Auth 검증 이메일·DB 세션, RLS 보관함 격리, 별도 차량 토큰/일회성 연결 코드,
HTTPS·비공개 AudioStore/사진 볼륨, 동기화 cursor·삭제 표식·폐기된 기기 잠금을 먼저 연결한다.
업로드는 명시적인 '휴대폰과 공유' 동작이며 연결만으로 기존 개인 녹음을 일괄 전송하지 않는다.
현재 AI 생성은 목업 그대로 유지하고 생성된 draft도 서버에서 근거·revision·모드를 검증한다.
인증/원본/사진/재시작/교차 보관함/삭제·폐기는 합성 자료로 검증한다. iPhone의 로컬 CA 신뢰는
사용자 기기 설정이 필요하며, 실제 Safari 확인과 자동 브라우저 검사를 분리한다.

### 연결 상태 피드백 보정 — 2026-11-09

사용자가 차량 코드를 입력한 뒤 성공 여부를 알기 어렵다고 보고했다. 인증된 `/me` 조회로 연결 및 동일 보관함을 확인했으며 아직 공유 기록은0개다. US2 연결/준비 상태와 헌장IV에 따라 차량 설정 상단·보관함에 연결 상태를 표시한다. 연결 후 코드 입력을 숨기고 마지막 서버 확인/완료된 동기화 시각·원본 전송이 끝난 사본 수·공유할 일기 고르기를 제공한다. 실패는 연결 해제와 구분하고, 연결됐다는 이유로 기존 녹음을 자동 전송하지 않는다. 이전 버전의 시각이 없으면 ‘시각 미기록’으로 표시한다.

## 2026-11-09 연결 설정 보강

C007: 웹/차량 사진 contain, 연결 별칭 입력/수정 및 서버 권한 검사. 기존 devices.label을 사용하며 DB 구조 변경 없음.
C008: probe에 Android Automotive CarPropertyManager의 INFO_MAKE/MODEL/MODEL_YEAR 읽기 전용 adapter를 추가한다. 화면 진입에서 비동기 조회·시간 제한·release, 빈 필드만 병합, 수정/저장 후 기록 snapshot 불변. Pleos CarInfo 2.3.2 바이너리에는 CRN/VIN 조회만 확인돼 제조사/모델 API를 추측하지 않는다. 실차 지원과 공모전 제품 경로는 별도 검증한다.

2026-11-10 C009: 공통 파일 크기/헤더 검증을 실제 업로드와 미리 보기에 적용하고, 기존 Sheet 기반 사진 업로드 오류 알림으로 현재 위치에서 원인/조치를 제공한다. 정상 업로드와 서버 파일 검증은 유지한다.

2026-11-10 C010: native 사진 렌더링을 2열 공통 격자로 구성한다. inline 4장, 전체 사진 대화상자, 확대/삭제 확인 대화상자 순서. 빈 상태/4장 경계/삭제 후 더보기 숨김을 합성 기기 테스트로 확인한다.

2026-11-10 C011: 실제/미리 보기 웹에 PhotoCollection 공통 컴포넌트(4장/전체/확대/삭제 선택)를 적용한다. 차량은 기존4장+더보기 유지. 읽기 탭 배경 transparent. 합성5장과 삭제 실패/취소/성공, 메뉴 키보드/모바일 레이아웃 검증.

C012: 사진/일기 공통 ActionMenu, 빈 사진 메뉴 사용 가능, 원본 파일 링크를 재생 Sheet 하단으로 이동. 설명 제거는 실제 기록에 한정하고 합성음 미리 보기 출처 표시는 유지. 메뉴·파일 선택·다운로드·삭제 확인 동작을 합성 브라우저 검증한다.

## C013 차곡 시각 체계와 기능 연결

참조: 사용자 제공 HTML의8개 렌더링 화면 확인. 모바일 배경 #F4F5F7, 카드 #FFFFFF, 잉크 #14171E, 테두리 #DFE3EB, 강조 #3030FF. 차량 배경 #0B0E12, 카드 #171B22, 본문 #F3F4F7, 보조 #ABB2BF, 녹음 #FF6647. 20px 모바일 여백, 둥근20px 카드, 44px 이상 터치 영역. 한글은 로컬 Pretendard/Android sans-serif, 숫자는 참조에 포함된 Space Grotesk(웹, OFL 유지). 참조의 왼쪽 정렬과 날짜 위계를 우선하며 추천 도구의 일반 마케팅 패턴은 채택하지 않는다.

웹: 기존 LiveApp 상태/API를 유지하고 셸·월별 목록·상세 레이아웃·연결 화면을 교체. 모바일 원문은 전체 화면 대화상자, desktop은 제한폭. 기존 AudioPlayer의 검증된 Blob을 다운로드에도 재사용. 차량: native View 테마와 adaptive rail/2열 배치를 교체하고 캡처·STT·검토/저장·동기화 콜백을 유지. 현재 실행 불가능한 디자인 예시 기능은 버튼을 만들지 않는다. 기존 기록에 대한 자동 전송은 추가하지 않는다.

검증: 합성 자료로375/390/812/1440px 화면·빈값·월별검색·사진메뉴·원본재생/탐색/동일바이트다운로드·삭제확인·기기별칭. native 합성 instrumentation으로 탐색/사진 및 주차 gate 회귀, probe 빌드·설치. 실차 지원이나 iPhone 파일 앱 저장 완료로 확대하지 않는다.

## C014 실행 계획

C013의 수작업 CSS/native 근사 구현을 교체한다. 원본HTML에서8개 화면의 순수 DOM/SVG/인라인스타일을 추출하고, 외부 런타임 없이 공통 로컬 renderer로 사용한다. 웹은 동일 출처의 정적 UI와 기존 인증 API, 차량은 앱에 번들한 동일 DOM과 좁은 WebView bridge로 native 캡처/저장/주차 gate에 연결한다. WebView는 신뢰된 번들 origin만 허용하고 외부 navigation/파일 접근을 막는다. 데이터는 textContent로만 채우며 HTML 삽입하지 않는다. 원본 Noto Sans KR/Space Grotesk를 로컬 번들한다. 모의/실제 구분은 데이터 레이블과 동작 진입에서 설명하고 기본 화면에 별도 검증 패널을 추가하지 않는다. 8개 원본과 동일viewport 캡처를 비교하고 기능 검사를 별도 수행한다.

## C015 실행 계획

공통 renderer의 사용자 요청 부분만 수정하고 원본의 나머지 배치/폰트를 유지한다. 사진 확대는 CSS scroll-snap으로 구현하여 iOS 기본 터치 스크롤을 유지하고 overflow 메뉴로 삭제를 분리한다. CaptureProbe가 저장하는 PCM의 RMS만 bridge에 전달하며 음성 내용/샘플은 웹에 보내지 않는다. 기존 CloudSync.delete와 검토 저장을 재사용하여 로컬/서버 삭제를 구분한다. 합성 PCM 단위 검사, 합성 자료 WebView 삭제/파형 및 모바일 스와이프·삭제 취소/오류/성공 회귀, 실제 서버 기존 기능 회귀를 수행한다.

## 개발 환경 IP 갱신

`refresh-runtime.ts`는 기존 비밀/볼륨/페어링을 보존한 채 Mac 기본 인터페이스 IPv4 또는 명시 IP를 APP_HOST/APP_ORIGIN에 반영한다. Compose 상태·공개 CA·hostname 검증 HTTPS health를 확인한 후, 부팅된 에뮬레이터의 HTTPS 주소/CA와 실행 중인 목업 서버 연결만 갱신한다. 기록 업로드/생성이나 실제 공급자 호출을 하지 않는다.

## C016 실행 계획

단일 AudioRecord의 저장 성공 PCM 복사본을 용량 제한 큐로 STT sender에 전달한다. 초기화 대기·취소·큐 초과·끝 신호를 처리하며 별도 마이크를 열지 않는다. 기존 저장파일 재인식 경로를 유지한다. 중간 문장과 인식 상태는 nativeState로 표시하되 실제 화자 분리는 추정하지 않는다. 녹음 종료 후 carreview 화면에서 편집→확인/목업생성→초안검토→저장을 연결하며 원본 checksum과 revision 검증을 재사용한다. 실제 SDK에 합성 음원을 스트리밍하는 instrumentation과 WebView 생성/실패/저장/재열기 테스트, 사진 고정 버튼 및 스와이프 회귀로 검증한다.

## C017 실행 계획

사진 created_at nullable 추가와 새 업로드 기본값, 기존 행 NULL 유지 및 안정 fallback 순서. native photo-order metadata로 서버 순서를 유지한다. 전면 주차/idle에서만 증분 pull, 변경 없으면 화면 재생성 없음, 편집/재생/녹음 중 보류, 실패 backoff/백그라운드 취소. PCM envelope는 읽기 전용 샘플링으로 만들고 재생 시각과 결합한다. 합성 사진 최신순·자동수신·카드강조·빈칸·재생색/탐색/일시정지 및 검토문구 회귀로 확인한다.

## C018 실행 계획

사진 선택을 클릭 이벤트에서 직접 열고 input을 body에 유지한다. 한도 클릭은 안내, 선택 후 검증/전송 상태를 사진 영역에 표시한다. 파일 헤더 읽기 제한 시간과 업로드 AbortController 제한 시간을 두며 종료 시 상태를 정리한다. 합성 파일로18MB/HEIC/8장/진행/HTTP 오류/시간 초과·재시도를 독립 headless에서 검증한다. 실제 서버 업로드 회귀 후 배포한다. 동기화 방식/주행 정책은 이번 문의에서 설명과 공식 자료 확인만 하고 임의로 변경하지 않는다.

## C019 실행 계획

음성 허용과 시각적 검토 허용을 분리한 순수 정책을 도입한다. probe MainActivity는 기존 P 체크를 상태불명 해제의 의미로 유지하고 별도 모의 주행 상태와 시험 전환 버튼을 제공한다. native 음성 전용 패널은 기존 UI 색/큰 버튼을 사용하고 WebView를 숨김/정지한다. native bridge allowlist와 사진 resource 검증은 UI와 독립적으로 차단한다. 기존 AudioRecord/PCM/STT/MediaPlayer와 저장 계약을 재사용하고 캡처 완료 시 주행 여부에 따라 검토 진입을 보류한다. release는 실제 권한 확인 전 잠금을 유지한다. 동기화 SSE/WebSocket 전환은 이번 비교 요청에 대한 제안이며 별도 구현하지 않는다.

### 동기화 전환 제안 — 아직 미구현

추천 조합: 앱 실행/foreground 복귀/네트워크 복구 시 cursor 기반 조회 + foreground SSE 변경 알림 + 스트림 실패 시 느린 polling fallback. SSE는 vault 인증된 변경 존재/최신 cursor만 알리고 데이터는 기존 HTTPS GET으로 가져온다. 다시 연결되면 이벤트 수신 이력만 믿지 않고 기존 cursor에서 조회한다. 갱신 작업은 단일 실행으로 합치고 사용자 편집·재생 중 원본 교체/삭제 적용은 안전한 시점으로 미룬다. 서버 데이터 수신과 UI 주차 gate를 분리하되 현재 CloudSync의 파일 직접 변경을 고려해 staged apply가 선행해야 한다.

실행/복귀 조회만 쓰면 비용과 복구 동작은 단순하지만 앱을 계속 보고 있을 때 변경을 놓친다.5초 polling은 지속 연결 없이 구현이 단순하지만 무변경 요청·지연이 있다. SSE는 단방향 알림에 적합하고 기존 HTTP API와 결합하기 쉽지만 연결 수·heartbeat·인증 만료·재연결 처리가 필요하다. WebSocket은 양방향 실시간 협업까지 필요할 때 유리하지만 현재 사진/일기 변경 알림에는 이점이 작고 연결/구독/배포 관리가 추가된다. SSE와 WebSocket을 동일 알림용으로 동시에 유지하지 않는다. fallback polling은 스트림 정상일 때 중지한다. 앱 background에서는 불필요한 연결/폴링을 정리하고 foreground 복귀 조회로 보완한다.

근거: [MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), [MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API). 최종 선택과 구현은 별도이며 이번 C019에서5초 polling 자체를 교체하지 않았다.


## C020 실행 계획 — 이전 동기화 제안 대체
느린 fallback 포함 모든 주기 데이터 polling을 제거한다. PostgreSQL commit NOTIFY→인증된 SSE(변경 있음만 알림), 재연결 후 기존 cursor pull. 서버 heartbeat는 인증/연결 유지 목적이며 변경 데이터 polling이 아니다. 전면에서만 스트림 유지, native 파일 적용은 기존 안전한 idle/P 시점까지 dirty flag로 합친다.

차량 상태 adapter를 service 생명주기에 연결하고 Activity는 구독자로 변경한다. service는 AudioRecord/STT/저장/포커스를 소유하며 알림·종료 action·START_NOT_STICKY를 사용한다. 실차용 flavor 잠금과 미승인 카테고리 경계는 유지한다. PNG 기준 녹음 DOM을 재구성하고 실제 elapsed/PCM/STT를 연결한다.

검증: SSE 인증/격리/commit/재연결 누락 복구/주기 pull 없음, background/Activity 재생성 녹음 및 최종 WAV, 플랫폼 기어/UX callback과 UNKNOWN 차단, 참조 화면/동적 내용/기존 사진 회귀. 합성 입력만 사용한다.

## C021 실행 계획
1. 공개 FusedLocation1.1.3 AAR/API 확인, 순수 freshness 정책과 lifecycle adapter 추가. 전면에서 관측 후 시작 순간 복사하고 서비스가 같은 context를 저장한다. 서버 import와 양쪽 표시 경로를 함께 갱신한다.
2. TextToSpeech3.3.1 ON_DEVICE와 원본 MediaPlayer를 PlaybackService가 소유한다. Activity bind/rebind, notification stop, audio focus/vehicle restriction, UI seek와 실제 파형을 연결한다.
3. 기존 faithful 디자인에 동기화 상태와 차량 필터만 추가한다. 최초 공유는 명시적이며 느린 polling은 재도입하지 않는다.
4. 새 합성 회귀, Android 빌드/SDK 실행, 별도 headless UI 검증. 심사용 패키지 생성 스크립트와 실행·제한 안내를 작성하며 비밀값/실제 기록은 제외한다.

## C022 후속 구현 계획 — 이번 작업은 보고서/요구사항 보완

차량·시스템의 테마/조도 신호 지원 확인 후 라이트/다크 전환과 수동 선택을 설계한다. 주행 정책에 맞는 최소 TTS 조작과 PlaybackService 재생 목록을 추가하고, 정상 완료의 다음 항목 진행과 강제 중단 뒤 무재개를 구분해 검증한다. C023 자동 동기화를 먼저 구현한다. 테마는 차량뿐 아니라 모바일 웹에도 시스템 설정 연동과 수동 선택을 제공한다.

## C023 자동 동기화 구현 계획

1. 최종 저장/수정 확정 이벤트와 기존 CloudSync.share를 분리해 자동 업로드 coordinator에서 호출한다. UI 공유 버튼이 성공의 필수 조건이 되지 않는다.
2. 세션·입력 revision·보관함 ID별 영속 outbox, 멱등 키, 전송 단계(snapshot/audio/확인), 재시도 시각을 저장한다. 최종 저장 직후 outbox 누락을 시작 시 재조정해 복구한다. 실행 중 새 revision은 같은 업로드 바이트를 바꾸지 않으며 후속 작업으로 처리한다.
3. 앱 실행/복귀/네트워크 복구와 OS 허용 예약 작업을 연결한다. SSE는 전면 힌트+cursor로 유지하며 백그라운드 상시 연결이나 데이터 폴링을 도입하지 않는다. 파일 적용 gate와 업로드 작업은 분리해 이미 확정된 복사본을 전송한다. 사용 중 원본 이동/삭제 경합은 잠금/작업 취소로 처리한다.
4. 서버 snapshot revision과 로컬 input revision을 분리한다. 409는 최신 서버 상태를 조회해 사진만 달라진 경우에만 안전하게 재조정하고, 내용 충돌은 사용자 확인을 위해 보존한다. 401/철회는 자동 재시도하지 않고 연결 복구를 요구한다.
5. 미연결 완성본의 첫 연결 이관 범위를 안내하고 가족 보관함 소유권을 결속한다. 이전 보관함 기록을 다른 가족에 자동 게시하지 않는다. 삭제 tombstone을 업로드보다 우선하고 재실행 후 부활을 막는다.
6. 상태 UI·실행 안내를 새 정책과 맞춘다. 지원서 1차 완료본은 이번 구현에서 수정하지 않는다. offline/중간 실패/프로세스 재시작/동시 사진 변경/삭제/연결 변경을 합성 데이터로 검증한다. 검증된 구현 범위만 자동 동기화 완료로 표시한다.

### C023 실행 설계

- 앱 전용 AtomicFile outbox에 확정 snapshot·vault/device·파일 소유권·멱등 키·단계·재시도 시각·삭제 의도를 기록한다. ReviewStore 저장 후 등록 누락은 시작 시 재조정한다.
- 프로세스 내 CloudSync 인스턴스를 공유하고 네트워크 변경 작업을 직렬화한다. UI 저장은 별도 짧은 outbox 잠금으로 네트워크와 독립한다. 전송 중 snapshot은 변경하지 않는다.
- Android JobScheduler의 네트워크 제약/지수 backoff를 사용한다. 최종 저장·연결·앱 복귀에서 즉시 작업을 요청하고, 서버 데이터는 SSE 힌트가 있을 때만 cursor로 받는다. 백그라운드 업로드는 로컬 화면/미디어 파일을 바꾸지 않는다.
- 서버 삭제/철회로 필요한 로컬 사본 정리는 기존 주차/유휴 gate 안에서 수행한다. 삭제 요청은 로컬 tombstone을 먼저 저장하고 원격 삭제를 재시도한다.
- 첫 연결 안내에 기존 완성본 포함을 명시한다. 다른 보관함 소유 기록은 자동 이관하지 않는다.

C023 구현/합성 검증 완료: 네이티브 최종 저장, JobScheduler 화면 없는 실행, HTTPS 전송/재시작/멱등/삭제/내용 충돌, 모바일 SSE 자동 반영을 확인했다. 검증 상세와 미검증 실차 조건은 증거 문서를 따른다.


## C024 실행 계획

1. faithful 원본 레이아웃의 색상을 의미별 CSS 변수로 옮긴다. theme.js를 CSS 전 초기화해 모바일 저장값/시스템 설정 또는 native theme bridge를 읽는다. 적용은 루트 data-theme 갱신으로만 수행한다.
2. 모바일 목록 헤더에서 소개 제목을 제거하고 검색·필터 버튼 하나를 둔다. 차량도 같은 검색어/차량 필터 패널과 결과 상태를 사용한다.
3. 차량 SharedPreferences에 기기별 모드를 저장한다. uiMode configuration change를 Activity 재생성 없이 받고 native palette 및 WebView 토큰만 갱신한다. 기존 recording/playback service와 편집 상태를 그대로 둔다.
4. native 설정과 모바일 가족 메뉴에 화면 설정을 제공한다. 서버 API/DB 변경은 없다. 변경한 범위의 웹 조합/키보드/뷰포트 검사, 실제 Android 주야간 신호 변경 및 원본/녹음 지속 검사를 수행한다.
5. 최신 APK/개발 웹을 적용하고 테스트용 에뮬레이터를 종료한다. C022c TTS 플레이리스트는 후속으로 유지한다.

C024 구현/검증 완료: CSS 토큰과 기기별 설정, 통합 검색, Android uiMode 처리 및 녹음·청취·입력 유지, HTTPS 배포 후 회귀를 확인했다. 자세한 범위는 `docs/evidence/compose-runtime.md` C024에 기록했다.


## C025 실행 계획

PlaybackService의 단일 narrate를 불변 NarrationItem 목록과 index로 확장한다. 큐 동안 하나의 엔진과 foreground/session/focus를 유지한다. 정상 완료는 다음 요청으로, 명시적 이동은 SDK onStop 확인 후 다음 요청으로 전환한다. 항목별 콜백 generation을 무효화해 늦은 이벤트를 차단한다. stop은 큐까지 폐기한다. MainActivity에서 파일·확정 revision·본문을 검증해 큐를 생성하고 주행 최소 조작과 native bridge를 연결한다. faithful 목록에는 이어 듣기 버튼, 목록/상세에는 공통 재생 제어를 붙이며 nativeStatus로 현재 항목과 경계를 갱신한다. 원본 버튼/파형과 구분하고 테마 토큰을 재사용한다. Android 실제 SDK 계측과 독립 브라우저 합성 UI 검증 후 최신 APK를 적용하고 테스트 프로세스를 정리한다.

C025 구현/에뮬레이터 검증 완료. 초기 항목별 engine.stop/release 경합은 큐 동안 엔진 재사용과 onStop 확인 후 이동으로 보정했다. Docker 웹 재빌드는 엔진 응답 부재로 미완료이며 최종 차량 APK는 설치했다.


## C026 실행 계획

공식 STT ResultListener와 실제 AAR 인터페이스를 확인하고 합성 다중 발언 PCM의 EPD 기준/순서를 먼저 검사한다. 검증 결과에 따라 PCM byte→ms 변환과 확정 구간 결합기를 구현한다. ReviewRecord·로컬 저장·snapshot/서버 검증·CloudSync에 선택 필드를 추가하고 원문/확인문을 분리한다. 차량/모바일의 원본 플레이어에 클릭 탐색과 현재 구간을 연결한다. SDK·단위·계약·웹/차량 합성 검증으로 완료 범위를 기록한다.

C026 SDK 진단 결과: 연속 요청의 두 번째 EPD는 세션 전체 좌표가 아니었다. 따라서 각 요청의 첫 확정 결과/EPD만 사용하고, EPD 끝 이후 아직 인식하지 않은 PCM을 보존해 명시적인 다음 입력 원점에서 재전송한다. 마이크는 계속 동일 파일을 기록하며 추가 녹음/이중 STT 파일/문장 길이 추정은 없다. 새 원점의 첫 EPD를 고정 PCM 32000 bytes/sec로 변환한다. SDK 구간 누락·부분 결과는 null 시간으로 보존한다. 실시간과 파일 재인식에서 같은 경로를 사용한다.

C026d 서버 반영 검증: Docker 상태 확인 → 최신 이미지 빌드/현재 LAN 주소 반영 → 별도 합성 보관함에서 실제 Pleos 인식 원문·시각 저장 → 확정 outbox 업로드 → 이미 열린 모바일 화면의 SSE 수신/구간 재생 → 사진 업로드 후 차량 증분 수신 및 빈 로컬 저장소 재수신의 원문/시각/SHA 보존을 확인한다. 기존 사용자 연결·보관함에는 테스트 입력을 넣지 않는다. 테스트 에뮬레이터는 종료하고 요청된 개발 서버는 유지한다.

C026d 실행 완료: 기존 Docker가 정상 응답해 강제 재시작 없이 최신 이미지를 반영했다. 실제 SDK/HTTPS/독립 모바일 브라우저/차량 증분 및 빈 저장소 복원 검증을 통과했다. 증거는 `docs/evidence/c026-original-timeline.md` 후속 절에 있다.


## C027 실행 계획
MainActivity.navigate에서 설정 전용 표시 상태를 해제하고 요청한 웹 route로 이동한다. 뒤로 가기는 기존 웹 화면을 보존한다. faithful에 inline 테마 제어를 추가하고 native bridge/DiaryTheme 저장을 재사용한다. 녹음 template의 시간/파형에 data 속성을 지정해 연결한다. 독립 웹 검사와 실제 WebView 설정 왕복·테마·합성 PCM 레벨 검사 후 최신 APK/서버에 반영한다.

C027 구현/검증/적용 완료. native 실제 WebView와 독립 UI 및 HTTPS 서버 회귀 증거는 `docs/evidence/c027-navigation-theme-wave.md`에 있다.

## C028 실행 계획
1. 테마 제어에 자동 선택/현재 적용 색상과 시스템 기준 피드백을 추가한다. 모달 상단 X 헬퍼를 검색/가족에 적용한다.
2. 검색 차량 키와 라벨의 정규화를 통일한다. 빈 차량/공백/차종만 있는 snapshot을 합성 입력으로 검사한다.
3. 공식 TTS stop/release 경로를 확인하고 종료 확인까지 엔진을 유지한다. 실제 SDK 출력 상태와 큐 무재개·재시작·MediaSession 이전/다음을 에뮬레이터에서 확인한다.
4. 독립 브라우저 두 테마/작은 모바일 패널, 실제 WebView/SDK 및 빌드를 검증하고 최신 APK/서버에 반영한다. 하드웨어 조사/미검증 범위와 실행 증거를 남긴다.

C028 구현/검증/서버 및 APK 적용 완료. `docs/evidence/c028-controls-and-playback.md` 참조. 전체 CCP/터치패드 실차 적용은 후속 검증 범위다.

## C029 실행 계획·디자인 검토
PNG 기준 1280×720, 탐색112px, 본문 좌우48px, 카드 간격20px·반경28px를 사용한다. 글꼴은 기존 Noto Sans KR, 제목36px/카드24px/본문18px. 배경 #0b0d12, 탐색 #11141b, 카드 #161a22, 본문 #f2f4f8, 보조 #aeb7c6, 강조 #b4bcff를 기존 테마 토큰과 연결한다. 배치는 `탐색 | 연결 / 위치 | 우리 차 / 화면`의 두 열이며 카드 내부는 왼쪽 정렬, 설정 강조를 하단에 둔다. PNG의 자동녹음/안전해제 토글을 복제하지 않고 현재 제품의 필수 설정을 넣는다. 이는 시각 기준을 유지하면서 허구 기능과 정책 충돌을 없애기 위한 조정이다.
faithful carsettings route에 새 설정 UI를 두고 MainActivity의 주차 검증 bridge로 기능을 연결한다. 기존 저장/API를 재사용하고 저장소 변경은 하지 않는다. 모바일는 manual-only theme migration을 적용한다. 합성 UI/실제 WebView 검증 후 APK 및 Docker 반영한다.

C029 완료. PNG 기준 설정 UI와 기능 bridge, 모바일 수동 테마/검색 명칭을 구현·검증하고 최신 APK/서버에 반영했다. 증거: `docs/evidence/c029-settings-redesign.md`.

## C030 실행 계획
설정 PNG 기반 rail을 모든 차량 페이지의 공통 템플릿으로 사용하고 themeShortcut에 차량용 순환 버튼을 연결한다. 설정의 테마 UI/이벤트 코드는 제거한다. 탭별 rail 위치/선택 상태, 세 모드 반복/저장/자동 시스템 변경, 모바일 수동 유지와 실제 WebView 설정·녹음 입력 회귀를 확인한 후 APK/서버에 반영한다.

C030 구현 및 합성 UI/실제 WebView 검증 완료. 단일 순환 버튼과 공통 탐색 자산을 APK·서버에 적용했다.

## C031 실행 계획
CloudSync의 현재 device label을 통합 차 별명으로 사용하고 로컬 pending name/이행 플래그를 보존한다. 이름 변경은 네트워크 호출을 UI 스레드에서 하지 않으며 기존 유한 업로드 작업에 재시도를 연결한다. 최초 설정 읽기에서 기존 차량 이름을 한 번 이행하고, 현재 프로필에는 통합 이름을 캐시한다. 모바일 device PATCH에 변경 알림을 추가해 서버 me.device_label을 차량에서 다시 받는다. 기존 snapshot은 변경하지 않는다. UI 중복 입력 제거, 실제 HTTPS 이름 양방향 변경/재시작·오프라인 복구·과거 snapshot 보존을 검증한다.

## C032 실행 계획
주행 중 WebView를 숨기고 예전 native drivingPanel을 표시하던 분기를 공통 디자인의 제한된 음성 화면으로 교체한다. 실제 bridge 권한으로 텍스트/미디어 조회를 차단한다. 디버그 에뮬레이터 시험 전환 노출을 현재 simulation 여부와 분리하고 최상위 배치를 보장한다. 새 녹음 검토 대기와 청취용 selected를 분리해 주차 복귀 목적지를 결정한다. 두 초기 진입 경로, 모드 왕복, 새 녹음/미녹음, 테마와 주행 제한을 실제 WebView 계측 및 독립 브라우저로 검증한다.

## C033/C034 실행 계획
먼저 고정 목업 생성기와 원본/구간 계약 검증을 바꾸고 독립 dev 커밋을 남긴다. 이어 Windows 팀용 Compose(포트18443/18080/18025/14319), named volume 목업 토큰, Node 내장 기능만 쓰는 팀 CLI와 격리 실행 검증을 추가한다. 공식 자료 조사/제출 체크리스트/Windows 설정 안내를 연결하고 별도 dev 커밋을 만든다. 공개 배포는 이번 범위에서 팀원 PC 로컬 실행으로 구체화한다.

## C035 실행 계획
contest flavor가 probe 구현/자산/SDK를 공유하되 디버그 여부와 에뮬레이터 시험 권한을 분리한다. 로컬 목업과 사용자 승인 설정 가져오기를 추가하고 전용 release 키를 로컬 비공개 경로에 생성한다. Gradle release/단위 검사, 서명 및 manifest 검사, 깨끗한 별도 앱 설치와 원본/목업/동기화 시험을 진행한다. 검증 후 dev에 커밋하고 제출 소스/해시를 고정해 바탕화면에 복사한다. 설정 UI는 기존 색상·48dp 이상 버튼을 재사용하고 가져오기 취소/형식/상태 오류를 명확히 표시한다.
