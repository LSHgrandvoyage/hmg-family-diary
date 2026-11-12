# HTTP Contract v1

> 현재 상태(2026-11-13): 현재 실행 API는 `apps/web/src/server/`의 라우팅/handler와 이 문서의 Local prototype/C023 이후 계약을 따른다. 앞부분의 일반화 청크/발화·생성 job API는 초기 목표이며 전부 구현된 endpoint가 아니다. 현재 연결 코드는 C037의6자리이고 자동 전송은 C023·C038이 정본이다.

기준 경로 `/api/v1`. JSON UTF-8. 구현 여부는 위 범위 구분을 따른다.
휴대폰: 보호자 인증 세션 쿠키 + 변경 요청의 Origin/CSRF 검증.
차량: `Authorization: Bearer <opaque-device-token>`. 서버에 hash만 저장하고 매 요청 활성 여부 확인. 차량 token은 발급 후30일 만료이며 최초 버전은
자동 연장 없이 보호자와 재연결한다. 차량은 로컬 만료도 검사하고 만료 시 보관함 사용을 잠근다.
보호자 가입·로그인·로그아웃·이메일 검증·비밀번호 재설정은 웹 내부 Better Auth의 `/api/auth/*`를 사용한다.
Postgres DB 세션을 매 요청 검증하고 cookieCache를 끈다. 쿠키는 HttpOnly·Secure·SameSite=Lax,
웹의 HTTPS origin과 trustedOrigins를 명시하며 CSRF 검증을 비활성화하지 않는다.
이메일 검증을 요구하고 로컬 합성 계정 메일은 Mailpit, 실제 메일은 SMTP로 보낸다.
비밀번호 재설정 완료 시 기존 보호자 세션을 모두 폐기한다. 차량 토큰 해제는 별도 연결 관리 동작이다.
인증 수명·DB 역할·메일 경계는 [실행 계약](runtime-and-storage.md)을 따른다.
모든 데이터 조회는 인증 주체의 vault 범위로 제한한다. UUID를 알아도 타 보관함 자료는404다.

## Common rules

- 일반 쓰기 요청은 `Idempotency-Key`(UUID)를 요구한다. key와 본문 hash가 다르면409.
  일회성 비밀 발급인 pairing 생성/교환은 예외다. 소비된 교환은410이며 응답 유실 시
  보호자가 기존 연결을 해제하고 새 pairing을 시작한다. 원문 token을 응답 재생용으로 저장하지 않는다.
- 편집은 `expected_revision`을 요구한다. stale이면409 `REVISION_CONFLICT`.
- 오류: `{error:{code,message,retryable},request_id}`. 민감한 원문·토큰은 오류에 담지 않는다.
- 401 인증 실패, 403 허용되지 않은 동작, 404 없음/타 보관함, 409 충돌,
  410 삭제·소비된 객체, 413 입력 한도, 422 검증 실패, 429 제한, 503 의존 서비스 실패.
- 민감 응답·오디오는 `Cache-Control: private, no-store`. 공개 URL·서버 파일 경로·storage_key를 클라이언트에 반환하지 않는다.
- session/member/audio/utterance 모든 참조의 vault·session 일치 검사.
- 응답의 capability에 최대 파일 bytes·세션 용량과 지원 포맷을 제공한다. 실제 값은 G1에서 정한다.

## Endpoints

| Method/path | 요청 | 응답·권한 |
|---|---|---|
| POST /pairings | `{device_label}` | 미인증 제한 endpoint. `{pairing_id,user_code,device_secret,expires_at}`. 무작위 secret256bit, code8자리,5분 만료 |
| POST /pairings/approve | `{user_code}` | 보호자만. 차량 이름을 보여주고 명시적 연결; 기존 활성 차량이 있으면409 |
| POST /pairings/exchange | `{pairing_id,device_secret}` | 승인 전202, 승인 후1회 `{device_id,device_token,expires_at}`; 재교환410 |
| GET /devices | 없음 | 보호자만 연결 상태·마지막 접속·삭제 반영 상태 |
| DELETE /devices/{id} | 없음 | 보호자만202 `{revoked:true,purge_status}`. 즉시 새 요청 차단 |
| POST /devices/{id}/purge-ack | `{revocation_receipt}` | 서버가 폐기 대상 기기에만 발급한 일회성 receipt. 보관함 데이터 접근 권한 없음 |
| POST /members | `{display_name}` | 보호자 또는 활성 차량,201 member. 이름1~40자 |
| GET /members | 없음 | 현재 보관함 구성원 목록 |
| GET /capabilities | 없음 | 활성 인증 주체의 포맷·용량·시간 한도·기기 상태 |
| POST /sessions | `{id,recorded_at,timezone,title}` | 활성 차량만201. 사전 장소·주제 불필요 |
| PUT /sessions/{id}/audio/{chunk_id} | binary WAV + sequence/start_ms/duration_ms/sha256 metadata headers | 활성 차량. 서버 저장·checksum 확인 후200 `{state:"verified"}`. partial은 verified 아님 |
| PUT /sessions/{id}/utterances/{utterance_id} | `{member_id,start_ms,end_ms,transcript_raw,status}` | 활성 차량, 처음 작성 원문만. 참조 구간·session 일치 검사 |
| PATCH /sessions/{id}/utterances/{utterance_id} | `{expected_revision,transcript_edited}` | 보호자/활성 차량; 원본 음성·원문 불변, 세션 revision 증가 |
| POST /sessions/{id}/finish | `{expected_revision,manifest:[chunk_id],utterance_ids}` | 녹음 종료·서버 보관 검증; 누락이면409와 누락 ID, 사용자 결과는 임시 저장 표시 |
| POST /sessions/{id}/generations | `{input_revision}` | 202 `{job_id,state}`. 같은 입력 revision 작업 중복 생성 방지 |
| GET /jobs/{id} | 없음 | 현재 보관함 작업 상태·오류, 다른 보관함404 |
| GET /sessions | `date_from,date_to,place,cursor,limit` | 기본20·최대50. 현재 보관함 비삭제 세션 목록과 음성 준비 상태 |
| GET /sessions/{id} | 없음 | revision, chunks manifest, 발화, 초안·확정본, 제외 내용, 동기화 상태 |
| PATCH /sessions/{id}/draft | `{expected_revision,groups,excluded_spans}` | 분리·병합·이동·재포함. 계약 검증 후 새 버전; source 연결 보존 |
| POST /sessions/{id}/confirm | `{expected_revision,diary_version}` | 최종 묶음 확인. 음성 누락 시 전체 완료라고 반환하지 않음 |
| GET /sessions/{id}/audio/{chunk_id} | HTTP Range 지원 | 매 요청 권한·삭제 확인 후206/200 bytes. chunk 간 타 보관함 참조 거부 |
| DELETE /sessions/{id} | 없음 | 202 `{deletion_revision,server_purge_status,device_purge_status}`. 세션 전체 텍스트·음성 대상 |
| GET /sync | `cursor` | 단조 cursor와 변경·tombstone·revocation. 오래된 cursor는 snapshot_required |
| POST /sync/ack | `{cursor,purged_session_ids}` | 해당 차량의 적용·삭제 완료 기록 |

## Media and revocation details

고정 short-lived 다운로드 링크도 클라이언트에 배포하지 않는다. 서버 프록시가 `AudioStore`를 통해 비공개 파일 볼륨을 읽는다. 정적 파일 경로를 만들지 않는다.
차량은 다음 chunk 요청·sync에서 폐기 여부를 확인하고 재생·로컬 접근을 중단한다.
이미 전달된 바이트를 회수할 수는 없으며 오프라인 원격 삭제 완료를 주장하지 않는다.
웹은 인증된 fetch로 작은 chunk를 가져와 메모리 blob으로 재생하고 종료·로그아웃 시 해제한다.
차량 전체 녹음 재생은 manifest 순서로 이어 재생하며 source span은 session 시간→chunk 시간으로 변환한다.
이 탐색·경계 재생은 Safari·Chrome·차량에서 G4 검증 대상이다.

## Job and race guarantees

작업자는 DB lease를 가진 queued job을 획득한다. 네트워크 일시 오류만 최대3회 재시도한다.
거절·스키마/근거 오류는 원본을 남기고 사용자 재시도 가능한 실패로 기록한다.
완료 반영 시 session revision·deleted_at을 다시 검사한다. 삭제 후 늦은 생성 결과·업로드는 무시/거부한다.
API는 인증된 주체로 보관함을 결정하고 모든 경로에서 vault를 검사한다. 앱 DB 역할은 테이블 소유자·
superuser·BYPASSRLS가 아니며 트랜잭션별 vault context와 RLS를 함께 사용한다.
인증·보관함 조회·기기 인증·작업 획득은 실행 계약의 제한된 경로를 사용하고 교차 보관함 테스트를 수행한다.
클라이언트 직접 DB/파일 볼륨 접근은 허용하지 않는다.

## Upload metadata and list filtering

binary 업로드의 Content-Type은 `audio/wav`다. metadata header는
`X-Audio-Sequence`, `X-Audio-Start-Ms`, `X-Audio-Duration-Ms`, `X-Audio-Sha256`를 사용한다.
앞 세 값은 10진 정수이며 서버는 WAV header의 실제 포맷·payload 길이·checksum을 함께 검증한다.
DB format은 검증한 WAV header에서 추출하며 클라이언트 주장을 그대로 신뢰하지 않는다.
검증되지 않은 포맷·길이 불일치는422이며 기존 확정 chunk를 덮어쓰지 않는다.
날짜 검색은 확인한 사건 날짜를 우선하고 사건 날짜가 없는 기록은 녹음일 기준임을 표시한다.
장소 검색은 사용자가 확인한 장소명에 적용한다. 아직 검토 전인 후보는 후보라고 구분한다.

폐기된 차량의 기존 token hash가 일치할 때만401 응답의 제한된 `purge_required` 정보와
일회성 `revocation_receipt`를 발급한다. receipt는 보관함 읽기·재연결 권한이 없으며
해당 device의 purge-ack에만 사용할 수 있다. 새 알 수 없는 token에는 이런 정보를 반환하지 않는다.
receipt·device_secret·인증 쿠키는 로깅하지 않는다.

## Planned context extension (not implemented)

- POST /sessions의 recording_context는 차량 snapshot 및 녹음 시작 시점의 위치 상태/관측시각을 포함한다. 인증 차량의 동일 vault VehicleProfile만 연결하며 client snapshot의 범위·출처·값을 검증한다.
- GET /sessions 및 GET /sessions/{id}는 해당 기록의 snapshot을 반환한다. GET /sessions의 vehicle_id 선택 필터는 현재 연결 차량에 한정하지 않고 같은 vault의 과거 기록도 조회한다. 등록번호는 검색/URL에 사용하지 않는다.
- VehicleProfile 편집/기록별 context 편집 API와 DB 검증은 T041에 추가한다. 현재 public demo는 이 API를 구현한 것이 아니다.

## Planned photo / recall APIs (not connected in preview)

- POST /sessions/{id}/photos: 인증 보호자·동일 vault·비삭제 기록 검증 후 파일 검증/재인코딩/비공개 PhotoStore 저장. MIME만 믿지 않고 decoder 검증,10MB·8장 제한, 초과413/422, 멱등키와 동시 업로드 한도 검증.
- GET /sessions/{id}/photos 및 GET /sessions/{id}/photos/{photo_id}/content: 매 요청 동일 vault/삭제 확인, private no-store, 공개 정적 경로 금지.
- DELETE /sessions/{id}/photos/{photo_id}: 즉시 읽기 차단 후 사본 삭제 상태. 세션 삭제도 사진 포함.
- GET /sessions/{id}/nearby-memories: 인증 보관함의 기준 세션 녹음 위치로만 근접 기록 조회. 임의 가족 ID/좌표를 URL로 넘겨 타인 기록을 검색하지 않는다. 현재/미래/삭제 기록 제외.

## First connected slice — confirmed local snapshot

현재 차량 probe의 단일 WAV와 확정된 목업 일기를 서버에 연결하는 v1 확장이다.
`PUT /sessions/{id}/snapshot`은 활성 차량의 `{expected_revision,snapshot}`을 받는다.
snapshot은 원본 SHA256/길이, 원래 인식문·확인문·화자·입력 revision·검토 확정, 생성 결과와
기록 당시 context를 포함한다. 서버는 기존 generationInput/validateDiary로 검증하며 원본 바이트를
수신하기 전에는 audio_ready=false다. 멱등 키·본문 hash·동일 보관함·tombstone·음성 불변성을 확인한다.
현재 chunk_id는 session_id와 동일하며 한 개의 완료 WAV만 전송한다(16kHz PCM16 mono, 최대 21분).
`GET /sessions`, `GET /sessions/{id}`, audio Range, photos, sync, pairing/device 관리로 공유한다.
사진/서버 revision 변경을 차량의 input revision과 혼동하지 않는다. 서버 snapshot은 자동으로 사용자
확인문을 다시 쓰지 않는다. 이 경로는 범용 다중 chunk·서버 generation job endpoint의 대체 완료 증거가 아니다.

### 연결 별칭 보강 — 2026-11-09

`PATCH /devices/{id}`: `{label}` (trim 1~40자), 보호자는 동일 vault 기기, 차량은 자신의 id만 변경. 없는/해제된 기기 404, 다른 기기 권한 403. 응답 `{id,label}`. `GET /me`의 `device_label`로 차량에 최신 별칭을 반영한다. `POST /devices/claim`의 label은 사용자 선택값이며 과거 일기 차량 snapshot을 바꾸지 않는다.

### C017 사진 순서와 차량 변경 수신

세션 응답과 sync 항목의 `photos`는 `created_at DESC NULLS LAST, id DESC`로 정렬한다. 새 업로드의 `created_at`은 DB 삽입 시각이며 멱등 재시도에서는 바꾸지 않는다. 마이그레이션 이전 사진은 `created_at: null`이고 알 수 없는 추가 시각을 추정하지 않는다. 차량은 서버 순서를 비공개 로컬 메타데이터에 보존한다. 연결된 차량의 foreground/주차/대기 상태에서 증분 GET sync를 약5초마다 호출하며, 편집·녹음·STT·재생 및 백그라운드에서는 보류한다. 실패 후30초 backoff. 자동 수신은 로컬 일기의 최초 공유나 원본 업로드를 수행하지 않는다.


## C020 — GET /api/v1/events
기존 session cookie/차량 Bearer 인증. text/event-stream, no-store. ready와 changed 이벤트는 데이터 없는 {}이며 요청 보관함의 변경만 전달한다. commit된 DB NOTIFY만 사용한다. 클라이언트는 ready/changed마다 마지막 적용 cursor부터 GET /sync를 수행하며 실패 시 cursor를 앞당기지 않는다. heartbeat에서 인증을 재확인하고 취소/만료/연결 단절 시 스트림 자원을 해제한다. 재접속은 backoff; 폴링 fallback 없음.

## C021 기록 시작 위치 확장

현재 구현의 snapshot context.location은 `available|unavailable|synthetic|stale|denied|unsupported|error`를 허용한다. available은 latitude/longitude 유한 범위, observed_at이 started_at 이전 0~30000ms, source=`pleos_fused_emulator`를 검증하고 label을 좌표에서 정규화한다. confidence는 SDK 원시 지표이며 미터 단위 정확도로 해석하지 않는다. 실패 상태에서는 좌표/외부 label을 제거한다. 이전 unavailable/synthetic JSON 형태를 유지한다. 기록 맥락의 불변성 및 인증된 가족 보관함 접근 정책은 그대로다. 생성 입력 allowlist에 context를 추가하지 않는다.

## C023 자동 업로드 계약

snapshot/audio API와 인증·원본/맥락 불변 계약은 유지한다. 호출 계기를 일기별 명시적 공유에서 최종 저장 이벤트로 바꾸고, 클라이언트의 영속 outbox가 전송 상태를 소유한다. 재시도는 같은 세션 ID/같은 payload의 같은 멱등 키를 사용하며, 서버에 이미 반영된 응답 유실을 새 일기로 생성하지 않는다. 사진 등 서버 revision과 로컬 input revision을 구분해 충돌을 처리한다. 원본 확인 전에 동기화 완료로 표시하지 않는다.

대기 작업은 vault/device 소유권에 결속하고 인증 철회/만료 때 중단한다. DELETE/tombstone이 있는 세션은 재전송하지 않는다. 작성 중 초안과 미확정 수정은 업로드 대상이 아니다. 최초 연결의 미연결 완성본 이관은 안내된 범위로 처리하며 다른 vault의 기록은 제외한다. SSE 재연결과 outbox 재시도는 별개이며 서버 데이터 폴링을 추가하지 않는다.

클라이언트 구현은 `sync-outbox.json`에 확정 snapshot과 요청 payload·멱등 키·snapshot/audio 단계·재시도 시각을 AtomicFile로 기록한다. 재연결 전 보관함 소유권은 남으며 다른 보관함에서 작업을 실행하지 않는다. 삭제는 먼저 tombstone을 영속화하고 원격 DELETE를 예약한다. 서버 응답 유실은 같은 키로 재전송한다. 사진만 달라진 409는 이전 snapshot과 구조 비교 후 재조정하고 내용 충돌은 차단한다.

## C024 화면 설정

서버 계약 변경 없음. 테마는 기기별 표시 설정이며 서버/가족 보관함에 동기화하지 않는다. native state/theme bridge는 `theme_mode: auto|light|dark`, `theme_dark: boolean`을 반환하고 `setTheme`은 주차 검토 권한에서만 허용한다. 시스템 주야간 변경은 읽기 전용 적용이며 일기 revision이나 미디어 상태를 변경하지 않는다.


## C026 원본 타임라인 호환 계약

`GET /me`는 `speech_timeline_version:1`을 제공한다. 이 필드가 없거나 1 미만인 서버에는 타임라인이 포함된 새 snapshot을 전송하지 않고 영속 대기열에 보관한다. 기존 서버가 알 수 없는 필드를 버리고 성공 처리하는 것을 막는다. 전송 대기는 기존 backoff/수동 재시도 흐름을 따른다.

`snapshot.speech_timeline`은 선택 필드다. `{source:"pleos_epd_pcm_v1",raw_history_index,segments:[{id:"segment-1",text,start_ms,end_ms}]}`. raw_history_index는 마지막 원문 인식 결과를 가리키고 구간 text를 개행으로 합치면 그 원문과 정확히 같아야 한다. 검증된 시간은 정수이며 `0<=start_ms<end_ms<=duration_ms`, 시간 있는 구간끼리 순서/비겹침을 만족한다. 시각 미확인은 start/end 둘 다 null이다. 1~500개, 고유 ID, 원문·길이 제한을 검증한다. 화자 이름/임의 source 등 추가 필드는 반환하지 않는다. 필드가 없는 과거 snapshot은 기존 wire 형태를 유지한다.

`playSegment {memoryId,segmentId}`는 차량 주차 검토 권한을 요구한다. native가 저장된 구간을 직접 조회해 원본 선택/seek/start를 한 동작으로 처리한다. 웹이 임의로 전달한 시각은 사용하지 않는다. 상태 `audio_memory`는 원본이 준비된 파일만 가리키며 TTS와 구간 강조를 혼동하지 않는다.


## C027 테마·설정 복귀 UI
서버/동기화 wire 변경 없음. 기존 setTheme(mode)/theme_mode/theme_dark bridge를 사용한다. 화면 직접 전환 버튼도 차량 주차 검토 권한을 유지한다. 녹음 파형은 기존 state.level(실제 PCM 기반 정규화 입력)만 소비한다.

## C037 연결 코드 형식
`POST /pairings`는 `/^[0-9]{6}$/` 문자열을 발급한다. `POST /devices/claim`도6자리만 허용한다. 선행0 보존,5분 만료·일회용·기존 요청 제한 유지. 전역 UNIQUE code_hash 충돌은 제한 재시도하고 실패 시503 PAIRING_BUSY. 기존 device token은 변경하지 않는다. 업데이트 전 미사용8자리 코드는 재발급이 필요하며 APK와 서버를 함께 업데이트한다.

## C038 원본 길이 검증과 부분 전송 복구
WAV durationMs는 `(payloadBytes * 1000) / (channels * 2 * sampleRate)`이며 snapshot 비교는 정수 ms 내림값을 사용한다. 원본 SHA/포맷 검사는 유지한다. audio_ready=false 상태에도 해당 원본 해시가 일치하는 기존 로컬 기록의 사진은 수신 가능하지만 원격 음성 준비 상태는 false다. 재시도는 기존 session ID/payload/원본을 유지하며 서버 자료를 삭제하거나 임의 보정하지 않는다.
