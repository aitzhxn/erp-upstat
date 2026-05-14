#!/usr/bin/env bash
# Deploy on a VPS from the repository root (same directory as docker-compose.yml).
# Usage: ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull
make build
make up
