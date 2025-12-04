#!/bin/bash
set -e

echo "========================="
echo "  STARTING BACKEND API   "
echo "========================="

cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

echo "Backend started (PID: $BACKEND_PID)"
echo ""
echo "========================="
echo "   STARTING FRONTEND     "
echo "========================="

cd frontend
python3 -m http.server 5501 &
FRONTEND_PID=$!
cd ..

echo "Frontend started (PID: $FRONTEND_PID)"
echo ""
echo "======================================"
echo "System is running!"
echo "Frontend: http://127.0.0.1:5501"
echo "Backend:  http://127.0.0.1:8000"
echo "======================================"
echo ""

trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID" INT
wait
