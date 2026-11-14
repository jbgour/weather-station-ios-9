function appHarness(cached) {
  var ids = {}, requests = [], listeners = {}, timers = [];
  function node(id) {
    if (!ids[id]) { ids[id] = { textContent: "", innerHTML: "", attributes: {},
      setAttribute: function (key, value) { this.attributes[key] = value; },
      addEventListener: function (event, fn) { this[event] = fn; } }; }
    return ids[id];
  }
  function XHR() { requests.push(this); }
  XHR.prototype.open = function () {};
  XHR.prototype.send = function () {};
  XHR.prototype.respond = function (status, data) {
    this.status = status; this.readyState = 4; this.responseText = JSON.stringify(data); this.onreadystatechange();
  };
  var fakeDocument = { hidden: false, body: { className: "" }, documentElement: { style: {}, clientHeight: 768, clientWidth: 1024 }, getElementById: node,
    addEventListener: function (event, fn) { listeners[event] = fn; } };
  var fakeWindow = { LyonWeather: W, document: fakeDocument, innerHeight: 768, innerWidth: 1024, localStorage: memoryStorage(cached), XMLHttpRequest: XHR,
    setTimeout: function (fn) { timers.push(fn); return timers.length - 1; }, clearTimeout: function (id) { timers[id] = null; },
    setInterval: function (fn) { listeners.poll = fn; }, addEventListener: function (event, fn) { listeners[event] = fn; } };
  this.window = fakeWindow;
  load("assets/app.js");
  return { ids: ids, requests: requests, listeners: listeners, document: fakeDocument, window: fakeWindow };
}
test("Dashboard renders real values, rain intervals and all cards", function () {
  var h = appHarness(), now = new Date().getTime() / 1000, data = fixture(now);
  data.current.weather_code = 61;
  data.current.temperature_2m = -3.2;
  data.current.apparent_temperature = null;
  data.minutely_15.precipitation[1] = null;
  h.requests[0].respond(200, data);
  equal(h.ids["current-condition"].textContent, "Pluie", "condition");
  assert(h.ids["current-temperature"].innerHTML.indexOf("-3") === 0, "negative temperature");
  equal(h.ids["current-feels"].textContent, "—", "missing felt temperature");
  assert(h.ids["rain-slots"].innerHTML.indexOf('rain-chart missing') >= 0, "missing rain visible");
  equal((h.ids["hourly-cards"].innerHTML.match(/class="hour-card"/g) || []).length, 7, "seven hourly cards");
  equal((h.ids["hourly-cards"].innerHTML.match(/class="wind-arrow"/g) || []).length, 7, "seven hourly wind arrows");
  assert(h.ids["current-wind"].innerHTML.indexOf("venant du SO") >= 0, "accessible wind origin");
  assert(h.ids["current-wind"].innerHTML.indexOf("rotate(45 12 12)") >= 0, "current wind blows northeast");
  equal((h.ids["daily-cards"].innerHTML.match(/class="day-card"/g) || []).length, 3, "three daily cards");
  assert(h.ids["updated-at"].textContent.indexOf("heure de Paris") >= 0, "timestamp explicit");
  equal(h.ids.refresh.disabled, false, "button restored");
});
function tapTarget(day, time) {
  return { getAttribute: function (key) { return key === "data-day" ? day : key === "data-time" ? time : null; }, parentNode: null };
}
test("Day cards open an in-page detail; the 10-day list opens days with a back control", function () {
  var h = appHarness(), now = new Date().getTime() / 1000, data = fixture(now, 10);
  h.requests[0].respond(200, data);
  equal(h.ids.overlay.className || "", "", "sheet starts closed");
  h.ids["daily-cards"].click({ target: tapTarget("2") });
  equal(h.ids.overlay.className, "overlay open", "sheet open");
  equal(h.ids.overlay.attributes["aria-hidden"], "false", "sheet exposed");
  equal(h.ids.dashboard.attributes["aria-hidden"], "true", "dashboard hidden from assistive tech");
  equal(h.ids["sheet-title"].textContent, W.dayDetail(data, now, 2).title, "day title");
  equal((h.ids["sheet-body"].innerHTML.match(/class="detail-slot[ "]/g) || []).length, 8, "eight timeline columns");
  assert(h.ids["detail-curve"].innerHTML.indexOf("<svg") === 0, "temperature curve drawn");
  assert(h.ids["sheet-back"].className.indexOf("is-hidden") >= 0, "no back control from a card");
  h.ids["daily-cards"].click({ target: tapTarget("list") });
  equal((h.ids["sheet-body"].innerHTML.match(/class="list-row"/g) || []).length, 10, "ten rows");
  assert(h.ids["daily-cards"].innerHTML.indexOf('class="day-card more-card"') > 0, "ten-day card follows the three days");
  equal(h.ids["sheet-title"].textContent, "10 jours", "list title");
  h.ids["sheet-body"].click({ target: tapTarget("5") });
  equal(h.ids["sheet-title"].textContent, W.dayDetail(data, now, 5).title, "row opens its day");
  equal(h.ids["sheet-back"].className, "sheet-back", "back control visible");
  h.ids["sheet-back"].click();
  equal((h.ids["sheet-body"].innerHTML.match(/class="list-row"/g) || []).length, 10, "back to the list");
  h.ids["sheet-close"].click();
  equal(h.ids.overlay.className, "overlay", "closed");
  equal(h.ids.overlay.attributes["aria-hidden"], "true", "sheet hidden");
  h.ids["current-panel"].click({ target: tapTarget("0") });
  equal(h.ids.overlay.className, "overlay open", "current panel opens today");
  h.listeners.keydown({ keyCode: 27 });
  equal(h.ids.overlay.className, "overlay", "Escape closes");
  h.ids["daily-cards"].click({ target: tapTarget(null) });
  equal(h.ids.overlay.className, "overlay", "taps between cards do nothing");
});
test("Hourly cards are display only and never open the sheet", function () {
  var h = appHarness(), now = new Date().getTime() / 1000;
  h.requests[0].respond(200, fixture(now, 10));
  equal(h.ids["hourly-cards"].click, undefined, "no tap handler on the hourly row");
  equal(h.ids["hourly-cards"].innerHTML.indexOf("data-day") < 0 && h.ids["hourly-cards"].innerHTML.indexOf('role="button"') < 0, true, "no tappable markup");
  equal(h.ids.overlay.className === "overlay open", false, "sheet stays closed");
});
test("Day detail shows unavailable values as dashes and keeps untrusted values out of markup", function () {
  var h = appHarness(), now = new Date().getTime() / 1000, data = fixture(now, 10);
  data.daily.precipitation_sum[1] = null; data.daily.wind_gusts_10m_max[1] = null; data.daily.sunrise[1] = '<img src=x onerror="alert(1)">';
  data.daily.uv_index_max[1] = "<script>alert(1)</script>"; data.daily.weather_code[1] = "../../unexpected";
  h.requests[0].respond(200, data);
  h.ids["daily-cards"].click({ target: tapTarget("1") });
  var html = h.ids["sheet-body"].innerHTML;
  assert(html.indexOf("Cumul indisponible") >= 0, "missing daily rain is not zero");
  assert(html.indexOf("Rafales —") >= 0, "missing gusts");
  assert(html.indexOf("Durée du jour indisponible") >= 0, "no daylight without sunrise");
  assert(html.indexOf("<script") === -1 && html.indexOf("onerror") === -1 && html.indexOf("unexpected") === -1, "no injected markup or icon path");
  assert(html.indexOf("assets/unknown.svg") >= 0, "unknown daily weather icon");
  h.ids["daily-cards"].click({ target: tapTarget("list") });
  assert(h.ids["sheet-body"].innerHTML.indexOf("unexpected") === -1, "list icons allowlisted too");
});
test("Radar link stays inside the home-screen app and stays a plain link in Safari", function () {
  var h = appHarness(), prevented = false, event = { preventDefault: function () { prevented = true; } };
  h.ids["radar-link"].href = "https://example.test/radar/";
  h.window.location = { href: "https://example.test/" };
  h.ids["radar-link"].click(event);
  assert(!prevented && h.window.location.href === "https://example.test/", "Safari keeps native link navigation");
  h.window.navigator = { standalone: true };
  h.ids["radar-link"].click(event);
  assert(prevented && h.window.location.href === "https://example.test/radar/", "standalone mode navigates from script");
});
test("Dashboard first-load failure is explicit and manual refresh recovers", function () {
  var h = appHarness();
  h.requests[0].respond(503, {});
  equal(h.ids["current-condition"].textContent, "Météo indisponible", "empty state");
  assert(h.ids["rain-slots"].innerHTML.indexOf("Connexion impossible") >= 0, "helpful error");
  h.ids.refresh.click(); h.requests[1].respond(200, fixture(new Date().getTime() / 1000));
  equal(h.ids["current-condition"].textContent, "Couvert", "recovery");
});
test("Cached stale weather remains visible after network failure", function () {
  var now = new Date().getTime(), data = fixture(now / 1000);
  var h = appHarness(JSON.stringify({ version: W.CACHE_VERSION, data: data, receivedAt: now - 7200000 }));
  assert(h.document.body.className.indexOf("stale") >= 0, "old cache marked immediately");
  var before = h.ids["current-temperature"].innerHTML;
  h.requests[0].respond(500, {});
  equal(h.ids["current-temperature"].innerHTML, before, "keep visible temperature");
  assert(h.ids["connection-status"].textContent.indexOf("Données anciennes") === 0, "stale message");
  assert(h.listeners.pageshow && h.listeners.focus && h.listeners.online && h.listeners.visibilitychange && h.listeners.poll, "wake hooks installed");
});
test("Layout uses the visible height after fullscreen and toolbar changes", function () {
  var h = appHarness();
  equal(h.document.documentElement.style.fontSize, "7.68px", "fullscreen visible-height unit");
  h.window.innerHeight = 644;
  h.listeners.resize();
  equal(h.document.documentElement.style.fontSize, "6.44px", "toolbars reduce available height");
  h.window.innerHeight = 748;
  h.listeners.orientationchange();
  equal(h.document.documentElement.style.fontSize, "7.48px", "standalone height with status bar");
});
test("City names render as text rather than HTML", function () {
  var original = W.LOCATION.name;
  var payload = '<img src=x onerror="alert(1)">';
  W.LOCATION.name = payload;
  try {
    var h = appHarness();
    equal(h.ids["city-name"].textContent, payload, "literal city label");
    equal(h.ids["city-name"].innerHTML, "", "no HTML insertion");
    equal(h.document.title, payload + " · Météo", "literal document title");
  } finally { W.LOCATION.name = original; }
});
test("Untrusted weather strings cannot become markup or icon paths", function () {
  var h = appHarness(), data = fixture(new Date().getTime() / 1000);
  data.current.temperature_2m = '<img src=x onerror="alert(1)">';
  data.current.apparent_temperature = '<script>alert(1)</script>';
  data.hourly.weather_code[1] = '../../unexpected';
  h.requests[0].respond(200, data);
  equal(h.ids["current-temperature"].innerHTML, "—", "reject nonnumeric temperature");
  equal(h.ids["current-feels"].textContent, "—", "reject nonnumeric felt temperature");
  assert(h.ids["hourly-cards"].innerHTML.indexOf("unexpected") === -1, "icon paths are allowlisted");
});
test("Diagnostic API error details remain plain text", function () {
  var h = appHarness(), payload = '<img src=x onerror="alert(1)">';
  this.document = h.document;
  load("assets/diagnostic.js");
  h.requests[1].respond(400, { error: true, reason: payload });
  assert(h.ids["diagnostic-result"].textContent.indexOf(payload) >= 0, "error reason visible as text");
  equal(h.ids["diagnostic-result"].innerHTML, "", "never insert API reason as HTML");
  equal(h.ids["basic-api-request"].href, W.BASIC_API_URL, "diagnostic uses configured coordinates");
});
print("PASS: " + passed + " tests");
