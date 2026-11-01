#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [ ! -d node_modules/@modelcontextprotocol/sdk ]; then npm ci --omit=dev --no-audit --no-fund; fi
if [ -x runtime/node ]; then exec ./runtime/node server.mjs; fi
exec node server.mjs
