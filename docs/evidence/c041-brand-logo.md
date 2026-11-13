# C041 차곡차곡 로고 적용

2026-11-13, 차곡차곡0.2.4(versionCode5). 요구사항: [006 UX-007](../../specs/006-vehicle-experience/spec.md), [계획](../../specs/006-vehicle-experience/plan.md), [작업](../../specs/006-vehicle-experience/tasks.md). 이번 변경은 명세·계획·작업·정합성 검토를 먼저 작성한 뒤 구현했다.

## 변경과 원본

- 사용자가 Downloads에 준비한 `차곡차곡_로고.svg`를 [웹 원본 자산](../../apps/web/public/faithful/brand/chagok-logo.svg)으로 그대로 복사했다. 바이트 SHA256: `8bcc85c00989dee04a764285fef101959eb579c2eea7ea714cb2b9ddf217d33f`.
- Android 내부 로고는 동일한 rect/circle/path를 VectorDrawable로 변환했다. 실행 아이콘은 어두운 배경과 전경을 분리하고 전경을0.78배로 안전 여백 안에 배치했다. 기존 서비스 알림 아이콘은 유지했다.
- 차량 녹음·일기·설정·주행 공통 왼쪽 바의 차곡 글자를56px 로고로 바꿨다. 초기 안내와 native fallback에도 같은 그림을 적용했다.
- 모바일 보관함 헤더에는32px 로고 + 차곡차곡을 표시한다. 좁은 폭은 연결 상태를 다음 줄로 보내며 테마 버튼과 겹치지 않는다. 모바일 인접 이름과 중복해서 읽히지 않도록 장식 로고의 alt는 비우고 차량 단독 로고의 alt는 앱 이름으로 제공한다. favicon과 웹 문서 제목도 일치시켰다.
- 실제 WebView의 로컬 파일 허용 목록에 SVG MIME을 추가했다. 기존 네트워크/호스트/경로 접근 제한, 동의·녹음·동기화 동작은 유지했다.

## 실행 검증

- `python3 scripts/check-specs.py`:8개 기능의 필수 파일·상대 링크·요구사항/작업 연결 통과. JavaScript 구문·TypeScript 타입·diff 공백 검사 통과.
- `scripts/test-c041-ui.ts`: 로고 로딩·가로세로 비율18개 검사 통과. 차량 녹음·일기·설정·주행과 모바일320/375/390px·가로812px, 라이트/다크를 확인했다. 모바일 헤더 요소 겹침/가로 넘침 없음, reduced motion 설정과32px로 키운 앱 이름도 확인했다. 전체 OS 최대 글자 크기 검증을 의미하지 않는다.
- 웹 검증은 독립 headless Chrome·임시 프로필·합성 기록/bridge로 실행했다. 주행 화면 검사에서 브랜드 로고는 허용하고 사진·인식문·검토 입력은 계속 금지하도록 기존 검증 조건을 보정했다. C032/C038 전체 시나리오를 이번에 다시 실행한 것은 아니다.
- `python3 scripts/build-contest-release.py --tests`: release·lintVital·Android 단위23개 통과. 기존 onBackPressed 사용 중단 경고는 남는다.
- 공식 Pleos 에뮬레이터의 실제0.2.4 APK에서 `WelcomeDeviceTest`1개 통과(3.556초). adaptive 실행 아이콘 타입, WebView SVG의 실제 로딩과 원본1024×1024 크기, 기존 안내 확인 전 차단·P/D 이동·UNKNOWN 차단·동의 철회·자동 녹음 없음 경계를 확인했다.
- 실제 앱 목록의 새 실행 아이콘, 초기 안내 라이트/다크, 확인 후 녹음 홈을 스크린샷으로 확인했다. 런처의 기존 최근 앱 칸에는 갱신 전 아이콘이 잠시 남았으나 앱 목록은 새 아이콘을 표시했다.
- 검증 설치 APK와 제출 대상 APK의 SHA256이 일치한다: `0eb1d4da350b48f9b73843a618d1834bcaf34319fac772d0095586635183fe07`.
- 검증용 에뮬레이터는CPU2·2GB·호스트 오디오 비활성으로 실행했고 종료했다. 테스트 전용 APK만 제거했으며 기존 앱 기록·DB는 삭제하지 않았다. Docker 서버를 새로 띄우지 않았다.

## 화면과 범위

[모바일 라이트](connected-ui/c041-phone-375-light.png) · [모바일 다크](connected-ui/c041-phone-375-dark.png) · [차량 홈](connected-ui/c041-carhome-light.png) · [차량 설정](connected-ui/c041-carsettings-dark.png)

[실제 실행 아이콘](connected-ui/c041-launcher.png) · [실제 시작 라이트](connected-ui/c041-native-welcome-light.png) · [실제 시작 다크](connected-ui/c041-native-welcome-dark.png) · [실제 WebView](connected-ui/c041-native-home.png)

웹 화면은 합성 기록이고 실제 에뮬레이터는 가족 미연결·기록 없는 검증 환경이다. iPhone Safari 실기기·Windows 신규 APK·실차·서버 왕복·플랫폼 원본 보관 정책을 이번 검사로 입증하지 않는다. 모바일 서버는 새 source로 재빌드해야 로고가 반영된다. 정확한 제출 커밋·버전·해시는 최종 ZIP의 manifest.json과 SHA256SUMS.txt를 따른다.
