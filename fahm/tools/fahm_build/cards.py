"""Turn morphology segments into learnable cards and work out which cards each Quran word needs."""
import collections
import os
import re
import unicodedata

from . import parse
from .special import DEM_CARDS, PERSON_ALIAS, PERSONS, PREFIX_CARDS, PRON_CARDS
from .translit import transliterate

HERE = os.path.dirname(os.path.abspath(__file__))
VOCAB_DIR = os.path.join(os.path.dirname(HERE), "vocab")

# second stems that add no meaning of their own (e.g. the ما in إِنَّمَا)
SILENT_STEM_TAGS = {"PREV", "SUP", "ZID", "EMPH", "AMD"}
# suffix / prefix pieces that are part of another word and need no card of their own
SILENT_PIECE_TAGS = {"ATT", "DIST", "ADDR", "EMPH", "INL"}
PRON_TAG = "PRON"


def seg_tags(seg):
    return set(seg["tags"])


def prefix_key(seg):
    lem, tags = seg["lem"], seg_tags(seg)
    if lem == "و":
        return "pref:wa"
    if lem == "ف":
        return "pref:fa"
    if lem == "ب":
        return "pref:bi"
    if lem == "ل":
        if "EMPH" in tags:
            return "pref:la"
        if "IMPV" in tags:
            return None
        return "pref:li"
    if lem == "ك":
        return "pref:ka"
    if lem == "ال":
        return "pref:al"
    if lem == "أ":
        return "pref:a"
    if lem == "س":
        return "pref:sa"
    if lem == "ي":
        return "pref:ya"
    return None


def pron_key(seg):
    for t in seg["tags"]:
        t = PERSON_ALIAS.get(t, t)
        if t in PERSONS:
            return "pron:" + t
    return None


def dem_skeleton(segs):
    """Skeleton of a demonstrative word without its wa/fa/a prefixes (but with ها / ذ / ل / ك pieces)."""
    parts = []
    for s in segs:
        if s["pref"] and "ATT" not in s["tags"]:
            continue
        parts.append(s["form"])
    return "".join(c for c, _ in parse.skeleton("".join(parts)))


DEM_BY_SKELETON = {
    "ذلك": "dem:dhalika", "ذلكم": "dem:dhalika", "ذلكما": "dem:dhalika", "ذلكن": "dem:dhalika", "ذنك": "dem:dhalika",
    "هذا": "dem:hadha", "ذا": "dem:hadha", "هذان": "dem:hadha", "هذن": "dem:hadha",
    "هذه": "dem:hadhihi", "هتين": "dem:hadhihi",
    "اوليك": "dem:ulaika", "اولا": "dem:ulaika", "اوليكم": "dem:ulaika",
    "هولا": "dem:haulai",
    "تلك": "dem:tilka", "تلكم": "dem:tilka", "تلكما": "dem:tilka",
}


def lemma_key(seg):
    return f"lem:{unicodedata.normalize('NFC', seg['lem'] or seg['form'])}|{seg['pos']}"


def token_roles(segs):
    """-> (primary_key, [other_keys], [card key or None for every segment]).  Keys are un-merged."""
    per_seg = []
    primary = None
    for s in segs:
        tags = seg_tags(s)
        if s["pref"]:
            key = None if "ATT" in tags else prefix_key(s)
        elif s["suff"]:
            key = pron_key(s) if PRON_TAG in tags else None
        elif PRON_TAG in tags and s["lem"] != "إِيّا":
            key = pron_key(s)
        elif "DEM" in tags and dem_skeleton(segs) in DEM_BY_SKELETON:
            key = DEM_BY_SKELETON[dem_skeleton(segs)]
        else:
            key = lemma_key(s)
            if primary is not None and tags & SILENT_STEM_TAGS:
                key = None  # e.g. the ما in إِنَّمَا adds no meaning of its own
        per_seg.append(key)
        if primary is None and key and not s["pref"] and not s["suff"]:
            primary = key
    if primary is None:
        for k, s in zip(per_seg, segs):
            if k and not s["pref"]:
                primary = k
                break
    if primary is None:
        primary = next((k for k in per_seg if k), None)
    others = []
    for k in per_seg:
        if k and k != primary and k not in others:
            others.append(k)
    return primary, others, per_seg


# ---------------------------------------------------------------- vocabulary files

def _key(text):
    """'مِن[P]' (as printed by --list) -> 'lem:مِن|P'."""
    m = re.match(r"^(.*)\[(N|V|P)\]$", text.strip())
    if not m:
        raise SystemExit(f"bad vocab key: {text!r}")
    return f"lem:{unicodedata.normalize('NFC', m.group(1))}|{m.group(2)}"


def _read_vocab():
    vocab, merges = {}, {}
    for name in sorted(os.listdir(VOCAB_DIR)):
        path = os.path.join(VOCAB_DIR, name)
        if not name.endswith(".txt"):
            continue
        for ln, line in enumerate(open(path, encoding="utf8"), 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if name == "merges.txt":
                canon, other = [_key(x) for x in line.split("<-")]
                merges[other] = canon
                continue
            fields = [f.strip() for f in line.split(" | ")]
            if len(fields) < 4:
                raise SystemExit(f"{name}:{ln}: expected 'key | display | meaning | cat [| note]'")
            keys = [_key(k) for k in fields[0].split("+")]
            canon = keys[0]
            for other in keys[1:]:
                merges[other] = canon
            if canon in vocab:
                raise SystemExit(f"{name}:{ln}: duplicate entry for {canon}")
            vocab[canon] = {"a": fields[1], "e": fields[2], "c": fields[3], "x": fields[4] if len(fields) > 4 else ""}
    return vocab, merges


def lemma_cat(seg_example):
    tags = set(seg_example["tags"])
    pos = seg_example["pos"]
    if pos == "V":
        return "v"
    if pos == "P":
        return "c"
    if "PN" in tags:
        return "p"
    if tags & {"REL", "DEM", "INTG", "COND", "T", "LOC"}:
        return "c"
    if "ADJ" in tags or "ACT_PCPL" in tags or "PASS_PCPL" in tags:
        return "a"
    return "n"


def prettify(lem):
    """Insert the missing fatha before a long alif so citation forms look complete."""
    out = []
    for i, ch in enumerate(lem):
        if ch == "ا" and out and unicodedata.category(out[-1]) == "Lo":
            out.append("َ")
        out.append(ch)
    return "".join(out)


def clean_gloss(g):
    g = g.strip()
    g = re.sub(r"\[([^\]]*)\]", r"\1", g)
    g = re.sub(r"\(([^)]*)\)", " ", g)
    g = re.sub(r"\s+", " ", g).strip()
    return g


def load_vocab():
    vocab, merges = _read_vocab()
    return vocab, merges


def make_translit(display):
    parts = [p.strip() for p in display.replace("·", " ").split()]
    return " · ".join(transliterate(p.lstrip("ـ")) for p in parts)
