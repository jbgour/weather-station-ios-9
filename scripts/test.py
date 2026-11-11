#!/usr/bin/env python3
"""Run dependency-free JavaScript tests using Node or macOS JavaScriptCore."""
import os
import hashlib
import re
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = ["assets/weather.js", "radar/radar.js", "tests/weather.test.js", "tests/radar.test.js", "tests/client.test.js", "tests/render.test.js"]
os.chdir(ROOT)
certificate = ROOT / "certificates/isrg-root-x1.cer"
expected_fingerprint = "96bcec06264976f37460779acf28c5a7cfe8a3c0aae11a8ffcee05c0bddf08c6"
if hashlib.sha256(certificate.read_bytes()).hexdigest() != expected_fingerprint:
    sys.exit("ISRG Root X1 certificate fingerprint mismatch. Restore the official certificate.")
print("OK official ISRG Root X1 certificate fingerprint", flush=True)

# Every local file a public page loads must be in the Pages workflow's explicit allowlist.
workflow = (ROOT / ".github/workflows/pages.yml").read_text()
published = set(re.findall(r"cp -R (\S+) ", workflow))
published |= {name for line in re.findall(r"^\s*cp ([^\n]+)$", workflow, re.M) if not line.startswith("-R") for name in line.split()[:-1]}
def is_published(path):
    return path in published or any(path.startswith(folder + "/") for folder in published)
missing = []
for page in ["index.html", "diagnostic.html", "radar/index.html", "assets/style.css"]:
    base = (ROOT / page).parent
    for reference in re.findall(r'(?:src|href)="([^"]+)"|url\(([^)]+)\)', (ROOT / page).read_text()):
        reference = (reference[0] or reference[1]).split("?")[0].split("#")[0]
        if not reference or re.match(r"^(https?:|mailto:|data:)", reference):
            continue
        target = (base / reference).resolve()
        if target.is_dir():
            target = target / "index.html"
        relative = target.relative_to(ROOT).as_posix()
        if not target.exists() or not is_published(relative):
            missing.append(page + " -> " + relative)
if missing:
    sys.exit("Unpublished or missing local references:\n  " + "\n  ".join(missing))
print("OK every local page reference is published by the Pages workflow", flush=True)

# The dashboard's anti-rubber-band check must cover every full-height (no-scroll) layout.
style = (ROOT / "assets/style.css").read_text()
script = (ROOT / "assets/app.js").read_text().replace('" +\n    "', "")
for query in re.findall(r"@media ([^{]+\(orientation: (?:landscape|portrait)\)) \{\n  html\.dashboard-page", style):
    if query.strip() not in script:
        sys.exit("assets/app.js FULL_HEIGHT_LAYOUT is missing the full-height media query: " + query.strip())
print("OK touch handling matches the full-height landscape and portrait layouts", flush=True)
node = shutil.which("node")
jsc = Path("/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc")
if node:
    program = "global.print=console.log; var fs=require('fs'),vm=require('vm');"
    program += "global.load=function(p){vm.runInThisContext(fs.readFileSync(p,'utf8'),{filename:p});};"
    program += "process.argv.slice(1).forEach(global.load);"
    command = [node, "-e", program, *FILES]
elif jsc.exists():
    command = [str(jsc), *FILES]
else:
    sys.exit("Install Node.js to run the tests (no npm dependencies required).")
raise SystemExit(subprocess.call(command))
