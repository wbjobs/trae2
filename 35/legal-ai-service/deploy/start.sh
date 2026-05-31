#!/bin/bash

cd "$(dirname "$0")/.."

echo "=== Legal AI Service - Quick Start ==="

echo "Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Creating data directories..."
mkdir -p logs data

echo "Checking Redis connection..."
if command -v redis-cli &> /dev/null; then
    redis-cli ping
fi

echo ""
echo "To start the service:"
echo "  source venv/bin/activate"
echo "  python main.py"
echo ""
echo "To start Celery worker (optional):"
echo "  source venv/bin/activate"
echo "  celery -A deploy.celery_tasks worker --loglevel=info"
echo ""
echo "API will be available at http://localhost:8000"
echo "API Documentation: http://localhost:8000/docs"
