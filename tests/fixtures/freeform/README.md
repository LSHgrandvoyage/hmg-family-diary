# 합성 자유 발화 사례

E01~E12 JSON의 모든 이름·내용은 개발용 합성 자료다. `expected_review`는 사람이 확인할 의미 기준이며 실제 모델 평가 결과가 아니다. E08의 늦은 이벤트는 Android CaptureCoordinatorTest가 별도로 검증한다. E11 오류 주입은 contracts 테스트에서 수행한다. E12는 침묵 입력 외에 공급자 거절·잘림 오류를 별도 검증해야 한다.

2026-11-09 prompt-v2: E06/E07/E09는 기존 모델 응답을 확인한 회귀 자료다.
E13(일반 장소와 사람별 감정), E14(화자 충돌·자기 정정·시점 혼합),
E15(한 발화의 두 사건에 걸친 모호한 시점)는 v2 실행 전에 작성한 새 합성 평가 입력이다.
시각 범위는 합성으로 배정했으며 실제 음성 길이나 정렬 검증 자료가 아니다.
`scripts/prepare-web-experiments.ts <new-directory> prompt-v2`로 두 세트를 분리한다.
기대 의미 기준은 metadata에만 보관하며 모델 전달 packet에 포함하지 않는다.

음성 fixture는 `pnpm fixture:audio`로 생성한다. 16kHz/mono/16bit PCM WAV이며 사람 목소리가 아닌 두 구간의 시험 신호다. Range·checksum·탐색 동작에만 사용하며 STT나 G1 통과 증거로 사용하지 않는다. 실제 가족 녹음은 이 경로에 넣지 않는다.

추가 v3: v2에서 발견한 모호한 지시 대상/월 단위 날짜를 보정한다.
E13/E14는 이제 회귀 입력이며, E16은 v3 출력 관측 전에 작성한 새 평가다.
`prompt-v3` suite로 준비한다. v2 원문·실패를 덮어쓰지 않는다.
