# C037 연결 코드6자리와 서버 설정 안내

2026-11-13. 차곡차곡0.2.1(code2), `io.hmg.familydiary.contest`.

## 변경
- 서버는 암호학적 randomInt로6자리 문자열을 발급하며 선행0을 보존한다. 신규/claim 모두6자리만 사용한다. 만료5분·일회용·기존 IP/보관함 요청 제한 유지. 기존 전역 hash 충돌은 덮어쓰지 않고 ON CONFLICT DO NOTHING으로 최대10회 재시도한다.
- 차량 WebView/native 입력은 중복 라벨 대신 placeholder `6자리 연결 코드를 입력해주세요`를 제공한다. 접근성 이름은 남긴다. 휴대폰은6칸에 한 자리씩 보여 준다.
- 서버 미설정 상태에서 release의 휴대폰 연결을 누르면 먼저 서버 설정을 안내한다. 연결 서버 설정은 PC 전달 명령을 먼저 설명하고 직접 JSON 입력·선택적 파일 가져오기를 제공한다. 미지원 파일 선택기는 직접 입력으로 이어진다.
- 실행 안내에 브라우저 CA 신뢰, 차량 서버 주소/CA 등록, 가족 보관함6자리 연결의 역할 및 순서를 설명했다.

## 실행한 검증
- 서버 handler 단위 검사9개: 선행0 발급·해시 저장, 충돌 재시도/상한,6자리 claim,8자리/짧은값/문자/숫자형 거부, 요청 제한. DB/auth 경계는 모의 객체다. 실제 PostgreSQL 충돌 경합 검사는 이번에 실행하지 않았다.
- TypeScript typecheck 통과.
- 독립 headless Chrome C037: 모바일6칸과 선행0, 차량 입력 후 placeholder 숨김/6자리 bridge 전송, 서버 미설정 시 설정 안내로 이동, 두 테마와 가로 넘침 부재. API/차량 bridge는 합성이다. 스크린샷을 시각 확인했다. 최초 검사는 비동기 발급 응답 전 비교해 실패했고 응답 후 DOM 조건을 기다리도록 검사 코드를 수정해 통과했다.
- 기존 C029/C030/C031 UI 회귀 통과.
- contestRelease 빌드·lintVital 및 Android 단위23개 통과. APK 안 settings.js/app.js/app.css가 현재 소스와 동일함을 확인했다.
- 이번 버전은 실제 Pleos/Windows에 새로 설치해 native 안내창/서버 왕복을 검증한 결과가 아니다. C035의0.2.0 실제 release 설치/음성/동기화 근거와 구분한다. Windows 설치·서버 설정·새6자리 실제 연결은 팀원 환경 확인이 남는다.

APK SHA256: `088359943a38ff036de31a5abd3b8942bf292798f5c43bf5630dcd96a8550d06`. 기존 배포용 전용 키로 서명한다. 공개 플랫폼 원본 음성 지원 범위는 여전히 미확인이다.

## 업데이트
새 소스+APK ZIP은 기존0.2.0 동결본을 덮어쓰지 않고 별도 버전 폴더로 전달한다. 정확한 소스 커밋/서명/ZIP 해시는 생성된 manifest.json과 SHA256SUMS.txt를 따른다. Windows에서는 기존 source에 새 source 내용을 덮어쓰고 `.env.team`/`.tools/team`을 유지한다. `node .\scripts\team-test.mjs up`으로 재빌드하고 APK는 `adb install -r`로 업데이트한다. 컨테이너/앱 데이터를 삭제하지 않는다. 기존 연결 token은 유지되지만 미사용8자리 코드는 새로 발급한다.

이번 작업에서는 사용자 서버/에뮬레이터를 실행하지 않았으며 독립 브라우저와 단발 Gradle 프로세스는 종료됐다.
