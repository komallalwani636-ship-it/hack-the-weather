if (Test-Path ".\.venv\Scripts") {
    $env:Path = "$PSScriptRoot\.venv\Scripts;" + $env:Path
}
python -m pytest tests -v --tb=short | Tee-Object -FilePath test_results.txt

