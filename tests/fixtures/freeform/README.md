# 합성 자유 발화 사례

E01~E12 JSON의 모든 이름·내용은 개발용 합성 자료다. `expected_review`는 사람이 확인할 의미 기준이며 실제 모델 평가 결과가 아니다. E08의 늦은 이벤트는 Android CaptureCoordinatorTest가 별도로 검증한다. E11 오류 주입은 contracts 테스트에서 수행한다. E12는 침묵 입력 외에 공급자 거절·잘림 오류를 별도 검증해야 한다.

음성 fixture는 `pnpm fixture:audio`로 생성한다. 16kHz/mono/16bit PCM WAV이며 사람 목소리가 아닌 두 구간의 시험 신호다. Range·checksum·탐색 동작에만 사용하며 STT나 G1 통과 증거로 사용하지 않는다. 실제 가족 녹음은 이 경로에 넣지 않는다.
