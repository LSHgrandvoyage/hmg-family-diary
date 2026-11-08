# HTTP Contract v1

기준 경로 `/api/v1`. JSON UTF-8. 아직 구현된 endpoint가 아니다.
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
