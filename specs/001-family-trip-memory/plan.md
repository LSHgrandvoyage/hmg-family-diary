# Implementation Plan: 가족의 자유로운 이야기와 원본 목소리

**Branch**: `main` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: `specs/001-family-trip-memory/spec.md` · 헌장 1.1.0

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
| I 문제에서 시작 | 제품·15개 FR·7개 SC 기준 | [tasks.md](tasks.md)의 커버리지로 추적 |
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
