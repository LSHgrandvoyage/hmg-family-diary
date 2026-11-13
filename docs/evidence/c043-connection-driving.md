# C043 모바일 연결과 주행 화면 개편

2026-11-13. 기능 정본: [003 SYNC-009](../../specs/003-device-sync/spec.md), [004 PLAY-008/009](../../specs/004-memory-playback/spec.md), [006 UX-008](../../specs/006-vehicle-experience/spec.md). spec → plan → tasks → 정합성 확인 후 구현했다. C032/C038의 이전 주행 디자인을 사용자가 제공한4개 PNG로 대체한다.

## 변경

- 모바일 헤더는 기록 유무와 무관하게 실제 활성 차량이 있으면 `연결됨`을 표시한다. 연결/해제 변경 알림·복귀/online 변경분 수신 때 상태를 갱신한다.
- 코드 만들기 → 차량에 입력 → 연결 완료 확인의3단계. 발급 후2단계 강조, 선행0을 포함한6칸, 만료 시 코드 제거와 재발급 안내. 연결된 상태에서는 코드 칸/단계/`보관함으로` 제거, 뒤로가기와 차량 관리 유지.
- 테마 아이콘의 원형 배경/테두리 제거.44px 터치 영역·접근성 이름·키보드 포커스 유지.
- 주행 중에는 왼쪽 메뉴 없이 대기/녹음/일시정지/듣기 화면을 제공한다. 녹음 버튼은 멈춤 또는 재개, 녹음 마치기2개다. 입력 파형은 실제 native level로 갱신하고 일시정지 때 회색 직선이 된다.
- 듣기 화면은 현재 날짜·제목·순서, 다음2개 제목/날짜, 이전/재생/다음과 같은 일기의 TTS/원본 전환이다. native bridge는 제한된 메타데이터만 내보내며 주행 중 본문·인식문·사진 접근은 계속 차단한다. 제목은 최대80자, UI는2줄이다.
- TTS3.3.1 로컬 AAR의 공개 메서드/이벤트를 `javap`으로 확인했다. pause/resume/seek/총길이가 없으므로 원본 길이를 TTS 길이로 대체하지 않는다. TTS `onStart`부터 monotonic clock으로 경과시간을 표시한다. 원본은 실제 position/duration 진행률이다. TTS 멈춤은 기존 엔진 정지이며 재생 시 현재 일기 처음부터 읽는다.
- `녹음하러 가기`의 native `listenExit`는 재생만 종료하고 대기로 이동한다. 자동 마이크 시작은 없다. 녹음하지 않은 D→P 복귀는 기존 녹음 홈이다.

## 실행 검증

- `python3 scripts/check-specs.py`:8개 기능 디렉터리·계약 참조 통과.
- `pnpm typecheck`, JS syntax, `git diff --check`: 통과.
- `python3 scripts/build-contest-release.py --tests`: release/Android test APK 빌드·lint·Android 단위23개, 실패0. 계측 APK를 빌드한 사실은 계측 테스트 실행을 뜻하지 않는다.
- `scripts/test-c043-ui.ts`: 두 테마의 실제 DOM 검증. 기록이 없어도 연결 표시/기록이 있어도 미연결 표시, online 재조정, 연결 후 코드 숨김, 단계 진행, 선행0, 만료,320px 화면, 테마 터치 영역, 대기/녹음/멈춤/듣기, 입력 파형, 원본 진행률, TTS 가상 진행률 없음, 같은 기록 전환, 듣기 종료 후 마이크 미시작, 주행 본문 차단, D→P 홈 복귀. 독립 headless Chrome, 합성 API/bridge만 사용했다.
- 동일 C043 검사를 실제 기본 Compose HTTPS의 정적 자산으로 통과했다. 사용자 가족 API는 요청을 가로채 합성 응답으로 대체했다. 서버 web/worker 이미지를 재빌드하고 기존 DB·비공개 미디어 볼륨을 유지해 반영했으며 health 대기가 통과했다.
- C041 로고 회귀는 새 주행 헤더 selector로 조정해18개 로고 로드/비율 검사를 통과했다. C032/C038의 스크립트 진입점은 새 디자인의 C043 검사를 실행한다. 과거 증거 이미지는 과거 결과로 보존한다.
-1280×720 주행4화면과 모바일 라이트/다크 스크린샷을 직접 확인했다. 시각 검토에서 재생 버튼에 남은 이전 flex 스타일을 발견해 제거하고160×160 원형을 자동 검사했다.
- 기존 Pleos 에뮬레이터 `emulator-5580`, 사용자10에 동일 서명 APK를 `install -r`로 설치해 성공했다. 재실행 후 초기 안내 화면의 차곡차곡/공동 녹음 안내/시작 버튼 로드를 UI 계층으로 확인했다. 실제 가족 일기/녹음은 생성·수정·재생하지 않았다.
- APK 내 app.html/app.js/app.css/driving.js/driving.css5개가 현재 소스와 byte 단위로 일치한다.

## 빌드와 범위

앱 `io.hmg.familydiary.contest`, contestRelease, **0.2.5 (versionCode6)**. APK SHA256: `8966dd37b51dfa95ed4cc31b4edfdfb1c9d8cea88e74458e2dec1dfee70ceb57`. 정확한 소스 커밋/ZIP 해시는 제출 manifest와 SHA256SUMS가 정본이다.

현재 테스트는 macOS·공식 Pleos 에뮬레이터 설치와 합성 브라우저 동작이다. 이번에는 기존에 연결된 앱에 계측 fixture를 주입하지 않았으며 실제 Pleos TTS 발화·마이크·오디오 포커스 전환을 다시 실행한 것은 아니다. 사용자 iPhone Safari/Windows/실차 결과도 대신하지 않는다. 자동차 화자 생성은 고정 목업이며 플랫폼의 원본 음성 보관·전송 허용 확인은 기존 미해결 사항이다. 사용자 실행 중인 Docker/에뮬레이터는 유지했고 caffeinate를 실행하지 않았다.

## 참조 파일 식별

사용자가 제공한 Downloads 원본 SHA256:

- `주행 중 · 대기 (녹음 시작)@1x.png`: `89dfad5e0c083b6fdbfc1d3e98de6842626a151d1451a95b7f73406c2e0f0f74`
- `주행 중 · 녹음 중@1x.png`: `94abf08477808723a123946e36904735c3ccc0df099719eadcf3bff30ab07ef5`
- `주행 중 · 녹음 멈춤@1x.png`: `5211354f2e9cd6525933b0f2fbb42926a0d506803dadeb437318206846773060`
- `주행 중 · 일기 듣기@1x.png`: `e1738192d4d0cd3081180fed9994036231a9f9ba54487b83a9ae1f2fae35ff78`

## 합성 화면

[모바일 연결 완료](connected-ui/c043-mobile-connected-dark.png) · [모바일 연결 순서](connected-ui/c043-mobile-steps-light.png) · [모바일 헤더](connected-ui/c043-mobile-home-light.png)

[주행 대기](connected-ui/c043-driving-idle-dark.png) · [녹음 중](connected-ui/c043-driving-recording-dark.png) · [녹음 멈춤](connected-ui/c043-driving-paused-dark.png) · [일기 낭독](connected-ui/c043-driving-listening-dark.png) · [원본 듣기](connected-ui/c043-driving-original-dark.png) · [라이트](connected-ui/c043-driving-listening-light.png)
