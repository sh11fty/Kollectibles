"""Parse the raw Quran.com tokens and the Quranic Arabic Corpus morphology into one token table."""
import glob
import json
import os
import re
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(os.path.dirname(HERE), ".cache")

PAUSE_SIGNS = set("ۖۗۘۙۚۛۜ")
SAJDA = "۩"
HIZB = "۞"
TATWEEL = "ـ"


def is_mark(ch):
    return unicodedata.category(ch).startswith("M") or ch in (TATWEEL, "ۥ", "ۦ", "‏")


_MAP = {}
for _c in "أإآٱا":
    _MAP[_c] = "ا"
for _c in "ىيئ":
    _MAP[_c] = "ي"
for _c in "ؤو":
    _MAP[_c] = "و"


def skeleton(s):
    """Base letters of an Arabic string as [(normalised_char, index_in_s)], hamza-on-the-line dropped."""
    out = []
    for i, ch in enumerate(s):
        if is_mark(ch) or ch == "ء" or ch.isspace():
            continue
        out.append((_MAP.get(ch, ch), i))
    return out


def split_token_text(raw, location=""):
    """Quran.com token text -> (word, trailing_signs)."""
    parts = raw.replace("\u200F", "").split()
    words = []
    signs = ""
    for p in parts:
        if all(c in PAUSE_SIGNS or c in (SAJDA, HIZB) for c in p):
            signs += p.replace(HIZB, "")
        else:
            words.append(p)
    # Quran.com splits the single word دَآئِرَةٌ (5:52) with a stray space; two other tokens
    # (بَعْدَ مَا, إِلْ يَاسِينَ) are genuinely written as two words but counted as one token.
    word = "".join(words) if location == "5:52:12" else " ".join(words)
    word = word.replace(HIZB, "")
    if SAJDA in word:
        word = word.replace(SAJDA, "")
        signs += SAJDA
    while word and word[-1] in PAUSE_SIGNS:
        signs = word[-1] + signs
        word = word[:-1]
    return word, signs


def align_segments(word, segs):
    """Cut `word` (Quran.com text) at the morpheme boundaries given by the corpus segments.

    Returns a list of substrings (one per segment, concatenating back to `word`) or None."""
    sk = skeleton(word)
    n = len(sk)
    lens = [len(skeleton(s["form"])) for s in segs]
    prefs = [i for i, s in enumerate(segs) if s["pref"]]
    suffs = [i for i, s in enumerate(segs) if s["suff"]]
    mids = [i for i, s in enumerate(segs) if not s["pref"] and not s["suff"]]
    pre = sum(lens[i] for i in prefs)
    suf = sum(lens[i] for i in suffs)
    if not mids or pre + suf > n:
        return None
    mid_total = n - pre - suf
    if len(mids) == 1:
        mid_lens = {mids[0]: mid_total}
    else:
        if sum(lens[i] for i in mids) != mid_total:
            return None
        mid_lens = {i: lens[i] for i in mids}
    cuts = []  # skeleton positions where each segment starts
    pos = 0
    for i, s in enumerate(segs):
        cuts.append(pos)
        if i in mid_lens:
            pos += mid_lens[i]
        else:
            pos += lens[i]
    if pos != n:
        return None
    chars = []
    for c in cuts:
        chars.append(len(word) if c >= n else sk[c][1])
    chars[0] = 0
    # a tatweel that carries the next letter's marks belongs to the right-hand segment
    for k in range(1, len(chars)):
        left = word[chars[k - 1]:chars[k]]
        t = left.rfind(TATWEEL)
        if t > 0 and all(is_mark(c) for c in left[t:]):
            chars[k] -= len(left) - t
    out = []
    for k, start in enumerate(chars):
        end = chars[k + 1] if k + 1 < len(chars) else len(word)
        out.append(word[start:end])
    if "".join(out) != word or any(not x and segs[i]["form"] for i, x in enumerate(out)):
        return None
    return out


def load_morphology():
    words = {}
    path = os.path.join(CACHE, "qm.txt")
    for line in open(path, encoding="utf8"):
        line = line.rstrip("\n")
        if not line:
            continue
        loc, form, pos, feat = line.split("\t")
        s, a, w, _g = map(int, loc.split(":"))
        tags = feat.split("|")
        seg = {"form": form, "pos": pos, "tags": tags,
               "pref": "PREF" in tags, "suff": "SUFF" in tags, "lem": None, "root": None}
        for t in tags:
            if t.startswith("LEM:"):
                seg["lem"] = t[4:]
            elif t.startswith("ROOT:"):
                seg["root"] = t[5:]
        words.setdefault((s, a, w), []).append(seg)
    return words


def strip_footnotes(html):
    t = re.sub(r"<sup[^>]*>.*?</sup>", "", html or "", flags=re.S)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", t).strip()


def load_quran():
    chapters = json.load(open(os.path.join(CACHE, "quran", "chapters.json"), encoding="utf8"))
    verses = {}
    for ch in chapters:
        for v in json.load(open(os.path.join(CACHE, "quran", f"ch{ch['id']:03d}.json"), encoding="utf8")):
            s, a = map(int, v["verse_key"].split(":"))
            words = []
            for w in v["words"]:
                if w["char_type_name"] != "word":
                    continue
                word, signs = split_token_text(w["text_uthmani"], w.get("location", ""))
                words.append({
                    "ar": word, "signs": signs, "pos": w["position"],
                    "gloss": (w.get("translation") or {}).get("text") or "",
                    "tr": (w.get("transliteration") or {}).get("text") or "",
                })
            tr = ""
            if v.get("translations"):
                tr = strip_footnotes(v["translations"][0]["text"])
            verses[(s, a)] = {"words": words, "tr": tr, "juz": v.get("juz_number"), "page": v.get("page_number")}
    return chapters, verses
