#!/usr/bin/env bash
set -euo pipefail
# Official release checksums, pinned together with the Helm version.
version=4.3.1
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    platform=linux-amd64
    checksum=0403a88ae20913d11b10a2467b50087721fea7581736da6b9d3992f5357fe54b ;;
  Linux-aarch64)
    platform=linux-arm64
    checksum=8cf8f66ecbc252ac8f7f06cca68aba88508ddfde3a6a34feb1678ad1694b4f88 ;;
  Darwin-arm64)
    platform=darwin-arm64
    checksum=6b4e61c8cd27d99e5a801e63ff25dd5c70b36875c2cd659d3e9ce6b76fc23198 ;;
  *) echo "Unsupported platform; install Helm separately and set HELM_BIN" >&2; exit 1 ;;
esac
destination="${HELM_INSTALL_DIR:?Set HELM_INSTALL_DIR to a temporary tools directory}"
mkdir -p "$destination"
archive="$destination/helm.tar.gz"
curl -fsSL "https://get.helm.sh/helm-v${version}-${platform}.tar.gz" -o "$archive"
python3 - "$archive" "$checksum" "$destination" "$platform" <<'PY'
import hashlib, pathlib, sys, tarfile
archive, checksum, destination, platform = sys.argv[1:]
assert hashlib.sha256(pathlib.Path(archive).read_bytes()).hexdigest() == checksum, 'Helm checksum mismatch'
with tarfile.open(archive) as tar:
    binary = tar.extractfile(f'{platform}/helm').read()
target = pathlib.Path(destination) / 'helm'
target.write_bytes(binary)
target.chmod(0o755)
PY
"$destination/helm" version --short
