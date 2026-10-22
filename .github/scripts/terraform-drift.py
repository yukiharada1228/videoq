"""Produce an attribute-free report; never publish state or plan values."""
import json
import pathlib
import subprocess
import tempfile


def report_plan(plan):
    details = set()
    for change in (plan.get("resource_changes") or []) + (plan.get("resource_drift") or []):
        actions = change.get("change", {}).get("actions", [])
        if actions and actions != ["no-op"] and change.get("mode") != "data":
            details.add("- `" + change["address"] + "`: " + ", ".join(actions))
    return {"status": "findings", "summary": "Terraformの構成または管理対象リソースに差分を検出しました。自動適用は行いません。",
            "details": sorted(details) or ["- 出力値または状態に差分があります。非公開の環境でplanを確認してください。"]}


def main():
    report = {"status": "error", "summary": "Terraformの差分検査を完了できませんでした。", "details": []}
    stage = "plan"
    try:
        with tempfile.TemporaryDirectory() as directory:
            plan = pathlib.Path(directory) / "drift.tfplan"
            result = subprocess.run(["terraform", "plan", "-json", "-input=false", "-no-color", "-lock-timeout=60s",
                                     "-detailed-exitcode", "-out=" + str(plan)], capture_output=True)
            # Only error headings go to Actions logs (masked by the runner), never
            # diagnostics.detail, resource values, state or the saved plan.
            for line in result.stdout.decode(errors="replace").splitlines():
                try:
                    event = json.loads(line)
                    if event.get("type") == "diagnostic" and event["diagnostic"].get("severity") == "error":
                        heading = event["diagnostic"].get("summary", "Terraform error")
                        print("Terraform diagnostic: " + heading.replace("\n", " ")[:200])
                except (ValueError, KeyError, TypeError):
                    pass
            if result.returncode == 0:
                report = {"status": "ok", "summary": "Terraformの差分はありません。", "details": []}
            elif result.returncode == 2:
                stage = "plan-json"
                output = subprocess.check_output(["terraform", "show", "-json", str(plan)], stderr=subprocess.DEVNULL)
                report = report_plan(json.loads(output))
            else:
                report["details"] = [f"- planが終了コード{result.returncode}で失敗しました。Actionsの診断見出しを確認してください。"]
    except Exception:
        report["details"] = ["- 失敗した段階: `" + stage + "`"]
    pathlib.Path("../operations-report.json").write_text(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
