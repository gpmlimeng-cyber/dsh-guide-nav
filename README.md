# dsh-guide-nav

**English** | [简体中文](README.zh.md)

A DeepSeek Harness (`dsh`) plugin: a **guide strip** above the composer in a *blank* Session — it lays out the skills available to the current Session as clickable pills, and clicking one writes it into the draft. It turns "I don't know where to start" into pressing Enter.

- **HOST half**: one Remote service (`guideNav`) exposing the skill catalog visible to a Session
- **CLIENT half**: registers a row of skill pills in `conversation.input.dock`; a click writes into the draft via `inputActions`
- **Session-aware**: shown only while `session.blank` — once a Session has content, the agent preset and identity are locked, so offering a choice is both meaningless and distracting
- **Stateless**: the catalog is never cached; switching Sessions refetches, so a previous Session's skills never flash

## Layout

```
dsh-guide-nav/
├── package.json          # npm manifest + dsh.bundle / dsh.client declarations
├── tsconfig.json         # strict typecheck config (tsc --noEmit)
├── tsdown.config.ts      # build: HOST library (lib/) + client bundle (lib/client.js)
├── cordis.patch.yml      # bundle config layer: inserts the plugin row
├── README.md             # English README (this file)
├── README.zh.md          # Chinese README
└── src/
    ├── index.ts          # HOST half: GuideNavService (@Remote exposes the catalog)
    └── client/           # browser half
        ├── index.ts      # client entry: inject + apply, wires up registrations
        ├── constants.ts  # slot constants and why this slot
        ├── guide-strip.ts# the guide strip component (the core of this plugin)
        └── styles.ts     # one-shot <style> injection (neutral greys, theme-agnostic)
```

## Quick start

### Install as a bundle (for users)

```sh
# local directory
dsh plugin --profile web add /path/to/dsh-guide-nav

# or straight from GitHub (replace with your own repo)
dsh plugin --profile web add github:you/dsh-guide-nav
```

A GitHub install pulls **source**, and pnpm runs `prepare` (i.e. `tsdown`) to build `lib/`. With pnpm ≥10 the first run refuses to execute a git dependency's prepare; add the package name pnpm prints to the profile's `pnpm-workspace.yaml` and retry:

```yaml
allowBuilds:
  dsh-guide-nav: true
```

> That allowlist authorizes executing the package's code at install time. Allow only sources you trust, and pin a commit: `github:you/dsh-guide-nav#<sha>`.

Verify the config layer and start:

```sh
dsh --profile web --dump-config   # should show a "# == dsh-guide-nav" layer
dsh --profile web
```

### Manual install into an existing profile

If the profile is not managed by `dsh plugin add` (e.g. `~/.dsh/profiles/desktop`), three places must change:

```jsonc
// ~/.dsh/profiles/<name>/package.json
"dependencies": { "dsh-guide-nav": "link:/abs/path/to/dsh-guide-nav" },
"dsh": { "profile": { "bundles": [ /* …, */ "dsh-guide-nav" ] } }
```

```yaml
# ~/.dsh/profiles/<name>/pnpm-lock.yaml — under importers.dependencies
dsh-guide-nav:
  specifier: link:/abs/path/to/dsh-guide-nav
  version: link:../../../abs/path/to/dsh-guide-nav
```

> ⚠️ **The lockfile entry is not optional**: `pnpm install` rolls back dependencies absent from the lockfile, so editing only `package.json` is silently reverted (the output still reads "Already up to date").

**A `dsh.profile.bundles` change is not hot-reloaded — restart DSH.**

### Local development

```sh
npm install
npm run build      # produces lib/index.js + lib/client.js
npm run typecheck
```

To exercise the browser half, rebuild after changes to `src/client/`, then restart DSH (or refresh the page, depending on the profile's `patchReload`).

## Configuration

```yaml
# cordis.patch.yml
- insert:
    - id: dsh-guide-nav
      name: dsh-guide-nav
      config:
        maxSkills: 12              # maximum number of skill pills
        showOnActiveSession: false # also show on a non-blank Session
```

| Field | Default | Meaning |
|---|---|---|
| `maxSkills` | `12` | Pill cap; the HOST returns the full list and the UI truncates |
| `showOnActiveSession` | `false` | Also show on a non-blank Session. Default: blank Sessions only |

## How the browser half works

- `package.json` declares `dsh.client: { platform: "web" }` + `exports["./client"]`; dsh's client-modules discovers that and loads `lib/client.js` as a browser plugin;
- the client entry (`src/client/index.ts`) declares `inject = ['slots', 'remote']`, then injects styles and registers the strip in `apply`;
- the target is `conversation.input.dock` — a session-scoped `list` slot rendered **above** the composer card, whose props carry `inputActions` (write the draft) and `useSession` (read session state). `order: 30` places it after the built-in `todo`(0) / `goal`(10) / `queue`(20);
- registration is wrapped in `ctx.slots.inject(...)` so it parks instead of throwing when the slot declaration is not ready yet;
- HOST data arrives through `ctx.remote.guideNav.listSkills(...)`; the Gateway generates the wire endpoint from the HOST half's `@Remote`;
- at runtime the browser half depends only on `react` (provided by the browser platform module table) and reaches everything else through ctx services — it **imports no `@deepseek-ai` client package**. Keep that discipline when editing.

## Design notes

**Progressive disclosure, not five stacked layers.** WorkBuddy's input chain spreads five layers across the screen at once (app → mode → pills → tags → cases) because its users don't know what they want. DSH users are developers: they know what they want and only need to know whether it exists. So the collapsed state here is **a single row**.

**No "mode / persona" layer.** A DSH persona is bound to an agent preset, chosen before the Session is created, and once a Session has produced content it is `agent-preset/locked`. Re-picking an identity mid-Session is self-contradictory. Mode differences belong to the preset.

**Draft, not send.** After picking a skill the user still has details to add. Writing to the composer is *filling in a blank*; sending is *deciding for them*.

**`session.blank` rather than counting messages.** This is the framework's authoritative signal (`SessionSnapshot.blank`), more reliable than "message array is empty" — the latter misreads a freshly created Session that already carries system events as non-blank.

## Dev notes

Four traps, each costing one round trip:

| Symptom | Reality |
|---|---|
| `slots.register` says `needs an options object with a name` | The first registration field is **`name`** (the target slot key), not `id`. The Inspector catalog renders it as `id`, which disagrees with the runtime — **trust the runtime error** |
| `React is not defined` | In a dynamic plugin `React` is an injected global; a **real plugin must `import React from 'react'`** |
| `cannot get property "remote.skills" without inject` | Client service access is gated by the fiber's `inject` declaration; `remote` and `remote.skills` are **two separate seats**, not a property chain |
| `harness is not defined` | `harness` exists only in the **dynamic plugin sandbox** (injected by host-runner). A real plugin uses `TypertRemoteService` + `@Remote`; there is no such global |

**Shared lesson**: dynamic plugins (`cordis_define` / `cordis_run`) and real plugins take **different load paths**; experience from the former does not transfer.

One build-side trap: `@deepseek-ai/*` dependencies must stay **external** (see `tsdown.config.ts`). Bundling them duplicates cordis and the service base class, so `instanceof` and decorator metadata disagree across the two copies and the Remote endpoint never registers.

## Status

**Implemented**: skill pills, click-to-draft, blank-Session-only visibility, loading / empty / error states.

**Not implemented**:

- Input-template tags after picking a skill (needs a template section convention in `SKILL.md`)
- Best-practice case cards (planned for `conversation.composer.dock`)
- `maxSkills` / `showOnActiveSession` are not yet wired to the config read path; the HOST returns everything and the UI decides

## Publishing

- **npm**: `npm publish` (`files` already includes build output and the patch)
- **tarball**: `npm pack`, then `dsh plugin --profile web add ./dsh-guide-nav-0.1.0.tgz`
- **git**: `dsh plugin --profile web add github:you/dsh-guide-nav` (with the `allowBuilds` entry above)

## See also

- Plugin development basics: [basic/index.md](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/index.md)
- Plugin configuration: [basic/config.md](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/config.md)
- Packaging and install: [basic/publish.md](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md)
- Services and dependencies: [framework/service.md](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/framework/service.md)
- Events: [framework/events.md](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/framework/events.md)

## License

MIT
