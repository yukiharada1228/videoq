#!/usr/bin/env bash
# Official uv 0.13.5 release archives, verified against the published SHA-256.
# Keep version and both checksums together in a manually reviewed change.
set -euo pipefail
case "$(uname -m)" in
  x86_64)
    target=x86_64-unknown-linux-gnu
    checksum=f68d291c75783122dad58ab77def0e13f3233f358731db5d6d7e8715603b928f
    ;;
  aarch64|arm64)
    target=aarch64-unknown-linux-gnu
    checksum=4bb69cf95ed13f23713bb7bc09f241896ea0c75b7c557e615a20604b82f9c403
    ;;
  *) echo "Unsupported uv runner architecture" >&2; exit 1 ;;
esac
install_dir=$(mktemp -d "${RUNNER_TEMP:?}/verified-uv.XXXXXX")
curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
  "https://github.com/astral-sh/uv/releases/download/0.13.5/uv-${target}.tar.gz" \
  --output "$install_dir/uv.tar.gz"
printf '%s  %s\n' "$checksum" "$install_dir/uv.tar.gz" | sha256sum --check --strict
tar -xzf "$install_dir/uv.tar.gz" -C "$install_dir"
"$install_dir/uv-$target/uv" --version
printf '%s\n' "$install_dir/uv-$target" >> "${GITHUB_PATH:?}"
