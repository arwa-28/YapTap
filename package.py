#!/usr/bin/env python3
"""Build a Chrome Web Store upload zip and catch the common packaging mistakes first.

Run from the repo root:   python3 package.py            (expects ./extension/manifest.json)
Or point at a folder:     python3 package.py path/to/extension
"""
import json, os, re, sys, zipfile

src = sys.argv[1] if len(sys.argv) > 1 else "extension"
mf_path = os.path.join(src, "manifest.json")
if not os.path.exists(mf_path):
    sys.exit(f"manifest.json not found in {src}/")
m = json.load(open(mf_path, encoding="utf-8"))
errors, warns = [], []

def need(rel, why):
    if rel and not os.path.exists(os.path.join(src, rel)):
        errors.append(f"Missing file '{rel}' ({why})")

# 1) metadata limits
if len(m.get("name", "")) > 45: errors.append("name is longer than 45 characters")
if len(m.get("description", "")) > 132: errors.append("description is longer than 132 characters")
if not re.fullmatch(r"\d+(\.\d+){0,3}", m.get("version", "")): errors.append("version must look like 1.2.3")
if m.get("manifest_version") != 3: errors.append("manifest_version must be 3")

# 2) every file the manifest points at must exist
for k, v in m.get("icons", {}).items(): need(v, f"icons.{k}")
act = m.get("action", {})
need(act.get("default_popup"), "action.default_popup")
di = act.get("default_icon", {})
for v in (di.values() if isinstance(di, dict) else [di]): need(v, "action.default_icon")
need(m.get("background", {}).get("service_worker"), "background.service_worker")
if not any(k == "128" for k in m.get("icons", {})): errors.append("icons must include a 128 entry")

# 3) html files: local assets must exist, no remote code
for d, _, fs in os.walk(src):
    for f in fs:
        if not f.endswith(".html"): continue
        p = os.path.join(d, f); html = open(p, encoding="utf-8").read()
        for tag, ref in re.findall(r'<(script|link|img)[^>]+(?:src|href)=["\']([^"\']+)["\']', html):
            if ref.startswith(("data:", "#", "chrome-extension:")): continue
            if ref.startswith(("http://", "https://", "//")):
                (errors if tag == "script" else warns).append(f"{p}: remote {tag} '{ref}' (remote code is not allowed)" if tag == "script"
                                                              else f"{p}: remote {tag} '{ref}' (avoid external resources)")
                continue
            if not os.path.exists(os.path.normpath(os.path.join(d, ref.split("?")[0]))):
                errors.append(f"{p}: references '{ref}' which does not exist")
for d, _, fs in os.walk(src):
    for f in fs:
        if f.endswith(".js"):
            t = open(os.path.join(d, f), encoding="utf-8", errors="ignore").read()
            if re.search(r"\beval\(|new Function\(|import\(['\"]https?:", t): errors.append(f"{f}: uses eval/new Function/remote import")
            if re.search(r"fetch\(['\"]https?:", t): warns.append(f"{f}: makes a network request; declare it in your privacy answers")
        if f.endswith(".css"):
            t = open(os.path.join(d, f), encoding="utf-8", errors="ignore").read()
            if re.search(r"@import\s+url\(['\"]?https?:", t) or re.search(r"url\(['\"]?https?:", t):
                warns.append(f"{f}: loads an external URL (e.g. Google Fonts); bundle it locally instead")

for w in warns: print("WARN ", w)
if errors:
    for e in errors: print("ERROR", e)
    sys.exit("\nFix the errors above, then run again.")

out = f"yaptap-{m['version']}.zip"
skip_ext = (".md", ".map", ".psd", ".ds_store")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for d, dirs, fs in os.walk(src):
        dirs[:] = [x for x in dirs if not x.startswith(".")]
        for f in sorted(fs):
            if f.startswith(".") or f.lower().endswith(skip_ext): continue
            full = os.path.join(d, f); z.write(full, os.path.relpath(full, src))  # manifest.json lands at the zip root
names = zipfile.ZipFile(out).namelist()
assert "manifest.json" in names
print(f"OK  wrote {out}  ({os.path.getsize(out)/1024:.0f} KB, {len(names)} files, version {m['version']})")
print("Remember: the version number must be higher than the last one you uploaded.")
