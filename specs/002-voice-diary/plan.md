# 음성 기록·STT·일기 생성 — 구현 계획/현재 구조

2026-11-13 사후 정리. [명세](spec.md)와 [작업](tasks.md)을 함께 읽는다.

## 현재 구조

`apps/vehicle/.../platform/RecordingService.kt`, `SpeechProbe.kt`, `ReviewStore.kt`, `LocalDiaryMock.kt`와 `packages/generation/`을 사용한다. foreground service가 캡처를 소유하며 실제 AI 연결은 별도 기능 변경으로 계획한다.

공통 데이터·계약은 [001](../001-family-trip-memory/plan.md)에서 연결한다. 변경 시 사용자를 위한 수용 조건부터 명세에 반영한다.

## 의존성과 검증

헌장2.2.0의 원본 불변·가족 격리·주행 제한·검증 환경 구분을 유지한다.
연결/미디어/화면을 가로지르는 변경은 상대 기능 ID를 명시한다. 기존 증거와 이번 실행 결과를 구분한다.
신규 작업은 spec → plan/계약 → tasks → 정합성 검토 → 구현 → 검증/증거 → dev 커밋 순서다.

## 미해결 의존성

- 실제 AI 연결 시 자동차 화자·정정·감정·시점 분리의 의미 검증과 장문 회귀 검증.
- 화자 분리의 공식 SDK 지원·개인정보 동의·정확도 검토.
