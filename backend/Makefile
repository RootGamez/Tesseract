# Makefile for Django Docker Project

# Variables
COMPOSE = docker-compose
EXEC = $(COMPOSE) exec web
MANAGE = python manage.py

.PHONY: help build up down restart logs ps shell migrate makemigrations createsuperuser test clean-volumes

help:
	@echo "Available commands:"
	@echo "  make build            Build the docker containers"
	@echo "  make up               Run the docker containers in background"
	@echo "  make down             Stop the docker containers"
	@echo "  make restart          Restart the docker containers"
	@echo "  make logs             Show docker logs"
	@echo "  make ps               List running containers"
	@echo "  make shell            Open a shell in the web container"
	@echo "  make migrate          Run django migrations"
	@echo "  make makemigrations   Create new django migrations"
	@echo "  make createsuperuser  Create a django superuser"
	@echo "  make test             Run django tests"
	@echo "  make clean-volumes    Remove all docker volumes (WARNING: Data Loss)"

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

shell:
	$(EXEC) /bin/sh

migrate:
	$(EXEC) $(MANAGE) migrate

makemigrations:
	$(EXEC) $(MANAGE) makemigrations

createsuperuser:
	$(EXEC) $(MANAGE) createsuperuser

test:
	$(EXEC) pytest

clean-volumes:
	$(COMPOSE) down -v
