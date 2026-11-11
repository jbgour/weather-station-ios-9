# Rain radar

Full-screen observed-rain radar around Lyon, opened from the dashboard's **Radar** card (`radar/`). Same constraints as the dashboard: ES5, Safari 9, no framework, API key or build step. `radar.js` holds the pure helpers (manifest validation, tile URLs, projection); `app.js` handles rendering, gestures and lifecycle.

**The radar is fixed on Lyon.** The center (45.75 N, 4.85 E), the prebuilt basemaps and `places.js` do not follow `LOCATION`. Another city needs new basemaps, places and center coordinates.

## What it shows

- A full-screen, north-up map centered at 45.75 N, 4.85 E. The square radar stage covers the screen and is cropped evenly; the initial view is 2× around Lyon (roughly 110 km across in landscape). Six zoom levels range from a wide view (roughly 875 km across) to nearby Lyon (roughly 36 km). The two widest views load provider zooms 5 and 6; closer views crop zoom 7. Magnification does not add radar detail. Scale bars and city labels update with the view.
- The basemap is local Natural Earth SVG. Nearby commune centers come from `https://geo.api.gouv.fr/communes?codeDepartement=69&fields=nom,code,centre,population`, retrieved on 2026-11-11 and bundled in `places.js`. Regional cities are from Natural Earth. Labels are drawn at runtime from `places.js`, projected after zoom, retain a readable size and avoid collisions; no live geocoding requests occur.
- Up to seven past radar mosaics, approximately one hour at ten-minute intervals, then six forecast steps up to +60 minutes. Times use the shared Paris time helpers.
- **Forecast (nowcast), computed on the iPad** in `nowcast.js`, since RainViewer stopped publishing forecast frames on 2026-01-01. The last three observed frames are fetched again at provider zoom 6 (about 440 km, more rain to track) with CORS, downsampled to 128 px (about 3.4 km per pixel), and one overall motion is estimated by normalized cross-correlation, coarse-to-fine, with sub-pixel refinement. Each step shows the latest observed image shifted along that motion with a CSS transform, fading with lead time. Limits: rain is moved, never created, grown or weakened; one motion for the whole area; skill drops after 30–60 minutes; the upwind edge of the shifted image is empty. A dry tile yields a dry forecast. Without a reliable motion, or if pixels cannot be read, the forecast is omitted and observed frames still work. The UI labels it "Prévision estimée".
- One slim bottom bar: play/pause, a strip of frame times (tap or drag a finger to scrub) and the displayed time. Floating controls: back to the dashboard and +/− zoom. One finger pans and two fingers pinch-zoom continuously (0.25× to 6×) around their midpoint; only CSS transforms change during the gesture, and labels and provider tiles update when the fingers lift. Panning stays within the radar square centered on Lyon (about 220 km at provider zoom 7, wider at zooms 6 and 5), because both the radar request and the local basemaps use that fixed center. Pinching the map replaces Safari's page zoom on that area; the bottom bar keeps it. A status pill appears only while loading or after a failure, with a retry button. Playback stops when the page is hidden; metadata refreshes every five minutes.
- At most two image downloads concurrently, with seven 512-pixel frames retained (about 7 MiB of decoded RGBA pixels, excluding browser overhead). Higher-resolution images keep magnification less blurry, without increasing the source radar's geographic detail. No video or WebGL.
- A coverage mask darkens areas without radar coverage. Clear pixels alone do not prove dry weather. The mosaic timestamp is not necessarily the observation time at each radar.

Radar: [RainViewer API](https://www.rainviewer.com/api/weather-maps-api.html), personal/educational use with visible attribution, no guaranteed availability. [Current restrictions](https://www.rainviewer.com/api/transition-faq.html): historical images only, maximum zoom 7, 100 requests/IP/minute. Basemap: [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), public domain.

The images and JSON are fetched directly over HTTPS from `api.rainviewer.com` and `tilecache.rainviewer.com`. Validate both on the actual iPad; never bypass TLS verification. Existing local-storage support is not required.

## Rebuild the basemap

Download these files from `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/` into a temporary directory:

- `ne_50m_admin_0_boundary_lines_land.geojson`
- `ne_50m_rivers_lake_centerlines.geojson`
- `ne_50m_lakes.geojson`

Then run `python3 radar/build_basemap.py <directory>` for zoom 7, and repeat with the optional last argument `5` and `6` for the wider views. Projection matches RainViewer's centered tile: a 256-world-pixel square at the selected zoom, rendered in a 512-unit SVG. Lyon's center uses the radar's fixed coordinates.

`python3 scripts/test.py` runs the radar helper tests in `tests/radar.test.js`. On the physical iPad, check HTTPS to RainViewer, playback, gestures, partial image failures and wake-up behavior after visual changes.
