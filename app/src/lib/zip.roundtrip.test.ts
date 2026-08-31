import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildZip } from "./zip";

describe("zip roundtrip", () => {
  it("unzip -t が通り、中身がバイト一致する", () => {
    const dir = mkdtempSync(join(tmpdir(), "hpzip-"));
    const p = join(dir, "a.zip");
    const bytes = buildZip(
      [
        { name: "a.md", content: "# 見出し\n本文" },
        { name: "b.md", content: "x" },
      ],
      new Date("2026-08-19T00:00:00Z"),
    );
    writeFileSync(p, bytes);
    execFileSync("unzip", ["-t", p]);
    expect(execFileSync("unzip", ["-p", p, "a.md"]).toString("utf8")).toBe("# 見出し\n本文");
    expect(execFileSync("unzip", ["-p", p, "b.md"]).toString("utf8")).toBe("x");
  });
});
