/**
 * workspace-context — DEBUG BUILD (diagnostic only, not for publish).
 *
 * Renders the context strip PLUS live diagnostics so we can see, in the UI,
 * what gateway events actually reach the plugin and what session ids they
 * carry on a session switch. Console.log from plugins is unreliable (often
 * routed to the app's own log viewer, not devtools), so we surface the data
 * in the strip itself.
 *
 * Remove the debug overlay once the real fix lands.
 */

import { host, COMPOSER_AREAS } from '@hermes/plugin-sdk'
import { useState, useEffect } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'workspace-context'
const GLOBAL_KEY = '_global'

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

function isValid(u) {
  return u && typeof u.context_max === 'number' && u.context_max > 0
}

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
  // Live diagnostics, rendered in the strip.
  const [diag, setDiag] = useState({ n: 0, lastType: '-', lastSid: '-', hasUsage: false })
  const [activeSid, setActiveSid] = useState(GLOBAL_KEY)
  const [usages, setUsages] = useState({})

  useEffect(() => {
    // '*' catches EVERY event type the plugin tap forwards.
    const dispose = host.onEvent('*', (event) => {
      const sid = extractSessionId(event) || '-'
      const u = extractUsage(event)
      setDiag((d) => ({
        n: d.n + 1,
        lastType: event?.type || '?',
        lastSid: sid,
        hasUsage: !!u
      }))
      if (event?.type === 'session.info') {
        setActiveSid(sid)
        if (isValid(u)) setUsages((prev) => ({ ...prev, [sid]: u }))
      }
    })
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  }, [])

  const usage = usages[activeSid] || null
  const used = usage?.context_used ?? 0
  const max = usage?.context_max ?? 0
  const pct = usage?.context_percent ?? (max ? Math.round((used / max) * 100) : 0)

  return jsx('div', {
    className: 'flex items-center gap-2 px-3 py-1.5 text-xs bg-(--ui-bg-card) font-mono',
    children: jsxs('span', {
      className: 'flex items-center gap-1.5',
      children: [
        jsx('span', { className: 'text-(--ui-text-quaternary)', children: 'Context:' }),
        jsx('span', {
          className: 'text-(--ui-text-secondary)',
          children: `n=${diag.n} type=${diag.lastType} sid=${diag.lastSid} usage=${diag.hasUsage ? 'Y' : 'n'}`
        }),
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
  description: 'DEBUG build — shows context usage plus event diagnostics.',
  defaultEnabled: true,
  register(ctx) {
    ctx.register({
      id: 'composer-strip',
      area: COMPOSER_AREAS.top,
      render: () => jsx(ContextStrip, {})
    })
  }
}
