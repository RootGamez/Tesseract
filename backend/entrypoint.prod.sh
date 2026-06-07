#!/usr/bin/env bash
# Entrypoint de producción del backend Tesseract.
# Espera la BD, aplica migraciones, recolecta estáticos y arranca Daphne (ASGI),
# que sirve tanto HTTP (Django) como WebSockets (Channels).
set -euo pipefail

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.prod}"

echo "[entrypoint] Esperando a PostgreSQL en ${DB_HOST:-db}:${DB_PORT:-5432}..."
python - <<'PY'
import os, time, socket
host = os.environ.get("DB_HOST", "db")
port = int(os.environ.get("DB_PORT", "5432"))
for _ in range(60):
    try:
        with socket.create_connection((host, port), timeout=2):
            break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit(f"[entrypoint] PostgreSQL no respondió en {host}:{port}")
print("[entrypoint] PostgreSQL disponible.")
PY

echo "[entrypoint] Aplicando migraciones..."
python manage.py migrate --noinput

echo "[entrypoint] Recolectando archivos estáticos..."
python manage.py collectstatic --noinput

echo "[entrypoint] Iniciando Daphne en 0.0.0.0:8000..."
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
