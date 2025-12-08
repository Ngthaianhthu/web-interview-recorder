from faster_whisper import WhisperModel

print("Loading model...")
model = WhisperModel("small", device="cpu", compute_type="int8")

print("Transcribing audio.wav...")
segments, info = model.transcribe("audio.wav")

text = " ".join(s.text for s in segments)
print("Transcript:", text)