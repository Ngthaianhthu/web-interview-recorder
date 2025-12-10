#!/bin/bash
set -e

# =========================
# Load Conda + Activate Env
# =========================
# Load conda environment
source /opt/miniconda3/etc/profile.d/conda.sh

# Activate your environment
conda activate web-interview

echo "Using Python: $(which python)"
echo "Using Pip:    $(which pip)"
echo ""

echo "========================="
echo "  STARTING BACKEND API   "
echo "========================="

cd backend
# Run backend using env's python
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

echo "Backend started (PID: $BACKEND_PID)"
echo ""
echo "========================="
echo "   STARTING FRONTEND     "
echo "========================="

cd frontend
python -m http.server 5501 &
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

# Clean shutdown
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID" INT
wait
