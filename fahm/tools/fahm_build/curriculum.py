"""Build the learning path (units -> lessons -> cards) from units.txt plus frequency order."""
import collections
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")

AUTO_MILESTONES = ["humazah", "takathur", "qadr", "zalzalah", "duha", "sharh", "tin", "adiyat", "qariah",
                   "alaq", "bayyinah", "baqarah-end", "names", "duas", "light", "mulk"]
LESSON_SIZE = 6
UNIT_LESSONS = 6
MAX_SAME_CAT = 3
CAT_TITLE = {"c": "Connecting words", "n": "Things and people", "v": "Actions", "a": "Describing words",
             "p": "Names", "b": "Little pieces", "r": "Pronouns"}


def load_collections():
    return json.load(open(os.path.join(DATA, "collections.json"), encoding="utf8"))


def collection_cards(m, col):
    """-> list of card keys (ordered by frequency) needed to read a collection."""
    need = collections.Counter()
    for s, a, b in col["ranges"]:
        for v in range(a, b + 1):
            for ti in m.verse_tokens[(s, v)]:
                t = m.tokens[ti]
                for k in [t["primary"]] + t["others"]:
                    need[k] += 1
    return [k for k, _ in sorted(need.items(), key=lambda kv: (-m.cards[kv[0]]["occ"], kv[0]))]


def parse_units():
    items = []
    unit = None
    for ln, line in enumerate(open(os.path.join(DATA, "units.txt"), encoding="utf8"), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            head, _, rest = line.partition("|")
            fields = [f.strip() for f in rest.split("|")]
            kind = head.strip()[1:]
            if kind == "unit":
                unit = {"kind": "unit", "title": fields[0], "sub": fields[1] if len(fields) > 1 else "",
                        "goal": fields[2] if len(fields) > 2 else "", "lessons": []}
                items.append(unit)
            elif kind == "milestone":
                items.append({"kind": "milestone", "title": fields[0], "sub": fields[1], "cols": fields[2].split()})
            elif kind == "auto":
                items.append({"kind": "auto", "n": int(fields[0])})
            else:
                raise SystemExit(f"units.txt:{ln}: unknown directive {kind}")
        elif line.startswith("-"):
            title, _, refs = line[1:].partition("|")
            unit["lessons"].append({"title": title.strip(), "refs": [r.strip() for r in refs.split(";") if r.strip()]})
        else:
            raise SystemExit(f"units.txt:{ln}: cannot parse {line!r}")
    return items


def build(m, max_cards=1400):
    cols = {c["id"]: c for c in load_collections()}
    by_display = collections.defaultdict(list)
    for key, c in m.cards.items():
        if c["kind"] == "l" and (c.get("cur") or c["occ"] >= 8):
            by_display[c["a"].strip()].append(key)
    scheduled = {}
    units = []

    def resolve(ref):
        if ref in m.cards:
            return ref
        keys = by_display.get(ref, [])
        if len(keys) == 1:
            return keys[0]
        raise SystemExit(f"units.txt: cannot resolve {ref!r} -> {keys}")

    def add_unit(title, sub, goal, lessons):
        u = {"title": title, "sub": sub, "goal": goal, "lessons": []}
        for les in lessons:
            keys = [k for k in les["keys"] if k not in scheduled]
            if not keys:
                continue
            for k in keys:
                scheduled[k] = len(units)
            u["lessons"].append({"title": les["title"], "keys": keys})
        if u["lessons"]:
            units.append(u)
        return u

    def chunk(keys, title_fn, size=LESSON_SIZE):
        out = []
        for i in range(0, len(keys), size):
            out.append({"title": title_fn(len(out) + 1), "keys": keys[i:i + size]})
        return out

    pending_cols = list(AUTO_MILESTONES)
    items = parse_units()

    def freq_pool():
        pool = [k for k, c in m.cards.items() if k not in scheduled and (c["kind"] != "l" or c.get("cur") or c["occ"] >= 8)]
        pool.sort(key=lambda k: (-m.cards[k]["occ"], k))
        return pool

    def make_milestone(title, sub, col_ids):
        keys = []
        for cid in col_ids:
            for k in collection_cards(m, cols[cid]):
                if k not in scheduled and k not in keys:
                    keys.append(k)
        keys.sort(key=lambda k: (-m.cards[k]["occ"], k))
        if keys:
            add_unit(title, sub, col_ids[0], chunk(keys, lambda i: f"{title} · words {i}"))

    def make_auto_unit(n):
        pool = freq_pool()
        if not pool:
            return False
        lessons = []
        for _ in range(UNIT_LESSONS):
            pool = [k for k in pool if k not in scheduled]
            take, catc = [], collections.Counter()
            for k in pool:
                c = m.cards[k]["c"]
                if catc[c] >= MAX_SAME_CAT:
                    continue
                take.append(k)
                catc[c] += 1
                if len(take) == LESSON_SIZE:
                    break
            if not take:
                break
            for k in take:
                scheduled[k] = -1  # reserve inside this loop
            dom = catc.most_common(1)[0][0]
            lessons.append({"title": CAT_TITLE.get(dom, "Words"), "keys": take})
            pool = [k for k in pool if k not in take]
        for k in [k for l in lessons for k in l["keys"]]:
            scheduled.pop(k, None)
        add_unit(f"Core words {n}", "The next most frequent words in the Quran", "", lessons)
        return True

    auto_count = 0
    for it in items:
        if it["kind"] == "unit":
            lessons = [{"title": l["title"], "keys": [resolve(r) for r in l["refs"]]} for l in it["lessons"]]
            add_unit(it["title"], it["sub"], it["goal"], lessons)
        elif it["kind"] == "milestone":
            make_milestone(it["title"], it["sub"], it["cols"])
        elif it["kind"] == "auto":
            for _ in range(it["n"]):
                if len(scheduled) >= max_cards:
                    break
                if not make_auto_unit(auto_count + 1):
                    break
                auto_count += 1
                if auto_count % 2 == 0 and pending_cols:
                    cid = pending_cols.pop(0)
                    make_milestone(cols[cid]["title"], cols[cid]["sub"], [cid])
    for cid in pending_cols:
        make_milestone(cols[cid]["title"], cols[cid]["sub"], [cid])
    return units, scheduled
