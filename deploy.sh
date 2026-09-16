#!/usr/bin/env bash
# Run this ON the Raspberry Pi, after merging a feature branch into master
# on GitHub, to pull the latest master and rebuild/restart the container.
# Deliberately manual — nothing on the Pi watches GitHub or redeploys on its
# own, so nothing goes live until you run this yourself.
set -euo pipefail

cd "$(dirname "$0")"

git checkout master
git pull --ff-only origin master
docker compose up -d --build

echo "Deployed $(git rev-parse --short HEAD)"
