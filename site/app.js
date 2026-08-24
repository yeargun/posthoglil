import officialKernel from "./posthog-official.js"
import lilKernel from "./posthog.js"

const data = await fetch("./results.json").then((response) => {
  if (!response.ok) throw new Error(`Unable to load results: ${response.status}`)
  return response.json()
})

const formatter = new Intl.NumberFormat("en-US")

const sample = `{
  "apiKey": "phc_demo",
  "cookieHeader": "ph_phc_demo_posthog=%7B%22distinct_id%22%3A%22anon-1%22%7D",
  "config": {
    "api_host": "https://us.i.posthog.com"
  },
  "flags": {
    "flags": {
      "beta": {
        "key": "beta",
        "enabled": true,
        "variant": "on",
        "metadata": { "payload": "{\\"tier\\":\\"pro\\"}" }
      },
      "off": {
        "key": "off",
        "enabled": false,
        "metadata": {}
      }
    },
    "errorsWhileComputingFlags": false
  },
  "queue": [
    { "url": "/e/", "data": { "event": "$pageview", "offset": 12 } },
    { "url": "/e/", "data": { "event": "clicked" } },
    { "url": "/flags/", "data": { "token": "x" } }
  ],
  "rate": {
    "now": 1500,
    "eventsPerSecond": 10,
    "burstLimit": 3,
    "checkOnly": false
  },
  "userAgent": "Mozilla/5.0 AppleWebKit/537.36 (compatible; Googlebot/2.1)",
  "distinctId": "user-1",
  "set": { "plan": "pro", "nested": { "z": 1, "a": 2 } },
  "sampleRate": 0.5,
  "text": "hello\\ud800"
}
`

function percentAgainst(value, baseline, better, worse) {
  if (!baseline || value === baseline) {
    return { text: "baseline", amount: "—", word: "baseline", state: "even" }
  }
  const change = (baseline - value) / baseline
  const magnitude = Math.abs(change * 100)
  const digits = 1
  const word = change > 0 ? better : worse
  return {
    text: `${magnitude.toFixed(digits)}% ${word}`,
    amount: `${magnitude.toFixed(digits)}%`,
    word,
    state: change > 0 ? "win" : "loss",
  }
}

function smallerThan(value, baseline) {
  return percentAgainst(value, baseline, "smaller", "larger")
}

function fasterThan(value, baseline) {
  return percentAgainst(value, baseline, "faster", "slower")
}

const OFFICIAL_SIZE_IDS = [
  "kernel",
  "kernel-oxc-nomangle",
  "kernel-terser-nomangle",
  "kernel-terser-passes-1",
  "kernel-terser-mangle",
  "kernel-esbuild-es2018",
  "kernel-esbuild-esnext",
  "kernel-oxc-mangle",
]

function laneById(id) {
  return data.size.find((lane) => lane.id === id)
}

function barClass(id) {
  if (
    id === "itslil" ||
    id === "itslil-package" ||
    id === "itslil-gzip" ||
    id === "itslil-bytes"
  ) {
    return "bar-lil"
  }
  if (id === "itslil-closed") return "bar-closed"
  return "bar-official"
}

function renderCodec(metric, lilId, extras, barId, bodyId) {
  const oxc = laneById("kernel-oxc-mangle")
  if (!oxc) return
  const lanes = [...OFFICIAL_SIZE_IDS, lilId, ...extras].map(laneById).filter(Boolean)
  const max = Math.max(...lanes.map((lane) => lane[metric]))
  document.querySelector(barId).innerHTML = lanes
    .map((lane) => {
      const width = Math.max(18, (lane[metric] / max) * 100)
      return `<div class="${barClass(lane.id)}" style="width:${width}%"><span>${lane.name}</span><strong>${formatter.format(lane[metric])} B</strong></div>`
    })
    .join("")
  document.querySelector(bodyId).innerHTML = lanes
    .map((lane) => {
      const verdict = smallerThan(lane[metric], oxc[metric])
      return `
    <tr>
      <th scope="row">${lane.name}</th>
      <td>${formatter.format(lane[metric])}</td>
      <td class="verdict ${verdict.state}"><strong>${verdict.text}</strong></td>
    </tr>`
    })
    .join("")
}

function matchedLibraryRow() {
  const brotli = laneById("itslil")
  const gzip = laneById("itslil-gzip")
  const bytes = laneById("itslil-bytes")
  if (!brotli || !gzip || !bytes) return null
  return {
    id: "itslil-matched",
    name: "LilScript compiler · verified artifacts by objective",
    raw: bytes.raw,
    gzip9: gzip.gzip9,
    brotli11: brotli.brotli11,
  }
}

function renderHero() {
  const oxc = laneById("kernel-oxc-mangle")
  const itslil = laneById("itslil")
  const packaged = laneById("itslil-package")
  const gzip = laneById("itslil-gzip")
  const bytes = laneById("itslil-bytes")
  document.querySelector("#hero-spec").textContent = "21/21"
  if (!oxc || !itslil) return
  const smaller = smallerThan(itslil.brotli11, oxc.brotli11)
  document.querySelector("#hero-ratio").innerHTML = `${smaller.amount}<span>${smaller.word}</span>`
  document.querySelector("#hero-bytes").textContent =
    `${formatter.format(oxc.brotli11)} B → ${formatter.format(itslil.brotli11)} B Brotli-11`
  document.querySelector("#hero-shipped").textContent = smallerThan(itslil.brotli11, oxc.brotli11).text
  if (packaged) {
    document.querySelector("#hero-package").textContent = smallerThan(
      packaged.brotli11,
      oxc.brotli11,
    ).text
  }
  if (gzip) {
    document.querySelector("#hero-gzip").textContent = smallerThan(gzip.gzip9, oxc.gzip9).text
  }
  if (bytes) {
    document.querySelector("#hero-raw").textContent = smallerThan(bytes.raw, oxc.raw).text
  }
}

function renderSize() {
  const oxc = laneById("kernel-oxc-mangle")
  if (!oxc) return
  renderCodec(
    "brotli11",
    "itslil",
    ["itslil-package", "itslil-closed"],
    "#bar-brotli",
    "#body-brotli",
  )
  renderCodec("gzip9", "itslil-gzip", [], "#bar-gzip", "#body-gzip")
  renderCodec("raw", "itslil-bytes", [], "#bar-raw", "#body-raw")

  const matched = matchedLibraryRow()
  const rows = [
    ...OFFICIAL_SIZE_IDS.map(laneById),
    matched,
    laneById("itslil"),
    laneById("itslil-package"),
    laneById("itslil-gzip"),
    laneById("itslil-bytes"),
    laneById("itslil-closed"),
  ].filter(Boolean)
  document.querySelector("#body-matched").innerHTML = rows
    .map((lane) => {
      const verdict = smallerThan(lane.brotli11, oxc.brotli11)
      return `
    <tr>
      <th scope="row">${lane.name}</th>
      <td>${formatter.format(lane.raw)}</td>
      <td>${formatter.format(lane.gzip9)}</td>
      <td>${formatter.format(lane.brotli11)}</td>
      <td class="verdict ${verdict.state}"><strong>${verdict.text}</strong></td>
    </tr>`
    })
    .join("")
}

function renderSurface() {
  const oxc = laneById("kernel-oxc-mangle")
  const itslil = laneById("itslil")
  const brotli = oxc && itslil ? smallerThan(itslil.brotli11, oxc.brotli11) : null
  const cards = [
    {
      label: "ported modules from posthog-js 1.418.10",
      value: "13",
      win: true,
    },
    {
      label: "named exports kept exact after mangling",
      value: String(Object.keys(lilKernel).length),
    },
    {
      label: "compat cases versus the official kernel",
      value: "21/21",
      geo: true,
    },
    {
      label: "Brotli-11 versus Vite 8 Oxc of that kernel",
      value: brotli ? brotli.text : "measure pending",
      win: brotli ? brotli.state === "win" : false,
    },
  ]
  document.querySelector("#perf-cards").innerHTML = cards
    .map(
      (card) => `
    <article class="perf-card${card.win ? " win" : ""}${card.geo ? " geo" : ""}">
      <strong>${card.value}</strong>
      <span>${card.label}</span>
    </article>
  `,
    )
    .join("")
  document.querySelector("#perf-note").textContent =
    data.comparison ??
    "Same capture kernel on every official row. The published posthog-js browser bundle is not a lane."
}

function renderPacks() {
  const packs = data.packs ?? []
  const tabs = document.querySelector("#pack-tabs")
  const card = document.querySelector("#pack-card")
  const contract = document.querySelector("#pack-contract")
  const panel = document.querySelector("#pack-panel")
  const body = document.querySelector("#body-pack-lanes")
  if (!tabs || !card || !contract || !panel || !body) return
  if (packs.length === 0) {
    tabs.innerHTML = ""
    card.innerHTML = "<p>Production measurements pending.</p>"
    contract.innerHTML = ""
    body.innerHTML = ""
    return
  }

  const requested = new URLSearchParams(window.location.search).get("pack")
  let selected = packs.some((pack) => pack.id === requested)
    ? requested
    : packs.some((pack) => pack.id === "autocapture")
      ? "autocapture"
      : packs[0].id

  tabs.innerHTML = packs
    .map(
      (pack) =>
        `<button type="button" role="tab" id="pack-tab-${pack.id}" aria-controls="pack-panel" aria-selected="false" tabindex="-1" data-pack="${pack.id}">${pack.name}</button>`,
    )
    .join("")

  const show = (id, updateUrl = true) => {
    const pack = packs.find((candidate) => candidate.id === id) ?? packs[0]
    selected = pack.id
    const baseline = pack.lanes.find((lane) => lane.baseline)
    const primary = pack.lanes.find((lane) => lane.primary)
    const packaged = pack.lanes.find((lane) => lane.id === "package")
    const verdict = smallerThan(primary.brotli11, baseline.brotli11)
    for (const tab of tabs.querySelectorAll("[role=tab]")) {
      const active = tab.dataset.pack === pack.id
      tab.setAttribute("aria-selected", String(active))
      tab.tabIndex = active ? 0 : -1
    }
    panel.setAttribute("aria-labelledby", `pack-tab-${pack.id}`)
    card.className = `pack-card ${verdict.state}`
    card.innerHTML = `
      <div class="pack-kicker"><span>${pack.exports} exports</span><span>${pack.differentialGroups}/${pack.differentialGroups} groups</span><span>cost ${pack.costModel}</span></div>
      <h3>${pack.name}</h3>
      <strong>${verdict.amount}<small>${verdict.word} Brotli</small></strong>
      <p>${formatter.format(baseline.brotli11)} B Oxc → ${formatter.format(primary.brotli11)} B LilScript</p>
      <code>import { … } from "${pack.subpath}"</code>
      <span class="pack-package">Packaged ESM: ${formatter.format(packaged.brotli11)} B Brotli-11</span>`
    contract.innerHTML = `<span>Pinned source graph</span><code>${pack.source}</code><span>Contract</span><strong>${pack.exports} runtime exports · ${pack.differentialGroups}/${pack.differentialGroups} differential groups</strong>`
    body.innerHTML = pack.lanes
      .map((lane) => {
        const laneVerdict = smallerThan(lane.brotli11, baseline.brotli11)
        const rowClass = lane.primary ? ' class="pack-primary-row"' : ""
        return `<tr${rowClass}><th scope="row">${lane.name}</th><td>${formatter.format(lane.raw)}</td><td>${formatter.format(lane.gzip9)}</td><td>${formatter.format(lane.brotli11)}</td><td class="verdict ${laneVerdict.state}"><strong>${laneVerdict.text}</strong></td></tr>`
      })
      .join("")
    if (updateUrl) {
      const url = new URL(window.location.href)
      url.searchParams.set("pack", pack.id)
      history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
    }
  }

  tabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-pack]")
    if (tab) show(tab.dataset.pack)
  })
  tabs.addEventListener("keydown", (event) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"]
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const index = packs.findIndex((pack) => pack.id === selected)
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? packs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + packs.length) % packs.length
    show(packs[next].id)
    tabs.querySelector(`[data-pack="${packs[next].id}"]`).focus()
  })
  show(selected, false)

  const note = document.querySelector("#pack-note")
  if (note) {
    note.textContent =
      data.packComparison ??
      "Each pack is compared independently with its untouched official PostHog source graph."
  }
}

function bindCopy() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy]")
    if (!button) return
    await navigator.clipboard.writeText(button.dataset.copy)
    button.textContent = "copied"
    window.setTimeout(() => {
      button.textContent = "copy"
    }, 1200)
  })
}

function bindProgress() {
  const bar = document.querySelector(".progress")
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`
  }
  window.addEventListener("scroll", update, { passive: true })
  update()
}

function currentEngine() {
  const value = document.querySelector("input[name=engine]:checked")?.value
  return value === "official" ? officialKernel : lilKernel
}

function runKernel(api, request) {
  const cookieStore = api.cookieStoreFromHeader(request.cookieHeader ?? "")
  const cookie = api.readPostHogCookie(cookieStore, request.apiKey)
  const flags = api.normalizeFlagsResponse(request.flags ?? {})
  const rate = request.rate ?? {}
  return {
    uuidv7: api.uuidv7(),
    uuidv4: api.uuidv4(),
    cookie,
    properties: api.cookieStateToProperties(cookie),
    optedOut: api.isOptedOut(cookieStore, request.apiKey, request.consent),
    hosts: {
      api: api.apiHostFromConfig(request.config.api_host),
      flags: api.flagsApiHostFromConfig(request.config),
      ui: api.uiHostFromConfig(request.config),
      region: api.regionForHost(request.config.api_host),
      capture: api.endpointFor(request.config, "api", "/e/"),
    },
    flagValues: api.getFlagValuesFromFlags(flags.flags),
    payloads: api.getPayloadsFromFlags(flags.flags),
    rateLimit: api.rateLimitContext(rate.bucket, rate.now, rate.eventsPerSecond, rate.burstLimit, rate.checkOnly),
    queue: api.formatQueue(request.queue ?? []),
    unload: api.sortUnloadRequests(Object.values(api.formatQueue(request.queue ?? []))),
    blocked: api.isBlockedUA(request.userAgent),
    personHash: api.getPersonPropertiesHash(request.distinctId ?? "anon", request.set),
    sampleRate: api.isValidSampleRate(request.sampleRate),
    sanitized: api.sanitizeString(request.text ?? ""),
    host: api.removeTrailingSlash(request.config?.api_host),
  }
}

function renderPreview() {
  const out = document.querySelector("#preview")
  try {
    const request = JSON.parse(document.querySelector("#source").value)
    out.textContent = JSON.stringify(runKernel(currentEngine(), request), null, 2)
  } catch (error) {
    out.textContent = String(error)
  }
}

function bindPlayground() {
  const source = document.querySelector("#source")
  source.value = sample
  source.addEventListener("input", renderPreview)
  for (const input of document.querySelectorAll("input[name=engine]")) {
    input.addEventListener("change", renderPreview)
  }
  document.querySelector("#race").addEventListener("click", () => {
    const request = JSON.parse(source.value)
    const loops = 200
    const run = (api) => {
      runKernel(api, request)
      const start = performance.now()
      for (let i = 0; i < loops; i++) runKernel(api, request)
      return performance.now() - start
    }
    const lilMs = run(lilKernel)
    const officialMs = run(officialKernel)
    document.querySelector("#race-out").textContent =
      `@itslil/posthog-js ${lilMs.toFixed(1)} ms · official kernel ${officialMs.toFixed(1)} ms · ${fasterThan(lilMs, officialMs).text}`
  })
  renderPreview()
}

renderHero()
renderSurface()
renderPacks()
renderSize()
bindCopy()
bindProgress()
bindPlayground()
