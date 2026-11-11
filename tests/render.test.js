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
  equal((h.ids["hourly-cards"].innerHTML.match(/class="hour-card"/g) || []).length, 6, "six hourly cards");
  equal((h.ids["hourly-cards"].innerHTML.match(/class="wind-arrow"/g) || []).length, 6, "six hourly wind arrows");
  assert(h.ids["current-wind"].innerHTML.indexOf("venant du SO") >= 0, "accessible wind origin");
  assert(h.ids["current-wind"].innerHTML.indexOf("rotate(45 12 12)") >= 0, "current wind blows northeast");
  equal((h.ids["daily-cards"].innerHTML.match(/class="day-card"/g) || []).length, 3, "three daily cards");
  assert(h.ids["updated-at"].textContent.indexOf("heure de Paris") >= 0, "timestamp explicit");
  equal(h.ids.refresh.disabled, false, "button restored");
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
  var h = appHarness(JSON.stringify({ version: 1, data: data, receivedAt: now - 7200000 }));
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
