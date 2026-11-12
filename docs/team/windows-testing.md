# Windows 팀원 테스트 안내

이 문서는 기존 debug 팀 패키지 안내입니다. `새벽개발팸_차곡차곡_제출용` 묶음을 받았다면 최상위 README 또는 [release 실행 안내](../contest/release-runbook.md)를 따르세요. release 연결은 `configure-release`이며 `connect`/`run-as`를 사용하지 않습니다.

별도 클라우드·도메인·SMTP 계정 없이 **팀원 PC 자체에서** 테스트한다. Docker에는 웹/DB/동기화 worker/개발 메일함/목업 생성 서버가 들어가고, Pleos 에뮬레이터는 Windows에서 따로 실행한다. 개발자의 실제 일기나 계정은 전달하지 않는다.

## 1. 준비물

- [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/): WSL2 기반 **Linux containers** 모드, 설치 후 실행한다.
- Node.js24: 패키지의 실행 도구에 필요하다. 팀 테스트만 할 때는 pnpm/npm 의존성 설치가 필요 없다.
- 차량 시험: Android Studio와 공식 Pleos Connect2.1.0 에뮬레이터. [설치 가이드](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator), [설정 가이드](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/configure-pleos-connect-emulator)를 따른다. 호스트 CPU에 맞는 공식 이미지를 선택한다. Mac ARM64 AVD 디렉터리를 복사하지 않는다.
- 공식 문서의 GPU 요구사항도 확인한다. Cold boot 설정과 Microphone 입력 허용이 필요하다. 앱의 마이크 권한도 허용한다.
- 처음 Docker 이미지를 빌드하고 다운로드할 인터넷 연결. 폰까지 시험할 때는 PC와 폰이 같은 Wi-Fi에 있어야 한다.

이번 자동 검증은 Mac ARM64에서 수행했다. Windows 실기기·x64 Pleos 이미지의 실제 실행은 팀원의 첫 시험으로 확인해야 한다.

## 2. 패키지 받기

전달받은 `hmg-family-diary-team-windows.zip`을 `C:\work\hmg-family-diary-team`처럼 로컬 폴더에 푼다. OneDrive 동기화 폴더는 피한다. 아래 명령은 `compose.team.yaml`이 있는 폴더의 **Windows PowerShell**에서 실행한다. WSL 셸에서 Windows 에뮬레이터를 연결하는 방법과 섞지 않는다.

Git 소스로 받는다면 dev의 전달 커밋을 체크아웃한다. Git 저장소에는 빌드 APK가 없으므로 전달된 APK를 `apk\app-probe-debug.apk`에 둔다. Windows에서 직접 빌드할 때는 JDK17+/Android SDK35를 설정하고 `cd apps\vehicle` 후 `.\gradlew.bat :app:assembleProbeDebug --no-daemon`을 실행한다. 아래 서버 명령은 다시 저장소 루트로 돌아와 실행한다.

```powershell
node --version
docker version
ipconfig
# Wi-Fi/이더넷의 실제 IPv4로 바꾼다. 아래는 예시다.
node .\scripts\team-test.mjs init 192.168.0.25
node .\scripts\team-test.mjs up
```

첫 up은 현재 PC 아키텍처용 이미지를 빌드하므로 몇 분 걸릴 수 있다. Mac에서 만든 ARM64 이미지 tar를 Windows x64용이라고 전달하지 않는다. 사전 빌드 이미지를 따로 받은 경우 같은 `hmg-family-diary-team:local` 태그로 `docker load -i <이미지.tar>` 후 `up --no-build`를 쓸 수 있다. 기본 ZIP은 대용량 이미지 tar를 포함하지 않는다.

초기화는 비밀번호를 새로 만들며 `.env.team`이 이미 있으면 덮어쓰지 않는다. 이 파일을 팀 채팅이나 GitHub로 보내지 않는다. 개발 프로젝트와 팀 프로젝트는 이름·포트·named volume이 다르다.

## 3. 웹 가입과 확인 메일

실행 도구가 다음 주소를 출력한다. `<PC-IP>`는 앞서 입력한 주소다.

| 용도 | 주소 |
|---|---|
| 모바일 웹 / PC 브라우저 | `https://<PC-IP>:18443/library` |
| 개발 CA 설치 안내 | `http://<PC-IP>:18080/` |
| 개발 확인 메일함(PC에서만) | `http://localhost:18025` |

테스트 PC의 개발 CA만 설치/신뢰한다. Windows에서는 `certmgr.msc`의 현재 사용자 “신뢰할 수 있는 루트 인증 기관”으로 `.tools\team\local-ca.crt`를 가져온다. iPhone은 안내 페이지에서 다운로드한 프로파일 설치 후 일반→정보→인증서 신뢰 설정에서 켠다. 서버 주소가 바뀌어도 같은 볼륨의 CA는 유지된다. 종료 후 원하면 이 개발 CA 신뢰를 제거한다.

새 테스트 계정으로 가입한다. 실제 받은편지함에 메일이 오지 않는 것이 정상이다. PC에서18025 메일함을 열어 이메일 확인 링크를 사용한 뒤 로그인한다. 개인 목소리·사진 대신 합성/테스트 자료로 시작한다. 팀원별 로컬 서버는 서로 다른 가족 보관함이다.

휴대폰이 접속하지 못하면 같은 네트워크인지, 공유기 게스트 격리가 없는지 확인한다. Windows 방화벽은 필요한 경우 사설 네트워크의18080/18443만 허용한다. DB·개발메일·목업 포트를 인터넷에 열거나 공유기 포트포워딩을 하지 않는다.

## 4. 차량 에뮬레이터에 APK 설치

Android Studio에서 Pleos AVD를 cold boot한다. 기본 Android AVD로는 Pleos STT/TTS를 검증할 수 없다. 이 프로젝트의 Mac 전용 `run-vehicle-emulator.sh`는 Windows에서 실행하지 않는다.

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
# 출력에 나온 실제 serial 사용. 5554는 예시다.
& $adb -s emulator-5554 install -r .\apk\app-probe-debug.apk
node .\scripts\team-test.mjs connect emulator-5554 "$adb"
```

SDK를 다른 곳에 설치했다면 `$adb`만 바꾼다. connect는 팀 서버의 공개 CA·주소와 **팀원 PC에서 새로 만든** 목업 토큰을 해당 에뮬레이터에 연결한다. 설정을 다시 읽도록 해당 테스트 앱을 재시작하므로 녹음/편집을 저장하고 실행한다. 개발자의 계정이나 원본 파일을 복사하지 않는다. APK가 먼저 설치돼 있어야 한다.

목업 서버는 컨테이너에서 실행되고 adb reverse가 기기의4319를 PC의14319에 연결한다. 별도로 `pnpm probe:server`를 실행할 필요 없다. 재부팅으로 reverse 연결이 사라지면 connect를 다시 실행한다.

앱에서 P 상태+공동 녹음 안내를 확인한다. 폰 웹에서 차량 연결 코드를 발급하고 차량 설정에 입력한다. 초기 체크박스·시험 P/D 전환은 에뮬레이터 검증 장치이며 출시 UI가 아니다.

## 5. 같이 확인할 시나리오

1. 녹음 시작 → 파형/시간 확인 → 종료 → 인식문 수정 → 일기로 만들기 → 본문이 정확히 `AI 생성 일기 목업 입니다.`인지 확인 → 저장.
2. 원본 음성·인식문은 방금 입력한 내용으로 남아 있어야 한다. 기존 일기가 모두 고정 목업으로 바뀌는 것은 아니다.
3. 별도 공유 버튼 없이 연결한 폰에서 일기가 나타나는지 확인한다.
4. 폰에서 테스트 사진 추가 후 차량의 주차/유휴 상태에서 반영되는지 확인한다.
5. 원본 구간 재생·TTS 시작/종료·테마 전환을 확인한다.
6. 녹음하지 않고 시험 D→P를 전환하면 녹음 홈으로 돌아오는지 확인한다. 주행 화면에서는 인식문·사진을 볼 수 없어야 한다.
7. 서버 stop/up 후 계정·일기·사진이 유지되는지 확인한다.

결과 공유: 소스 커밋/Windows 버전/CPU/Pleos 버전/재현 순서/기대와 실제 결과를 적고 비밀·개인자료가 없는 화면만 첨부한다. `.env.team`과 원본 녹음은 보내지 않는다.

## 6. 종료·재실행·IP 변경

```powershell
node .\scripts\team-test.mjs stop
# 에뮬레이터는 별도로 창을 닫아 종료한다.
# 다음 사용
node .\scripts\team-test.mjs up --no-build
node .\scripts\team-test.mjs connect emulator-5554 "$adb"
# Wi-Fi가 바뀌어 IP가 달라진 경우
node .\scripts\team-test.mjs address 192.168.0.30
node .\scripts\team-test.mjs up --no-build
node .\scripts\team-test.mjs connect emulator-5554 "$adb"
```

컨테이너 종료는 데이터 삭제가 아니다. `down -v`, Docker Desktop의 volume 삭제, `.env.team` 재생성은 복구 명령이 아니므로 하지 않는다. 팀용 컨테이너는 Docker 재시작 시 자동으로 올라오지 않도록 설정했다. 개발 서버의 데이터/비밀번호와 합치지 않는다.

## 7. 백업과 실제 외부 배포의 구분

Docker volume은 재시작 때 유지되지만 **백업은 아니다**. 테스트 동안은 합성 데이터를 쓰고, PC 고장까지 대비하려면 앱 쓰기를 중단한 상태에서 DB와 audio/photo 볼륨, 환경 파일을 함께 암호화 백업하고 별도 프로젝트로 복원 검증해야 한다. 이 패키지에 자동 백업·복구 완료를 주장하지 않는다.

현재 공개 서버는 만들지 않는다. 나중에 클라우드 공동 서버를 열 때는 공인 DNS/HTTPS, 운영 SMTP·가입 정책, 원본 암호화/키 관리, 일관 백업과 삭제/폐기 표식 복구, 차량의 개발 CA 고정 제거/정식 신뢰 경로가 추가로 필요하다. localhost용 목업4319는 공개 API로 노출하지 않는다. [플랫폼 검토](../contest/platform-review-2026-11-12.md)와 [제출 준비](../contest/submission-checklist.md)를 함께 확인한다.
