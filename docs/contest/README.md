# 차곡차곡 심사용 실행·제출 안내

현재 제출 앱은 **contestRelease 0.2.13 / code14**, 패키지 `io.hmg.familydiary.contest`입니다. `probeDebug`는 개발용이며 `pleosRelease`는 제출 앱이 아닙니다.

- [저장소 첫 실행 안내](../../README.md): 앱 소개, 지정 APK 링크, Windows 빠른 실행, 환경과 설정.
- [상세 실행 안내](release-runbook.md): GitHub/ZIP 경로 구분, Windows·macOS 설치, 연결, 업데이트와 복구.
- [APK 메타데이터](release-artifact.json): APK 빌드 기준 커밋·버전·SHA256·서명 인증서 지문.
- [제출 체크리스트](submission-checklist.md): 공개 GitHub 제출, 서명 분담, 접수 준비.
- [플랫폼 재검토](platform-review-2026-11-15.md): SDK 지원과 남은 적합성 불확실성.
- [기능 검증](../evidence/c052-narration-lyrics.md) · [제출 검증](../evidence/c053-public-submission.md)

AI 생성은 `AI 생성 일기 목업 입니다.`라는 고정 결과입니다. 서버 없이 차량 녹음·목업 저장·원본/TTS를 시험할 수 있고, 휴대폰 연동에는 로컬 Docker 서버가 필요합니다.

`package-contest.py`의 `dist/contest`는 개발 검토용입니다. 최종 소스+release APK 묶음은 깨끗한 제출 커밋에서 `package-submission.py`로 만듭니다. 개인 서류·환경 비밀·실제 가족 데이터는 공개하지 않습니다.
