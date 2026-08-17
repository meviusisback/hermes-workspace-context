/**
 * workspace-context — Hermes desktop plugin.
 *
 * Renders a compact context-window usage readout ABOVE the message composer,
 * mirroring the desktop app's own status bar:  "42.2K / 256K  16%  ▮▮▯▯".
 *
 * Source of truth: host.state.focusedUsage — the same readonly atom the core
 * status bar's context chip paints. It is the LIVE usage snapshot of the
 * FOCUSED session, streamed by the backend (no RPC, no event subscription).
 * Because it is already scoped to the focused session, switching chats updates
 * it automatically and it never shows another session's value. We read it via
 * useValue() so the strip re-renders on every backend push.
 *
 * When the focused session has no usage yet, the strip shows just "Context:".
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
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'workspace-context'

// Module-level: constant across renders, so the conditional useValue() is safe.
const usageAtom = host.state?.focusedUsage ?? null

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
  // The focused session's live usage. null/undefined until the backend reports it.
  const usage = usageAtom ? useValue(usageAtom) : null

  const used = usage?.context_used ?? 0
  const max = usage?.context_max ?? 0
  const pct = usage?.context_percent ?? (max ? Math.round((used / max) * 100) : 0)

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
