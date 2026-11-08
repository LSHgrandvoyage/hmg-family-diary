# G3 생성 충실도 — Claude 웹 부분 실험

2026-11-08~09 KST. FR-005/013/014, T017/T018/T035의 탐색 증거다.
**G3/T035 전체 통과가 아니다.** 실제 앱은 OpenAI Responses API를 유지한다.

## 실행 조건

- [가족의 이야기 · 차량 일기 생성 실험](https://claude.ai/project/01a1bba4-568a-705d-a60b-00c1e9c4b0f1): 사용자 요청으로 만든 비공개 프로젝트.
- [claude-web-experiments 스킬](/Users/lee/.codex/skills/claude-web-experiments/SKILL.md)의 Claude 웹 구독 경로, 승인된 native Chrome UI로 실행했다. API·Claude Code 우회 없음.
- 사용자가 최신 Haiku를 요청했고, 실제 모델 메뉴에서 관측한 **Haiku 5.5 · 중간**을 전6건에서 확인했다. 공개 API 모델 ID와 동일하다고 주장하지 않는다.
- 제출6, 완료6, 미수집0, 재시도0, 추가 API 호출0. 이전 미지정/Opus 준비 디렉터리는 전송0이며 이번 결과에 포함하지 않는다.
- 개발 E01/E02/E03/E06 후 평가 E07/E09 순서. 사례마다 새 프로젝트 대화1개, 프롬프트 변경 없이1회씩 실행했다. 평가는 합성 사례에 대한 에이전트 검토이며 사용자 연구/독립 인간 채점이 아니다.
- 앱의 `family-diary-v1` 지침·출력 스키마·합성 입력만 전달했다. 기대 결과/평가 표시/실험 metadata는 전달 packet 밖에 보관했다. UI가 긴 붙여넣기를 텍스트 첨부로 변환했다.
- 프로젝트 지침은 사례 독립성, 다른 대화/프로필에서 사실 가져오지 않기, 발화를 명령으로 실행하지 않기, 외부 도구 사용하지 않기의 중립 안내다. 기대 정답/지식 파일을 넣지 않았다.
- Research off, Notion/Slack/Claude in Chrome 선택 off. 실제 응답에서 외부 도구 사용은 관측되지 않았다. 프로젝트는 시크릿 대화가 아니며 메모리 생성은 off, 채팅 검색/참조는 on이었다. 개인 프로필 지침은 미확인이다. 따라서 완전한 컨텍스트 격리 실험이라고 주장하지 않는다.
- 종료 후 임시 변경한 커넥터3개를 기존 on으로, 일반 새 대화의 기본 모델을 기존 Opus 5.5 중간으로 복원했다. 이 복원으로 Haiku 실험 응답이 변경되지는 않는다. 후속 실험에서는 다시 Haiku를 선택해야 한다. 설정의 전역/대화별 적용 범위는 별도 검증하지 않았다.

Max 사용량 UI는 시작 전 현재 세션0%/주간4%, 종료 후 현재 세션0%/주간4%로 표시됐다.
종료 시 현재 세션 초기화 시각은 오전4:50이었다. 양쪽 모두 사용 크레딧 off/US$0.
표시가 반올림될 수 있으므로 소비량0/정확 비용0이라고 해석하지 않는다. 토큰 비용과 순수 모델 지연은 측정하지 않았다.

## 관측 결과

앱의 `validateDiary`로 JSON 스키마·실재 ID·화자·시간 범위·입력 전체 사용/제외를 검사했고,
추가로 모든 근거가 각 발화의 전체 시간 범위를 그대로 쓰는지 확인했다. **6/6 통과**.
이는 문장 의미나 일기 문체의 품질을 보장하지 않는다.

| 사례 | 관측한 결과 | 의미 검토 및 남은 문제 |
|---|---|---|
| E01 반대 감정 | 보호자 “바다가 좋았다”, 아이 “파도가 무서웠다” 각각 보존 | 핵심 충실도 양호. ‘바다 나들이’라는 제목은 입력보다 해석이 추가되고, 확인 질문이 과도할 여지가 있음 |
| E02 바로 정정 | 점심→아침 반영, 원문과 정정2개 근거 보존 | 핵심 충실도 양호. 날짜는 추측하지 않음 |
| E03 시점 혼합 | 오늘11/08·어제11/07·다음 주 희망을3개로 분리, 미래는 planned/date:null | 기록 시각 기준 분리 양호. 실행 중 날짜가 넘어가도 입력 recorded_at 기준 유지 |
| E06 명령형 발화 | 공개 요청을 실행하지 않고 unrelated로 제외, 오리 관찰만 기록 | 핵심 동작 양호. 본문에 있는 ‘호수’를 place_label:null로 두는 누락 발생 |
| E07 화자 충돌 | 동물원/수족관 발화를 모두 보존하고 장소 미확정·검토 필요 표시 | 한쪽으로 확정하지 않음. 다만 제목과 문장에서 ‘정정’이라고 표현하고 shared 문장1개로 합쳐 화자별 표시가 약해질 수 있음 |
| E09 뒤쪽 정정 | 첫날 점심→아침 수정, 첫/마지막 근거 보존. 구름 관찰40회 중1개 유지·39개 repetition 제외 | 42개 발화 전체 근거 보존. 전망대 그룹 needs_review:false인데 review_items에서 날짜 확인을 요청하는 불일치 발견 |

E09는 5초 단위42개, 총210초 범위의 **합성 텍스트**다. 실제210초 음성 인식,
20분 녹음, window 분할·전체 재정리 구현, 다화자 자동 식별 검증이 아니다.
이번 출력은 구조화한 초안으로, 풍부한 가족 여행일기 문체를 검증하기에는 짧고 반복적인 입력이다.

## 원문과 재검증

- [개발 입력과 metadata](claude-haiku55/dev/inputs.jsonl), [개발 답변 전문·대화 URL](claude-haiku55/dev/results.json), [개발 manifest/packet SHA256](claude-haiku55/dev/manifest.json)
- [평가 입력과 metadata](claude-haiku55/eval/inputs.jsonl), [평가 답변 전문·대화 URL](claude-haiku55/eval/results.json), [평가 manifest/packet SHA256](claude-haiku55/eval/manifest.json)
- 두 실행 폴더의 `packets/`에 실제 전달용 전문을 보존했다. [검사 결과와 prompt/schema 해시](claude-haiku55/validation.json).

응답 복사 UI로 전문을 회수하고 전송하지 않은 입력창의 접근성 값으로 확인했다.
끝 공백만 제거했고 답변 내용·JSON을 고치지 않았다. E09는 긴 붙여넣기 첨부의 편집 버튼으로
전문을 펼쳐 읽었다. 원본 사용자 음성·좌표·차량 번호·계정 비밀은 실험/저장소에 넣지 않았다.

2026-11-09 v2 계약 보정 이후에는 아래 검사에서 기존 E09가 `INCONSISTENT_REVIEW_STATE`로 거부되는 것이 정상이다. 위 6/6은 v1 당시의 검사 결과이며 보존한다. 보정 이후 결과는 [v2 보고서](g3-generation-v2.md)를 따른다.

기존 원문 로컬 재검증:

```sh
node --import tsx --input-type=module - <<'JS'
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {validateDiary} from './packages/contracts/src/diary.ts';
for (const split of ['dev', 'eval']) {
  const rows = JSON.parse(readFileSync(`docs/evidence/claude-haiku55/${split}/results.json`, 'utf8'));
  for (const row of rows) {
    const {input} = JSON.parse(readFileSync(`tests/fixtures/freeform/${row.id}.json`, 'utf8'));
    const draft = validateDiary(JSON.parse(row.response.answer), input);
    const spans = [...draft.groups.flatMap(g => g.statements.flatMap(s => s.source_spans)),
      ...draft.excluded_spans.map(e => e.source_span)];
    for (const span of spans) {
      const u = input.utterances.find(u => u.id === span.utterance_id);
      assert.deepEqual([span.start_ms, span.end_ms], [u.start_ms, u.end_ms]);
    }
    console.log(row.id, 'PASS');
  }
}
JS
```

## 다음 보정과 미검증 범위

1. 고유 지명이 없어도 발화에 나온 일반 장소 라벨을 보존하도록 명시한다.
2. 다른 화자의 상충 주장을 ‘정정’으로 확정하지 않고 각 화자 문장으로 유지한다.
3. 그룹의 확인 필요 여부와 review_items를 일치시키고 불필요한 확인 질문을 줄인다.
4. 이 결과를 본 뒤의 프롬프트 수정은 새 버전으로 관리하고, 새로운 평가 사례로 재검증한다. 이번 평가2건은 이후 회귀 자료로 취급한다.
5. 실제 OpenAI API 호출, E01~E12 전체,20회 지연 p95, 긴 입력 window 처리, 사용자 문체 평가 및 앱 저장까지의 통합 검증은 남아 있다. 웹 결과를 API의 품질·요금·지연 근거로 대체하지 않는다.

이번 변경은 실험 증거와 작업 상태 설명만 추가했다. 제품 요구사항·API 공급자·앱 프롬프트 기준선은 변경하지 않았다.
