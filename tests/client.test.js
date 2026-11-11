function harness(storage) {
  var currentTime = epoch(2026, 11, 11, 10) * 1000, requests = [], timers = [], changes = 0;
  function XHR() { requests.push(this); }
  XHR.prototype.open = function (method, url, async) { this.url = url; equal(method, "GET", "GET"); equal(async, true, "async"); };
  XHR.prototype.send = function () {};
  XHR.prototype.abort = function () { if (this.onabort) { this.onabort(); } };
  XHR.prototype.respond = function (status, data) {
    this.status = status; this.readyState = 4; this.responseText = typeof data === "string" ? data : JSON.stringify(data); this.onreadystatechange();
  };
  var client = W.createClient({ storage: storage || null, now: function () { return currentTime; }, XMLHttpRequest: XHR,
    setTimeout: function (fn) { timers.push(fn); return timers.length - 1; },
    clearTimeout: function (id) { timers[id] = null; }, changed: function () { changes += 1; } });
  return { client: client, requests: requests, timers: timers, advance: function (ms) { currentTime += ms; },
    now: function () { return currentTime; }, changes: function () { return changes; } };
}
function memoryStorage(value) {
  return { value: value || null, getItem: function () { return this.value; }, setItem: function (key, value) { this.value = value; } };
}
test("Initial success, no concurrent requests and 15-minute refresh", function () {
  var h = harness(), c = h.client;
  c.refresh(true); c.refresh(true); equal(h.requests.length, 1, "deduplicated");
  h.requests[0].respond(200, fixture(h.now() / 1000));
  assert(c.state.data && !c.state.loading && !c.state.error, "success");
  h.advance(14 * 60000); c.tick(); equal(h.requests.length, 1, "not due");
  h.advance(60000); c.tick(); equal(h.requests.length, 2, "due after wake");
});
test("Successful response persists; storage errors fall back to memory", function () {
  var storage = memoryStorage(), h = harness(storage);
  h.client.refresh(true); h.requests[0].respond(200, fixture(h.now() / 1000));
  equal(JSON.parse(storage.value).version, 1, "versioned cache");
  var restored = harness(storage);
  assert(restored.client.state.data, "cache restored");
  var denied = harness({ getItem: function () { throw new Error("denied"); }, setItem: function () { throw new Error("full"); } });
  denied.client.refresh(true); denied.requests[0].respond(200, fixture(denied.now() / 1000));
  assert(denied.client.state.data && !denied.client.state.error, "data available despite quota");
});
test("Bad cache ignored, stale cache retained, future cache rejected", function () {
  equal(harness(memoryStorage("{bad")).client.state.data, null, "invalid JSON");
  var now = epoch(2026, 11, 11, 10) * 1000, data = fixture(now / 1000);
  var old = harness(memoryStorage(JSON.stringify({ version: 1, data: data, receivedAt: now - 7200000 })));
  assert(old.client.state.data && W.isStale(old.client.state.receivedAt, now), "old data is available and stale");
  equal(harness(memoryStorage(JSON.stringify({ version: 1, data: data, receivedAt: now + 86400000 }))).client.state.data, null, "future cache");
});
test("Network failure keeps data and retries after cooldown", function () {
  var h = harness(), c = h.client;
  c.refresh(true); h.requests[0].respond(200, fixture(h.now() / 1000));
  var previous = c.state.data, received = c.state.receivedAt;
  h.advance(3600000); c.tick(); h.requests[1].onerror();
  assert(c.state.data === previous && c.state.receivedAt === received && c.state.error, "keep successful data");
  c.tick(); equal(h.requests.length, 2, "no rapid retries");
  h.advance(60000); c.tick(); equal(h.requests.length, 3, "retry");
  h.requests[2].respond(200, fixture(h.now() / 1000));
  assert(!c.state.error && !W.isStale(c.state.receivedAt, h.now()), "recovered");
});
test("First-load failure, HTTP errors and invalid JSON never create weather", function () {
  var failures = [[500, {}], [200, "not JSON"], [200, { error: true }], [200, {}]], i, h;
  for (i = 0; i < failures.length; i += 1) {
    h = harness(); h.client.refresh(true); h.requests[0].respond(failures[i][0], failures[i][1]);
    assert(h.client.state.error && !h.client.state.loading && h.client.state.data === null, "failure " + i);
  }
});
test("Watchdog releases a hung request and ignores late responses", function () {
  var h = harness(); h.client.refresh(true); h.timers[0]();
  assert(!h.client.state.loading && h.client.state.error, "timeout");
  equal(h.client.state.errorDetails.kind, "timeout", "timeout diagnostic");
  h.requests[0].respond(200, fixture(h.now() / 1000));
  equal(h.client.state.data, null, "late callback ignored");
  h.advance(60000); h.client.tick(); h.requests[1].respond(200, fixture(h.now() / 1000));
  assert(h.client.state.data && !h.client.state.error, "next request succeeds");
  equal(h.client.state.errorDetails, null, "clear diagnostics after recovery");
});
test("Diagnostics distinguish HTTP, network, JSON and schema failures", function () {
  var cases = [
    [400, { error: true, reason: "Invalid parameter" }, "http"],
    [0, "", "network"],
    [200, "not JSON", "json"],
    [200, {}, "schema"]
  ], i, h;
  for (i = 0; i < cases.length; i += 1) {
    h = harness(); h.client.refresh(true); h.requests[0].respond(cases[i][0], cases[i][1]);
    equal(h.client.state.errorDetails.kind, cases[i][2], "failure category");
    equal(h.client.state.errorDetails.status, cases[i][0], "HTTP status");
    if (i === 0) { equal(h.client.state.errorDetails.detail, "Invalid parameter", "API reason preserved"); }
  }
});
