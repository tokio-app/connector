// `yarn reference`: downloads the MIT-licensed releases this library is written
// against into reference/ (gitignored, never shipped):
//
// - the npm tarballs of tiktok-live-connector 2.4.0 and tiktok-live-proto 0.2.3,
//   extracted to reference/<name>-<version>/package/
// - their source repositories at the commits those releases were built from,
//   in reference/src/<repo>/ (the .proto files only live in the repository)
//
// Later versions of both packages are AGPL-3.0-only and must never be used, so
// the versions and commits are pinned here and every license is checked. The
// folders of the sources that aren't MIT (REMOVED_FOLDERS in licenses.ts) are
// removed after the checkout, and the run fails when any package.json left
// under reference/ declares a license other than MIT.
// Rerunning it skips whatever is already in place.
import { execFileSync, execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { licenseProblems, REMOVED_FOLDERS, type Manifest } from "./licenses.js";

interface Reference {
  name: string;
  version: string;
  author: string;
  repository: string;
  folder: string;
  commit: string;
}

const REFERENCES: Reference[] = [
  {
    name: "tiktok-live-connector",
    version: "2.4.0",
    author: "zerodytrash",
    repository: "https://github.com/zerodytrash/TikTok-Live-Connector.git",
    folder: "TikTok-Live-Connector",
    commit: "54ff9a9ef6079e7235cced70abc47eb8e3211a72",
  },
  {
    name: "tiktok-live-proto",
    version: "0.2.3",
    author: "Isaac Kogan",
    repository: "https://github.com/isaackogan/TikTok-Webcast-Protobuf.git",
    folder: "TikTok-Webcast-Protobuf",
    commit: "9e34a85c40ed75e4db73bafd47232f82c056c3b3",
  },
];

// Where the .proto sources are inside the tiktok-live-proto repository.
const PROTO_DIR = join("TikTok-Webcast-Protobuf", "src", "slim", "v3");

const root = resolve(import.meta.dirname, "..", "..");
const referenceDir = join(root, "reference");
const sourcesDir = join(referenceDir, "src");

function log(message: string) {
  console.log(`[reference] ${message}`);
}

function fail(message: string): never {
  throw new Error(`[reference] ${message}`);
}

function git(args: string[], cwd: string, quiet = false): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", quiet ? "pipe" : "inherit"],
  }).trim();
}

function currentCommit(dir: string): string | null {
  try {
    return git(["rev-parse", "--verify", "--quiet", "HEAD"], dir, true);
  } catch {
    return null;
  }
}

function display(path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

// npm pack <name>@<version> only downloads the registry tarball: no install,
// no lifecycle scripts. tar runs with relative paths so both Windows' bsdtar
// and GNU tar (Git Bash) work.
function downloadPackage(ref: Reference) {
  const base = `${ref.name}-${ref.version}`;
  const tarball = `${base}.tgz`;
  const folder = join(referenceDir, base);
  const manifest = join(folder, "package", "package.json");

  if (existsSync(join(referenceDir, tarball))) {
    log(`${tarball} already downloaded`);
  } else {
    log(`npm pack ${ref.name}@${ref.version}`);
    // A command string: npm is npm.cmd on Windows, which execFile can't run.
    execSync(`npm pack ${ref.name}@${ref.version} --silent`, {
      cwd: referenceDir,
      stdio: ["ignore", "ignore", "inherit"],
    });
    if (!existsSync(join(referenceDir, tarball))) {
      fail(`npm pack didn't produce ${tarball}`);
    }
  }

  if (existsSync(manifest)) {
    log(`${display(folder)} already extracted`);
  } else {
    mkdirSync(folder, { recursive: true });
    try {
      execFileSync("tar", ["-xzf", tarball, "-C", base], {
        cwd: referenceDir,
        stdio: "inherit",
      });
    } catch (error) {
      // Likely a truncated download: start over on the next run.
      rmSync(join(referenceDir, tarball), { force: true });
      rmSync(folder, { recursive: true, force: true });
      throw error;
    }
    log(`extracted to ${display(folder)}`);
  }

  const pkg: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  const field = (key: string): unknown =>
    typeof pkg === "object" && pkg !== null ? Reflect.get(pkg, key) : undefined;
  if (field("name") !== ref.name || field("version") !== ref.version) {
    fail(
      `${display(manifest)} isn't ${ref.name}@${ref.version}: ${JSON.stringify(field("name"))}@${JSON.stringify(field("version"))}`,
    );
  }
  if (field("license") !== "MIT") {
    fail(
      `${display(manifest)} declares license ${JSON.stringify(field("license"))}, not "MIT". Don't use it.`,
    );
  }
  log(`${ref.name}@${ref.version}: license MIT`);
}

// Fetches only the pinned commit (GitHub serves any commit by its hash), with
// a full fetch as the fallback.
function checkoutSource(ref: Reference) {
  const dir = join(sourcesDir, ref.folder);
  const hasRepo = existsSync(join(dir, ".git"));

  if (hasRepo && currentCommit(dir) === ref.commit) {
    log(`${display(dir)} already at ${ref.commit.slice(0, 7)}`);
  } else {
    if (!hasRepo) {
      mkdirSync(dir, { recursive: true });
      git(["-c", "init.defaultBranch=main", "init", "--quiet"], dir);
    }
    try {
      git(["remote", "set-url", "origin", ref.repository], dir, true);
    } catch {
      git(["remote", "add", "origin", ref.repository], dir);
    }
    log(`fetching ${ref.repository} at ${ref.commit.slice(0, 7)}`);
    try {
      git(["fetch", "--quiet", "--depth", "1", "origin", ref.commit], dir);
    } catch {
      log("fetching the commit alone failed, fetching the whole history");
      git(["fetch", "--quiet", "origin"], dir);
    }
    git(["checkout", "--quiet", "--detach", ref.commit], dir);
    const head = currentCommit(dir);
    if (head !== ref.commit) {
      fail(`${display(dir)} is at ${head}, expected ${ref.commit}`);
    }
  }

  const licenseFile = join(dir, "LICENSE");
  if (!existsSync(licenseFile)) fail(`${display(licenseFile)} is missing`);
  if (
    !readFileSync(licenseFile, "utf8").trimStart().startsWith("MIT License")
  ) {
    fail(`${display(licenseFile)} isn't the MIT license. Don't use it.`);
  }
  log(`${ref.folder}@${ref.commit.slice(0, 7)}: license MIT`);
}

// Removes the folders that aren't MIT. A checkout at the pinned commit brings
// them back; this runs after every one, and a rerun finds them gone.
function removeFolders() {
  for (const folder of REMOVED_FOLDERS) {
    const dir = join(sourcesDir, folder);
    if (!existsSync(dir)) continue;
    rmSync(dir, { recursive: true, force: true });
    log(`removed ${display(dir)}: not MIT`);
  }
}

// Every package.json under dir, outside .git and node_modules.
function findManifests(dir: string): Manifest[] {
  const manifests: Manifest[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      manifests.push(...findManifests(path));
    } else if (entry.name === "package.json") {
      manifests.push({
        path: display(path),
        json: JSON.parse(readFileSync(path, "utf8")) as unknown,
      });
    }
  }
  return manifests;
}

function checkManifests() {
  const manifests = findManifests(referenceDir);
  const problems = licenseProblems(manifests);
  if (problems.length > 0) {
    fail(`not every package is MIT. Don't use them:\n${problems.join("\n")}`);
  }
  log(`${manifests.length} package.json files, all MIT`);
}

function countProtoFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countProtoFiles(join(dir, entry.name));
    else if (entry.name.endsWith(".proto")) count++;
  }
  return count;
}

function writeReadme() {
  const rows = REFERENCES.map(
    (ref) =>
      `| ${ref.name} | ${ref.version} | ${ref.author} | ${ref.repository.replace(/\.git$/, "")} | \`${ref.commit}\` |`,
  ).join("\n");

  writeFileSync(
    join(referenceDir, "README.md"),
    `# Reference copies

Written by \`yarn reference\` (\`scripts/reference/index.ts\`). This folder is gitignored and never shipped.

These are the MIT-licensed releases used as a reference for the TikTok LIVE protocol and message layout. Read them to understand the protocol; don't copy code from them. See \`THIRD_PARTY_NOTICES.md\` and the Licensing section of \`AGENTS.md\`.

| Package | Version | Author | Repository | Commit |
| ------- | ------- | ------ | ---------- | ------ |
${rows}

- \`<package>-<version>/package/\`: the npm tarball, as published.
- \`src/<repository>/\`: the source repository at that commit. The \`.proto\` files are under \`src/TikTok-Webcast-Protobuf/src/slim/v3/\`.
- Removed after the checkout, because they aren't MIT: ${REMOVED_FOLDERS.map((folder) => `\`src/${folder}/\``).join(", ")} (\`UNLICENSED\`: Euler Stream's private package). Don't restore them.

Later versions of both packages (tiktok-live-connector 2.4.1+, tiktok-live-proto 0.2.4+) are AGPL-3.0-only and must not be used.
`,
  );
}

function main() {
  mkdirSync(sourcesDir, { recursive: true });

  for (const ref of REFERENCES) downloadPackage(ref);
  for (const ref of REFERENCES) checkoutSource(ref);
  removeFolders();
  checkManifests();

  const protoDir = join(sourcesDir, PROTO_DIR);
  if (!existsSync(protoDir)) fail(`${display(protoDir)} is missing`);
  const protos = countProtoFiles(protoDir);
  if (protos === 0) fail(`no .proto files under ${display(protoDir)}`);
  log(`${protos} .proto files under ${display(protoDir)}`);

  writeReadme();
  log(`done: ${display(referenceDir)}`);
}

main();
