FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY docs ./docs
COPY models ./models
COPY data ./data
COPY pyproject.toml .

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Secrets are injected at runtime. Do not bake credentials into the image.
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
