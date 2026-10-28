import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveUploadPath } from "@/server/uploads";

const root = path.resolve("uploads-root");

describe("resolveUploadPath", () => {
  it("resolves safe paths inside the uploads folder", () => {
    expect(resolveUploadPath(root, "masters/abc-1234abcd.webp")).toBe(
      path.join(root, "masters", "abc-1234abcd.webp"),
    );
  });

  it("refuses anything that could leave the folder or confuse the file system", () => {
    for (const relative of [
      "../secret.txt",
      "masters/../../etc/passwd",
      "masters/..",
      "/etc/passwd",
      "masters\\..\\..\\x.webp",
      "masters/a b.webp",
      "masters/.hidden",
      "masters/x.tar.gz",
      "",
      "masters//x.webp",
      "Masters/X.webp",
    ]) {
      expect(resolveUploadPath(root, relative)).toBeNull();
    }
  });
});
