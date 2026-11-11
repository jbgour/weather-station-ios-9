var R = LyonRadar;
function check(value, message) { if (!value) { throw new Error(message); } }
function rejected(fn) { var failed = false; try { fn(); } catch (ignore) { failed = true; } check(failed, "Expected rejection"); }
var now = 1794397200, past = [], i;
for (i = 0; i < 13; i += 1) { past.push({ time: now - (12 - i) * 600, path: "/v2/radar/frame" + i }); }
var manifest = { host: R.HOST, radar: { past: past, nowcast: [{ time: now + 600, path: "/v2/radar/future" }] } };
var frames = R.framesFrom(manifest, now);
check(frames.length === 7, "Bound retained frames");
check(frames[0].time === now - 3600 && frames[6].time === now, "Past hour, no future data");
check(R.tileURL(frames[0]).indexOf("https://tilecache.rainviewer.com/v2/radar/frame6/512/7/45.75/4.85/") === 0, "High-resolution tile, provider zoom remains 7");
check(R.providerZoom(0.25) === 5 && R.providerZoom(0.5) === 6 && R.providerZoom(4) === 7, "Wider views select wider provider tiles");
check(R.tileURL(frames[0], 5).indexOf("/512/5/45.75/4.85/") > 0, "Wide radar tile");
check(R.coverageURL(6).indexOf("/512/6/45.75/4.85/") > 0, "Coverage matches provider zoom");
rejected(function () { R.tileURL(frames[0], 8); });
rejected(function () { R.coverageURL(8); });
var center = R.project(45.75, 4.85);
check(center[0] === 256 && center[1] === 256, "Lyon at image center");
check(R.project(45.85, 4.85)[1] < 256, "North is up");
check(R.project(45.75, 4.95)[0] > 256, "East is right");
check(R.project(45.75, 4.85, 4)[0] === 256 && R.project(45.75, 4.85, 4)[1] === 256, "Zoom keeps Lyon centered");
check(Math.abs((R.project(45.75, 4.95, 4)[0] - 256) / (R.project(45.75, 4.95)[0] - 256) - 4) < 0.000001, "Labels and radar share the zoom scale");
rejected(function () { R.framesFrom({ host: "https://unexpected.example", radar: { past: past } }, now); });
rejected(function () { R.tileURL({ path: "/v2/radar/../../unexpected" }); });
rejected(function () { R.framesFrom({ host: R.HOST, radar: { past: [] } }, now); });
rejected(function () { R.framesFrom({ host: R.HOST, radar: { past: [{ time: now + 3600, path: "/v2/radar/future" }] } }, now); });
/* Nowcast: synthetic rain cells moving by a known amount per 10 minutes. */
var N = LyonNowcast, size = N.SIZE;
function field(cells) {
  var f = new Array(size * size), x, y, i, c, d;
  for (i = 0; i < f.length; i += 1) { f[i] = 0; }
  for (i = 0; i < cells.length; i += 1) {
    c = cells[i];
    for (y = 0; y < size; y += 1) { for (x = 0; x < size; x += 1) {
      d = Math.sqrt(Math.pow(x - c[0], 2) + Math.pow(y - c[1], 2));
      if (d < c[2]) { f[y * size + x] = Math.max(f[y * size + x], 1 - d / c[2]); }
    } }
  }
  return f;
}
function cellsAt(step) { return [[20 + 3 * step, 30 - 2 * step, 7], [40 + 3 * step, 40 - 2 * step, 5], [12 + 3 * step, 50 - 2 * step, 4]]; }
var moved = N.estimateShift(field(cellsAt(0)), field(cellsAt(1)), size, N.RADIUS);
check(moved && Math.abs(moved.dx - 3) < 0.3 && Math.abs(moved.dy + 2) < 0.3 && moved.score > 0.9, "Shift follows the rain motion");
check(N.estimateShift(field([]), field(cellsAt(1)), size, N.RADIUS) === null, "No motion estimate without rain");
var samples = [0, 1, 2].map(function (step) { return { time: 1000 + step * 600, field: field(cellsAt(step)) }; });
var motion = N.velocity(samples, size, N.RADIUS);
check(motion && motion.seconds === 1200, "Widest usable pair gives the most precise motion");
check(Math.abs(motion.x * 600 * size - 3) < 0.2 && Math.abs(motion.y * 600 * size + 2) < 0.2, "Velocity per 10 minutes in pixels");
var fast = [0, 1, 2].map(function (step) { return { time: 1000 + step * 600, field: field([[16 + 5 * step, 32, 6]]) }; });
check(N.velocity(fast, size, N.RADIUS).seconds === 600, "Falls back to a closer pair when motion exceeds the search radius");
check(N.velocity([samples[0]], size, N.RADIUS) === null, "Needs two frames");
var steps = N.forecastSteps(2200, motion);
check(steps.length === 6 && steps[0].time === 2800 && steps[5].lead === 3600, "Six 10-minute steps up to one hour");
check(Math.abs(steps[5].x * size - 18) < 1.2, "Offsets grow linearly with lead time");
check(N.forecastSteps(2200, null).length === 0, "No forecast without motion");
var rgba = [0, 0, 0, 255, 9, 9, 9, 0, 0, 0, 0, 51, 0, 0, 0, 0];
check(N.intensity(rgba, 2)[0] === 1 && N.intensity(rgba, 2)[1] === 0 && Math.abs(N.intensity(rgba, 2)[2] - 0.2) < 1e-6, "Alpha is the rain intensity");
print("PASS radar: frame bounds, past-only timeline, projection, URL validation and nowcast motion");
