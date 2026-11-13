# C048 연결 표시·저장 알림·공통 플레이어 정리

2026-11-14. [003 SYNC-010](../../specs/003-device-sync/spec.md), [004 PLAY-015](../../specs/004-memory-playback/spec.md), [006 UX-011](../../specs/006-vehicle-experience/spec.md)의 수용 조건→계획·정합성 검토→작업 정의 후 구현했다.

## 결과

- 차량 홈과 모바일 보관함은 연결 등록이 유효하면 휴대폰 SVG와 `연결 중`을 표시한다. 반복해서 남던 전송 안내와 연결 여부를 분리했다. 이 표시는 실시간 네트워크 접속이나 전체 원본 전송 완료의 보증이 아니다. 오류·보류 정보는 설정/개별 기록에 남는다. 차량 일기 목록 위의 연결/동기화 문구는 제거했다.
- 실제 기록·원본·사진·삭제의 동기화 완료/적용에만 `기록을 보관했어요.`를4초 표시한다. Android는 일반 상태 version과 실제 내용 변경 sequence를 분리하고, 모바일은 revision/원본 준비/사진 해시·목록을 비교한다. 최초 화면/초기 cursor, 동일 변경 재조회, 연결 재시도/별명 변경, 실패에는 저장 완료를 알리지 않는다. 직접 사진 업로드 성공과 뒤따르는 SSE의 중복 알림을 막았다. 녹음/주행 중에는 저장 알림을 표시하지 않으며 기존 알림도 닫는다.
- 주차 공통 플레이어의 버튼과 상태 머리는 `일기 / 목소리`로 줄였다. 이전·재생/일시정지·다음·반복·종료는 상시 배경 없이 기호만 표시한다. 실제 제어/접근성 이름/48px 이상 터치 영역/포커스와 반복 활성 색상·굵기는 유지한다.
- 홈의 이전 `11월 · 6개`는 가장 최근 기록의 월과 전체 기록 수를 조합한 값이었다.11월만6개라는 뜻이 아니므로 `전체 기록 N개`로 바꿨다. 작성 중 포함 전체 로컬 기록을 세며 카드의 실제 날짜와 일기 목록의 월별 묶음은 유지한다.

## 검증

- `python3 scripts/check-specs.py`, `pnpm typecheck`, 변경 JS 구문·diff 검사 통과.
- `python3 scripts/build-contest-release.py --tests`: 서명 release APK·lint·단위 검사26개 통과, 실패/오류/건너뜀0.
- Pleos 에뮬레이터 사용자10에서 `SyncRecoveryDeviceTest`, `WelcomeDeviceTest` 총3개 통과(1.833초). cache-only 합성 자료로 사진/삭제 적용과 재수신, 동일 일기와 제목 변경 수신, 서버 메타데이터 revision·JSON 키 순서만 다른 재수신을 검증했다. 실제 내용이 달라질 때만 sequence가 증가했고 원본 해시가 유지됐다. 기존 동의/미디어 경계와 공통 플레이어 상태 표시도 통과했다.
- `pnpm exec tsx scripts/test-c048-ui.ts`: 독립 headless Chrome, 라이트/다크 차량1280×720·모바일390×844. 연결 배지/아이콘, 월·연도 혼합4기록(작성 중 포함), 목록 메시지 제거, 짧은 플레이어 이름·투명 버튼·터치 크기,4초 소멸·중복 갱신/녹음 중 억제, 모바일 초기/반복/별명만 변경/실패 무알림, 실제 기록 변경·사진 업로드 성공 알림·자기 SSE 중복 제거 통과. 합성 bridge/API 자료만 사용했으며 양쪽 테마 캡처를 직접 확인했다.
- `pnpm exec tsx scripts/test-c044-ui.ts`와 `CHAGOK_EVIDENCE_CASE=c048-regression pnpm exec tsx scripts/test-c046-ui.ts` 통과. 동의/주행 전환/공통 플레이어/STT 및 최신 목록·명시적 재생·반복/제목 수정의 기존 동작을 검증했다. 이력용 C043 전체 스크립트도 시도했으나 C046에서 이미 바뀐 과거 접근성 이름 `같은 일기의 원본 듣기로 전환`을 기다리다 중단했다. 이번 동작은 현재 계약을 반영한 C048/C046으로 검증했고 C043 이력 파일은 변경하지 않았다.
- APK의 변경 UI4파일과 소스가 byte 단위로 일치한다. Compose 재빌드 후 web/DB healthy·worker/proxy 실행을 확인했다. localhost HTTPS에 기존 APP_HOST를 전달해 실제 제공되는4파일도 검증 소스와 일치함을 확인했다.

## 전달 상태·검증 범위

`io.hmg.familydiary.contest`, contestRelease **0.2.10 / versionCode11**. APK SHA256: `2fa7b9e6832377543e8bc779a0c55b2cb4c7a637272c6293e0fe23c078e2ec00`. 최종 커밋·ZIP 해시는 제출 manifest/SHA256SUMS가 정본이다. dev 커밋이며 원격 푸시는 하지 않는다.

기존 데이터·연결·주소·DB/미디어 볼륨을 유지하며 APK를 덮어 설치하고 다시 열었다. 사용자가 켜 둔 Docker/에뮬레이터를 유지하며 새 에뮬레이터나 caffeinate를 실행하지 않았다. 실제 iPhone/Windows 재확인, 실차 허용, 실제 사용자 원본 업로드의 끝까지 알림 전달은 이번 검증에 포함하지 않는다. 외부 AI 연결은 추가하지 않았고 생성은 고정 목업을 유지한다.

화면은 모두 합성 자료다: [차량 홈 라이트](connected-ui/c048-car-home-light.png) · [다크](connected-ui/c048-car-home-dark.png) · [차량 목록 라이트](connected-ui/c048-car-list-light.png) · [다크](connected-ui/c048-car-list-dark.png) · [모바일 라이트](connected-ui/c048-mobile-light.png) · [다크](connected-ui/c048-mobile-dark.png)
