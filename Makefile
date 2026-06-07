ENV_FILE := .env.prod
DC       := docker compose --env-file $(ENV_FILE)

.DEFAULT_GOAL := help

# ── Ayuda ──────────────────────────────────────────────────────────────────────
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Arranque ───────────────────────────────────────────────────────────────────
up: ## Levantar todo el stack (sin reconstruir)
	$(DC) up -d

build: ## Construir imágenes y levantar (redeploy completo)
	$(DC) up -d --build

restart: ## Reiniciar todos los servicios
	$(DC) restart

down: ## Parar y eliminar contenedores (los volúmenes se conservan)
	$(DC) down

# ── Estado ─────────────────────────────────────────────────────────────────────
ps: ## Ver estado de los contenedores
	$(DC) ps

health: ## Verificar endpoints públicos
	@echo "--- Frontend ---"
	@curl -sI https://rootgamez.dev/ | head -1
	@echo "--- API ---"
	@curl -sI https://rootgamez.dev/api/v1/ | head -1
	@echo "--- Health check ---"
	@curl -s https://rootgamez.dev/health/
	@echo ""

# ── Logs ───────────────────────────────────────────────────────────────────────
logs: ## Logs de todos los servicios (Ctrl+C para salir)
	$(DC) logs -f

logs-web: ## Logs del backend Django/Daphne
	$(DC) logs -f web

logs-celery: ## Logs de Celery worker
	$(DC) logs -f celery_worker

logs-db: ## Logs de PostgreSQL
	$(DC) logs -f db

# ── Django ─────────────────────────────────────────────────────────────────────
migrate: ## Aplicar migraciones de base de datos
	$(DC) exec web python manage.py migrate

superuser: ## Crear superusuario Django
	$(DC) exec web python manage.py createsuperuser

collectstatic: ## Recolectar archivos estáticos
	$(DC) exec web python manage.py collectstatic --noinput

shell: ## Shell interactivo de Django
	$(DC) exec web python manage.py shell

# ── Base de datos ──────────────────────────────────────────────────────────────
db-shell: ## Consola psql en el contenedor de PostgreSQL
	$(DC) exec db psql -U tesseract -d tesseract

db-backup: ## Volcar la base de datos a dump_$(fecha).sql
	$(DC) exec db pg_dump -U tesseract tesseract > dump_$$(date +%Y%m%d_%H%M%S).sql
	@echo "Backup guardado."

# ── Redeploy ───────────────────────────────────────────────────────────────────
deploy: ## git pull + reconstruir + migrar (redeploy estándar)
	git pull
	$(DC) up -d --build
	$(DC) exec web python manage.py migrate

# ── Limpieza ───────────────────────────────────────────────────────────────────
prune: ## Eliminar imágenes y capas Docker no utilizadas
	docker image prune -f
	docker builder prune -f

.PHONY: help up build restart down ps health logs logs-web logs-celery logs-db \
        migrate superuser collectstatic shell db-shell db-backup deploy prune
