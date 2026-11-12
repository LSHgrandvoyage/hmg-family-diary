# C028 테마 피드백·차량 필터·음성 종료·모바일 패널

2026-11-12. 기존 사용자 데이터와 연결을 유지하는 수정이다.

## 구현

- 자동 테마 버튼은 선택됐을 때 `자동 / 라이트` 또는 `자동 / 다크`를 표시한다. 누르면 차량/휴대폰의 화면 설정을 따른다는 안내를 띄운다. 수동 선택에서는 자동 버튼의 활성 표시·현재 색상 부제를 해제한다. 현재 차량 자동 기준은 Android `Configuration.uiMode`다. 앱이 직접 조도·터널 진입을 측정한 것이 아니다.
- 검색에서 context/vehicle 없음과 빈 객체·공백 필드를 동일한 `unknown`으로 정규화한다. `type`만 있는 경우에는 그 차종을 표시해 이름 없는 서로 다른 선택지가 생기지 않도록 한다. 번호 등 실제 정보가 다른 snapshot은 구분하며 과거 저장 데이터를 변경하지 않는다.
- 모바일 검색·필터/가족 패널은 상단 오른쪽 SVG X로 닫는다. 48px 터치 영역, 접근성 이름, Escape와 원래 버튼으로의 포커스 복귀를 유지한다. 가족 패널의 화면 설정과 하단 닫기를 제거했다. 헤더의 직접 테마 전환은 유지한다.
- TTS 종료는 큐와 이전 콜백을 먼저 무효화한 뒤 SDK 종료 확인을 기다린다. 확인 전 엔진의 연결을 끊지 않으며 새로운 재생을 차단한다. 지연되면 종료 중임을 유지하고 stop을 재요청한다. 초기화만 진행됐고 speak를 제출하지 않은 엔진은 즉시 정리한다.

## TTS 원인

로컬 공식 TextToSpeech 3.3.1 AAR의 공개 stop/release 구현 경로를 javap으로 확인했다. `OnDeviceStreamTts.stop`은 코루틴을 예약하고 나중에 바인더의 stop을 부른다. release는 동기적으로 서비스 연결을 해제한다. 기존 `stop(); release()` 연속 호출은 예약된 stop이 서비스에 전달되기 전에 바인더가 없어지는 경합을 만들 수 있었다. 기존 검사는 앱의 busy/queue 상태만 확인해 실제 출력 지속을 놓쳤다. SDK 파일을 수정하거나 비공개 API를 제품에서 호출하지 않았다.

## 물리 입력과 앱의 연결

| 입력 | 적용할 경험 | 현재 범위 |
|---|---|---|
| 핸들 이전/다음 미디어 버튼 | 재생 중 이전/다음 일기 | 기존 MediaSession 콜백에 연결됨. 실제 SDK + MediaController의 MEDIA_PREVIOUS/NEXT 이벤트 검증 |
| 미디어 종료 버튼 | 읽기 종료 및 큐 폐기 | MEDIA_STOP 및 앱 stopPlayback bridge 검증 |
| 조그 회전/좌우 | 주차 중 일기 카드 포커스·목록 스크롤, 재생 제어 사이 이동 | 후속 구현. 회전 즉시 다음 일기를 재생하기보다 포커스 이동 후 누름으로 실행 |
| 조그 누름/뒤로 | 선택/열기, 팝업 닫기·이전 화면 | 후속 구현. 최상위 Back은 앱 숨김 정책도 검증 필요 |
| 터치패드 | 포커스 이동/선택 | 차종별 입력 전달 방식 확인 필요. 일괄 지원 주장하지 않음 |

Pleos 공식 CCP 지침은 사용자 설치 앱의 CCP 지원을 선택으로 두고, 미지원 선언 메타데이터와 최상위 CCP Back의 앱 숨김 정책을 설명한다. 현재 앱에 전체 CCP 지원을 선언하지 않는다. 현 WebView의 링크/버튼 포커스만으로 실차 로터리 지원이 입증되지는 않는다. 향후 FocusArea/FocusParkingView와 실제 Pleos 입력 전달을 확인하고, 미지원 선언·최상위 Back 처리도 배포 전 점검한다. 주행 중에는 기존 음성 최소 조작 정책을 그대로 유지한다.

근거: [Pleos CCP 개발 지침](https://document.pleos.ai/en/docs/pleos-only/vehicle-app-developer-guide/ccp-rotary-controller-development), [AAOS 로터리 앱 개발](https://source.android.com/docs/automotive/hmi/rotary_controller/app_developers), [Android MediaSession 제어](https://codelabs.developers.google.com/codelabs/supporting-mediasession), [Pleos TTS 시작/중단](https://document.pleos.ai/en/api-reference/connect-sdk-pleos/TextToSpeech/start-and-stop).

## 검증 (실행 기록)

- `scripts/test-c028-ui.ts`: 모바일375/390/가로812 및 차량1280. 자동 시스템 변경/수동 상태, unknown 3종 통합·차종 단독·서로 다른 번호 유지, 상단 X/가족 설정 제거, Escape·포커스 복귀, 두 테마·가로 넘침 검사 통과. 독립 임시 프로필의 합성 기록만 사용했다. `connected-ui/c028-*` 스크린샷에서 모바일 패널을 시각 확인했다.
- `PlaybackStopDeviceTest`: 실제 Pleos SDK로 합성 문장 반복 재생/중단 3회, 이전/다음/종료 미디어 키, 이동 중 종료, 초기화 취소. `AudioManager.isMusicActive`가 재생 중 true, 종료 확인 후 false이며 다시 켜지지 않는 것까지 검사했다. 1 test / 12.224초 통과. 실제 출력 상태 검사이며 녹음이나 마이크 캡처는 하지 않았다.
- 최종 전체 회귀·APK/서버 반영 결과는 아래에 덧붙인다.

### 최종 결과

- 최종 계측 `PlaylistDeviceTest`, `PlaybackStopDeviceTest`, `NavigationAppearanceDeviceTest` 3개 통과(26.812초). 앱의 `stopPlayback` bridge 이후 실제 오디오 비활성도 확인했다. 내비게이션 중 연속 읽기·주행 제한·포커스 상실·오래된 콜백·설정 이동·입력 파형 회귀 포함.
- 독립 UI C024/C027/C028 통과. C024의 옛 가족 설정 진입·하단 닫기 선택자를 현재 직접 테마/X 흐름으로 갱신하고 재실행했다. 동작 검증을 삭제하지 않았다.
- 실제 HTTPS `test-c023-mobile.ts`에서 로그인 후 X 패널/가족 설정 제거, 직접 테마·SSE 자동 수신·인증 원본 SHA 회귀 통과. 별도 합성 테스트 계정/레코드로 검사했다.
- Android 단위23개(실패0), TypeScript typecheck 통과. ProbeDebug/AndroidTest/PleosRelease 빌드 성공. APK 내 app.js/app.css/templates.js가 소스와 일치한다. APK SHA256: `5a428fa5db063dd7380c619362b61f247041071c9243dca99c5f2b48d4c47440`.
- 기존 emulator-5580에 설치하고 일반 앱 화면을 다시 열었다. 사용자 에뮬레이터는 종료하지 않았고 마이크 설정도 변경하지 않았다. 검사 후 녹음/재생 foreground 작업 없음. 최신 Docker 이미지/개발 서버 적용, DB/web/mailpit healthy. 기존 DB/사진/녹음 볼륨·연결 유지.
- 실차 핸들 배선/버튼 이벤트 전달·로터리·터치패드, iPhone Safari 실기기 검사는 이 증거에 포함하지 않는다. 실제 SDK 오디오 검사와 개인 목소리 녹음은 구분한다.
