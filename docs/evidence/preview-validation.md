# 합성 기반 구현 검증 (2026-11-08)

| 검사 | 실제 결과 | 한계 |
|---|---|---|
| pnpm test | 39/39 통과 | 계약25·AudioStore7·서버 설정7. DB/인증 검사 아님 |
| pnpm typecheck | 통과 | TypeScript7.0.2 |
| pnpm build | Next16.4.5 성공 | 합성 화면·health endpoint |
| Android | demo debug / pleos release 빌드, JVM4/4 통과 | 실제 마이크·차량 SDK 미연결 |
| Pleos 실행 | 공식 ARM64 이미지 부팅, APK 설치·Activity 실행·화면 확인 | 합성 시연·G0 부분 확인 |
| Playwright | Chrome 휴대폰375×812·태블릿1024×768 총4/4 통과 | 실제 iOS/Safari 검사 아님 |
| Docker | preview 이미지 빌드·healthy, uid1000, read-only root, host127.0.0.1:3018 | 인증 서비스 Compose 아님 |
| Docker 대상 Playwright | 같은4개 테스트 통과 | 합성 시험음 재생 |

검증한 웹 동작: 원문 펼치기, source 구간4초 탐색·8초 WAV 길이·실제 재생 시간 진행,
종료 시 플레이어 제거, fetch 실패 후 재시도, 가로 넘침 없음. light/dark·reduced-motion 화면을 캡처했다.
재생은 fetch→메모리 blob을 사용하고 종료·unmount 때 pause/src 제거·URL revoke를 수행한다.
실제 음성·인증된 Range API·기기 해제 검증은 아직 포함하지 않는다. 스크린샷은 합성 자료다.

- [휴대폰](preview-phone.png) · [휴대폰 dark](preview-phone-dark.png)
- [태블릿](preview-tablet.png) · [태블릿 dark](preview-tablet-dark.png)

수정한 실패: Mac `/var`의 상위 경로 alias 때문에 안전한 임시 루트를 거부했던 파일 경로 판정을 보정했다.
직접 루트/하위 심볼릭 링크 거부는 유지한다. Playwright의 원문 텍스트 선택자를 실제 paragraph 구조에 맞췄다.
pnpm11 전역 virtual store 차이는 저장소 설정으로 고정했다.
