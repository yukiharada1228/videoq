import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { readFocusFrames } from "../src/lib/focus-frames";
import { inspectVideoClip } from "../src/lib/visual-inspection";
import type { Bindings } from "../src/types/bindings";

const workerRoot = fileURLToPath(new URL("../../worker/", import.meta.url));
const python = join(workerRoot, ".venv/bin/python");
const available = existsSync(python) && spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
afterEach(() => vi.unstubAllGlobals());

it.skipIf(!available)("reads a real Python/FFmpeg pack through the API and submits its dense frames to vision", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "videoq-focus-contract-"));
  try {
    execFileSync(python, ["-c", `
import shutil, subprocess, sys
from pathlib import Path
from worker_python.pipeline.focus_frames import build_focus_cache
from worker_python.pipeline.visual_frames import build_frame_cache
root = Path(sys.argv[1])
video = root / "clip.mp4"
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
    "color=c=blue:size=160x90:rate=30:duration=8", "-vf",
    "drawbox=color=red:t=fill:enable='gte(t,3)*lt(t,4)'", "-c:v", "mpeg4", str(video)], check=True)
(root / "coarse.json").write_bytes(build_frame_cache(video, 42, 8))
with build_focus_cache(video, 42, 8) as pack:
    shutil.copyfile(pack, root / "pack.bin")
`, tmp], { cwd: workerRoot, timeout: 30_000, stdio: "pipe" });
    const pack = new Uint8Array(readFileSync(join(tmp, "pack.bin")));
    const coarse = JSON.parse(readFileSync(join(tmp, "coarse.json"), "utf8"));
    expect(coarse.frames.map((f: { timestamp_seconds: number }) => f.timestamp_seconds)).toEqual([0, 5]);
    const reads: { offset: number; length: number }[] = [];
    const bindings = {
      ENVIRONMENT: "production", OPENAI_API_KEY: "test", OPENAI_BASE_URL: "https://vision.test/v1",
      VIDEO_BUCKET: { get: async (_key: string, options: { range: { offset: number; length: number }; onlyIf: Headers }) => {
        const { offset, length } = options.range;
        reads.push(options.range);
        expect(options.onlyIf.get("if-match")).toBe(offset ? '"pack-v1"' : null);
        return { body: new Blob([pack.slice(offset, offset + length)]).stream(), size: pack.length,
          range: { offset, length }, httpEtag: '"pack-v1"' };
      } },
    } as Bindings;
    const selected = await readFocusFrames(bindings, { id: 42, fileKey: "upload" }, 2, 5, new AbortController().signal);
    if (!("frames" in selected)) throw new Error("Expected dense frames");
    expect(selected.frames.map(f => f.timestamp_seconds)).toEqual([2, 3, 4]);
    // Decode the exact API-returned JPEG. The one-second red event is absent
    // from the coarse cache but present in the dense selection at 3 seconds.
    const rgb = execFileSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-vf", "scale=1:1", "-frames:v", "1",
      "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { input: Buffer.from(selected.frames[1].jpeg_base64, "base64"), timeout: 10_000 });
    expect(rgb[0]).toBeGreaterThan(200);
    expect(rgb[2]).toBeLessThan(30);
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      expect(JSON.stringify(request).match(/data:image\/jpeg/g)).toHaveLength(3);
      expect(JSON.stringify(request)).toContain("timestamp_seconds=3");
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        observations: [{ frame_index: 1, observation: "Red is displayed." }],
      }) } }] });
    });
    const result = await inspectVideoClip(bindings, { id: 42, fileKey: "upload" }, 2, 5, "Which color appears briefly?",
      new AbortController().signal, { mode: "focus", maxFrames: 16 });
    expect(result).toMatchObject({ observations: [{ timestamp: 3, text: "Red is displayed." }], sampling_interval_seconds: 1 });
    expect(reads.every(r => r.length < pack.length)).toBe(true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}, 40_000);
