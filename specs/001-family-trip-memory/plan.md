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
