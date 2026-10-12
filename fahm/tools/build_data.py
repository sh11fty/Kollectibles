#!/usr/bin/env python3
"""Build the app's data files (web/data/**) from the cached sources.

    python3 fetch_sources.py     # once, downloads the raw sources into tools/.cache
    python3 build_data.py        # writes ../web/data

Card ids are kept stable between runs through data/card_ids.json (append-only), because the app
stores learner progress by card id.
"""
import collections
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from fahm_build import cards as C            # noqa: E402
from fahm_build import curriculum, glosses, model, parse  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), "web", "data")
REGISTRY = os.path.join(HERE, "data", "card_ids.json")
DATA_VERSION = 1


def dump(path, obj, compact=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf8") as f:
        if compact:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(obj, f, ensure_ascii=False, indent=1)
    return os.path.getsize(path)


def main():
    m = model.build()
    print(f"{len(m.tokens)} words, {len(m.verses)} verses, {len(m.cards)} cards "
          f"({sum(1 for c in m.cards.values() if c.get('cur'))} hand-written)")

    # ---- meanings, transliteration, forms
    by_primary = collections.defaultdict(list)
    for t in m.tokens:
        by_primary[t["primary"]].append(t)
    units, scheduled = curriculum.build(m)
    for key, c in m.cards.items():
        if c["kind"] == "l" and not c["e"]:
            c["e"] = glosses.auto_meaning(c, by_primary[key])
            c["z"] = 1
        if not c.get("t"):
            c["t"] = C.make_translit(c["a"])
        if c["kind"] == "l" and (key in scheduled or c["occ"] >= 6):
            c["f"] = glosses.forms_for(key, by_primary[key])

    # ---- stable ids
    reg = json.load(open(REGISTRY, encoding="utf8")) if os.path.exists(REGISTRY) else {}
    nxt = max(reg.values(), default=0) + 1
    for key in sorted(m.cards, key=lambda k: (-m.cards[k]["occ"], k)):
        if key not in reg:
            reg[key] = nxt
            nxt += 1
    dump(REGISTRY, reg, compact=False)
    cid = {k: reg[k] for k in m.cards}
    assert len(set(cid.values())) == len(cid)
    assert max(cid.values()) < 65535

    # ---- requirement sets (extra cards a word needs besides its primary stem)
    sets = [[]]
    set_ix = {(): 0}
    for t in m.tokens:
        req = tuple(sorted(cid[k] for k in t["others"]))
        if req not in set_ix:
            set_ix[req] = len(sets)
            sets.append(list(req))
        t["set"] = set_ix[req]

    # ---- cards table
    lex_cards = []
    for key, c in sorted(m.cards.items(), key=lambda kv: cid[kv[0]]):
        e = {"i": cid[key], "k": c["kind"], "a": c["a"], "e": c["e"], "c": c["c"], "t": c["t"],
             "n": c["n"], "o": c["occ"]}
        if c.get("x"):
            e["x"] = c["x"]
        if c.get("f"):
            e["f"] = c["f"]
        if c.get("z"):
            e["z"] = 1
        if c.get("root"):
            e["r"] = c["root"]
        lex_cards.append(e)

    # ---- path
    cols = curriculum.load_collections()
    learned = set()
    n_tok = len(m.tokens)

    def readable(keys):
        return sum(1 for t in m.tokens if t["primary"] in keys and all(o in keys for o in t["others"])) / n_tok * 100

    path_units = []
    for ui, u in enumerate(units, 1):
        lessons = []
        for li, l in enumerate(u["lessons"], 1):
            lessons.append({"id": f"u{ui}l{li}", "t": l["title"], "c": [cid[k] for k in l["keys"]]})
            learned.update(l["keys"])
        path_units.append({"id": f"u{ui}", "t": u["title"], "s": u["sub"], "g": u["goal"], "l": lessons,
                           "cov": round(readable(learned), 1)})
    collections_out = []
    for col in cols:
        verses = [[s, a] for s, lo, hi in col["ranges"] for a in range(lo, hi + 1)]
        collections_out.append({"id": col["id"], "t": col["title"], "s": col["sub"], "v": verses})

    # ---- surah files
    chap_meta = []
    vstart = 0
    tstart = 0
    verse_offsets = []
    for ch in m.chapters:
        n = ch["id"]
        vs = []
        for a in range(1, ch["verses_count"] + 1):
            v = m.verses[(n, a)]
            words = []
            for ti in m.verse_tokens[(n, a)]:
                t = m.tokens[ti]
                entry = [t["ar"], t["gloss"], t["tr"], t["signs"]]
                chips = t["chips"]
                if chips and len(t["segs"]) > 1:
                    seg_out = []
                    for chip, seg, key in zip(chips, t["segs"], t["per_seg"]):
                        seg_out.append([chip if chip is not None else seg["form"], cid[key] if key else 0])
                    entry.append(seg_out)
                words.append(entry)
            vs.append({"t": v["tr"], "w": words})
        size = dump(os.path.join(OUT, "quran", f"{n:03d}.json"), {"s": n, "v": vs})
        verse_offsets.append(vstart)
        chap_meta.append({"n": n, "ar": ch["name_arabic"], "en": ch["name_simple"],
                          "tr": (ch.get("translated_name") or {}).get("name", ""),
                          "rev": ch["revelation_place"], "v": ch["verses_count"], "o": vstart})
        vstart += ch["verses_count"]

    # ---- binary token index
    all_verses = []
    for ch in m.chapters:
        for a in range(1, ch["verses_count"] + 1):
            all_verses.append((ch["id"], a))
    offs = [0]
    prim, rset = [], []
    for sa in all_verses:
        for ti in m.verse_tokens[sa]:
            t = m.tokens[ti]
            prim.append(cid[t["primary"]])
            rset.append(t["set"])
        offs.append(len(prim))
    blob = b"FV01" + struct.pack("<II", len(all_verses), len(prim))
    blob += struct.pack(f"<{len(offs)}I", *offs)
    blob += struct.pack(f"<{len(prim)}H", *prim)
    blob += struct.pack(f"<{len(rset)}H", *rset)
    with open(os.path.join(OUT, "vidx.bin"), "wb") as f:
        f.write(blob)

    lex_size = dump(os.path.join(OUT, "lex.json"), {"v": DATA_VERSION, "cards": lex_cards, "sets": sets})
    path_size = dump(os.path.join(OUT, "path.json"), {"v": DATA_VERSION, "units": path_units, "collections": collections_out})
    meta_size = dump(os.path.join(OUT, "meta.json"), {"v": DATA_VERSION, "chapters": chap_meta, "verses": vstart, "tokens": len(prim)})
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
    print(f"lex.json {lex_size/1024:.0f}KB  path.json {path_size/1024:.0f}KB  meta.json {meta_size/1024:.1f}KB  "
          f"vidx.bin {len(blob)/1024:.0f}KB  total data {total/1024/1024:.2f}MB")
    print(f"path: {len(path_units)} units, {sum(len(u['l']) for u in path_units)} lessons, "
          f"{sum(len(l['c']) for u in path_units for l in u['l'])} cards, final coverage {path_units[-1]['cov']}%")


if __name__ == "__main__":
    main()
