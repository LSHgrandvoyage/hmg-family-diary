# 첫 구현 결과 — 2026-11-08

현재 차량 화면: [차량 UI 통합](vehicle-ui.md) — 기존 녹음 실험 앱에 보관함·녹음·상세와 차량 스냅샷·기기 사진을 연결했다. 제품 동기화 완료는 아니다.

이 문서의 아래 본문은 첫 구현 시점의 기록이다. 이후 상태는 다음 증거를 우선한다.

- [월별 보관함·전체 녹음 타임라인](timeline-validation.md)
- [당시 차량·녹음 시작 위치](vehicle-context-validation.md)
- [브라우저 사진 첨부·근접 과거 기록](photos-recall-validation.md)
- [녹음 실험 앱](g1-capture.md): 원본 저장·재생, Pleos 온디바이스 STT 콜백, JVM12개·기기 시나리오1개 검증.
  사용자 수동 테스트로 맥북 마이크 녹음·원본 청취도 확인했다.
- [STT 분리 검증](stt-validation.md): host GPU 환경에서 동일 합성 입력의 전체 문장 인식과 반복 발화·말끝 보존 확인.
  실제 자유 발화·장시간 입력·실제 주차 신호는 미완료. 제품 경로는 잠금 유지.
- [검토·생성 실험](review-generation.md): 원본 연결 확인문·인식문 이력·초안 revision 저장, OpenAI Responses adapter와
  로컬 실험 서버, 생성 실패·앱 재실행 복구 검증. 실제 OpenAI API는 미실행.
- [웹 품질 보정](g3-generation-v2.md): Haiku 웹 기준선/보정 실험, 의미 품질 일부 오류 잔존.
- [목업 생성·저장·재열람](mock-generation.md): 사용자 결정으로 API 연결을 미루고 명시적 목업 HTTP 응답을 사용한다.
  저장본 모드 표시·재열람·같은 원본 재생과 수정 무효화를 합성 자료로 확인했다.

## 최초 구현 시점

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

## 2026-11-09 Docker 연결 slice

확인된 로컬 목업 snapshot·단일 실제 WAV·보관함 인증·차량 pairing·휴대폰 읽기/듣기/다운로드·사진 업로드/차량 수신·삭제/폐기를 연결했다. [실행 증거](compose-runtime.md)와 `tasks.md` C001~C005를 참고한다. T007/T009/T016/T022~T034/T039/T045의 부분 구현이며 T040·기기 암호화·일반화 청크/생성 파이프라인·실제 플랫폼 gate 전체 완료가 아니다.
