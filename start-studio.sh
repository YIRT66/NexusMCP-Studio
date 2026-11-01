#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
command -v node >/dev/null || { echo '请先安装 Node.js 22.12 或更高版本。' >&2; exit 1; }
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<12)){console.error("需要 Node.js 22.12 或更高版本");process.exit(1)}'
if [ ! -d node_modules/electron ]; then npm ci --no-audit --no-fund; fi
if [ ! -d preserved-mcp/node_modules/@modelcontextprotocol/sdk ]; then npm ci --prefix preserved-mcp --omit=dev --no-audit --no-fund; fi
exec npm run dev -- "$@"
