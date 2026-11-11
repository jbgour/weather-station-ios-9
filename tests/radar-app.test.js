/* Radar page behavior with a fake DOM, canvas, network and clock. Runs in its own process
   (see scripts/test.py) because it replaces window and document globals. */
var passed = 0;
function check(condition, message) { if (!condition) { throw new Error("FAIL " + message); } }
function test(name, fn) { fn(); passed += 1; print("OK " + name); }

var els, timers, clock, seq, fieldMode, tileRequests;
var NOW = Math.floor(Date.now() / 600000) * 600;
function El(id) { this.id = id; this.style = {}; this.attrs = {}; this.childNodes = []; this.listeners = {}; this.textContent = ""; this.clientWidth = 1024; this.clientHeight = 692; }
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return this.attrs.hasOwnProperty(k) ? this.attrs[k] : null; };
El.prototype.addEventListener = function (t, f) { this.listeners[t] = f; };
El.prototype.appendChild = function (c) { this.childNodes.push(c); this.firstChild = this.childNodes[0]; return c; };
El.prototype.removeChild = function (c) { this.childNodes.splice(this.childNodes.indexOf(c), 1); this.firstChild = this.childNodes[0]; };
El.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: this.id === "timeline" ? 700 : 1024, height: 692 }; };
function el(id) { return els[id] || (els[id] = new El(id)); }

/* Synthetic rain: two cells moving +3 px right and 2 px up per 10-minute frame at 128 px. */
function rainAlpha(src) {
  var match = /frame(\d)/.exec(src), step = match ? parseInt(match[1], 10) : 0, size = 128, data = [], x, y, i, v, d, c;
  var cells = fieldMode === "dry" ? [] : [[14 + 3 * step, 40 - 2 * step, 7], [30 + 3 * step, 46 - 2 * step, 5]];
  for (i = 0; i < size * size * 4; i += 1) { data.push(0); }
  for (y = 0; y < size; y += 1) { for (x = 0; x < size; x += 1) {
    v = 0;
    for (c = 0; c < cells.length; c += 1) { d = Math.sqrt(Math.pow(x - cells[c][0], 2) + Math.pow(y - cells[c][1], 2)); if (d < cells[c][2]) { v = Math.max(v, 1 - d / cells[c][2]); } }
    data[(y * size + x) * 4 + 3] = Math.round(v * 255);
  } }
  return data;
}
var document = { hidden: false, body: new El("body"), documentElement: { clientWidth: 1024 },
  getElementById: el, querySelector: el, addEventListener: function () {},
  createElementNS: function (n, t) { return new El(t); },
  createElement: function (t) {
    var node = new El(t);
    node.tagName = t.toUpperCase();
    if (t === "canvas") { node.getContext = function () { var src = null; return {
      drawImage: function (image) { src = image.src; },
      getImageData: function () { if (fieldMode === "tainted") { throw new Error("SecurityError"); } return { data: rainAlpha(src) }; } }; }; }
    return node;
  } };
var window = this;
window.document = document; window.innerHeight = 748; window.innerWidth = 1024;
window.addEventListener = function () {}; window.setInterval = function () {};
window.requestAnimationFrame = function (fn) { fn(); return 1; };
window.setTimeout = function (fn, delay) { var t = { fn: fn, at: clock + (delay || 0), id: ++seq }; timers.push(t); return t.id; };
window.clearTimeout = function (id) { var i; for (i = 0; i < timers.length; i += 1) { if (timers[i].id === id) { timers.splice(i, 1); return; } } };
/* Images load asynchronously; paths containing "broken" fail. */
window.Image = function () {
  var image = this, src = "";
  Object.defineProperty(image, "src", { get: function () { return src; }, set: function (value) {
    src = value; tileRequests.push(value);
    window.setTimeout(function () { if (/broken/.test(value)) { if (image.onerror) { image.onerror(); } } else if (image.onload) { image.onload(); } }, 10);
  } });
};
window.XMLHttpRequest = function () {
  var xhr = this, past = [], i;
  for (i = 0; i < 7; i += 1) { past.push({ time: NOW - (6 - i) * 600, path: "/v2/radar/frame" + i + (i === 2 ? "broken" : "") }); }
  xhr.open = function () {}; xhr.abort = function () {};
  xhr.send = function () { window.setTimeout(function () { xhr.readyState = 4; xhr.status = 200; xhr.responseText = JSON.stringify({ host: LyonRadar.HOST, radar: { past: past } }); xhr.onreadystatechange(); }, 10); };
};
load("radar/places.js");
function runUntil(limit) {
  while (timers.length) {
    timers.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
    if (timers[0].at > limit) { return; }
    var t = timers.shift(); clock = t.at; t.fn();
  }
}
function boot(mode) {
  els = {}; timers = []; clock = 0; seq = 0; tileRequests = []; fieldMode = mode;
  document.body = new El("body");
  load("radar/app.js");
  runUntil(1000);
}
function touch(x, y) { return { clientX: x, clientY: y }; }
function gesture(touches) { return { touches: touches, target: el("map"), preventDefault: function () { this.prevented = true; } }; }
var W = LyonWeather;

test("Observed frames load, the failed one is skipped and the latest is shown", function () {
  boot("moving");
  var cells = el("timeline").childNodes;
  check(cells[2].disabled === true && cells[3].disabled === false, "failed frame disabled");
  check(el("frame-time").textContent === W.time(NOW) && /^(Il y a \d+ min|À l’instant)$/.test(el("frame-age").textContent), "latest frame time and age");
  check(/failed/.test(document.body.className) && el("status").textContent === "1 image indisponible", "partial failure reported");
  check(el("stage").style.width === "1024px" && el("stage").style.top === "-166px", "square stage covers the map");
  check(el("map-labels").childNodes.length > 0, "labels rendered");
});
test("Nowcast adds six forecast steps that shift the latest frame along the motion", function () {
  var cells = el("timeline").childNodes;
  check(cells.length === 13 && /forecast/.test(cells[7].className) && !/forecast/.test(cells[6].className), "7 observed + 6 forecast cells");
  check(tileRequests.filter(function (u) { return /\/512\/6\//.test(u); }).length === 3, "motion measured on three zoom 6 tiles");
  check(el("timeline-future").style.display === "block" && /selected/.test(cells[6].className), "dotted future track; starts on now");
  el("timeline").listeners.click({ target: cells[9] });
  var match = /translate\((-?[\d.]+)%,(-?[\d.]+)%\)/.exec(el("radar-image").style.transform);
  /* 3 px per 10 min at 128 px of the zoom 6 tile; the zoom 7 view doubles it: 4.6875 % per 10 min. */
  check(match && Math.abs(parseFloat(match[1]) - 14.06) < 1 && Math.abs(parseFloat(match[2]) + 9.375) < 1, "+30 min offset " + el("radar-image").style.transform);
  check(/frame6/.test(el("radar-image").src) && el("frame-age").textContent === "Prévu dans 30 min" && el("frame-time").textContent === W.time(NOW + 1800), "forecast labels");
  check(el("forecast-badge").style.display === "block" && parseFloat(el("radar-image").style.opacity) < 0.85, "badge and fading");
  el("timeline").listeners.click({ target: cells[5] });
  check(el("radar-image").style.transform === "none" && el("radar-image").style.opacity === "" && el("forecast-badge").style.display === "none", "observed frame resets the shift");
});
test("Playback and finger scrubbing cover observed and forecast frames", function () {
  var cells = el("timeline").childNodes, prevented = false;
  el("timeline").listeners.touchmove({ touches: [touch(5, 0)], preventDefault: function () { prevented = true; } });
  check(prevented && /selected/.test(cells[0].className), "scrub to first frame");
  el("timeline").listeners.touchmove({ touches: [touch(700 * 2.5 / 13, 0)], preventDefault: function () {} });
  check(/selected/.test(cells[0].className), "unavailable frame keeps the current one");
  el("timeline").listeners.click({ target: cells[6] });
  el("play").listeners.click();
  check(el("play").className === "play playing", "playing icon");
  check(/selected/.test(cells[7].className) && el("forecast-badge").style.display === "block", "playback steps from now into the forecast");
  runUntil(clock + 700);
  check(/selected/.test(cells[8].className), "next step after 700 ms");
  el("play").listeners.click();
  check(el("play").className === "play", "pause restores play icon");
});
test("Pan, pinch and buttons zoom within the radar square", function () {
  el("zoom-out").listeners.click(); el("zoom-in").listeners.click(); runUntil(clock + 1000);
  el("map").listeners.touchstart(gesture([touch(500, 300)]));
  el("map").listeners.touchmove(gesture([touch(600, 350)]));
  check(/translate3d\(100px,50px,0\) scale\(2\)/.test(el("map-content").style.transform), "live pan");
  el("map").listeners.touchend(gesture([]));
  check(el("map-content").style.transform === "translate(100px,50px) scale(2)" && el("map-labels").style.transform === "none", "committed pan");
  el("map").listeners.touchstart(gesture([touch(0, 0)])); el("map").listeners.touchmove(gesture([touch(5000, 5000)])); el("map").listeners.touchend(gesture([]));
  check(el("map-content").style.transform === "translate(512px,678px) scale(2)", "pan clamped to the square");
  el("map").listeners.touchstart(gesture([touch(462, 346), touch(562, 346)]));
  el("map").listeners.touchmove(gesture([touch(412, 346), touch(612, 346)]));
  el("map").listeners.touchend(gesture([])); runUntil(clock + 1000);
  check(el("map-content").style.transform === "translate(1024px,1356px) scale(4)" && el("zoom-label").textContent === "Métropole", "pinch zooms around the midpoint");
  el("map").listeners.touchstart(gesture([touch(112, 346), touch(912, 346)]));
  el("map").listeners.touchmove(gesture([touch(500, 346), touch(524, 346)]));
  el("map").listeners.touchend(gesture([])); runUntil(clock + 1000);
  check(el("basemap").src === "basemap-z5.svg" && el("zoom-out").disabled === true, "minimum zoom switches to wide tiles");
  check(el("timeline").childNodes.length === 13, "forecast recomputed after the zoom change");
  var button = el("zoom-in"); button.tagName = "BUTTON"; button.parentNode = el("map");
  el("map").listeners.touchstart({ touches: [touch(1000, 20)], target: button, preventDefault: function () { throw new Error("button tap captured"); } });
});
test("Back link stays inside the home-screen app", function () {
  var stopped = false;
  /* Node 21+ has a read-only global navigator, so define it instead of assigning. */
  function setNavigator(value) { Object.defineProperty(window, "navigator", { value: value, configurable: true, writable: true }); }
  el("back").href = "https://example.test/"; window.location = { href: "https://example.test/radar/" }; setNavigator({ standalone: true });
  el("back").listeners.click({ preventDefault: function () { stopped = true; } });
  check(stopped && window.location.href === "https://example.test/", "standalone navigation from script");
  setNavigator(undefined);
});
test("Dry radar gives a dry forecast without motion", function () {
  boot("dry");
  var cells = el("timeline").childNodes;
  check(cells.length === 13, "forecast steps present");
  el("timeline").listeners.click({ target: cells[12] });
  check(el("radar-image").style.transform === "translate(0%,0%)", "no shift");
});
test("Unreadable pixels drop only the forecast", function () {
  boot("tainted");
  check(el("timeline").childNodes.length === 7 && el("timeline-future").style.display === "none", "observed radar intact, no forecast");
  check(el("status").textContent === "1 image indisponible", "no extra error");
});
print("PASS radar page: " + passed + " tests");
