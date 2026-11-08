# 저장한 원본 PCM의 STT 분리 검증 — 2026-11-08

T005/G1, FR-003/013/015의 부분 검증이다. **G1 전체 통과가 아니다.**
현재 앱의 PCM 전달·최종 결과 누적은 합성 입력에서 정상 동작했다. 자유 발화 형태의 합성 입력에는
한 글자 오인식이 남아 정확 일치 검사는 실패했다. 이번 변경은 진단·회귀 검사와 증거 추가이며,
오인식에 맞춰 전사문을 치환하거나 제품 STT 구현을 변경하지 않았다.

## 입력과 환경

- Mac ARM64, Pleos Connect2.1.0/API34, emulator37.2.13 **host GPU**.
- SpeechToText3.3.1 ON_DEVICE, 서비스4.2.10-coral-aosp, Locale.KOREA.
- macOS Yuna로 만든 가상 가족 이야기만 테스트 APK asset에서 읽었다. 마이크를 열지 않고
  사용자 녹음 디렉터리를 읽지 않았다. 테스트가 만든 cache WAV만 정리했다.
- WAV는 16kHz/mono/signed16 LE, 44-byte header. 앞0.5초/뒤2초 무음.
- 최초 직접 SDK 비교와 최초 adapter 검사는 같은 7.484625초 파일을 사용했다.
  후속 스크립트 재생성 파일은 7.8965초이며, 자유 발화 파일은 30.847875초다.
  macOS 음성 합성 결과는 실행에 따라 달라질 수 있어 두 증거 JSON에 각 checksum을 보관한다.

## 관측 결과

| 검사 | 결과 | 범위 |
|---|---|---|
| 직접 SDK 100ms/200ms/단일 버퍼 | 세 방식 모두 짧은 문장 전체 인식 | 진단 실행 `OK (1 test)`, 43.724초. 테스트 assertion 자체는 실행 완료 확인이며 품질은 JSON의 최종 문장으로 비교 |
| 앱 adapter 짧은 입력 | 전체 문장 일치 | 최신 7.8965초 파일, 공백·구두점만 제외하고 비교 |
| 동일 발화 3회 연결 | 세 번 모두 유지, 추가 반복 없음 | 23.6895초. 의도적 반복을 임의 제거하지 않음 |
| 뒤2초 여유 무음 제거 | 마지막 말까지 일치 | 5.8965초. 실제 마이크 중단 상황 전체를 대체하지 않음 |
| 전송 도중 취소 → 명시적 재시도 | 통과 | 취소 후 늦은 callback 미노출, 재시도 결과 일치, 이전 실행 callback 미혼입 |
| 여러 사건·어제/오늘/다음 주·정정 | 최종3개 구간 수신, **정확 일치 실패** | “아이가” → “나이가” 한 글자 오인식. 정정과 마지막 우산 문장은 보존 |
| 입력 파일 보존 | 모든 adapter 사례 SHA256 불변 | 인식 결과가 원본 파일을 바꾸지 않음 |

최신 adapter 실행은 **3개 테스트 중 2개 통과·1개 실패**, 81.427초다.
첫 테스트가 짧은 입력·반복·말끝의 세 사례를 포함한다. 자유 발화의 정확 일치 assertion은
실패를 숨기기 위해 완화하거나 skip하지 않았다. 이는 고정된 합성 사례의 품질 검사이며,
일반적인 한국어 정확도나 가족·어린이·잡음 환경의 성능 수치가 아니다.

검토한 합성 증거: [직접 SDK 이벤트](stt-transport-comparison.json),
[adapter 결과와 자유 발화 오인식](stt-adapter-results.json).

## 종료 이벤트 해석

직접 비교에서 onStartedRecognition은 전송 중 반복 호출됐으며, onEndedRecognition 다음에
최종 텍스트와 EPD가 도착했다. 따라서 첫 started/ended 쌍을 파일 전체의 시작/종료로 간주할 수 없다.
현재 adapter는 파일 전송 완료와 인식 종료를 함께 확인하고 최종 callback을 기다리는 처리로
시험 입력의 끝까지 수신했다. 이 결과는 모든 입력에서 500ms 대기가 충분함을 증명하지 않는다.

100ms 전송의 최종 결과는 6,481ms, 단일 버퍼는 933ms, 200ms 전송은 6,338ms에 관측됐다.
이는 짧은 합성 파일 한 번씩의 이벤트 시각이며 서비스 지연의 대표값이 아니다.
뒤 무음 전송이 끝나기 전에 최종 결과가 도착하는 것 자체는 누락의 증거가 아니다.
단일 버퍼 비교는 Binder 제한보다 작은 이 입력에만 적용했고 앱은 100ms 전송을 유지한다.

이전 누락/반복은 host GPU 환경에서 **같은 파일로 재현되지 않았다**.
이전 소프트웨어 렌더러의 지연·불안정이 영향을 주었을 가능성은 있지만, 렌더러만 통제한
반복 비교를 하지 않았으므로 원인을 확정하거나 모든 누락을 해결했다고 주장하지 않는다.

## 재현

macOS Yuna가 설치된 환경에서 가상 음원을 생성한다. 빈 음원이 생성되면 스크립트가 실패한다.
음원 바이너리는 Git에 포함하지 않는다. 실행 중인 Pleos AVD의 현재 사용자가10인 경우:

```sh
./scripts/generate-stt-fixture.sh
./scripts/vehicle-gradle.sh :app:assembleProbeDebug :app:assembleProbeDebugAndroidTest
.tools/android-sdk/platform-tools/adb -s emulator-5580 install -r apps/vehicle/app/build/outputs/apk/probe/debug/app-probe-debug.apk
.tools/android-sdk/platform-tools/adb -s emulator-5580 install -r apps/vehicle/app/build/outputs/apk/androidTest/probe/debug/app-probe-debug-androidTest.apk
.tools/android-sdk/platform-tools/adb -s emulator-5580 shell am force-stop --user 10 io.hmg.familydiary.probe
sleep 2
.tools/android-sdk/platform-tools/adb -s emulator-5580 shell am instrument --user 10 -w -e class io.hmg.familydiary.SpeechProbeDeviceTest io.hmg.familydiary.probe.test/androidx.test.runner.AndroidJUnitRunner
# 직접 SDK 전송 비교: 위 class를 io.hmg.familydiary.SpeechSdkDiagnosticTest로 바꿔 실행
```

STT 테스트 클래스만 지정하므로 마이크 녹음 테스트는 실행하지 않는다. Android instrumentation은
assertion 실패에도 adb exit code가0일 수 있으므로 출력의 `FAILURES!!!`/`OK`를 확인한다.

## 남은 작업

1. 실제 자유 발화와 3/10/20분 입력의 누락·반복·말끝·침묵·잡음을 검증한다.
2. EPD 구간과 원본 탐색 시각, 사용자 선택 화자의 연결을 검증한다.
3. 원본을 들으면서 인식문을 확인·수정한 뒤 LLM이 정리하는 제품 흐름을 연결한다.
   음향 오인식을 추정 치환하는 것으로 정정 기능을 대신하지 않는다.
4. 실제 P/UX 신호(T006), 암호화 저장·복구(T008) 및 인증·동기화를 구현하기 전 제품 경로는 잠금을 유지한다.

## 공식 근거

- [저장 PCM의 전체 버퍼/스트림 전송](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/sending-audio-data)
- [최종 결과와 EPD callback](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/result-listeners)
- [한국어 지역 코드](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/set-locale)
