# 공개 플랫폼 지원 범위 재검토

확인일: **2026-11-15**. 현재 제출 APK0.2.13은 에뮬레이터 프로토타입이다. 문서 확인, 코드 구현, 에뮬레이터 실행과 공식 허용 여부를 구분한다.

## 공식 안내에서 확인한 내용

- [개발 범위 공지](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000008): 공개 문서의 SDK/API 범위에서 개발하며 미지원 기능은 향후 계획으로 구분한다. Vehicle/NaviHelper/STT/TTS/FusedLocation은 공개 문서에 따라 사용 가능하다. 공개되지 않은 SDK와 Pleos LLM SDK는 제공하지 않는다.
- 같은 공지는 **Gleo Interface(App Schema)를 별도 검토·승인 없이 사용 가능**하다고 명시한다. 과거 검토 문서의 표현보다 이 최신 확인을 우선한다. 차곡차곡은 현재 Gleo로 녹음을 시작하는 기능을 구현하지 않았다.
- 차량 마이크 음성을 외부 STT로 보내는 방식은 지원하지 않는다. 차곡차곡은 외부 STT를 호출하지 않고 Pleos ON_DEVICE를 사용한다.
- 1차는 기획서만으로 지원 가능하고 개발 산출물은 선택이다. 2차는 에뮬레이터 시연이며 실차가 필수는 아니다. 공모전 심사와 Pleos App Market 입점 심사는 구분된다.
- 운영사무국은 개별 API의 구현·동작을 별도로 기술 지원하지 않는다. 미지원 기능을 메일로 예외 승인받는 절차가 있다고 가정하지 않는다.

## 원본 음성 경로의 남은 불확실성

[STT sendAudio 문서](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/sending-audio-data)는 앱이 보유한 PCM을 ON_DEVICE에 전달하는 API다. [리스너 문서](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/result-listeners)는 텍스트·음성 구간·입력 크기 등 콜백을 설명한다. 이 문서들만으로 차량 마이크의 원본 취득·장기 저장·휴대폰 전송까지 허용된다고 해석하지 않는다.

현재 앱은 Android AudioRecord로 PCM을 취득하고 WAV로 보관하여 원본 재생·가족 보관함 동기화에 사용한다. 공개 문서 재검색에서도 **이 전체 경로의 명시적 지원 근거를 확인하지 못했다**. 이는 금지 확정도, 허용 확인도 아니다. 외부 STT 금지와 일반 미디어 보관·전송은 서로 다른 판단 대상이다.

따라서 이 구현을 에뮬레이터에서 동작하는 프로토타입으로 공개하되 공식 지원 완료/공모전 적합성 확인 완료라고 표시하지 않는다. 고지 자체가 적합성을 확보하는 것도 아니다. 공식 지원을 확정할 수 없을 때는 SDK request/stop 기반 텍스트 기록과 원본 보관을 분리하는 대안을 검토해야 하며, 이번 제출 문서 정리에서 제품 핵심 기능을 임의 삭제하지 않았다.

## 주행 화면과 하드웨어

[주행 규제 가이드](https://document.pleos.ai/docs/pleos-only/vehicle-app-developer-guide/driving-restriction-development-guide)는 CarUxRestrictions와 ActiveRestrictions에 따른 기능 제한을 요구한다. [하드웨어 정책](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/platform-api-architecture)은 표준 플랫폼 API·지원 확인을 요구한다.

차곡차곡의 시험 P/D, 최근 인식문2줄, 현재 낭독 문장 주변, 백그라운드 오디오는 에뮬레이터 구현/검증 범위다. 실제 차량·지역별 주행 정책, DO 적합성, 실차 마이크·통화·내비 혼합 음량, 마켓 입점을 검증한 결과가 아니다. 공모전에 실차 시연이 불필요하다는 사실과 앱의 모든 기능이 공식 허용된다는 판단은 다르다.

## 제출 문서에 사용하는 표현

| 구분 | 현재 상태 |
|---|---|
| 공식 SDK | STT/TTS3.3.1, FusedLocation1.1.3 사용 |
| 실행 구현 | 에뮬레이터 녹음·인식·원본/TTS·사진·로컬 HTTPS 동기화 |
| AI 생성 | `AI 생성 일기 목업 입니다.` 고정 목업 |
| 자동 화자 식별 / 자동차 화자 LLM | 향후 계획 |
| 원본 음성 전체 경로 공식 지원 | 미확인, 남은 적합성 검토 |
| 실차·마켓 승인 | 미검증 |

이 문서는 공개 문서 재검토 기록이며, 운영사무국이나 플랫폼의 승인서가 아니다. 별도 문의 발송·답변 수신을 수행했다고 주장하지 않는다.
