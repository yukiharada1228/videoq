"""Read-only, bounded Linux CPU acceptance preflight; JSON stdout, exit 2 if blocked.

No network calls, inference, installs, daemon changes, or credential reads. This
cannot certify capacity/permissions: cgroup ancestors and other workloads still
require administrator review even if the basic checks find no blockers.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import resource
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]


def probe(command):
    started = time.monotonic()
    try:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=15)
        return {"command": command, "exitCode": result.returncode,
                "stdout": result.stdout, "stderr": result.stderr,
                "elapsedSeconds": time.monotonic() - started}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"command": command, "exitCode": None, "error": str(error),
                "elapsedSeconds": time.monotonic() - started}


def memory():
    wanted = {"MemTotal", "MemAvailable", "SwapTotal", "SwapFree"}
    return {key: int(value.split()[0]) for key, value in
            (line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines())
            if key in wanted}


def main():
    before = memory()
    tools = {name: shutil.which(name) for name in
             ["docker", "podman", "kubectl", "kind", "helm", "node", "npm", "python3", "ffmpeg", "cmake", "c++", "gh"]}
    clip = ROOT / "apps/inference/whisper/tests/fixtures/fleurs-ja-00.mp3"
    case = json.loads(clip.with_suffix(".json").read_text())
    checksum = hashlib.sha256(clip.read_bytes()).hexdigest()
    commands = [probe(command) for command in [
        ["git", "rev-parse", "HEAD"], ["uname", "-sm"], ["id"],
        ["node", "--version"], ["npm", "--version"], ["python3", "--version"],
        ["gh", "--version"], ["gh", "attestation", "verify", "--help"],
        ["docker", "version"], ["kubectl", "version", "--client"],
        ["kind", "version"], ["helm", "version", "--short"],
        ["ffmpeg", "-version"],
        ["ffmpeg", "-hide_banner", "-nostdin", "-threads", "1", "-i", str(clip), "-f", "null", "-"],
    ]]
    blockers = []
    # This is the documented dedicated-lab baseline, NOT a measured model peak.
    if before["MemTotal"] < 16 * 1024 * 1024:
        blockers.append("Physical RAM below documented 16 GiB dedicated-lab baseline; swap is not RAM")
    for name in ["docker", "kubectl", "kind", "helm"]:
        if not tools[name]:
            blockers.append(name + " missing on PATH")
    if commands[7].get("exitCode") != 0:
        blockers.append("PATH gh cannot verify release attestations")
    if checksum != case["sha256"] or commands[-1].get("exitCode") != 0:
        blockers.append("Public audio checksum/decode failed")
    disk = shutil.disk_usage(ROOT)
    cgroup = {}
    for name in ["memory.max", "memory.current", "memory.peak", "memory.swap.current", "cpu.max"]:
        path = Path("/sys/fs/cgroup") / name
        try:
            cgroup[name] = path.read_text().strip()
        except OSError:
            cgroup[name] = None
    report = {
        "observedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "status": "blocked" if blockers else "administrator-review-required",
        "scope": "host preflight and real public audio decode only; no model or application acceptance",
        "cpuAffinityCount": len(os.sched_getaffinity(0)), "memoryKiBBefore": before,
        "memoryKiBAfter": memory(), "diskBytes": {"total": disk.total, "free": disk.free},
        "cgroupRootValues": cgroup,
        "cgroupCaveat": "Null means unavailable; visible root is not proof of effective ancestor limits",
        "tools": tools, "commands": commands,
        "fixture": {"file": clip.name, "sha256": checksum, "checksumMatches": checksum == case["sha256"],
                    "reference": case["reference"], "declaredDurationSeconds": case["duration"]},
        "childMaxRssKiB": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
        "resourceCaveat": "Child RSS covers only these probes, not VideoQ; memory snapshots are not peak usage",
        "blockers": blockers,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 2 if blockers else 0


if __name__ == "__main__":
    sys.exit(main())
