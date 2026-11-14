# C051 낭독 시간·문장 진행·화면 전환

2026-11-14. [004 PLAY-009/017](../../specs/004-memory-playback/spec.md)과 [006 UX-012/013](../../specs/006-vehicle-experience/spec.md)의 수용 조건 → 계획·정합성 검토 → 작업 정의 후 구현했다.

## 원인과 변경

- MainActivity의 250ms 화면 상태 전송이 `MediaPlayer.prepared` 조건 안에 있어 원본만 갱신되고 Pleos TTS의 실제 경과시간은 지속적으로 전송되지 않았다. foreground 재생 ticker에서 원본 여부와 무관하게 상태를 전송한다. 주차 공통 플레이어와 주행 화면이 같은 실제 시간을 받고 일시정지 동안 멈춘다.
- 자연 완료 시 서비스가 경과시간을 초기화해 마지막 시간이0으로 돌아갔다. 이제 해당 일기의 자연 완료 결과를 메모리에 보존해 마지막 경과시간과 완료 진행바를 표시한다. 새 재생/선택·명시적 종료·오류는 폐기하며 반복은 새 회차에서 시작한다. 이 시간은 실제 낭독 경과시간이고, 현재 문장부터 다시 읽는 재개 시간도 포함한다.
- 주행 TTS는 현재 문장/전체 문장과 완료 문장 기준 진행바를 제공한다. 완료 부분은 진한 주황색, 현재 문장은 옅은 주황색이다. 시간 기준 비율이나 추정 총길이로 위장하지 않는다. 원본은 기존 실제 재생 위치·전체 길이를 유지한다.
- 차량 녹음·일기·설정 탭, 상세/검토 진입·복귀, 모바일 화면 탐색에220ms 슬라이드·페이드를 적용했다. 화면/기록 ID가 실제로 바뀔 때만 적용하며 처음 열기·같은 화면의 재생/데이터 갱신에는 반복하지 않는다. 이전 애니메이션 취소, 오래된 비동기 응답 제외, 모션 줄이기, 주행 진입 시 제한된 콘텐츠 즉시 제거를 유지한다. 전환 자체가 네이티브 재생을 중단하지 않는다.

## SDK 근거

[공식 이벤트 문서](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/TextToSpeech/event-listeners)와 [시작·종료 문서](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/TextToSpeech/start-and-stop)를 확인했다. 사용 중인 TextToSpeech3.3.1 AAR의 `TextToSpeech`/`EventListener` 공개 메서드도 `javap`으로 확인했다. 시작·완료·정지·RMS 이벤트는 있으나 전체 길이·재생 위치·파일 합성 API는 이 표면에 없다. 원본 녹음 길이를 TTS 전체 길이로 대신하지 않는다. 플랫폼 교체나 외부 음성 API는 추가하지 않았다.

## 검증

- `scripts/test-c051-ui.ts`: 독립 headless Chrome, 합성 자료, 차량1280×720·모바일390×844 라이트/다크. 화면/동일 경로의 다른 일기 전환, 늦은 상세 응답과 빠른 복귀, 같은 화면 갱신, 모션 줄이기, 문장 진행/완료, 원본의 실제 길이 유지 통과. 양쪽 테마 합성 캡처를 확인했다.
- `scripts/test-c050-ui.ts`: 기존 연결 배지·터치 포커스·P/D 전환·STT 종료 로딩·중복 입력 차단 회귀 통과.
- Pleos 에뮬레이터 사용자10의 `NarrationProgressDeviceTest` 최종 실행1개 통과(15.529초). cache-only 합성 WAV/일기로 실제 TTS와 실제 WebView의 주차/주행 경과시간,3문장 진행, 일시정지 중 시간 고정, 같은 문장 재개, 자연 완료 시 마지막 시간·완료 진행바 보존, 탭 이동 후 유지, 명시적 종료 시 폐기, 한 문장 완료를 검증했다. 첫 시도는 주행 전환에서 시험용 목록 캐시가 초기화되어 실패했고, 개인 자료를 쓰지 않도록 합성 목록을 전환 뒤 다시 주입해 보정했다.
- 기존 `DrivingListenDeviceTest` 통과. 원본/TTS 전환·단일 재생·선택적 전체 반복과 종료 경계를 확인했다.
- 서명 release 빌드·lint·단위 검사26개 통과(실패/오류/건너뜀0). 타입 검사·명세 매핑·diff 검사 통과. APK에 포함된 변경 UI3파일과 소스의 byte 일치를 확인했다.
- Compose 재빌드 후 web healthy, 실제 HTTPS의 변경 UI 일치를 확인했다. 기존 서버 주소·CA·앱 데이터·DB/미디어 볼륨을 유지했다. 새 에뮬레이터나 caffeinate를 실행하지 않았다.

## 전달과 범위

contestRelease **0.2.12 / versionCode13**, 패키지 `io.hmg.familydiary.contest`. APK SHA256: `33c1f76855213675a95e9ea3472bf68b45afcb53e5f72fdeac8ecd4c04e524eb`. 기존 앱에 덮어 설치했다. dev 커밋이며 원격 푸시는 하지 않는다. 제출 manifest/SHA256SUMS가 최종 커밋·파일 해시의 정본이다.

합성 화면: [라이트](connected-ui/c051-tts-light.png) · [다크](connected-ui/c051-tts-dark.png).

실차/마켓 허용, 실제 Windows·iPhone 재확인, 정확한 TTS 총길이/임의 위치 탐색은 이번 검증 범위가 아니다. 생성은 고정 목업을 유지한다.
