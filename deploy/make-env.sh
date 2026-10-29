#!/bin/sh
# Run once on the server, inside the app folder:   sh deploy/make-env.sh
# Writes .env for docker-compose.yml with a random database password, so you
# never type or copy a secret by hand. Never overwrites an existing .env.
#
# Moving from the old deploy: if deploy/.env.prod exists, its DB_PASSWORD is
# reused (the existing database only accepts that password).
set -eu
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env already exists - left unchanged."
  exit 0
fi

old_value() { [ -f deploy/.env.prod ] && sed -n "s/^$1=//p" deploy/.env.prod | tail -n 1 || true; }

DB_PASSWORD="$(old_value DB_PASSWORD)"
if [ -z "$DB_PASSWORD" ]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  echo "New random DB_PASSWORD created."
else
  echo "DB_PASSWORD reused from deploy/.env.prod."
fi
APP_PORT="$(old_value WEB_PORT)"; APP_PORT="${APP_PORT:-8344}"
API_PORT="$(old_value API_PORT)"; API_PORT="${API_PORT:-8345}"

umask 077
cat > .env <<ENV
DB_PASSWORD=$DB_PASSWORD
DB_NAME=baanrai
APP_PORT=$APP_PORT
API_PORT=$API_PORT
APP_IMAGE=ghcr.io/arm89400-hue/banrai-backend:latest
MIGRATOR_IMAGE=ghcr.io/arm89400-hue/banrai-migrator:latest
WEB_IMAGE=ghcr.io/arm89400-hue/banrai-frontend:latest
ENV
echo "Wrote .env (readable by you only). Ports: web $APP_PORT, api $API_PORT."

if [ ! -f backend/.env ]; then
  sed "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" backend/.env.example > backend/.env
  echo "Wrote backend/.env from the example with a random JWT_SECRET."
  echo "Fill in the payment, email and Google values in backend/.env before going live."
fi
