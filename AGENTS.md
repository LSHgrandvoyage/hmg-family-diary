# HMG Family Diary 작업 규칙

- `.specify/memory/constitution.md`를 먼저 읽고 따른다.
- 제품 정본은 `docs/product-brief.md`, 기능 정본은 `specs/001-family-trip-memory/spec.md`다.
- 가족 여행일기·원본 음성 보관·차량과 휴대폰 양쪽 읽기·듣기는 첫 버전 요구사항이다.
- 타깃의 세부 조건은 초기 가설이다. 인터뷰·실행하지 않은 결과를 완료로 쓰지 않는다.
- 현재 단계는 제품 정의와 명세다. 구현 전 plan·tasks를 작성하고 요구사항에 연결한다.
- 생성된 `.agents/skills/`와 `.specify/templates/`를 제품 내용으로 덮어쓰지 않는다.
- 다른 기기의 feature pointer를 가정하지 말고 작업할 기능 디렉터리를 명시한다.
- 차량 기능은 실제·에뮬레이터·모의 입력 여부를 기록한다. 원본 음성 접근을 STT 텍스트만으로 입증하지 않는다.
- 개인 음성·위치·기기 비밀·실제 고객 데이터는 Git에 넣지 않는다. 검증 fixture는 합성임을 표시한다.
- 작업 결과에는 바꾼 명세와 검증 범위·미검증 의존성을 간단히 적는다.
