# 새벽개발팸 · 차곡차곡 제출 교차검토

확인일: 2026-11-12 KST. 공개 안내와 바탕화면의 고정 소스·APK 묶음을 비교했다. **파일 형식·무결성은 확인했지만, 플랫폼 적합성까지 모두 해결된 상태는 아니다.** 접수·업로드는 하지 않았다.

사용자 결정에 따라 `대회지원서_1차.pdf`는 바탕화면 제출 폴더에 `지원서_임시본_최종본으로교체.pdf`로 복사했다. 최종 지원서 내용·서명 검토는 이번 범위에서 제외한다. 임시 PDF는 소스+APK ZIP 밖에 있으며, 최종본처럼 발송하지 않는다.

## 1. 제출물 점검 결과

| 항목 | 결과 | 근거 / 남은 일 |
|---|---|---|
| 소스와 release APK 함께 제출 | 준비됨 | `새벽개발팸_차곡차곡_제출용.zip`, APK 경로 `apk/새벽개발팸_차곡차곡_release.apk` |
| 실행 가능한 release | 기존 실행 검증 + 서명 재검증 | `contestRelease`, `io.hmg.familydiary.contest`, 0.2.0(code1). C035에서 비디버그 설치·실행 확인, 이번에 apksigner v2 검증 통과 |
| 개발 환경 | 충족 | minSdk28, Kotlin2.0.0, Gradle8.10.2. API28+/Gradle8+/Java 또는 Kotlin 조건과 비교 |
| README | 포함됨 | 앱 설명, 설치·실행, 로컬 서버 설정, SDK 버전, Pleos2.1.0/API34 ARM64, Emulator37.2.13, 2560×1440 및 참조 UI1280×720, APK 위치 |
| 고정 소스 | 확인됨 | 커밋 `95648185afc1b0b5d0812104749731ada79e9037`, 파일474개 |
| 무결성 | 통과 | ZIP CRC, 최상위5개 및 소스474개 해시 일치. Git blob과 비교 시 `gradlew.bat`만 `.gitattributes`의 CRLF 변환 차이이며 정규화 후 일치 |
| 비밀/불필요한 파일 | 경로 검사 통과 | `.git`, `.tools`, node_modules, 개인 서명 키, 실제 환경 파일 제외. 전 항목의 법적 권리까지 인증한 결과는 아님 |
| 출처 고지 | 포함 확인 | THIRD_PARTY_NOTICES, Spec Kit MIT 본문, k-style/Fluent 및 글꼴 라이선스 파일. 최종 영상·사진은 별도 권리 확인 |
| 다운로드 링크 | **미준비** | 로컬 ZIP만 존재. 업로드 후 다른 기기·비로그인 환경에서 내려받기와 압축 해제 확인 필요 |
| Windows 재현 | 미확인, 권장 | Windows 안내 포함. 실제 Windows/Pleos/마이크 검증은 미완료. Windows 검증 자체가 별도 공식 제출 조건인 것은 아님 |
| 시연 영상 | 미포함, 선택 | 코드/APK와 별개의 선택 가산점 자료. 제출 목표를 넓히면 짧은 실제 흐름 영상 준비 권장 |

제출 형식은 [지원·제출 방법](https://appdevchallenge.auto-hmg.io/guide/submission), 개발 조건은 [개발 환경](https://appdevchallenge.auto-hmg.io/guide/development), 권리·오픈소스 의무는 [이용약관](https://appdevchallenge.auto-hmg.io/terms)을 기준으로 비교했다. 실행 증거는 [C035](../evidence/c035-contest-release.md), 실행법은 [release README](release-runbook.md)에 있다. 이번에는 에뮬레이터·서버를 다시 실행하지 않았다.

## 2. 가장 중요한 미해결 사항: 원본 음성 경로

현재 코드의 경로는 `AudioRecord → WAV 보관 → Pleos ON_DEVICE sendAudio → 가족 서버/휴대폰 동기화`다. 외부 STT는 호출하지 않는다.

[개발 범위 공지](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000008)는 공개 문서의 SDK/API로 개발하도록 하며, 문서에서 지원되지 않는 기능과 차량 음성의 외부 STT 전송을 허용하지 않는다. Pleos LLM과 Gleo App Schema 승인 신청도 제공 범위 밖이다.

[request/stop](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/start-and-stop)은 SDK가 차량 마이크 인식을 수행하는 경로다. [sendAudio](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/sending-audio-data)는 앱 소유 PCM 인식 기능으로, 그 자체가 차량 원본의 취득·영구 보관·전송 허용 근거는 아니다. [하드웨어 정책](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/platform-api-architecture)도 차량 플랫폼의 지원 확인을 요구한다.

**판정: 원본 경로의 공모전 적합성은 미확인이다.** 공개 문서 검색에서도 전체 경로의 명시적 근거를 찾지 못했다. 일반 Android API라는 이유만으로 곧바로 금지라고 단정할 수 없지만, 에뮬레이터에서 작동하거나 README에 미확인이라고 적었다는 이유만으로 적합 판정할 수도 없다.

제출 APK 확정 전에 이 경로의 공개 지원 근거를 확보해야 한다. 근거가 없으면 공식 마이크 STT 기반 텍스트 기록을 제출 구현으로 하고, 차량 원본 보관·전송은 향후 계획으로 분리하는 대안을 검토한다. 이 경우 핵심 제품 범위가 달라지므로 이번 검토에서는 코드를 임의 삭제하지 않았다.

운영사무국에 질문한다면 구현 방법이나 예외 SDK 제공 요청이 아니라 **현재 공개 API를 사용하는 제출 구현의 범위 판단**으로 한정한다. 공지는 개별 API 기술 지원·별도 지원 창구를 제공하지 않는다고 밝히므로, 메일만 보내면 예외 승인이 가능하다고 가정하지 않는다. 문의 발송은 하지 않았다.

## 3. private 저장소와 제출 절차

현재 선택은 **private 유지 + 소스·APK ZIP 내려받기 주소 제출**이다. 공개 전환 의무는 저장소 링크로 제출하는 경로에 해당한다. ZIP 대안에서는 심사자 초대나 private 저장소 접근 권한을 줄 필요가 없다. 자체 서버 소스는 공식 필수가 아니지만 재현을 위해 Docker 소스를 포함했다. 외부 호스팅 서버를 별도로 준비할 필요도 없다. [추가 안내](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000007)

마감은 **2026-11-15 23:59 KST**, 수신은 `appdevchallenge@hyundai-partners.com`이다. 다운로드 링크를 그 전에 보내야 하며 로컬 경로는 다운로드 링크가 아니다. README의 실행 안내가 포함된 ZIP 전체를 올리고, 링크를 심사 기간에 계속 유지하는 것을 권장한다. [FAQ](https://appdevchallenge.auto-hmg.io/faq), [일정](https://appdevchallenge.auto-hmg.io/guide/schedule)

절차상 놓치기 쉬운 사항:

- 대표자 외 팀원이 발송해도 된다. 이후 수정은 최초 발송 주소를 사용한다.
- 일반 수정 제출은 마감 전 전체 자료·동의서를 다시 보내고 전원 CC한다. **이미 접수한 팀의 최종 커밋 번호만 보완하는 경우**에는 해당 번호만 회신하는 별도 안내가 있다.
- DOCX/PDF와 전자·이미지 서명은 허용된다. 양식은 필수 항목과 순서를 유지해야 한다. 지원서·개인 동의서는 공개 소스 ZIP과 분리한다.

근거: [참가 규정](https://appdevchallenge.auto-hmg.io/guide/rules), [접수 추가 안내](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000007). 지원서 최종 검토는 보류했지만, 최종 제출 시 전원 동의·서명·날짜·CC는 여전히 확인해야 한다.

## 4. 구현 설명에서 구분할 내용

| 설명 대상 | 현재 사실 / 제출 시 표현 |
|---|---|
| 자동차 화자 AI | `AI 생성 일기 목업 입니다.` 고정 응답. 실제 LLM 생성·품질 검증 완료라고 쓰지 않는다 |
| 음성 인식·합성 | Pleos STT/TTS3.3.1 ON_DEVICE. 원본 캡처 경로의 적합성은 위 미해결 항목 |
| 위치 | FusedLocation1.1.3. 녹음 시작 전30초 이내 관측만 사용, 없으면 미확인 처리 |
| 차량 정보 | 지원 필드는 Android CarInfo로 조회하고 사용자 편집 가능. 직접 Vehicle SDK 연동 완료와 동일하게 설명하지 않는다 |
| 주행 거리·시간·목적지 | 현재 구현 완료 기능 아님. NaviHelper 사용 완료라고 쓰지 않는다 |
| 화자 분리 | 발언 타임라인 제공과 자동 인물 식별은 다름. 자동 화자 식별 미구현 |
| 주행·내비 병행 | 에뮬레이터 구현·시험과 실차 허용을 구분. 실차·마켓 검증 미완료 |
| 테마 | 차량 시스템 uiMode/수동, 휴대폰 수동. 실차 터널·조도 연동까지 검증한 것은 아님 |
| 휴대폰 | 설치형 앱이 아닌 HTTPS 웹앱. 원본 청취 지원; 차량 TTS 플레이리스트를 모바일 완료 기능으로 확대하지 않는다 |
| 차량 연결 | 가족 보관함당 활성 차량1대. 과거 차량 기록 보존과 여러 활성 차량 동시 연결은 다름 |
| 서버 | 로컬 Docker 테스트, 개발 메일함 사용. 공개 클라우드·실제 메일 발송 서비스 아님 |

위 표는 코드·[플랫폼 검토](platform-review-2026-11-12.md)·[실행 안내](README.md)·C023~C035 증거 기준이다. 사용자 요청대로 최종 지원서 문구 대조는 수행하지 않았다.

## 5. 선택 자료와 선정 후 의무

- **시연 영상**: 선택 가산점. 현재 미포함은 필수 서류 누락이 아니다. 실제 입력·주차 검토·목업 저장·자동 동기화·원본 청취를 보여주는 영상이 재현 설명에 유용하다.
- **숏폼**: 별도 선택 행사로 본상 가산점과 다르다. 참여 시 세로30초~1분, Reels/Shorts, 필수 `#HMG차량용앱개발공모전` 포함 총2~3개 해시태그, 신청서 링크가 필요하다. [숏폼 안내](https://appdevchallenge.auto-hmg.io/guide/shortform)
- **평가 대비**: 차량특화성·창의성·기술 활용성·사업성을 모두 다룬다. 사업성에는 고객 확보·재이용·확장 가설이 필요하며 MAU/유지율 예시는 실측 결과처럼 만들지 않는다. 순위는 2차 PT 제출·시연 결과로 결정되고 이후 기간은 전시 준비다. [심사 안내](https://appdevchallenge.auto-hmg.io/guide/judging-awards)
- **일정**: 11월23일 1차 발표, 12월3~4일 2차 PT, 12월18일 선정 발표, 2027년2월 전시·시상. 본선 장비/인터넷·참석 세부사항은 추후 안내 대상이다. [일정](https://appdevchallenge.auto-hmg.io/guide/schedule)
- **참가·권리**: 대표자 포함 최대5명. 타 공모전 기수상작·표절 금지, 현대차그룹 임직원은 시상 제외 조건을 확인한다. 선정10팀은 최종 전시 APK와 현장 참여가 필요하다. 지식재산권은 참가자에게 있으나 이용 협의·결과 발표 후 최대4개월 우선협상 조건이 있다. 상금은 세금 공제 후 대표자 일괄 지급이다. 팀 내 합의는 별도다. [출품 유의사항](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000006)
- **개인정보**: 운영자의 접수자료 처리방침과 우리 앱의 가족 녹음 처리정책은 별개다. 공식 방침의 일반 접수자료 보관기한은 2027년2월28일, 수상자는 결과 발표일부터2년이다. [개인정보 처리방침](https://appdevchallenge.auto-hmg.io/privacy)

## 6. 확인한 공식 자료 범위

공개 텍스트 기준으로 아래 전체를 확인했다. 공개되지 않은 설명회 다시보기나 추후 본선 안내까지 확인했다고 주장하지 않는다.

| 범위 | 확인한 페이지 |
|---|---|
| 공지 전체5건 | [개발 범위](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000008), [비공개 제출·추가 안내](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000007), [출품 유의사항](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000006), [모집 공고](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000001), [설명회](https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000005) |
| 가이드 전체8항목 | [개요](https://appdevchallenge.auto-hmg.io/guide/overview), [일정](https://appdevchallenge.auto-hmg.io/guide/schedule), [숏폼](https://appdevchallenge.auto-hmg.io/guide/shortform), [제출](https://appdevchallenge.auto-hmg.io/guide/submission), [개발](https://appdevchallenge.auto-hmg.io/guide/development), [심사](https://appdevchallenge.auto-hmg.io/guide/judging-awards), [규정](https://appdevchallenge.auto-hmg.io/guide/rules), [문의](https://appdevchallenge.auto-hmg.io/guide/help) |
| 기타 | [FAQ 전체](https://appdevchallenge.auto-hmg.io/faq), [이용약관](https://appdevchallenge.auto-hmg.io/terms), [개인정보 처리방침](https://appdevchallenge.auto-hmg.io/privacy) |

지원서 본문·공식 DOCX 양식 대조는 사용자 결정으로 보류했다. 설명회 페이지에는 다시보기 제공 예정만 확인되어 영상 내용은 검토 범위 밖이다. 마감 직전 새 공지 여부는 다시 확인할 필요가 있다.

## 7. 동결 산출물과 검토 기록

```text
소스 커밋: 95648185afc1b0b5d0812104749731ada79e9037
ZIP SHA256: de84b61a8eb80998dbe68b2f6139c4037c07bfb27c803a6528892419023386c6
APK SHA256: 0d26a45f2334ac97f9d206c44e8b2783b5e261cb2b574de813fd031a3e88ea54
서명 인증서 SHA256: f5a5be9e5ffa4bdd1bf95e29f63250205b9abf348550e03ac197b7ed262223cc
```

이번 검토 문서·체크리스트의 후속 dev 커밋은 위 제출 소스 커밋을 바꾸지 않는다. 검토 보고서는 바탕화면 ZIP 옆에 둔다. APK·ZIP 변경이 필요해지면 재빌드·재검증·재패키징 후 커밋과 해시를 함께 교체해야 한다.
