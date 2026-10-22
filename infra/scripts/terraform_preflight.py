"""Gate approval on a successful read-only plan, without publishing its values."""
import os
from pathlib import Path
import subprocess
import sys


def main():
    try:
        result = subprocess.run(
            ["terraform", "plan", "-json", "-input=false", "-no-color",
             "-lock-timeout=60s", "-detailed-exitcode"],
            capture_output=True,
        )
    except OSError:
        print("Unable to run Terraform preflight. Approval and apply are blocked.", file=sys.stderr)
        return 1

    # Neither stdout nor stderr is public: provider diagnostics and plan values
    # can contain secrets. A failure must not be mistaken for an empty plan.
    if result.returncode not in (0, 2):
        print(f"Terraform preflight failed (exit {result.returncode}). "
              "Approval and apply are blocked; inspect a plan privately.", file=sys.stderr)
        return 1

    changes = result.returncode == 2
    with Path(os.environ["GITHUB_OUTPUT"]).open("a") as output:
        output.write(f"has_changes={str(changes).lower()}\n")
    summary = (
        "Terraform detected changes. The existing approval or verified dependency update policy applies."
        if changes else
        "Terraform found no changes. Approval and apply are skipped; "
        "this run succeeds without creating a production-infra deployment."
    )
    with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as output:
        output.write(summary + "\n")
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
