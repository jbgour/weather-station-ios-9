/* Runs in Node and JavaScriptCore, without network or a browser. */
var W = LyonWeather;
var passed = 0;
function assert(condition, message) { if (!condition) { throw new Error(message); } }
function equal(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " != " + JSON.stringify(expected));
}
function test(name, fn) { fn(); passed += 1; print("OK " + name); }
function epoch(year, month, day, hour, minute) { return Date.UTC(year, month - 1, day, hour || 0, minute || 0) / 1000; }
/* Four days by default (like the old request); pass days for the ten-day response. */
function fixture(now, days) {
  var count = days || 4, base = Math.floor(now / 900) * 900, hours = Math.floor(now / 3600) * 3600, day = W.calendarDay(now), i;
  var data = { utc_offset_seconds: W.parisOffset(now),
    current: { time: base, temperature_2m: 12.4, apparent_temperature: 10.1, weather_code: 3, is_day: 1, wind_speed_10m: 9, wind_direction_10m: 225 },
    minutely_15: { time: [], precipitation: [] },
    hourly: { time: [], temperature_2m: [], weather_code: [], is_day: [], precipitation_probability: [], precipitation: [], wind_speed_10m: [], wind_direction_10m: [] },
    daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], precipitation_sum: [],
      wind_speed_10m_max: [], wind_gusts_10m_max: [], wind_direction_10m_dominant: [], uv_index_max: [], sunrise: [], sunset: [] } };
  for (i = 0; i < 8; i += 1) { data.minutely_15.time.push(base + i * 900); data.minutely_15.precipitation.push(i / 10); }
  for (i = 0; i < count * 24; i += 1) {
    data.hourly.time.push(hours + i * 3600); data.hourly.temperature_2m.push(10 + i % 10);
    data.hourly.weather_code.push(3); data.hourly.is_day.push(1); data.hourly.precipitation_probability.push(i % 101); data.hourly.precipitation.push((i % 4) / 10);
    data.hourly.wind_speed_10m.push(8 + i); data.hourly.wind_direction_10m.push(i * 45 % 360);
  }
  for (i = 0; i < count; i += 1) {
    data.daily.precipitation_sum.push(i * 1.5); data.daily.wind_speed_10m_max.push(20 + i); data.daily.wind_gusts_10m_max.push(40 + i);
    data.daily.wind_direction_10m_dominant.push(270); data.daily.uv_index_max.push(i); data.daily.sunrise.push(day + i * 86400 - data.utc_offset_seconds + 27000);
    data.daily.sunset.push(day + i * 86400 - data.utc_offset_seconds + 61200);
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
  equal(slots.length, 7, "seven cards");
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
test("Ten-day list starts today, skips absent days and never invents rain", function () {
  var now = epoch(2026, 11, 11, 10), data = fixture(now, 10), days = W.dayList(data, now);
  equal(days.length, 10, "ten days, today included");
  equal(days.slice(0, 3).map(function (d) { return d.label; }), ["Aujourd’hui", "Demain", "Vendredi"], "labels");
  equal([days[0].date, days[9].date], ["11 nov.", "20 nov."], "short dates");
  equal(days[9].offset, 9, "offset kept for taps");
  equal([days[2].max, days[2].precipitation, days[2].windMax, days[2].gustMax], [17, 3, 22, 42], "daily values");
  data.daily.precipitation_sum[3] = null; data.daily.precipitation_sum[4] = -1; data.daily.wind_gusts_10m_max[4] = "40";
  days = W.dayList(data, now);
  equal([days[3].precipitation, days[4].precipitation, days[4].gustMax], [null, null, null], "missing or invalid values stay unavailable");
  equal(W.dayList(fixture(now), now).length, 4, "short response lists what it has");
  equal(W.dayList(data, now + 86400).length, 9, "cached response moves forward without inventing a tenth day");
  equal(W.daySlots(data, now).map(function (d) { return d.offset; }), [1, 2, 3], "dashboard cards keep three days");
});
test("Day detail has eight three-hour slots, the full Paris day curve and three-hour rain", function () {
  var now = epoch(2026, 11, 11, 10), data = fixture(now, 10), day = W.dayDetail(data, now, 1), slot;
  equal(day.title, "Jeudi 12 novembre", "title");
  equal(day.slots.map(function (s) { return s.hour; }), [0, 3, 6, 9, 12, 15, 18, 21], "slot hours");
  equal(W.time(day.slots[0].time), "00:00", "Paris midnight");
  equal(day.curve.length, 24, "every hour for the curve");
  slot = day.slots[4];
  /* Hourly sums cover the preceding hour: 12-15 h uses the 13, 14 and 15 h samples. */
  var i13 = data.hourly.time.indexOf(slot.time + 3600);
  equal(slot.rain, Math.round((data.hourly.precipitation[i13] + data.hourly.precipitation[i13 + 1] + data.hourly.precipitation[i13 + 2]) * 100) / 100, "three-hour rain sum");
  data.hourly.precipitation[i13 + 1] = null;
  equal(W.dayDetail(data, now, 1).slots[4].rain, null, "one missing hour makes the block unavailable");
  equal([W.time(day.sunrise), W.time(day.sunset), W.duration(day.daylight)], ["07:30", "17:00", "9 h 30"], "sun times and daylight");
  equal(W.dayDetail(data, now, 0).slots.map(function (s) { return s.hour; }), [12, 15, 18, 21], "today only has the hours the response still covers");
  equal(W.dayDetail(data, now, 10), null, "beyond ten days");
  equal(W.dayDetail(data, now, -1), null, "negative offset");
  equal(W.dayDetail(data, now, 1.5), null, "fractional offset");
  equal(W.dayDetail(fixture(now), now, 6), null, "day missing from the response");
});
test("Day detail keeps eight distinct slots on DST change days", function () {
  var now = epoch(2026, 10, 24, 10), day = W.dayDetail(fixture(now, 10), now, 1);
  equal(day.curve.length, 25, "autumn day has 25 hours");
  equal(day.slots.map(function (s) { return s.hour; }), [0, 3, 6, 9, 12, 15, 18, 21], "autumn slots unique");
  now = epoch(2026, 3, 28, 10); day = W.dayDetail(fixture(now, 10), now, 1);
  equal(day.curve.length, 23, "spring day has 23 hours");
  equal(day.slots.map(function (s) { return s.hour; }), [0, 3, 6, 9, 12, 15, 18, 21], "spring slots");
});
test("Request asks for ten days and the detail fields in one call; cache format is versioned", function () {
  assert(W.API_URL.indexOf("forecast_days=10") > 0, "ten days");
  ["precipitation_sum", "wind_gusts_10m_max", "wind_direction_10m_dominant", "uv_index_max", "sunrise", "sunset", ",precipitation,"].forEach(function (field) {
    assert(W.API_URL.indexOf(field) > 0, "requests " + field);
  });
  equal(W.CACHE_KEY.slice(-3), ":v2", "cache key bumped");
  equal(W.CACHE_VERSION, 2, "cache version bumped");
});
test("UV and daylight labels", function () {
  equal([W.uv(0).label, W.uv(3).label, W.uv(6.4).label, W.uv(9).label, W.uv(11).label], ["Faible", "Modéré", "Élevé", "Très élevé", "Extrême"], "UV bands");
  equal([W.uv(null).value, W.uv(-1).value, W.uv("5").value], ["—", "—", "—"], "missing UV");
  equal([W.duration(null), W.duration(0), W.duration(34200)], ["—", "—", "9 h 30"], "daylight");
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
  equal([W.weather(0, 1).icon, W.weather(0, 0).icon, W.weather(2, 1).icon, W.weather(2, 0).icon, W.weather(3, 0).icon],
    ["sun", "moon", "partly", "partly-night", "cloud"], "day and night icons keep clear spells distinct from overcast");
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
test("Wind color thresholds match the displayed speed", function () {
  equal(W.windColor(0), "#b8d9bd", "calm");
  equal(W.windColor(9), "#b8d9bd", "weak");
  equal(W.windColor(10), "#e5cf86", "yellow starts at 10");
  equal(W.windColor(24), "#e5cf86", "yellow upper band");
  equal(W.windColor(25), "#edac72", "orange starts at 25");
  equal(W.windColor(39), "#edac72", "orange upper band");
  equal(W.windColor(40), "#ef8b83", "coral starts at 40");
  equal(W.windColor(75), "#ef8b83", "strong wind");
  equal(W.windColor(9.5), "#e5cf86", "displayed 10 uses yellow");
  equal(W.windColor(null), "#a6b6b9", "missing data is neutral");
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
