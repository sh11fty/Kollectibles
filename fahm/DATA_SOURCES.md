# Data sources, credits and licences

Fahm stands on other people's careful work. Thank you to all of them.

| What | Source | Licence / terms |
|---|---|---|
| Arabic text of the Quran (Uthmani script), word-by-word meanings and transliteration | [Quran.com](https://quran.com) public API v4 (`api.quran.com`) | Quran.com's terms for non-commercial use; credit Quran.com |
| English translation | *The Quran — Saheeh International* (resource 20 on Quran.com) | © Saheeh International. Shown as an aid to understanding, as served by Quran.com; check the publisher's terms before redistributing the app widely |
| Word analysis: which forms belong to which word, prefixes, pronouns, lemmas, roots | [Quranic Arabic Corpus](https://corpus.quran.com) v0.4 by Kais Dukes, via the plain-text copy in [mustafa0x/quran-morphology](https://github.com/mustafa0x/quran-morphology) | GNU General Public License v3 — see below |
| Arabic font | [Amiri Quran](https://github.com/aliftype/amiri) by Khaled Hosny, subset to the characters used (`web/fonts/amiri-quran.woff2`, licence in `web/fonts/OFL.txt`) | SIL Open Font License 1.1 |
| User interface library | [Preact](https://preactjs.com) (MIT) and [htm](https://github.com/developit/htm) (Apache-2.0), vendored in `web/vendor/` | MIT / Apache-2.0 |
| Recitation audio (optional, streamed when you tap *Listen*) | [everyayah.com](https://everyayah.com) (verse by verse) and Quran.com's audio CDN (single words) | Belongs to the reciters and hosts; nothing is bundled in the app |

## What is original to Fahm

- The vocabulary curation in `tools/vocab/` (≈1,200 hand-written word entries: short meanings, usage notes, common
  forms) and the merge list that treats near-duplicate lemmas as one card.
- The learning path, passages (`tools/data/collections.json`, `tools/data/units.txt`) and the lesson ordering.
- The way a word in a verse is split into prefix / stem / pronoun pieces and mapped to cards (`tools/fahm_build/`).
- The app code, spaced-repetition scheduler, session planner and exercises.

## GNU GPL and the generated data

`web/data/` (the card list, the verse index and the per-surah verse files) is generated from the sources above,
including the GPL-licensed Quranic Arabic Corpus morphology. That data is therefore distributed under the terms of the
**GNU General Public License v3**; its source and the scripts that build it are in this repository
(`tools/fetch_sources.py`, `tools/build_data.py`). The vocabulary files and app code written for Fahm may be used
under the same terms.

## A note on the translation

A translation is a human attempt to convey meaning; it is not the Quran. Fahm shows it so you can check your own
understanding of the Arabic, and word meanings are deliberately short so they can be recognised at a glance. If a
meaning looks wrong or too narrow, the card's note and the root shown on the word's page give you a way to look
deeper.
