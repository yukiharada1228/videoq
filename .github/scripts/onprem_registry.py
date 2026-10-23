"""Fail closed unless the canonical on-prem package is private (or not created yet)."""
import argparse
import json
import subprocess


def check_private(component, *, allow_missing=False):
    if component not in ("api", "worker", "web"):
        raise ValueError("Unknown on-prem component")
    endpoint = "users/yukiharada1228/packages/container/videoq-onprem-" + component
    result = subprocess.run(["gh", "api", endpoint], capture_output=True, text=True)
    try:
        package = json.loads(result.stdout)
    except (ValueError, TypeError) as error:
        raise RuntimeError("Cannot verify package visibility") from error
    if not isinstance(package, dict):
        raise RuntimeError("Unexpected package visibility response")
    if result.returncode:
        if allow_missing and str(package.get("status")) == "404":
            return
        raise RuntimeError("Package visibility request failed")
    if package.get("visibility") != "private":
        raise RuntimeError("On-prem package must be private: " + component)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("component", choices=("api", "worker", "web"))
    parser.add_argument("--allow-missing", action="store_true")
    args = parser.parse_args()
    check_private(args.component, allow_missing=args.allow_missing)
