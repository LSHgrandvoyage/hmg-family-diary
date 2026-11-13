# C046 선택 재생·명시적 이어듣기·제목 수정

2026-11-13~14. [002 REC-009](../../specs/002-voice-diary/spec.md), [004 PLAY-003/004/011~014](../../specs/004-memory-playback/spec.md). 수용 조건 → plan/계약 → tasks → 정합성 검토 후 구현했다. 기존 목업 본문과 원본 보존·주차 편집·UNKNOWN/포커스 중단 정책은 유지한다.

## 결과

- 주행의 오른쪽 듣기 방식 탭과 왼쪽 활성 음성을 분리했다. 탭만 바꾸면 원본/TTS가 바뀌거나 새로 시작하지 않는다. 목록 항목을 눌렀을 때 기존 엔진 종료 응답 뒤 선택한 방식으로 재생한다. 왼쪽 제목/방식/진행은 실제 음성에 연결된다. 전환이 일기 생성 요청을 보내지 않는다.
- 기본은 선택한 한 편이다. 반복 화살표 모양의 `자동 이어듣기` 아이콘을 켰을 때만 TTS와 원본 모두 다음 날짜순 항목으로 이어진다. 마지막에서 멈추며 처음으로 반복하지 않는다. 주행/주차가 같은 옵션을 공유하고 명시적 종료·오류·포커스 상실 후 자동 재개하지 않는다.
- 완성 일기 목록은 최근순이다. 현재 항목은 목록 위에 고정하고 나머지에 중복 표시하지 않는다. 기존 현재±8/추가8 커서는 고정 행과 분리했다. 로딩/재시도/늦은 응답 제외/포커스·앞쪽 삽입 위치 보존을 유지한다. 렌더링에 따른 프로그램 스크롤이 추가 로딩을 다시 촉발하던 문제도 보정했다.
- 일기 상세 버튼을 숨기던 `.tts-active [data-narrate]` 규칙을 제거했다. 해당 일기의 재생 상태에 따라 `일기 읽어주기 / 일기 일시정지 / 일기 이어 읽기`로 같은 자리에 남는다. 다른 일기의 상태를 상세 버튼에 적용하지 않는다. TTS 재개는 SDK 제약상 현재 문장 처음부터다. 주차 공통 바의 방식 전환은 같은 기록을 멈춘 상태로 선택하고 재생 버튼으로 시작한다.
- 생성 전 원본의 공통 제목은 `확인할 이야기 · 녹음 날짜`다. 생성 시 첫 묶음 label이 제목이 되며 현재 고정 목업은 `AI 생성 일기 목업`이다. 완성 일기의 `… → 제목 수정`을 추가했다. 본문/원본/인식문/타임라인을 유지하고 완성 revision을 올려 기존 자동 동기화 outbox에 넣는다. 재생·동기화 작업 중 저장, 오래된 revision, 빈 제목은 거부하며 입력은 남긴다.

## 실행 근거

- `scripts/check-specs.py`: 기능8개 파일/링크/요구사항-작업 매핑 통과. `pnpm typecheck`, 변경 JS 구문 검사, `git diff --check` 통과.
- `pnpm test packages/sync`: **25개 통과**. 제목만 바꾼 완성 snapshot의 서버 경계 통과와 원본 hash·본문·인식 이력·타임라인 보존, 불일치 accepted revision 거부를 포함한다.
- `python3 scripts/build-contest-release.py --tests`: 서명 release, release lint, Android 단위 검사 **26개 통과, 실패/건너뜀0**.
- 실제 Pleos 에뮬레이터 사용자10: `DrivingListenDeviceTest`, `WelcomeDeviceTest` **2개 통과, 실패/건너뜀0**. 최종 실행8.419초. 실제 TTS의 두 번째 문장 pause ack/동일 문장 resume, 두 방향 탭 선택 시 기존 미디어 유지, 명시적 같은 원본 선택, paused next 미재생, 한 편 완료 후 멈춤, 옵션 ON에서 원본/TTS 다음 항목 진행·마지막 종료, 명시적 종료·UNKNOWN, D→P 공통 제어 및 안내 경계를 확인했다.
- 합성 UUID41개는 cache에만 만들고 자동 동기화 원본 폴더에 넣지 않았다. 제목 변경의 revision/완성 상태·원본/text/raw/timeline/body 보존과 store 재로드도 검사했다. 종료 시 합성 파일/리뷰를 삭제했다. 실제 가족 음성을 재생하거나 제목을 수정하지 않았다.
- `scripts/test-c046-ui.ts`: 독립 headless Chrome, light/dark1280×720.41개 페이지/최근순/고정/중복 방지/재시도/요청 중4개로 변경/늦은 응답 제외, 방식 탐색과 실제 음성 분리, 자동 이어듣기 pressed state, 공통 제어, 상세 TTS 버튼 지속·pause/resume·다른 기록 상태 분리, 제목 편집, 기존2줄 주행 자막·주차71문장 회귀 통과. 저장한 양쪽 테마 화면을 직접 검토했다.
- C025 검색·차량 필터·원본 진행률 분리·대비, C044 동의/UNKNOWN·1682×1154 창 크기·D→P 공통 바·모바일 가족 패널 회귀 통과.
- 최종 APK 안의 HTML/JS/CSS9개 파일과 소스가 byte 단위로 일치한다. Docker 이미지 재빌드 후 web/DB health를 확인했다. 최종 HTTPS 제공 정적 자산으로 C046 UI 검사를 다시 통과했다. localhost 연결에 기존 APP_HOST 헤더를 전달했고 가족 API/bridge는 합성이다. 실제 iPhone 접속/제목 전송 확인으로 간주하지 않는다.

## 전달과 한계

패키지 `io.hmg.familydiary.contest`, **0.2.8 / versionCode9**. APK SHA256: `6f7ff1e6a8793648d647e578f7b82f26173ec4482e7acfc08e41ce1489e6f7ef`. 최종 커밋·ZIP 해시는 manifest/SHA256SUMS가 정본이다. dev 작업 커밋이며 원격 푸시는 하지 않는다.

작업 시작 시 Docker/에뮬레이터가 실행 중이었다. 데이터를 지우지 않고 서버와 APK를 갱신했고 마지막에 앱을 다시 열었다. DB·미디어 볼륨, 런타임 주소와 연결 정보는 유지했다. 별도 에뮬레이터나 caffeinate를 시작하지 않았다. 사용자가 실행한 서버/에뮬레이터는 실행 상태로 유지한다.

Windows/iPhone의 새 버전 사용자 확인, 차량 실제 원본 취득·보관·전송 허용, 실차 오디오 포커스, 주행 목록/STT의 마켓 허용은 미검증이다. 생성 AI는 계속 목업이며 이번 결과로 외부 모델 생성 품질을 주장하지 않는다.

## 합성 화면

[driving-list-dark](connected-ui/c046-driving-list-dark.png) · [driving-list-light](connected-ui/c046-driving-list-light.png) · [parked-player-dark](connected-ui/c046-parked-player-dark.png) · [parked-player-light](connected-ui/c046-parked-player-light.png) · [detail-active-dark](connected-ui/c046-detail-active-dark.png) · [detail-active-light](connected-ui/c046-detail-active-light.png)
