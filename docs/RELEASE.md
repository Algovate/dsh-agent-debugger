# Release checklist

Agent Debugger is prepared for a public GitHub repository, an npm release, and a DSH plugin-market
listing. The remaining external steps need npm credentials and a marketplace entry.

## Current status (2026-11-14)

- Version: `0.2.0`; package name `dsh-agent-debugger`.
- npm name is available: `npm view dsh-agent-debugger version` → 404.
- Public repository: <https://github.com/Algovate/dsh-agent-debugger> (main, CI green).
- Release tag: `v0.2.0`.
- `repository`, `homepage`, and `bugs` are set in `package.json`.
- Automated checks: plugin **64 pass**, workspace **150 pass**, `npm run check` passes.
- `npm pack --dry-run` passes: 19 files, ~60 kB. The packed file list is the authority; no build
  step and no install scripts means no pnpm build allowance is needed.
- npm authentication is **not configured** in the current environment; `npm publish` has not
  been run.
- Live GUI still needs the finish-pause, `agent.steer` continuation, and diff-rendering walkthrough
  listed in [verification.md](verification.md#0.2.0-状态).

## 1. Identity

- [x] Create the public repository under `Algovate`.
- [x] Add `repository`, `homepage`, and `bugs` to `package.json`; `author` is `Algovate`.
- [x] Push `main`; GitHub Actions CI is green.
- [x] Confirm the npm name is still available: `npm view dsh-agent-debugger version` → 404.
- [x] Tag the release: `v0.2.0`.

## 2. Pre-flight

```sh
cd dsh-agent-debugger
npm test
npm run check
npm pack --dry-run
```

The packed file list must include:

- `index.js`, `client.js`, `engine.js`, `preview.js`
- `cordis.patch.yml`
- `locale/en.json`, `locale/zh.json`
- `icon.svg`
- `README.md`, `README.en.md`, `CHANGELOG.md`, `SECURITY.md`, `LICENSE`
- `docs/DETAIL.md`, `docs/DETAIL.zh.md`, `docs/verification.md`,
  `docs/verification-history.md`, `docs/RELEASE.md`

## 3. Publish

```sh
npm login
npm publish --access public
```

`prepublishOnly` reruns the tests and syntax checks. Do not publish until the live GUI checks in
[verification.md](verification.md#0.2.0-状态) are either completed or explicitly accepted as a
known limitation.

## 4. Install from the registry in a fresh profile

```sh
dsh plugin --profile <test-profile> add dsh-agent-debugger@0.2.0
dsh --profile <test-profile> --dump-config | grep -A2 'agent-debugger'
```

Then boot the Web profile, open a session, and confirm:

- the composer dock appears;
- step and tool breakpoints pause;
- a finish pause shows the final answer and can finish or steer one more step;
- `edit`/`write` previews render without reading the filesystem;
- an unauthenticated `/agent-debugger/api/state` request is rejected.

## 5. Marketplace listing

The market index entry needs:

- package name and version: `dsh-agent-debugger`, `0.2.0`;
- `title` / `description` from `locale/{en,zh}.json` meta;
- `icon` (`icon.svg`);
- `repository` and `homepage`;
- `metadata.category`: `development`;
- `metadata.keywords`: `dsh`, `dsh-plugin`, `agent`, `debugger`, `breakpoint`, `prompt`,
  `tool-call`, `inspect`, `interrupt`, `turn-end`, `diff`;
- `engines.dsh`: `>=0.2.2-0 <0.3.0`;
- the detail document from `locale/*.json` `meta.detail`
  (`docs/DETAIL.md` / `docs/DETAIL.zh.md`).

Suggested listing copy:

> **Agent Debugger** — Pause a DSH agent before its next model step, a matching tool call, or the
> turn closing. Inspect the assembled prompt, frozen arguments, or final answer; allow, skip,
> edit-and-reissue, steer, or finish. Breakpoints are opt-in, in-memory, and auto-release.

## 6. After release

- Bump the version and `CHANGELOG.md` for every behavior change.
- Re-check compatibility against the current DSH release before widening `engines.dsh`.
- Never claim the market `verified` label; the index owner assigns it.
