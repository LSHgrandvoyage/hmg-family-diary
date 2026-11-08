# Capture and Generation Contract

## Platform ports

- `ParkedStateProvider`: PARKED/NOT_PARKED/UNKNOWN + observation timestamp + source.
  확인한 주차 신호와 UX restriction이 모두 허용할 때만 CaptureCoordinator 활성화.
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
주차/포커스 상실 시 마이크·재생을 중단한다. 완료 조각은 남기고 미완료 tail은 별도 표시한다.

## Generation input

`schema_version`, `session_id`, `input_revision`, `recorded_at`, `timezone`,
`members[{id,display_name}]`, `utterances[{id,member_id,text,start_ms,end_ms}]`,
`user_place_corrections`, `user_group_corrections`를 전달한다.
원본 음성·정밀 좌표·실명 식별자는 필요 없으며 별칭·ID만 사용한다.
STT raw와 사용자 수정문이 함께 있으면 text에는 수정문을 사용하고 provenance는 그대로 보존한다.

입력 발화는 신뢰할 명령이 아닌 자료다. 정리 작업에 도구 호출·웹 검색·외부 행동을 부여하지 않는다.

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
