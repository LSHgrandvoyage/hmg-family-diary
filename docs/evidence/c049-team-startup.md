# C049 Windows 새 ZIP 설치의 DB 인증 실패·재발 방지

2026-11-14. [007 DEP-008](../../specs/007-release-deployment/spec.md)의 수용 조건·계획·작업·정합성 검토 후 실행 도구/안내를 수정했다.

## 확인된 원인과 사용자 선택

사용자는 Windows에서 기존 폴더를 지우고 새 ZIP을 풀어 README의 `init`을 다시 실행했다. 사용자 제공 출력은 DB healthy, migrate Exited1, web/worker/proxy Created였다. migrate는 PostgreSQL 오류28P01과 `password authentication failed for user "diary_migrate"`를 반환했다.

`init`은 새 비밀번호를 생성하지만 고정 Compose 프로젝트의 기존 DB 볼륨은 이전 비밀번호를 유지한다. 이 조합으로 DB 인증이 실패했고 migrate 성공에 의존하는 웹/HTTPS 서버는 시작되지 않았다. 기존 `.env.team`은 없으며 사용자가 데이터 초기화를 명시적으로 허용했다.

사용자 Windows에 대해서만 팀 컨테이너 down→팀 DB/음성/사진/목업4개 볼륨 삭제→현재 `.env.team`으로 up --no-build 순서를 안내했다. CA/설정2개 볼륨은 보존한다. 서버 초기화로 차량 연결이 무효가 되며 이전 공유 사본 정리·재가입/재연결 가능성을 알렸다. **Windows 초기화 명령의 실행 결과와 웹 복구 성공은 아직 받지 않았으며, 완료로 주장하지 않는다.** 맥북 환경에 해당 삭제 명령을 실행하지 않았다.

## 변경

- `team-test.mjs init`: 정확한 팀 데이터 볼륨4개 중 하나라도 남으면 새 비밀 생성 전에 중단한다. Docker 조회 실패도 파일을 생성하지 않는다. 기존 `.env.team` 덮어쓰기 차단은 유지한다. 다른 프로젝트나 공개 CA만 남은 경우는 초기 생성을 막지 않는다.
- `up` 실패: 시작 완료를 표시하지 않고 migrate 의존관계·상태/로그 명령·비밀번호 오류의 복구 위치를 안내한다. 비밀번호를 자동 변경하거나 데이터를 지우지 않는다.
- `status`: HTTPS 정상 응답이 없어도 Compose ps -a로 Created/Exited 상태를 확인한다.
- README 앞부분에서 최초 설치/업데이트/재실행을 구분한다. 이전 `.env.team`과 `.tools/team` 보존, 이전 폴더 삭제 시점, 설정 분실·사용자가 선택한 데이터 초기화·재가입/재연결을 안내한다. 상단 APK 버전은 manifest를 참조해 과거 버전 고정을 제거했다.

## 검증

- `node scripts/test-team-startup.mjs`: 임시 디렉터리와 대역 Docker CLI로12개 사례 통과. 최초 생성/기존 설정 보존/4개 데이터 볼륨 각각 차단/Docker 실패/다른 프로젝트/CA만 유지/up 실패/Created 상태 조회/주소 변경 시 비밀 보존을 검사했다. 초기화 가드는 조회만 호출하며 비밀을 출력하지 않는다. 테스트가 실제 Docker에 연결하지 않았음을 구분한다.
- `node --check scripts/team-test.mjs`, 명세8개 디렉터리 링크/요구사항 매핑, diff 검사 통과.
- 실행 도구·문서만 변경했다. APK는 C048에서 검증한 **0.2.10 / versionCode11**을 그대로 사용하며 SHA256 `2fa7b9e6832377543e8bc779a0c55b2cb4c7a637272c6293e0fe23c078e2ec00` 일치를 확인했다. 앱/서버 기능 검증은 [C048](c048-sync-status-player.md)의 범위다.
- 맥북의 Docker/DB/미디어/에뮬레이터/CA/연결은 이번 작업에서 변경하지 않았다. 이번 CLI 테스트는 macOS에서 수행했고 새 도구의 Windows 실제 실행과 사용자 복구 성공은 별도 확인이 필요하다. 외부 AI·클라우드 배포는 추가하지 않았다.

명세·코드·근거를 dev에 커밋하고 최신 source와 같은 APK로 제출 ZIP을 갱신한다. 커밋·ZIP/파일 해시는 manifest/SHA256SUMS가 정본이며 원격 푸시는 하지 않는다.
