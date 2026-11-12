# C034 Windows 팀 테스트 배포 준비

2026-11-12. C034 명세·계획에 따라 공개 서버 대신 팀원 Windows PC에서 실행하는 Docker 환경을 준비했다.

## 변경

- `compose.team.yaml`: PostgreSQL·웹·worker·Caddy·Mailpit·고정 목업 서버. 기존 개발 환경과 프로젝트명/포트/볼륨을 분리하고 자동 재시작을 사용하지 않는다.
- `scripts/team-test.mjs`: Node24 내장 기능으로 초기 비밀 생성, 실행·검사·중지, IP 갱신, Windows adb 연결을 지원한다. 실행 토큰은 출력하지 않는다.
- 공개 CA만 배포하고, DB는 포트를 공개하지 않는다. 개발 메일함/목업은 PC loopback에만 노출한다. 개발자의 환경 파일·DB·음성·사진은 전달하지 않는다.
- Windows 안내, 공식 플랫폼 지원/미확인 범위, 공모전 제출 체크리스트와 ZIP 패키징 도구를 추가했다.

## 실행 검증

실행 호스트는 Mac ARM64다. 별도 `hmg-family-diary-team` 프로젝트를 `127.0.0.1:18443`으로 빌드/실행했다. Windows 실행 결과라고 주장하지 않는다.

- 새 이미지 빌드, DB 역할/마이그레이션, HTTPS CA 검증·health, 개발 메일함 실행 통과.
- `scripts/test-team-runtime.mjs`: 합성 계정 가입 → 확인 전 로그인 거부 → Mailpit 확인 링크 → 로그인 → 기기 코드 연결 → 컨테이너 목업 생성 → snapshot/무음 WAV 업로드 → 보호자 조회를 통과했다.
- 목업 본문은 정확히 `AI 생성 일기 목업 입니다.` 한 문장이다. 별도 확인문과 원본 WAV SHA-256은 유지된다.
- 팀 컨테이너 stop/up 후 같은 계정 로그인·일기·원본 음성 해시 유지 통과. 검증 일기와 연결 기기는 삭제했다. 테스트용 계정/메일은 격리된 팀 볼륨에만 남아 있다.
- 첫 재시작 검사는 이전 HTTPS keep-alive 연결 재사용으로 socket reset이 발생했다. 재시작을 검사하는 클라이언트에서 새 연결을 사용하도록 수정한 뒤 전체 흐름이 통과했다.
- Vitest 111개 및 TypeScript 검사 통과. 최초 샌드박스 검사는 로컬 포트 listen EPERM으로 실패했으며 네트워크 실행 권한을 받은 재검사에서 통과했다.
- 기존 개발용 4319 목업 프로세스도 새 코드로 교체하고 인증된 합성 요청으로 고정 응답을 확인했다. 사용자 저장 일기는 수정하지 않았다.
- 검증용 팀 컨테이너를 종료했고 기존 사용자 개발 컨테이너와 목업 서버는 유지했다. 에뮬레이터·caffeinate·Gradle daemon을 새로 실행하지 않았다.
- 전달 ZIP에 Compose/실행 도구/안내/Gradle wrapper/테스트 APK가 포함됨을 검사했다. 환경 파일(예시 제외)·도구 디렉터리·개인 미디어·인증서 키·DB dump 제외 검사도 통과했다.

## 미검증 및 남은 작업

- Windows 실제 호스트, Windows Pleos 이미지/마이크, Windows adb 연결 명령 및 새 환경에서의 UI 전체 시연은 팀원의 첫 실행 확인이 필요하다. 기존 APK를 재사용했으며 이번 작업은 Android 코드를 변경하지 않았다.
- ZIP은 소스/Compose와 에뮬레이터 debug APK다. 사전 빌드 Docker 이미지와 SDK/AVD는 포함하지 않는다. 첫 실행은 인터넷으로 의존성을 받아 해당 PC용 이미지를 빌드한다.
- 공식 원본 음성 취득/보관/전송 허용, 실제 주행 제한 연동, 제출용 release 서명·기능 빌드가 남아 있다. 공개 서버·운영 SMTP·암호화 백업/복구를 구현 완료했다고 주장하지 않는다.

자료: [Windows 안내](../team/windows-testing.md), [플랫폼 비교](../contest/platform-review-2026-11-12.md), [제출 준비](../contest/submission-checklist.md).
