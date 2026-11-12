# C026 발언별 원본 타임라인

2026-11-11. 합성 입력·공식 Pleos 에뮬레이터 및 독립 headless Chrome 검증이다. 실차·사용자 실제 음성 검증과 구분한다.

## 구현

- 실시간 STT와 저장 원본 재인식에서 확정 원문 및 시작/종료 시각을 보관한다. 차량의 `일기 → 원래 이야기`, 모바일의 녹음 원문 화면에 표시한다.
- 발언 행을 누르면 전체 원본의 해당 위치부터 계속 재생한다. 재생 중인 발언을 강조하고 무음 공백에는 강조하지 않는다. 수정한 확인문·생성 일기로 원문을 바꾸지 않는다.
- 차량은 주차 확인 후에만 텍스트 타임라인을 탐색한다. 주행 전환 후 기존 원본 청취는 미디어 정책에 따라 이어가되 타임라인 조작은 차단한다.
- 시간 정보가 없는 발언은 `시간 미확인`으로 표시하며 탐색 버튼을 만들지 않는다. 기존 기록에는 임의 시각을 붙이지 않고 전체 원문·전체 원본을 유지한다. 새 녹음 또는 사용자가 명시적으로 재인식한 결과부터 적용한다.
- `snapshot.speech_timeline`은 마지막 `raw_history`에 결속된다. 서버는 원문 일치·시각 정수/순서/겹침/원본 길이/ID를 검증한다. 새 필드가 없는 기존 snapshot의 정규화 형태는 유지한다.
- 서버 `/me`의 `speech_timeline_version:1`을 확인한 뒤 업로드한다. 구버전이면 영속 outbox와 원본을 보존하고 업데이트 대기 상태로 재시도한다. 구간 정보를 버린 채 공유 성공으로 표시하지 않는다.

## SDK 시각 기준 조사

공식 문서의 EPD는 입력 버퍼 byte offset이다. 합성 동일 음성 두 개 사이에 2초 무음을 넣어 연속 전송했을 때 두 번째 EPD는 전체 원본 기준이 아니었다. 첫 EPD만 시작점이 알려진 요청에 결합하고, 끝 지점 이후의 미소비 PCM을 새 요청에서 이어 처리하도록 구현했다. PCM 바이트를 기준으로 계산하므로 녹음 일시정지 시간은 원본 시각에 더하지 않는다. 벽시계·문장 길이·LLM 추정으로 시각을 만들지 않는다.

`stt-timeline-diagnostic.json`은 연속 입력 관찰, `stt-timeline-tail.json`은 정확한 원본 6초부터 새 요청으로 보낸 관찰이다. EPD는 음성 활동 구간이며 문장별·단어별·화자별 경계라고 보장하지 않는다. 길게 이어 말한 여러 문장이 하나의 행이 될 수 있다.

## 검증

- TypeScript/서버 계약 검사: 111개 통과. 완성 snapshot 왕복, legacy 필드 부재 유지, 확인문으로 원문을 바꾼 잘못된 결속 거절 포함.
- `pnpm typecheck` 통과. Android 단위 검사 23개 통과.
- Android 합성 SDK 계측: `TimelineDeviceTest`, `LiveSpeechDeviceTest`에서 파일/실시간 두 발언 정렬, 일시정지 시각, 원본 SHA 불변, 저장 후 확인문 수정에도 원문 구간 유지 확인.
- `TimelinePlaybackDeviceTest`: 실제 MediaPlayer의 5초 탐색 후 재생, 재생 중 1초로 되돌리기, 주행 전환 후 텍스트 탐색 거절과 청취 유지 확인.
- 기존 취소·명시적 재시도, 짧은/반복/끝 무음 없는 음성 회귀 통과.
- 독립 UI 검사 `scripts/test-c026-ui.ts`: 모바일 390×844/차량 1280×720, 라이트·다크, 키보드 탐색, 실제 HTMLAudio 재생, 현재 구간/무음, 시간 미확인/기존 기록, 가로 넘침 확인. `connected-ui/c026-*` 이미지 수동 확인.
- Probe debug·Android test·Pleos release 빌드. 실제 기능 검증 대상은 probe 에뮬레이터 앱이며 release 빌드 성공은 실차 지원 증거가 아니다.

## 실패와 미검증

기존 `SpeechProbeDeviceTest.freeformKeepsEventsAndSpokenCorrection`의 엄격한 전체 문자열 검사는 실패했다. 합성 긴 음성에서 `아이가`가 `나이가`로 인식됐다. 기준 HEAD의 기존 연속 인식 구현을 임시 비교 테스트로 실행해도 동일하게 실패했으며 정규화된 두 결과는 같다. 새 타임라인의 회귀로 확인되지는 않았지만 STT 정확도 전체 통과라고 보고하지 않는다. 테스트 기대값을 바꾸지 않았다. 합성 비교 결과는 `stt-timeline-baseline.json`에 보관했다. 임시 비교 구현은 제품/최종 테스트 APK에서 제거했다.

최초 구현 당시 Docker 엔진은 `docker info`에도 응답하지 않아 웹 이미지 재배포 및 실제 차량→Docker→휴대폰 왕복은 미검증이었다. 아래 후속 서버 반영 검증에서 이를 완료했다. 로컬 snapshot 계약/UI 검사를 실서버 동기화 성공으로 대신하지 않는다. 공유 OrbStack VM을 강제 재시작하거나 볼륨을 삭제하지 않았다. 당시 보류했던 서버 반영과 왕복 검증의 실행 결과는 아래에 기록했다.

아이폰 Safari 실제 기기, 장시간 가족 대화·차량 소음, 실차 플랫폼 허용은 후속 확인 대상이다. 화자 분리 모델은 설치·실행하지 않았다.

## 화자 분리 결론

현재 Pleos STT3.3.1 ResultListener에는 화자 ID가 없다. 현재 구현은 발언 시간 구간이며 사람별 구분이 아니다. 별도 서버 모델로 익명 A/B 구간을 추정한 뒤 사용자가 가족 이름을 연결하는 방식을 후속 후보로 검토했다. 겹친 두 음성을 깨끗한 개별 오디오로 분리하는 것은 다른 기능이다. 세부 조건·공식 출처는 `specs/001-family-trip-memory/research.md` C026에 있다.

최종 설치 APK에서 TimelineDeviceTest·TimelinePlaybackDeviceTest·LiveSpeechDeviceTest 3/3 통과(64.136초). APK의 JS/CSS는 현재 소스와 바이트 단위 일치 확인. APK SHA256: `c88572fa9f9cf85c6c1cb0042fa09c25839af2824733575b51b0c0b429d8fb52`.


## C026d 후속 서버 반영·실제 왕복 완료 (2026-11-11)

맥북 세션에서 Docker29.4.0이 정상 응답했다. OrbStack 강제 재시작 없이 현재 소스로 `docker compose --env-file .env.runtime --profile dev build web` 후 `scripts/refresh-runtime.ts`를 실행했다. HTTPS health200, DB/web healthy, worker 실행을 확인했다. 기존 `hmg-family-diary_pg_data`, `audio_data`, `photo_data` 볼륨을 유지했다. 서버 이미지: `sha256:7cfcf0f99c8a7c9641005317f8323560cd9ebdc471bdc410fc3ddb4922e347b6`.

- `scripts/runtime-test.ts`: 검증 메일/로그인, 일회용 연결, 별칭/접근 권한, snapshot 멱등, 원본 SHA/Range, 사진 정규화, 보관함 격리, CSRF, 삭제 부활 방지, 기기 철회, 비밀번호 재설정 회귀 통과.
- `scripts/test-c026-runtime.ts` + `TimelineSyncDeviceTest` 3개 단계 통과. 실제 SDK가 합성 다중 발언 PCM에서 만든 0~6초/10~16초 구간을 저장했다. 확인문을 원문과 다르게 수정하고 목업 생성 후 확정, 별도 합성 보관함으로 outbox 자동 업로드했다. 일기별 share 호출은 사용하지 않았다.
- 먼저 열어 둔 모바일 크기의 독립 Chrome 화면이 SSE로 새 일기를 받았다. 원문 화면의 두 번째 발언을 눌러 실제 HTMLAudio가 10초부터 재생하고 강조하는 것을 확인했다. 내려받은 원본 SHA는 차량 원본과 같았다.
- 모바일 사진 선택 UI로 합성 PNG를 추가한 뒤 차량 증분 pull, 별도의 빈 로컬 저장소에서 cursor0부터 복원을 실행했다. 두 경우 모두 원문·확인문·구간 필드/배열 순서·원본 SHA·사진이 유지됐다.
- 배포된 app.js/app.css와 현재 소스의 SHA 일치, `/me`의 speech_timeline_version1 확인. 기존 C025 웹 배포 보류도 해소됐다.
- 테스트 도구 보정: 독립 Chrome의 로컬 CA 허용은 Playwright의 별도 Node APIRequest에 전파되지 않으므로 요청은 검증된 브라우저 fetch로 통일했다. PostgreSQL JSONB의 객체 키 순서는 비교 대상에서 제외하되 모든 필드값과 구간 배열 순서는 엄격 비교했다. 반복 시험은 삭제된 일기 ID를 재사용하지 않도록 매번 고유한 합성 파일명을 사용했다.
- 테스트 전용 타임라인 일기/사진 삭제 및 연결 철회, 에뮬레이터의 전용 fixture 정리. 사용자 차량 연결과 기록은 테스트에 사용하지 않았다. 기존 목업 생성 서버의 mock 모드 응답도 확인했다.

화면 증거: `connected-ui/c026-runtime-phone-timeline.png`. 재현: 서버/테스트 에뮬레이터와 최신 test APK를 준비하고 `pnpm exec tsx scripts/runtime-test.ts`, `pnpm exec tsx scripts/test-c026-runtime.ts`. 개인 계정 대신 runtime-test가 만든 전용 합성 계정을 사용한다. iPhone Safari 실기기·실차·장시간 음질 검증 및 위의 기존 STT 엄격 문자열 오인식은 별도 후속 사항으로 유지한다.
