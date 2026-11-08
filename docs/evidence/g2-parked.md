# G2 주차 — 미검증

2026-11-08: CaptureCoordinator의 UNKNOWN·NOT_PARKED·focus/UX 상실 중단, 자동 재개 금지와 화자 generation 고정을 JVM 테스트로 확인했다.
이는 모의 입력에 대한 정책 검사다. 실제 P/D·D에서 속도0·서비스 단절 이벤트는 연결하지 않았다.
Pleos flavor에는 모의 상태 전환 UI가 포함되지 않으며 주차 불명 잠금 상태다.
다음 의존성: 허용된 Vehicle SDK 주차 신호·권한 초기화, ParkedProbe와 실제 이벤트 중단 검증.
