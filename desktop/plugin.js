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
 * because builds nest the fields in a few different slots.
 *
 * KEYING — IMPORTANT: we do NOT rely on host.state.*SessionId atoms. The
 * desktop plugin SDK exposes only a partial host.state surface (e.g.
 * focusedUsage is absent and reading it crashes), and the session-id atoms
 * are not reliably live. Instead we read the session id carried directly in
 * each 'session.info' event (event.session_id / payload.stored_session_id /
 * …). Storage AND display are both keyed by that id, so switching sessions
 * tracks correctly: the gateway emits a fresh session.info for the focused
 * session on switch, updating both the stored value and the active key.
 *
 * A reading is only accepted when context_max is a positive number, so an
 * empty/draft-session event can never blank a real value. Per-session values
 * (and the active session id) persist in plugin storage (capped) so a
 * remount/hot-reload restores each session correctly.
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

import { host, COMPOSER_AREAS } from '@hermes/plugin-sdk'
import { useState, useEffect } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'workspace-context'
const MAX_SESSIONS = 30 // bound plugin storage; trim oldest beyond this
const GLOBAL_KEY = '_global'

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

// The session id travels WITH the session.info event. Prefer the explicit
// session_id; fall back through the slots builds have used. Returns null if
// none is present (caller falls back to the global slot).
function extractSessionId(event) {
  return (
    event?.session_id ||
    event?.sessionId ||
    event?.payload?.session_id ||
    event?.payload?.sessionId ||
    event?.payload?.stored_session_id ||
    event?.data?.session_id ||
    event?.data?.sessionId ||
    null
  )
}

// A reading is only worth keeping if it describes a real, sized context
// window. Empty/draft-session events (context_max === 0) would otherwise
// blank a genuine value, and — worse — get persisted, sticking across reloads.
function isValid(u) {
  return u && typeof u.context_max === 'number' && u.context_max > 0
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
  return jsx('span', { className: 'inline-flex items-center gap-px align-middle select-none', style: { width: '34px' }, children: cells })
}

function ContextStrip({ ctx }) {
  const [usages, setUsages] = useState(() => {
    const stored = ctx.storage.get('usages', {})
    return stored && typeof stored === 'object' ? stored : {}
  })
  // The session we currently display. Driven by the events themselves (not a
  // host.state atom), so it follows UI session switches.
  const [activeSid, setActiveSid] = useState(() => {
    const s = ctx.storage.get('activeSid', GLOBAL_KEY)
    return typeof s === 'string' ? s : GLOBAL_KEY
  })

  useEffect(() => {
    // The gateway emits 'session.info' with the per-session UsageStats the
    // status bar paints. (Builds nest usage in a few different slots, so
    // extractUsage still deep-searches the event. Likewise the session id
    // can sit in a few slots, so extractSessionId checks them all.)
    const dispose = host.onEvent('session.info', (event) => {
      const sid = extractSessionId(event) || GLOBAL_KEY
      // Follow the focused session even when its usage is empty/zero. An empty
      // session must read empty — never borrow another session's value.
      setActiveSid(sid)
      try {
        ctx.storage.set('activeSid', sid)
      } catch (_) {
        // Storage is best-effort; never let a write failure break the strip.
      }

      const u = extractUsage(event)
      if (!isValid(u)) return

      setUsages((prev) => {
        const next = trimUsages({ ...prev, [sid]: u })
        try {
          ctx.storage.set('usages', next)
        } catch (_) {
          // Storage is best-effort; never let a write failure break the strip.
        }
        return next
      })
    })

    return () => {
      if (typeof dispose === 'function') dispose()
    }
  }, [ctx])

  // Show only the focused session's OWN data. If it has none recorded, read
  // empty — never fall back to another session's number.
  const usage = usages[activeSid] || null
  const used = usage?.context_used ?? 0
  const max = usage?.context_max ?? 0
  const pct = usage?.context_percent ?? (max ? Math.round((used / max) * 100) : 0)

  const fmt = (n) => {
    if (!n) return '0'
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
    return String(n)
  }

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
