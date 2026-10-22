import { closeSync, ftruncateSync, mkdtempSync, openSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function privateJsonReport(explicitPath?: string) {
  const path = explicitPath ?? join(mkdtempSync(join(tmpdir(), "videoq-answer-")), "structured.json");
  // Exclusive creation also rejects existing symlinks and hard links. Keep the
  // descriptor open so later progress writes cannot follow a replaced path.
  const fd = openSync(path, "wx", 0o600);
  return {
    path,
    write(value: unknown) {
      const bytes = Buffer.from(JSON.stringify(value, null, 2), "utf8");
      let offset = 0;
      while (offset < bytes.length) {
        offset += writeSync(fd, bytes, offset, bytes.length - offset, offset);
      }
      ftruncateSync(fd, bytes.length);
    },
    close() { closeSync(fd); },
  };
}
