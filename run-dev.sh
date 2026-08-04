#!/bin/sh
# Local portable Node (no system npm required)
set -eu
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="$ROOT/.local/node/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Node not found at $ROOT/.local/node — reinstalling portable Node 22..."
  curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-darwin-x64.tar.gz -o /tmp/node-x64.tgz
  rm -rf "$ROOT/.local/node"
  mkdir -p "$ROOT/.local"
  tar -xzf /tmp/node-x64.tgz -C "$ROOT/.local"
  mv "$ROOT/.local"/node-v22.14.0-darwin-x64 "$ROOT/.local/node"
  export PATH="$ROOT/.local/node/bin:$PATH"
fi

cd "$ROOT"
if [ ! -d node_modules ]; then
  npm install --no-fund --no-audit
fi

echo "node $(node -v) · npm $(npm -v)"
echo "Starting: npm run dev → http://localhost:8080/"
exec npm run dev
