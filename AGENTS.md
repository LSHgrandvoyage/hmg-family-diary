# HMG Family Diary 작업 규칙

- `.specify/memory/constitution.md`를 먼저 읽고 따른다.
- 제품 정본은 `docs/product-brief.md`, 기능 정본은 `specs/001-family-trip-memory/spec.md`다.
- 가족 여행일기·원본 음성 보관·차량과 휴대폰 양쪽 읽기·듣기는 첫 버전 요구사항이다.
- 입력은 자유 발화이며 LLM이 사건·장소·시점·주제를 분류·정제한다. 한마디·한 장소·짧은 발화 형식을 강제하지 않는다.
- 타깃의 세부 조건은 초기 가설이다. 인터뷰·실행하지 않은 결과를 완료로 쓰지 않는다.
- 서버 실행 정본은 Docker Compose 단일 호스트·Postgres·Better Auth·비공개 파일 볼륨이다. Supabase를 재도입하지 않는다. 저장 경로는 AudioStore 뒤에 두며 runtime-and-storage 계약을 따른다.
- 현재 plan·tasks가 작성돼 있다. 구현 전에 spec·plan·contracts·tasks를 읽고 해당 요구사항과 완료 증거를 연결한다.
- T001~T006 및 G0~G2가 실제 플랫폼의 첫 검증이다. 합성 자료 검증으로 원본 캡처·주차 판정 통과를 대신하지 않는다.
- 생성된 `.agents/skills/`와 `.specify/templates/`를 제품 내용으로 덮어쓰지 않는다.
- 다른 기기의 feature pointer를 가정하지 말고 작업할 기능 디렉터리를 명시한다.
- 차량 기능은 실제·에뮬레이터·모의 입력 여부를 기록한다. 원본 음성 접근을 STT 텍스트만으로 입증하지 않는다.
- 개인 음성·위치·기기 비밀·실제 고객 데이터는 Git에 넣지 않는다. 검증 fixture는 합성임을 표시한다.
- 작업 결과에는 바꾼 명세와 검증 범위·미검증 의존성을 간단히 적는다.
