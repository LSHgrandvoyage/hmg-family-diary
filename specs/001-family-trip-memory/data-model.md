# Data Model

> 현재 상태(2026-11-13): 현재 서버 물리 모델은 `db/migrations/`의 vaults/devices/pairings/memories(snapshot)/photos/changes/requests/purge_jobs와 인증 스키마다. 차량 로컬은 ReviewStore·MemoryContextStore·SyncOutbox를 사용한다. 아래 정규화 엔터티/청크 모델은 초기 목표 설계이며 현재 DB 전체 구현을 뜻하지 않는다. 003 명세와 HTTP 계약의 실제 snapshot 전송을 우선한다.

초기 논리 목표 모델의 상세는 다음과 같다.
공통 ID는 UUID, 시각은 UTC ISO8601이며 사건의 해석에는 세션의 IANA timezone을 함께 사용한다.
모든 보관 데이터는 `vault_id`로 격리한다. 서버는 요청 본문의 vault_id 대신 인증 주체의 보관함을 사용한다.

## Authentication boundary

인증은 Better Auth의 User/Account/AuthSession/Verification 모델을 `auth` 스키마에서 관리한다.
이 표기의 AuthSession은 이야기 `Session`과 다르다. auth user ID는 UUID로 생성하도록 설정하고,
`Vault.owner_user_id`가 이를 참조한다. 인증 테이블의 물리 구조는 고정된 라이브러리 버전에서 생성한
SQL을 검토해 `db/migrations/0001_auth.sql`로 관리한다. 비밀번호 hash·인증 토큰은 로그에 남기지 않는다.
기록 삭제는 인증 계정 삭제와 구분한다. 계정·비밀번호 구현을 자체 암호화 규칙으로 대체하지 않는다.

## Entities and constraints

| 모델 | 핵심 필드 | 불변식·검증 |
|---|---|---|
| Vault | id, owner_user_id, created_at | owner_user_id unique + AuthUser FK; 보호자1명 |
| Device | id, vault_id, token_hash, expires_at, revoked_at, last_seen_cursor, purge_ack_at | token은 원문 저장 금지; 발급 후30일 만료·재연결 필요; 보관함별 활성 차량1대; 폐기된 ID 재활성화 금지 |
| Pairing | id, secret_hash, user_code_hash, expires_at, attempts, approved_owner_id, consumed_at | 5분 만료·한 번 교환·코드 확인 최대5회; IP/기기 속도 제한 |
| Member | id, vault_id, display_name | 이름 1~40자; 음성 신원·개별 계정 없음 |
| Session | id(client-generated), vault_id, device_id, recorded_at, timezone, title, revision, state, deleted_at | title 1~120자; timezone 유효 IANA; 삭제 ID의 재생성 금지 |
| AudioChunk | id, session_id, sequence, start_ms, duration_ms, format, sha256, bytes, storage_key, upload_state | sequence≥0; duration_ms>0; bytes>0; sha256 64자리 hex; (session_id,sequence) unique; 확정 후 불변 |
| Utterance | id, session_id, member_id, start_ms, end_ms, transcript_raw, transcript_edited, transcript_revision, status | 0≤start_ms<end_ms; 같은 session/vault의 member·audio 구간만 연결; 원문 불변 |
| SourceSpan | utterance_id, start_ms, end_ms | utterance 구간 안에 포함; 여러 audio chunk와 겹칠 수 있음 |
| EventGroup | id, session_id, label, place_label?, date?, time_relation, review_state | label1~120자; 날짜·장소는 모르면 null; time_relation=occurred/planned/unclear |
| DiaryVersion | id, session_id, input_revision, version, status, output, model, prompt_version, confirmed_at | input_revision 일치할 때만 초안 승격; 사용자 확정 버전 자동 덮어쓰기 금지 |
| Job | id, session_id, input_revision, kind, state, attempts, lease_until, error_code | kind=generate/purge; state=queued/running/succeeded/failed/cancelled; 동시 실행 lease; 최대3회 재시도 |
| Change | vault_id, cursor, entity_id, kind, revision, created_at | cursor 단조 증가; snapshot과 cursor 원자적 일관성 |
| Tombstone | vault_id, session_id, deletion_revision, deleted_at, server_purged_at | 비내용 삭제 표식. 확인되지 않은 기기가 있어도 재생성 방지 |
| DevicePurgeAck | device_id, entity_id, revision, acknowledged_at | 해당 기기의 삭제 완료 증거; 서버 삭제와 구분 |
| Idempotency | principal_id, operation, key, body_hash, result_id | 같은 key+body는 같은 결과; 다른 body면409; 폐기/삭제 상태는 재조회 |

원본 포맷의 실제 샘플레이트·채널·sample width는 AudioChunk.format에 기록한다.
G1에서 포맷·인식 시간축을 검증하기 전에는 EPD offset으로 SourceSpan을 확정하지 않는다.

## Relationships

Vault → Members / Devices / Sessions. Session → AudioChunks / Utterances / EventGroups /
DiaryVersions / Jobs. EventGroup의 문장·사람별 기억은 SourceSpan을 참조한다.
한 문장은 떨어진 여러 SourceSpan을 가질 수 있고 한 발화는 여러 사건에 기여할 수 있다.
이 관계는 초안 분리·병합 후에도 유지한다. LLM이 만든 ID가 DB 객체를 새로 소유하거나 접근 권한을 바꾸지 않는다.

## State transitions

- Session: `recording → captured → organizing → draft → confirmed`; 실패는 기록을 삭제하지 않고
  별도 오류 상태·재시도 표시를 남긴다. `deleted`는 최종 상태다.
- Local capture: `active → interrupted/ended`; 주차 상실·focus loss는 interrupted,
  완료 조각만 보존하고 미완료 tail은 실패로 표시한다. 자동 재개하지 않는다.
- Chunk: `local → uploading → verified`; 전송 실패는 local/outbox 유지.
  서버 검증 전에는 다른 기기에서 준비됐다고 표시하지 않는다.
- Diary: `draft → confirmed`; 편집·재생성은 새 버전. 새 입력이 오면 이전 생성 결과는 stale로 표시한다.
- Delete: `requested → server_purged → devices_pending/complete`.
  requested를 기록한 트랜잭션부터 읽기·쓰기·생성 결과 반영을 막는다.

## Sync, identity and conflicts

1. 새로 연결된 기기는 보관함 snapshot과 cursor를 받는다. 재연결 기기는 변경 목록을 먼저 받아
   tombstone·revocation을 적용한 뒤 outbox를 보낸다. 서버도 매 쓰기에 삭제 여부를 검사한다.
2. 원본 파일은 UUID+sequence+checksum으로 멱등 전송한다. 같은 ID에 다른 바이트를 덮어쓰지 않는다.
3. 편집은 expected_revision을 보내고 충돌 시409와 현재 revision을 돌려준다. 마지막 요청 우선 덮어쓰기 없음.
4. generation job은 입력 revision을 고정한다. 끝났을 때 원본 세션의 삭제/수정 여부를 다시 검사한다.
5. 기기 token 폐기 후에는 인증 실패와 함께 purge_required 응답을 제공할 수 있지만
   기존 기기의 음성이 원격에서 즉시 물리 삭제됐다고 말하지 않는다. 다음 연결에서 앱이 지우고 ack한다.
6. 삭제 후 동일 ID 쓰기는410. 세션의 모든 일기 버전·발화·음성을 함께 지운다.
   감사용으로 본문·음성을 보존하지 않는다. tombstone에는 ID·revision만 남는다.

## Retention baseline for implementation

확정 기록·원본은 보호자의 삭제까지 보관한다. 실험용 기본 한도는 G1에서 확정하고 UI에 표시한다.
확정 전 임시 녹음도 조용히 만료시키지 않고 사용자가 삭제할 수 있게 한다.
삭제 시 서비스 접근은 즉시 차단하고 서버 객체 정리는 재시도 작업으로 실행한다(정상 운영 목표24시간 이내).
기기별 오프라인 사본과 실패한 정리는 삭제 대기로 표시한다.
백업 복원 시 tombstone을 먼저 재적용한다. 운영 저장·백업 서비스의 실제 보존 설정은
실제 사용자 자료 수집 전에 기록하고 안내한다. 개발 단계는 합성 데이터만 사용한다.

## Physical persistence boundary

PostgreSQL은 인증·도메인·작업을 같은 DB의 분리된 스키마에 보관한다.
앱별 DB 역할과 RLS 컨텍스트, 인증/작업 획득의 제한된 경로는 [실행 계약](contracts/runtime-and-storage.md)을 따른다.
`storage_key`는 서버가 만든 논리 키이며 호스트 절대 경로나 URL이 아니다. 초기에는
비공개 `audio_data` 볼륨의 파일로 해석하고 이후 객체 저장소로 옮겨도 키·checksum·근거 구간을 유지한다.
파일 확정과 DB 갱신은 하나의 원자적 트랜잭션이 아니므로 임시 파일·누락·고아 파일·삭제 경합을 복구한다.

## Recording context extension (FR-016, FR-017)

- VehicleProfile: id, vault_id, nickname, manufacturer?, model?, body_type?, model_year?, registration_number?, revision, source. 번호는 선택이며 빈 값을 추정하지 않는다. Device와 차량의 정체성은 분리한다.
- SessionContext: session_id(unique), captured_at(녹음 시작), vehicle_id?, vehicle_snapshot(JSON), recording_location(JSON), context_revision. 차량 필드는 프로필 참조만 보관하지 않고 값도 복사한다. profile 수정/차 교체가 과거 snapshot에 전파되지 않는다.
- RecordingLocation: status=available/omitted/denied/unsupported/unavailable/stale, source=vehicle_sdk/user/demo, observed_at?, label?, resolution?. available만 장소를 표시한다. 원본 SDK 시각·신뢰도 단위는 adapter에서 확인하고 정규화한다. 장소명은 별도 변환/사용자 확인이 필요하며 좌표만으로 상호명을 단정하지 않는다.
- 초기 최신성 정책: 녹음 시작보다 120초 초과 이전의 관측, 5초 초과 미래, 유효하지 않은 시각은 stale로 취급한다. 이는 앱의 초기 기준이며 SDK 보장이나 검증된 정확도 기준이 아니다. G5에서 실제 위치 갱신 주기로 조정한다.
- 좌표가 필요하면 기존 비공개 보관함 경계 안에서만 취급한다. 웹 fixture는 좌표 없이 가상 장소명만 가진다. 생성 입력에는 번호/VIN/정밀 좌표를 추가하지 않는다.
- 세션 삭제는 context/번호/장소 사본도 함께 삭제한다. 기록별 명시 수정은 expected_revision으로 새 context_revision을 만들며 차량 프로필 전역 수정과 구분한다.

## Photos and nearby recall (FR-018, FR-019)

Photo: id, vault_id, session_id, storage_key, content_type, bytes, width, height, created_at, state, deleted_at. 프로필/일기와 동일 vault 검증. 원본 파일명/EXIF 좌표를 장소 추정에 사용하지 않는다. 사용자 선택 이미지의 정규화 사본만 보관한다. PhotoStore는 AudioStore와 별도 인터페이스로 로컬 비공개 파일 adapter부터 구현한다.

미리 보기 Photo: id, recordId, blob, createdAt. IndexedDB에서 recordId index로 격리한다. 서버 인증/가족 권한 구현을 대체하지 않는다. 브라우저 데이터 삭제/저장소 정리 시 사진이 사라질 수 있음을 안내한다.

RecordingLocation.available에 latitude?/longitude?를 추가한다. 유효한 좌표 쌍만 근접 검색에 사용하며 이름으로 좌표를 추측하지 않는다. recording_context의 스냅샷·최신성·삭제 규칙은 유지한다. 회상 후보는 동일 vault, 비삭제, captured_at < 기준 녹음 시각, 반경300m, 최신순 최대3개. 추천 근거는 ‘근처’이며 동일 시설/동일 방문을 확정하지 않는다.
