#!/bin/bash
set -e

state_dir=".local/state"
install_hash_file="$state_dir/pnpm-install-manifests.sha256"

manifest_hash="$(
  {
    sha256sum package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc
    find artifacts lib scripts \
      -mindepth 1 \
      -maxdepth 2 \
      -name package.json \
      -print0 \
      | sort -z \
      | xargs -0 sha256sum
  } | sha256sum | cut -d' ' -f1
)"

installed_hash="$(cat "$install_hash_file" 2>/dev/null || true)"

if [[ ! -f node_modules/.modules.yaml || "$manifest_hash" != "$installed_hash" ]]; then
  pnpm install --frozen-lockfile --prefer-offline
  mkdir -p "$state_dir"
  printf '%s\n' "$manifest_hash" > "$install_hash_file"
else
  echo "Dependency manifests unchanged; skipping pnpm install."
fi

pnpm --filter @workspace/db run migrate
