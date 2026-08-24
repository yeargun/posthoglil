import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { bundleOfficialAutocapture } from "../scripts/official-bundle.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilPath = resolve(root, process.env.POSTHOGLIL_AUTOCAPTURE_ARTIFACT ?? ".tmp/autocapture.dev.js")
const officialPath = resolve(root, ".tmp/official-autocapture.js")

globalThis.window = {
  location: { href: "https://app.example.test/dashboard?tab=one" },
  getComputedStyle(element) {
    return { getPropertyValue: (name) => (name === "cursor" ? element._cursor ?? "auto" : "") }
  },
}

mkdirSync(resolve(root, ".tmp"), { recursive: true })
writeFileSync(officialPath, await bundleOfficialAutocapture(root))
const official = await import(`${pathToFileURL(officialPath).href}?official-autocapture`)
const lil = await import(`${pathToFileURL(lilPath).href}?lil-autocapture`)

function text(value) {
  return { nodeType: 3, textContent: value, parentNode: null }
}

function element(tag, options = {}, children = []) {
  const attributes = { ...(options.attributes ?? {}) }
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: options.className ?? "",
    id: options.id ?? "",
    name: options.name ?? "",
    type: options.type ?? "",
    isContentEditable: options.isContentEditable ?? false,
    _cursor: options.cursor,
    childNodes: children,
    parentNode: options.parentNode ?? null,
    getAttribute(name) {
      if (name === "class" && !(name in attributes)) return this.className || null
      if (name === "type" && !(name in attributes)) return this.type || null
      return Object.hasOwn(attributes, name) ? attributes[name] : null
    },
    matches(selector) {
      if (selector.startsWith(".")) return String(this.className).split(/\s+/).includes(selector.slice(1))
      if (selector.startsWith("#")) return this.id === selector.slice(1)
      const attribute = /^\[([^\]]+)\]$/.exec(selector)
      if (attribute) return Object.hasOwn(attributes, attribute[1])
      return this.tagName.toLowerCase() === selector.toLowerCase()
    },
  }
  for (const child of children) child.parentNode = node
  return node
}

function attach(...nodes) {
  const body = element("body")
  let parent = body
  for (const node of nodes) {
    node.parentNode = parent
    parent = node
  }
  return nodes.at(-1)
}

function same(name, args) {
  const expected = official[name](...args)
  const actual = lil[name](...args)
  assert.deepEqual(actual, expected, name)
  return actual
}

describe("browser-common autocapture utility compatibility", () => {
  it("exports the complete pinned runtime surface and constants", () => {
    assert.deepEqual(Object.keys(lil).sort(), Object.keys(official).sort())
    same("splitClassString", [""])
    same("splitClassString", ["  alpha\tbeta  gamma "])
    same("getClassNames", [element("svg", { className: { baseVal: "icon active" } })])
    assert.deepEqual(lil.autocaptureCompatibleElements, official.autocaptureCompatibleElements)
    assert.deepEqual(
      lil.DEFAULT_CONTENT_IGNORELIST_WITH_STEPPERS,
      official.DEFAULT_CONTENT_IGNORELIST_WITH_STEPPERS,
    )
    assert.equal(lil.MAX_DOM_ANCESTOR_DEPTH, official.MAX_DOM_ANCESTOR_DEPTH)
  })

  it("matches sensitive-value filtering and safe text normalization", () => {
    const values = [
      null,
      undefined,
      "hello",
      "4111111111111111",
      "4111 1111 1111 1111",
      "not-a-valid-4111111111111112",
      "123-45-6789",
      "prefix 123-45-6789 suffix",
      "abc123-45-6789def",
      "378282246310005",
      "5 > 3",
    ]
    for (const value of values) {
      same("shouldCaptureValue", [value, true])
      same("shouldCaptureValue", [value, false])
    }
    for (const value of [null, undefined, " hello\n world ", "hello  4111111111111111 world", "a".repeat(300)]) {
      same("makeSafeText", [value])
    }
  })

  it("matches element sensitivity, direct text, and nested span text", () => {
    const rootNode = attach(
      element("div", { className: "shell" }),
      element("button", {}, [text(" Save "), element("span", {}, [text("now")])]),
    )
    for (const candidate of [
      rootNode,
      attach(element("div", { className: "ph-sensitive" }), element("span")),
      attach(element("input", { type: "password" })),
      attach(element("input", { name: "credit-card" })),
      attach(element("input", { type: "checkbox" })),
      attach(element("div", { attributes: { contenteditable: "true" } })),
    ]) {
      same("shouldCaptureElement", [candidate])
      same("isSensitiveElement", [candidate])
      same("getSafeText", [candidate])
    }
    same("getNestedSpanText", [rootNode])
    same("getDirectAndNestedSpanText", [rootNode])
    for (const candidate of [
      element("textarea"),
      element("input", { type: "email" }),
      element("input", { type: "button" }),
      element("div", { attributes: { contenteditable: "" } }),
      element("div"),
      null,
    ]) {
      same("isTextSelectionTarget", [candidate])
    }
  })

  it("matches DOM event, dead-click, rage-click, parent, and event-target decisions", () => {
    const link = attach(element("a", { attributes: { href: "/next" } }), element("span", {}, [text("Next")]))
    const button = attach(element("div", { cursor: "pointer" }), element("button", {}, [text("Save")]))
    const ignored = attach(element("div", { className: "ph-no-capture" }), element("span"))
    for (const candidate of [link, button, ignored, element("html"), null]) {
      same("shouldSkipDeadClick", [candidate])
      same("shouldCaptureDeadClick", [candidate, true])
      same("shouldCaptureRageclick", [candidate, true])
    }
    same("shouldCaptureRageclick", [button, { content_ignorelist: ["save"] }])
    same("shouldCaptureRageclick", [element("input", { type: "text" }), { ignore_text_selection: true }])
    same("shouldCaptureDomEvent", [button, { type: "click" }, undefined, false, undefined, undefined])
    same("shouldCaptureDomEvent", [button, { type: "change" }, undefined, false, undefined, undefined])
    same("shouldCaptureDomEvent", [button, { type: "click" }, { url_allowlist: ["example.test"] }, false, undefined, undefined])
    same("shouldCaptureDomEvent", [button, { type: "click" }, { css_selector_ignorelist: ["button"] }, false, undefined, undefined])
    same("shouldCaptureDomEvent", [button, { type: "focus" }, {}, true, ["focus"], undefined])
    same("getParentElement", [button])
    same("getParentElement", [element("div")])
    const shadowTarget = element("span")
    same("getEventTarget", [{ target: button }])
    same("getEventTarget", [{ target: { shadowRoot: {} }, composedPath: () => [shadowTarget] }])
    same("getEventTarget", [{ target: undefined, srcElement: link }])
  })

  it("matches Angular attributes and the legacy elements-chain serialization", () => {
    for (const name of ["_ngcontent-ab1", "_nghost-x", "ngcontent", "data-id"]) {
      same("isAngularStyleAttr", [name])
    }
    const cases = [
      [],
      [{ tag_name: "button", attr__class: "primary wide", nth_child: 2, $el_text: "Save" }],
      [
        {
          tag_name: "a",
          attr__class: ["z", "a"],
          attr__href: "https://example.test/path",
          attr__id: "go",
          attr__title: 'A "quoted" title',
          nth_of_type: 3,
        },
        { tag_name: "span", attr__data_x: "1" },
      ],
    ]
    for (const elements of cases) {
      const officialInput = structuredClone(elements)
      const lilInput = structuredClone(elements)
      assert.equal(lil.getElementsChainString(lilInput), official.getElementsChainString(officialInput))
      assert.deepEqual(lilInput, officialInput)
    }
  })
})
