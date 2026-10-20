---
name: release
description: "Publish a version of @tokioapp/connector to npm. Bumps the version, commits, tags and pushes, then watches the Publish workflow until npm and GitHub show the release. Use only when the user asks for a release."
argument-hint: "[version]"
disable-model-invocation: true
---

# Release

A release is on npm as soon as the workflow publishes it, and npm versions can't be reused. Confirm the version, and ask before pushing.

## Where things stand

- Version: !`node -p "require('./package.json').version"`
- Last tag: !`git describe --tags --abbrev=0`
- Branch: !`git status --short --branch`

## Steps

1. Check the branch: `main`, clean and level with `origin/main` (`git fetch origin`, then `git status --short --branch`). Check that CI passed on `HEAD`: the `status` and `conclusion` of `https://api.github.com/repos/tokio-app/connector/actions/runs?head_sha=<sha>` (or `gh run list --branch main --limit 3` if `gh` is installed). If anything is off, stop and tell the user.
2. Pick the version: the argument if there is one, otherwise propose one from the Conventional Commits since the last tag (`git log --oneline <last tag>..HEAD`): while the version is `0.x`, a `feat!:` or other breaking change bumps the minor, anything else the patch. Confirm it with the user. A version with a `-` (`0.2.0-beta.1`) is a prerelease: npm publishes it under the `next` dist-tag and GitHub marks it as a prerelease.
3. Run the `verify` skill's checks, including `yarn build`, and `npm pack --dry-run`: the package holds only `dist/`, `LICENSE`, `README.md`, `THIRD_PARTY_NOTICES.md` and `package.json`.
4. Change only `version` in `package.json`, and commit it as `chore(release): <version>`, subject only, like the earlier ones (`git log --grep "^chore(release)" -3`).
5. Tag it: `git tag v<version>`, lightweight. The workflow fails when the tag doesn't match `package.json`.
6. Ask the user, then push the commit and the tag: `git push origin main`, then `git push origin v<version>`.
7. Watch the Publish workflow (`.github/workflows/publish.yml`: checks, tests, `npm publish`, then the GitHub release). Give the user its page, `https://github.com/tokio-app/connector/actions/workflows/publish.yml`. Poll `https://api.github.com/repos/tokio-app/connector/actions/runs?event=push&branch=v<version>` once a minute in the background until its `status` is `completed` (or use `gh run watch` if `gh` is installed).
8. If it failed, give the user the run's `html_url` and the step that failed. A rerun skips what was already published, so fix the cause and rerun it on GitHub; if the fix needs a commit, it needs a new version.
9. Check npm: `npm view @tokioapp/connector@<version> version dist-tags` shows the version, and `latest` (or `next` for a prerelease) points to it. Check the GitHub release at `https://api.github.com/repos/tokio-app/connector/releases/tags/v<version>`: published, not a draft.

## Done when

npm shows the version under the right dist-tag, the GitHub release is published, and the user has both URLs: `https://www.npmjs.com/package/@tokioapp/connector/v/<version>` and `https://github.com/tokio-app/connector/releases/tag/v<version>`.
