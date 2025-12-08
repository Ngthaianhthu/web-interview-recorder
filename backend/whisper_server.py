from flask import Flask, request, jsonify
import whisper
import os

app = Flask(__name__)

# Load model vào RAM khi khởi động server
# Model base = nhanh + độ chính xác tốt
model = whisper.load_model("base")

@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    temp_path = "temp_audio.wav"
    file.save(temp_path)

    result = model.transcribe(temp_path)
    os.remove(temp_path)

    return jsonify({"text": result["text"]})

if __name__ == "__main__":
    # Server chạy local tại port 5000
    app.run(host="0.0.0.0", port=5000)