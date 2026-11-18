#!/usr/bin/env bash
set -euo pipefail
export NEXT_TELEMETRY_DISABLED=1
export NEXT_PRIVATE_WORKER_THREADS=false
export NODE_ENV=production
export NEXT_PUBLIC_API_URL=https://industrial-dev.forgepublicsafety.com
export NEXT_PUBLIC_APP_URL=https://industrial-dev.forgepublicsafety.com
export NEXT_PUBLIC_APP_ENV=development
export NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_VYjUFLXG4
export NEXT_PUBLIC_COGNITO_CLIENT_ID=2ejbv5ignav7m57jk141be094b
export NEXT_PUBLIC_COGNITO_DOMAIN=forge-development-547817.auth.us-east-1.amazoncognito.com

rm -rf /tmp/ind-build
mkdir -p /tmp/ind-build
tar -C /app/apps/industrial-web \
  --exclude='.next' \
  --exclude='.next_*' \
  --exclude='out' \
  --exclude='out_*' \
  --exclude='node_modules' \
  --exclude='.turbo' \
  -cf - . | tar -C /tmp/ind-build -xf -

ln -sfn /app/apps/industrial-web/node_modules /tmp/ind-build/node_modules
# Also expose root workspace packages for any deep imports
export NODE_PATH=/app/node_modules${NODE_PATH:+:$NODE_PATH}
# Workspace packages resolve via /app from tracing root + tsconfig extends
cat > /tmp/ind-build/.env.production.local <<EOF
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV}
NEXT_PUBLIC_COGNITO_USER_POOL_ID=${NEXT_PUBLIC_COGNITO_USER_POOL_ID}
NEXT_PUBLIC_COGNITO_CLIENT_ID=${NEXT_PUBLIC_COGNITO_CLIENT_ID}
NEXT_PUBLIC_COGNITO_DOMAIN=${NEXT_PUBLIC_COGNITO_DOMAIN}
EOF

# Absolute monorepo root for transpilePackages resolution
python3 - <<'PY'
from pathlib import Path
p = Path("/tmp/ind-build/next.config.ts")
text = p.read_text()
text = text.replace(
    'outputFileTracingRoot: path.join(__dirname, "../..")',
    'outputFileTracingRoot: "/app"',
)
# tsconfig extends still points at ../../packages — create stub package path
p.write_text(text)
PY

mkdir -p /tmp/ind-build/packages-link
# Make ../../packages from /tmp/ind-build resolve to /app/packages
ln -sfn /app/packages /tmp/packages
# From /tmp/ind-build, ../../packages = /packages — wrong.
# Fix tsconfig to absolute extends instead:
python3 - <<'PY'
from pathlib import Path
import json
p = Path("/tmp/ind-build/tsconfig.json")
data = json.loads(p.read_text())
data["extends"] = "/app/packages/typescript-config/nextjs.json"
p.write_text(json.dumps(data, indent=2) + "\n")
PY

cd /tmp/ind-build
# Use monorepo Next 15 — bare `npx next` pulls latest and breaks config.
/tmp/ind-build/node_modules/.bin/next build
test -f out/index.html
mkdir -p /app/apps/industrial-web/out
rm -rf /app/apps/industrial-web/out/*
cp -a out/. /app/apps/industrial-web/out/
echo DOCKER_BUILD_OK
