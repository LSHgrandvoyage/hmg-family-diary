# C042 기본 Compose 서버 반영과 제출용 앱 연결

2026-11-13. 기능 정본: [007 DEP-004/007](../../specs/007-release-deployment/spec.md), 표시 계약: [003 SYNC-002](../../specs/003-device-sync/spec.md). 실행 도구 변경은 spec/plan/tasks와 정합성 검토 후 구현했다. APK 변경은 없고 [C041에서 검증한0.2.4](c041-brand-logo.md)를 그대로 사용한다.

## 확인한 원인

- 사용자 모바일은4칸에2자리씩 표시했다. 실행 중인 기본 Compose 서버의 `faithful/app.js`를 직접 받아보니 `slice(i * 2, i * 2 + 2)`가 남아 있었다. 저장소에는 이미6칸과 `slice(i, i + 1)`가 구현돼 있었다.
- 이전 제공 JS의 SHA256은 `3411d791fada63e7d5459a4c545540dd60b5a16ab65c9254077f734dd6e2f829`, 최신 소스/제공 JS는 `22e063ea55f57c0cda8786df82b865b735e5ae362ec540f190fed4157e580fb5`다. 단순 컨테이너 재시작으로 이전 이미지가 계속 사용된 배포 문제였다.
- 실행 중인 앱은 `io.hmg.familydiary.contest`, 서버는 `.env.runtime`/기본 Compose다. 기존 `connect-runtime.ts`는 probe의 run-as만 지원하고 팀 configure-release는 `.env.team`/별도 CA를 사용해 현재 조합에 맞는 실행 경로가 빠져 있었다.

## 조치와 실행 결과

1. 기본 Compose 이미지를 `build web`로 재빌드하고 `up -d --no-build --wait`로 반영했다. DB·미디어 볼륨을 삭제하거나 환경 비밀을 재생성하지 않았다. web/DB 등의 health 대기가 통과했다. Docker 이미지에는 최신6자리 서버 코드와 웹 자산이 들어간다.
2. `.env.runtime`의 HTTPS 주소와 기본 proxy의 **공개 CA만** 전달하는 `node scripts/configure-runtime.mjs emulator-5580`을 추가했다. Node24 내장 기능을 사용한다. CA 유효성·해당 CA로 HTTPS health를 확인하고 현재 Android 사용자에게 설정 확인 요청을 전달한다. run-as·개인키·계정 토큰·목업 서버는 사용하지 않는다.
3. 실제 실행에서 HTTPS health 검증이 통과했고, 차량 UI 계층에서 서버 확인창·기대 주소·설정 적용 버튼 표시를 확인했다. 적용 버튼이나 가족 페어링을 대신 누르지 않았다. 확인창을 띄운 사실을 연결 완료로 표시하지 않는다.
4. `CHAGOK_UI_ORIGIN=<기본 서버 주소> pnpm exec tsx scripts/test-c037-ui.ts` 통과. 실제 배포된 정적 자산을 사용하되 가족 API/bridge는 합성 응답으로 대체했다. 모바일6개 칸에0~5가 각각 표시되고 선행0이 유지되는지, 양쪽 테마/가로 넘침/차량 입력 placeholder/미설정 라우팅을 확인했다.
5. 공개 CA로 검증해 받은 JS, 컨테이너 내부 JS/CSS/서버 소스의 SHA256이 저장소와 각각 일치했다. 서버 소스 해시는 `87dfd4941da9ec35156d64af2a27c6ead227238212936464f3d0db7900c8d70d`, CSS는 `be5fd962cf92f864685f4466f6d072aa65a027d9ae00b9b5f09b65343d972042`다.
6. TypeScript 타입·Node 구문·명세 정합성·diff 검사를 통과했다. README/제출 안내에 기본 서버·팀 서버·이전 probe의 차이와 `--build` 필요성을 반영했다.

[6칸 라이트](connected-ui/c042-pairing-light.png) · [6칸 다크](connected-ui/c042-pairing-dark.png). 스크린샷의 연결 코드는 합성이며 실제 가족 보관함 코드가 아니다.

## 범위

사용자가 실행해 둔 에뮬레이터와 개발 서버는 계속 실행 상태로 두었다. 재빌드와 파일 동일성·설정 확인창까지 검증했으며 사용자의 iPhone 새로고침, 설정 적용, 새 코드 발급/소모, 가족 동기화 완료는 이 검증에 포함되지 않는다. 과거 기록의 내용·개수를 읽어 데이터 복구를 주장하지 않는다. 공개 배포/Windows/실차 검증을 대신하지 않는다. 최종 제출 소스와 동일0.2.4 APK의 식별자는 ZIP manifest/해시가 정본이다.
