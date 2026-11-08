#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
fixture_dir="$repo_root/.tools/stt-fixtures"
asset_dir="$repo_root/apps/vehicle/app/src/androidTestProbe/assets"
mkdir -p "$fixture_dir" "$asset_dir"
# Entirely invented test sentences, synthesized locally; never user recordings.
# macOS Yuna output can vary across synthesis runs; record each fixture checksum.
say -v Yuna -r 175 -o "$fixture_dir/short.aiff" '오늘 가족과 바다에 갔어요. 아이는 파도가 무서웠고 저는 바다가 좋았어요.'
say -v Yuna -r 150 -o "$fixture_dir/freeform.aiff" '오늘 아침에는 가족과 공원에 갔어요. 아이는 자전거를 타고 저는 나무 그늘에서 쉬었어요. 점심에는 김밥을 먹었어요. 아, 점심이 아니라 아침이었어요. 어제 들렀던 카페에서는 따뜻한 우유를 마셨어요. 오늘 바다에서는 아이가 파도를 무서워했지만 저는 바다가 좋았어요. 다음 주에는 할머니를 만나러 가고 싶어요. 그리고 집에 돌아갈 때 우산을 챙겨야 해요.'
for name in short freeform; do
afconvert -f WAVE -d LEI16@16000 -c 1 "$fixture_dir/$name.aiff" "$fixture_dir/$name-converted.wav"
asset_name="synthetic-stt.wav"
if [[ "$name" == "freeform" ]]; then asset_name="synthetic-freeform.wav"; fi
python3 - "$fixture_dir/$name-converted.wav" "$asset_dir/$asset_name" <<'PY'
import hashlib, sys, wave
from pathlib import Path
with wave.open(sys.argv[1]) as source:
    assert (source.getframerate(), source.getnchannels(), source.getsampwidth()) == (16000, 1, 2)
    assert source.getnframes() > 0, 'macOS speech synthesis produced no audio'
    # Exact canonical 44-byte header; 0.5s before and 2s after the synthetic speech.
    data = bytes(16000) + source.readframes(source.getnframes()) + bytes(64000)
with wave.open(sys.argv[2], 'wb') as output:
    output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000)
    output.writeframes(data)
print('Synthetic PCM seconds:', len(data) / 32000)
print('Synthetic WAV SHA256:', hashlib.sha256(Path(sys.argv[2]).read_bytes()).hexdigest())
PY
done
