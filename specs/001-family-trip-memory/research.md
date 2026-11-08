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

## R6. 보관함·인증·미디어

**Decision:** Supabase Auth의 보호자 로그인, Postgres, private Storage.
휴대폰은 검증된 사용자 세션, 차량은 연결 절차에서 발급한 별도 폐기 가능한 기기 토큰을 사용한다.
서버가 보관함·삭제·기기 상태를 검사한 뒤 음성을 인증 프록시로 제공한다.
**Rationale:** Private bucket도 서명 URL을 외부에 내주면 만료 전 사용될 수 있다.
즉시 연결 해제와의 충돌을 피하려고 클라이언트에 직접 Storage URL·관리 키를 제공하지 않는다.
**Alternatives:** 공개 URL·공유 보호자 refresh token·차량 내 service key는 채택하지 않는다.
**Gate:** 두 보관함 간 접근 차단, URL 재사용, Range 요청, 해제 후 캐시 정리를 시험한다.
[인증](https://supabase.com/docs/guides/auth/quickstarts/nextjs) · [비밀번호 인증·로컬 메일](https://supabase.com/docs/guides/auth/passwords) · [private bucket](https://supabase.com/docs/guides/storage/buckets/fundamentals) · [다운로드](https://supabase.com/docs/guides/storage/serving/downloads)

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
