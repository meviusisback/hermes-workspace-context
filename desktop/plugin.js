/**
 * workspace-context — DEFINITIVE DEBUG BUILD.
 *
 * Renders, in the strip, exactly what the plugin SDK exposes in THIS app
 * build — so we stop guessing. Shows:
 *   - whether host.state.focusedUsage / focusedSessionId / activeSessionId exist
 *   - the live focusedUsage value (if the atom exists)
 *   - whether host.onEvent('*') ever fires (event counter)
 * No console needed; everything is in the strip.
 */

import { host, COMPOSER_AREAS, useValue } from '@hermes/plugin-sdk'
import { useState, useEffect } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'workspace-context'

// Module-level: constant across renders, so calling useValue conditionally is safe.
const HAS_FOCUSED_USAGE = !!(host.state && host.state.focusedUsage)
const HAS_FOCUSED_SID = !!(host.state && host.state.focusedSessionId)
const HAS_ACTIVE_SID = !!(host.state && host.state.activeSessionId)

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
      jsx('span', { key: i, className: i < filled ? 'text-(--ui-accent)' : 'text-(--ui-stroke-secondary)', children: '▮' })
    )
  }
  return jsx('span', { className: 'inline-flex items-center gap-px align-middle select-none', style: { width: '34px' }, children: cells })
}

function ContextStrip() {
  const fu = HAS_FOCUSED_USAGE ? useValue(host.state.focusedUsage) : null
  const [evtCount, setEvtCount] = useState(0)

  useEffect(() => {
    const dispose = host.onEvent('*', () => setEvtCount((c) => c + 1))
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  }, [])

  const used = fu?.context_used ?? 0
  const max = fu?.context_max ?? 0
  const pct = fu?.context_percent ?? (max ? Math.round((used / max) * 100) : 0)

  // Diagnostic header line.
  const diag = `fU=${HAS_FOCUSED_USAGE ? 'Y' : 'n'} fS=${HAS_FOCUSED_SID ? 'Y' : 'n'} aS=${HAS_ACTIVE_SID ? 'Y' : 'n'} evt=${evtCount}`

  return jsx('div', {
    className: 'flex items-center gap-2 px-3 py-1.5 text-xs bg-(--ui-bg-card) font-mono',
    children: jsxs('span', {
      className: 'flex items-center gap-1.5',
      children: [
        jsx('span', { className: 'text-(--ui-text-quaternary)', children: 'Context:' }),
        jsx('span', { className: 'text-(--ui-text-secondary)', children: diag }),
        max
          ? jsxs('span', {
              className: 'flex items-center gap-1.5',
              children: [
                jsx('span', { className: 'text-(--ui-text-secondary)', children: `${fmt(used)} / ${fmt(max)}` }),
                jsx('span', { className: 'text-(--ui-text-secondary) ml-1', children: `${pct}%` }),
                jsx(UsageBar, { pct })
              ]
            })
          : null
      ]
    })
  })
}

export default {
  id: ID,
  name: 'Workspace Context',
  description: 'DEBUG: introspect host.state + onEvent in this app build.',
  defaultEnabled: true,
  register(ctx) {
    ctx.register({ id: 'composer-strip', area: COMPOSER_AREAS.top, render: () => jsx(ContextStrip, {}) })
  }
}
