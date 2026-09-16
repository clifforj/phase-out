#!/bin/sh
set -eu
cd /opt/phase-out
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.images.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.images.yml up -d --no-build
