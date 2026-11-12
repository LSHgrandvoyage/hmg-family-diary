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

## 사용자 확인과 연결 피드백 보정

사용자가 실제 iPhone Safari에서 가입·메일 확인·로그인 성공을 확인했다. C005 중 원본 재생/파일 앱 저장은 여전히 미확인이다.

차량 코드 입력 후 성공 여부가 불분명하다는 보고를 받아, 토큰 값을 출력하지 않는 인증 조회로 현재 기기·보관함 일치 및 HTTP200, 공유 기록0개를 확인했다. 연결 실패가 아니라 완료 상태가 화면에 남지 않는 문제였다.

차량 설정 상단에 연결 상태 카드를 두고, 연결 후 코드 입력/재연결 버튼을 숨겼다. 보관함에도 연결 여부·원본 전송 완료 사본 수를 표시하며 ‘공유할 일기 고르기’로 이어진다. 서버 확인/전체 동기화 완료 시각은 실제 성공 후에만 저장한다. 이전 버전의 시각이 없는 연결은 시각 미기록으로 안내하며, 마지막 확인이 현재 온라인 상태를 보장한다고 표시하지 않는다. 오류·진행·완료를 같은 카드에 남기고, 중복 제출은 비활성화한다. 원본 준비가 확인된 사본만 완료 수에 포함한다. 자동 업로드는 추가하지 않았다.

보정 검증: probe APK/JVM/AndroidTest 빌드 성공, 기존 합성 `ReviewDeviceTest`4/4 통과. 업데이트 설치 후에도 같은 기기·보관함 인증200과 공유0개를 다시 확인했다. 비밀 토큰·사용자 녹음은 출력/전송하지 않았다. 차량 앱을 다시 열었으며 재연결은 필요 없다.

2026-11-09 사용자 확인: 차량 기록 동기화와 휴대폰에서 첨부한 동일 사진의 차량 수신을 확인했다. 실제 iPhone 원본 재생/파일 앱 저장은 별도 명시적 확인 전이므로 C005를 완료하지 않는다.

## 2026-11-10 사진 입력 알림·차량 갤러리

FR-018/C009: 실제 웹·미리 보기의 사진 파일을 업로드 전에 크기/헤더로 검사한다. 10MiB 초과·빈 파일·미지원 형식/서버 저장 실패는 현재 화면의 Sheet 확인 알림으로 표시한다. 버튼 아래 형식/변환 상시 안내 제거. 기존 사진/서버 파일 검증 유지.

`pnpm exec tsx scripts/test-photo-feedback.ts` 통과: 375px 브라우저에서 합성 18MiB PNG와 반복 선택, PNG로 위장한 미지원 내용은 POST 0건; 서버 거절 팝업, 정상 파일 재시도 복구, 미리 보기 알림 확인. API는 이 UI 시험에서 모의 응답이며 사용자 사진을 전송하지 않았다. [용량 알림](connected-ui/photo-size-alert.png), [형식 알림](connected-ui/photo-format-alert.png) 시각 확인. 실제 iPhone에서의 변경 후 확인은 사용자 대기.

FR-018/C010: 차량 기본 사진 영역은 최대4장/2열/전체 구도. 5장 이상이면 ‘사진 더보기 · 전체 N장’. 사진 자체 터치로 확대, 확대 안의 사진 삭제→확인/취소. 원격 삭제는 기존 인증·동기화 경로 유지.

`PhotoGalleryDeviceTest` 1/1 통과: 합성 사진5장, 기본4장, FIT_CENTER, 개별 버튼 제거, 전체5장, 확대, 삭제 취소 시5장 유지, 확인 후4장·더보기 숨김. 사용자 기록을 수정/공유하지 않았다. [기본 격자](connected-ui/synthetic-gallery-preview.png), [전체 사진](connected-ui/synthetic-gallery-all.png), [확대/삭제](connected-ui/synthetic-gallery-expanded.png) 시각 확인.

검증: TypeScript/Prettier 통과, Docker 웹 빌드·개발 서버 적용, probe APK/AndroidTest/JVM 빌드 통과 및 기존 앱 데이터 유지 설치. 시험 후 Gradle 데몬 종료, 에뮬레이터·개발 서버는 사용자 확인용으로 유지했다.

## 2026-11-10 모바일 사진 옵션·더보기 (C011)

실제 웹/합성 미리 보기에서 PhotoCollection을 공통 사용한다. 사진마다 삭제 버튼 대신 제목 우측 점3개 ‘사진 옵션’→사진 삭제→전체 사진에서 대상 선택→확인/취소. 기본4장/2열, 5장 이상 더보기로 전체 최대8장. 사진 터치 확대 유지. 차량은 기존4장/더보기 구성 유지. 읽기 전환 컨테이너의 회색 background를 transparent로 변경.

`test-photo-menu.ts` 통과: 합성5장/API 모의 응답으로 기본4장/전체5장/확대, 메뉴 Escape, 삭제 선택·취소 시 요청0·서버 실패 보존·재시도, 삭제 후4장일 때 더보기 숨김, 읽기 탭 투명 배경, 375/812/1440px 가로 넘침 없음, IndexedDB 미리 보기의 실제 로컬 삭제 확인. `test-photo-feedback.ts` 재실행 통과. 두 검증 모두 일반 Chrome에 연결하지 않는 독립 headless 브라우저이며 종료 후 자신이 생성한 브라우저만 닫음. [모바일 사진 메뉴 및 탭](connected-ui/phone-photo-menu.png) 시각 확인. TypeScript/Prettier/Docker 빌드 통과, 개발 서버 적용. 실제 iPhone Safari의 변경 후 확인은 사용자 대기.

## 2026-11-10 차곡 디자인 전환 — C012/C013

사용자 제공 `차량용 가족 일기 앱.html`의 모바일4/차량4 화면을 독립 headless Chrome에서 렌더링해 확인했다. 일반 로그인 Chrome은 사용하지 않았다. 모바일의 회색/흰색 카드·월별 날짜 목록·어두운 원문 재생, 차량의 어두운 좌측 메뉴·큰 코랄 녹음 버튼·읽기/미디어 분할을 기존 기능에 적용했다. 웹 `/library`, `/devices`, 상세와 로그인에 새 셸을 적용했다. 과거 합성 `/demo`는 이전 디자인으로 남아 있으며 실제 화면 진입점은 `/library`다.

- `pnpm typecheck`, `pnpm format:check`, `git diff --check` 통과. `pnpm test` 84/84 통과. 최초 샌드박스 실행은 테스트 localhost listen EPERM으로5개 실패했고, 제한 밖 동일 검사에서 통과했다.
- Docker 웹 production build 및 기존 개발 서버 교체 완료. 저장 볼륨/계정/원본 데이터는 유지했다.
- `test-detail-actions.ts`: 가로 메뉴,0장 사진 선택→첨부,8장 제한, 원본 듣기 안 다운로드 바이트 일치, 삭제 취소/확인 통과. 기존 URL 직접 다운로드의 모의 검사 취소 문제는 AudioPlayer가 받은 원본 Blob URL을 재사용하도록 변경하여 해소했다.
- `test-chagok-design.ts`: 합성3개 기록/2개월 목록·검색/빈결과,375/390/812/1440px 가로 넘침 없음, 원문 재생·탐색, 연결 기기 상태 통과. `test-photo-feedback.ts`, `test-photo-menu.ts`도 통과했다.
- `test-runtime-web.ts`: 실제 로컬 HTTPS 서버의 합성 계정 로그인·사진 업로드·재생/탐색·다운로드 SHA256 일치·코드 생성·별칭 변경/재조회·로그아웃 통과. 375px,812px가로,1024px,1440px 확인. 실제 사용자 계정/기기 연결은 수정하지 않았다.
- native `assembleProbeDebug`, `assembleProbeDebugAndroidTest`, `testProbeDebugUnitTest` 통과 및 `adb install -r`로 데이터 보존 설치. ReviewDeviceTest/PhotoGalleryDeviceTest 총5개 중 최초4개 통과, 생성1개는 로컬 목업 서버 미실행으로 실패. `DIARY_GENERATOR=mock pnpm probe:server`와 연결 스크립트 실행 후 실패한 생성→저장→다시 열기→원본 재생/주차 gate 테스트 단독 재실행 통과(7.321초). 사진4장/더보기/확대/삭제 회귀 통과. 캡처 원본 SHA와 context 불변 검사 포함.
- 차량 캡처의2099년은 최근 기록 영역에 기존 사용자 기록이 나타나지 않도록 만든 합성 시험 날짜다. 캡처는 합성 텍스트/사진만 포함한다. 실제 녹음·실차 주차/GPS/자동 화자 구분·iPhone 파일 앱 저장 검증을 대신하지 않는다.
- 화면: `connected-ui/chagok-library.png`, `chagok-detail-{375,390,812,1440}.png`, `chagok-listening.png`, `chagok-devices.png`, `chagok-vehicle-{record,library,diary}.png`.

현재 계약을 유지한 차이: 참조의4자리 Bluetooth 발견 대신 기존8자리 HTTPS 연결 코드, 자동 화자 분리 대신 기록된 화자, 실시간 전사 대신 녹음 후 STT, 실제 AI 생성 대신 목업, TTS 버튼 생략. 사진/일기 가로 옵션 메뉴와 원본 다운로드는 사용자 이전 요구를 유지했다. 기능이 없는 가족 관리 탭은 계정/차량 관리로 연결한다. 번호·위치는 저장된 녹음 시작 snapshot만 표시한다. Gradle 빌드 데몬은 종료했고 개발 웹·에뮬레이터와 목업 생성 서버는 실행 상태다.

## 2026-11-10 C014 — C013 혼합 디자인 교체

사용자가 C013의 기존 UI 혼합을 거부하여 제공 HTML의8개 화면 DOM·SVG·인라인 스타일 자체를 정본으로 교체했다. Noto Sans KR와 Space Grotesk도 원본을 로컬 번들했다. `apps/web/public/faithful/` 공통 renderer를 웹과 차량 probe의 제한된 WebView에서 사용한다. `/library`, `/devices`, 상세 URL은 새 화면으로 연결된다. C013의 수작업 유사 화면은 현재 제품 경로에서 사용하지 않는다.

- 원본 기본 화면에서 이전 읽기/원래 이야기 탭·차량 정보 카드·새로고침·추가 메뉴를 제거했다. 원본의 편집·공유·사진 추가·원문 전체 보기 버튼에 기능을 연결했다. 추가 정보·삭제는 진입 후 대화상자, 차량 검토·생성/연결 설정은 기존 native 흐름으로 연결한다. 참조가 없는 로그인/설정/검토 화면을8개 참조와 같다고 주장하지 않는다.
- `test-exact-design.ts` 최종 통과: 원본과 동일390×844/390×1240/1280×720에서8개 화면 캡처, 로컬 서체 로딩, JS 오류0. 원본 iframe 캡처의1px 경계를 보정한 비교에서 connect/main/recording/carlist는 픽셀 동일, 나머지는 경계/부분픽셀 반올림의 미세 차이였다. 이 캡처는 합성 참조 내용이며 실제 기능 검증과 구분한다.
- `test-exact-runtime.ts` 최종 통과: 실제 로컬 HTTPS 서버의 합성 계정 로그인·목록·상세,18MiB 알림, 사진 업로드, 재생→원문 이동, 재생바 터치 탐색, 원본 다운로드 SHA256 일치, 삭제 취소,8자리 연결 코드. 시험에서 추가한 사진은 종료 시 삭제한다. 개인 기록/음성/위치를 사용하지 않았다.
- 최초 기능 검사에서 재생 준비 중 화면 이동으로 발생한 AbortError와4px 트랙의0px 입력 영역을 발견했다. 명시적 재생 취소만 구분하여 처리하고, 시각 배치를 바꾸지 않는44px 터치 영역으로 보정한 후 재검사 통과했다.
- `ExactUiDeviceTest` 최종1/1 통과: 합성 로컬 일기/사진2장, 정확한 새 DOM, 앱 영역 안의 화면 폭, 사진 로딩, 원본 재생 위치 증가, 주차 해제 시 WebView 숨김과 bridge 재생 거절. 처음 차량 viewport에서 오른쪽 잘림을 확인해 실제 clientWidth 기준 균등 축소로 고쳤다. 사진/오디오와 실제 앱 저장소를 연결하지만 자료는 임시 합성 fixture이며 종료 후 삭제한다.
- `pnpm typecheck`, Prettier(신규 renderer/검사), `git diff --check`, `pnpm test`84/84 통과. sandbox의 localhost listen EPERM으로 실패한5개 검사는 권한 허용 환경에서 재실행해 통과했다. Docker build/up 완료. Android probe/AndroidTest 빌드 및 단위 검사 통과, 데이터 보존 설치 완료. 최종 Gradle 데몬 종료.
- 차량 TTS는 한국어 엔진 지원 확인/실패 알림과 주차·화면 이동 중단을 연결했다. 실제 음성 품질/엔진 지원, 변경 후 실제 마이크 캡처·일시정지, 실차, iPhone Safari 파일 앱 저장은 이 검사의 범위가 아니다. 기존 사용자 확인과 합성 검사를 혼동하지 않는다. API 생성은 계속 목업이고 실시간 전사/자동 화자 분리/Bluetooth 발견을 구현했다고 표시하지 않는다.

참조 캡처: `connected-ui/exact-{connect,main,detail,transcript,carhome,recording,carlist,cardetail}.png`. 실제 서버 합성 캡처: `exact-live-detail.png`, `exact-live-transcript.png`. 에뮬레이터 합성 캡처: `exact-vehicle-detail.png`. 사용자 데이터는 유지했고 웹·에뮬레이터·목업 서버는 개발을 위해 실행 상태로 둔다.

## 2026-11-10 C015 — 중복 제거·공유 상태·입력 파형·사진 탐색

사용자7개 피드백에 따라 모바일/차량 한마디 영역, 차량 홈의 모든 일기 보기, 목록의 오늘의 일기 녹음하기를 제거했다. 원본의 나머지 시각 체계는 유지한다. 차량 일기 카드에 차량에만 저장/휴대폰에 공유됨/전송 대기를 표시하고 가로 점3개에서 내용 확인·공유·삭제를 제공한다. 공유 전 파일은 로컬만, 공유 파일은 기존 CloudSync.delete의 서버 revision 확인 후 사본을 삭제한다. 취소/실패는 보존한다. 자동 전체 업로드로 정책을 바꾸지 않았다. 기기 상태는 내용·비밀을 출력하지 않고 개수만 조회해 공유 완료1건을 확인했다.

사진은 가로 스냅 목록과 전체 화면 스와이프 확대, 현재 순서, 화살표/키보드 대체 탐색으로 변경했다. 삭제는 가로 점3개 옵션→확인으로 분리했다. 스와이프 직후 지연된 scroll 이벤트가 같은 사진의 메뉴까지 닫는 문제가 검사에서 발견돼 실제 인덱스 변경 때만 닫도록 고쳤다.

CaptureProbe의 동일 PCM16 입력에서100ms 단위 RMS(-60..0dBFS)를 계산해 bridge로 음량만 전달한다. 최근32개 음량을 주황 파형으로 표시하며 무음은 바닥선, 일시정지/중단은0이다. 임의 진동/랜덤 애니메이션을 쓰지 않고 저장 바이트는 변경하지 않는다.

검증:
- InputLevelTest2개 포함 Android 단위 검사16/16 통과: 무음/잡음 바닥, 음량 증가, 양/음 샘플, full scale, 유효 buffer 길이, 원본 입력 불변.
- `test-c015-ui.ts` 통과: 별도 headless 모바일에 실제 touch 이벤트를 보내1→2 스와이프, 화살표·키보드 탐색, 메뉴 숨김/열림, 삭제 취소0건, 서버 실패 보존 및 재시도 후 정확한 사진 삭제. 차량 메뉴/삭제와 합성 bridge 음량·무음·일시정지 파형, 중복 UI 제거도 통과했다. 테스트 bridge는 실제 Android처럼 매 응답을 직렬화하여 새 객체를 전달한다.
- `ExactUiDeviceTest`1/1 통과: 에뮬레이터에서 합성 일기의 사진·원본 재생, 주차 해제 숨김/bridge 거절, 차량 목록 옵션·삭제 취소 보존·확정 시 실제 합성 WAV 삭제 및 목록 제거. 기존 사용자 기록은 삭제하지 않았다.
- 실제 HTTPS 서버 합성 계정의 `test-exact-runtime.ts` 통과: 로그인·목록·업로드 제한/정상 업로드·재생/구간 이동·원본 다운로드 SHA256·삭제 취소·코드 생성. `test-exact-design.ts`는 C015 요청 변경을 포함한8개 화면 렌더/폰트/JS 오류0 확인. 현재 요청으로 C014 픽셀 동일성 비교는 더 이상 성공 기준으로 사용하지 않는다.
- TypeScript/Prettier/diff 검사 통과. Docker 빌드 및 개발 서버 반영, native 데이터 보존 설치 완료. Gradle 데몬 종료. 실제 iPhone Safari 터치와 실제 마이크 발화의 체감 반응은 이 합성 검사의 범위 밖이다.

화면: `connected-ui/swipe-photo-{strip,viewer}.png`, `input-responsive-wave.png`, `c015-vehicle-{list,detail}.png`, `c015-live-{detail,transcript}.png`, `refined-*.png`.

## 개발 환경 IP 갱신 검증

`refresh-runtime.ts`로 현재 LAN IPv4 자동 감지 및 기존 APP_HOST/APP_ORIGIN만 갱신했다. 기존 볼륨/비밀/페어링은 유지했다. Compose healthy, 공개 CA와 hostname 검증을 사용하는 HTTPS health200, 차량 origin/CA 갱신, 기존 차량 토큰의 읽기 전용 /me200, 목업 서버 adb reverse 연결을 확인했다. 동일 명령 재실행도 통과했다. 기록 업로드/생성/삭제는 하지 않았다. TypeScript/diff 검사 통과. README에 최초 설치와 평소 재실행/IP 변경 절차를 분리했다.

## 2026-11-11 C016 — 동시 STT와 차량 내 저장 완료

단일 AudioRecord가 WAV에 기록한 PCM 복사본을 최대20초 큐를 통해 Pleos ON_DEVICE에 전달한다. 초기화 대기·중간 결과·최종 끝 신호·초과/오류·취소를 처리한다. 별도 마이크를 열지 않으며 원본 저장 실패/빈 입력은 홈과 오류 알림으로 돌아간다. 인식 실패 시 원본을 유지하고 미확정 인식문도 사용자가 확인/수정할 대상으로 남긴다.

녹음 종료 후 carreview 화면에서 마지막 인식을 기다린 뒤 화자/이야기를 수정한다. 일기로 만들기는 확인문 저장과 목업 요청을 묶고, 미리보기 후 일기 저장으로 accepted revision을 기록한다. 이전의 숨은 단계·휴대폰 확정은 요구하지 않는다. 생성 실패 시 확인문과 원본은 보존된다. 요청 중 주차 해제/화면 종료 시 생성과 STT를 취소하고 닫힌 WebView에 결과를 전달하지 않는다. 사진 추가는 가로 스크롤 밖의 사진 상단에 고정했다.

검증:
- LiveSpeechDeviceTest 실제 Pleos ON_DEVICE + 합성 한국어 PCM 통과: 입력 완료 전 중간 인식 수신, 전체 최종 문장 일치, 원본 SHA 불변. 사용자 마이크/개인 음성을 사용하지 않았다.
- DiaryFlowDeviceTest 실제 WebView + 맥북 목업 서버 + native 파일 저장 통과: 인식문 수정→생성→저장 전 accepted=-1→저장→동일 원본 SHA→재열기. 첫 검사의 재열기 문자열 비교는 목업의 문단 줄바꿈을 고려하지 않아 실패했고, 공백 정규화 후 저장/재열기까지 통과했다. 제품에서 줄바꿈을 제거하지 않았다.
- ExactUiDeviceTest 사진/원본 재생/주차 gate/삭제 회귀 통과. SpeechProbeDeviceTest.cancelStopsCallbacksAndAllowsExplicitRetry 실제 SDK 취소/재시도 회귀 통과. Android 단위 검사16/16 통과.
- test-c015-ui.ts에 C016 추가 검사 통과: 사진 추가 버튼은 스와이프 전/끝에서 같은 위치, 인식 중 입력 잠금/완료 후 편집, 생성 실패 시 수정문 보존/재시도, 미리보기/저장/상세 이동. 기존 실제 touch 스와이프·사진 삭제·입력 파형 검사도 통과.
- 실제 HTTPS 서버 test-exact-runtime.ts 통과: 업로드 제한·업로드·재생/탐색·원본 SHA 다운로드·삭제 취소·페어링. TypeScript/Prettier/diff 검사 통과.
- Docker 개발 서버 반영, native 데이터 보존 설치, Gradle 데몬 종료. 녹음 파형과 iPhone 스와이프는 사용자가 C015에서 직접 확인했다. 이번 동시 마이크/STT의 실제 자유 발화·장시간·소음과 종료 후 체감 대기는 사용자 확인이 남으며, 합성 SDK/저장 검사를 그 확인으로 대신하지 않는다. 실제 OpenAI 호출은 없다.

새 확인/미리보기 화면: `connected-ui/c016-review-preview.png`; 사진 추가/실제 서버: `c016-live-detail.png`, `c016-live-transcript.png`.

## 2026-11-11 C017 — 확인 화면·원본 재생·사진 자동 수신

확인 화면에서 완료된 STT 구간 요약과 생성/미리보기 목업 설명을 제거했다. 편집 레이블은 `문장 수정`. `원본 다시 인식`은 저장된 원본을 다시 STT에 넣는 복구 경로로, 실패/빈 결과에서만 보인다. 원본·확인문·목업 생성 계약은 유지한다.

원본 WAV의 PCM RMS를 읽기 전용으로128구간 샘플링하고32개 막대로 표시한다. 차량은 선택한 기록만 계산/캐시하고, 모바일은 재생용으로 받은 원본 Blob에서 계산한다. 실제 재생 시각에 따라 주황색 채움과 현재 구간 높이를 갱신하며 탐색/일시정지/재생 완료에 동기화한다. 재생할 때만 animation frame을 사용하고 숨겨진 문서에서는 중지한다.

사진 지연 원인은 기존 수동 pull이었다. 이제 MainActivity 전면·모의 주차/동의·연결·대기 상태에서5초 주기로 증분 수신하고 변경이 있는 읽기 화면만 갱신한다. 편집/녹음/STT/재생은 보류, 열린 사진 대화상자는 닫은 뒤 갱신, onPause/주차 해제는 취소, 실패는30초 backoff다. 기존 페어링과 명시적 최초 공유는 유지한다.

새 사진 추가 시각 컬럼과 인덱스를0004 migration으로 추가했다. 기존 행은NULL을 유지하므로 과거의 정확한 업로드 순서를 복원했다고 주장하지 않는다. 새 사진은 최신순, 차량은 서버 응답 순서를 별도 atomic metadata로 유지한다. 로컬 추가도 맨 앞이다. 선택 카드만 보라색 테두리, 사진1장 이상이면 남은 빈칸을 제거했다.

검증:
- Android 단위17/17 통과. WaveEnvelopeTest에서 무음/작은 음량/큰 음량/양음 진폭과 원본 SHA 불변 확인.
- `test-c015-ui.ts` 확장 통과: 완료 상태 문구 숨김/문장 수정/조건부 재인식, 선택 카드1개만 강조, 사진1장 빈칸 없음, PCM 높이 차이·50% 주황 채움·되감기, 기존 생성/저장/사진 스와이프 회귀.
- `test-c017-receive.ts` + AutoReceiveDeviceTest 통과: 별도 합성 vault 기기/auto-qa 폴더에서 실제 MainActivity timer 실행. 실제 HTTPS로 사진2장 추가→버튼 없이 상세 갱신→서버/차량 최신순 일치→주차 gate 해제 후 조회 시각 불변. 사용자 계정/페어링/원본을 시험에 사용하지 않았다.
- `test-exact-runtime.ts` 실제 HTTPS 합성 로그인·업로드·재생·중간 탐색·주황 채움·일시정지 위치 고정·원본 다운로드 SHA·삭제 취소·코드 생성 통과. 첫 실행은 같은 합성 일기에 자동수신 검사가 동시에 사진을 추가하여8장 한도에 도달했고 파일 선택 대기 시간이 초과됐다. 합성 사진 정리 후 단독 재실행과 확장 재생 검사 모두 통과했다. 제품 제한을 우회하거나 변경하지 않았다.
- 화면 `connected-ui/c017-playback.png`, `c017-live-detail.png`, `c017-live-transcript.png`, `c017-review.png`. 독립 headless Chrome만 사용했다. 실제 iPhone Safari 체감/실차 검증을 대신하지 않는다.
- 최종 ExactUiDeviceTest 통과(10.701초): 로컬 사진 추가는 맨 앞, native 원본 시간/주황 진행, 완료 시32막대 전체 채움, 재생 재시작은 처음부터, 주차 해제 bridge 차단, 삭제 취소/확정. 데이터 보존 APK 설치 완료.
- Docker0004 migration과 웹 배포 완료, TypeScript/Prettier/diff 검사 통과. 기존 저장 볼륨·사용자 연결 유지. Gradle 데몬을 종료하고 일반 앱으로 돌아갔다.

## 2026-11-11 C018 — Safari 사진 선택 피드백과 원본 비율

사용자가 iPhone Safari 사진 보관함 선택 후 무응답을 보고했다. 해당 실제 파일의 크기/형식과 기기 로그는 확보하지 못했으므로 단일 원인을 확정하지 않는다. 기존 코드는10MB 초과/형식 오류 알림이 있었지만,8장 한도는 버튼 disabled만 제공했고 파일 확인/전송 대기 표시와 제한 시간이 없었다. 동적 file input도 DOM 밖에 있었다.

파일 선택은 클릭 이벤트 안에서 직접 열고 input을 body에 유지한다. 사진 선택 대기→검증→업로드→성공/실패 상태를 표시하며 검증15초/전송45초 제한을 둔다. 시간 초과는 서버 저장 여부를 새로고침으로 확인하도록 안내한다.8장 제한 클릭도 명확히 알린다. 새로 선택한 사진의 세션 ID를 고정하고 전송 중 중복 입력을 막는다. 비지원 HEIC/용량/파일 손상·해상도/네트워크 오류를 알린다. 사진 앱/iCloud 내부 처리의 실제 진행률은 웹에서 측정한 것으로 표시하지 않는다.

저장된 사진은 로딩 상태/회전 표시,20초 지연 또는 오류 시 재시도를 제공한다. 모바일 상세의 고정260×196칸과 배경을 제거하고 원본 비율로 최대340px폭/240px높이 안에 표시한다. 확대는 기존 스와이프를 유지한다. 차량은 사진 배경을 투명하게 하고 높이를 비율에 맞춘다.

- test-c018-upload 통과: DOM에 유지되는 picker,18MB/HEIC 요청 전 차단, 서버/네트워크 오류, 전송 대기 상태와 중복 방지, 시간 초과 후 버튼 복원·성공 재시도,8장 안내. 지연된 사진의 로딩/오류/재시도, 세로1:2·가로4:1의 이미지/컨테이너 크기 일치와 투명 배경 확인. 첫 지연 이미지 검사는 페이지 load가 이미지 완료를 기다려 timeout이 발생했고, 검사 진입을 DOMContentLoaded로 변경 후 통과했다.
- test-c015-ui 전체 회귀 통과: 실제 touch 스와이프·사진 메뉴/삭제·확인/생성/저장·선택 카드·재생 파형. ExactUiDeviceTest native 합성 사진·원본 재생/완료/재시작·주차 gate·삭제 통과(10.591초).
- 실제 HTTPS test-exact-runtime 통과: 합성 계정 로그인,18MB 알림·정상 첨부, 재생/탐색/일시정지·원본 SHA 다운로드·삭제 취소·기기 코드. TypeScript/Prettier/diff 통과. Docker 서버 갱신과 데이터 보존 APK 설치 완료. 실제 iPhone 사진 보관함 흐름의 사용자 재확인은 남는다.
- 화면: connected-ui/c018-size-alert.png, c018-natural-photos.png, c018-live-detail.png, c018-playback.png. 원본 비율 화면의 단색 두 이미지는 합성 테스트 이미지 자체의 색이며 여백을 칠한 것이 아니다.
- 주행/동기화 공식 정책 조사와 현재 구현 선택의 구분은 research.md의 R4 보충에 기록했다. 이번에는 주행 gate나 동기화 방식을 변경하지 않았다.

## 2026-11-11 C019 — 주행 음성 모드 / 주차 검토 분리

사용자가 주행 중 녹음·원본 청취와 주차 후 편집/사진/검토 분리를 요청했다. 헌장2.0.0·제품 정의·FR-001/SC-006·capture 계약을 갱신했다. VehicleInteractionPolicy는 음성/검토 권한을 분리하며 알려진 상태·플랫폼 허용·전면·동의를 요구한다. CaptureCoordinator는 명시적 driving grant가 있을 때만 NOT_PARKED 음성을 허용하고 UNKNOWN은 계속 차단한다.

현재 적용 대상은 emulator-only probe다. 모의 P와 별개인 모의 주행 체크 및 상단 시험 전환 버튼을 추가했다. 음성 화면에서는 시작/일시정지/종료, 원본 재생/일시정지/종료와 이전·다음만 제공한다. 날짜와 상태만 표시하고 전사문·사진·일기 본문·장식 파형은 표시하지 않는다. native 명령 allowlist와 사진 리소스 gate가 읽기/편집/생성/삭제/공유/설정/TTS를 별도로 차단한다. WebView DOM/팝업/재생 애니메이션도 숨김 전환에서 정리한다.

P↔허용된 모의 주행은 진행 중 음성을 유지한다. 캡처 종료 후 원본/인식문은 보관하고 검토는 주차 후 연다. 주행 중 최종 STT 저장은 review 화면 허용 조건 때문에 누락되지 않도록 private store 경로에서 수행하고 선택 상태를 갱신한다. 편집 중 WebView 입력은 모드 전환 동안 메모리에 보존한다(앱 강제 종료까지 지속되는 저장 완료로 표시하지 않는다). 앱 이탈/동의·상태 확인·포커스 상실은 중단하며 자동 재개하지 않는다. 녹음 목록은 모드 진입/새 원본에서 캐시하여250ms 재생 갱신마다 디스크를 정렬하지 않는다.

검증:
- Android 단위20/20: 명시적 driving grant의 녹음 연속성, revoke/UNKNOWN 중단·자동 재개 없음, 음성 명령 허용/검토 명령 거절, 동의/전면/플랫폼 제한 검사와 기존 PCM/SHA 등.
- DrivingModeDeviceTest 최초 주행→주차 검토 복원에서 수정문 누락을 발견했다. 같은 hash의 화면 재열기가 render되지 않는 경로와 중복 refresh를 보정하고, 최초 주행 진입 후 WebView가 아직 준비되지 않은 경우 navigation을 보류하도록 수정했다. 테스트의 공개되지 않은 AudioFocusRequest listener 접근은 컴파일되지 않아 실제 제품과 같은 interrupt 경로를 합성 호출하는 방식으로 변경했다. 실제 통화/내비와 포커스 경쟁을 검증했다고 주장하지 않는다.
- 최종 DrivingModeDeviceTest + ExactUiDeviceTest2/2 통과(19.623초). 격리된 임시 로컬 보관함의 합성 WAV로 P→D 청취 연속, D 재생 시작/일시정지/이전, bridge 검토 거절/사진403/DOM 비움, 포커스 중단 경로/UNKNOWN 차단, P에서 시작한 AudioRecord의 D 연속·완료, D에서 새 녹음 시작, P복귀 검토·수정문 복원, 처음부터 D로 연 뒤 최초 P WebView 복원 및 청취 유지, 원본 SHA 불변을 확인했다. 기존 사진/재생/삭제/주차 gate 회귀도 통과했다.
- AudioRecord 시험 동안 emulator hostmicoff로 개인 마이크를 차단했다. 실제 STT 정확도 대신 합성 최종 문장을 주입하여 D 완료 시 저장 경로를 확인했다. 실제 SDK 합성 발화 인식은 이전 C016 검증과 구분한다. 검사 후 임시 보관함만 정리했고 hostmicon으로 입력을 복원했다.
- test-c015-ui 공통 UI 회귀, TypeScript/Prettier/diff, probe debug와 pleos release 빌드 통과. Docker 웹 반영/데이터 보존 APK 설치/Gradle 데몬 종료. 화면: connected-ui/c019-driving-mode.png (명시적 합성 시험, 플랫폼 기어P 표시는 실제 주행 판정 검증이 아님).

제한: 실차 원본 마이크·주행 중 녹음의 카테고리/마켓 승인·실제 CarUxRestrictions 연동은 미검증이다. release는 기능별 허용 확인 전 잠금을 유지하며 DO를 임의 선언하지 않았다. 현재는 버튼 기반/foreground 동작이고 백그라운드 지속 녹음·차량 음성 명령 시작은 미구현이다.5초 폴링은 유지했다. 실행/복귀 조회+SSE+실패 시 느린 폴링 조합은 plan의 제안이며 이번 구현 완료로 표시하지 않는다.


## C020 — 2026-11-11 SSE·백그라운드 녹음·차량 신호·녹음 화면

범위: FR-001/002/003/007/010, C017/C019의 폴링·Activity 이탈 정책 대체. constitution2.1.0, 제품 정의/spec/plan/capture/http 계약/tasks 갱신.

- 서버: 트랜잭션 commit의 PostgreSQL NOTIFY를 한 LISTEN 연결에서 인증된 vault SSE로 전달한다. 이벤트는 ready/changed와 빈 JSON만 포함한다. 20초 heartbeat에서 인증을 재확인하며 취소/종료 시 구독을 정리한다. 본문 데이터는 기존 cursor API로 받는다.
- 모바일: 전면 SSE, visibility/pageshow/online 복구, backoff 재연결. 사진 업로드·재생·열린 대화상자 중 refresh는 보류한다. 연결 실패 표시/수동 새로고침. 주기적/느린 데이터 폴링 없음.
- 차량: 전면 SSE가 pending 변경을 표시하고 기존 P/idle/비편집 적용 경계에서 cursor pull. 녹음/재생/편집 중 파일 사본을 교체하지 않는다. 1초 UI scheduler는 pending 적용 가능 여부만 확인하며 무변경 상태의 HTTP 조회를 하지 않는다. SSE 재연결은1~32초 backoff+jitter, lifecycle 종료 시 연결/재시도 해제.
- RecordingService: 사용자가 전면에서 시작한 microphone foreground service가 AudioRecord/PCM 분기/STT/원본 및 인식문·context 저장을 소유한다. Activity는 attach/detach한다. 알림의 녹음 마치기 action, START_NOT_STICKY, 명시적 task 제거/UNKNOWN/동의 해제/포커스 완전·일시 상실/마이크 silenced에서 보존 후 중단. 내비 duck 통지는 녹음을 중단하지 않는다. 기존 원본 청취의 백그라운드 서비스화는 이번 녹음 요구 범위에 포함하지 않았다.
- 차량 신호: GEAR_SELECTION+CarUxRestrictions 초기 조회/변경 listener. P이면서 UX baseline일 때만 검토, 지원 기어의 나머지 상태는 음성 모드. 미지원 값/서비스 연결 상실/권한 오류는 UNKNOWN. 에뮬레이터의 실제 AAOS callback에서 `차량 신호 · P / PARKED` 관측. 모의 전환은 별도이며 실차 증거가 아니다. 자동 신호 모드에서는 화면 위 시험 전환 버튼을 숨긴다.
- 디자인: 사용자 Downloads `차량 · 녹음 중@1x.png`와 기존 원본 HTML의 동일1280×720 배치 사용. 112px rail, 오른쪽572×640 패널(x660),104px 시간,20개 실제 PCM 파형,96px 하단 버튼. 인식문 최근4개 표시·마지막30px 강조. 자동 화자 분리는 없으므로 샘플 가족 이름은 넣지 않는다. 실제 서버 자동 음성 저장이 없으므로 안내 문구는 기기 원본 보관으로 수정했다.

실행한 검사:
- test-c020-events: HTTPS cookie 인증, 무인증/무효 Bearer401, commit 변경 알림, 개인정보 없는 힌트, 스트림 중단 동안 삭제된 사진을 cursor로 복구 통과.
- test-c020-ui: 정확한 주요 배치 치수/실제 인식문/20개 입력 파형,120초 idle HTTP pull 없음, 스트림 실패 중 fallback pull 없음, ready/changed 조회 통과. 화면 `connected-ui/c020-recording.png`는 합성 문장/합성 레벨이다.
- test-c015-ui: 기존 사진 swipe/메뉴/오류·차량 일기 삭제·입력 파형·목업 생성/저장 회귀 통과.
- BackgroundRecordingDeviceTest: 실제 AudioRecord를 host microphone 차단 상태로 실행. 설치된 내비 Activity 전면 전환에서도 녹음 경과시간 증가, Activity recreate 후 같은 service/capture에 복귀, 실제 NAVIGATION MAY_DUCK focus 요청에서 PCM 지속, 모의 D 검토 숨김, 백그라운드 알림 action 종료/WAV/context 저장, UNKNOWN 중단/자동 재개 없음 통과. 무음의 STT 종료는 기존30초 응답 제한을 기다린다. 최초 Activity.finish는 task 제거 중단 정책을 작동시켜 recreate 검증으로 교체했다. 이후45초 검증 deadline은 STT의 기존30초 종료 제한보다 길게 조정했다.
- 최초 HTTPS 실패는 LAN 주소가172.30.1.50→172.30.1.44로 변경되고 proxy가 꺼져 있던 환경 문제였다. refresh-runtime으로 공개 주소/CA와 차량 설정만 갱신했고 비밀·연결·볼륨을 보존했다.
- native 자동수신 검사 격리: Activity에 합성 CloudSync를 주입하기 전 기존 stream을 해제한다. 반복 실행의 auto-qa 폴더에 남은 이전 합성 사진이 신규 순서 비교를 방해하여 해당 세 하위 폴더만 매회 초기화한다. 실제 사용자 기록/연결은 정리하지 않는다.

제한: 실차 주행 전이, 차량 마이크 품질/내비 음성 혼입, OEM suspend/통화 정책과 마켓의 장시간 주행 녹음 승인은 미검증이다. release flavor 잠금은 유지하며 임의 DO 선언은 하지 않았다. 에뮬레이터 user build는 car_service inject 명령을 거절하므로 실제 P 관측과 모의 D/UNKNOWN 검사를 구분했다. 실제 기어 변경 시험/실차 허용으로 확대 해석하지 않는다.

근거: [Pleos 주행 규제](https://document.pleos.ai/docs/pleos-only/vehicle-app-developer-guide/driving-restriction-development-guide), [Pleos 오디오 포커스](https://document.pleos.ai/docs/pleos-only/vehicle-app-developer-guide/audio-focus-development-guide/audio-focus-development), [Android microphone foreground service](https://developer.android.com/develop/background-work/services/fgs/service-types#microphone).


C020 최종 확인:
- BackgroundRecordingDeviceTest + ExactUiDeviceTest 2/2 통과(47.608초). 추가한 합성 인식문을 서비스에 주입하여 Activity가 없는 동안 ReviewStore에 저장되는 것도 검증했다. 음성 인식 정확도 증거와 구분한다.
- AutoReceiveDeviceTest 1/1 통과(17.409초): HTTPS 사진2장 추가→SSE→실제 MainActivity cursor 수신→순서/화면 반영. 연결된 idle에서도6.5초간 lastVerifiedAt 불변, gate 종료 후에도 무조회. 공유 버튼이나 수동 새로고침은 누르지 않았다.
- 서버 SSE 단위3/3: 다른 vault 알림 격리, 인증 철회 시 스트림 종료, 취소 후 heartbeat 정리, LISTEN 오류 후 새 연결 복구. 실제 HTTPS 통합 검사도 최종 웹 배포 뒤 재통과했다.
- C018 사진 형식/용량/진행/실패/시간 초과/8장 회귀 통과. Android 단위20/20, probe debug/test APK 및 pleos release 빌드, TypeScript/Prettier/diff 검사 통과.
- 기존 데이터를 유지하는 APK 업데이트와 Docker 웹 배포 완료. 검사 전 꺼져 있던 에뮬레이터는 테스트용 headless로만 실행했으며 마이크를 차단했다. 검사 후 headless 에뮬레이터와 Gradle 데몬을 종료한다. 서버는 화면 확인용으로 유지한다. caffeinate는 실행하지 않았다.

## C021 — 공모전 보완

2026-11-11. SDD spec/plan/계약/tasks를 먼저 갱신하고 다음을 적용했다.

- FusedLocation1.1.3, TextToSpeech3.3.1 공개 Maven 의존성을 실제로 확보·빌드했다. FusedLocation timestampMillis getter를 확인하고 녹음 시작 전0~30초의 유효 관측만 보관한다. 권한 요청은 선택이며 거절/오래된 관측/미지원/오류를 구분한다. 위치는 immutable context로 서버에 공유되고 생성 입력에서는 제외된다.
- 위치 SDK 에뮬레이터 실행 결과: 권한 거절 때 `denied`, 현재 사용자10에 권한을 허용한 뒤 `available`. Android AAOS는 system user0과 foreground user10의 권한이 분리되어 있어 설치·권한 검사 대상을 맞췄다. 정확한 좌표는 실행 로그에 출력하지 않았다. 실차 GPS 관측 증거가 아니다.
- 원본 MediaPlayer와 Pleos ON_DEVICE TTS를 PlaybackService로 옮겼다. MediaSession·foreground 알림·종료 동작, 포커스·UNKNOWN 중단과 수명주기를 포함한다. TTS는 초기화 완료 후 listener를 등록하고 문서의 `Locale.KOREA`를 사용한다. 원본 duck은 음량0.2, TTS duck은 공개 gain API가 없어 중단한다. 자동 재개하지 않는다.
- native/UI에서 녹음과 재생의 동시 시작을 차단한다. 화면 복귀 시 서비스 재연결을 먼저 수행해 해제된 player를 UI가 참조하지 않도록 했다.
- 차량/휴대폰 목록에 기록 당시 차량 정보별 필터를 추가했다. VIN 기반 식별이 아니라 nickname/brand/model/type/year/plate 스냅샷 값별 묶음이다. 별칭 변경 전후를 자동으로 같은 차라고 추정하지 않는다.
- 공유 표시에서 pending 전송, 원본 준비 여부, 로컬 입력 revision을 함께 확인한다. 차량에만 저장/전송 대기/휴대폰 공유됨과 수신 대기를 구분한다. 기존 최초 공유 정책·SSE+cursor·무폴링은 유지한다.
- 자동차 화자 지침 `family-diary-car-v4`와 평가 계획을 준비했다. 실제 모델 평가/외부 API 호출은 하지 않았으며 운영 모드는 mock이다.

검증 결과:

| 검사 | 결과와 범위 |
| --- | --- |
| TypeScript/Vitest | typecheck 통과,10파일97테스트 통과. 위치 범위·시각·불필요 필드 제거·이전 형식 호환 포함 |
| Android 단위·빌드 | 21단위 통과. probe debug APK·계측 APK·pleos release 빌드 성공. release 잠금 유지 |
| PlaybackLocationDeviceTest + DrivingModeDeviceTest | 3/3 통과. 원본 내비 전환·Activity recreate·UNKNOWN 중단·원본 SHA 보존, 공식 TTS onStart·내비 전환·알림 stop, 모의 P/D 검토·사진 차단 회귀 |
| 포커스 정책 | 콜백 주입으로 원본 duck/복구·transient loss 중단·자동 재개 없음 검사. 실제 스피커 혼합 음량·실차 통화 검증으로 해석하지 않음 |
| 위치 허용 재검사 | 현재 사용자 권한 허용 후 SDK available 응답 확인, 해당 계측1/1 통과 |
| test-c021-location-runtime | 실제 HTTPS 서버의 합성 위치 왕복·정규화와 과거 좌표 변경409 거절 통과. 테스트 기록·기기 연결 정리 완료 |
| test-c021-ui | 폰375×812/가로812×375·차량1280×720 필터, 공유 상태·동적 수신 상태, 수평 overflow/JS 오류 없음 통과. PNG 시각 확인 |
| test-c020-events / UI 회귀 | 인증 SSE·commit 알림·재연결 삭제 복구,120초 유휴 및 실패 중 데이터 폴링 없음, 녹음 화면·입력 파형 유지 통과 |

사진 및 사용자 녹음을 검사 자료로 사용하지 않았다. Playback 테스트의 WAV는 합성 무음이며 호스트 마이크를 끈 상태에서 실행했다. 기존 실제 사용자 연결·일기·DB 볼륨은 보존했다. 위치 통합 검사의 최초 정리 실패(삭제 revision 누락)는 합성 기록/기기만 대상으로 정리한 후 재통과했다.

배포: 기존 APK를 `install -r`로 갱신했고 Docker 웹을 재빌드했다. 검토용 APK·소스는 `scripts/package-contest.py`로 생성한다. 현재 작업 트리와 기준 HEAD를 명시하며 최종 제출 커밋과 일치한다고 주장하지 않는다. 외부 업로드·저장소 공개·메일 발송은 하지 않았다.

남은 검증: 원본 캡처·보관·휴대폰 전달의 공개 지원/공모전 허용 근거, 실차 위치·마이크·오디오 정책, 자동차 화자 v4의 실제 모델 품질. 사진·주행 규제를 우회하거나 원본 기능을 임의 승인으로 표시하지 않는다.

공개 근거: [FusedLocation 권한](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/FusedLocation/declaring-permissions), [TTS 초기화](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/TextToSpeech/initialization-and-release), [TTS 지원 locale](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/TextToSpeech/set-locale), [공모전 개발 범위](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000008).

C021 정리: 최종 상태 알림은 변경 이벤트 수신·HTTP pull 시작 때 즉시 UI로 전달한다. 검증용 위치 권한(user0/user10)을 원래 거절 상태로 복구했다. 실제 사용할 때 차량 설정의 ‘녹음 위치 사용 설정’에서 직접 허용한다. 최종 APK를 설치한 뒤 테스트용 에뮬레이터와 빌드 데몬을 종료하며, Docker 서버는 기존처럼 실행 상태로 유지한다.


## C023 — 완성 일기 자동 동기화

2026-11-11, Pleos Connect 2.1.0/API34 ARM64 에뮬레이터(사용자10), Docker HTTPS 실제 개발 서버, 독립 headless Chrome의 모바일 viewport에서 확인했다. 실제 사용자 음성 대신 전용 QA 보관함의 합성 WAV·사진·목업 일기를 사용했다. 호스트 마이크를 명시적으로 껐으며 실제 OpenAI 호출은 없다.

### 구현

- 차량의 native/WebView 최종 저장과 재확정이 확정 snapshot을 AtomicFile outbox에 기록하고 전송한다. 최초 연결 전 완성본도 이관하며 미확정 초안은 제외한다. 저장과 outbox 사이 중단은 다음 실행의 스캔으로 복구한다.
- vault/device/file/revision, 고정 snapshot·payload·멱등 키, snapshot/audio 단계, 실패 횟수·다음 시각을 저장한다. 사진 변경의 server revision과 로컬 input revision을 구분한다. 사진만 달라진 충돌은 기존 snapshot 구조를 비교해 재조정하고 내용 충돌은 자동 덮어쓰지 않는다.
- 앱 실행/복귀/최종 저장, 네트워크 가용 콜백과 Android JobScheduler의 네트워크 제약·영속 예약/지수 backoff를 연결했다. 주기적인 서버 데이터 폴링은 없다. 백그라운드 전송은 사용 중 로컬 미디어/텍스트를 교체하지 않는다.
- 최초 연결 안내와 녹음 동의 문구를 자동 보관 범위에 맞췄다. 필수 공유 버튼을 제거하고 작성 중/연결 필요/동기화 대기·중·완료/확인 필요 상태를 표시한다. 모바일은 원본 준비 전에는 ‘원본 전송 대기’로 표시한다.
- 삭제 의도를 먼저 영속화해 대기 업로드보다 우선한다. 인증 철회는 자동 재시도를 멈추며 미전송 원본과 이전 보관함 소유권을 보존한다. 서버 삭제/철회의 로컬 사본 정리는 주차·유휴 gate에서 처리한다.

### 실행 결과

- `pnpm test`: 97/97, `pnpm typecheck` 통과. Android unit 21/21. `assembleProbeDebug`, `assembleProbeDebugAndroidTest`, `assemblePleosRelease` 성공. 실차 release 잠금은 유지했다.
- `scripts/test-c023-upload.ts`: 네이티브 instrumentation 15회 단계 실행 통과. 첫 연결의 기존 완성본 이관/초안 제외, 오프라인 대기, 새 instrumentation 프로세스의 복구, 사진 revision 경합, snapshot 성공 응답 유실의 같은 키 재전송(추가 revision 없음), 로컬 삭제 우선, 원격 삭제 뒤 부활 방지, 내용 충돌 시 로컬 보존, 인증 철회 중단·다른 vault 소유권 결속 거절을 확인했다.
- 같은 검사에서 화면 없이 실제 Android JobScheduler/JobService가 누락된 outbox 등록을 복구하고 전송한 뒤 예약 작업을 종료했다. 최종 저장 버튼만 클릭한 별도 UI 단계에서도 `share`/수동 `flush` 없이 원본까지 전송됐다.
- `scripts/test-c023-mobile.ts`: 이미 열어 둔 로그인 모바일 웹에 새 일기가 SSE로 나타났고, 원본 전송 대기→완료 전환을 새로고침 없이 확인했다. 인증된 원본 다운로드의 SHA256이 차량 합성 원본과 일치했다. `connected-ui/c023-mobile-auto.png`를 확인했다.
- `scripts/test-c017-receive.ts`: 기존 SSE 사진 수신·사진 순서·자동 상세 갱신·gate 종료 후 무폴링 통과. `DrivingModeDeviceTest` 1개 통과(모의 주행 오디오/검토 잠금). `scripts/test-c021-ui.ts`의 차량1280×720/휴대폰375×812·812×375 상태/필터/overflow 검사 통과.
- 현재 맥북 IP 변경을 확인해 기존 계정·DB·미디어를 유지한 채 `refresh-runtime.ts`로 개발 연결을 갱신했다. 최종 웹 이미지를 재빌드하고 APK를 설치했다. 개인 연결의 내용/토큰을 출력하지 않고 전송 완료/대기 작업 개수만 점검했다.

### 경계와 후속

이 결과는 에뮬레이터·개발 서버·모바일 크기 Chrome의 합성 검증이다. 실차 전원/OS 절전·강제 종료 이후 즉시 실행, 이번 변경의 실제 iPhone Safari 조작, 실제 OEM 원본 보관 정책은 별도 확인 대상이다. 예약 작업은 OS가 허용하는 때 실행되며 강제 종료를 우회하지 않는다. 내용 충돌은 보존·차단까지 제공하며 양쪽 내용을 비교해 병합하는 전용 UI는 후속이다. 정확한 발언 타임라인(C023f)은 별도 미완료다. 다음 기능은 차량·모바일 웹 라이트/다크(C022b), 이후 TTS 플레이리스트(C022c)다.

종료 확인: 이번 검증용 emulator-5580을 종료했고 Gradle 데몬이 없음을 확인했다. 개인 개발 서버는 유지했다. `upload-qa` 전용 파일을 정리했으며 최종 APK의 `assets/app.js`가 현재 웹 소스와 바이트 단위로 일치한다. 로컬 검토 묶음을 갱신했다(외부 제출/커밋/푸시 없음).


## C024 — 검색·필터 통합과 차량·모바일 테마

2026-11-11. `ui-ux-pro-max`의 대비/포커스 지침을 적용하고 기존 화면 구조를 유지했다. 검색어+기록 당시 차량 조건을 하나의 검색·필터 패널로 통합했으며 모바일 목록 소개 제목을 제거했다. 모바일 가족 메뉴와 차량 설정에서 자동/라이트/다크를 기기별로 저장한다.

차량은 Android Configuration uiMode, 모바일은 prefers-color-scheme을 따른다. 차량 신호 미확인 시 마지막 상태(없으면 다크)를 사용한다. native 뷰 색상과 WebView CSS 변수만 갱신하므로 Activity/편집 DOM을 재생성하지 않는다. 사진 자체를 반전하지 않는다. 인증 화면에도 같은 브라우저 설정을 적용했다. 서버 API/DB 스키마 변경은 없다.

검증:

- `scripts/test-c024-ui.ts`: 독립 headless Chrome, 375×812/812×375/1280×720. 제목 제거·단일 검색 진입점·검색어와 차량 AND 조건·Enter/적용/초기화·조건 유지, 두 테마/가로 넘침 없음, 수동 우선·새로고침 유지·자동 전환 중 입력 값과 DOM 보존 통과. 실제 HTMLAudio의 합성 WAV 재생 위치도 전환 후 계속 진행됐다. 상세/원문/연결/차량 홈·검토·녹음 화면의 표시 텍스트 대비를 검사했고 주요 PNG를 시각 확인했다.
- `ThemeDeviceTest`: 에뮬레이터 사용자10의 실제 `cmd uimode night` 전환. Activity 유지·native 색상 변경·수동 우선, 서비스 원본 재생 위치 증가, AudioRecord 녹음 시간 증가, WebView 수정 중 문장/같은 DOM 보존 통과(1/1). 주행 전환·검토 제한·포커스 중단·합성 원본 SHA 회귀 포함. 호스트 마이크는 껐으며 검사 전 테마 설정은 복구했다.
- `scripts/test-c023-mobile.ts`: 실제 Docker HTTPS 로그인에서 자동 다크/라이트, 저장된 수동 설정과 재접속·일기 화면 이동 유지 통과. 새 일기/원본 완료의 SSE 자동 반영 및 원본 SHA 일치도 통과. QA 기록·기기 연결은 정리했다.
- `pnpm test` 97/97, `pnpm typecheck`, Android unit 21/21 통과. probe debug·계측 APK·pleos release 빌드 성공. 로컬 포트 bind가 샌드박스에서 거절된 최초 Vitest 실행은 권한을 받아 재실행해 통과했다.
- Docker 웹 재빌드/healthy 확인 및 `install -r` 최종 APK 반영 완료. 기존 사용자 기록/연결/볼륨을 유지했다. 실제 OpenAI 호출은 하지 않았다.

화면 증거: `connected-ui/c024-phone-375-light.png`, `c024-phone-375-dark.png`, `c024-car-1280-light.png`, `c024-car-1280-dark.png`, `c024-cardetail-dark.png`, `c024-recording-light.png`, `c024-login-dark.png`.

한계: 실제 차량이 터널·야간 신호를 uiMode로 전달하는지는 미검증이며 시간/GPS 추정 감지를 추가하지 않았다. 모바일 자동 전환은 OS 테마를 따른다. iPhone Safari 실기기 조작·실차 원본 정책·release 기능 잠금은 별도 확인 대상으로 유지한다. TTS 플레이리스트(C022c)는 이번 범위에 포함하지 않았다.

공식 근거: [Android 다크 테마](https://developer.android.com/develop/ui/views/theming/darktheme), [Configuration.UI_MODE_NIGHT_MASK](https://developer.android.com/reference/android/content/res/Configuration#UI_MODE_NIGHT_MASK).

종료 정리: 테스트용 emulator-5580과 프로젝트 Gradle 데몬을 종료했다. Docker 개발 서버는 유지한다. 최종 APK의 faithful HTML/JS/CSS 6개 자산이 소스와 바이트 단위로 일치함을 확인했다. 로컬 검토 묶음은 작업 트리 스냅샷이며 외부 제출·커밋·푸시는 하지 않는다.


## C025 — 차량 TTS 플레이리스트

2026-11-11. 기존 공식 Pleos ON_DEVICE TTS와 PlaybackService를 확장했다. 모바일 웹 TTS·새 외부 API·DB 변경은 없다.

구현:

- 주차 목록에서 검색/차량 조건의 완성본 전체를 최신순(ID 동률 정렬)으로 고정해 이어 듣는다. 초안/미확정/빈 본문과 중복 ID를 거절하고 시작 직전 확인문 저장 후에도 완성본이 변하지 않았는지 다시 검사한다. 큐는 최대500개, 정상 완료만 다음 항목으로 이어지며 끝에서 종료한다.
- 상세 한 편 읽기, 주행 native의 최소 시작/이전/다음/종료, MediaSession 이전/다음과 알림 조작을 연결했다. 주행은 본문 대신 순번·개수를 표시한다. 주차 상태 응답도 본문을 추가하지 않는다.
- 큐 동안 하나의 엔진을 유지한다. 초기 구현의 항목별 stop/release가 다음 요청과 겹치는 간헐적 SDK onStop을 실제 반복 실행에서 발견해 수정했다. 명시적 이동은 onStop 확인 후 전환하며, 항목별 generation으로 늦은 이벤트를 무시한다. focus/UNKNOWN/SDK stop/error/초기화·전환 timeout/사용자 stop은 큐를 폐기한다. 프로세스 재시작 시 복원·자동 시작하지 않는다.
- TTS 중 원본 진행/파형과 중복 한 편 읽기 버튼을 숨긴다. 기존 테마 토큰과 큰 터치 영역을 유지한다. 원본 일시정지 기능은 유지하고 TTS 정확한 시점의 pause/resume은 추가하지 않았다.

검증:

- `PlaylistDeviceTest`: 전용 합성 파일/일기와 격리한 로컬 저장소. 실제 SDK 첫 onStart→자연 onDone→내비게이션 뒤 다음 항목 onStart, 주행 시작·이전·다음·경계·알림 종료, stale callback, focus loss/duck→gain 무재개, UNKNOWN 복구 무재개, SDK stop/error 및 timeout, 최종 정상 완료 무반복 통과. 미확정/중복 큐 거절과 주행 중 임의 큐 선택 차단 확인. 엔진 수명 수정 후 단독 검사 2회 연속 및 최종 회귀에서 통과했다. 주행 조작 버튼의 visible rect가 전체 높이를 포함하는지 검사하고 screenshot을 확인했다.
- 최종 계측 `PlaylistDeviceTest,PlaybackLocationDeviceTest`: 3/3 통과. 원본 내비게이션/Activity 재생성 유지, UNKNOWN/포커스 정책, 공식 한 편 TTS/알림 종료 회귀 포함. 실제 마이크는 껐고 사용자 음성·사진은 쓰지 않았다. 직접 주입한 포커스/오류 콜백을 실차 통화 실험으로 주장하지 않는다.
- `scripts/test-c025-ui.ts`: 독립 headless Chrome 1280×720에서 차량 조건과 검색·완성본 제외·정렬 payload, 첫/끝 이동 비활성·정지 상태, 라이트/다크 목록·상세·검토·녹음 화면, 텍스트 대비/수평 overflow 검증 통과. 첫 복사본에 포함됐던 모바일 Audio 검사는 이 실행 환경에서 시간이 진행되지 않아 통과하지 못했으며 이번 차량 변경의 성공 근거에 포함하지 않았다. C024의 기존 모바일 결과와 구분한다.
- Android unit21/21, TypeScript typecheck, JS 문법 검사 및 probe debug/계측 APK/pleos release 빌드 성공. 실차 release 잠금 유지.
- `connected-ui/c025-car-1280-light.png`, `c025-car-1280-dark.png`, `c025-detail-active-dark.png`, `c025-driving.png`를 시각 확인했다. SDK 모의 주행은 실차 허용 증거가 아니다.

적용/한계: 최종 차량 APK를 기존 데이터를 유지하는 install -r로 적용했다. Docker 엔진이 info/compose 모두 응답하지 않아 웹 이미지 재빌드는 미완료다. 요청한 차량 기능은 APK에 포함된 HTML/JS/CSS로 동작한다. 대기 중인 이번 Docker 명령만 종료하고 OrbStack/다른 컨테이너는 재시작하지 않았다. 모바일 TTS, 실차 OEM 정책, 실제 통화 혼합 음량은 별도다.

공식 근거: [TTS 이벤트](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/TextToSpeech/event-listeners), [시작과 중지](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/TextToSpeech/start-and-stop), [엔진 초기화/해제](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/TextToSpeech/initialization-and-release), [Android MediaSession.Callback](https://developer.android.com/reference/android/media/session/MediaSession.Callback).

최종 설치 후 PlaylistDeviceTest 1/1 재통과. 최종 APK의 faithful 자산 6개와 소스가 바이트 단위로 일치한다. 검증용 에뮬레이터 및 이번 프로젝트 Gradle/Kotlin 컴파일 데몬을 종료했다. 로컬 검토 묶음을 갱신하며 외부 제출·커밋·푸시는 하지 않는다.


## C026 발언별 원본 타임라인

구현·검증·기존 STT 실패·Docker 재배포 미완료 범위는 [C026 증거](c026-original-timeline.md)에 기록했다. 최신 차량 APK와 로컬 UI/계약 검증을 실서버 동기화 검증으로 혼동하지 않는다.

C026d 후속 완료: 최신 Docker 이미지/현재 LAN 주소 반영 후 실제 STT 구간의 차량 자동 업로드→모바일 SSE/구간 재생→사진 추가→차량 증분/빈 저장소 복원 검증 통과. 기존 데이터 볼륨 유지 및 이전 C025 웹 배포 보류 해소. 상세는 [C026 증거](c026-original-timeline.md) 후속 서버 반영 절.


## C027 설정 복귀·테마·파형

설정→녹음/일기 화면 복귀, 태양/달 바로 전환, CSS 문자열에 의존하던 파형 연결을 수정하고 최종 APK 및 Docker 서버에 반영했다. 실제 WebView/합성 PCM·독립 UI·HTTPS SSE/테마 검사 통과. [상세 증거](c027-navigation-theme-wave.md).

## C028 반영 (2026-11-12)
자동 테마 피드백, 빈 차량 필터 통합, 모바일 패널 X·가족 메뉴 정리, 실제 TTS 종료 수정 APK/서버 적용. 합성 계정 HTTPS 및 에뮬레이터 검증·제약은 [C028 증거](c028-controls-and-playback.md)를 참조한다.

## C029 반영 (2026-11-12)
검색 명칭/모바일 수동 테마 및 PNG 기반 차량 설정 APK/서버 적용 완료. [설정 재설계 증거](c029-settings-redesign.md) 참조.

## C030 반영 (2026-11-12)
차량 공통 왼쪽 바와 단일 테마 순환 제어를 APK/개발 서버에 반영했다. [검증 근거](c030-common-vehicle-rail.md).

## C031 반영 (2026-11-12)
차 별명 단일화와 기기 이름 변경 SSE 알림을 APK/개발 서버에 반영했다. 실행 중 맥북 IP 변경을 확인해 기존 refresh-runtime 절차로 주소와 차량 인증서 설정을 갱신했다. 계정·연결·저장 볼륨은 유지했다. [검증 근거](c031-unified-vehicle-name.md).

## C032 반영 (2026-11-12)
참조 디자인의 주행 음성 화면·시험 전환 버튼·미녹음 시 주차 홈 복귀를 APK/서버에 반영했다. [검증 근거](c032-driving-reference-and-home.md).
