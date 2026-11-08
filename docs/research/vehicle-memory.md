# 차량과 함께 남기는 기억 — 2026-11-08

## 결정

사용자 요청: 차종·모델·차 번호와 녹음 시점의 차량 위치를 일기에 남긴다. 위치 기준은
**녹음 시작 시점**으로 잡으며 이후 생성/수정/열람 위치로 바꾸지 않는다. 첫 버전의
기록 메타데이터로 추가한다. 이후 차가 바뀌어도 옛 기록에는 당시 차를 보존한다.

핵심 표현: “말을 정리하는 일기”에서 “우리 가족이 이 차와 함께 보낸 시간을 목소리로 남기는 기록”으로 확장한다.

## 공식 문서 확인

| 항목 | 확인한 근거 | 적용 판단 |
| --- | --- | --- |
| 차량 기본 정보 | [Vehicle 소개](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/Vehicle/intro)는 CarInfo의 제조사·연식 등 기본 정보 도메인을 설명한다. [CarInfo API 목록](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/Vehicle/vehicle/ai.pleos.playground.vehicle.api/car-info/entry)에 checkCRNInfoCapabilities/getCRNInfo, checkVINInfoCapabilities/getVINInfo가 있다. | 이번 공개 문서 추출에서는 반환 필드·등록번호 의미/포맷과 실제 차종별 지원을 검증하지 못했다. 모델/차종/번호 자동 완성을 확정하지 않는다. 초기에는 확인된 사용자 차량 프로필을 사용하고 SDK 자동 제안은 실제 검증 후 연결한다. VIN은 기억 기능에 필요하지 않으므로 새 수집 항목으로 추가하지 않는다. |
| 차량 위치 | [FusedLocation 소개](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/FusedLocation/intro)는 isSupported, getLastKnownLocation, callback과 위치 시각·신뢰도, FUSED_LOCATION 권한을 설명한다. 마지막 위치는 새로 측정한 값이 아니며 null일 수 있다. | 녹음 시작 시 지원/권한/관측 시각을 확인한다. 현재 웹 브라우저 위치를 차량 위치로 대체하지 않는다. 좌표→지역/장소명 변환 공급자·정확도는 아직 미선정/미검증이다. |
| 거리·시간 | [Odometer 목록](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/Vehicle/vehicle/ai.pleos.playground.vehicle.api/odometer/entry), Vehicle 소개에 총 주행 거리와 트립 거리/시간 조회가 있다. | 여행별 이동 기록 후보. 트립 초기화 경계와 실제 지원을 검증해야 한다. 누적 주행 거리를 ‘가족이 함께 달린 거리’로 단정하지 않는다. |
| 차량 맥락 | [공모전 소개](https://appdevchallenge.auto-hmg.io/)는 차량 데이터·기능·이동 상황을 활용하는 경험을 모집한다. | 이 방향이 공모전 취지와 맞는다는 제품적 판단이며 심사 점수/수상을 보장하는 근거는 아니다. |

Vehicle 문서 기준 SDK2.3.2/Service2.3.21, FusedLocation1.1.3. 문서 존재와 에뮬레이터·실차 실행 성공은 별개다. 별도 Pleos Fleet/Vehicle Data API 계정 연동을 Connect SDK의 권한으로 취급하지 않는다.

## 첫 반영

- ‘그날 함께한 차’: 별명, 제조사/모델, 차종, 연식, 선택적 차 번호. 기록 당시 스냅샷.
- ‘녹음을 시작한 곳’: 당시 지역/장소 표시와 관측 시각. 이야기 속 방문지와 별도 필드.
- ‘이 차의 추억 모아보기’: 기록에 보존된 vehicle_id로 조회. 월별 묶음은 유지.
- 등록번호는 상세에서 선택해 확인하고 목록·URL·검색 인덱스에 노출하지 않는다. 미리 보기는 ‘샘플 0001’ 같은 가상 값만 쓴다.
- 기능 미지원/권한 거절/위치 미확인일 때도 일기와 음성 기록을 막지 않는다. 미확인은 미확인으로 표시한다.

## 추가 후보 — 아직 구현하지 않음

1. **다시 온 곳, 그때의 목소리**: 주차가 확인된 뒤 이번 녹음 위치 주변의 과거 기록을 사용자가 열어 듣는다. 아이의 예전 목소리와 현재 이야기가 만나는 회상 기능. 자동 재생·상시 위치 수집 없이 먼저 구현할 수 있다. 우선 추천.
2. **이 차와의 첫날·마지막 여행**: 사용자가 지정하는 차량 생애의 장면. 차를 바꿔도 옛 일기는 보존하고 과거 차의 앨범을 열 수 있다. 첫 장거리/가족 탑승 같은 사실은 자동 추측하지 않는다.
3. **충전하며 이야기 남기기**: 주차·충전이 확인된 정차 시간에 사용자가 기록을 시작하고 지난 기록을 듣는다. 충전 상태는 맥락이며 녹음 자동 시작 조건이 아니다.
4. **여정의 작은 숫자**: 검증된 주행 시작/종료 구간의 거리·시간을 일기에 붙인다. 추가 데이터 수집·트립 리셋 검증이 필요하므로 후순위.
