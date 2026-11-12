# 차곡차곡 명세 색인

2026-11-13 사용자 승인으로 기존 단일 명세를 분리했다(C040). 이 정리는 사후 문서화 예외이며 기존 개발이 모두 기능별 spec-first였다고 주장하지 않는다.
제품 정의는 `docs/product-brief.md`, 공통 원칙은 헌장과001, 기능 요구사항은 아래 소유 디렉터리가 정본이다. 이전 기록보다 현재 명세의 명시적 상태/범위가 우선한다.

| 기능 | 정본 | 현재 상태 |
|---|---|---|
| 001 제품 공통·계약 | [spec](001-family-trip-memory/spec.md) · [plan](001-family-trip-memory/plan.md) · [tasks](001-family-trip-memory/tasks.md) | 공통 원칙 |
| 002 음성 기록·STT·일기 생성 | [spec](002-voice-diary/spec.md) · [plan](002-voice-diary/plan.md) · [tasks](002-voice-diary/tasks.md) | 에뮬레이터 구현 / 생성은 고정 목업 |
| 003 가족 연결·자동 동기화·삭제 | [spec](003-device-sync/spec.md) · [plan](003-device-sync/plan.md) · [tasks](003-device-sync/tasks.md) | 로컬 HTTPS 구현 / 사용자 실제 실패 파일 복구 확인 잔여 |
| 004 원본 타임라인·TTS·주행 음성 | [spec](004-memory-playback/spec.md) · [plan](004-memory-playback/plan.md) · [tasks](004-memory-playback/tasks.md) | 에뮬레이터 구현 / 실차 정책 검증 잔여 |
| 005 사진·일기 목록·검색 | [spec](005-photos-library/spec.md) · [plan](005-photos-library/plan.md) · [tasks](005-photos-library/tasks.md) | 웹/에뮬레이터 구현 / 실기기 경계 검증 잔여 |
| 006 차량 맥락·테마·설정·화면 | [spec](006-vehicle-experience/spec.md) · [plan](006-vehicle-experience/plan.md) · [tasks](006-vehicle-experience/tasks.md) | 웹/에뮬레이터 구현 / 실차 신호 검증 잔여 |
| 007 로컬 실행·제출 패키지·클라우드 전환 | [spec](007-release-deployment/spec.md) · [plan](007-release-deployment/plan.md) · [tasks](007-release-deployment/tasks.md) | 로컬/제출 구현 / 클라우드는 계획 |
| 008 첫 사용 안내 | [spec](008-first-run/spec.md) · [plan](008-first-run/plan.md) · [tasks](008-first-run/tasks.md) | C039 에뮬레이터 구현·검증 |

## 앞으로의 작업 순서

1. 변경할 기능을 고르고 spec에 사용자 가치·수용 시나리오·오류/비범위를 먼저 적는다.
2. plan·공통 계약/데이터 영향을 정리한 뒤 tasks를 요구사항 ID에 연결한다.
3. spec/plan/tasks/헌장 정합성을 검토하고 모순을 해결한 후 구현한다.
4. 변경에 맞는 검사·실행 근거를 남긴 뒤 구현/검증/미검증을 나눠 상태를 갱신하고 dev에 커밋한다.

작은 수정은 기존 기능 명세에서 처리하고, 독립적인 기능은 다음 번호로 분리한다. 매번001 뒤에 C번호만 추가하지 않는다.
사용자의 dev 작업 결정에 따라 기능 디렉터리와 Git 브랜치를 분리한다. 현재 기능은 기기별 자동 포인터를 가정하지 않고 명령에 명시한다.

```sh
SPECIFY_FEATURE_DIRECTORY=specs/008-first-run .specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
```

`$speckit-specify` → 필요시 `$speckit-clarify` → `$speckit-plan` → `$speckit-tasks` → `$speckit-analyze` → `$speckit-implement`를 사용한다. 사후 정리 자료를 새 기능의 선행 명세로 오인하지 않는다.
미완료 플랫폼/사용자/운영 검증은 문서 정리로 완료 처리하지 않는다. 공유 계약은 기존 링크 호환을 위해001/contracts에 유지한다.

정리 후 `python3 scripts/check-specs.py`로 문서 링크·요구사항/작업 매핑을 검사한다. 이는 의미 정합성 검토나 앱 테스트를 대체하지 않는다.

## 이력과 추적

- [분리 전 원문](archive/2026-11-13-before-split/README.md): spec/plan/tasks·초기 조사·모델·계약을 보존했다.
- [이전 요구사항/변경 매핑](traceability.md): 기존 FR/T/C 식별자를 현재 소유 기능으로 연결한다.
- 새 요구사항 ID는 BASE/REC/SYNC/PLAY/LIB/UX/DEP/ENTRY 접두어로 구분한다.
