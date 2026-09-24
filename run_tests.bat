@echo off
cd /d "c:\Users\Ausu\Downloads\hack the weather"
.venv\Scripts\python.exe -m pytest tests/test_decision.py tests/test_api.py tests/test_llm.py tests/test_telegram.py -v --tb=short
