FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

ARG ENVIRONMENT=dev
COPY requirements/ ./requirements/
RUN pip install -r requirements/${ENVIRONMENT}.txt

COPY . .

EXPOSE 8000
