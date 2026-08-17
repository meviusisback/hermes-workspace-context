/**
 * workspace-context — Hermes desktop plugin.
 *
 * Renders a compact context-window usage readout ABOVE the message composer,
 * mirroring the desktop app's own status bar:  "42.2K / 256K  16%  ▮▮▯▯".
 *
 * Usage is sourced from the gateway event stream (host.onEvent) — the same
 * stream the core status bar reads. We subscribe to 'session.info', the
 * event that carries the per-session UsageStats (context_used /
 * context_max / context_percent); extractUsage deep-searches the event
 * because builds have nested the fields in a few different slots.
 *
 * The reading is KEYED BY THE ACTIVE SESSION, using the app's own session
 * atom (host.state.focusedSessionId, falling back to activeSessionId) — the
 * same source the status bar tracks, so switching sessions shows that
 * session's own numbers. A single global key is used as a last-resort
 * fallback if neither atom is exposed by the build. A reading is only
 * accepted when context_max is a positive number, so an empty/draft-session
 * event can never blank a real value. Per-session values persist in plugin
 * storage (capped) so a remount/hot-reload restores each session correctly.
 *
 * When no usage is available the strip shows just "Context:" — nothing else.
 *
 * Layout: this is the desktop half of a unified plugin, discovered at
 *   <HERMES_HOME>/plugins/workspace-context/desktop/plugin.js
 * No build step; the app loads plugin.js uncompiled. ⌘K → "Reload desktop
 * plugins" picks it up.
 *
 * Plain ESM — only these imports resolve: @hermes/plugin-sdk, react,
 * react/jsx-runtime. UI is jsx() calls, not JSX syntax.
 */

import { host, COMPOSER_AREAS, useValue } from '@hermes/plugin-sdk'
import { useState, useEffect } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'workspace-context'
const MAX_SESSIONS = 30 // bound plugin storage; trim oldest beyond this

// Pull UsageStats out of an event regardless of where the build nested it.
function extractUsage(event) {
  if (!event) return null
  const candidates = [
    event.usage,
    event.payload?.usage,
    event.payload,
    event.data?.usage,
    event.data
  ]
  for (const c of candidates) {
    if (c && (c.context_used != null || c.context_max != null || c.context_percent != null)) {
      return c
    }
  }
  return null
}

// A reading is only worth keeping if it describes a real, sized context
// window. Empty/draft-session events (context_max === 0) would otherwise
// blank a genuine value, and — worse — get persisted, sticking across reloads.
function isValid(u) {
  return u && typeof u.context_max === 'number' && u.context_max > 0
}

// Which atom names the active/focused session. Prefer focused, fall back to
// active; if neither exists in this build we key on a single global slot.
const SID_ATOM = host.state.focusedSessionId || host.state.activeSessionId || null
const GLOBAL_KEY = '_global'

function currentSid() {
  if (SID_ATOM && typeof SID_ATOM.get === 'function') return SID_ATOM.get() || GLOBAL_KEY
  return GLOBAL_KEY
}

// Trim a usages map to at most MAX_SESSIONS entries, dropping the oldest
// (insertion order) so plugin storage can't grow without bound.
function trimUsages(map) {
  const keys = Object.keys(map)
  if (keys.length <= MAX_SESSIONS) return map
  const next = { ...map }
  for (const stale of keys.slice(0, keys.length - MAX_SESSIONS)) delete next[stale]
  return next
}

function UsageBar({ pct }) {
  const segs = 12
  const filled = Math.max(0, Math.min(segs, Math.round(((pct || 0) / 100) * segs)))
  const cells = []
  for (let i = 0; i < segs; i++) {
    cells.push(
      jsx('span', {
        key: i,
        className: i < filled ? 'text-(--ui-accent)' : 'text-(--ui-stroke-secondary)',
        children: '▮'
      })
    )
  }
  return jsx('span', { className: 'inline-flex items-center gap-px align-middle', style: { width: '34px' }, children: cells })
}

function ContextStrip({ ctx }) {
  const [usages, setUsages] = useState(() => {
    const stored = ctx.storage.get('usages', {})
    return stored && typeof stored === 'object' ? stored : {}
  })
  // Re-render when the focused/active session changes (so we switch keys).
  const sid = SID_ATOM ? useValue(SID_ATOM) : GLOBAL_KEY

  useEffect(() => {
    // The gateway emits 'session.info' with the per-session UsageStats the
    // status bar paints. (Earlier builds nested usage in a few different
    // slots, so extractUsage still deep-searches the event.)
    const dispose = host.onEvent('session.info', (event) => {
      const u = extractUsage(event)
      if (!isValid(u)) return
      const key = currentSid()
      if (!key) return
      setUsages((prev) => {
        const next = trimUsages({ ...prev, [key]: u })
        ctx.storage.set('usages', next)
        return next
      })
    })
    return dispose
  }, [])

  const usage = usages[sid] || usages[GLOBAL_KEY] || null
  const used = usage?.context_used ?? 0
  const max = usage?.context_max ?? 0
  const pct = usage?.context_percent ?? (max ? Math.round((used / max) * 100) : 0)

  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n || 0))

  return jsx('div', {
    className: 'flex items-center gap-2 px-3 py-1.5 text-xs bg-(--ui-bg-card) font-mono',
    children: max
      ? jsxs('span', {
          className: 'flex items-center gap-1.5',
          children: [
            jsx('span', { className: 'text-(--ui-text-quaternary)', children: 'Context:' }),
            jsx('span', { className: 'text-(--ui-text-secondary)', children: `${fmt(used)} / ${fmt(max)}` }),
            jsx('span', { className: 'text-(--ui-text-secondary) ml-1', children: `${pct}%` }),
            jsx(UsageBar, { pct })
          ]
        })
      : jsx('span', { className: 'text-(--ui-text-quaternary)', children: 'Context:' })
  })
}

export default {
  id: ID,
  name: 'Workspace Context',
  description: 'Shows the active session context-window usage (used / total + a percentage bar) above the composer.',
  defaultEnabled: true,
  register(ctx) {
    ctx.register({
      id: 'composer-strip',
      area: COMPOSER_AREAS.top,
      render: () => jsx(ContextStrip, { ctx })
    })
  }
}
