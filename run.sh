#!/bin/bash
set -e

echo "========================="
echo "  STARTING BACKEND API   "
echo "========================="

# Chạy backend
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

echo "Backend started (PID: $BACKEND_PID)"
echo ""
echo "========================="
echo "   STARTING FRONTEND     "
echo "========================="

# Chạy frontend (port 5500 là chuẩn cho VSCode Live Preview)
cd frontend
python3 -m http.server 5500 &
FRONTEND_PID=$!
cd ..

echo "Frontend started (PID: $FRONTEND_PID)"
echo ""
echo "======================================"
echo "System is running!"
echo "Frontend: http://127.0.0.1:5500"
echo "Backend:  http://127.0.0.1:8000"
echo "======================================"
echo ""

# Giữ script chạy và ngắt khi bấm Ctrl+C
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID" INT
wait
