# 차곡차곡 프로토타입 실행 안내

## 실행물의 범위

`app-probe-debug.apk` / 패키지 `io.hmg.familydiary.probe` / 앱 표시 이름 `가족의 이야기 · 차량 미리 보기`.
공식 Pleos 에뮬레이터의 debug 실험 앱이다. 실차·마켓 출시용 APK가 아니다. `demo`의 합성 UI 및 잠금 상태의 `pleosRelease`와 구별한다.

- 차량: 자유 발화 녹음, 공식 ON_DEVICE STT, 주차 후 인식문 수정·목업 일기 검토/저장, 원본 재생·공식 TTS, 녹음 시작 위치, 기록 당시 차량 정보.
- 휴대폰: HTTPS 로그인·가족 보관함, 일기/원본/사진, 사진 첨부와 차량별 필터.
- 동기화: 차량과 휴대폰을 연결하면 완성 일기·원본을 자동 전송한다. 이후 SSE 힌트+cursor 조회로 변경을 받는다. 재연결은 지수 backoff이며 느린 조회 폴링은 없다. 차량은 주차·유휴 때 변경을 반영한다.
- 실제 LLM 호출 없음. `AI 생성 일기 목업 입니다.`를 반환하는 고정 목업이다. 자동차 화자 프롬프트 v4는 준비했지만 모델 품질 실험은 미실행이다.
- 자동 가족 음성 식별, 비전, Gleo 호출, 목적지/트립 거리 연동, 다중 활성 차량 연결은 구현 범위가 아니다.

## 검증 환경

- Mac ARM64, Android Emulator 37.2.13, Pleos Connect 2.1.0 / API34 ARM64 공식 이미지.
- AVD 물리 화면 2560×1440, 앱 참조 레이아웃 1280×720. 폰 웹 375×812 및 812×375 검증.
- compile/target SDK35, build-tools35.0.0, AGP8.8.2, Kotlin2.0.0, Gradle8.10.2. JDK17 이상(이번 빌드는 JDK21).
- SpeechToText3.3.1 / TextToSpeech3.3.1 ON_DEVICE, FusedLocation1.1.3.
- Node24 / pnpm11.13.1 / Docker Compose. SDK와 AVD는 배포 ZIP에 넣지 않는다.

공식 설치: [Pleos 개발 환경 구성](https://document.pleos.ai/docs/pleos-only/setup-connect-sdk-emulator).
SDK 저장소: [Pleos Maven](https://nexus-playground.pleos.ai/repository/maven-releases/).

## 처음 실행하기

1. 공식 안내로 Pleos 에뮬레이터를 준비한다. 이 체크아웃의 실행 스크립트는 `hmg_pleos_arm64` AVD와 `.tools/android-sdk`를 사용한다. 다른 위치에서는 ANDROID_HOME/ANDROID_AVD_HOME을 지정하거나 자신의 에뮬레이터 실행 명령을 사용한다.
2. `pnpm install --frozen-lockfile`과 `pnpm fixture:audio`를 실행한다.
3. `./scripts/vehicle-gradle.sh :app:assembleProbeDebug :app:testProbeDebugUnitTest`로 차량 앱을 빌드한다.
4. 에뮬레이터를 실행하고 `adb install -r apps/vehicle/app/build/outputs/apk/probe/debug/app-probe-debug.apk`로 설치한다. adb는 자신의 Android SDK platform-tools 경로를 사용한다.
5. 새 환경에서 `pnpm exec tsx scripts/setup-runtime.ts <호스트-LAN-IP>`로 로컬 개발용 설정을 만들고 `docker compose --env-file .env.runtime --profile dev up -d --build`로 서버를 실행한다. 이미 설정된 환경에는 setup을 다시 실행하지 않는다.
6. 별도 터미널에서 `DIARY_GENERATOR=mock pnpm probe:server`를 실행한다. `pnpm exec tsx scripts/refresh-runtime.ts`로 현재 주소·CA·차량 설정·adb 연결을 갱신한다. 출력된 주소가 접속 정본이다.
7. 휴대폰에서 `http://<IP>:8080/` 설치 안내를 따라 개발 CA를 신뢰하고 `https://<IP>:8443/library`로 접속한다. 개발 확인 메일은 호스트의 `http://localhost:8025`에서 확인한다. 운영 SMTP는 연결하지 않았다.
8. 보호자 가입/로그인 후 차량 연결 코드를 발급하고 차량 설정에 입력한다. 기기 별칭은 편집할 수 있다.

목업 생성 서버와 Docker 서버는 별도 프로세스다. 앱이 서버 없이 실제 LLM 일기를 생성한다고 설명하지 않는다. 개발 CA/비밀번호/기기 토큰은 각 환경에서 생성하며 배포 ZIP에 넣지 않는다.

## 추천 시연 순서

1. 차량 신호(P+UX 제한 없음)를 확인하고 공동 녹음 안내를 확인한다. 시험용 P/D 제어는 모의 입력임을 명시한다.
2. 설정에서 차량 기본값을 확인·수정한다. 녹음 위치를 사용할 경우 ‘녹음 위치 사용 설정’에서 권한을 허용하고, 샘플 위치는 끈다.
3. 녹음을 시작해 자유롭게 이야기한다. 내비 앱으로 전환해 녹음이 이어지는 것을 확인하고 돌아온다. 주행 중 인식문·사진은 숨겨진다.
4. 주차 후 녹음을 마치고 인식문을 수정한다. 목업 초안을 검토하고 일기로 저장한다.
5. 원본과 일기 읽어 주기를 각각 실행한다. 내비 화면으로 전환해 재생 지속을 확인하고, 알림에서 종료한다.
6. 연결된 차량에서 일기를 저장하고 별도 공유 조작 없이 휴대폰에 나타나는지 확인한다. 휴대폰에서 사진을 추가한다. 차량이 주차·유휴 상태가 되면 새 사진을 수신한다.
7. 차량과 휴대폰의 ‘기록한 차량’ 필터로 이전 차량 정보의 기록을 찾는다. 이는 저장된 정보별 묶음이며 VIN 기반 차량 식별이 아니다.

위치는 녹음 시작 전30초 이내 관측만 저장한다. 권한 거절/오래된 관측/미지원 때도 녹음은 가능하며 실패 상태를 남긴다. 위치를 ‘목적지’라고 표시하거나 나중 위치로 보정하지 않는다.

## 검증과 제한

- 원본은 화면 재생성·내비 전환에서도 유지하고 UNKNOWN/포커스 상실에 멈춘다. 원본 duck은 앱 음량 감쇄이며 TTS는 공개 gain API가 없어 안내 음성의 duck 요청 시 멈춘다. 자동 재개하지 않는다.
- 음성 엔진 합성/콜백을 에뮬레이터에서 검증했다. 스피커 음질, 실제 내비와의 혼합 음량, 실차 통화/주행 정책은 별도 검증 대상이다.
- AAOS AudioRecord의 원본 캡처·보관·휴대폰 전달에 대한 공개 플랫폼 지원·공모전 허용 근거는 미확인이다. 실행 성공으로 공식 허용을 주장하지 않는다. 차량 음성을 외부 STT에는 보내지 않는다.
- 실제 주행 허용은 차종·카테고리·플랫폼 심사를 별도로 충족해야 한다. DO를 임의 선언하지 않았고 실차용 잠금을 풀지 않았다.
- 최초 지원 계획은 `docs/contest/car-narrator-evaluation.md`, 실행 증거는 `docs/evidence/compose-runtime.md` C021·C023에 있다.

## 패키징

`python3 scripts/package-contest.py`는 로컬 `dist/contest/`에 APK, 소스 ZIP, 파일별 SHA256 목록과 manifest를 만든다. 업로드·저장소 공개·지원서 제출은 하지 않는다. SDK/AVD, .git, 환경 비밀, 사용자 녹음, 인증서, DB 볼륨을 포함하지 않는다.

패키징은 작업 트리를 기준으로 하며 manifest에 `working-tree`와 기준 HEAD를 기록한다. 미커밋 변경이 포함될 수 있으므로 이 ZIP을 그대로 최종 제출 커밋이라고 부르지 않는다. 제출 시에는 실제 배포할 소스 커밋과 산출물을 일치시켜야 한다.

## 종료

에뮬레이터 창을 닫고 목업 서버에서 Ctrl+C, `docker compose --env-file .env.runtime --profile dev stop`을 실행한다. `./scripts/vehicle-gradle.sh --stop`으로 빌드 데몬도 종료할 수 있다. 데이터 삭제 옵션(`down -v`)은 사용하지 않는다. caffeinate를 실행하지 않는다.

## 발언별 원본 타임라인 (C026)

새 인식 결과에 원문과 EPD 시각을 보관한다. 차량 일기 상세의 `원래 이야기`, 모바일 녹음 원문에서 발언을 누르면 해당 시점부터 원본을 듣는다. 기존 시각 없는 기록은 전체 원본을 유지한다. 사람별 자동 분리는 아직 제공하지 않는다. 상세 검증과 기존 STT 오인식, 후속 Docker 반영 및 실제 서버 왕복 통과 범위는 `docs/evidence/c026-original-timeline.md`를 확인한다. 새 앱의 업로드에는 `speech_timeline_version:1` 서버가 필요하다.

## Windows 팀 테스트와 제출 점검
[Windows Docker 테스트 안내](../team/windows-testing.md), [최신 공식 지원 범위](platform-review-2026-11-12.md), [제출 체크리스트](submission-checklist.md)를 참조한다. 팀 배포 ZIP은 소스/Compose/시험용 APK이며 공개 서버나 공식 제출 release APK가 아니다.
