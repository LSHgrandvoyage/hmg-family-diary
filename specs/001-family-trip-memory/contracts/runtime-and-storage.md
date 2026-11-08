# Prototype Runtime and Storage Contract

2026-11-08 사용자 결정. Supabase 사용 계획을 대체한다. 아래 경로·컨테이너·명령은 구현 목표이며
현재 실행 가능한 Compose 파일이나 앱 이미지는 아직 없다. 기능 spec·헌장의 범위는 유지한다.

## Runtime boundary

| 단위 | 실행·접근 범위 | 영속 데이터 |
|---|---|---|
| proxy | Caddy 컨테이너. 외부 HTTPS443, 인증서 발급/리다이렉트가 필요하면80. web만 중계 | `caddy_data`, `caddy_config` |
| web | Next.js 웹/API, Better Auth 라이브러리. 내부3000, 외부 직접 포트 없음 | 원본 `audio_data:/data/audio` |
| worker | Node 생성·삭제·고아 파일 정리. 외부 수신 포트 없음 | web과 동일 `audio_data:/data/audio` |
| db | PostgreSQL18. 내부5432, 기본 호스트 포트 공개 없음 | `pg_data`, 실제 마운트 지점은 고정 이미지 지침으로 검증 |
| migrate | 일회성 SQL 적용. 런타임과 다른 DDL 권한. 실패 시 서비스 시작 차단 | 검토된 `db/migrations/` |
| mailpit | `dev` 프로필의 합성 계정 메일 수신기. SMTP 내부1025, UI는 호스트127.0.0.1:8025만 | 실제 사용자 메일함으로 사용하지 않음 |

외부 공개는 proxy뿐이다. worker의 외부 LLM 호출은 허용해야 하므로 Compose 전체를 인터넷 차단
네트워크로 지정하지 않는다. DB 자격과 볼륨은 필요한 서비스만 전달하고 Docker socket은 마운트하지 않는다.
API·worker는 동일한 비루트 UID/GID로 원본 볼륨을 사용한다. 파일 권한은 일반 정적 웹 루트와 분리한다.
web에는 인증 비밀·인증/도메인 DB 연결, worker에는 도메인 DB 연결·LLM 키만 제공한다.

`db` healthcheck 통과 → `migrate` 성공 → web/worker 시작 순서다.
재시작 시 앱의 DB 재연결과 작업 lease 만료 복구도 필요하다. 의존성 순서만으로 복구 완료를 보장하지 않는다.
기본 구성은 실행 이미지를 사용하고, 개발용 소스 bind mount는 별도 override로 한정한다.
패키지 lockfile·이미지 버전/digest를 T001/T039에서 고정한다. 이번 단계에서 이미지를 내려받거나 배포하지 않는다.

## Configuration and device access

서버 설정은 `DATABASE_URL`(도메인 역할), `AUTH_DATABASE_URL`(인증 역할),
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_ORIGIN`, `AUDIO_ROOT`, `AUDIO_STORE=local`,
`OPENAI_API_KEY`, `SMTP_HOST/PORT/USER/PASSWORD/FROM`으로 분리한다.
DDL용 `MIGRATION_DATABASE_URL`은 migrate에만 전달한다. 필수 비밀·origin이 없으면 실행을 실패시킨다.
키·DB 비밀번호는 이미지/클라이언트 번들/Git에 포함하지 않는다. `.env.example`에는 이름과 예시만 둔다.

차량·휴대폰은 같은 HTTPS origin을 사용하며 인증의 base URL·허용 origin도 이에 일치시킨다.
LAN에서 호스트의 실제 주소와 DNS를 사용한다. 각 기기의 localhost는 서버가 아니다.
Caddy 로컬 CA를 사용하면 각 개발 기기에 신뢰를 구성하고, 신뢰할 수 없는 인증서를 무시하는 코드를
release에 넣지 않는다. 실기기에서 로컬 CA를 신뢰할 수 없다면 유효한 공개 인증서·접속 경로를 마련한다.
공개 도메인 자동 HTTPS는 DNS·포트·인증서 발급 조건을 충족해야 한다.
외부 모델 기반 생성은 인터넷을 필요로 하며 mock 모드는 합성 시연으로 표시한다.

## Owner authentication and database roles

Better Auth의 이메일/비밀번호, 이메일 검증, 재설정, DB 세션을 사용한다.
`/api/auth/*`는 라이브러리 handler, `/api/v1/*`는 제품 API다. 라이브러리 버전·생성 SQL을 함께 고정한다.
UUID 생성 설정을 적용하고 auth User/Account/Session/Verification을 `auth` 스키마에 둔다.
User는 도메인의 Vault 소유자에 연결된다. 이야기 Session과 인증 Session의 명칭·테이블을 구분한다.

- 웹 세션은 유효기간7일, 마지막 갱신 후 하루가 지난 사용 시 갱신하는 기준으로 설정하고 `cookieCache`를 끈다.
- 요청마다 서버가 DB 세션과 보관함 권한을 확인한다. HttpOnly/Secure/SameSite=Lax 쿠키,
  정확한 trustedOrigins, CSRF 검사, DB 기반 rate limit을 적용한다.
- 이메일 검증 전 기록 접근을 허용하지 않는다. 인증·재설정 토큰은 라이브러리에서 처리하며 로그에 남기지 않는다.
- 로그아웃은 현재 DB 세션을 폐기한다. 비밀번호 재설정 성공 시 보호자의 기존 세션을 모두 폐기한다.
- 로컬 회원 가입·검증·재설정은 Mailpit의 합성 주소로 검증한다. 실제 사용자 수집 전 SMTP 전송을 검증한다.
- 보호자 쿠키·자격 증명을 차량에 전달하지 않는다. 차량은 기존의 별도 기기 토큰을 사용한다.

도메인 앱 역할은 테이블 소유자·superuser·BYPASSRLS가 아니어야 한다.
도메인 쿼리는 인증 완료 후 도출한 vault를 같은 DB 트랜잭션의 `SET LOCAL` 컨텍스트로 전달한다.
풀 반환 뒤 다른 요청에 컨텍스트가 남지 않아야 한다. RLS 없는 조회가 제품 API에 섞이지 않도록 검증한다.
인증 역할은 auth 스키마만 접근하며 worker는 auth 자격을 갖지 않는다.
보관함 소유자 조회·최초 생성, 기기 token 조회/연결 교환, 작업 claim은 vault 결정 이전에 필요한 제한된
DB 함수 경로로 제공한다. 전역 테이블 SELECT 권한 대신 필요한 식별자·상태만 반환하고, 고정 search_path·
PUBLIC 실행 권한 제거·검증된 인수·허용 호출 역할을 적용한다. claim 결과의 vault로 작업 범위를 설정한다.
이 경계와 다른 보관함 거부는 T007/T009/T012에서 실제 SQL로 검증한다.

## AudioStore contract

`packages/storage/src/`의 `AudioStore`는 `putImmutable`, `stat`, `readRange`, `delete`,
복구용 key 목록/manifest 열람을 제공한다. 구현 초기값은 `LocalAudioStore`다.
서버가 검증된 UUID로 `vault/session/chunk` 논리 키를 만들며, 클라이언트 경로나 URL을 받지 않는다.
DB의 `storage_key`는 adapter에 전달할 논리 키다. 절대 경로·provider URL을 DB나 응답 계약에 고정하지 않는다.

- 업로드는 임시 파일에 크기 제한을 적용해 스트리밍하고 WAV 포맷·bytes·SHA256을 검증한다.
- 동일 key·동일 bytes는 멱등 처리, 다른 bytes는409. 확정 파일은 덮어쓰지 않는다.
- 루트 탈출·심볼릭 링크 접근을 거부한다. 오류에는 호스트 경로를 노출하지 않는다.
- 원본 확정 시 세션 단위 DB 잠금과 삭제 상태 재검사를 거쳐 파일을 원자적으로 게시하고 DB 상태를 갱신한다.
  삭제도 같은 잠금 규약을 사용한다. 잠금 전 준비한 업로드가 삭제 뒤에 원본을 되살리지 못해야 한다.
- 파일 시스템과 DB는 분산 원자 트랜잭션이 아니다. 중단 후 임시 파일·고아 파일·누락 파일을 대조한다.
  유효한 업로드 lease의 임시 파일은 지우지 않는다. stale 임시 파일과 삭제 세션의 잔여 파일은 정리 작업으로 제거한다.
- 디스크 부족·권한 오류는 실패/partial 상태로 반환한다. 실제로 보관되지 않은 파일을 verified로 표시하지 않는다.
- `readRange`는 크기·유효 범위를 검증하고 잘못된 범위는416으로 처리한다. API가 먼저 vault·삭제·기기 권한을 검사한다.
- `delete`는 없는 파일도 성공 처리하는 멱등 연산이다. 실제 제거와 기기 purge ack를 구분한다.

클라우드 객체 저장 adapter는 추후 구현한다. 로컬 경로에서만 통하는 rename 등에 제품 코드가 직접 의존하지
않도록 구현 세부를 adapter 안에 두고, 불변 쓰기·Range·삭제·checksum 의미를 동일하게 시험한다.

## Backup, restore and later migration

프로토타입은 단일 호스트 장애 시 서비스가 멈추는 구성이며 고가용성을 주장하지 않는다.
`pg_data`·`audio_data`는 컨테이너 재생성에도 유지하지만 호스트 장애·볼륨 삭제에는 별도 복원이 필요하다.
일상 종료 절차에 `down -v`를 넣지 않는다. 백업 파일은 저장소 밖의 접근 제한 경로에 둔다.

T040에서 다음 절차를 합성 데이터로 검증한다.
1. 새 요청을 유지보수 상태로 막고 진행 중 업로드·작업을 완료/중단시킨 뒤 web/worker 쓰기를 정지한다.
2. DB dump와 원본 파일·checksum manifest·삭제 표식을 같은 중단 구간에서 백업한다. 실행 중 PG 데이터 폴더를 단순 복사하지 않는다.
3. 별도 임시 Compose 프로젝트/볼륨에 복원하고 원래 환경을 덮어쓰지 않는다.
4. 백업 시점 이후의 최신 삭제 표식·기기 폐기 정보를 병합하고, 삭제된 파일과 오래된 세션 접근을 먼저 제거한다.
   최신 삭제/폐기 상태를 확보하지 못하면 오래된 백업을 사용자에게 개방하지 않는다.
5. ID·개수·SHA256·세션 버전·원본 구간 재생·삭제 부활 방지와 연결 해제 상태를 확인한다.

삭제 표식/기기 폐기 상태를 최신으로 보관할 별도 복구 저널과 백업 보존·폐기 정책은
실제 사용자 자료 수집 전에 설정·기록한다. 프로토타입 합성 자료에는 최신 상태 fixture로 복원 검증한다.
클라우드 이전은 같은 이미지를 VM에 올리는 단계부터 시작할 수 있다. 관리형 PostgreSQL에는 인증·
도메인 SQL을 함께 이전하고, 객체 저장소에는 논리 key와 bytes/checksum을 유지해 복사한다.
검증 후 연결 설정·adapter를 전환하며 실패 시 접근을 닫고 이전 환경으로 복구한다.
이미지 실행 위치 변경만으로 DB·파일이 자동 이전되거나 무중단이 보장되지는 않는다.

## Planned photo storage extension (FR-018)

운영 프로토타입의 PhotoStore는 별도 비공개 `photo_data` 볼륨을 사용한다. 서버의 파일 검증/재인코딩과 DB 메타데이터 저장이 완료돼야 ready를 반환한다. 원본 파일명은 저장 경로로 쓰지 않고 UUID를 쓴다. 볼륨은 정적 공개 경로로 마운트하지 않는다. 인증된 조회, 세션/개별 사진 삭제, tombstone 복원, 백업/복원에 사진 사본도 포함한다.

현재 `compose.preview.yaml`에는 사진 서버 API나 이 볼륨이 없다. 사진은 브라우저 IndexedDB에만 저장되며 Docker 재시작/서버 백업과 별개다. 같은 기기에서도 localhost 주소와 LAN IP 주소는 서로 다른 origin이므로 사진 보관함이 공유되지 않는다. [IndexedDB의 origin 및 Blob 저장](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [Canvas 사본 생성](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)을 참고했다.
