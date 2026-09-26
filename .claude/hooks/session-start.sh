#!/bin/bash
# Web sessions start from a fresh clone with no node_modules, so type-check,
# lint and tests cannot run until dependencies are installed. Local checkouts
# manage their own install.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
	exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
bun install --frozen-lockfile

# `bun run check` and `bun run build` need these to resolve at import time.
# Same placeholders as CI (.github/workflows/check.yml); nothing reaches
# Trenara or Supabase with them. Real values configured on the environment win.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
	{
		[ -n "${BASIC_BEARER_TOKEN:-}" ] || echo 'export BASIC_BEARER_TOKEN=placeholder'
		[ -n "${SUPABASE_URL:-}" ] || echo 'export SUPABASE_URL=https://placeholder.supabase.co'
		[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || echo 'export SUPABASE_SERVICE_ROLE_KEY=placeholder'
	} >> "$CLAUDE_ENV_FILE"
fi
