# C047 전체 반복·재생 순서 표시 제거

2026-11-14. [004 PLAY-008/013](../../specs/004-memory-playback/spec.md)의 수용 조건·계획·작업·정합성 검토 후 구현했다. 이 변경이 C046의 마지막 종료 정책을 대체한다.

## 결과

- 주행 현재 일기 카드에서 반복 아이콘 왼쪽의 `현재 순서 / 전체 개수`를 제거했다. 날짜, 반복 버튼, 오른쪽 지난 일기의 전체 개수는 유지한다.
- 전체 반복 ON이면 원본과 일기 TTS 모두 마지막 항목 정상 완료 뒤 첫 항목부터 계속한다. 한 편 목록은 같은 항목을 반복한다. OFF는 기본 한 편 재생이며, 반복 도중 끄면 현재 항목을 마치고 멈춘다.
- 주행/주차 공통 버튼의 도움말·접근성 이름을 `전체 반복 켜기/끄기`로 맞췄다. 옵션 변경 자체로 재생을 시작하지 않는다. 수동 이전/다음 경계, 현재 항목 고정, 탐색 모드/활성 음성 분리, 정지·포커스·UNKNOWN 중단 정책은 유지한다.

## 검증

- spec 파일/링크/요구사항 매핑, TypeScript, 변경 JS 구문, diff 검사 통과.
- `python3 scripts/build-contest-release.py --tests`: 서명 APK·release lint·단위 검사26개 통과, 실패/건너뜀0.
- 실제 Pleos 에뮬레이터 사용자10에서 `DrivingListenDeviceTest` 1개 통과(10.868초, 실패/건너뜀0). cache-only 합성 자료로 기본 한 편 종료, 원본/TTS 마지막→첫 항목, 두 방식 모두 반복 해제 후 현재 항목 완료, 한 편 원본/TTS의 두 번째 재생, 명시적 종료와 늦은 재개 없음, 기존 문장 단위 pause/resume·방식 탐색·페이지·제목 보존을 확인했다. 합성 파일은 자동 동기화 폴더에 넣지 않았고 종료 시 삭제했다.
- `CHAGOK_EVIDENCE_CASE=c047 pnpm exec tsx scripts/test-c046-ui.ts`: 독립 headless Chrome, 라이트/다크1280×720. 순서 DOM 제거·전체 반복 접근성 이름·눌림 상태와 기존 목록/상세 버튼/제목/주행 자막·주차 인식문 회귀 통과. 양쪽 테마 화면을 직접 확인했다. 실제 가족 데이터 대신 합성 bridge/API만 사용했다.
- APK의 변경 JS2개와 소스가 byte 단위로 일치한다. 실행 중인 Compose를 볼륨 보존 상태로 재빌드했고 web/DB healthy를 확인했다. localhost HTTPS에 기존 APP_HOST를 전달하여 실제 제공 driving/parked-player JS가 검증한 소스와 일치함을 확인했다.

## 전달 상태

`io.hmg.familydiary.contest`, contestRelease **0.2.9 / versionCode10**. APK SHA256: `e4e2c1908a651302ab5fd78cdbbb9c6e966bc72829c5dc29af55207bd7c35493`. 커밋/최종 ZIP 해시는 제출 manifest/SHA256SUMS가 정본이다. dev 커밋이며 원격 푸시는 하지 않는다.

사용자가 실행해 둔 Docker/에뮬레이터 상태를 유지했고 최신 APK를 데이터 삭제 없이 덮어 설치한 후 앱을 다시 열었다. 새 에뮬레이터나 caffeinate를 시작하지 않았다. 기존 연결 정보·네트워크 주소·DB·미디어 볼륨을 유지했다. Windows/iPhone/실차의 새 버전 동작, 실제 플랫폼의 주행 허용은 이번 검증 범위가 아니다. 생성은 계속 고정 목업이다.

[라이트](connected-ui/c047-driving-list-light.png) · [다크](connected-ui/c047-driving-list-dark.png)
