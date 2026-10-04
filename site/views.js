// Markup shared by the page script and the build (which prerenders the first view).
const number = new Intl.NumberFormat('en-US')
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const signed = p => `${p < 0 ? '−' : '+'}${Math.abs(p).toFixed(1)}%`
const state = verdict => verdict === 'faster' ? 'win' : verdict === 'slower' ? 'loss' : 'even'

// Browser timing: LilScript's shipped (Brotli) build against PostHog's, per workload.
export function speedHtml(module) {
  const rows = module.speed ?? []
  if (!rows.length) return '<p class="objective-note">Not measured yet.</p>'
  const withModule = module.id === 'all'
  const warm = rows.filter(row => row.name !== 'import'), imports = rows.filter(row => row.name === 'import')
  const count = (list, verdict) => list.filter(row => row.verdict === verdict).length
  const slowerList = warm.filter(row => row.verdict === 'slower').map(row => `${withModule ? row.module + ' · ' : ''}${row.label} ${signed(-row.improvementPercent)}`).join(', ')
  const slowerImports = imports.filter(row => row.verdict === 'slower').map(row => `${withModule ? row.module : 'import'} +${(row.lilMs - row.posthogMs).toFixed(2)} ms`).join(', ')
  return `<div class="speed-summary">
    <article><span>Faster</span><strong class="good">${count(warm,'faster')} of ${warm.length}</strong><small>warm workloads, interval entirely faster</small></article>
    <article><span>No clear difference</span><strong>${count(warm,'no clear difference')} of ${warm.length}</strong><small>interval includes zero</small></article>
    <article><span>Slower</span><strong>${count(warm,'slower')} of ${warm.length}</strong><small>${escape(slowerList || 'none')}</small></article>
    <article><span>Import slower</span><strong>${count(imports,'slower')} of ${imports.length}</strong><small>${escape(slowerImports || 'none')}</small></article>
  </div>
  <div class="table-wrap objective-table"><table><caption>LilScript (Brotli build) versus PostHog’s build, Chromium</caption><thead><tr>${withModule ? '<th>Module</th>' : ''}<th>Workload</th><th>PostHog’s build</th><th>LilScript</th><th>Time</th><th>95% interval</th><th>Verdict</th></tr></thead><tbody>${rows.map(row => `<tr>${withModule ? `<th scope="row">${escape(row.module)}</th>` : ''}<td class="desc"><strong>${escape(row.label)}</strong><small>${escape(row.description)}</small></td><td>${row.posthogMs.toFixed(3)} ms</td><td>${row.lilMs.toFixed(3)} ms</td><td class="verdict ${state(row.verdict)}">${signed(-row.improvementPercent)}</td><td>${signed(-row.ci[1])} … ${signed(-row.ci[0])}</td><td class="verdict ${state(row.verdict)}">${escape(row.verdict)}</td></tr>`).join('')}</tbody></table></div>`
}

// The module card under the pills: what it is, its tests, its files.
export function cardHtml(module) {
  const t = module.validation
  const tests = t ? `${t.checks === t.gated ? 'All ' : ''}${number.format(t.checks)} of ${number.format(t.gated)} upstream tests that pass against PostHog’s build pass against LilScript’s${t.files ? ` (${t.files} file${t.files === 1 ? '' : 's'})` : ''}.${t.neither ? ` ${number.format(t.neither)} more fail against both: their mocks reach private names PostHog’s build mangles.` : ''}` : '—'
  const files = module.id === 'all' ? `<a href="./evidence.json">evidence.json ↗</a>` : `<a href="${escape(module.files.posthog)}">PostHog’s build ↗</a><a href="${escape(module.files.lilscript)}">LilScript (Brotli) ↗</a>`
  return `<div class="stack-card" style="margin-top:56px">
    <div>
      <h3>${escape(module.title)}</h3>
      <p>${escape(module.description)}</p>
      <div class="stack-meta">${files}<a href="${escape(module.linksBase)}comparison.json">comparison.json ↗</a></div>
    </div>
    <div class="stack-detail-grid">
      <span>Upstream</span><code>${escape(module.upstreamPath)}</code>
      <span>Port</span><code>${escape(module.portPath)}</code>
      <span>Behaviour</span><strong class="${t && t.checks === t.gated ? 'good' : ''}">${escape(tests)}</strong>
      <span>Cells</span><strong>${module.wins} of ${module.cells} smaller</strong>
    </div>
  </div>`
}
