(function (root) {
  "use strict";
  /* Client-side nowcast: estimate one overall rain motion from recent radar frames and
     extrapolate the latest frame along it. Rain is moved, never created, grown or weakened. */
  /* Motion is measured on provider zoom 6 tiles (about 440 km wide, more rain to track than the
     zoom 7 view) downsampled to 128 px, about 3.4 km per pixel. */
  var SIZE = 128, ZOOM = 6, RADIUS = 8, STEP = 600, COUNT = 6;
  /* Minimum share of wet pixels and correlation for a usable motion estimate. */
  var MIN_WET = 0.002, MIN_SCORE = 0.3;
  function makeArray(length) { return typeof Float32Array !== "undefined" ? new Float32Array(length) : new Array(length); }
  /* RainViewer tiles are transparent where dry; alpha is a reasonable intensity proxy. */
  function intensity(rgba, size) {
    var result = makeArray(size * size), i;
    for (i = 0; i < size * size; i += 1) { result[i] = rgba[i * 4 + 3] / 255; }
    return result;
  }
  function wetShare(field) {
    var wet = 0, i;
    for (i = 0; i < field.length; i += 1) { if (field[i] > 0.05) { wet += 1; } }
    return wet / field.length;
  }
  /* Normalized cross-correlation of b against a shifted by (dx, dy), over their overlap. */
  function correlation(a, b, size, dx, dy) {
    var ab = 0, aa = 0, bb = 0, x, y, va, vb;
    for (y = Math.max(0, dy); y < Math.min(size, size + dy); y += 1) {
      for (x = Math.max(0, dx); x < Math.min(size, size + dx); x += 1) {
        va = a[(y - dy) * size + (x - dx)];
        vb = b[y * size + x];
        ab += va * vb; aa += va * va; bb += vb * vb;
      }
    }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
  }
  /* Sub-pixel peak from three samples around an integer maximum. */
  function refine(left, center, right) {
    var denominator = left - 2 * center + right;
    return denominator < 0 ? Math.max(-0.5, Math.min(0.5, (left - right) / (2 * denominator))) : 0;
  }
  function shrink(field, size) {
    var half = size / 2, result = makeArray(half * half), x, y, k;
    for (y = 0; y < half; y += 1) {
      for (x = 0; x < half; x += 1) {
        k = 2 * y * size + 2 * x;
        result[y * half + x] = (field[k] + field[k + 1] + field[k + size] + field[k + size + 1]) / 4;
      }
    }
    return result;
  }
  /* Best integer shift within a window around (cx, cy), limited to the search radius. */
  function search(a, b, size, cx, cy, reach, radius) {
    var best = { dx: 0, dy: 0, score: -1 }, scores = {}, dx, dy, score;
    for (dy = Math.max(-radius, cy - reach); dy <= Math.min(radius, cy + reach); dy += 1) {
      for (dx = Math.max(-radius, cx - reach); dx <= Math.min(radius, cx + reach); dx += 1) {
        score = correlation(a, b, size, dx, dy);
        scores[dx + "," + dy] = score;
        if (score > best.score) { best = { dx: dx, dy: dy, score: score }; }
      }
    }
    best.scores = scores;
    return best;
  }
  /* Shift (in pixels) that best maps field a onto field b, or null without enough rain.
     Coarse-to-fine: a half-resolution estimate narrows the full-resolution search, which keeps
     the cost low enough for an old iPad. */
  function estimateShift(a, b, size, radius) {
    if (wetShare(a) < MIN_WET || wetShare(b) < MIN_WET) { return null; }
    var coarse = size >= 64 ? estimateShift(shrink(a, size), shrink(b, size), size / 2, Math.ceil(radius / 2)) : null;
    var best = coarse ? search(a, b, size, Math.round(coarse.dx * 2), Math.round(coarse.dy * 2), 2, radius) : search(a, b, size, 0, 0, radius, radius);
    if (best.score < MIN_SCORE) { return null; }
    function at(x, y) { var value = best.scores[x + "," + y]; return value === undefined ? best.score : value; }
    return {
      dx: best.dx + refine(at(best.dx - 1, best.dy), best.score, at(best.dx + 1, best.dy)),
      dy: best.dy + refine(at(best.dx, best.dy - 1), best.score, at(best.dx, best.dy + 1)),
      score: best.score
    };
  }
  /* Velocity in tile fractions per second from (time, field) samples, oldest first.
     Uses the widest pair for precision, as long as the motion stays within the search radius. */
  function velocity(samples, size, radius) {
    if (!samples || samples.length < 2) { return null; }
    var last = samples[samples.length - 1], first, shift, i, seconds;
    for (i = 0; i < samples.length - 1; i += 1) {
      first = samples[i];
      seconds = last.time - first.time;
      if (seconds <= 0 || seconds > 1800) { continue; }
      shift = estimateShift(first.field, last.field, size, radius);
      if (shift && Math.abs(shift.dx) < radius && Math.abs(shift.dy) < radius) {
        return { x: shift.dx / size / seconds, y: shift.dy / size / seconds, score: shift.score, seconds: seconds };
      }
    }
    return null;
  }
  /* Forecast steps after the latest observed frame: lead time and the tile-fraction offset. */
  function forecastSteps(latestTime, motion) {
    var steps = [], i, lead;
    if (!motion) { return steps; }
    for (i = 1; i <= COUNT; i += 1) {
      lead = i * STEP;
      steps.push({ time: latestTime + lead, lead: lead, x: motion.x * lead, y: motion.y * lead });
    }
    return steps;
  }
  function isDry(field) { return wetShare(field) < MIN_WET; }
  root.LyonNowcast = { SIZE: SIZE, ZOOM: ZOOM, RADIUS: RADIUS, STEP: STEP, COUNT: COUNT, intensity: intensity, isDry: isDry,
    estimateShift: estimateShift, velocity: velocity, forecastSteps: forecastSteps };
}(typeof window !== "undefined" ? window : this));
