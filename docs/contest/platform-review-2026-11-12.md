# 차곡 플랫폼 지원 범위 검토

확인일: 2026-11-12. 공개 문서, 현재 코드, 에뮬레이터 실행을 구분한다. 이 문서는 승인서가 아니다.

## 공모전 개발 범위

[개발 범위 공지](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000008)는 공개된 Vehicle/NaviHelper/STT/TTS/FusedLocation SDK 사용을 허용한다. 비공개 SDK·Pleos LLM SDK·Gleo 승인 신청은 공모전 범위가 아니다. 차량 음성을 외부 STT로 보내는 방식은 사용할 수 없다. 문서 미지원 기능은 향후 계획으로 구분해야 한다. 운영사무국은 접수·심사 문의를 받지만 개별 API 구현 방법은 지원하지 않는다. 메일만 보내면 미지원 기능의 예외 승인을 받는 절차가 있다고 해석하지 않는다.

## 현재 구현과의 비교

| 기능 | 공식 근거 / 판단 | 현재 코드와 준비 방향 |
|---|---|---|
| 차량 음성 인식 | [STT request/stop](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/start-and-stop)는 SDK의 마이크 인식 시작·종료를 문서화한다. | 현재 SpeechProbe는 ON_DEVICE SDK를 사용하지만 입력은 AudioRecord가 확보한 PCM이다. 공식 마이크 요청 경로와 같다고 설명하지 않는다. |
| 앱 소유 PCM 인식 | [sendAudio](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/sending-audio-data)는 앱이 보유한 PCM을 ON_DEVICE에서 인식하는 방법이다. | 합성 PCM·원본 재인식 시험 근거다. 차량 마이크 원본을 취득·영구 보관·클라우드 전송할 권한까지 입증하지 않는다. |
| 원본 보관·휴대폰 전송 | 검토한 공개 문서에서 이 전체 흐름의 명시적 지원 근거를 찾지 못했다. 외부 STT 금지와 일반 미디어 동기화는 별개다. | CaptureProbe→WAV→CloudSync는 에뮬레이터 시험 구현으로만 표시. 공식 지원이라고 확정하지 않는다. 제출 경로 확정 전 해결해야 할 핵심 불확실성이다. |
| 주행 중 음성 기록 | [공모전 개발 환경](https://appdevchallenge.auto-hmg.io/guide/development)에 STT 음성 메모 예시가 있다. [주행 규제](https://document.pleos.ai/docs/pleos-only/vehicle-app-developer-guide/driving-restriction-development-guide)는 CarUxRestrictions 및 DO에 따른 제한을 요구한다. | 모든 녹음을 P에서만 하라는 뜻은 아니다. 그러나 장시간 원본 녹음·백그라운드 유지까지 포괄 승인한 예시도 아니다. 현재 모의 P/D는 실차 허용 증거가 아니다. |
| TTS | 공개 TTS SDK는 공모전 사용 가능 SDK에 포함된다. | ON_DEVICE 재생·플레이리스트는 에뮬레이터 검증. 통화/내비 실제 음량 혼합·실차 정책은 별도다. |
| 녹음 위치 | [FusedLocation](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/FusedLocation/intro)은 지원 확인·권한·마지막 위치/업데이트를 제공한다. 마지막 위치는 null/오래된 값일 수 있다. | 녹음 직전30초 이내 관측만 사용한다. 목적지나 과거 사건 장소로 바꾸지 않는다. |
| 제조사·모델·연식 | [하드웨어 정책](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/platform-api-architecture)은 표준 플랫폼 API와 지원 확인을 요구한다. | 조회 가능한 필드만 기본값으로 제안한다. 에뮬레이터 모델명을 실제 소유 차량으로 주장하지 않는다. 차 번호/별명은 사용자 수정 가능. |
| 자동차 화자 일기 | 현재는 외부 LLM·Pleos LLM을 호출하지 않는다. | 본문은 `AI 생성 일기 목업 입니다.`. 생성 품질·자동 화자 구분은 완료 기능에 넣지 않는다. |

## 제출 경로를 결정할 때

1. 지원 근거를 못 찾은 원본 캡처·보관·전송 기능은 지금 상태로 “공식 지원 완료”라고 기재하지 않는다.
2. 공개 SDK의 request()/stop() 기반 텍스트 기록을 제출용 대안으로 검토할 수 있다. 다만 원본 음성 재청취는 이 경로만으로 충족되지 않으므로 제품 범위 결정이 필요하다. 이번 작업에서 기존 원본 기능을 삭제하거나 바꾸지 않았다.
3. 주행 기능을 제출용으로 제공하려면 공개 주행 제한 정책과 실제 CarUxRestrictions 연동을 충족하는 별도 빌드/시험이 필요하다. 임의 DO 선언으로 잠금을 해제하지 않는다.
4. 기획서에는 에뮬레이터 구현, 목업, 미확인 지원, 향후 계획을 나눠 쓴다. 작동 영상만으로 지원 정책을 입증하지 않는다.

## APK 현황

- `probeDebug`: 현재 전체 UI와 테스트 기능이 있는 에뮬레이터용 debug 앱. BuildConfig.DEBUG와 에뮬레이터 하드웨어 검사에 의존한다.
- `probeRelease`: Gradle에서 비활성화돼 있다.
- `pleosRelease`: 현재는 기능 확인/잠금 화면이며 전체 서비스를 구현한 release APK가 아니다. release 서명 구성도 없다.
- 따라서 어느 파일도 이름만 `release.apk`로 변경해 정상 제출용이라고 안내하지 않는다. [제출 체크리스트](submission-checklist.md)의 release 준비가 남아 있다.
