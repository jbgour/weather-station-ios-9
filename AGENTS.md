# Project guidance

A static weather dashboard for Safari on iOS 9.3.5. Keep the interface in French and code comments/documentation in English.

## Compatibility and layout

- Production JavaScript must remain ES5: use `XMLHttpRequest`, not fetch, promises, async/await or modern syntax. No runtime dependencies or build step.
- Keep CSS compatible with Safari 9: no Grid, CSS variables or reliance on modern layout features. Existing tables and SVG work on the target device.
- Landscape must fit without scrolling at 1024 × 600, 748 and 768 CSS pixels. Preserve pinch zoom, the 44-pixel refresh button and 45-pixel footer. The radar page uses map pinch/pan gestures instead of page zoom on the map; keep its 44-pixel controls.
- Layout sizing uses `innerHeight`: one root rem is 1% of visible height. Body text has an explicit pixel default. Do not restore fixed-height vertical centering or rely solely on vh around Safari toolbars.

## Code and data

- `assets/weather.js`: location, API, Paris time/DST, forecast selection and cache/network client. `assets/app.js`: rendering and lifecycle. `assets/diagnostic.js`: device troubleshooting. `radar/`: full-screen RainViewer radar (`radar.js` helpers, `app.js` rendering, gestures and lifecycle); see `radar/README.md`.
- `LOCATION` is the single city setting for forecasts; the radar is intentionally fixed on Lyon (center, basemaps, places). Time handling is intentionally `Europe/Paris`; another timezone needs implementation and DST tests.
- Rain totals belong to the preceding 15-minute interval. Missing values remain unavailable, never zero. Wind arrows indicate flow; API directions indicate origin. Colors use rounded displayed speeds at 10, 25 and 40 km/h.
- Preserve graceful failure when localStorage is denied, stale-data labeling, request timeouts and recovery after sleep.
- Treat API/cache data as untrusted. Use textContent for variable strings or escape before HTML insertion. Keep scripts local and preserve the CSP; inline styles remain necessary for legacy rendering.
- Never add secrets, analytics or private data. The bundled CA certificate is public, fingerprint-pinned and manually installed; do not replace it or bypass TLS verification.

## Validation and publishing

- Run `python3 scripts/test.py` and `git diff --check`. Add focused regression tests for meaningful data or security changes; visually inspect layout changes and report limits of modern-browser checks versus the actual iPad.
- Publishing uses `.github/workflows/pages.yml`, manually from main. Keep minimal permissions, immutable action SHAs and the explicit public-file allowlist; `scripts/test.py` checks that static page references are published (files built dynamically in JavaScript, such as radar basemaps, must be listed by hand). Verify updated action SHAs against the official source repository.
- Bump affected `?v=` asset references in the HTML entrypoints (including `radar/index.html`) when changing browser assets. Documentation changes alone do not require a site deployment.
