# 월별 보관함·전체 녹음 타임라인 검증 — 2026-11-08

사용자 피드백에 따라 장소 필터를 제거하고 기록 연월별 탐색을 도입했다.
원문 탭의 구간 팝업은 하나의 전체 녹음 플레이어와 시간순 원문 목록으로 대체했다.
FR-009/US2-2, product-brief, plan, T026 설명, decisions를 함께 갱신했다.
T026의 인증된 실제 보관함 연동 완료 체크는 하지 않았다.

## 검증 결과

- `pnpm typecheck`, `pnpm format:check`: 통과.
- `pnpm test`: 기존 39개 테스트 통과.
- `docker compose -f compose.preview.yaml up -d --build`: production 빌드 통과, localhost:3018 컨테이너 교체 완료.
- `E2E_ORIGIN=http://127.0.0.1:3018 E2E_EXTERNAL_SERVER=1 pnpm test:e2e`: **12/12 통과**.
- Chrome viewport: 휴대폰 375×812, 태블릿 1024×768, 데스크톱 1440×900. 각 4개 시나리오.

확인한 동작:

1. 기록 연월 그룹·기간 선택과 검색의 교집합·빈 결과·초기화·기록 이동.
2. 원문 탭만 열 때 자동 재생하지 않음. 구간 버튼/키보드 Enter로 해당 시점부터 재생.
3. 현재 구간 표시, 전체 0–8초 탐색, 4초 발화 경계를 넘어 계속 재생, 전체 끝에서 정지.
4. 구간 이동 중 파일을 재요청하지 않음. 일기 탭 복귀 시 audio 제거·Blob URL 해제·초점 복원.
5. 미디어 요청 실패·재시도, 준비 전 구간 버튼 비활성화, 가족별 기억/전체 듣기가 같은 플레이어로 연결됨.
6. 색상 선택 유지, 글자 토큰 확대·reduced-motion에서 가로 넘침 없음.

화면 검토에서 전체 페이지 캡처에 숨김 링크가 보이는 문제를 발견해 clip 방식으로 고쳤다.
종료 후 선택된 일기 탭으로 초점을 복원하도록 수정하고 검증을 다시 통과했다.

## 화면

| 크기 | 월별 보관함 | 전체 녹음과 원문 |
| --- | --- | --- |
| 휴대폰 | [화면](timeline-phone-archive.png) | [화면](timeline-phone-player.png) |
| 태블릿 | [화면](timeline-tablet-archive.png) | [화면](timeline-tablet-player.png) |
| 데스크톱 | [화면](timeline-desktop-archive.png) | [화면](timeline-desktop-player.png) |

기존 kstyle-* 이미지는 이전 시안의 검증 증거다. 최신 동작은 위 timeline-* 이미지를 따른다.
휴대폰 재생·데스크톱 보관함 렌더링을 직접 확인했다.

## 제한

고정 샘플 일기와 하나의 8초 합성 시험음으로 UI를 검증했다. 실제 STT·음성 정합성·원본
manifest의 다중 chunk 연속 재생·인증·동기화·차량 주차 판정의 증거가 아니다.
실제 iPhone/iPad Safari·차량 화면은 미검증이다. 브라우저가 로딩 뒤 재생 시작을 거부하면
재생 버튼을 다시 누르도록 안내한다. 녹음 길이 제한을 8초로 정한 것이 아니다.
