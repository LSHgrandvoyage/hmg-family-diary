# C039 첫 사용 안내

2026-11-13, 차곡차곡0.2.3(versionCode4). 기능 정본: [008](../../specs/008-first-run/spec.md). SDD 사후 분리는 [C040](c040-spec-reorganization.md)이며 첫 화면은008 spec/plan/tasks를 작성한 뒤 구현했다.

## 변경

- 초기 화면의 모의 P/주행/차량 신호 선택 UI를 제거하고 VehicleTheme 색상·카드·큰 글자·명시적 안내 확인으로 교체했다.
- 참여자의 녹음/보관 안내, 원본·인식문·일기 보관, 연결 시 가족 공유 범위를 표시한다. 확인은 미선택으로 시작하며 시작하기·나중에와 라이트/다크/자동 화면 선택을 제공한다.
- 시작하기는 녹음 홈으로 이동한다. 자동 녹음하지 않는다. 위치·서버 설정은 기존 설정 화면에 있다.
- 에뮬레이터 한정·명시적 최초 확인·상태 UNKNOWN·기존 simulation 없음 조건일 때만 초기 시험 P를 부여한다. 알려진 상태를 덮어쓰지 않고 이후 UNKNOWN은 차단한다. 기존 시험 전환 버튼은 유지하며 서비스 단절 때 비활성화한다.
- 기존 probe 계측의 낮은 수준 상태 주입은 화면 체크박스 순서 대신 명시적 시험 helper로 옮겼다. 기존 probe 전체 실기기 재실행을 의미하지 않는다.

## 검증

- contestRelease 빌드·lintVital·Android 단위23개 통과.
- 실제 공식 Pleos 에뮬레이터에서 최종 APK 계측3개 통과(8.557초): WelcomeDeviceTest, DrivingListenDeviceTest, SyncRecoveryDeviceTest.
- ENTRY-001~006: 안내 확인 전 시작/기록 bridge 차단, 초기 시험 P→실제 WebView 녹음 홈 렌더링, 녹음 자동 시작 없음, P/D 화면 왕복, 미녹음 주차 홈 복귀, UNKNOWN 재차단/자동 P 금지, 알려진 D 보존, 동의 철회/나중에 종료,48dp 버튼 높이를 확인했다.
- 단일 TTS/원본 전환과 기존 원본 차단 재시도/사진 수신 회귀 통과. 합성 녹음·로컬 사진 응답을 사용했고 이번에는 HTTPS 서버 왕복/사용자 Windows 파일 복구를 실행하지 않았다.
- 라이트/다크/홈/UNKNOWN 스크린샷 시각 확인. 첫 검사에서 홈은 로딩 전 화면을 찍었으므로 최종 검사는 실제 DOM 렌더링과 D/P 복귀까지 기다리도록 보완했다. 버튼 대비와 UNKNOWN 화면의 시험 버튼 겹침도 보정했다.
- probe 계측 Kotlin 컴파일 통과. 기존 테스트의 사용 중단 API 경고는 남아 있으며 실패는 아니다.
- 에뮬레이터는 CPU2·메모리2GB·호스트 마이크 비활성으로 실행했고 검증 후 종료했다. 테스트 전용 APK도 제거했다. 기존 앱/원본/DB 데이터는 삭제하지 않았다.

검증한 설치 APK와 제출 대상 빌드의 SHA256이 일치한다: `c1db61b94feca17a249bcbe69d4a9f59a136be6f002289b4c39031dd25129652`.
정확한 제출 소스 커밋·버전은 묶음의 manifest.json, 파일 해시는 SHA256SUMS.txt를 따른다. Windows 신규 UI/실차/플랫폼 원본 보관 정책은 별도 확인 범위다.

## 화면

[라이트](connected-ui/c039-welcome-light.png) · [다크](connected-ui/c039-welcome-dark.png) · [확인 후 녹음 홈](connected-ui/c039-entered-home.png)
화면은 계정이 연결되지 않은 공식 에뮬레이터이며 실제 가족 기록을 포함하지 않는다.
