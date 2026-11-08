# HMG Family Diary

차에서 자유롭게 풀어놓은 가족 이야기를 LLM이 분류·정제해 **일기와 실제 목소리**로 남겨,
차량과 휴대폰에서 다시 읽고 듣는 가족 여행 기록 서비스.

현재는 기능 명세에 따른 구현 계획·데이터 모델·계약·38개 작업을 작성한 단계다.
앱·SDK 실행·모델 평가·사용자 인터뷰 결과는 아직 없다.

## 먼저 읽을 문서

1. [제품 정의](docs/product-brief.md): 타깃, 해결할 문제, 베스트 시나리오, 성공 기준
2. [첫 기능 명세](specs/001-family-trip-memory/spec.md): 사용자 여정, 요구사항, 수용 조건
3. [제품 결정 이력](docs/decisions.md): 원본 음성·양쪽 기기 재생의 첫 버전 포함 결정
4. [구현 전 기술 근거](docs/technical-evidence.md): 실제 검증이 필요한 차량 기능
5. [헌장](.specify/memory/constitution.md): 개발·기록·검증 원칙
6. [명세 품질 점검](specs/001-family-trip-memory/checklists/requirements.md)
7. [구현 계획](specs/001-family-trip-memory/plan.md) · [조사·기술 결정](specs/001-family-trip-memory/research.md)
8. [작업 목록](specs/001-family-trip-memory/tasks.md) · [검증 절차](specs/001-family-trip-memory/quickstart.md)
9. [데이터 모델](specs/001-family-trip-memory/data-model.md) · [API 계약](specs/001-family-trip-memory/contracts/http-api.md)

## Spec Kit

공식 `specify-cli==1.3.2`로 초기화했다. Codex용 skills, Bash 스크립트,
기본 템플릿과 SDD workflow를 포함한다. 에이전트 이벤트 자동 실행은 사용하지 않는다.
Git 작업은 일반 Git으로 관리한다.

새 체크아웃에서 버전과 설치 상태를 확인한다. Python 3.11+와 uv가 필요하다.

```sh
uvx --from specify-cli==1.3.2 specify version
uvx --from specify-cli==1.3.2 specify integration status
```

이 저장소를 작업 폴더로 열고 에이전트 채팅에서 아래 순서로 진행한다.
이름은 쉘 명령이 아니라 설치된 skill 호출이다.

- `$speckit-constitution`: 현재 헌장 1.1.0. 원칙 변경이 있을 때 갱신
- `$speckit-specify`: 현재 `specs/001-family-trip-memory/spec.md` 기준선 작성 완료
- `$speckit-clarify`: 추가 제품 판단이 필요할 때 사용
- `$speckit-plan`: 기술 조사·조건부 구현 계획 작성 완료. 실제 차량 G0~G2는 미통과
- `$speckit-tasks`: 38개 작업 작성 완료, 전부 미실행
- `$speckit-analyze`: spec·plan·tasks 정합성 읽기 검토
- `$speckit-implement`: 다음 단계. T001~T006 환경·캡처·주차 검증부터 시작

새 체크아웃의 기능 선택은 다음과 같이 지정한다. `.specify/feature.json`은
spec-kit이 관리하는 기기별 상태여서 Git에 포함하지 않는다.

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/001-family-trip-memory
```

에이전트에는 위 기능 디렉터리를 명시해도 된다. 현재 코드가 없으므로 빌드·앱 실행 명령은 없다.
명세 수정 뒤 제품 정의·수용 조건·체크리스트를 같이 검토한다.

## 출처와 초기화

[GitHub Spec Kit](https://github.com/github/spec-kit)의 공식 PyPI 배포판을 사용했다.
초기화 명령은 다음과 같다. 이미 초기화된 이 체크아웃에 다시 실행할 필요는 없다.

```sh
uvx --from specify-cli==1.3.2 specify init hmg-family-diary \
  --integration codex --integration-options='--skills --events false' \
  --script sh --non-interactive --ignore-agent-tools
```

재사용한 Spec Kit 구성요소의 MIT 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있다.
애플리케이션 자체의 공개 라이선스는 아직 지정하지 않았다.
실제 가족 녹음·개인 기록·정확한 위치·계정 비밀정보는 저장소에 추가하지 않는다.
