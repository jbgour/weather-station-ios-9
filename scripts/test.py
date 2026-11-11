#!/usr/bin/env python3
"""Run dependency-free JavaScript tests using Node or macOS JavaScriptCore."""
import os
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = ["assets/weather.js", "tests/weather.test.js", "tests/client.test.js", "tests/render.test.js"]
os.chdir(ROOT)
certificate = ROOT / "certificates/isrg-root-x1.cer"
expected_fingerprint = "96bcec06264976f37460779acf28c5a7cfe8a3c0aae11a8ffcee05c0bddf08c6"
if hashlib.sha256(certificate.read_bytes()).hexdigest() != expected_fingerprint:
    sys.exit("ISRG Root X1 certificate fingerprint mismatch. Restore the official certificate.")
print("OK official ISRG Root X1 certificate fingerprint", flush=True)
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
