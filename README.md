# workspace-context

A [Hermes Agent](https://github.com/NousResearch/hermes-agent) desktop plugin that shows the **active session's context-window usage** above the message composer — mirroring the app's own status bar.

```
Context: 42.2K / 256K  16%  ▮▮▯▯▯▯▯▯▯▯▯▯▯
```

![workspace-context strip above the composer](screenshot.png)

*The strip shows the active session's live context usage — here `110.9K / 256K (43%)` with a segmented bar — sitting above the composer controls.*

## What it does

- Renders a compact, monospace readout above the composer: `used / total`, a percentage, and a segmented bar.
- **Per-session:** each chat keeps its own last-known usage, so switching sessions shows that session's numbers — not the last one you used.
- **Live:** updates from the gateway `session.info` event stream (the same source the core status bar reads).
- **Safe & local:** no backend, no network calls, no credentials. Usage is read-only and cached in plugin-scoped storage (capped at the 30 most recent sessions).
- When a session has no usage yet, it shows just `Context:` — nothing else.

## Install

From the [community index](https://github.com/Revell-ai/hermes-plugin-index) (after the entry is merged):

```bash
hermes plugins install workspace-context
```

Or manually:

1. Download `plugin.yaml` and `desktop/plugin.js` from this repo.
2. Place them at `<HERMER_HOME>/plugins/workspace-context/` so the layout is:
   ```
   workspace-context/
   ├── plugin.yaml
   └── desktop/
       └── plugin.js
   ```
   - macOS: `~/Library/Application Support/Hermes/.hermes/plugins/workspace-context/`
   - Linux: `~/.hermes/plugins/workspace-context/`
3. Enable it: `hermes plugins enable workspace-context` (or it's auto-discovered).
4. In the desktop app: **⌘K → "Reload desktop plugins"** (or quit and reopen).

> The standalone `desktop-plugins/` door also works: drop the folder at
> `<HERMES_HOME>/desktop-plugins/workspace-context/` (with `plugin.js` at the
> root) — it's default-on and needs no `plugins.enabled` entry. On macOS, copy
> `desktop/plugin.js` to the folder root rather than symlinking; some app
> sandboxes won't follow the symlink.

## How it works

The plugin is a single ESM file (`desktop/plugin.js`) loaded by the Hermes
desktop plugin runtime. It uses only the public plugin SDK:

- `host.state.focusedUsage` — the live streamed usage snapshot, updated by
  the backend mid-turn. Authoritative while a turn is running.
- `host.state.focusedSessionId` — keys the breakdown RPC to the focused session.
- `host.request('session.context_breakdown', { session_id })` — estimates
  context occupancy from the system prompt + tools + transcript. Fetched
  when the session is idle (not mid-turn, where the stream is authoritative).
  The result's `context_used` / `context_max` / `context_percent` fields
  override the streamed usage's matching fields, preventing stale values
  from carrying over after a session switch.
- `COMPOSER_AREAS.top` — mounts the strip above the composer.

All three breakdown fields must be finite numbers before they are accepted,
so a partial or malformed response can never paint the strip with garbage.

## Layout

```
workspace-context/
├── plugin.yaml      # manifest (name, description, version; desktop-only, no backend)
├── desktop/
│   └── plugin.js    # the plugin
├── screenshot.png   # preview shown in this README
└── README.md
```

## License

MIT
