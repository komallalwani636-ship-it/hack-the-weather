$env:Path = "c:\Users\Ausu\Downloads\hack the weather\.venv\Scripts;" + $env:Path
python -m pytest tests/test_decision.py tests/test_api.py tests/test_llm.py tests/test_telegram.py -v --tb=short | Tee-Object -FilePath test_results.txt
