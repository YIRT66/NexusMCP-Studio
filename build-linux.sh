#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [ "$(uname -s)" != Linux ]; then echo '请在 Linux 上构建 Linux 安装包。' >&2; exit 1; fi
npm ci --no-audit --no-fund
npm ci --prefix preserved-mcp --omit=dev --no-audit --no-fund
npm run prepare:runtime
npm run dist:linux
