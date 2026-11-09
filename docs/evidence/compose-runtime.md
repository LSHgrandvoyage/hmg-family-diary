# Docker 연결 slice · 2026-11-09

차량에서 확인·저장한 목업 일기와 동일한 WAV를 보호자 보관함으로 공유하고, 휴대폰의 사진을 차량에 동기화하는 첫 연결 구현이다. 원문은 자유 발화이며 입력 주제를 강제하지 않는다. 실제 OpenAI 호출은 없다.

## 구현 범위

- Compose: PostgreSQL18, Better Auth1.7.18, Next 웹/API, 삭제 worker, Caddy HTTPS, 개발 Mailpit. DB·인증·파일은 영속 볼륨이며 DB 포트는 최종 구성에서 외부에 노출하지 않는다. API/worker는 uid1000·읽기 전용 루트·cap_drop으로 실행한다.
- migrate/auth/app DB 역할 분리. app은 테이블 비소유자·non-BYPASSRLS이며 트랜잭션별 vault GUC를 설정한다. 인증 전 bootstrap·토큰 조회·코드 교환·작업 조회 함수는 고정 search_path/제한된 EXECUTE 권한을 사용한다.
- 가입 후 이메일 확인, Secure/HttpOnly/SameSite=Lax 쿠키, DB 세션 및 요청 제한. 비밀번호 재설정은 기존 세션을 폐기한다. SMTP는 외부 발송 없는 Mailpit이다.
- 5분/1회 연결 코드, 가족 보관함당 활성 차량 1대, 30일 차량 토큰의 hash 저장·폐기 검사. 휴대폰 소유자와 기기 토큰의 작업 권한이 다르다.
- 차량 로컬 기록은 자동 업로드하지 않는다. 저장한 목업 일기의 ‘휴대폰에 공유’를 확인하면 글·실제 원본·기록 당시 차량/위치 context를 전송한다. 공유 전 개인 파일은 테스트에서 열거나 전송하지 않았다.
- `PUT /sessions/:id/snapshot`은 input revision·확인/저장 상태·출처·원문 불변성과 draft schema를 검사한다. server revision과 input revision은 별도다. idempotency key 재사용 시 같은 요청만 허용한다.
- 단일 16kHz PCM16 mono WAV, 최대21분. SHA256·형식·길이 확인 후 ready가 된다. 인증된 Range 조회를 지원한다. DB 락을 잡고 원본 publish/delete를 직렬화한다.
- 휴대폰 사진은 JPEG/PNG/WebP·10MB·40MP·8장 제한이며 재인코딩/회전/축소해 EXIF를 제거한다. 비공개 볼륨에 저장하고 인증 API로만 제공한다. 사진 키의 다른 입력 재사용은409다.
- 보관함별 변경 순서·cursor·tombstone. 연결 해제 후 재접속하면 공유 사본만 삭제한다. 아직 공유하지 않은 기기 기록은 유지한다. 오프라인 기기 삭제는 다음 동기화까지 pending이다.
- 휴대폰 화면은 `/login`, `/library`, `/library/:id`, `/devices`. 기존 `/demo`는 가상의 샘플과 브라우저 전용 사진을 사용하는 별도 화면이다.

## 실행으로 확인한 범위

모든 서버 시험은 가상의 계정·텍스트·2초 합성 WAV·단색 사진으로 실행했다. 사용자의 기존 녹음은 읽거나 내보내지 않았다.

- `pnpm typecheck`, 기존 Vitest **84 tests** 통과.
- 차량 debug APK 및 JVM 테스트 빌드 통과. 기존 앱 ID를 유지하는 업데이트 설치로 데이터 초기화 없음.
- `scripts/runtime-test.ts`: 실제 HTTPS 가입·미확인 로그인 거절·확인 메일·로그인·Secure/HttpOnly 쿠키·코드 중복 방지·snapshot replay/conflict·잘못된 WAV 거절·원본 바이트 동일성/Range·미로그인/다른 가족 접근 거절·사진 변환·Origin 차단·삭제 부활 방지·기기 폐기·재설정 후 세션 폐기 통과.
- `db/tests/isolation.sql`: GUC 없는 app 조회0건, 다른 vault row 차단, 다른 vault INSERT 거절, auth 테이블 접근 거절, runtime nonowner/non-BYPASSRLS 통과.
- `CloudSyncDeviceTest` **4 tests**: 연결/원본 업로드·서버 원본 수신, 휴대폰 사진 수신/이미지 decode, 원격 삭제, 폐기 시 공유 사본 purge 및 never-shared sentinel 보존 통과. `files/sync-qa`라는 별도 시험 폴더만 사용하고 종료 후 정리했다.
- `runtime-hardening-test.ts`: JSONB 키 순서가 달라도 같은 snapshot 재전송 성공, 같은 input revision의 내용 변경 거절, 최초 인식문 변조 거절, stale revision 거절, 사진 replay/다른 bytes conflict/사진 삭제 통과.
- DB/web/worker 재시작 후 로그인·일기·사진 메타데이터·원본 SHA 보존 통과. 물리 파일 purge audit 결과는 아래에 기록한다.

## 발견한 문제와 보정

- Caddy 블록 문법과 Compose tmpfs 문자열을 바로잡았다.
- Docker NAT 뒤 IP HTTPS의 SNI 없는 접속에 `default_sni`를 지정했다. Node/Android는 지정한 CA와 호스트 이름을 검증한다. 인증서 검증을 끄는 제품 코드는 없다.
- 브라우저 QA는 먼저 Node TLS로 신뢰한 leaf 공개키만 격리 Chrome의 SPKI allowlist에 넣는다. 맥북 시스템 신뢰 저장소는 변경하지 않았다.
- Better Auth의 기본 로그인 요청 제한을 테스트에서도 준수한다.
- 375px 화면에서 파일 입력의 최소 폭이 카드 밖으로 넘치는 것을 발견해 컨테이너 min-width와 파일 선택 UI를 수정했다.
- JSONB의 키 순서로 context 불변 비교가 잘못 실패하던 문제를 깊은 객체 비교로 수정했다.
- 기본8080 주소는 영문 오류 대신 인증서 설치와 HTTPS 앱 링크를 안내하는 한국어 페이지로 바꿨다.

## 아직 검증/구현하지 않은 범위

- 실제 iPhone Safari의 인증서 설치·재생·파일 앱 저장은 사용자 확인 대기다. Chromium의 모바일 viewport 테스트를 iOS 실기기 검증으로 간주하지 않는다.
- 실제 Pleos 주차/위치 연동, 제품용 기기 암호화·키 관리, 다중 청크/화자/세밀한 음성 alignment, 서버 생성 job/outbox 전체 구현, push/background sync는 아직 아니다. probe만 연결했으며 pleosRelease의 플랫폼 gate는 유지한다.
- 일반화한 data-model 정규화·모든 기존 HTTP 계약을 완료한 것이 아니다. 현재 저장 단위는 검증한 단일 snapshot이다. 목록은 최근200개까지다. 사진은 HEIC를 지원하지 않는다.
- 원문/목업 정리 결과의 구조적 근거 검증은 의미적 충실도 평가를 대신하지 않는다. G3는 미완료다.
- T040 백업·복원·최신 삭제 저널 병합·외부 SMTP·호스트 장애 복구를 아직 검증하지 않았다. 현재는 개발 시험용이며 실제 가족 자료 수집 운영 준비 완료가 아니다.
- 파일 publish와 DB commit 사이의 프로세스 강제 종료 시 비참조 사진이 남을 수 있다. 주기적인 orphan reconciliation 및 백업 purge 정책은 운영 전 후속 작업이다. 정상 삭제/재시도 worker와 crash 복구 완결성을 구분한다.
- 기기의 purge ACK/보관함 UI 집계는 아직 없다. 삭제 응답은 기기 사본의 실제 삭제 완료를 주장하지 않고 다음 연결까지 pending으로 안내한다.

## 실행/접속

새 환경:

```sh
pnpm exec tsx scripts/setup-runtime.ts <맥북-LAN-IP>
docker compose --env-file .env.runtime --profile dev up -d --build
docker compose --env-file .env.runtime cp proxy:/data/caddy/pki/authorities/local/root.crt .tools/runtime/local-ca.crt
pnpm exec tsx scripts/connect-runtime.ts
```

`.env.runtime`는 최초1회 생성되는 mode0600 파일이다. 기존 비밀을 덮어쓰지 않는다. secrets·CA private key·QA 계정·기기 토큰은 Git에 넣지 않는다. 정상 종료는 `docker compose --env-file .env.runtime --profile dev stop`; 볼륨을 지우는 `down -v`는 사용하지 않는다.

휴대폰은 맥북과 같은 Wi-Fi에서 `http://<IP>:8080/`의 설치 안내를 열고, `https://<IP>:8443/login`에서 보관함을 만든다. 개발 인증 메일은 맥북 `http://localhost:8025`에 도착한다. 확인 링크를 인증서를 설치한 기기에서 연 후 로그인한다. `/devices`에서 만든 코드를 차량 ‘차량과 사용 안내’에 입력한다. 새 목업 일기 저장 → 휴대폰에 공유 → 휴대폰 읽기/듣기/사진 추가 → 차량 동기화 순서다.

개발용 인증서는 시험 후 아이폰의 일반 → VPN 및 기기 관리에서 삭제할 수 있다. IP가 바뀌면 APP_HOST/APP_ORIGIN, 인증서와 차량 origin을 함께 갱신해야 한다.

## 근거

- [Better Auth DB](https://better-auth.com/docs/concepts/database), [PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql), [옵션](https://better-auth.com/docs/reference/options), [요청 제한](https://better-auth.com/docs/concepts/rate-limit). 실제 SQL은 설치된1.7.18 migration API로 생성했다.
- [Caddy global options / default_sni](https://caddyserver.com/docs/caddyfile/options).
- [Apple 수동 인증서 신뢰 설정](https://support.apple.com/en-ie/102390). 설치와 SSL 신뢰 활성화는 별도 단계다.

## 최종 웹 확인

Chromium에서 로그인 → 사진 첨부 → 실제 원본 재생·일시정지·탐색 → WAV 다운로드 SHA 동일성 → 연결 코드 → 로그아웃을 통과했다. 375/812/1024/1440px, reduced-motion 환경에서 가로 넘침0 및 page error0을 확인했다. [휴대폰 일기](connected-ui/phone-diary.png), [전체 원본 플레이어](connected-ui/phone-original.png), [로그인](connected-ui/phone-login.png)을 시각 검토했다. 모든 화면 자료는 합성 기록이다. 다운로드한 WAV는 사용자가 별도로 보관하는 사본이므로 보관함 삭제와 별개로 파일 앱에서 직접 지워야 한다.

최종 지속성/삭제 audit: 컨테이너 재시작 후 같은 로그인·일기·사진 메타데이터·WAV SHA가 유지됐다. 삭제된 원본2개와 사진2개가 실제 볼륨에서 사라졌고, 해당 시험 보관함의 미완료 purge job은0개였다. 기본 테스트 재실행 중 sandbox의 loopback listen EPERM으로5건이 실패해, 필요한 권한으로 재실행한 결과를 기준으로 기록한다.

최종 회귀 확인: 권한을 갖춘 `pnpm test` 재실행에서84/84 통과, `pnpm typecheck`와 `pnpm format:check` 통과. 기존 `ReviewDeviceTest`4/4도 동기화 추가 뒤 통과했다. 마지막 native build는 probe debug/JVM 및 pleos release를 함께 성공했고 실제 플랫폼 잠금은 그대로다.

유지보수용 `generate-auth-migration.ts`/`migrate-local.ts`는 개발자가 의도적으로 연 loopback5449 DB 포트를 사용한다. 최초 Compose 실행에는 필요하지 않다. 기본 Compose는 DB 포트를 열지 않는다. SQL을 바꿀 때는 이미 적용한 파일을 수정하지 않고 새 migration을 추가한다.
