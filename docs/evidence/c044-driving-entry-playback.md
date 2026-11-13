# C044 실제 인식 문장·시작 안내·주차 공통 플레이어

2026-11-13. 소유 명세: [002 REC-007](../../specs/002-voice-diary/spec.md), [004 PLAY-010](../../specs/004-memory-playback/spec.md), [006 UX-009](../../specs/006-vehicle-experience/spec.md), [008 ENTRY-007](../../specs/008-first-run/spec.md).

사용자의 “실제 인식된 문장을 보고 싶은거야” 결정에 따라 헌장2.3.0·각 spec의 수용 조건·plan·tasks를 먼저 갱신하고 구현했다. C032/C043의 주행 중 인식문 전체 숨김에서 현재 녹음의 최근2줄 표시만 예외로 변경한다. 전체 전사·편집·사진·일기 본문은 계속 주차 후 제공한다.

## 변경 동작

- **주행 녹음 인식문**: RecordingService의 SDK `onUpdate` → `text` → MainActivity `liveText` → 제한된 `driving_transcript` 필드로 연결한다. 현재 주행/동의/녹음 조건에서만 최근180자를 전달한다. UI는 마지막2줄을 보여 주며 읽기 전용이고 탐색·편집 조작을 제공하지 않는다. 임시 문장을 인식 결과처럼 만들지 않는다. 기다리는 중·일시정지·인식 오류를 별도로 표시한다.
- **시작 안내**: 제공 PNG의 로고·왼쪽 설명·오른쪽 동의 카드·모두 동의·3개 필수 항목·시작 버튼 구조를 적용했다. 초기 체크는 모두 해제되어 있다. native가 체크 상태를 보유하며3개 모두 확인해야 시작한다. 동의만으로 마이크가 시작되지 않는다. `보기`는 현재 프로토타입의 저장·자동 동기화·삭제·고정 생성 결과 안내다. 제공 시안의 미확정 보관 기간이나 정식 법률 문구를 사실로 만들지 않았다. 정식 이용약관·개인정보 처리방침은 별도 확정 대상이다.
- **창 크기 대응**: 물리 화면2560×1440 중 OS가 할당한 앱 창은1682×1210이었다. 기존1280×720 고정 콘텐츠를 가운데 정렬해 위아래 여백이 생겼다. 실제 WebView 크기로 디자인 영역을 확장하고 비율을 유지해 채운다. 시험용 상태 전환 버튼은56dp 별도 상단 영역을 사용하며 콘텐츠와 겹치지 않는다. OS 시스템 영역 자체는 앱이 덮지 않는다.
- **주차 공통 플레이어**: D→P에서 원본/TTS를 이어 재생한다. 녹음 홈·일기 목록/상세·설정에 같은 하단 플레이어가 현재 제목·원본/일기 구분·실제 경과시간·종료를 표시한다. 원본은 일시정지/재개, TTS는 이전/다음 일기다. 현재 SDK의 TTS에는 일시정지 API가 없어 해당 조작은 표시하지 않는다. 원본의 실제 길이를 TTS 총길이로 쓰지 않는다.
- 화면 이동만으로 미디어를 멈추지 않는다. 다른 일기를 열어도 재생 중인 원본을 갈아 끼우거나 다른 기록의 파형 진행률을 표시하지 않는다. 명시적 원본 구간 이동은 대상 기록 ID를 함께 전달한다. 재생 중에는 녹음 시작을 비활성화하고, UNKNOWN/동의 상실의 중단 경계는 유지한다.
- **모바일 가족 패널**: 중복 `연결 차량 관리` 버튼을 제거했다. 기존 차량 연결 화면·로그아웃·X 닫기를 유지한다.

## 검증

- `python3 scripts/check-specs.py`:8개 기능 디렉터리, 참조·요구사항/작업 매핑 통과. TypeScript·변경 JS syntax·`git diff --check` 통과.
- `python3 scripts/build-contest-release.py --tests`: release APK·계측 APK·lint 빌드 성공. Android 단위 검사23개, 실패0·건너뜀0.
- `scripts/test-c044-ui.ts`: 독립 headless Chrome, 양쪽 테마, 동의 미선택/부분/전체/해제/UNKNOWN, 안내 내용, 현재 인식문 필드·최신2줄 제한·일시정지,1280×720 및1682×1154 영역 채우기, D→P 원본/TTS 공통 플레이어, 제목·시간·원본 일시정지/재개·종료·TTS 다음/종료, 녹음 비활성, 화면 이동 중 재생 유지, 가족 중복 버튼 제거를 통과했다.
- 시각 검토에서 변환된 콘텐츠보다 body의 실제 높이가 작아 하단 조작이 잘리고 포커스 시 페이지가 밀리는 문제를 발견했다. body를 실제 viewport 높이로 고정하고, 헤더/플레이어/녹음 버튼의 화면 내 경계와 body 스크롤0 검사를 추가해 수정 후 통과했다. 최신 라이트/다크 화면을 직접 확인했다.
- C025 회귀: 필터로 구성한 저장 일기 TTS 순서·이전/다음 경계·종료, 다른 기록을 열었을 때 원본 파형 진행률 분리·seek 기록 ID, 각 차량 화면 라이트/다크 대비 통과. C041 로고18개 로드/비율·모바일320/375/390/812 검사를 통과했다. C043 연결·주행4화면 회귀도 통과했다. 이전 증거 이미지를 새 결과로 덮어쓰지 않았다.
- 기존 Pleos 에뮬레이터 `emulator-5580`, 사용자10에 동일 서명 APK를 `install -r`로 갱신했다. `WelcomeDeviceTest.entryAndParkedPlayerPreserveBoundaries`를 실제 실행해 **1개 통과, 건너뜀 없음**. 실제 WebView 체크 → native 동의 경계, 양쪽 테마, 명시적 진입 후 P/마이크 미시작, 실제 창 크기 대응, UNKNOWN 차단을 확인했다.
- 같은 계측 검사에서 cache 전용 UUID 무음 WAV를 사용해 실제 MediaPlayer의 D→P 유지·일시정지·동일 파일 재개·화면 이동 유지·종료를 확인했다. 합성 문장으로 실제 Pleos TTS의 speaking 이벤트·D/P 재생 유지·종료 확인 응답과 플레이어 제거를 확인했다. 사용자 가족 음성이나 일기는 생성·수정·재생하지 않았다. fixture는 자동 동기화 대상 디렉터리에 두지 않았고 종료 시 삭제했다.
- APK의 app/driving/parked-player/welcome HTML·JS·CSS10개가 최종 소스와 byte 단위로 일치한다. Docker 기본 Compose 이미지를 재빌드하고 기존 DB/미디어 볼륨을 보존해 반영했다. web/worker/db/proxy/mailpit health 통과. 실제 HTTPS 서버 정적 자산으로 C044 검사를 다시 통과했으며, 가족 API 요청은 합성 응답으로 대체했다.

## 버전과 미검증 범위

앱 `io.hmg.familydiary.contest`, contestRelease **0.2.6 (versionCode7)**. APK SHA256: `ba86e00d64149057c4fc706c813e4b5463eea1e5e1bfe002c2af7d866253c689`.

정확한 소스 커밋·ZIP 해시는 제출 묶음의 manifest.json/SHA256SUMS가 정본이다. 테스트 자료와 스크린샷은 모두 합성이다. 이번 작업은 실제 마이크 STT 인식 정확도, Windows/iPhone 사용자 단말, 실차/마켓 허용, 원본 음성 외부 보관·전송 정책을 새로 검증한 것이 아니다. 주행 중 인식 문장 표시는 사용자 요청에 따른 에뮬레이터 기능이며 실차 허용 근거로 쓰지 않는다. 자동차 화자 생성은 계속 `AI 생성 일기 목업 입니다.` 고정 결과다. 사용자가 실행한 Docker/에뮬레이터는 유지했고 caffeinate를 시작하지 않았다.

## 참조와 합성 화면

제공 원본: `Downloads/차량 · 시작 전 동의@1x.png`, SHA256 `f4ac6e3948447a61ba24d4034a79aa6b36784f44b2528657967fbbbe50f6b750`.

[첫 안내](connected-ui/c044-welcome-initial-dark.png) · [동의 완료 라이트](connected-ui/c044-welcome-all-light.png) · [인식 문장](connected-ui/c044-driving-caption-dark.png) · [실제 창 비율 대응](connected-ui/c044-driving-adaptive-light.png) · [주차 원본 플레이어](connected-ui/c044-parked-original-dark.png) · [주차 TTS 플레이어](connected-ui/c044-parked-tts-light.png) · [모바일 가족 패널](connected-ui/c044-mobile-family-light.png)
