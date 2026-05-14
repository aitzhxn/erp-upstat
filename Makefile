COMPOSE := docker compose
COMPOSE_LOCAL := docker compose -f docker-compose.local.yml
COMPOSE_LOCAL_DEV := docker compose -f docker-compose.local.yml -f docker-compose.local.dev.yml

.PHONY: help \
	build up down logs ps \
	up-local build-local down-local restart-local logs-local ps-local \
	up-local-dev down-local-dev logs-local-dev ps-local-dev \
	shell-backend-local shell-frontend-local \
	dev-backend dev-frontend clean-local

help: ## Show all available commands
	@awk 'BEGIN {FS = ":.*## "}; /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-22s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build production images (VPS: git pull && make build && make up)
	$(COMPOSE) build

up: ## Start production stack (db + backend + frontend) in the background
	$(COMPOSE) up -d

down: ## Stop production stack
	$(COMPOSE) down

logs: ## Follow production stack logs
	$(COMPOSE) logs -f

ps: ## Show production stack containers
	$(COMPOSE) ps

up-local: ## Build (if needed) and start local Docker stack (backend + frontend)
	$(COMPOSE_LOCAL) up -d --build

build-local: ## Build local Docker images
	$(COMPOSE_LOCAL) build

down-local: ## Stop local Docker stack
	$(COMPOSE_LOCAL) down

restart-local: ## Restart local Docker stack
	$(COMPOSE_LOCAL) down
	$(COMPOSE_LOCAL) up -d

logs-local: ## Follow logs for local Docker stack
	$(COMPOSE_LOCAL) logs -f

ps-local: ## Show local stack containers
	$(COMPOSE_LOCAL) ps

up-local-dev: ## Start dev overlay (backend + frontend with hot reload)
	$(COMPOSE_LOCAL_DEV) up -d --build

down-local-dev: ## Stop dev overlay stack
	$(COMPOSE_LOCAL_DEV) down

logs-local-dev: ## Follow logs for dev overlay stack
	$(COMPOSE_LOCAL_DEV) logs -f

ps-local-dev: ## Show dev overlay containers
	$(COMPOSE_LOCAL_DEV) ps

shell-backend-local: ## Open shell in backend container
	$(COMPOSE_LOCAL) exec backend sh

shell-frontend-local: ## Open shell in frontend container
	$(COMPOSE_LOCAL) exec frontend sh

dev-backend: ## Run backend on host in watch mode
	cd backend && npm run dev

dev-frontend: ## Run frontend on host in watch mode
	cd frontend && npm run dev -- --host 0.0.0.0 --port 5173

clean-local: ## Remove local stack and volumes
	$(COMPOSE_LOCAL) down -v
