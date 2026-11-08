# k-style UI 검증 — 2026-11-08

범위: 합성 자료로 작동하는 Next.js 웹 미리 보기의 UI 개선. [설계 기록](../design/k-style-redesign.md).

- `pnpm typecheck`: 통과.
- `pnpm test`: 기존 39개 테스트 통과.
- `pnpm format:check`: 통과.
- `pnpm build`: 통과.
- `docker compose -f compose.preview.yaml up -d --build`: 새 이미지 빌드 및 컨테이너 교체 완료.
- `E2E_ORIGIN=http://127.0.0.1:3018 E2E_EXTERNAL_SERVER=1 pnpm test:e2e`: **9/9 통과**. Chrome, 휴대폰 375×812·태블릿 1024×768·데스크톱 1440×900, 각 3개 시나리오.

검증 동작: 검색·빈 결과·초기화·장소 필터·상세 이동·원문 전환·4–8초 구간 시작·재생/일시 정지·탐색·선택 구간 종료 시 정지·fetch 실패 재시도·Escape 닫기·초점 복원·Blob URL 해제·색상 선택 유지·서로 다른 일기 내용·가로 넘침 없음.

초기 E2E는 이동 직후 보관함의 중복 제목을 선택하여 2개가 실패했다. 상세 화면의 h1을 기다리도록 선택자를 수정한 후 모두 통과했다. 제품 오류를 테스트에서 숨기지 않았다.

## 렌더링 증거

| 크기 | 보관함 | 상세 | 재생 |
| --- | --- | --- | --- |
| 휴대폰 | [화면](kstyle-phone-archive.png) | [화면](kstyle-phone-detail.png) | [화면](kstyle-phone-player.png) |
| 태블릿 | [화면](kstyle-tablet-archive.png) | [화면](kstyle-tablet-detail.png) | [화면](kstyle-tablet-player.png) |
| 데스크톱 | [화면](kstyle-desktop-archive.png) | [화면](kstyle-desktop-detail.png) | [화면](kstyle-desktop-player.png) |

보관함·상세는 전체 페이지 캡처, 재생은 viewport 캡처다. 모달 캡처는 전체 페이지 캡처 시 fixed/backdrop 위치가 왜곡되는 문제를 피했다. 휴대폰 보관함·재생, 태블릿 상세, 데스크톱 보관함을 직접 확인했다.

실제 iPhone/iPad Safari와 차량 화면은 이번 변경에서 검증하지 않았다. 브라우저 viewport 검증을 실제 기기 검증으로 간주하지 않는다. 접근성 전체 감사는 아니며 키보드 닫기·초점·명명·범위 조작을 검증했다. 인증·STT·LLM·원본 캡처·기기 동기화는 기존 미구현/미검증 상태다.
