#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [ ! -d node_modules/@modelcontextprotocol/sdk ]; then npm ci --omit=dev --no-audit --no-fund; fi
exec node server.mjs
