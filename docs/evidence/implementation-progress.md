# 첫 구현 결과 — 2026-11-08

완성 MVP가 아닌 개발 기반과 합성 읽기·재생 미리 보기다. 제품 명세의 차량 기록·양쪽 원본 재생 요구사항은 유지한다.

구현:
- pnpm6개 workspace, lockfile, Android demo/pleos flavor와 checksum 고정 Gradle wrapper.
- E01~E12 합성 자유 발화 사례. 실제 공급자 평가 결과 아님.
- JSON Schema + 화자/ID/시간/날짜/전체 입력 구간 사용·제외 추적 검증.
- WAV/checksum/크기/불변 파일/Range/경로 제한 AudioStore 기반. DB 잠금·tombstone 연동과 고아 파일 복구는 아직 없다.
- 주차·UX·focus 정책과 늦은 STT 결과 화자 유지의 순수 Kotlin 상태 모델. 실제 포트 미연결.
- `/demo` 모바일 웹에서 일기/원문 읽기, 전체·구간 시험음 재생, 재시도/종료/메모리 URL 해제.

미구현:
- 실제 마이크·STT·Pleos 차량 신호, 생성 adapter·긴 입력 정리.
- PostgreSQL 마이그레이션/RLS, Better Auth, 차량 pairing, 비공개 미디어 API, 동기화·삭제·복구.
- web/worker/db/proxy 인증 서비스용 Compose(T039), 실제 아이폰·아이패드/Safari 검증, 사용자 인터뷰.

`compose.preview.yaml`은 비밀·실제 데이터·인증이 없는 합성 화면 전용 컨테이너다.
개인 데이터용 실행 계약을 충족한 배포로 해석하지 않는다. 일반 `compose.yaml`은 해당 백엔드 작업에서 작성한다.

검증 결과는 `g0-environment.md` 및 `preview-validation.md`를 참조한다.
설정 검증기 역시 인증 서비스 시작 시 연결하기 전인 기반 코드다. UI에서 실제 데이터 입력은 제공하지 않는다.

## 작업 분할 보정

T001에 모든 후속 서비스 명령을 먼저 연결하라는 조건은 DB/worker/평가 구현보다 선행할 수 없어,
현재 단계의 실제 setup/dev/build/test/fixture 명령만 연결하고 db:migrate/status는 T007, worker는 T011,
eval은 T035에서 추가한다. 빠진 구현을 성공 반환하는 placeholder로 대체하지 않았다.
이 변경은 구현 순서 보정이며 제품 범위나 검증 목표를 줄이지 않는다.
