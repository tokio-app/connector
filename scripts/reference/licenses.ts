// The license checks of `yarn reference` (index.ts): which folder of the
// reference repositories is removed after the checkout, and which package.json
// files left under reference/ declare a license other than MIT. Pure; tested
// in licenses.test.ts.

/**
 * Folders of the reference sources that are removed after the checkout,
 * relative to reference/src/. They sit in an MIT repository but aren't MIT:
 *
 * - `targets/typescript/tiktok-live-proto-full/` of TikTok-Webcast-Protobuf is
 *   `@eulerstream/tiktok-live-proto-full`, which its package.json marks
 *   `UNLICENSED`: Euler Stream's private package, published only to its
 *   members. Nothing may be learned from it, so it isn't kept.
 */
export const REMOVED_FOLDERS: readonly string[] = Object.freeze([
  "TikTok-Webcast-Protobuf/targets/typescript/tiktok-live-proto-full",
]);

/** A package.json under reference/: where it is, and what it parses to. */
export interface Manifest {
  /** Its path, for the message. */
  path: string;
  /** Its parsed contents. */
  json: unknown;
}

/**
 * What is wrong with each manifest that doesn't declare `"license": "MIT"`, one
 * line each. Empty when every one does.
 */
export function licenseProblems(manifests: readonly Manifest[]): string[] {
  const problems: string[] = [];
  for (const { path, json } of manifests) {
    const license: unknown =
      typeof json === "object" && json !== null && !Array.isArray(json)
        ? Reflect.get(json, "license")
        : undefined;
    if (license !== "MIT") {
      problems.push(
        `${path} declares license ${license === undefined ? "nothing" : JSON.stringify(license)}, not "MIT"`,
      );
    }
  }
  return problems;
}
