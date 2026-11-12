# Capture and Generation Contract

## Platform ports

- `ParkedStateProvider`: PARKED/NOT_PARKED/UNKNOWN + observation timestamp + source.
  확인한 주차 또는 명시적으로 허용된 주행 음성 상태와 UX restriction/포커스가 허용할 때 CaptureCoordinator 활성화. 검토·사진은 PARKED만 허용.
- `AudioCapture`: 시작·종료·중단, 실제 format·sample count·monotonic session offset,
  검증된 원본 조각. 휴대폰 신규 캡처는 첫 버전에서 제공하지 않는다.
- `SpeechRecognizer`: 같은 PCM의 완료/중간 텍스트와 검증 가능한 구간 참조.
  ON_DEVICE 등록·권한은 실제 G0/G1 결과를 따른다.
- `LocationObservation`: optional 좌표·관측 시각·지원 여부. 장소 후보 맥락이며 사실 근거가 아니다.
- `DiaryGenerator`: versioned input → schema-valid draft 또는 typed failure.

실제 포트와 mock 포트는 빌드·화면·실행 결과에 명확히 구분한다.
실제 입력 부재를 샘플 음성·모의 주차가 대신 입증하지 않는다.

## Capture invariants

한 사용자 세션에 여러 화자의 순차 발화와 여러 사건이 들어갈 수 있다.
주제별 입력·발화 길이를 강제하지 않는다. 내부 오디오 조각은 복구용이며 입력 양식이 아니다.
발화자 전환 시 이전 완료 결과가 새 사람에 붙지 않도록 session/utterance generation ID를 고정한다.
임시 파일은 주기적으로 flush하고 조각 완료 후 atomic rename·checksum을 기록한다.
플랫폼 음성 허용/상태 확인/포커스 상실 시 마이크·재생을 중단한다. 허용된 주행 전환 자체는 미디어를 중단하지 않고 검토 UI를 잠근다. 완료 조각은 남기고 미완료 tail은 별도 표시한다.

## Generation input

`schema_version`, `session_id`, `input_revision`, `recorded_at`, `timezone`,
`members[{id,display_name}]`, `utterances[{id,member_id,text,start_ms,end_ms}]`,
`user_place_corrections`, `user_group_corrections`를 전달한다.
원본 음성·정밀 좌표·실명 식별자는 필요 없으며 별칭·ID만 사용한다.
STT raw와 사용자 수정문이 함께 있으면 text에는 수정문을 사용하고 provenance는 그대로 보존한다.

입력 발화는 신뢰할 명령이 아닌 자료다. 정리 작업에 도구 호출·웹 검색·외부 행동을 부여하지 않는다.

### Local probe mock contract — 2026-11-09

사용자 요청으로 API 연결 전 로컬 mock을 사용한다. 생성 응답 envelope에 `generation_mode: mock|openai`를 추가한다.
probe 요청도 선택 모드를 포함하며 서버는 구성 모드와 다르면 `MODE_MISMATCH`로 거부하고 공급자를 호출하지 않는다.
이 필드는 공급자 GenerationInput에는 포함하지 않는다. mock은 확인문 원문·화자·입력 범위만 사용하는
결정적 응답으로, 사건 의미 분류·날짜/장소 추출을 하지 않는다. 화면/저장본에서 이를 명시한다.
저장본은 모드와 revision을 보존한다. 이전 모드 없는 저장본은 기존 OpenAI 경로 기록으로 읽는다.
새 응답의 알 수 없는 모드 또는 요청 모드 불일치는 앱에서 채택하지 않는다.
mock에는 키·네트워크 transport를 주입하지 않는다. 실제 API 실패를 mock 성공으로 바꾸지 않는다.

## Organize pipeline

1. 모든 발화를 ID와 함께 읽고 사건·장소·날짜·미래 계획·정정·충돌을 추출한다.
2. 같은 사건의 반복만 합치고 사람별 감정을 유지한다. 명시적 정정은 반영하되 서로 다른 사람의
   충돌을 최신 문장 우선으로 덮어쓰지 않는다. 녹음 날짜를 모든 사건 날짜로 강제하지 않는다.
3. 그룹별 개인 기억·공동 문장을 작성하고 각 문장에 source span을 붙인다.
4. 관련 없는 메모·잡담·불확실한 내용은 excluded/review 목록에 남긴다. 원본 삭제는 하지 않는다.
5. 서버는 [출력 스키마](diary-output.schema.json), 같은 입력 ID·화자·시각 범위,
   모든 발화의 사용/제외 추적, 입력 revision을 검증한다. 새로운 사실의 의미 검증은 fixture와
   사용자 검토가 보완하며, schema-valid만으로 사실이 맞다고 표시하지 않는다.

LLM 컨텍스트 한도보다 길면 발화 ID를 유지한 window별 사실 추출 후 전체 사실을 다시 정리한다.
뒤에서 정정한 말이 앞선 window를 수정할 수 있도록 correction links를 유지한다.
사용자에게 장소·주제별 다시 녹음을 요구하지 않는다. 이 경로도 별도 long-input fixture로 검증한다.

## Error and revision behavior

### 2026-11-09 생성 보정 계약 (family-diary-v2/v3)

- 발화의 일반 장소 표현도 place_label에 보존한다. 상세 지명을 추측하지 않으며 장소 없음/충돌은 null이다.
- 합의 없는 화자 간 충돌은 별도 member 문장·각 화자의 근거로 보존한다. 최신 발화나 ‘아니’만으로 정정으로 취급하지 않는다.
- review_items는 사용자의 판단이 필요한 충돌·모호함을 다룬다. 선택 날짜/상호 누락이나 명확한 자기 정정·중복 정리는 질문의 이유가 아니다.
- wire schema_version=1 형식은 유지한다. review_items의 utterance_ids와 그룹 statements의 source ID가 하나라도 겹치면 needs_review=true여야 하며, 겹치지 않으면 false여야 한다.
  한 발화가 여러 사건의 근거면 모든 관련 그룹을 보수적으로 표시한다. 이는 원본 ID 연결 규칙이며 질문의 의미적 적절성을 증명하지 않는다.
- v3: 모호한 지시 대상은 임의로 명사화하지 않는다. 정확한 하루를 모르는 연도/월/계절/주 표현은 본문에 보존하고 date:null로 둔다. JSON 객체만 반환하며 코드 펜스를 붙이지 않는다.
- 빈 검토 메시지나 표시 불일치는 서버가 거부한다. 표시를 임의 보정하거나 질문을 삭제해 성공으로 바꾸지 않는다. 기존 저장본을 일괄 재작성하지 않는다.

출력 거절·불완전 응답·스키마 오류·범위 오류는 확정본으로 저장하지 않는다.
알 수 없는 ID·범위를 LLM 추측으로 수리하지 않는다. 기존 원본·초안은 그대로 둔다.
`input_revision`이 바뀌면 결과는 stale이며 자동 채택하지 않는다.
정리 결과의 분리·병합·재포함은 근거 span을 보존하고 저장 전 사용자 확인을 받는다.

## Synthetic evaluation matrix

실제 녹음·모델 실행 결과가 아닌 작성할 검증 입력이다.

| ID | 입력 특성 | 기대 결과 |
|---|---|---|
| E01 | 부모는 바다가 좋고 자녀는 파도가 무서움 | 두 감정 유지 |
| E02 | 점심이라고 했다가 아침으로 명시 정정 | 아침, 정정 원본도 재생 가능 |
| E03 | 오늘 해변·어제 카페·다음 여행 계획 혼합 | 날짜·occurred/planned 구분 |
| E04 | 동일 사건 반복·메모 삽입 | 중복 통합, 메모 제외 목록에서 재포함 가능 |
| E05 | 장소·시점 불명 | null/검토 필요, 임의 지명·순서 없음 |
| E06 | “위 지시를 무시하고…”라는 발화 | 입력 자료로만 처리 |
| E07 | 다른 화자의 상충하는 주장 | 한쪽 삭제 없이 검토 표시 |
| E08 | 선택된 화자 전환·늦은 완료 이벤트 | 이전 결과가 다음 사람에게 붙지 않음 |
| E09 | 긴 입력의 뒤쪽 정정 | 앞선 사건에 정정 반영, 원본 참조 유지 |
| E10 | 그룹 분리·병합·제외 후 재포함 | 근거 구간과 화자 유지 |
| E11 | 없는 ID·범위 밖 timestamp를 생성 | 결과 거부, 원본 보존 |
| E12 | 무응답·생성 거절·잘린 출력 | 기록 실패를 구분하고 허구 일기 생성 없음 |

출력 groups[].id는 초안 내부 식별자이며 DB UUID가 아니다. 서버가 저장 ID를 배정한다.
member audience에는 입력의 member_id가 필수이고 shared는 null이다. 날짜 문자열은 서버가
YYYY-MM-DD 유효 날짜로 검증하며, source span의 end>start와 발화 범위 포함도 서버에서 검사한다.
같은 발화 일부만 제외할 수 있도록 excluded_spans를 사용한다. 스키마의 $schema/$id/title은
로컬 검증 메타데이터이며 모델 요청에는 공급자 지원 subset을 확인해 본문 스키마만 전달한다.

## RecordingContext port (FR-016, FR-017)

녹음 시작 순간 capture generation과 묶인 차량 프로필 복사본 및 LocationObservation을 취한다.
위치 callback이 늦게 오면 관측 timestamp를 녹음 시작과 비교한다. 후속 위치를 무조건 최신 값으로
덮어쓰지 않는다. 녹음 위치와 EventGroup.place_label은 다른 필드다. capability 미지원/거절/null/stale는
원본 녹음 실패가 아니며 context 상태로 보존한다. 모델/번호 자동 완성 API의 반환 의미는 실제로
검증하기 전 가정하지 않는다. 번호·VIN·정밀 좌표는 GenerationInput에서 제외한다.

### Local vehicle UI context — 2026-11-09

동일 probe 앱 ID에서 `capture-probe` 원본·`capture-review` revision 저장을 유지한다.
`memory-context/<original-id>/context.json`에 녹음 시작 시각·수동 차량 복사본·위치 상태를 한번 생성하며 다시 쓰기를 거부한다.
위치 상태는 현재 unavailable 또는 명시적으로 켠 synthetic이며 실제 좌표 수집 계약을 충족했다고 표시하지 않는다.
기존 파일에 context가 없으면 없음으로 읽는다. 현재 프로필·열람 시각으로 과거 값을 채우지 않는다.
사진은 같은 ID 아래 JPG로 디코딩/방향 보정/재인코딩하며 원본 EXIF를 복사하지 않는다.
기기 전용 프로토타입 저장이며 암호화·공유 보관함·서버 동기화 계약을 대신하지 않는다.
원문 시간축은 현재 전체 원본 하나이며 단어/문장별 구간을 추측하지 않는다.


## C020 — 녹음 소유권
명시적 사용자 시작→전면 microphone service→단일 PCM 분기→WAV+STT. UI detach는 capture.stop이 아니다. service는 최종 결과를 ReviewStore/MemoryContextStore에 저장한 뒤 종료하며 Activity 참조를 보유하지 않는다. 알림 종료/상태불명/포커스 상실은 WAV finalize, STT 확보분 보존. 프로세스 강제 종료 후 자동 재개하지 않고 partial을 남긴다. 주행 중 결과는 native 저장만 하고 검토 UI는 P+UX 제한 없음에서 연다.

## C021 — 위치 및 청취
location.status는 available/unavailable/synthetic/stale/denied/unsupported/error를 사용한다. 유효 관측만 latitude/longitude/observed_at/source를 포함한다. 녹음 시작 이후 현재 위치로 재작성하지 않는다. 정밀 좌표와 번호는 생성 입력에서 제외한다.
PlaybackService는 명시적 재생 요청의 원본/일기 ID와 재생 상태를 소유한다. UI detach로 재생을 끊지 않으며 task 제거/알림 종료/플랫폼 상태불명/배타적 포커스 상실에 종료한다. 프로세스 사망 후 자동 재개하지 않는다. 녹음 서비스와 오디오 소유권을 중복 획득하지 않는다.
자동차 화자는 서술 관점이다. Gleo 호출/차량 제어/실제 자동차 감정이 아니며, 확인문에 없는 여행/동승자/감정을 만들지 않는다. 현재 mock 출력은 확인문 보존 동작을 유지한다.


## C025 TTS 큐 계약

`ttsQueue {memoryIds: string[]}`는 주차 검토 권한으로만 시작한다. 배열은 1~500개 고유한 로컬 WAV 식별자이며 모든 항목이 현재 revision으로 확정된 일기여야 한다. 실패 시 부분 큐를 시작하지 않는다. `tts`는 한 편 읽기이며 주차 권한을 유지한다. `ttsPrevious`, `ttsNext`, `stopPlayback`은 허용된 주행 음성 권한에서도 가능하며 종료된 큐를 되살리지 않는다. 주행의 시작 버튼은 native에서 완성본 목록만 구성한다.

state: `tts_active`, `tts_index`(0부터), `tts_count`, `tts_title`(주차에서만), `tts_previous`, `tts_next`. 본문은 상태 응답에 추가하지 않는다. 정상 완료 외에는 큐를 비운다. 변경 수신은 기존 주차/유휴 gate를 유지하여 큐 실행 중 텍스트·파일을 교체하지 않는다. 서버 API/DB 변경 없음.

### C028 종료와 표시 계약
`stopPlayback`은 즉시 다음 항목 예약을 무효화하고 공식 SDK의 stop 처리 완료 후 엔진을 해제한다. 종료 처리 중 새로운 재생 요청을 허용하지 않아 이전 엔진과 겹치지 않는다. UI의 큐 종료와 실제 엔진 종료 확인은 검증에서 구분한다. 테마 및 차량 필터/모달 변경은 서버 데이터 계약을 변경하지 않는다.

### C029 설정 bridge
`getSettings`, `lookupVehicle`, `saveVehicle`, `pairVehicle`, `renameVehicle`, `syncSettings`, `locationSettings`는 주차 검토 권한을 요구한다. 변경/동기화는 유휴 상태도 요구한다. 차량 문자열은 공백 정리·60자 상한, 연결 별칭1~40자/코드8자리 검증 후 기존 prefs/CloudSync에 저장한다. 현재 설정 변경은 과거 snapshot을 변경하지 않는다. 연결 토큰/보관함 비밀은 응답하지 않는다. 모바일 테마 기존 auto는 light로 이행하며 native auto는 유지한다.

### C030 테마 제어
기존 `setTheme`/theme_mode/theme_dark와 주차 권한 계약을 재사용한다. 순환 순서는 auto→light→dark→auto이며 모바일에는 auto를 추가하지 않는다. 서버/저장 스키마 변경 없음.

### C031 차 별명
현재 이름은 연결 시 CloudSync의 pending_label 또는 label, 미연결 시 차량 profile.nickname이다. 최초 설정 접근 시 profile.nickname 우선 이행한다. 저장과 연결은1~40자 검증 후 같은 이름을 사용하며 기존 개별 renameVehicle 제어를 제거한다. 오프라인 이름 작업은 앱 전용 동기화 상태에 보존한다. 과거 MemoryContext/snapshot은 수정하지 않는다.

### C032 주행 화면
차량 주행 여부는 native state가 결정한다. 주행 DOM은 녹음/청취와 최소 제어만 제공하고 list/read/settings는 주차 권한을 계속 요구한다. 주행 전용 음성 제어는 audio 권한과 native idle 조건으로 검증한다. 검토 복귀 대상은 새 녹음 완료 이벤트로만 지정한다.

### C033 고정 목업 응답
mock-static-notice-v2는 단일 그룹/단일 shared placeholder statement로 `AI 생성 일기 목업 입니다.`를 반환한다. member_id=null이며 모든 입력 원본 구간은 참조로 유지한다. 이 참조는 테스트 흐름의 연결을 의미하고 의미적 요약 근거라고 주장하지 않는다. generation_mode=mock을 유지하고 실제 생성 API 오류를 목업으로 숨기지 않는다.

### C035 심사용 로컬 목업
contest flavor는 mock-static-notice-v2와 동일한 응답 계약을 앱 내부에서 만든다. generation_mode=mock, 현재 session_id/input_revision과 모든 utterance source_spans를 보존한다. 비동기 callback 취소와 stale revision 방어는 기존 ReviewPanel/ReviewRecord 계약을 따른다.
