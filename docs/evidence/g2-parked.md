# G2 주차 — 미검증

후속 probeDebug 기기 테스트에서 모의 P 해제 시 녹음·재생 중단과 자동 재개 금지,
이전 파일 checksum 불변을 확인했다. 실제 Activity/AudioRecord를 사용했지만 입력은 모의 P이므로
실제 Vehicle SDK 주차 판정 또는 G2 통과로 취급하지 않는다. [G1 실험](g1-capture.md) 참고.

2026-11-08: CaptureCoordinator의 UNKNOWN·NOT_PARKED·focus/UX 상실 중단, 자동 재개 금지와 화자 generation 고정을 JVM 테스트로 확인했다.
이는 모의 입력에 대한 정책 검사다. 실제 P/D·D에서 속도0·서비스 단절 이벤트는 연결하지 않았다.
Pleos flavor에는 모의 상태 전환 UI가 포함되지 않으며 주차 불명 잠금 상태다.
다음 의존성: 허용된 Vehicle SDK 주차 신호·권한 초기화, ParkedProbe와 실제 이벤트 중단 검증.
