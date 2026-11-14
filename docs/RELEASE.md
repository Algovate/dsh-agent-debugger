# Release checklist

Agent Debugger is published on GitHub and npm. The remaining external step is a DSH plugin-market
listing; the live GUI checks are tracked separately as a known limitation.

## Current status (2026-11-14)

- Version: `0.2.0`; package name `dsh-agent-debugger`.
- npm: **published** `dsh-agent-debugger@0.2.0`; `latest` points to it.
  <https://www.npmjs.com/package/dsh-agent-debugger>
- Public repository: <https://github.com/Algovate/dsh-agent-debugger> (main, CI green).
- Release tag: `v0.2.0`.
- Fresh temp profile installed `dsh-agent-debugger@0.2.0`; `--dump-config-schema` exited 0 and
  contained the `agent-debugger` entry.
- Demo GIF: `docs/demo.gif` (960×540, 24 s, 12.5 fps, 300 frames, 2.3 MB), reproducible from
  `docs/demo.html`; included in the README and npm package.
- `repository`, `homepage`, and `bugs` are set in `package.json`.
- Automated checks: plugin **64 pass**, workspace **150 pass**, `npm run check` passes.
- `npm pack --dry-run` passes: 21 files, 2.3 MB (includes `docs/demo.gif`). The packed file list is
  the authority; no build step and no install scripts means no pnpm build allowance is needed.
- npm authentication was configured for the release account; `npm publish` completed as
  `dsh-agent-debugger@0.2.0`.
- Live GUI still needs the finish-pause, `agent.steer` continuation, and diff-rendering walkthrough
  listed in [verification.md](verification.md#0.2.0-状态).
- Open Plugin Market: submitted via
  [issue #487](https://github.com/polang233/dsh-plugin-index/issues/487); the index is curated by
  maintainers, so this is pending review rather than an immediate listing.

## 1. Identity

- [x] Create the public repository under `Algovate`.
- [x] Add `repository`, `homepage`, and `bugs` to `package.json`; `author` is `Algovate`.
- [x] Push `main`; GitHub Actions CI is green.
- [x] Confirm the npm name is still available before publishing: `npm view dsh-agent-debugger version` → 404.
- [x] Tag the release: `v0.2.0`.
- [x] Publish `dsh-agent-debugger@0.2.0` to npm; `latest` points to it.

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

## 3. Publish (done for 0.2.0)

```sh
npm login
npm publish --access public --otp=<code>
```

`prepublishOnly` reruns the tests and syntax checks. The live GUI checks in
[verification.md](verification.md#0.2.0-状态) are still listed as unverified; they are a known
limitation of this release, not a publish blocker.

## 4. Install from the registry in a fresh profile (verified)

```sh
dsh plugin --profile <test-profile> add dsh-agent-debugger@0.2.0
dsh --profile <test-profile> --dump-config | grep -A2 'agent-debugger'
```

Verified with a temp `DSH_HOME`: install succeeded, `--dump-config-schema` exited 0 and contained
`agent-debugger`.

Then boot the Web profile, open a session, and confirm:

- the composer dock appears;
- step and tool breakpoints pause;
- a finish pause shows the final answer and can finish or steer one more step;
- `edit`/`write` previews render without reading the filesystem;
- an unauthenticated `/agent-debugger/api/state` request is rejected.

## 5. Marketplace listing

Submitted 2026-11-14: [Open Plugin Market issue #487](https://github.com/polang233/dsh-plugin-index/issues/487).
The market index is curated by maintainers; wait for review and the next index refresh.

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
