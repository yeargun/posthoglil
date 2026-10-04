import {renderComparison} from './objective-comparison.js'
import {cardHtml, speedHtml, escape} from './views.js'

const index = await fetch('./modules/index.json').then(response => {if (!response.ok) throw Error('Module index could not load'); return response.json()})
const cache = new Map()
const load = id => {if (!cache.has(id)) cache.set(id, fetch(`./modules/${id}/comparison.json`).then(response => response.json())); return cache.get(id)}

async function select(id, updateUrl) {
  const entry = index.modules.find(module => module.id === id) ?? index.modules[0]
  for (const button of document.querySelectorAll('#stack-tabs button')) button.setAttribute('aria-selected', String(button.dataset.id === entry.id))
  const data = await load(entry.id)
  renderComparison(data)
  document.querySelector('#stack-detail').innerHTML = cardHtml(data)
  document.querySelector('#speed-root').innerHTML = speedHtml(data)
  for (const label of document.querySelectorAll('[data-module-label]')) label.textContent = data.title
  if (updateUrl) {
    const url = new URL(window.location.href)
    if (entry.id === 'all') url.searchParams.delete('module'); else url.searchParams.set('module', entry.id)
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }
  window.dispatchEvent(new CustomEvent('module-selected', {detail: entry.id}))
}

const tabs = document.querySelector('#stack-tabs')
tabs.innerHTML = index.modules.map((module, i) => `<button type="button" role="tab" data-id="${escape(module.id)}" aria-selected="${i === 0}">${escape(module.tab)}</button>`).join('')
tabs.addEventListener('click', event => {const button = event.target.closest('button[data-id]'); if (button) select(button.dataset.id, true)})

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-copy]')
  if (!button) return
  await navigator.clipboard.writeText(button.dataset.copy)
  button.textContent = 'copied'
  window.setTimeout(() => {button.textContent = 'copy'}, 1200)
})
const bar = document.querySelector('.progress')
const progress = () => {const max = document.documentElement.scrollHeight - window.innerHeight; bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`}
window.addEventListener('scroll', progress, {passive: true}); progress()

const requested = new URLSearchParams(window.location.search).get('module')
if (requested && requested !== 'all') await select(requested, false)
else for (const button of document.querySelectorAll('#stack-tabs button')) button.setAttribute('aria-selected', String(button.dataset.id === 'all'))
if (document.querySelector('#playground-root')) await import('./playground.js')
