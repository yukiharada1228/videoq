"""Inspect an unmodified image's UAPI package without executing its binaries.

Docker export flattens the selected platform's filesystem. This works for ARM
images on an x86 host without emulation. Never extract image paths onto the host.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile


def inventory(stream, architecture):
    # Docker export may omit the root directory entry; dpkg lists it as /.
    entries, headers, status, package_paths = {".": True}, {}, None, None
    package_list = f"var/lib/dpkg/info/linux-libc-dev:{architecture}.list"
    with tarfile.open(fileobj=stream, mode="r|*") as archive:
        for member in archive:
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError("Unsafe image archive path")
            name = str(path)
            entries[name] = member.isdir()
            if member.isfile() and (name.startswith(("boot/vmlinuz", "boot/vmlinux")) or
                                    (name.startswith(("lib/modules/", "usr/lib/modules/")) and ".ko" in path.suffixes)):
                raise ValueError("Kernel binaries/modules invalidate the header-only assessment")
            allowed = name.startswith(("usr/include/", "usr/share/doc/linux-libc-dev/"))
            if name in ("var/lib/dpkg/status", package_list):
                content = archive.extractfile(member).read().decode()
                if name == package_list:
                    package_paths = content.splitlines()
                else:
                    status = content
            elif allowed and member.isfile():
                source = archive.extractfile(member)
                first = source.read(4)
                if first == b"\x7fELF" or ".ko" in path.suffixes or member.mode & 0o111:
                    raise ValueError("Executable code in the assessed include/documentation tree")
                digest = hashlib.sha256(first)
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
                headers[name] = {"path": "/" + name, "sha256": digest.hexdigest(), "mode": member.mode}
    packages = []
    for paragraph in (status or "").split("\n\n"):
        fields = dict(line.split(": ", 1) for line in paragraph.splitlines() if ": " in line and not line.startswith(" "))
        if fields.get("Package") == "linux-libc-dev":
            packages.append(fields)
    if len(packages) != 1 or packages[0].get("Architecture") != architecture or packages[0].get("Status") != "install ok installed" or not package_paths:
        raise ValueError("Missing or mismatched linux-libc-dev package metadata")
    files = []
    for value in package_paths:
        path = PurePosixPath(value)
        if not path.is_absolute() or ".." in path.parts:
            raise ValueError("Unsafe package inventory path")
        name = str(path).lstrip("/") or "."
        if name not in entries:
            raise ValueError("Package-owned artifact missing from the image: " + value)
        if entries[name]:
            continue
        if name not in headers:
            raise ValueError("Unassessed package artifact: " + value)
        files.append(headers[name])
    if not files:
        raise ValueError("Header inventory is empty")
    encoded = json.dumps(sorted(files, key=lambda row: row["path"]), sort_keys=True, separators=(",", ":")).encode()
    return {"package": "linux-libc-dev", "architecture": architecture,
            "version": packages[0]["Version"], "files": len(files),
            "inventorySha256": hashlib.sha256(encoded).hexdigest()}


def inspect_image(image, architecture):
    if not re.fullmatch(r"[a-z0-9./_-]+@sha256:[a-f0-9]{64}", image):
        raise ValueError("An immutable image digest is required")
    container = subprocess.check_output(["docker", "create", "--platform", "linux/" + architecture,
                                         "--network", "none", "--entrypoint", "/bin/true", image], text=True).strip()
    try:
        image_id = subprocess.check_output(["docker", "inspect", "--format", "{{.Image}}", container], text=True).strip()
        actual = subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Architecture}}", image_id], text=True).strip()
        if actual != architecture:
            raise ValueError("Selected image has a different architecture")
        with subprocess.Popen(["docker", "export", container], stdout=subprocess.PIPE) as process:
            try:
                result = inventory(process.stdout, architecture)
            except BaseException:
                process.terminate()
                raise
            if process.wait() != 0:
                raise RuntimeError("Docker export failed")
        return {"image": image, **result}
    finally:
        subprocess.run(["docker", "rm", container], check=True, stdout=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image")
    parser.add_argument("architecture", choices=["amd64", "arm64"])
    parser.add_argument("--approved", type=Path)
    args = parser.parse_args()
    result = inspect_image(args.image, args.architecture)
    if args.approved:
        expected = json.loads(args.approved.read_text())["images"][args.architecture]
        if result != expected:
            raise ValueError("Image/header inventory differs from the reviewed assessment")
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
