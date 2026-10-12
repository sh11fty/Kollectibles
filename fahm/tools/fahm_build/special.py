"""Hand-written cards for the pieces that are not ordinary dictionary words:
   little prefixes (and / so / in / for / the ...), the pronoun family and the demonstratives."""

# cat codes:  b = little attached piece, r = pronoun, c = connecting word, n/v/a/p = noun/verb/adjective/name
PREFIX_CARDS = {
    "pref:wa": dict(a="وَ", e="and", c="b", note="The most common tiny word. It glues onto the next word: وَقَالَ = and he said. It can also mean \"while\", or \"by\" when swearing an oath (وَالشَّمْسِ = by the sun)."),
    "pref:fa": dict(a="فَ", e="so / then / and", c="b", note="Links ideas that follow each other or shows a result: فَاعْبُدْهُ = so worship Him."),
    "pref:bi": dict(a="بِ", e="in / with / by", c="b", note="بِسْمِ = in the name (of). Also \"with\": بِالْحَقِّ = with the truth."),
    "pref:li": dict(a="لِ", e="for / to / belongs to", c="b", note="لِلَّهِ = for Allah / belongs to Allah. لَهُمْ = for them / they have."),
    "pref:ka": dict(a="كَ", e="like / as", c="b", note="كَمَثَلِ = like the example of."),
    "pref:al": dict(a="ٱلْ", e="the", c="b", note="Sticks to the front of a word to make it \"the\": كِتَاب = a book, الْكِتَاب = the book. Sometimes the next letter is doubled (ٱلشَّمْس) - just read straight through."),
    "pref:la": dict(a="لَ", e="indeed / surely", c="b", note="Adds emphasis and is usually left out in English: لَقَدْ = indeed (has)."),
    "pref:sa": dict(a="سَ", e="will", c="b", note="Puts a verb in the future: سَيَقُولُونَ = they will say."),
    "pref:ya": dict(a="يَا", e="O ...!", c="b", note="Calls someone: يَا أَيُّهَا النَّاسُ = O people! يَا قَوْمِ = O my people!"),
    "pref:a": dict(a="أَ", e="...? (question)", c="b", note="A question marker at the start of a sentence: أَلَمْ = did not...? أَفَلَا = then will you not...?"),
}

PRON_CARDS = {
    "3MS": dict(a="هُوَ · ـهُ", e="he / him / his / it", note="On its own: هُوَ = he. Glued to a word: كِتَابُهُ = his book, رَبُّهُ = his Lord, إِلَيْهِ = to him. Also the \"he\" ending of verbs."),
    "3FS": dict(a="هِيَ · ـهَا", e="she / her / it", note="Glued to a word, ـهَا = her / its: فِيهَا = in it, عَلَيْهَا = on it."),
    "3MP": dict(a="هُمْ · ـهُمْ", e="they / them / their", note="لَهُمْ = for them, قُلُوبُهُمْ = their hearts. The verb endings ـُوا and ـُونَ also mean \"they\": قَالُوا = they said."),
    "3FP": dict(a="هُنَّ · ـهُنَّ", e="they / them (women)", note="The female plural: فِيهِنَّ = in them."),
    "3D": dict(a="هُمَا · ـهُمَا", e="the two of them / both", note="Used when exactly two are meant."),
    "2MS": dict(a="أَنتَ · ـكَ", e="you (one person) / your", note="رَبُّكَ = your Lord, إِلَيْكَ = to you. Verb endings ـتَ / ـتُمْ show who is addressed."),
    "2FS": dict(a="أَنتِ · ـكِ", e="you (one woman) / your", note="Addressed to a woman: رَبُّكِ = your Lord."),
    "2MP": dict(a="أَنتُمْ · ـكُمْ", e="you (all) / your", note="لَكُمْ = for you (all), رَبُّكُمْ = your Lord. The verb endings ـُونَ / ـُوا / ـتُمْ often mean \"you (all)\"."),
    "2FP": dict(a="أَنتُنَّ · ـكُنَّ", e="you (women)", note="Rare: the female plural \"you\"."),
    "2D": dict(a="أَنتُمَا · ـكُمَا", e="you two", note="Used when exactly two are addressed (رَبِّكُمَا = your Lord, of you two)."),
    "1S": dict(a="أَنَا · ـي", e="I / me / my", note="رَبِّي = my Lord, إِنِّي = indeed I. After a verb ـنِي = me: اهْدِنِي = guide me."),
    "1P": dict(a="نَحْنُ · ـنَا", e="we / us / our", note="رَبَّنَا = our Lord, آتَيْنَا = we gave. When Allah says \"We\", it is this word."),
}

DEM_CARDS = {
    "dem:dhalika": dict(a="ذَٰلِكَ", e="that", c="c", note="ذَٰلِكَ الْكِتَابُ = that is the Book."),
    "dem:hadha": dict(a="هَٰذَا", e="this", c="c", note="هَٰذَا رَبِّي = this is my Lord."),
    "dem:hadhihi": dict(a="هَٰذِهِ", e="this (f.)", c="c", note="هَٰذِهِ الْأَنْهَارُ = these rivers; used for feminine things."),
    "dem:ulaika": dict(a="أُو۟لَٰٓئِكَ", e="those (people)", c="c", note="أُولَٰئِكَ هُمُ الْمُفْلِحُونَ = those are the successful."),
    "dem:haulai": dict(a="هَٰٓؤُلَآءِ", e="these (people)", c="c", note="هَٰؤُلَاءِ قَوْمُنَا = these are our people."),
    "dem:tilka": dict(a="تِلْكَ", e="that (f.)", c="c", note="تِلْكَ آيَاتُ اللَّهِ = those are the verses of Allah."),
}

PERSONS = {"3MS", "3FS", "3MP", "3FP", "3D", "2MS", "2FS", "2MP", "2FP", "2D", "1S", "1P"}
PERSON_ALIAS = {"3MD": "3D", "3FD": "3D", "2MD": "2D", "2FD": "2D"}
