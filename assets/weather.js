/* ES5 only: shared by Safari 9, the diagnostic page and offline tests. */
(function (root) {
  "use strict";
  var MINUTE = 60000;
  var REFRESH = 15 * MINUTE;
  var STALE = 60 * MINUTE;
  var CACHE_KEY = "lyon-weather-v1";
  var API_URL = "https://api.open-meteo.com/v1/forecast?latitude=45.75&longitude=4.85" +
    "&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m" +
    "&minutely_15=precipitation&forecast_minutely_15=8" +
    "&hourly=temperature_2m,weather_code,is_day,precipitation_probability,wind_speed_10m,wind_direction_10m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&forecast_days=4&timezone=Europe%2FParis&timeformat=unixtime" +
    "&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm";

  function number(value) { return typeof value === "number" && isFinite(value); }
  function pad(value) { return value < 10 ? "0" + value : String(value); }
  function lastSunday(year, month) {
    var last = new Date(Date.UTC(year, month + 1, 0));
    return last.getUTCDate() - last.getUTCDay();
  }
  function parisOffset(seconds) {
    var year = new Date(seconds * 1000).getUTCFullYear();
    var start = Date.UTC(year, 2, lastSunday(year, 2), 1) / 1000;
    var end = Date.UTC(year, 9, lastSunday(year, 9), 1) / 1000;
    return seconds >= start && seconds < end ? 7200 : 3600;
  }
  function parisDate(seconds) { return new Date((seconds + parisOffset(seconds)) * 1000); }
  function time(seconds) {
    if (!number(seconds)) { return "—"; }
    var date = parisDate(seconds);
    return pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes());
  }
  function dateKey(date) {
    return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate());
  }
  function calendarDay(seconds) {
    var date = parisDate(seconds);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
  }
  function updatedLabel(milliseconds) {
    var seconds = milliseconds / 1000;
    var date = parisDate(seconds);
    return pad(date.getUTCDate()) + "/" + pad(date.getUTCMonth() + 1) + " à " + time(seconds);
  }
  function temperature(value) { return number(value) ? Math.round(value) + "°" : "—"; }
  function probability(value) {
    return number(value) && value >= 0 && value <= 100 ? Math.round(value) + " %" : "—";
  }
  function amount(value) {
    if (!number(value) || value < 0) { return "—"; }
    if (value === 0) { return "0"; }
    if (value < 0.1) { return "< 0,1"; }
    return value.toFixed(1).replace(".", ",");
  }
  function wind(speed, direction) {
    if (!number(speed) || speed < 0) { return "—"; }
    var labels = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    return Math.round(speed) + " km/h" + (number(direction) ? " · " + labels[((Math.round(direction / 45) % 8) + 8) % 8] : "");
  }
  function windRotation(speed, direction) {
    if (!number(speed) || Math.round(speed) <= 0 || !number(direction) || direction < 0 || direction > 360) { return null; }
    /* Meteorological direction is the origin. Our upward arrow shows flow. */
    return (direction + 180) % 360;
  }
  function weather(code, isDay) {
    if (!number(code)) { return { icon: "unknown", label: "Conditions indisponibles" }; }
    if (code === 0) { return { icon: isDay === 0 ? "moon" : "sun", label: isDay === 0 ? "Ciel dégagé" : "Ensoleillé" }; }
    if (code === 1 || code === 2) { return { icon: isDay === 0 ? "cloud" : "partly", label: "Éclaircies" }; }
    if (code === 3) { return { icon: "cloud", label: "Couvert" }; }
    if (code === 45 || code === 48) { return { icon: "fog", label: "Brouillard" }; }
    if (code === 56 || code === 57 || code === 66 || code === 67) { return { icon: "rain", label: "Pluie verglaçante" }; }
    if (code === 51 || code === 53 || code === 55) { return { icon: "rain", label: "Bruine" }; }
    if (code === 61 || code === 63 || code === 65) { return { icon: "rain", label: "Pluie" }; }
    if (code === 80 || code === 81 || code === 82) { return { icon: "rain", label: "Averses" }; }
    if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) { return { icon: "snow", label: "Neige" }; }
    if (code === 95 || code === 96 || code === 99) { return { icon: "storm", label: "Orages" }; }
    return { icon: "unknown", label: "Conditions indisponibles" };
  }
  function array(value) { return Object.prototype.toString.call(value) === "[object Array]"; }
  function validSeries(series) {
    if (!series || !array(series.time) || !series.time.length) { return false; }
    var i;
    for (i = 0; i < series.time.length; i += 1) {
      if (!number(series.time[i]) || (i && series.time[i] <= series.time[i - 1])) { return false; }
    }
    return true;
  }
  function validData(data) {
    return !!(data && !data.error && data.current && number(data.current.time) &&
      (number(data.current.temperature_2m) || number(data.current.weather_code)) &&
      number(data.utc_offset_seconds) && Math.abs(data.utc_offset_seconds) <= 86400 &&
      validSeries(data.hourly) && validSeries(data.daily) && validSeries(data.minutely_15));
  }
  function at(series, key, index) {
    return series && array(series[key]) && number(series[key][index]) ? series[key][index] : null;
  }
  function indexAt(series, timestamp) {
    return series && array(series.time) ? series.time.indexOf(timestamp) : -1;
  }
  function rainSlots(data, nowSeconds) {
    var slots = [], end, index, value;
    /* The API value is a preceding-15-minute sum. Never move it forward. */
    for (end = Math.floor(nowSeconds / 900) * 900 + 900; end - 900 < nowSeconds + 3600; end += 900) {
      index = indexAt(data.minutely_15, end);
      value = at(data.minutely_15, "precipitation", index);
      slots.push({ start: end - 900, end: end, value: value !== null && value >= 0 ? value : null });
    }
    return slots;
  }
  function hourSlots(data, nowSeconds) {
    var slots = [], start = Math.ceil(nowSeconds / 3600) * 3600, i, timestamp, index;
    for (i = 0; i < 6; i += 1) {
      timestamp = start + i * 7200;
      index = indexAt(data.hourly, timestamp);
      slots.push({ time: timestamp, temperature: at(data.hourly, "temperature_2m", index),
        probability: at(data.hourly, "precipitation_probability", index),
        windSpeed: at(data.hourly, "wind_speed_10m", index), windDirection: at(data.hourly, "wind_direction_10m", index),
        condition: weather(at(data.hourly, "weather_code", index), at(data.hourly, "is_day", index)) });
    }
    return slots;
  }
  function daySlots(data, nowSeconds) {
    var slots = [], today = calendarDay(nowSeconds), days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    var i, j, wanted, index, date;
    for (i = 1; i <= 3; i += 1) {
      wanted = today + i * 86400;
      index = -1;
      for (j = 0; j < data.daily.time.length; j += 1) {
        /* Daily epoch labels use the response's fixed offset, including DST weeks. */
        date = new Date((data.daily.time[j] + data.utc_offset_seconds) * 1000);
        if (dateKey(date) === dateKey(new Date(wanted * 1000))) { index = j; break; }
      }
      slots.push({ label: i === 1 ? "Demain" : days[new Date(wanted * 1000).getUTCDay()],
        min: at(data.daily, "temperature_2m_min", index), max: at(data.daily, "temperature_2m_max", index),
        probability: at(data.daily, "precipitation_probability_max", index),
        condition: weather(at(data.daily, "weather_code", index), 1) });
    }
    return slots;
  }
  function isStale(receivedAt, now) { return !number(receivedAt) || now - receivedAt >= STALE || receivedAt - now > 5 * MINUTE; }

  function createClient(options) {
    var state = { data: null, receivedAt: null, loading: false, error: false, errorDetails: null };
    var lastAttempt = null;
    var storage = options.storage;
    var now = options.now;
    var changed = options.changed || function () {};
    function restore() {
      var cached;
      try {
        cached = storage && JSON.parse(storage.getItem(CACHE_KEY));
        if (cached && cached.version === 1 && number(cached.receivedAt) && cached.receivedAt <= now() + 5 * MINUTE && validData(cached.data)) {
          state.data = cached.data;
          state.receivedAt = cached.receivedAt;
        }
      } catch (ignore) { /* Private mode / corrupt cache: carry on without storage. */ }
    }
    function refresh(force) {
      var timestamp = now(), xhr, finished = false, watchdog;
      if (state.loading) { return; }
      if (!force) {
        if (state.receivedAt !== null && timestamp >= state.receivedAt && timestamp - state.receivedAt < REFRESH) { return; }
        if (lastAttempt !== null && timestamp >= lastAttempt && timestamp - lastAttempt < MINUTE) { return; }
      }
      state.loading = true;
      state.errorDetails = null;
      lastAttempt = timestamp;
      changed(state);
      function finish(data, details) {
        if (finished) { return; }
        finished = true;
        options.clearTimeout(watchdog);
        state.loading = false;
        state.error = !data;
        state.errorDetails = data ? null : details;
        if (data) {
          state.data = data;
          state.receivedAt = now();
          try { if (storage) { storage.setItem(CACHE_KEY, JSON.stringify({ version: 1, data: data, receivedAt: state.receivedAt })); } } catch (ignore) { /* Memory remains available. */ }
        }
        changed(state);
      }
      function fail(kind, status, detail) {
        finish(null, { kind: kind, status: status || 0, detail: typeof detail === "string" ? detail.slice(0, 400) : "" });
      }
      try {
        xhr = new options.XMLHttpRequest();
        xhr.open("GET", API_URL, true);
        xhr.timeout = 20000;
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4 || finished) { return; }
          var data;
          if (xhr.status === 0) { fail("network"); return; }
          if (xhr.status < 200 || xhr.status >= 300) {
            try { data = JSON.parse(xhr.responseText); } catch (ignore) { data = null; }
            fail("http", xhr.status, data && data.reason ? data.reason : xhr.responseText);
            return;
          }
          try { data = JSON.parse(xhr.responseText); } catch (ignore) { fail("json", xhr.status); return; }
          if (!validData(data)) { fail("schema", xhr.status, data && data.reason); return; }
          finish(data);
        };
        xhr.onerror = function () { fail("network"); };
        xhr.ontimeout = function () { fail("timeout"); };
        xhr.onabort = function () { fail("abort"); };
        watchdog = options.setTimeout(function () { fail("timeout"); xhr.abort(); }, 20000);
        xhr.send();
      } catch (error) { fail("exception", 0, error.message); }
    }
    restore();
    return { state: state, refresh: refresh, tick: function () { changed(state); refresh(false); } };
  }
  root.LyonWeather = { API_URL: API_URL, CACHE_KEY: CACHE_KEY, number: number, time: time, parisOffset: parisOffset,
    calendarDay: calendarDay, updatedLabel: updatedLabel, temperature: temperature, probability: probability,
    amount: amount, wind: wind, windRotation: windRotation, weather: weather, validData: validData, rainSlots: rainSlots,
    hourSlots: hourSlots, daySlots: daySlots, isStale: isStale, createClient: createClient };
}(typeof window !== "undefined" ? window : this));
