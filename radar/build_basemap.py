#!/usr/bin/env python3
"""Build the fixed Lyon basemap from public-domain Natural Earth GeoJSON files."""
import json
import math
from pathlib import Path
import sys

SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/tmp')
OUTPUT = Path(__file__).resolve().parent
LAT, LON = 45.75, 4.85
ZOOM = int(sys.argv[2]) if len(sys.argv) > 2 else 7
if ZOOM not in (5, 6, 7): raise SystemExit('Supported provider zooms: 5, 6, 7')
WORLD = 256 * 2 ** ZOOM

def world(lon, lat):
    lat = max(-85.05112878, min(85.05112878, lat))
    r = math.radians(lat)
    return ((lon + 180) / 360 * WORLD, (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * WORLD)

CX, CY = world(LON, LAT)

def project(point):
    x, y = world(*point[:2])
    return (256 + (x - CX) * 2, 256 + (y - CY) * 2)

def load(name):
    return json.loads((SOURCE / (name + '.geojson')).read_text())['features']

def clipped(a, b):
    # Liang–Barsky clipping keeps global features out of the tiny output file.
    dx, dy = b[0] - a[0], b[1] - a[1]
    lo, hi = 0.0, 1.0
    for p, q in [(-dx, a[0]), (dx, 512 - a[0]), (-dy, a[1]), (dy, 512 - a[1])]:
        if p == 0:
            if q < 0: return None
        else:
            t = q / p
            if p < 0: lo = max(lo, t)
            else: hi = min(hi, t)
            if lo > hi: return None
    return (a[0] + lo * dx, a[1] + lo * dy), (a[0] + hi * dx, a[1] + hi * dy)

def line_path(coords):
    out, previous = [], None
    pts = [project(p) for p in coords]
    for a, b in zip(pts, pts[1:]):
        segment = clipped(a, b)
        if not segment:
            previous = None
            continue
        a, b = segment
        if previous != a: out.append('M%.1f %.1f' % a)
        out.append('L%.1f %.1f' % b)
        previous = b
    return ''.join(out)

start = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><clipPath id="bounds"><path d="M0 0H512V512H0Z"/></clipPath></defs>'
parts = [start, '<path fill="#17262b" d="M0 0H512V512H0Z"/>', '<g clip-path="url(#bounds)">']
for name, color, width in [('ne_50m_admin_0_boundary_lines_land', '#526367', 1.2), ('ne_50m_rivers_lake_centerlines', '#3b6673', 1.3)]:
    for f in load(name):
        g = f['geometry']
        lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']] if g['type'] == 'LineString' else []
        for coords in lines:
            path = line_path(coords)
            if path: parts.append('<path fill="none" stroke="%s" stroke-width="%s" d="%s"/>' % (color, width, path))
for f in load('ne_50m_lakes'):
    g = f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']] if g['type'] == 'Polygon' else []
    for poly in polys:
        pts = [project(p) for p in poly[0]]
        if not pts or max(p[0] for p in pts) < 0 or min(p[0] for p in pts) > 512 or max(p[1] for p in pts) < 0 or min(p[1] for p in pts) > 512: continue
        d = ''.join(('M' if i == 0 else 'L') + '%.1f %.1f' % p for i, p in enumerate(pts)) + 'Z'
        parts.append('<path fill="#294956" stroke="#3b6673" stroke-width="1" d="%s"/>' % d)
parts.append('</g></svg>')
(OUTPUT / ('basemap.svg' if ZOOM == 7 else 'basemap-z%d.svg' % ZOOM)).write_text(''.join(parts))
print('Generated basemap for zoom', ZOOM)
