// Scroll progress, and the submodule tabs: every panel is in the page; without script all show.
const bar = document.querySelector(".progress")
const progress = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight
  bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`
}
window.addEventListener("scroll", progress, { passive: true })
progress()

const tabs = [...document.querySelectorAll('[role="tab"][data-module]')]
const show = (id, updateUrl) => {
  const chosen = tabs.find((tab) => tab.dataset.module === id) ?? tabs[0]
  for (const tab of tabs) {
    const active = tab === chosen
    tab.setAttribute("aria-selected", String(active))
    tab.tabIndex = active ? 0 : -1
    document.getElementById(`panel-${tab.dataset.module}`).hidden = !active
  }
  if (updateUrl) {
    const url = new URL(window.location.href)
    url.searchParams.set("module", chosen.dataset.module)
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }
}
document.querySelector('[role="tablist"]')?.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-module]")
  if (tab) show(tab.dataset.module, true)
})
document.querySelector('[role="tablist"]')?.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
  event.preventDefault()
  const index = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true")
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
    : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
  show(tabs[next].dataset.module, true)
  tabs[next].focus()
})
show(new URLSearchParams(window.location.search).get("module"), false)
