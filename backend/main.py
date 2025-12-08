# ===== Load .env before everything =====
from dotenv import load_dotenv
load_dotenv()

import os
import json
import hashlib

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from zoneinfo import ZoneInfo
from datetime import datetime
from faster_whisper import WhisperModel
whisper_model = None

def get_whisper():
    global whisper_model
    if whisper_model is None:
        whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
    return whisper_model

# ===== Load config from .env =====
BASE_STORAGE = Path(os.getenv("BASE_STORAGE", "uploads"))
TIMEZONE = os.getenv("TIMEZONE", "Asia/Bangkok")
MAX_MB = int(os.getenv("MAX_MB_PER_VIDEO", "100"))
ALLOWED_MIME = {
    "video/webm",
    "video/mp4",
    "video/mpeg",
    "video/x-matroska",
    "application/octet-stream"
}

app = FastAPI()

# Cho phép frontend gọi API (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_STORAGE.mkdir(parents=True, exist_ok=True)

# ===== Helper =====
def now_local_iso():
    tz = ZoneInfo(TIMEZONE)
    return datetime.now(tz).isoformat()

def sanitize_user_name(s: str) -> str:
    import re
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9_-]+", "", s)
    return s or "user"

def make_session_folder(user_name: str) -> Path:
    tz = ZoneInfo(TIMEZONE)
    ts = datetime.now(tz).strftime("%d_%m_%Y_%H_%M")
    folder_name = f"{ts}_{user_name}"
    folder = BASE_STORAGE / folder_name
    folder.mkdir(parents=True, exist_ok=True)
    return folder

def meta_path(folder: Path) -> Path:
    return folder / "meta.json"

def load_meta(folder: Path) -> dict:
    p = meta_path(folder)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {}

def save_meta(folder: Path, data: dict):
    meta_path(folder).write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

def bytes_to_mb(b: int) -> float:
    return b / (1024 * 1024)

import subprocess, shlex

def extract_audio(input_path: Path, out_audio: Path):
    cmd = (
        f"ffmpeg -y -i {shlex.quote(str(input_path))} "
        f"-ar 16000 -ac 1 -vn {shlex.quote(str(out_audio))}"
    )
    proc = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="ignore"))

# ===== Schemas =====
class VerifyReq(BaseModel):
    token: str

class StartReq(BaseModel):
    token: str
    userName: str

class FinishReq(BaseModel):
    token: str
    folder: str
    questionsCount: int


# ===== API endpoints =====

@app.post("/api/verify-token")
def verify_token(req: VerifyReq):
    if not req.token:
        raise HTTPException(status_code=400, detail="Token is required")
    return {"ok": True}


@app.post("/api/session/start")
def session_start(req: StartReq):
    if not req.token:
        raise HTTPException(status_code=400, detail="Token is required")

    user = sanitize_user_name(req.userName)
    folder = make_session_folder(user)

    meta = {
        "version": 1,
        "sessionStart": now_local_iso(),
        "sessionEnd": None,
        "userName": user,
        "folder": folder.name,
        "timeZone": TIMEZONE,
        "uploaded": [],
        "finished": False,
        "questionsCount": 0,
        "logs": [
            {"at": now_local_iso(), "event": "session/start"}
        ],
    }

    save_meta(folder, meta)
    return {"ok": True, "folder": folder.name}

import asyncio

def transcribe_blocking(audio_path):
    model = get_whisper()
    segments, info = model.transcribe(str(audio_path))
    return " ".join(seg.text for seg in segments).strip()

async def transcribe_local_async(audio_path):
    return await asyncio.to_thread(transcribe_blocking, audio_path)

@app.post("/api/upload-one")
async def upload_one(
    token: str = Form(...),
    folder: str = Form(...),
    questionIndex: int = Form(...),
    video: UploadFile = File(...)
):
    if not token:
        raise HTTPException(status_code=400, detail="Token is required")

    try:
        questionIndex = int(questionIndex)
    except ValueError:
        raise HTTPException(status_code=400, detail="questionIndex must be a number")

    if not (1 <= questionIndex <= 5):
        raise HTTPException(status_code=400, detail="questionIndex must be between 1 and 5")

    folder_path = BASE_STORAGE / folder
    if not folder_path.exists():
        raise HTTPException(status_code=400, detail="Folder not found")

    meta = load_meta(folder_path)
    if meta.get("finished"):
        raise HTTPException(status_code=400, detail="Session finished")

    mime = (video.content_type or "").lower()
    ext = Path(video.filename or "").suffix.lower()

    if mime not in ALLOWED_MIME:
        if ext not in [".mp4", ".webm", ".mkv"]:
            raise HTTPException(status_code=400, detail=f"Invalid MIME: {mime}")


    data = await video.read()
    if bytes_to_mb(len(data)) > MAX_MB:
        raise HTTPException(status_code=400, detail=f"File too large > {MAX_MB} MB")

    # 1) LƯU FILE VIDEO
    # 1) LƯU FILE VIDEO với đuôi thật
    ext = Path(video.filename or "").suffix.lower()
    if not ext:
        ext = ".webm"   # fallback khi browser không gửi filename

    out_name = f"Q{questionIndex}{ext}"
    video_path = folder_path / out_name
    video_path.write_bytes(data)

    size_mb = round(bytes_to_mb(len(data)), 2)
    md5 = hashlib.md5(data).hexdigest()

    # ======== 2) SPEECH-TO-TEXT (LOCAL WHISPER) ========
    # Tạo file audio tạm
    tmp_audio = folder_path / f"Q{questionIndex}.wav"

    try:
        # B1: convert video → audio
        extract_audio(video_path, tmp_audio)
        # B2: transcribe (async, không block)
        transcript_text = await transcribe_local_async(tmp_audio)
    except Exception as e:
        transcript_text = f"[LOCAL STT ERROR]\n{str(e)}"
    finally:
        # cleanup audio
        if tmp_audio.exists():
            tmp_audio.unlink()


    # ======== 3) GHI transcript.txt ========
    transcript_file = folder_path / "transcript.txt"
    old = ""
    if transcript_file.exists():
        old = transcript_file.read_text()

    import re
    pattern = rf"=== Question {questionIndex} ===[\s\S]*?(?=\n=== Question|\Z)"
    old = re.sub(pattern, "", old)

    with open(transcript_file, "w", encoding="utf-8") as tf:
        tf.write(old.strip())
        tf.write(f"\n\n=== Question {questionIndex} ===\n")
        tf.write(transcript_text + "\n")


    # ======== 4) CẬP NHẬT META ========
    uploads = meta.setdefault("uploaded", [])
    uploads = [u for u in uploads if u["q"] != questionIndex]
    meta["uploaded"] = uploads

    uploads.append({
        "q": questionIndex,
        "file": out_name,
        "sizeMB": size_mb,
        "checksum": md5,
        "mime": video.content_type,
        "uploadedAt": now_local_iso(),
        "transcript": transcript_text[:200]
    })

    meta.setdefault("logs", []).append({
        "at": now_local_iso(),
        "event": "upload-one",
        "q": questionIndex
    })

    save_meta(folder_path, meta)

    # ======== 5) TRẢ VỀ FRONTEND ========
    return {
        "ok": True,
        "savedAs": out_name,
        "transcript": transcript_text
    }


@app.post("/api/session/finish")
def session_finish(req: FinishReq):
    if not req.token:
        raise HTTPException(status_code=400, detail="Token is required")

    folder_path = BASE_STORAGE / req.folder
    if not folder_path.exists():
        raise HTTPException(status_code=400, detail="Folder not found")

    meta = load_meta(folder_path)
    meta["finished"] = True
    meta["sessionEnd"] = now_local_iso()
    meta["questionsCount"] = int(req.questionsCount)
    meta.setdefault("logs", []).append({
        "at": now_local_iso(),
        "event": "session/finish"
    })
    save_meta(folder_path, meta)

    return {"ok": True}