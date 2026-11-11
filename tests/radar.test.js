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
print("PASS radar: frame bounds, past-only timeline, projection and URL validation");
