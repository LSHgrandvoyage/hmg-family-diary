# 공통 구조와 개발 계획

상태: 2026-11-13 현재 구현과 후속 범위를 구분한 기준선. 헌장2.2.0.

## 현재 구조

- 차량: Kotlin Android contestRelease, 공식 Pleos STT/TTS·위치 adapter, 원본 캡처/foreground services, 로컬 원본·outbox, faithful WebView UI.
- 휴대폰: Next.js 모바일 웹. 사진 첨부·일기/원본 열람·연결 관리. 설치형 앱 전환은 후속.
- 서버: Docker Compose의 Next.js/API·PostgreSQL18·Better Auth·Caddy·worker·개발 Mailpit, 비공개 원본/사진 볼륨.
- 생성: 제출 앱의 `LocalDiaryMock`; 실제 OpenAI 연동은 현재 활성화하지 않는다.

## 공통 계약

- [데이터 모델](data-model.md)
- [현재 HTTP 계약과 이전 계획의 구분](contracts/http-api.md)
- [캡처·생성 계약](contracts/capture-and-generation.md)
- [실행·저장·이전 계약](contracts/runtime-and-storage.md)

## 기능별 순서

[색인](../README.md)에서 변경할 기능을 선택하고 해당 spec/plan/tasks 및 영향 계약을 읽는다.
새 기능은 독립 번호를 만들고 작은 변경은 소유 기능 명세를 갱신한다. 기능마다 Git 브랜치를 강제로 만들지 않고 사용자 결정인 dev 커밋 방식을 유지한다.
구현 전 명세/계약 정합성을 확인하고 완료 후 적절한 단위·통합·기기 검증을 실행한다. 실행하지 않은 환경은 미검증으로 남긴다.

## 검증 의존성

에뮬레이터 캡처/주행 입력이 실차 SDK 승인이나 정책 통과를 의미하지 않는다.
원본 취득/보관/전송 정책, 실차 신호·오디오·물리 입력, 운영 백업 복원, AI 의미 품질은 별도 후속이다.
