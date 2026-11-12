# C027 설정 복귀·테마 바로 전환·녹음 파형

2026-11-12. 사용자 보고 세 항목을 수정하고 차량 APK 및 개발 웹 서버에 반영했다.

## 원인과 변경

1. `MainActivity.navigate`는 설정에서 녹음으로 이동할 때 `nativeEditor`를 해제하지 않았고, 일기 탭 이동 시 faithful route도 명시적으로 바꾸지 않았다. 이제 설정에 들어갈 때만 네이티브 설정 화면을 사용하고, 녹음 탭은 carhome, 일기 탭은 carlist로 이동한다. 설정의 뒤로 가기는 보존된 기존 웹 화면으로 복귀한다. 진행 중인 녹음 등으로 설정 이동이 불가능할 때 표시 상태를 먼저 바꾸지 않는다.
2. 차량 왼쪽 메뉴와 모바일 헤더에 SVG 태양/달 바로 전환 버튼을 추가했다. 현재 밝은 화면에서는 달(다크로 전환), 어두운 화면에서는 태양(라이트로 전환)을 표시하고 접근성 이름도 전환 대상을 알린다. 차량과 모바일 홈에는 `자동` 복귀 버튼을 함께 제공한다. 모바일 상세·원문·차량 연결 화면에도 직접 전환 버튼이 있다. 기존 native preference/localStorage·자동 시스템 설정·주차 권한을 재사용하며 색상과 버튼 상태만 갱신한다. 네이티브 설정의 기존 선택기도 현재 모드에 맞춘다.
3. 녹음 파형 연결이 inline CSS 문자열 `align-items: center`에 의존했는데 디자인 template은 `align-items:center`여서 선택에 실패했다. 녹음 시간도 font-size 문자열에 의존했다. template에 `data-recording-wave`/`data-recording-timer`를 명시하고 이 속성으로 연결했다. 실제 PCM에서 계산한 native `level`의 표시 경로를 유지한다. 무음은 낮은 막대, 일시정지는 초기화, 재개는 다시 입력을 표시한다.

## 검증

- `NavigationAppearanceDeviceTest`: 실제 에뮬레이터 WebView에서 라이트/다크 각각 설정→녹음/일기 왕복 4회, 설정 뒤로 복귀 시 기존 DOM 유지, 직접 테마 전환 및 자동 저장, 녹음 중 설정 이동 거절 뒤 화면 유지 확인. 합성 PCM의 InputLevel→native state→WebView 파형, 무음/일시정지/재개, 시간 표시, 테마 변경 중 파형 DOM 유지 통과(최종 1 test, 2.573초).
- 이 계측 테스트는 별도 빈 보관함을 사용하고 마이크를 열지 않았다. 실제 가족 음성을 녹음하거나 시험 로그에 넣지 않았다. 사용자 에뮬레이터의 호스트 마이크 설정도 변경하지 않았다.
- `scripts/test-c027-ui.ts`: 모바일375×844/390×844/가로812×375 및 차량1280×720. 직접 light/dark/auto, 재로드/시스템 변경 시 수동 선택 우선, 모든 대상 화면의 버튼 크기/가로 넘침, 원본 재생 중 테마 전환, 녹음 원본 template의 입력 레벨/무음/일시정지/재개, reduced-motion 설정 통과. `connected-ui/c027-*` 스크린샷에서 모바일/차량 두 테마를 시각 확인했다.
- `scripts/test-c023-mobile.ts`: 실제 배포 HTTPS 로그인 후 테마 바로 전환, SSE로 열린 모바일 화면에 합성 일기/원본 준비 완료 자동 수신, 원본 SHA 일치, 동기화 이후 테마 유지 통과. 초기 SSE 수신은 별도로 화면을 갱신하므로 DOM 유지 검사는 독립 UI와 native 계측에서 확인했다.
- Android 단위23개 통과, TypeScript typecheck 통과. Probe debug/AndroidTest/Pleos release 빌드 성공. release 빌드는 실차 검증을 의미하지 않는다.
- 최종 APK의 app.js/app.css/templates.js와 현재 소스가 바이트 단위로 일치한다. APK SHA256: `31b86e88da20fa5845d76f6ce64b46a037bc95d144123cf2d7f22bcf46592d7c`.

## 적용·범위

최신 APK를 기존 emulator-5580에 설치하고 일반 앱을 다시 열었다. 사용자가 먼저 켠 에뮬레이터이므로 종료하지 않았다. Docker 이미지를 재빌드하고 dev Compose에 반영했으며 DB/web/mailpit/proxy health를 확인했다. DB·녹음·사진 볼륨과 사용자 차량 연결을 유지했다. 실행 중인 목업 생성 정책도 바꾸지 않았다.

이번 파형 검증은 실제 WebView에 합성 PCM 레벨을 전달한 검사다. 사용자의 맥북 마이크/아이폰 Safari 실기기 및 실차에서의 직접 확인을 대신하지 않는다. UI 스킬의 터치 영역/간격/접근성 지침을 적용했고, 태양/달은 검색 DB에 일치 항목이 없어 기존 SVG 선 스타일을 따랐다.
