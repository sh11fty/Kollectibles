"""Small rule-based transliteration of fully vowelled Arabic into friendly Latin letters."""
import unicodedata

CONS = {
    "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r",
    "ز": "z", "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "ʿ", "غ": "gh",
    "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "ة": "h", "ء": "ʾ",
    "أ": "ʾ", "إ": "ʾ", "ؤ": "ʾ", "ئ": "ʾ", "و": "w", "ي": "y", "ى": "ā", "ٱ": "", "آ": "ʾā",
}
FATHA, DAMMA, KASRA = "َ", "ُ", "ِ"
TANWIN = {"ً": "an", "ٌ": "un", "ٍ": "in"}
SHADDA, SUKUN, DAGGER, MADDA = "ّ", "ْ", "ٰ", "ٓ"
MARKS = {FATHA, DAMMA, KASRA, SHADDA, SUKUN, DAGGER, MADDA, "ٔ", "ٕ"} | set(TANWIN)


def clusters(word):
    out = []
    for ch in word:
        if ch in MARKS or unicodedata.category(ch) == "Mn" or ch in ("ـ", "ۥ", "ۦ"):
            if out:
                out[-1][1].append(ch)
        else:
            out.append([ch, []])
    return out


def _lengthens(c):
    """True for a following ا / ى that just lengthens the previous short vowel."""
    return c and c[0] in "اى" and all(m in (DAGGER, MADDA) for m in c[1])


def transliterate(word):
    word = word.replace("\u0640", "")
    plain = "".join(ch for ch in word if ch not in MARKS and unicodedata.category(ch) != "Mn").replace("ٱ", "ا")
    if plain in ("الله", "لله"):
        return "Allāh"
    cl = clusters(word)
    prefix = ""
    # definite article: al- / as- / ar- ... (sun-letter assimilation)
    if len(cl) > 3 and cl[0][0] in "اٱ" and cl[1][0] == "ل" and not cl[1][1] or (len(cl) > 3 and cl[0][0] in "اٱ" and cl[1][0] == "ل" and cl[1][1] == [SUKUN]):
        nxt = cl[2]
        base = CONS.get(nxt[0], nxt[0])
        if SHADDA in nxt[1]:
            prefix = "a" + base + "-"
            nxt[1] = [m for m in nxt[1] if m != SHADDA]
        else:
            prefix = "al-"
        cl = cl[2:]
    res = []
    for i, (ch, marks) in enumerate(cl):
        if ch == "":
            continue
        nxt = cl[i + 1] if i + 1 < len(cl) else None
        prev = cl[i - 1] if i > 0 else None
        has = lambda m: m in marks  # noqa: E731
        if ch in "اٱ":
            if i == 0 and not prefix:
                res.append("a")
            elif prev and prev[0] != "" and (FATHA in prev[1] or DAGGER in prev[1] or not prev[1]):
                if not res or not res[-1].endswith("ā"):
                    res.append("ā")
            continue
        if ch == "و" and not marks and prev and DAMMA in prev[1]:
            res.append("ū")
            continue
        if ch == "ي" and not marks and prev and KASRA in prev[1]:
            res.append("ī")
            continue
        base = CONS.get(ch, ch)
        if ch == "آ":
            base = "ā" if i == 0 and not prefix else "ʾā"
        if i == 0 and not prefix and base == "ʾ":
            base = ""
        s = base
        if has(SHADDA) and base and len(base) == 1:
            s = base + base
        vowel = ""
        if has(FATHA):
            vowel = "a"
        elif has(DAMMA):
            vowel = "u"
        elif has(KASRA):
            vowel = "i"
        for t, v in TANWIN.items():
            if t in marks:
                vowel = v
        if has(DAGGER) or has(MADDA):
            vowel = "ā"
        if vowel == "a" and _lengthens(nxt):
            vowel = "ā"
            cl[i + 1] = ["", []]
        elif vowel == "an" and nxt and nxt[0] in "اى" and not nxt[1]:
            cl[i + 1] = ["", []]
        elif vowel == "u" and nxt and nxt[0] == "و" and not nxt[1]:
            vowel = "ū"
            cl[i + 1] = ["", []]
        elif vowel == "i" and nxt and nxt[0] == "ي" and not nxt[1]:
            vowel = "ī"
            cl[i + 1] = ["", []]
        if ch == "ى":
            s, vowel = "", ("ā" if not (prev and TANWIN["\u064B"] in prev[1]) else "")
        if ch == "ة":
            s = "h" if (not marks or SUKUN in marks) else "t"
        res.append(s + vowel)
    out = prefix + "".join(res)
    return out.replace("ʾʾ", "ʾ")
