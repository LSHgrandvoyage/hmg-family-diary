# Windows 팀원 설치·실행 안내

현재 전달 버전은 **차곡차곡 contestRelease 0.2.13**입니다. 예전 `app-probe-debug.apk`와 `connect`/`run-as` 안내 대신 아래 경로를 사용합니다.

1. [저장소 README의 Windows 빠른 실행](../../README.md#빠른-실행-windows-powershell): 준비물, release APK 설치, 로컬 서버, 가입과6자리 연결.
2. [상세 설치·업데이트·복구](../contest/release-runbook.md): GitHub와 제출 ZIP의 명령 실행 위치, 인증서, IP 변경, DB 오류 복구.

준비물: Windows용 Docker Desktop(WSL2 / Linux containers), Node.js24, Android Studio와 호스트 CPU에 맞는 공식 Pleos Connect2.1.0 에뮬레이터입니다. Node24의24는 버전입니다. 마이크 입력·Cold boot·공식 GPU 요구사항을 확인합니다.

GitHub에서 받으면 저장소 루트에 `apk`와 `scripts`가 있습니다. 별도 제출 ZIP을 받으면 APK는 바깥 `apk`, 서버 명령은 안쪽 `source`에서 실행합니다. **처음 설치에서만 init**, 재실행은 `up --no-build`, 소스 업데이트는 `up`입니다. 기존 `.env.team`과 `.tools/team`, Docker 볼륨을 보존합니다.

PowerShell은 `& $adb devices` 형태로 실행하며, `devices`에 나온 실제 serial을 사용합니다.5037은 adb 서버 포트입니다. release 서버 연결은 `configure-release`이며 차량 화면에서 설정 적용 후 웹의6자리 코드를 입력합니다.

최신 제출 APK의 전체 Windows 재현은 macOS 자동 검사와 별도입니다. 팀원이 전달한 설치·연결 피드백을 전체 회귀 통과로 확대하지 않습니다.
