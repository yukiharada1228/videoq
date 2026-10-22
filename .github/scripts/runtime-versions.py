"""Coordinate interpreter versions without executing downloaded package code.

The JSON manifest is authoritative. Generated pins are committed and checked in
CI. Discovery only proposes PRs; runtime upgrades never enable auto-merge.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ".github/runtime-versions.json"
NODE_INDEX = "https://nodejs.org/dist/index.json"
PYTHON_INDEX = "https://www.python.org/api/v2/downloads/release/?is_published=true"
STANDALONE_INDEX = "https://api.github.com/repos/astral-sh/python-build-standalone/releases?per_page=5"
_spec = importlib.util.spec_from_file_location("package_managers", Path(__file__).with_name("package-managers.py"))
managers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(managers)
NODE_FILES = {
    "apps/api/Dockerfile.local": "node_bookworm",
    "apps/web/Dockerfile.dev": "node_bookworm",
    "apps/web/Dockerfile": "node_alpine",
}


def version(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d+\.\d+\.\d+", value):
        raise ValueError("An exact, stable interpreter version is required")
    return tuple(map(int, value.split(".")))


def request(url, headers=None, raw=False):
    headers = {"User-Agent": "videoq-runtime-updates", **(headers or {})}
    # The optional read-only Actions token is sent only to GitHub's API.
    if urllib.parse.urlparse(url).netloc == "api.github.com" and os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=45) as response:
        body = response.read()
    return body if raw else json.loads(body)


def image_digest(name, tag):
    if name == "public.ecr.aws/lambda/python":
        registry, repository = "public.ecr.aws", "lambda/python"
        token = request("https://public.ecr.aws/token/?service=public.ecr.aws&scope=repository:lambda/python:pull")["token"]
    elif name.startswith("ghcr.io/"):
        registry, repository = "ghcr.io", name.removeprefix("ghcr.io/")
        token = request("https://ghcr.io/token?service=ghcr.io&scope=repository:" + repository + ":pull")["token"]
    else:
        registry, repository = "registry-1.docker.io", "library/" + name
        token = request("https://auth.docker.io/token?service=registry.docker.io&scope=repository:" + repository + ":pull")["token"]
    body = request(f"https://{registry}/v2/{repository}/manifests/{tag}", {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json",
    }, raw=True)
    platforms = {m.get("platform", {}).get("architecture") for m in json.loads(body).get("manifests", [])}
    if not {"amd64", "arm64"}.issubset(platforms):
        raise ValueError(f"{name}:{tag} must publish both amd64 and arm64 images")
    return f"{name}:{tag}@sha256:{hashlib.sha256(body).hexdigest()}"


def standalone(python, releases):
    pattern = re.compile(r"cpython-" + re.escape(python) + r"\+\d+-x86_64-unknown-linux-gnu-install_only\.tar\.gz")
    for release in releases:
        if release.get("draft") or release.get("prerelease"):
            continue
        for asset in release.get("assets", []):
            if pattern.fullmatch(asset["name"]):
                url, digest = asset["browser_download_url"], asset.get("digest", "")
                if not url.startswith("https://github.com/astral-sh/python-build-standalone/releases/download/") or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
                    raise ValueError("A verified standalone Python release is required")
                return {"url": url, "sha256": digest.removeprefix("sha256:")}
    raise ValueError(f"Standalone Python {python} is not published yet; do not silently reuse an older interpreter")


def latest(current, runtime, upgrade, releases):
    current_version = version(current)
    candidates = []
    for release in releases:
        if runtime == "node":
            candidate = release["version"].removeprefix("v")
            if not re.fullmatch(r"\d+\.\d+\.\d+", candidate):
                continue
            parsed = version(candidate)
            if upgrade:
                if parsed[0] <= current_version[0] or not release.get("lts"):
                    continue
            elif parsed[0] != current_version[0]:
                continue
        else:
            candidate = release.get("name", "").removeprefix("Python ")
            if release.get("pre_release") or not release.get("is_published") or not re.fullmatch(r"3\.\d+\.\d+", candidate):
                continue
            parsed = version(candidate)
            if (parsed[:2] <= current_version[:2]) if upgrade else (parsed[:2] != current_version[:2]):
                continue
        if parsed > current_version:
            candidates.append(parsed)
    return ".".join(map(str, max(candidates))) if candidates else current


def validate(data):
    version(data["node"])
    version(data["python"])
    if set(data) - {"node", "python", "python_minimum", "images", "modal_python", "npm", "pip", "uv", "tool_downloads"}:
        raise ValueError("Unknown runtime manifest field")
    if not re.fullmatch(r"3\.\d+", data["python_minimum"]):
        raise ValueError("Invalid minimum Python series")
    if version(data["python"])[:2] < tuple(map(int, data["python_minimum"].split("."))):
        raise ValueError("Python cannot be older than the supported minimum")
    for image in data.get("images", {}).values():
        if not re.fullmatch(r"(?:node|python|public\.ecr\.aws/lambda/python|ghcr\.io/astral-sh/uv):[\w.-]+@sha256:[a-f0-9]{64}", image):
            raise ValueError("Interpreter images must use an immutable digest")
    if data.get("images"):
        expected = {
            "node_bookworm": "node:" + data["node"] + "-bookworm-slim@",
            "node_alpine": "node:" + data["node"] + "-alpine@",
            "python_local": "python:" + data["python"] + "-slim-bookworm@",
            "python_lambda": "public.ecr.aws/lambda/python:" + ".".join(data["python"].split(".")[:2]) + "@",
            "uv": "ghcr.io/astral-sh/uv:" + data["uv"] + "@",
        }
        if set(data["images"]) != set(expected) or any(not data["images"][key].startswith(prefix) for key, prefix in expected.items()):
            raise ValueError("Container interpreters and tools must match the canonical version pins")
    if "modal_python" in data:
        pin = data["modal_python"]
        expected = rf"https://github\.com/astral-sh/python-build-standalone/releases/download/\d+/cpython-{re.escape(data['python'])}(?:%2B|\+)\d+-x86_64-unknown-linux-gnu-install_only\.tar\.gz"
        if not re.fullmatch(expected, pin["url"]) or not re.fullmatch(r"[a-f0-9]{64}", pin["sha256"]):
            raise ValueError("Standalone archive must match the exact Python version and have a SHA-256")
    managers.validate(data)


def managed_block(text, block, manager, after=None):
    pattern = r"(?ms)^# BEGIN managed " + manager + r"\n.*?^# END managed " + manager
    if re.search(pattern, text):
        return re.sub(pattern, lambda _: block, text)
    if after:
        return re.sub(after, lambda match: match.group(0) + "\n" + block + "\n", text, count=1)
    return text.rstrip() + "\n\n" + block + "\n"


def rendered(root, data):
    validate(data)
    files = {".node-version": data["node"] + "\n", ".nvmrc": data["node"] + "\n", ".python-version": data["python"] + "\n"}
    package = json.loads((root / "package.json").read_text())
    package["packageManager"] = "npm@" + data["npm"]
    files["package.json"] = json.dumps(package, indent=2, ensure_ascii=False) + "\n"
    images = data.get("images", {})
    for path, key in NODE_FILES.items():
        if (root / path).exists():
            text = (root / path).read_text()
            files[path], count = re.subn(r"(?m)^FROM node:\S+", "FROM " + images[key], text)
            if count != 1:
                raise ValueError(f"Expected one Node image in {path}")
            files[path] = managed_block(files[path], managers.docker_block(data, "npm"), "npm", r"(?m)^FROM node:[^\n]+\n")
    for path, key in [("apps/worker/Dockerfile", "python_lambda"), ("apps/worker/Dockerfile.local", "python_local")]:
        if (root / path).exists():
            text = (root / path).read_text()
            files[path], count = re.subn(r"(?m)^FROM (?:public\.ecr\.aws/lambda/python|python):\S+", "FROM " + images[key], text)
            if count != 1:
                raise ValueError(f"Expected one Python image in {path}")
            files[path] = re.sub(r"(?m)^ARG PYTHON_VERSION=\S+", "ARG PYTHON_VERSION=" + data["python"], files[path])
            files[path] = managed_block(files[path], managers.docker_block(data, "pip"), "pip", r"(?m)^FROM (?:public\.ecr\.aws/lambda/python|python):[^\n]+\n")
            if key == "python_lambda":
                files[path] = re.sub(r"(?m)^FROM ghcr.io/astral-sh/uv:\S+", "FROM " + images["uv"], files[path])
    if "modal_python" in data:
        pin = data["modal_python"]
        path = "apps/worker/Dockerfile.modal"
        text = (root / path).read_text()
        for name, value in [("PYTHON_VERSION", data["python"]), ("PYTHON_STANDALONE_URL", pin["url"]), ("PYTHON_STANDALONE_SHA256", pin["sha256"])]:
            text, count = re.subn(r"(?m)^ARG " + name + r"=\S+", "ARG " + name + "=" + value, text)
            if count != 1:
                raise ValueError(f"Missing {name} in the Modal Dockerfile")
        files[path] = managed_block(text, managers.docker_block(data, "pip"), "pip")
    return files


def discover(root, data, runtime, upgrade):
    data = copy.deepcopy(data)
    previous = data[runtime]
    if runtime in {"npm", "pip", "uv"}:
        data = managers.discover(data, runtime, upgrade, request)
    else:
        data[runtime] = latest(previous, runtime, upgrade, request(NODE_INDEX if runtime == "node" else PYTHON_INDEX))
    if upgrade and data[runtime] == previous:
        return data
    if data.get("images") or (root / "apps/web/Dockerfile").exists():
        images = data.setdefault("images", {})
        if runtime == "node":
            images["node_bookworm"] = image_digest("node", data["node"] + "-bookworm-slim")
            images["node_alpine"] = image_digest("node", data["node"] + "-alpine")
        elif runtime == "python":
            images["python_local"] = image_digest("python", data["python"] + "-slim-bookworm")
            images["python_lambda"] = image_digest("public.ecr.aws/lambda/python", ".".join(data["python"].split(".")[:2]))
        elif runtime == "uv":
            images["uv"] = image_digest("ghcr.io/astral-sh/uv", data["uv"])
    if runtime == "python" and "modal_python" in data:
        data["modal_python"] = standalone(data["python"], request(STANDALONE_INDEX))
    validate(data)
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "sync", "matrix", "plan"])
    parser.add_argument("--runtime", choices=["node", "python", "npm", "pip", "uv"])
    parser.add_argument("--upgrade", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    data = json.loads((ROOT / MANIFEST).read_text())
    if args.command == "matrix":
        validate(data)
        rows = [{"python": data["python_minimum"], "production": False, "runner": "ubuntu-latest"}, {"python": data["python"], "production": True, "runner": "ubuntu-24.04-arm"}]
        print("matrix=" + json.dumps({"include": rows}, separators=(",", ":")))
        return
    if args.command == "plan":
        if not args.runtime or not args.output:
            parser.error("plan requires --runtime and --output")
        data = discover(ROOT, data, args.runtime, args.upgrade)
    files = rendered(ROOT, data)
    files[MANIFEST] = json.dumps(data, indent=2) + "\n"
    changed = {path: text for path, text in files.items() if not (ROOT / path).exists() or (ROOT / path).read_text() != text}
    if args.command == "check":
        if changed:
            raise ValueError("Runtime pins differ from the manifest: " + ", ".join(changed) + "; run python3 .github/scripts/runtime-versions.py sync")
        for path in (ROOT / ".github/workflows").glob("*.yml"):
            if re.search(r"(?m)^\s+(?:node|python)-version:\s*['\"]?\d", path.read_text()):
                raise ValueError(f"{path.name}: use the canonical version files, or the tested compatibility matrix")
        print("Runtime versions and generated interpreter pins are consistent")
    elif args.command == "sync":
        for path, text in changed.items():
            (ROOT / path).write_text(text)
        print("Synchronized " + str(len(changed)) + " runtime files")
    else:
        plan = {"changed": bool(changed), "runtime": args.runtime, "channel": "next" if args.upgrade else "current", "version": data[args.runtime], "files": changed}
        args.output.write_text(json.dumps(plan, indent=2) + "\n")
        output = os.environ.get("GITHUB_OUTPUT")
        if output:
            with open(output, "a") as stream:
                stream.write("changed=" + str(bool(changed)).lower() + "\n")
        print(f"{args.runtime} {data[args.runtime]}: {len(changed)} proposed file changes")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError) as error:
        sys.exit(str(error))
