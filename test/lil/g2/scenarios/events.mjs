// Event property bags across user agents, and the URL helpers behind them.
const UAS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.67",
  "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko",
  "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPad; CPU OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; U; Android 4.0.3; ko-kr; LG-L160L Build/IML74K) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30",
  "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0",
  "Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54 OPR/5 Mini",
  "Mozilla/5.0 (BlackBerry; U; BlackBerry 9900; en) AppleWebKit/534.11+ (KHTML, like Gecko) Version/7.1.0.346 Mobile Safari/534.11+",
  "Mozilla/5.0 (BB10; Touch) AppleWebKit/537.10+ (KHTML, like Gecko) Version/10.0.9.2372 Mobile Safari/537.10+",
  "Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Mobile Safari/537.36 Edge/15.14977",
  "Mozilla/5.0 (compatible; MSIE 10.0; Windows Phone 8.0; Trident/6.0; IEMobile/10.0; ARM; Touch; NOKIA; Lumia 920)",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/31.0 SamsungBrowser/4.0 Chrome/120 VR Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaBrowser/24.1.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Whale/3.25 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 Ddg/17.4",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.5",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/400.0]",
  "Mozilla/5.0 (Linux; U; Android 8.1.0; en-US; Redmi 5A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/57.0.2987.108 UCBrowser/13.4.0.1306 Mobile Safari/537.36",
  "Mozilla/5.0 (X11; Linux) KHTML/4.9.1 (like Gecko) Konqueror/4.9",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Goanna/6.5 Firefox/102.0 PaleMoon/32.4.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0 Waterfox/G6.0.5",
  "Mozilla/5.0 (Nintendo Switch; WifiWebAuthApplet) AppleWebKit/606.4 (KHTML, like Gecko) NF/6.0.1.15.4 NintendoBrowser/5.1.0.20393",
  "Mozilla/5.0 (PlayStation 5 3.11) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edge/44.18363.8131",
  "Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.1.1 like Chrome/120.0.6099.230 Safari/537.36",
  "Mozilla/5.0 (Linux; U; en-us; KFAPWI Build/JDQ39) AppleWebKit/535.19 (KHTML, like Gecko) Silk/3.13 Safari/535.19 Silk-Accelerated=true",
  "Mozilla/5.0 (Linux; Android 4.4.2; Kobo Touch) AppleWebKit/537.36 (KHTML, like Gecko)",
  "Mozilla/5.0 (Watch; watch os,7.1, like Mac OS X) AppleWebKit/605",
  "Mozilla/5.0 (iPod touch; CPU iPhone OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 GSA/15.3",
  "Mozilla/5.0 (Windows NT 10.0; ARM; Tablet PC) Gecko",
  "Mozilla/5.0 (Linux; ZTE Blade) AppleWebKit/537.36 Mobile",
  "curl/8.4.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Brave/1.60 Safari/537.36",
  "x".repeat(1200),
]
export const cases = [
  ...UAS.map((ua, i) => ({
    name: "ua " + i,
    env: { navigator: { userAgent: ua, vendor: i % 3 === 0 ? "Apple Computer, Inc." : "", language: i % 2 ? "de-DE" : undefined, maxTouchPoints: i % 4, brave: i === 42 ? {} : undefined, userAgentData: i % 5 === 0 ? { platform: "Android" } : undefined }, screen: { width: 800 + i, height: 1200 }, devicePixelRatio: 1 + (i % 3) },
    run: async (sut, env) => {
      env.record("props", sut.eventOp("eventProps", i % 2 === 0, i % 3 === 0 ? ["utm_source", "custom_param"] : undefined, i % 4 === 0 ? true : undefined, i % 5 === 0))
    },
  })),
  {
    name: "url helpers",
    env: { url: "https://shop.example.co.uk/p/items?utm_source=goog&utm_campaign=spring%20sale&gclid=abc123&custom=1&li_fat_id=L1#section?x=1", referrer: "https://www.bing.com/search?q=posthog+analytics&p=yahoo", cookies: ["li_fat_id=cookie-li"] },
    run: async (sut, env) => {
      env.record("campaign", sut.eventOp("campaign", ["custom"], false, undefined))
      env.record("campaign-masked", sut.eventOp("campaign", undefined, true, ["custom", "utm_source"]))
      env.record("person", sut.eventOp("personInfo", false, undefined, false))
      env.record("person-masked", sut.eventOp("personInfo", true, ["custom"], true))
      env.record("initial", sut.eventOp("initialPerson", { r: "https://duckduckgo.com/?q=x", u: "https://a.example.com/x?utm_medium=cpc&gclid=g#h" }, true))
      env.record("initial-direct", sut.eventOp("initialPerson", { r: "$direct", u: undefined }, false))
      env.record("initial-none", sut.eventOp("initialPerson", {}, false))
      env.record("referrer", sut.eventOp("referrer"))
      env.record("search", sut.eventOp("search"))
      for (const [u, p] of [["https://x.com/?a=1&b=2&a=3", "a"], ["https://x.com/?a=%E0%A4%A&b", "a"], ["https://x.com/??q=hello+world", "q"], ["https://x.com/#?q=hash", "q"], ["https://x.com/?q=a=b=c", "q"], ["no-query", "q"], ["https://x.com/?q", "q"]]) env.record("query", sut.eventOp("query", u, p))
      for (const u of ["https://x.com/?gclid=1&keep=2#frag", "https://x.com/path", "https://x.com/?a?b?gclid=3", "", undefined, "https://x.com/#h1#h2"]) env.record("mask", sut.eventOp("mask", u, ["gclid", "b"], "<masked>"))
    },
  },
  {
    name: "search engines",
    env: { referrer: "https://search.yahoo.com/search?p=posthog+docs&q=wrong" },
    run: async (sut, env) => { env.record("search", sut.eventOp("search")); env.record("referrer", sut.eventOp("referrer")) },
  },
  {
    name: "no referrer",
    env: { referrer: "" },
    run: async (sut, env) => { env.record("search", sut.eventOp("search")); env.record("referrer", sut.eventOp("referrer")); env.record("person", sut.eventOp("personInfo", false, undefined, false)) },
  },
]
