import { describe, expect, it } from "vitest";
import { licenseProblems, REMOVED_FOLDERS } from "./licenses.js";

describe("licenseProblems", () => {
  it("accepts manifests that declare MIT", () => {
    expect(
      licenseProblems([
        { path: "a/package.json", json: { name: "a", license: "MIT" } },
        { path: "b/package.json", json: { license: "MIT" } },
      ]),
    ).toEqual([]);
    expect(licenseProblems([])).toEqual([]);
  });

  it("names every manifest that declares another license, or none", () => {
    expect(
      licenseProblems([
        { path: "ok/package.json", json: { license: "MIT" } },
        { path: "private/package.json", json: { license: "UNLICENSED" } },
        { path: "agpl/package.json", json: { license: "AGPL-3.0-only" } },
        { path: "none/package.json", json: { name: "none" } },
        { path: "lower/package.json", json: { license: "mit" } },
        { path: "array/package.json", json: [] },
        { path: "null/package.json", json: null },
      ]),
    ).toEqual([
      'private/package.json declares license "UNLICENSED", not "MIT"',
      'agpl/package.json declares license "AGPL-3.0-only", not "MIT"',
      'none/package.json declares license nothing, not "MIT"',
      'lower/package.json declares license "mit", not "MIT"',
      'array/package.json declares license nothing, not "MIT"',
      'null/package.json declares license nothing, not "MIT"',
    ]);
  });
});

describe("REMOVED_FOLDERS", () => {
  it("holds the unlicensed generated target of TikTok-Webcast-Protobuf", () => {
    expect(REMOVED_FOLDERS).toEqual([
      "TikTok-Webcast-Protobuf/targets/typescript/tiktok-live-proto-full",
    ]);
    expect(Object.isFrozen(REMOVED_FOLDERS)).toBe(true);
  });
});
