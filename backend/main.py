from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from zoneinfo import ZoneInfo
from datetime import datetime
from typing import List
import os, json

# ===== Load config từ .env =====
from dotenv import load_dotenv
load_dotenv()

VALID_TOKENS = [t.strip() for t in os.getenv("VALID_TOKENS", "").split(",") if t.strip()]
BASE_STORAGE = Path(os.getenv("BASE_STORAGE", "uploads"))
TIMEZONE = os.getenv("TIMEZONE", "Asia/Bangkok")
MAX_MB = int(os.getenv("MAX_MB_PER_VIDEO", "100"))

app = FastAPI()

# Cho phép frontend gọi API (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # đơn giản cho dev, sau có thể siết lại
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
    if req.token not in VALID_TOKENS:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"ok": True}


@app.post("/api/session/start")
def session_start(req: StartReq):
    if req.token not in VALID_TOKENS:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = sanitize_user_name(req.userName)
    folder = make_session_folder(user)

    meta = {
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


@app.post("/api/upload-one")
async def upload_one(
    token: str = Form(...),
    folder: str = Form(...),
    questionIndex: int = Form(...),
    video: UploadFile = File(...)
):
    if token not in VALID_TOKENS:
        raise HTTPException(status_code=401, detail="Invalid token")

    folder_path = BASE_STORAGE / folder
    if not folder_path.exists():
        raise HTTPException(status_code=400, detail="Folder not found")

    meta = load_meta(folder_path)
    if meta.get("finished"):
        raise HTTPException(status_code=400, detail="Session finished")

    if (video.content_type or "").lower() not in {"video/webm", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Invalid MIME type (need video/webm)")

    data = await video.read()
    if bytes_to_mb(len(data)) > MAX_MB:
        raise HTTPException(status_code=400, detail=f"File too large > {MAX_MB} MB")

    out_name = f"Q{questionIndex}.webm"
    (folder_path / out_name).write_bytes(data)

    meta.setdefault("uploaded", []).append({
        "q": questionIndex,
        "file": out_name,
        "uploadedAt": now_local_iso()
    })
    meta.setdefault("logs", []).append({
        "at": now_local_iso(),
        "event": "upload-one",
        "q": questionIndex
    })
    save_meta(folder_path, meta)

    return {"ok": True, "savedAs": out_name}


@app.post("/api/session/finish")
def session_finish(req: FinishReq):
    if req.token not in VALID_TOKENS:
        raise HTTPException(status_code=401, detail="Invalid token")

    folder_path = BASE_STORAGE / req.folder
    if not folder_path.exists():
        raise HTTPException(status_code=400, detail="Folder not found")

    meta = load_meta(folder_path)
    meta["finished"] = True
    meta["questionsCount"] = int(req.questionsCount)
    meta.setdefault("logs", []).append({
        "at": now_local_iso(),
        "event": "session/finish"
    })
    save_meta(folder_path, meta)

    return {"ok": True}