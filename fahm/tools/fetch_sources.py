#!/usr/bin/env python3
"""Download the raw source data used by build_data.py into tools/.cache (not committed).

Sources (see ../DATA_SOURCES.md for licences and credits):
  * Quran.com API v4  - Uthmani text, word-by-word glosses, transliteration, Saheeh International translation
  * Quran morphology  - Quranic Arabic Corpus v0.4 (GPL) in the Arabic-script fork by mustafa0x

Usage:  python3 fetch_sources.py            (skips files that already exist)
"""
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
QDIR = os.path.join(CACHE, "quran")
API = "https://api.quran.com/api/v4"
MORPH_URL = "https://raw.githubusercontent.com/mustafa0x/quran-morphology/master/quran-morphology.txt"
FIELDS = "text_uthmani,text_imlaei,location,transliteration"
SAHEEH = 20  # Quran.com translation id for Saheeh International


def get(url, binary=False, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "fahm-data-build/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            return data if binary else json.loads(data)
        except Exception as e:  # noqa: BLE001
            wait = 2 ** i
            print(f"  retry {url}: {e} (in {wait}s)", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit(f"failed: {url}")


def main():
    os.makedirs(QDIR, exist_ok=True)
    morph = os.path.join(CACHE, "qm.txt")
    if not os.path.exists(morph):
        print("morphology ...")
        with open(morph, "wb") as f:
            f.write(get(MORPH_URL, binary=True))
    chapters_path = os.path.join(QDIR, "chapters.json")
    if not os.path.exists(chapters_path):
        chapters = get(f"{API}/chapters?language=en")["chapters"]
        with open(chapters_path, "w", encoding="utf8") as f:
            json.dump(chapters, f, ensure_ascii=False)
    chapters = json.load(open(chapters_path, encoding="utf8"))
    for ch in chapters:
        n = ch["id"]
        path = os.path.join(QDIR, f"ch{n:03d}.json")
        if os.path.exists(path):
            continue
        verses, page = [], 1
        while True:
            d = get(f"{API}/verses/by_chapter/{n}?words=true&word_fields={FIELDS}"
                    f"&translations={SAHEEH}&per_page=50&page={page}&language=en")
            verses.extend(d["verses"])
            page = d["pagination"].get("next_page")
            if not page:
                break
        with open(path, "w", encoding="utf8") as f:
            json.dump(verses, f, ensure_ascii=False)
        print(f"{n:3d} {ch['name_simple']}: {len(verses)} verses", flush=True)
        time.sleep(0.15)
    print("done")


if __name__ == "__main__":
    main()
