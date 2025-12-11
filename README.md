# **Web Interview Recorder**
Web Interview Recorder is a lightweight web application that allows users to record video and audio directly from the browser. It is suitable for interview recordings, voice/video notes, or any quick recording tasks without needing external software.

## Features
- Record video using webcam  
- Record audio through the browser  
- Export recordings as downloadable files   
- Simple and clean interface
---
## Architecture
```graphql
web-interview-recorder/
├── backend/
│ ├── pycache/ # Python cache files
│ ├── main.py # Backend entrypoint (e.g. FastAPI app)
│ ├── requirements.txt # Python dependencies for backend
│ └── ... # other backend modules, utils
├── frontend/
│ ├── assets/ # images/icons, font
│ ├── index.html # main frontend page
│ ├── app.js # frontend JS (recording logic, UI)
│ └── style.css # frontend styles
├── run.sh # macOS / unix helper script
└── README.md
```
High-level architecture overview
```arduino
 ┌─────────────────┐        HTTP API         ┌─────────────────────┐
 │  Frontend (JS)  │  ───────────────────▶   │   Backend (FastAPI)│
 │  - MediaRecorder│                         │  - Save files       │
 │  - UI/Controls  │  ◀───────────────────   │   - Process audio  │
 └─────────────────┘        JSON/Files       └─────────────────────┘
```
---
## Workflow
![web-interview-recorder](frontend/assets/images/workflow-diagram.png)
---
# **Instructions**
Below are step-by-step instructions for both **macOS** and **Windows** users.

## **macOS setup**
On macOS, you can run both the backend and the frontend using the provided `run.sh` script.

#### 1. Give permission to run the script
Open Terminal inside the project folder:
```bash
chmod +x run.sh
```
#### 2. Run the project
```bash
./run.sh
```
#### 3. Open in your browser
Once the script starts the server, visit the printed URL, commonly: `http://localhost:8000`

## **Window setup**
On Windows, the project consists of:
- Backend → Python + venv (required)
- Frontend → served using XAMPP (htdocs folder)
There are two main steps: backend setup and frontend setup.
### I. Backend
### Option 1: Run with Git Bash (Easy)
#### 1. Install Git for Windows
Download from: https://git-scm.com/download/win
#### 2. Open Git Bash inside the project folder
#### 3. Start a simple local server for the frontend
```bash
python -m http.server 8000
```
#### 4. Open in your browser

### Option 2: Using CMD + Python venv
#### **1. Create a virtual environment and activate it
```bash
python -m venv venv
venv\Scripts\activate
```
#### **2. Install backend dependencies
```bash
pip install -r backend/requirements.txt
```
#### **3. Start the backend server
```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
Your backend will now be available at: `http://127.0.0.1:8000`

### II. Frontend
#### 1. Install XAMPP
Download: https://www.apachefriends.org/
#### 2. 2. Copy the frontend folder into XAMPP htdocs
Example: `C:\xampp\htdocs\web-interview-recorder\`
Your structure should look like:
```graphql
htdocs/
└── web-interview-recorder/
    ├── index.html
    ├── app.js
    ├── style.css
    └── assets/
```
#### 3. Start Apache from XAMPP Control Panel
#### 4. Access the frontend in your browser
`http://localhost/web-interview-recorder/`

## Notes
- Whisper packages (e.g., test_whisper, openai-whisper) may download additional files on first use.
- XAMPP is used only for the frontend; it does not run Python code.
- If you modify backend ports, update API URLs in app.js.
- Use Chrome/Edge/Firefox for stable MediaRecorder support.

