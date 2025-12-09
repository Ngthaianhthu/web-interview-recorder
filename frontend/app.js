// ===== CẤU HÌNH CƠ BẢN =====
const API_BASE = "http://127.0.0.1:8000";
const MAX_QUESTIONS = 5;

// ===== LẤY DOM =====
const startScreen      = document.getElementById("start-screen");
const interviewScreen  = document.getElementById("interview-screen");

const tokenInput       = document.getElementById("token-input");
const nameInput        = document.getElementById("name-input");
const btnStart         = document.getElementById("btn-start");
const startMessage     = document.getElementById("start-message");

const videoPreview     = document.getElementById("video-preview");
const questionTitle    = document.getElementById("question-title");

const btnRecord        = document.getElementById("btn-record");
const btnStop          = document.getElementById("btn-stop");
const btnNext          = document.getElementById("btn-next");
const btnFinish        = document.getElementById("btn-finish");
const statusText       = document.getElementById("status-text");
const btnRetryUpload   = document.getElementById("btn-retry-upload");

/* ==========================
    BLUR BACKGROUND AI
========================== */
const blurCanvas = document.getElementById("blur-bg");
const blurCtx = blurCanvas.getContext("2d");
const videoRaw = document.createElement("video");
videoRaw.autoplay = true;
videoRaw.playsinline = true;
videoRaw.muted = true;

async function startBlurBackground() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 }
    });

    videoRaw.srcObject = stream;

    videoRaw.onloadeddata = () => {
        blurCanvas.width = videoRaw.videoWidth;
        blurCanvas.height = videoRaw.videoHeight;
        renderBlurLoop();
    };
}

const segmenter = new SelfieSegmentation({ modelSelection: 1 });

segmenter.onResults(results => {
    const mask = results.segmentationMask;

    // Blur background
    blurCtx.save();
    blurCtx.filter = "blur(18px)";
    blurCtx.drawImage(videoRaw, 0, 0, blurCanvas.width, blurCanvas.height);
    blurCtx.restore();

    // Keep person area
    blurCtx.save();
    blurCtx.globalCompositeOperation = "destination-in";
    blurCtx.drawImage(mask, 0, 0, blurCanvas.width, blurCanvas.height);
    blurCtx.restore();

    // Draw person clear
    blurCtx.save();
    blurCtx.globalCompositeOperation = "destination-over";
    blurCtx.drawImage(videoRaw, 0, 0, blurCanvas.width, blurCanvas.height);
    blurCtx.restore();
});

async function renderBlurLoop() {
    await segmenter.send({ image: videoRaw });
    requestAnimationFrame(renderBlurLoop);
}

startBlurBackground();

// ===== BIẾN TRẠNG THÁI =====
let currentToken = null;
let currentFolder = null;
let currentQuestionIndex = 1;

let stream = null;
let mediaRecorder = null;
let recordedChunks = [];

const QUESTIONS = [
  "Hãy giới thiệu ngắn gọn về bản thân và kinh nghiệm nổi bật của bạn.",
  "Tại sao bạn muốn ứng tuyển vào vị trí này trong công ty?",
  "Điểm mạnh lớn nhất của bạn trong công việc là gì? Hãy nêu ví dụ cụ thể.",
  "Điểm yếu nào bạn đang cố cải thiện? Bạn đã làm gì để cải thiện nó?",
  "Hãy kể về một thành tựu mà bạn tự hào nhất trong sự nghiệp và cách bạn đạt được nó."
];

// ===== API CALLS =====
async function apiVerifyToken(token) {
  const res = await fetch(`${API_BASE}/api/verify-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  if (!res.ok) throw new Error("Token không hợp lệ");
  return res.json();
}

// 2) start session
async function apiStartSession(token, userName) {
  const res = await fetch(`${API_BASE}/api/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, userName })
  });
  if (!res.ok) throw new Error("Không tạo được phiên phỏng vấn");
  return res.json();
}

// 3) upload từng câu hỏi
async function apiUploadOne(token, folder, questionIndex, blob) {
  const form = new FormData();
  form.append("token", token);
  form.append("folder", folder);
  form.append("questionIndex", String(questionIndex));
  form.append("video", new File([blob], `Q${questionIndex}.webm`, { type: "video/webm" }));

  const res = await fetch(`${API_BASE}/api/upload-one`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload thất bại");
  return res.json();
}

// 4) finish session
async function apiFinishSession(token, folder, questionsCount) {
  const res = await fetch(`${API_BASE}/api/session/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, folder, questionsCount })
  });
  if (!res.ok) throw new Error("Finish session lỗi");
  return res.json();
}

// ===== CAMERA =====
// xin quyền cam/mic và hiện preview
// ===== CAMERA + NOISE CANCELLATION =====
async function initCamera() {
  statusText.textContent = "Đang xin quyền camera…";

  try {
    // --- STEP 1: Lấy stream gốc với noise suppression của browser ---
    const rawStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true
      }
    });

    // --- STEP 2: Tạo AudioContext để xử lý tiếng ồn mạnh ---
    const audioCtx = new AudioContext();
    const src = audioCtx.createMediaStreamSource(rawStream);

    // High-pass filter – loại tiếng ù, tiếng quạt, tiếng rung thấp
    const highPass = audioCtx.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.value = 200;

    // Low-pass filter – loại tiếng rè, tiếng rít cao
    const lowPass = audioCtx.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = 6000;

    // Gain – giúp giọng rõ hơn
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 1.15;

    // Nối pipeline lọc
    src.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(gainNode);

    // Kết quả audio cuối
    const processedAudio = audioCtx.createMediaStreamDestination();
    gainNode.connect(processedAudio);

    // --- STEP 3: Ghép video gốc + audio đã lọc ---
    const finalStream = new MediaStream([
      ...rawStream.getVideoTracks(),
      ...processedAudio.stream.getAudioTracks(),
    ]);

    // --- STEP 4: Hiển thị preview video người dùng ---
    videoPreview.srcObject = finalStream;

    stream = finalStream; // Đây là stream dùng để record
    statusText.textContent = "Đã bật camera + noise cancellation.";

  } catch (err) {
    console.error("Camera error:", err);

    if (err.name === "NotAllowedError") {
      statusText.textContent = "Bạn đã từ chối quyền camera/micro.";
      showCameraPermissionModal();
      btnRecord.disabled = true;
      return;
    }

    statusText.textContent = "Không thể truy cập camera.";
  }
}


// ===== RECORDER =====
function setupRecorder() {
  recordedChunks = []; //reset
  mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {

    const blob = new Blob(recordedChunks, { type: "video/webm" });

    statusText.textContent = "Đang upload video...";

    try {
      await uploadWithRetry(blob, currentQuestionIndex);
      statusText.textContent = "Upload xong!";
      btnNext.disabled = false;
      btnRetryUpload.style.display = "none";
    } catch {
      statusText.textContent = "Upload thất bại. Nhấn Retry.";
      btnRetryUpload.style.display = "inline-block";

      window._lastFailedBlob = blob;
      window._lastFailedIndex = currentQuestionIndex;
    }
  };
}

// Retry 1s – 2s – 4s
async function uploadWithRetry(blob, index) {
  const delays = [1000, 2000, 4000];
  for (let i = 0; i < delays.length; i++) {
    try {
      await apiUploadOne(currentToken, currentFolder, index, blob);
      return;
    } catch {
      if (i === delays.length - 1) throw new Error("Upload failed");
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
}

// ===== UI =====
function updateQuestionTitle() {
  questionTitle.textContent =
    `Câu ${currentQuestionIndex}/${MAX_QUESTIONS}: ${QUESTIONS[currentQuestionIndex - 1]}`;
}

function sanitizeName(raw) {
  const name = raw.trim();
  return /^[a-zA-Z0-9_]+$/.test(name) ? name.toLowerCase() : null;
}

// ===== MODAL =====
function showCameraPermissionModal() {
  document.getElementById("camera-permission-modal").style.display = "flex";
}

document.getElementById("close-permission-modal")
  .addEventListener("click", () => {
    document.getElementById("camera-permission-modal").style.display = "none";
  });

// ===== BUTTON EVENTS =====
btnStart.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  const safeName = sanitizeName(nameInput.value);

  if (!token) return startMessage.textContent = "Vui lòng nhập token.";
  if (!safeName)
    return startMessage.textContent = "Tên không hợp lệ (a-z, 0-9, không dấu).";

  btnStart.disabled = true;
  startMessage.textContent = "Đang kiểm tra token...";

  try {
    // 1) verify token
    await apiVerifyToken(token);

    // 2) start session 
    const res = await apiStartSession(token, safeName);
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
    startMessage.textContent = err.message;
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
  if (mediaRecorder.state === "recording") mediaRecorder.stop();
  btnStop.disabled = true;
});

// Khi bấm "Next"
btnNext.addEventListener("click", () => {
  if (currentQuestionIndex < MAX_QUESTIONS) {
    currentQuestionIndex++;
    updateQuestionTitle();

    // chuẩn bị cho lần ghi tiếp theo
    btnRecord.disabled = false;
    btnNext.disabled = true;
    statusText.textContent = `Sẵn sàng ghi câu hỏi ${currentQuestionIndex}.`;
  } else {
    statusText.textContent = "Đã hết câu hỏi! Vui lòng ấn Finish để gửi bài phỏng vấn!";
  }
});

// Khi bấm "Finish"
btnFinish.addEventListener("click", async () => {
  statusText.textContent = "Đang hoàn tất phiên...";
  btnFinish.disabled = true;

  try {
    await apiFinishSession(currentToken, currentFolder, MAX_QUESTIONS);
    statusText.textContent = "Hoàn tất phỏng vấn!";
  } catch {
    statusText.textContent = "Finish lỗi.";
    btnFinish.disabled = false;
  }
});

btnRetryUpload.addEventListener("click", async () => {
  if (!window._lastFailedBlob) {
    statusText.textContent = "Không có video để retry.";
    return;
  }

  btnRetryUpload.disabled = true;
  statusText.textContent = "Retry upload...";

  try {
    await uploadWithRetry(window._lastFailedBlob, window._lastFailedIndex);
    statusText.textContent = "Retry thành công!";
    btnRetryUpload.style.display = "none";
  } catch {
    statusText.textContent = "Retry thất bại.";
  } finally {
    btnRetryUpload.disabled = false;
  }
});
