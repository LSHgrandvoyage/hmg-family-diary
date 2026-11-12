# Research: 차량 원본 음성, 자유 발화 정리, 양쪽 기기

확인일 2026-11-08. 외부 문서는 공식 자료만 사용했다. 계정 접속·SDK 실행·모델 호출은 하지 않았다.

## R1. 차량 앱과 도구

**Decision:** Kotlin Android 앱, JDK17, 제품 minSDK28. 공식 샘플 도구 조합으로 재현을 시작한다.
**Rationale:** Pleos 설치 가이드는 제품 min28·Gradle8+·AVD/API34를 안내한다.
샘플은 JDK17·Kotlin2.0.0·AGP8.8.2·Gradle8.10.2·compile/target35를 사용한다.
**Alternatives:** 차량 WebView만으로 구현하면 마이크·차량 상태 접근의 의존성을 해결하지 못한다.
**Gate:** 샘플 버전표의 실제 빌드는 G0에서 확인한다. 로컬에는 JDK17/21/26, Node24.18.0,
pnpm11.13.1이 있다. Android SDK 표준 경로와 PATH의 adb/sdkmanager는 확인되지 않았다.
[설치](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator) · [샘플](https://document.pleos.ai/docs/pleos-only/tutorial/vehicle-sdk-sample-app)

## R2. 원본 음성과 인식 입력

**Decision:** 허용된 마이크 경로로 한 번 얻은 PCM을 로컬 원본 보관과 ON_DEVICE STT 입력에 함께 사용한다.
이는 G1에서 검증할 구현 후보이며 지원을 확정한 사실은 아니다.
**Rationale:** STT의 `sendAudio`는 앱 소유 PCM의 입력이다. STT 서비스 권한과 결과 콜백은
차량 마이크의 raw PCM 출력 권한을 입증하지 않는다. 일반 Android AudioRecord 접근도 Pleos에서 검증해야 한다.
**Alternatives:** STT 텍스트만 보관하면 사용자 원본 요구를 충족하지 못한다. 두 마이크 소비자를
동시에 실행하는 방식은 오디오 경합·권한을 검증하기 전 채택하지 않는다.
**Gate:** ON_DEVICE 등록 불필요 안내와 프로젝트 신청의 준비 중 표기가 달라 실제 환경 확인이 필요하다.
[PCM 입력](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/sending-audio-data) · [권한](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/declaring-permissions) · [상태](https://document.pleos.ai/docs/pleos-only/create-my-project) · [일반 Android AudioRecord](https://developer.android.com/reference/android/media/AudioRecord)

## R3. 연속 세션·시간 구간

**Decision:** 사용자 세션과 내부 오디오 조각을 분리한다. 초안은 30초 파일 조각과
실제 인식 결과 경계를 별도로 관리하고, 운영 값은 G1에서 고정한다.
**Rationale:** 긴 대화에서 주제별 재입력을 요구하지 않으면서 중단·업로드를 복구해야 한다.
기본 검증 포맷은 PCM WAV 16kHz/16bit/mono지만 공식 가이드의 같은 값은 예시이며 필수 지원값이 아니다.
EPD byte offset을 ms로 바로 사용하지 않는다. 실제 포맷·버퍼 기준이 검증돼야 변환 가능하다.
**Alternatives:** 파일 하나만 마지막에 저장하면 종료 실패 시 유실 범위가 크다.
음성 합성·재구성으로 원본을 대신하지 않는다.
**Gate:** 최종 결과 누적/구간 여부, 오프셋 리셋, 20분 입력의 연속성·용량,
발화 구간과 재생 오차를 검증한다. 단어별 시각이 없으면 검증된 발화 구간 단위로 연결한다.
[STT 이벤트](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/result-listeners)

## R4. 주차와 오디오 포커스

**Decision:** `ParkedStateProvider`와 플랫폼 UX restriction을 함께 적용한다. `UNKNOWN`은 사용 불가다.
**Rationale:** 공식 가이드는 CarUxRestrictionsManager를 제시하지만 제한 없음이 기어P 확정은 아니다.
공개 Brake 정보의 제동 페달 상태를 주차 상태로 해석하지 않는다.
**Alternatives:** 속도0·브레이크·일반 앱에 보장되지 않은 privileged API로 대신하지 않는다.
**Gate:** G2에서 허용된 실제 주차 신호를 확보하고 P→D·D속도0·연결 끊김을 검증한다.
음성 포커스 상실·통화·다른 음성 기능 호출에도 캡처·재생을 중단한다.
[주행 제약](https://document.pleos.ai/docs/pleos-only/vehicle-app-developer-guide/driving-restriction-development-guide) · [하드웨어 접근](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/platform-api-architecture) · [오디오 포커스](https://document.pleos.ai/docs/pleos-only/vehicle-app-developer-guide/audio-focus-development-guide/audio-focus-development)

## R5. 휴대폰과 서버

**Decision:** Next.js16 모바일 웹·Node API, 같은 TypeScript 도메인을 쓰는 독립 Node 작업자.
**Rationale:** 휴대폰의 첫 요구는 보관함 읽기·듣기·기기 관리다. 별도 설치·스토어 배포 없이 검증한다.
Node24는 Next 공식 최소20.9를 충족한다. 브라우저 음성·Range·탐색은 실제 기기로 확인한다.
**Alternatives:** 별도 iOS/Android 앱은 초기 구현량을 늘린다. 요청 안에서 생성 전체를 완료하는 방식은
네트워크 종료·재시도와 긴 입력에 취약하므로 durable job을 사용한다.
[Next 설치·지원](https://nextjs.org/docs/app/getting-started/installation)

## R6. Docker 기반 보관함·인증·미디어 — 사용자 결정으로 대체

**Decision:** Supabase 의존성을 제거한다. Docker Compose 단일 호스트에 웹/API·작업자·PostgreSQL18·Caddy를 둔다.
Better Auth를 웹 내부 라이브러리로 사용하고 인증 데이터를 Postgres에 저장한다.
음성은 `AudioStore`의 로컬 파일 adapter와 영속 볼륨에 보관하며 인증된 API로만 읽는다.
**Rationale:** 프로토타입에서는 직접 운영 가능한 작은 구성을 사용하고 이후 클라우드로 이전한다는 사용자 방향이다.
인증을 직접 새로 만들지 않고 기존 라이브러리의 이메일/비밀번호·검증·재설정·DB 세션을 사용한다.
라이브러리는 Next.js·Postgres·UUID와 DB 세션을 지원한다. 패치 버전은 구현 시 고정·검증한다.
**Alternatives:** Supabase 관리형/자체 호스팅, 별도 객체 저장 서버는 현재 채택하지 않는다.
원본 API·storage_key를 안정적으로 유지해 향후 객체 저장소를 추가한다. JWT만으로 보호자 세션을 대체하지 않는다.
**Gate:** 인증 캐시를 끈 DB 세션 검증·로그아웃·이메일 검증·재설정, 서로 다른 보관함의 접근 차단,
파일 Range·경로 탈출·디스크 부족·컨테이너 재생성·백업 복원·삭제 경합을 시험한다.
Compose 파일과 이미지가 현재 존재하거나 실행됐다는 뜻은 아니다.
[Docker 배포](https://docs.docker.com/compose/how-tos/production/) · [볼륨](https://docs.docker.com/engine/storage/volumes/) · [시작 순서](https://docs.docker.com/compose/how-tos/startup-order/)
[Better Auth Postgres](https://better-auth.com/docs/adapters/postgresql) · [Next 연동](https://better-auth.com/docs/integrations/next) · [인증](https://better-auth.com/docs/authentication/email-password)
[DB와 UUID](https://better-auth.com/docs/concepts/database) · [세션](https://better-auth.com/docs/concepts/session-management)

## R7. 자유 발화 정리

**Decision:** OpenAI Responses의 strict 구조화 출력, 초기 평가 후보 `gpt-5.6-terra`, `store:false`.
LLM에는 텍스트·선택된 발화자 ID·세션 날짜와 근거 ID만 전달한다. 원본 음성과 정밀 좌표는 보내지 않는다.
**Rationale:** 사건·날짜·정정·제외 내용을 구조로 받아 검토·재포함·근거 재생에 사용한다.
스키마 일치는 사실 충실도를 보장하지 않아 별도의 ID·범위·화자·의미 검증을 둔다.
**Alternatives:** 자유 문장만 출력하면 근거 연결이 어렵다. 모델은 평가로 교체할 수 있고 최초 후보를
최적·최저 비용이라고 주장하지 않는다. GPT-5 Mini 문서는 deprecated이므로 새 기본 후보에서 제외했다.
**Gate:** 계정 모델 접근, 한국어 반대 감정·정정·장기 맥락, 거절·잘린 출력·지연·비용을 G3에서 확인한다.
`store:false`는 공급자의 모든 보관이 없다는 뜻이 아니므로 수집 안내에는 실제 계정 데이터 정책을 반영한다.
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) · [모델](https://developers.openai.com/api/docs/models/gpt-5.6-terra) · [데이터 정책](https://developers.openai.com/api/docs/guides/your-data)

## R8. 충돌·삭제·복구

**Decision:** 서버 revision, 멱등 키, 내용 checksum, 삭제 tombstone, 기기별 반영 cursor.
삭제는 전체 이야기 세션 단위이며 초안에서 문장을 제외하는 동작과 구분한다.
**Rationale:** 한 원본에 여러 사건이 담기므로 카드 제외만으로 음성 일부가 삭제됐다고 말할 수 없다.
삭제 직후 접근을 막고 원본·텍스트를 제거하며 오프라인 기기는 재연결 시 먼저 삭제를 적용한다.
**Alternatives:** 저장 행만 지우면 미전송 기기가 기록을 다시 만들 수 있다.
**Gate:** 삭제/업로드/생성 작업의 경합과 해제된 기기의 재업로드를 검증한다.
이는 프로젝트 설계 결정이며 특정 서비스가 자동으로 제공한다고 가정하지 않는다.

## R9. 단일 호스트에서 클라우드로 이전

**Decision:** 첫 배포는 같은 Compose 구성을 실행할 수 있는 호스트를 사용한다.
Caddy에서 TLS를 종료하고 web으로 전달하며, DB·음성 볼륨을 외부에 직접 노출하지 않는다.
개발 메일은 Mailpit, 실제 사용자 메일은 별도 SMTP 설정으로 분리한다.
**Rationale:** 차량·휴대폰은 서로 다른 기기이므로 localhost를 공용 접속 주소로 사용할 수 없다.
공개 도메인은 인증서 발급 조건을 충족해야 하고 LAN 개발 CA는 각 기기에서 신뢰 설정이 필요하다.
외부 LLM을 호출하는 실제 생성에는 인터넷 연결이 필요하다.
**Migration:** 먼저 같은 이미지·설정을 VM에 배포하고, 필요하면 관리형 Postgres와 객체 저장소로 이전한다.
DB dump/restore, 파일 checksum manifest와 삭제 표식 대조, 원본 재생을 검증해야 한다.
인증 ID·보관함 ID·storage_key는 유지하며 무중단/자동 이전을 약속하지 않는다.
**Gate:** HTTPS 인증서·허용 origin·두 기기의 접근, DB 준비 상태·마이그레이션 실패 시 시작 차단,
DB와 파일의 일관된 백업·복원을 T039/T040에서 검증한다. 실제 이전 작업은 향후 배포 범위다.
[HTTPS](https://caddyserver.com/docs/automatic-https) · [Postgres RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

## R4 보충 — 2026-11-11 공식 정책 재확인

현재의 모든 녹음/읽기/재생을 P에서만 허용하는 정책은 이 프로젝트의 보수적인 MVP 결정이다. 모든 차량용 앱에 동일한 P 전용 동작이 강제된다고 일반화하지 않는다. 공식 [앱 카테고리](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/app-category)는 Music/Audio·Maps/Navigation·Mobility Services의 일부 주행 중 기능 예시를 제공한다. 오디오 콘텐츠 청취 허용이 장시간 대화 녹음 허용의 근거는 아니다.

[지역별 정책](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/driving-restiction-policy)은 DO 미선언 앱의 Parking 사용 가능/Drive 사용 불가를 설명한다. [개발 가이드](https://document.pleos.ai/docs/pleos-only/vehicle-app-developer-guide/driving-restriction-development-guide)는 DO 선언 앱도 CarUxRestrictions/ActiveRestrictions에 따라 기능별 제한을 구현해야 한다고 명시한다. 공개 문서에서 가족 일기 장시간 원본 녹음의 주행 중 허용을 명시적으로 확인하지 못했다. 주행 전 시작/주행 중 계속과 음성 명령 시작을 각각 플랫폼 카테고리/검수 대상으로 확인해야 하며, 이번 문의만으로 DO 선언이나 기존 gate 해제를 하지 않는다.

동기화5초 polling/P gate 연동은 현재 단일 프로세스 CloudSync와 검토/재생/파일 변경 충돌을 피하기 위한 프로토타입 구현 선택이다. 네트워크 수신 자체가 공식적으로 P 전용이라고 확인한 것이 아니다. [앱 구조 및 동작 모델](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/app-structure-screen-model)은 foreground 상태 복원, background 지속 통신의 실행/중단 조건, 불필요한 background timer/polling 최소화를 요구한다. 후속 서비스 설계 후보는 앱 시작/복귀/연결 복구 시 cursor 기반 증분 조회와 foreground 변경 알림(SSE/WebSocket), 알림 누락 시 재조회이며 차량-휴대폰 직접 전송이 아니라 기존 서버 경유를 유지한다.

## C021 검증된 구현 경로

2026-11-11 공개 Maven의 FusedLocation1.1.3/TextToSpeech3.3.1을 probe에 추가했다. 위치 permission은 dangerous이며 사용자별 runtime 허용이 필요하다. system user0 grant는 AAOS 사용자10의 앱 허용을 대신하지 않는다. 해당 사용자에 허용 후 실제 SDK available을 확인했다. 실패 상태에서 좌표를 보관하지 않고 30초 이내 시작 전 관측만 스냅샷으로 고정한다.

TTS는 initialize onSuccess 이후 listener를 등록하고 ko-KR(Locale.KOREA)을 설정해야 한다. ON_DEVICE로 onStart·내비 전환 후 유지·알림 stop을 확인했다. 앱 MediaPlayer와 동일한 서비스 수명으로 연결했으나 공식 TTS에는 앱측 gain 조절을 확인하지 못해 duck 시 중단한다. SDK 실행 성공과 원본 AudioRecord의 정책 허용은 별개다.

구현과 검증 세부는 docs/evidence/compose-runtime.md의 C021 및 docs/contest/README.md가 정본이다. 자동차 화자 프롬프트 v4는 준비만 했으며 모델 품질 증거를 추가하지 않았다. v3의 기존 실험을 v4에 전용하지 않는다.


## C026 화자 분리 검토 (2026-11-11)

현재 Pleos SpeechToText3.3.1 AAR의 ResultListener에는 text/completed, EPD on/off, RMS, started/ended, ready/error가 있고 화자 ID·단어별 speaker·좌석별 오디오 채널은 없다. 공개 문서도 화자 결과를 정의하지 않는다. 이것은 현재 사용 중 인터페이스의 지원 범위 확인이며 향후 OEM 비공개 기능까지 불가능하다는 주장은 아니다. 공모전 추가 제공 범위는 운영진 문의가 필요하지만 이번에 메일은 보내지 않았다.

자동 분리 후보는 서버에서 원본 WAV를 처리하는 pyannote `speaker-diarization-community-1`이다. 공식 모델 카드는 16kHz mono 입력, 화자별 시간 구간, 전사 시각과 결합하기 쉬운 exclusive diarization 및 모델을 받은 뒤 오프라인 실행을 지원한다고 설명한다. 모델 접근 조건 동의/HF 토큰과 별도 Python 실행 환경이 필요하다. 이번에는 다운로드·설치·실행·사용자 음성 전송을 하지 않았으므로 실제 차량 소음/아이 음성/처리시간 정확도는 미검증이다.

권장 후속: 원본을 보존하면서 익명 화자 A/B와 시간 구간을 먼저 추정하고, 주차 후 사용자가 가족 이름을 연결/수정한다. 자동 분리는 같은 목소리의 구간을 묶는 것이며 엄마/아빠/아이의 실명을 자동으로 알아내는 기능이 아니다. 두 사람이 겹쳐 말한 음성을 각자의 깨끗한 오디오로 분리하는 기능도 별개다. 하나의 STT 발언에 화자가 바뀌면 EPD 전체를 한 사람에게 지정하지 않고, 더 세밀한 전사 정렬이나 수동 검토가 필요하다. 텍스트 내용만으로 화자·감정·가족 관계를 LLM이 추정해 확정하지 않는다.

검토 결론: 현재 SDK만으로 자동 화자 분리는 미지원이다. 로컬 서버의 별도 음성 분석으로 익명 화자 구분은 기술적으로 가능하지만 실차 녹음 평가와 공모전 SDK/외부 처리 허용 확인 뒤 도입한다. 현 버전은 세션 참여자 표시와 실제 원문 구간만 제공한다.

근거: [Pleos STT 결과](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/result-listeners), [pyannote 공식 모델 카드](https://huggingface.co/pyannote/speaker-diarization-community-1). 로컬 확인: SpeechToText3.3.1 classes.jar의 `javap ai.pleos.playground.stt.listener.ResultListener`.
