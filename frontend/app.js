// ===== CẤU HÌNH CƠ BẢN =====
const API_BASE = "http://127.0.0.1:8000";   // backend FastAPI
const MAX_QUESTIONS = 5;                    // số câu hỏi

// ===== LẤY CÁC PHẦN TỬ DOM =====
const startScreen   = document.getElementById("start-screen");
const interviewScreen = document.getElementById("interview-screen");

const tokenInput    = document.getElementById("token-input");
const nameInput     = document.getElementById("name-input");
const btnStart      = document.getElementById("btn-start");
const startMessage  = document.getElementById("start-message");

const videoPreview  = document.getElementById("video-preview");
const questionTitle = document.getElementById("question-title");

const btnRecord     = document.getElementById("btn-record");
const btnStop       = document.getElementById("btn-stop");
const btnNext       = document.getElementById("btn-next");
const btnFinish     = document.getElementById("btn-finish");
const statusText    = document.getElementById("status-text");

// ===== BIẾN TRẠNG THÁI =====
let currentToken = null;    // token backend
let currentFolder = null;   // tên thư mục session server trả về
let currentQuestionIndex = 1;

let stream = null;          // MediaStream camera/mic
let mediaRecorder = null;   // MediaRecorder object
let recordedChunks = [];    // các mảnh video của 1 câu hỏi

// ===== HÀM GỌI BACKEND =====

// 1) verify token
async function apiVerifyToken(token) {
  const res = await fetch(`${API_BASE}/api/verify-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });

  if (!res.ok) {
    throw new Error("Token không hợp lệ");
  }
  return res.json(); // { ok: true }
}

// 2) start session
async function apiStartSession(token, userName) {
  const res = await fetch(`${API_BASE}/api/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, userName })
  });

  if (!res.ok) {
    throw new Error("Không tạo được phiên phỏng vấn");
  }
  return res.json(); // { ok: true, folder: "dd_mm_yyyy_HH_MM_ten" }
}

// 3) upload từng câu hỏi
async function apiUploadOne(token, folder, questionIndex, blob) {
  const form = new FormData();
  form.append("token", token);
  form.append("folder", folder);
  form.append("questionIndex", String(questionIndex));
  form.append(
    "video",
    new File([blob], `Q${questionIndex}.webm`, { type: "video/webm" })
  );

  const res = await fetch(`${API_BASE}/api/upload-one`, {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    throw new Error("Upload thất bại");
  }
  return res.json(); // { ok: true, savedAs: "Q1.webm", ... }
}

// 4) finish session
async function apiFinishSession(token, folder, questionsCount) {
  const res = await fetch(`${API_BASE}/api/session/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, folder, questionsCount })
  });

  if (!res.ok) {
    throw new Error("Finish session lỗi");
  }
  return res.json(); // { ok: true }
}

// ===== HÀM LIÊN QUAN ĐẾN CAMERA & GHI HÌNH =====

// xin quyền cam/mic và hiện preview
async function initCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
  videoPreview.srcObject = stream;
}

// thiết lập MediaRecorder cho 1 session
function setupRecorder() {
  recordedChunks = []; // reset

  mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    // khi stop, ghép chunk thành 1 blob
    const blob = new Blob(recordedChunks, { type: "video/webm" });

    statusText.textContent = "Đang upload video...";

    try {
      await uploadWithRetry(blob, currentQuestionIndex);
      statusText.textContent = "Upload xong ✅";
      btnNext.disabled = false; // cho phép sang câu tiếp theo
    } catch (err) {
      statusText.textContent = "Upload thất bại nhiều lần. Vui lòng thử lại.";
    }
  };
}

// upload có retry (backoff đơn giản: 1s, 2s, 4s)
async function uploadWithRetry(blob, questionIndex) {
  const delays = [1000, 2000, 4000]; // ms

  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      await apiUploadOne(currentToken, currentFolder, questionIndex, blob);
      return; // thành công -> thoát
    } catch (e) {
      console.warn("Upload lỗi, thử lại lần", attempt + 1, e);
      if (attempt === delays.length - 1) throw e; // hết lần thử
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

// hiển thị text câu hỏi (ở đây chỉ hiển thị số, bạn muốn có nội dung thì chỉnh thêm)
function updateQuestionTitle() {
  questionTitle.textContent = `Câu hỏi ${currentQuestionIndex}/${MAX_QUESTIONS}`;
}

// ===== SỰ KIỆN NÚT =====

// Khi bấm "Bắt đầu"
btnStart.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  const name = nameInput.value.trim();

  if (!token || !name) {
    startMessage.textContent = "Vui lòng nhập đầy đủ token và tên.";
    return;
  }

  startMessage.textContent = "Đang kiểm tra token...";
  btnStart.disabled = true;

  try {
    // 1) verify token
    await apiVerifyToken(token);

    // 2) start session
    const res = await apiStartSession(token, name);
    currentToken = token;
    currentFolder = res.folder;

    // 3) xin quyền camera
    await initCamera();

    // 4) setup recorder
    setupRecorder();
    updateQuestionTitle();

    // chuyển sang màn phỏng vấn
    startScreen.style.display = "none";
    interviewScreen.style.display = "block";
    statusText.textContent = "Sẵn sàng ghi câu hỏi 1.";

  } catch (err) {
    console.error(err);
    startMessage.textContent = err.message || "Có lỗi xảy ra khi bắt đầu.";
    btnStart.disabled = false;
  }
});

// Khi bấm "Record"
btnRecord.addEventListener("click", () => {
  if (!mediaRecorder) {
    setupRecorder();
  }
  recordedChunks = [];
  mediaRecorder.start();

  statusText.textContent = "Đang ghi hình...";
  btnRecord.disabled = true;
  btnStop.disabled = false;
  btnNext.disabled = true;
});

// Khi bấm "Stop"
btnStop.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    statusText.textContent = "Đã dừng ghi, đang xử lý...";
  }
  btnStop.disabled = true;
});

// Khi bấm "Next"
btnNext.addEventListener("click", () => {
  if (currentQuestionIndex < MAX_QUESTIONS) {
    currentQuestionIndex += 1;
    updateQuestionTitle();

    // chuẩn bị cho lần ghi tiếp theo
    btnRecord.disabled = false;
    btnNext.disabled = true;
    statusText.textContent = `Sẵn sàng ghi câu hỏi ${currentQuestionIndex}.`;
  } else {
    statusText.textContent = "Đã hết câu hỏi, bạn có thể nhấn Finish.";
  }
});

// Khi bấm "Finish"
btnFinish.addEventListener("click", async () => {
  if (!currentToken || !currentFolder) {
    statusText.textContent = "Chưa có phiên hợp lệ.";
    return;
  }

  statusText.textContent = "Đang hoàn tất phiên phỏng vấn...";
  btnFinish.disabled = true;

  try {
    await apiFinishSession(currentToken, currentFolder, MAX_QUESTIONS);
    statusText.textContent = "Hoàn tất phiên phỏng vấn. Cảm ơn bạn!";
  } catch (err) {
    console.error(err);
    statusText.textContent = "Finish lỗi, vui lòng thử lại.";
    btnFinish.disabled = false;
  }
});