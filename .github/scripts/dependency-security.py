"""Inspect the complete locked graph without installing untrusted dependencies."""
import importlib.util
import json
import pathlib
import re
import time
import tomllib
import urllib.request


def scan(packages, query):
    details = []
    for start in range(0, len(packages), 100):
        batch = packages[start:start + 100]
        results = query({"queries": [
            {"package": {"ecosystem": eco, "name": name}, "version": version}
            for eco, name, version in batch
        ]}).get("results")
        if not isinstance(results, list) or len(results) != len(batch):
            raise ValueError("Incomplete vulnerability response")
        for (eco, name, version), result in zip(batch, results):
            if not isinstance(result, dict) or result.get("next_page_token"):
                raise ValueError("Incomplete vulnerability result")
            vulns = result.get("vulns", [])
            if not isinstance(vulns, list):
                raise ValueError("Invalid vulnerability result")
            for vuln in vulns:
                identifier = vuln.get("id", "")
                if not re.fullmatch(r"[A-Za-z0-9_.-]+", identifier):
                    raise ValueError("Invalid advisory identifier")
                # Package names originate from reviewed main-branch lockfiles.
                safe = re.sub(r"[^A-Za-z0-9_@./+-]", "?", name + "@" + version)
                details.append(f"- {eco}: `{safe}` — [{identifier}](https://osv.dev/vulnerability/{identifier})")
    return {"status": "findings" if details else "ok",
            "summary": f"全ロックファイルの{len(packages)}バージョンを検査し、{len(details)}件の脆弱性情報を検出しました。",
            "details": sorted(set(details))}


def query_osv(payload):
    for attempt in range(3):
        try:
            request = urllib.request.Request(
                "https://api.osv.dev/v1/querybatch", json.dumps(payload).encode(),
                {"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def main():
    output = pathlib.Path("operations-report.json")
    try:
        spec = importlib.util.spec_from_file_location("supply_chain", pathlib.Path(__file__).with_name("supply-chain.py"))
        supply = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(supply)
        policy = json.loads(pathlib.Path(".github/supply-chain-policy.json").read_text())
        packages = set()
        for filename in policy["npm_lockfiles"]:
            packages.update(supply.npm_packages(json.loads(pathlib.Path(filename).read_text()),
                                               policy["reviewed_install_script_packages"]))
        for filename in policy.get("uv_lockfiles", []):
            packages.update(supply.python_packages(tomllib.loads(pathlib.Path(filename).read_text())))
        report = scan(sorted(packages), query_osv)
    except Exception:
        # Do not publish arbitrary remote responses or filesystem contents.
        report = {"status": "error", "summary": "依存関係の定期検査を完了できませんでした。", "details": []}
    output.write_text(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
