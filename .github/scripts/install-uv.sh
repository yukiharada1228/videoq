#!/usr/bin/env bash
# Version and platform archive hashes live in the reviewed runtime manifest.
set -euo pipefail
python3 "$(dirname "$0")/package-managers.py" uv
