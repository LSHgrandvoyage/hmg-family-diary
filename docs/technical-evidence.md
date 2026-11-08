# 구현 전 확인할 기술 근거

2026-11-08 · 문서 확인과 실제 실행을 구분한다. 현재 아래 항목의 실제 SDK 실행 결과는 없다.

| 항목 | 공식 문서에서 확인한 사실 | 아직 확인하지 못한 것 |
|---|---|---|
| [STT 시작·종료](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/start-and-stop) | `request()`가 차량 마이크 인식을 시작 | 계정·환경 접근, 뒷좌석 음성 품질, 원본 녹음 확보 |
| [STT 결과 이벤트](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/result-listeners) | 완료 텍스트·음성 구간·입력 크기 콜백 | 확인한 리스너에는 원본 음성 출력과 화자 ID가 보이지 않음 |
| [오디오 입력](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/sending-audio-data) | 앱이 가진 PCM을 ON_DEVICE 인식에 전달 | 앱이 차량에서 녹음 파일을 만들 권한·경로·동작을 확보하는 방법 |
| [SDK 신청](https://document.pleos.ai/docs/pleos-only/create-my-project) | 일부 SDK 준비 중 표시 | 상세 가이드와의 상태 차이, 실제 계정에서의 사용 가능 범위 |
| [FusedLocation](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/FusedLocation/intro) | 위치 관측·지원 여부·권한 안내 | 실제 좌표 품질·관측 최신성 |
| [Vehicle SDK](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/Vehicle/intro) | 차량 상태 SDK 안내 | 안전하게 주차로 판정할 실제 필드·지원 환경 |

## 첫 기술 검증의 통과 기준

1. 한 발화에 대해 실제 녹음 파일과 인식 텍스트를 얻는다.
2. 두 결과가 같은 발화에서 왔음을 식별자로 연결한다. 미리 녹음한 자료를 쓰는 경우 표시한다.
3. 저장한 실제 녹음을 재생하고, 두 번째 기기에서도 같은 자료를 읽고 듣는다.
4. 녹음 중 출발·권한 상실·통신 단절 때 무엇이 보존되는지 확인한다.
5. 다른 보관함·해제된 기기에서는 새 기록을 읽을 수 없고,
   삭제된 기록이 오프라인 기기의 재접속으로 되살아나지 않는지 검증한다.

가능한 접근은 ‘앱이 녹음한 음성을 보관하면서 인식에 전달’하는 방식이다.
이는 아직 검증한 구현안이 아니다. STT와 별도 녹음을 동시에 실행할 수 있다고 가정하지 않는다.
일기 원본은 사용자가 말한 실제 음성으로만 인정한다. 음성 합성은 원본 재생의 대체 증거가 아니다.

## 자유 발화 추가에 따른 검증

- 여러 사건·장소·날짜와 반복·정정이 섞인 음성을 하나의 기록 세션으로 유지한다.
- SDK 인식 종료·침묵·분할 제한을 조사한다. 내부 처리가 여러 구간이어도 사용자에게 주제별 재입력을 요구하지 않는다.
- 발화자·세션·원본 시간 구간·인식문을 연결하고 정리된 기억에서 관련 구간을 재생한다.
  인식 결과가 시간 정보를 제공하는지는 미확인이다. byte offset을 곧바로 시간으로 간주하지 않는다.
- 입력 길이가 늘어날 때 정정·시점·발화자가 구간 경계에서 유실되지 않는지 검증한다.
- 녹음 길이·용량의 운영 한도는 검증 후 정하며 무제한 녹음을 약속하지 않는다.
- 중복·군더더기 제거와 사실·감정의 삭제를 구분해 원본 대비 누락·왜곡을 평가한다.

## 구현 계획에 반영한 결정과 후속 검증

- 차량 앱의 실제 실행 환경·권한, 녹음·STT·주차 상태 연결 방식.
- 휴대폰 표면의 형태, 보호자 보관함 인증·차량 연결·연결 해제.
- 음성·텍스트 보관, 전송 재시도·부분 성공·삭제·오프라인 기기 처리.
- 일기 생성 공급자와 한국어 충실도·지연·비용.
- 목소리·텍스트·정밀 위치의 전송·보관 기간 및 제품 내 안내.

현재 설계 결정은 [research](../specs/001-family-trip-memory/research.md), [plan](../specs/001-family-trip-memory/plan.md), [tasks](../specs/001-family-trip-memory/tasks.md)에 반영했다. 실제 플랫폼 통과 여부는 여전히 미검증이다.

이 목록은 기능을 보류한다는 뜻이 아니다. 원본 음성과 양쪽 기기 재생은 요구사항이며,
구현 가능성의 증거를 확보한 뒤 기술 계획과 작업을 작성한다.
