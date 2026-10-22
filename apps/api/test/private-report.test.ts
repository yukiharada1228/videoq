import { closeSync, fstatSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { privateJsonReport } from "./support/private-report";

const cleanup: string[] = [];
afterEach(() => { for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true }); });

it("creates private reports and replaces longer progress snapshots without trailing data", () => {
  const report = privateJsonReport();
  cleanup.push(dirname(report.path));
  const reader = openSync(report.path, "r"), directory = openSync(dirname(report.path), "r");
  try {
    expect(fstatSync(directory).mode & 0o777).toBe(0o700);
    expect(fstatSync(reader).mode & 0o777).toBe(0o600);
    report.write({ text: "long snapshot" });
    report.write({ text: "日本語" });
    expect(JSON.parse(readFileSync(reader, "utf8"))).toEqual({ text: "日本語" });
  } finally { closeSync(reader); closeSync(directory); report.close(); }
});

it("refuses existing report paths, including symlinks, without changing their target", () => {
  const directory = mkdtempSync(join(tmpdir(), "videoq-report-test-"));
  cleanup.push(directory);
  const target = join(directory, "existing.json"), link = join(directory, "link.json");
  writeFileSync(target, "unchanged", { flag: "wx" });
  symlinkSync(target, link);
  expect(() => privateJsonReport(target)).toThrow();
  expect(() => privateJsonReport(link)).toThrow();
  expect(readFileSync(target, "utf8")).toBe("unchanged");
});

it("keeps progress writes on the original descriptor after the path is replaced", () => {
  const report = privateJsonReport();
  cleanup.push(dirname(report.path));
  const original = `${report.path}.original`, target = join(dirname(report.path), "target.json");
  try {
    renameSync(report.path, original);
    writeFileSync(target, "unchanged", { flag: "wx" });
    symlinkSync(target, report.path);
    report.write({ progress: 1 });
    expect(JSON.parse(readFileSync(original, "utf8"))).toEqual({ progress: 1 });
    expect(readFileSync(target, "utf8")).toBe("unchanged");
  } finally { report.close(); }
});
