"""Produce an attribute-free report; never publish state or plan values."""
import json
import pathlib
import subprocess
import tempfile


def report_plan(plan):
    details = set()
    for change in plan.get("resource_changes", []) + plan.get("resource_drift", []):
        actions = change.get("change", {}).get("actions", [])
        if actions and actions != ["no-op"] and change.get("mode") != "data":
            details.add("- `" + change["address"] + "`: " + ", ".join(actions))
    return {"status": "findings", "summary": "Terraformの構成または管理対象リソースに差分を検出しました。自動適用は行いません。",
            "details": sorted(details) or ["- 出力値または状態に差分があります。非公開の環境でplanを確認してください。"]}


def main():
    report = {"status": "error", "summary": "Terraformの差分検査を完了できませんでした。", "details": []}
    try:
        with tempfile.TemporaryDirectory() as directory:
            plan = pathlib.Path(directory) / "drift.tfplan"
            result = subprocess.run(["terraform", "plan", "-input=false", "-no-color", "-lock=false",
                                     "-detailed-exitcode", "-out=" + str(plan)], capture_output=True)
            if result.returncode == 0:
                report = {"status": "ok", "summary": "Terraformの差分はありません。", "details": []}
            elif result.returncode == 2:
                output = subprocess.check_output(["terraform", "show", "-json", str(plan)], stderr=subprocess.DEVNULL)
                report = report_plan(json.loads(output))
    except Exception:
        pass
    pathlib.Path("../operations-report.json").write_text(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
