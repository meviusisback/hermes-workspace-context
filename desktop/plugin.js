/**
 * workspace-context — DIAGNOSTIC BUILD (DIAG-2). NOT for publish.
 *
 * Prints its raw observed state directly in the strip so we can see, with no
 * console, whether the new file loaded and whether host.state.focusedUsage is
 * actually live for the session the user is VIEWING.
 *
 * Fields shown:
 *   v=DIAG-2        build stamp — confirms this exact file loaded
 *   fu=...          raw focusedUsage object {context_used, context_max, context_percent}
 *   fsid=...        host.state.focusedSessionId (raw)
 *   tick=N          increments on every React render (proves re-renders happen)
 */

import { host, COMPOSER_AREAS, useValue } from '@hermes/plugin-sdk'
import { useState, useEffect } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'workspace-context'
const BUILD = 'DIAG-2'

const hasFU = !!(host.state && host.state.focusedUsage)
const fuAtom = hasFU ? host.state.focusedUsage : null
const sidAtom = host.state?.focusedSessionId ?? null

function renderSafe(label, body) {
  try {
    return body()
  } catch (e) {
    return jsx('span', { className: 'text-(--ui-text-quaternary)', children: `${label} ERR: ${String(e)}` })
  }
}

function ContextStrip() {
  const fu = fuAtom ? useValue(fuAtom) : null
  const fsid = sidAtom ? useValue(sidAtom) : null
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let n = 0
    const t = setInterval(() => {
      n += 1
      setTick(n)
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const fuStr = fu
    ? `u:${fu.context_used ?? '?'} m:${fu.context_max ?? '?'} p:${fu.context_percent ?? '?'}`
    : 'null'

  return jsx('div', {
    className: 'flex items-center gap-2 px-3 py-1.5 text-xs bg-(--ui-bg-card) font-mono',
    children: jsxs('span', {
      className: 'flex items-center gap-1.5 flex-wrap',
      children: [
        jsx('span', { className: 'text-(--ui-text-quaternary)', children: 'Context' }),
        jsx('span', { className: 'text-(--ui-text-secondary)', children: `v=${BUILD}` }),
        jsx('span', { className: 'text-(--ui-text-secondary)', children: `fu=${fuStr}` }),
        jsx('span', { className: 'text-(--ui-text-secondary)', children: `fsid=${fsid ?? 'null'}` }),
        jsx('span', { className: 'text-(--ui-text-secondary)', children: `tick=${tick}` })
      ]
    })
  })
}

export default {
  id: ID,
  name: 'Workspace Context',
  description: 'DIAGNOSTIC: introspect focusedUsage + focusedSessionId in the strip.',
  defaultEnabled: true,
  register(ctx) {
    ctx.register({ id: 'composer-strip', area: COMPOSER_AREAS.top, render: () => jsx(ContextStrip, {}) })
  }
}
