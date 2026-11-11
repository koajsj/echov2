#!/bin/bash
set -euo pipefail
for executable in node psql pg_dump caddy; do
  command -v "$executable" >/dev/null || { printf 'Missing prerequisite: %s\n' "$executable" >&2; exit 1; }
done
node --input-type=module -e 'const [major,minor]=process.versions.node.split(".").map(Number); if (major !== 24 || minor < 17) process.exit(1)'
printf '%s\n' 'Local executables found. Dependencies, database privileges, schema, MLS and restore readiness are NOT verified.'
