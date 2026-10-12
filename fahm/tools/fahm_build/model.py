"""Build the in-memory model: tokens, cards, requirements, statistics."""
import collections

from . import cards as C
from . import parse
from .special import DEM_CARDS, PREFIX_CARDS, PRON_CARDS


class Model:
    pass


def build():
    m = Model()
    m.chapters, m.verses = parse.load_quran()
    m.morph = parse.load_morphology()
    m.vocab, m.merges = C.load_vocab()

    # ---- tokens
    m.tokens = []          # flat list in Quran order
    m.verse_tokens = {}    # (s, a) -> [token index]
    raw_cards = {}         # key -> example segment (for lemma cards)
    for (s, a), v in m.verses.items():
        idxs = []
        for i, w in enumerate(v["words"], 1):
            segs = m.morph[(s, a, i)]
            primary, others, per_seg = C.token_roles(segs)
            chips = parse.align_segments(w["ar"], segs) if len(segs) > 1 else [w["ar"]]
            tok = {"s": s, "a": a, "i": i, "ar": w["ar"], "signs": w["signs"], "gloss": w["gloss"], "tr": w["tr"],
                   "segs": segs, "chips": chips, "primary": primary, "others": others, "per_seg": per_seg}
            idxs.append(len(m.tokens))
            m.tokens.append(tok)
            for k, seg in zip(per_seg, segs):
                if k and k.startswith("lem:") and k not in raw_cards and not seg["pref"] and not seg["suff"]:
                    raw_cards[k] = seg
        m.verse_tokens[(s, a)] = idxs

    # ---- merges
    def canon(key):
        seen = 0
        while key in m.merges and seen < 5:
            key = m.merges[key]
            seen += 1
        return key
    m.canon = canon
    for tok in m.tokens:
        tok["primary"] = canon(tok["primary"])
        tok["others"] = [k for k in dict.fromkeys(canon(k) for k in tok["others"]) if k != tok["primary"]]
        tok["per_seg"] = [canon(k) if k else None for k in tok["per_seg"]]

    # ---- statistics per card
    prim = collections.Counter()
    occ = collections.Counter()
    for tok in m.tokens:
        prim[tok["primary"]] += 1
        for k in [tok["primary"]] + tok["others"]:
            occ[k] += 1
    m.prim, m.occ = prim, occ

    # ---- card table
    m.cards = {}
    for key in occ:
        m.cards[key] = {"key": key, "n": prim[key], "occ": occ[key]}
    for key, c in m.cards.items():
        if key.startswith("pref:"):
            c.update(PREFIX_CARDS[key]); c["kind"] = "p"
        elif key.startswith("pron:"):
            c.update(PRON_CARDS[key[5:]]); c["c"] = "r"; c["kind"] = "r"
        elif key.startswith("dem:"):
            c.update(DEM_CARDS[key]); c["kind"] = "d"
        else:
            c["kind"] = "l"
            seg = raw_cards.get(key)
            if seg is None:  # merged-away key never appears here; defensive
                seg = {"form": key, "lem": key, "pos": "N", "tags": []}
            c["lem"] = seg["lem"] or seg["form"]
            c["pos"] = seg["pos"]
            c["root"] = seg.get("root") or ""
            c["c"] = C.lemma_cat(seg)
            v = m.vocab.get(key)
            if v:
                c.update({"a": v["a"], "e": v["e"], "c": v["c"], "x": v["x"], "cur": 1})
            else:
                c.update({"a": C.prettify(c["lem"]), "e": "", "x": "", "cur": 0})
    return m
