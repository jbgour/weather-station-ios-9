/* Runs in Node and JavaScriptCore, without network or a browser. */
var W = LyonWeather;
var passed = 0;
function assert(condition, message) { if (!condition) { throw new Error(message); } }
function equal(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " != " + JSON.stringify(expected));
}
function test(name, fn) { fn(); passed += 1; print("OK " + name); }
function epoch(year, month, day, hour, minute) { return Date.UTC(year, month - 1, day, hour || 0, minute || 0) / 1000; }
function fixture(now) {
  var base = Math.floor(now / 900) * 900, hours = Math.floor(now / 3600) * 3600, day = W.calendarDay(now), i;
  var data = { utc_offset_seconds: W.parisOffset(now),
    current: { time: base, temperature_2m: 12.4, apparent_temperature: 10.1, weather_code: 3, is_day: 1, wind_speed_10m: 9, wind_direction_10m: 225 },
    minutely_15: { time: [], precipitation: [] },
    hourly: { time: [], temperature_2m: [], weather_code: [], is_day: [], precipitation_probability: [], wind_speed_10m: [], wind_direction_10m: [] },
    daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [] } };
  for (i = 0; i < 8; i += 1) { data.minutely_15.time.push(base + i * 900); data.minutely_15.precipitation.push(i / 10); }
  for (i = 0; i < 96; i += 1) {
    data.hourly.time.push(hours + i * 3600); data.hourly.temperature_2m.push(10 + i % 10);
    data.hourly.weather_code.push(3); data.hourly.is_day.push(1); data.hourly.precipitation_probability.push(i);
    data.hourly.wind_speed_10m.push(8 + i); data.hourly.wind_direction_10m.push(i * 45 % 360);
  }
  for (i = 0; i < 4; i += 1) {
    data.daily.time.push(day + i * 86400 - data.utc_offset_seconds); data.daily.weather_code.push(3);
    data.daily.temperature_2m_max.push(15 + i); data.daily.temperature_2m_min.push(5 + i); data.daily.precipitation_probability_max.push(i * 10);
  }
  return data;
}
test("Paris winter, summer and midnight, independent of device timezone", function () {
  equal(W.time(epoch(2026, 1, 2, 23, 30)), "00:30", "winter midnight");
  equal(W.time(epoch(2026, 7, 2, 23, 30)), "01:30", "summer midnight");
  equal(W.calendarDay(epoch(2026, 1, 2, 23, 30)), epoch(2026, 1, 3), "Paris calendar date");
});
test("Paris spring jump and repeated autumn hour", function () {
  equal(W.time(epoch(2026, 3, 29, 0, 59)), "01:59", "before spring");
  equal(W.time(epoch(2026, 3, 29, 1)), "03:00", "after spring");
  equal(W.time(epoch(2026, 10, 25, 0, 59)), "02:59", "before autumn");
  equal(W.time(epoch(2026, 10, 25, 1)), "02:00", "after autumn");
});
test("Rain sums belong to preceding interval, not the following one", function () {
  var now = epoch(2026, 11, 11, 10), data = fixture(now), slots = W.rainSlots(data, now);
  equal(slots.length, 4, "four at quarter boundary");
  equal(slots[0], { start: now, end: now + 900, value: 0.1 }, "ignore previous sum at now");
  equal(slots[3].end, now + 3600, "full hour");
});
test("Arbitrary wake time covers full next hour with five real intervals", function () {
  var now = epoch(2026, 11, 11, 10, 7), slots = W.rainSlots(fixture(now), now);
  equal(slots.length, 5, "five overlapping intervals");
  assert(slots[0].start < now && slots[4].end > now + 3600, "cover both edges");
  equal(slots[0].value, 0.1, "no invented prorating");
});
test("Missing, negative and old rainfall do not become zero", function () {
  var now = epoch(2026, 11, 11, 10), data = fixture(now);
  data.minutely_15.precipitation[1] = null; data.minutely_15.precipitation[2] = -1; data.minutely_15.precipitation[3] = 0;
  equal(W.rainSlots(data, now)[0].value, null, "missing");
  equal(W.rainSlots(data, now)[1].value, null, "invalid");
  equal(W.rainSlots(data, now)[2].value, 0, "real zero");
  equal(W.rainSlots(data, now + 86400)[0].value, null, "expired forecast");
});
test("Hourly forecasts use exact sample times across midnight", function () {
  var now = epoch(2026, 11, 11, 22, 45), slots = W.hourSlots(fixture(now), now);
  equal(slots.length, 6, "six cards");
  equal(W.time(slots[0].time), "00:00", "next full hour in Paris");
  equal(slots[1].time - slots[0].time, 7200, "two-hour spacing");
  equal(slots[0].probability, 1, "sample probability, no aggregation");
});
test("Three daily forecasts shift after midnight and preserve dates across DST", function () {
  var now = epoch(2026, 10, 24, 10), data = fixture(now), slots = W.daySlots(data, now);
  equal(slots.map(function (s) { return s.label; }), ["Demain", "Lundi", "Mardi"], "autumn labels");
  equal(slots.map(function (s) { return s.max; }), [16, 17, 18], "correct day indices");
  slots = W.daySlots(data, now + 86400);
  equal(slots[0].max, 17, "cached response moves to next day");
  equal(slots[2].max, null, "no invented fourth future day");
  now = epoch(2026, 3, 28, 10);
  equal(W.daySlots(fixture(now), now).map(function (s) { return s.max; }), [16, 17, 18], "spring labels");
});
test("Freshness and absent values", function () {
  equal(W.isStale(0, 3599999), false, "less than hour");
  equal(W.isStale(0, 3600000), true, "one hour");
  equal(W.isStale(600000, 0), true, "clock moved backwards");
  equal(W.temperature(null), "—", "missing temp"); equal(W.temperature(-2.2), "-2°", "negative temp");
  equal(W.probability(null), "—", "missing probability"); equal(W.probability(0), "0 %", "real zero probability");
  equal(W.amount(null), "—", "missing amount"); equal(W.amount(0), "0", "dry"); equal(W.amount(0.04), "< 0,1", "trace");
  equal(W.wind(null, 0), "—", "missing wind"); equal(W.wind(0, null), "0 km/h", "calm");
  equal(W.weather(null, 1).icon, "unknown", "missing weather is not sun");
});
test("Wind arrows show flow, and hourly wind follows the selected sample", function () {
  equal(W.windRotation(8, 0), 180, "northerly wind blows down");
  equal(W.windRotation(8, 90), 270, "easterly wind blows left");
  equal(W.windRotation(8, 180), 0, "southerly wind blows up");
  equal(W.windRotation(8, 270), 90, "westerly wind blows right");
  equal(W.windRotation(8, 360), 180, "360 is north");
  equal(W.windRotation(0, 180), null, "no direction for calm wind");
  equal(W.windRotation(null, 180), null, "missing speed");
  equal(W.windRotation(8, null), null, "missing direction");
  var now = epoch(2026, 11, 11, 10, 7), data = fixture(now), slots = W.hourSlots(data, now);
  equal(slots[0].windSpeed, 9, "next hourly speed");
  equal(slots[1].windDirection, 135, "two-hour direction");
  delete data.hourly.wind_speed_10m;
  delete data.hourly.wind_direction_10m;
  slots = W.hourSlots(data, now);
  equal(slots[0].windSpeed, null, "old cache without wind remains readable");
  equal(slots[0].windDirection, null, "old cache does not invent direction");
});
test("Reject malformed responses; allow missing individual values", function () {
  var data = fixture(epoch(2026, 11, 11, 10));
  assert(W.validData(data), "fixture valid");
  data.hourly.temperature_2m[0] = null;
  assert(W.validData(data), "null scalar is acceptable");
  assert(!W.validData({ error: true, reason: "bad query" }), "API error");
  assert(!W.validData({ current: { temperature_2m: 12 } }), "incomplete object");
  data.hourly.time[1] = data.hourly.time[0];
  assert(!W.validData(data), "unordered timestamps");
});
