/**
 * workspace-context — Hermes desktop plugin.
 *
 * Renders a compact context-window usage readout ABOVE the message composer,
 * mirroring the desktop app's own status bar:  "42.2K / 256K  16%  ▮▮▯▯".
 *
 * DATA SOURCES (same dual-source merge the core statusbar uses):
 *
 * 1. host.state.focusedUsage — the LIVE streamed usage snapshot, updated by
 *    the backend mid-turn. Authoritative while a turn is running, BUT a
 *    resumed session reports no context_* fields (the store merges rather than
 *    replaces, so focusedUsage alone can paint a PREVIOUS session's stale
 *    numbers after a switch).
 *
 * 2. host.request('session.context_breakdown', { session_id }) — estimates
 *    context occupancy from the live system prompt + tools + transcript. This
 *    is what makes a resumed/idle session show its REAL context instead of
 *    nothing or stale data. Keyed by sessionId so a switch drops the previous
 *    numbers. Fetched only when the session is NOT busy (mid-turn the stream
 *    is authoritative, and the transcript is changing on every delta).
 *
 * The breakdown's context_* fields override the streamed usage's context_*
 * fields when available and matching the current session. Mid-turn, only the
 * streamed usage carries the gauge.
 *
 * When the focused session has no context data at all (new/blank chat), the
 * strip shows just "Context:".
 */

import { host, COMPOSER_AREAS, useValue } from '@hermes/plugin-sdk'
import { useState, useEffect } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'workspace-context'

// Module-level: constant across renders, so the conditional useValue() is safe.
const usageAtom = host.state?.focusedUsage ?? null
const sidAtom = host.state?.focusedSessionId ?? null
const busyAtom = host.state?.busy ?? null

function fmt(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
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

function ContextStrip() {
  // 1. Live streamed usage from the backend (mid-turn authoritative).
  const streamed = usageAtom ? useValue(usageAtom) : null
  // 2. The focused session's runtime id — for the breakdown RPC and keying.
  const sid = sidAtom ? useValue(sidAtom) : null
  // 3. Busy flag — skip the breakdown RPC mid-turn (the stream is live then).
  const busy = busyAtom ? useValue(busyAtom) : false

  // Estimated context breakdown for idle/resumed sessions. Keyed by sessionId
  // so a switch drops the previous session's numbers instead of painting them
  // under the new session's name.
  const [fetched, setFetched] = useState(null)

  useEffect(() => {
    // No session or mid-turn → don't fetch; the stream or blank state is correct.
    if (!sid || busy) {
      return
    }

    let cancelled = false

    host
      .request('session.context_breakdown', { session_id: sid })
      .then((b) => {
        if (!cancelled && b && typeof b.context_max === 'number') {
          setFetched({ ...b, sessionId: sid })
        }
      })
      .catch(() => {
        // Backend may not support the method, or the session may be gone.
        // Silent: the streamed usage (if any) is still rendered.
      })

    return () => {
      cancelled = true
    }
  }, [sid, busy])

  // The breakdown wins when it matches the current session. When idle (not
  // busy) and no breakdown yet, show EMPTY — never fall back to streamed
  // context_* because the store MERGES rather than REPLACES, so those fields
  // can be stale from a PREVIOUS session. Only use streamed context_* mid-turn
  // (busy), where the stream is the live, authoritative source.
  const breakdown = fetched && fetched.sessionId === sid ? fetched : null
  const showStreamed = busy && streamed

  const used = breakdown?.context_used ?? (showStreamed ? streamed.context_used : 0)
  const max = breakdown?.context_max ?? (showStreamed ? streamed.context_max : 0)
  const pct = breakdown?.context_percent ?? (showStreamed ? streamed.context_percent : (max ? Math.round((used / max) * 100) : 0))

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
      render: () => jsx(ContextStrip, {})
    })
  }
}
