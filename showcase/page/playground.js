// Live lab: both builds of a submodule run here, on your input. Left is the input, right is the
// selected build's output and whether it equals the other build's.
const appleVendor = ua => /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Android|Edg/.test(ua) ? 'Apple Computer, Inc.' : ''
const quiet = {info() {}, warn() {}, error() {}, debug() {}}
const withoutTimes = value => JSON.parse(JSON.stringify(value, (key, v) => /UnixNano$/.test(key) ? undefined : v))
const coercers = api => [new api.DOMExceptionCoercer(), new api.PromiseRejectionEventCoercer(), new api.ErrorEventCoercer(), new api.ErrorCoercer(), new api.EventCoercer(), new api.ObjectCoercer(), new api.StringCoercer(), new api.PrimitiveCoercer()]

const labs = {
  'user-agent': {
    title: 'Browser, OS and device detection',
    note: 'detectBrowser, detectBrowserVersion, detectOS, detectDevice and detectDeviceType, as posthog-js computes $browser, $os and $device_type for every event.',
    samples: {
      'Chrome · Windows': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'Safari · iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
      'Firefox · Linux': 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
      'Samsung · Android': 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
      'Edge · macOS': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
    },
    run: (api, input) => {
      const ua = input.trim(), vendor = appleVendor(ua)
      return {browser: api.detectBrowser(ua, vendor), browserVersion: api.detectBrowserVersion(ua, vendor), os: api.detectOS(ua), device: api.detectDevice(ua), deviceType: api.detectDeviceType(ua)}
    },
  },
  'feature-flags': {
    title: 'Feature flag responses',
    note: 'normalizeFlagsResponse on a /flags response, in the current (flags) or the older (featureFlags) format.',
    samples: {
      'current format': JSON.stringify({flags: {'new-dashboard': {key: 'new-dashboard', enabled: true, variant: null, reason: {code: 'condition_match', condition_index: 0}, metadata: {id: 1, version: 3, payload: '{"color":"orange"}'}}, 'pricing-test': {key: 'pricing-test', enabled: true, variant: 'annual', reason: {code: 'condition_match'}, metadata: {id: 2, version: 1}}, 'beta-api': {key: 'beta-api', enabled: false, variant: null, reason: {code: 'no_condition_match'}, metadata: {id: 3, version: 2}}}, errorsWhileComputingFlags: false, requestId: 'a1b2'}, null, 2),
      'older format': JSON.stringify({featureFlags: {'new-dashboard': true, 'pricing-test': 'annual'}, featureFlagPayloads: {'new-dashboard': '{"color":"orange"}'}}, null, 2),
    },
    run: (api, input) => {const r = api.normalizeFlagsResponse(JSON.parse(input)); return {featureFlags: r.featureFlags, featureFlagPayloads: r.featureFlagPayloads, flags: r.flags}},
  },
  'error-tracking': {
    title: 'Exception capture',
    note: 'An Error with this stack, through ErrorPropertiesBuilder with posthog-js’s coercers and the default stack parser: the $exception_list the SDK sends.',
    samples: {
      'Chrome stack': "TypeError: Cannot read properties of undefined (reading 'map')\n    at FileTable (https://app.example.com/static/main.4f2a.js:2:184031)\n    at renderWithHooks (https://app.example.com/static/vendor.9c1e.js:2:61293)\n    at beginWork (https://app.example.com/static/vendor.9c1e.js:2:75866)",
      'Firefox stack': 'FileTable@https://app.example.com/static/main.4f2a.js:2:184031\nrenderWithHooks@https://app.example.com/static/vendor.9c1e.js:2:61293\nbeginWork@https://app.example.com/static/vendor.9c1e.js:2:75866',
      'Safari stack': 'FileTable@https://app.example.com/static/main.4f2a.js:2:184031\nrenderWithHooks@https://app.example.com/static/vendor.9c1e.js:2:61293\n[native code]',
    },
    run: (api, input) => {
      const error = new Error("Cannot read properties of undefined (reading 'map')")
      error.name = 'TypeError'
      error.stack = input
      return new api.ErrorPropertiesBuilder(coercers(api), api.createDefaultStackParser()).buildFromUnknown(error)
    },
  },
  'autocapture-utils': {
    title: 'Autocapture DOM utilities',
    note: 'shouldCaptureValue (card numbers and social security numbers are never captured), makeSafeText and splitClassString on the value autocapture would read.',
    samples: {
      'button text': 'Sign up for the beta',
      'card number': '4111 1111 1111 1111',
      'SSN': '123-45-6789',
      'class list': '  btn   btn-primary  ph-no-capture ',
    },
    run: (api, input) => ({shouldCaptureValue: api.shouldCaptureValue(input), makeSafeText: api.makeSafeText(input), splitClassString: api.splitClassString(input)}),
  },
  'metrics': {
    title: 'Metrics client',
    note: 'Samples recorded on a PostHogMetrics client, then drainWindow(): the OTLP payload it would send (timestamps differ between runs and are left out of the comparison).',
    samples: {
      'mixed samples': JSON.stringify([{type: 'count', name: 'page.loaded', value: 1, attributes: {route: '/pricing'}}, {type: 'histogram', name: 'api.latency_ms', value: 182, attributes: {endpoint: '/flags'}}, {type: 'histogram', name: 'api.latency_ms', value: 97, attributes: {endpoint: '/flags'}}, {type: 'gauge', name: 'queue.depth', value: 4}], null, 2),
    },
    run: (api, input) => {
      const host = {isDisabled: false, optedOut: false, getLibraryId: () => 'web', getLibraryVersion: () => '1.435.8'}
      const metrics = new api.PostHogMetrics(host, api.resolveMetricsConfig({flushIntervalMs: 600000}), quiet)
      for (const sample of JSON.parse(input)) metrics[sample.type](sample.name, sample.value, {attributes: sample.attributes})
      const payload = metrics.drainWindow()
      metrics.reset()
      return payload
    },
    compare: withoutTimes,
  },
  'uuidv7': {
    title: 'UUIDv7 ids',
    note: 'uuidv7() and uuid7ToTimestampMs(): each build generates its own random ids, so they are compared by format, not value.',
    samples: {'one id': '1', 'five ids': '5', 'twenty ids': '20'},
    run: (api, input) => Array.from({length: Math.max(1, Math.min(100, parseInt(input, 10) || 1))}, () => {const id = api.uuidv7(); return {id, timestamp: new Date(api.uuid7ToTimestampMs(id)).toISOString()}}),
    compare: value => value.map(item => ({id: /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item.id), when: Math.abs(Date.parse(item.timestamp) - Date.now()) < 60000})),
  },
  'gzip': {
    title: 'Request compression',
    note: 'gzipCompress through the browser’s CompressionStream, as posthog-js compresses request bodies.',
    races: 25,
    samples: {
      'event batch': JSON.stringify(Array.from({length: 12}, (_, i) => ({event: i % 3 ? '$pageview' : '$autocapture', properties: {$current_url: `https://app.example.com/files/${i}`, $browser: 'Chrome', $os: 'Windows', distinct_id: 'user_42', $lib: 'web'}})), null, 1),
      'short text': 'hello, PostHog',
    },
    run: async (api, input) => {const blob = await api.gzipCompress(input, false); return {inputBytes: new TextEncoder().encode(input).length, gzipBytes: blob ? blob.size : null, type: blob ? blob.type : null, supported: api.isGzipSupported()}},
  },
}

const root = document.querySelector('#playground-root')
const order = ['user-agent', 'feature-flags', 'error-tracking', 'autocapture-utils', 'metrics', 'uuidv7', 'gzip']
root.innerHTML = `<div class="play-toolbar">
  <label>module <select id="lab-module">${order.map(id => `<option value="${id}">${labs[id].title}</option>`).join('')}</select></label>
  <label><input type="radio" name="lab-build" value="lilscript" checked /> LilScript</label>
  <label><input type="radio" name="lab-build" value="posthog" /> PostHog’s build</label>
  <button type="button" id="race">race</button>
  <span id="race-out"></span>
</div>
<div class="samples" id="lab-samples"></div>
<div class="play-grid"><textarea id="lab-input" spellcheck="false" aria-label="Input"></textarea><pre id="lab-output" aria-live="polite"></pre></div>
<p class="lab-note" id="lab-note"></p>`

const builds = {}
const load = id => builds[id] ??= Promise.all([import(`./files/lilscript/brotli/${id}.mjs`), import(`./files/upstream/terser-upstream/${id}.mjs`)]).then(([lilscript, posthog]) => ({lilscript, posthog}))
const select = root.querySelector('#lab-module'), input = root.querySelector('#lab-input'), output = root.querySelector('#lab-output')
const note = root.querySelector('#lab-note'), raceOut = root.querySelector('#race-out'), raceButton = root.querySelector('#race')
// Pretty JSON, with arrays of numbers kept on one line.
const show = value => JSON.stringify(value, (key, v) => typeof v === 'bigint' ? `${v}n` : Array.isArray(v) && v.length && v.every(x => typeof x === 'number') ? `\u0000[${v.join(', ')}]\u0000` : v, 2).replace(/"\\u0000(.*?)\\u0000"/g, '$1')
let generation = 0

async function run() {
  const id = select.value, lab = labs[id], mine = ++generation
  const which = root.querySelector('input[name="lab-build"]:checked').value
  try {
    const {lilscript, posthog} = await load(id)
    const [a, b] = await Promise.all([lab.run(lilscript, input.value), lab.run(posthog, input.value)])
    if (mine !== generation) return
    const compare = lab.compare ?? (value => value)
    const same = show(compare(a)) === show(compare(b))
    output.classList.remove('error')
    output.textContent = show(which === 'lilscript' ? a : b)
    note.textContent = `${same ? '✓ Same output from both builds.' : '✗ The builds disagree on this input.'} ${lab.note}`
  } catch (error) {
    if (mine !== generation) return
    output.classList.add('error')
    output.textContent = String(error && error.message || error)
    note.textContent = lab.note
  }
}

function pick(id) {
  if (!labs[id]) return
  select.value = id
  const samples = labs[id].samples
  root.querySelector('#lab-samples').innerHTML = Object.keys(samples).map(name => `<button type="button" data-sample="${name}">${name}</button>`).join('')
  input.value = Object.values(samples)[0]
  raceButton.textContent = `race ${labs[id].races ?? 200}×`
  raceOut.textContent = ''
  run()
}

root.querySelector('#lab-samples').addEventListener('click', event => {
  const button = event.target.closest('[data-sample]')
  if (!button) return
  input.value = labs[select.value].samples[button.dataset.sample]
  run()
})
select.addEventListener('change', () => pick(select.value))
input.addEventListener('input', run)
for (const radio of root.querySelectorAll('input[name="lab-build"]')) radio.addEventListener('change', run)
raceButton.addEventListener('click', async () => {
  const id = select.value, lab = labs[id], times = lab.races ?? 200
  const {lilscript, posthog} = await load(id)
  raceOut.textContent = 'racing…'
  const time = async api => {const start = performance.now(); for (let i = 0; i < times; i++) await lab.run(api, input.value); return performance.now() - start}
  await time(lilscript); await time(posthog)
  const lil = await time(lilscript), ph = await time(posthog)
  raceOut.textContent = `LilScript ${lil.toFixed(1)} ms · PostHog ${ph.toFixed(1)} ms (${times} runs; one browser, not a benchmark)`
})
window.addEventListener('module-selected', event => {if (labs[event.detail]) pick(event.detail)})
pick(labs[new URLSearchParams(window.location.search).get('module')] ? new URLSearchParams(window.location.search).get('module') : 'user-agent')
