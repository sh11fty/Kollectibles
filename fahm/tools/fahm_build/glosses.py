"""Auto-generated meanings and example forms for cards that have no hand-written entry."""
import collections
import re

from .cards import clean_gloss

ARTICLE = re.compile(r"^(the|a|an)\s+", re.I)
POSSESSIVE = re.compile(r"^(his|her|their|your|my|our|its)\s+", re.I)
CONJ_LEAD = re.compile(r"^(and|so|then|but|indeed|certainly|verily|for)\s+", re.I)
SUBJECT = re.compile(r"^(he|she|it|they|you|we|i)\s+", re.I)


def is_bare(tok):
    return not any(s["pref"] for s in tok["segs"])


def only_pron_extras(tok):
    return all(k.startswith("pron:") for k in tok["others"]) and len(tok["others"]) <= 1


def auto_meaning(card, toks):
    """Best-effort short English meaning from the word-by-word glosses of this card's own words."""
    bare = [t for t in toks if is_bare(t) and not t["others"]]
    perf = [t for t in bare if "PERF" in t["segs"][0]["tags"] and "3MS" in t["segs"][0]["tags"]]
    pool = perf or bare
    cnt = collections.Counter()
    for t in pool:
        g = clean_gloss(t["gloss"])
        if g:
            cnt[g] += 1
    if not cnt:  # fall back to everything, stripping a leading conjunction
        for t in toks:
            g = CONJ_LEAD.sub("", clean_gloss(t["gloss"]))
            if g:
                cnt[g] += 1
    if not cnt:
        return ""
    best = cnt.most_common(1)[0][0]
    best = ARTICLE.sub("", best)
    if card.get("c") in ("n", "a"):
        best = POSSESSIVE.sub("", best)
    return best.strip(" ,;").lower()


def forms_for(card_key, toks, limit=4):
    """Up to `limit` real word shapes (no prefixes) with their usual English meaning."""
    by_form = collections.defaultdict(collections.Counter)
    n_form = collections.Counter()
    for t in toks:
        if not is_bare(t) or not only_pron_extras(t) or t["primary"] != card_key:
            continue
        g = clean_gloss(t["gloss"])
        if not g:
            continue
        by_form[t["ar"]][g] += 1
        n_form[t["ar"]] += 1
    out, seen = [], set()
    for ar, n in n_form.most_common():
        g = by_form[ar].most_common(1)[0][0]
        key = g.lower()
        if key in seen:
            continue
        if n < 2 and len(out) >= 2:
            break
        seen.add(key)
        out.append([ar, g])
        if len(out) >= limit:
            break
    return out
