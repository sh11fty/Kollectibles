<p align="center"><img src="docs/icon.svg" width="120" alt="Fahm icon"></p>

# Fahm — فهم

**Learn to understand the words of the Quran.** Not grammar, not speaking, not writing — only what you need to
look at a verse, recognise its words and the little connecting words, and know what it says.

- **Reading comprehension only.** About 1,200 hand-checked word cards cover roughly 90% of all the words in the Quran
  (counting every occurrence). The most frequent words come first, so progress is fast at the start.
- **Real verses from day one.** Lessons build towards passages you already know — Al-Fatiha, Al-Ikhlas, the last
  short surahs, Ayat al-Kursi, famous duas — and every session ends by reading a real verse.
- **Built for people who get bored and fall behind.** Short sessions (2–15 min, your choice), a different kind of
  exercise every few seconds, a streak with freezes, a "2-minute version" for busy days, backlog-friendly reviews
  ("Fresh start" spreads a pile of due words over a week), badges, a speed round, and gentle reminders that skip days you
  have finished and back off if you ignore them.
- **Works offline.** The whole Quran text, word meanings and the learning data are inside the app. Only the optional
  recitation audio streams from the internet.
- **Private.** No account, no ads, no tracking. Progress is stored on the phone; export it as a text backup code.
- **Updates itself.** New versions are published as GitHub releases; the app finds them and installs them in place,
  keeping your progress.

## Install

1. On your phone open the repository's **Releases** page and download `fahm.apk` from the newest `Fahm …` release.
2. Open the file. Android asks once to allow installs from your browser/files app — allow it.
3. Open Fahm and follow the short welcome.

Needs Android 8.0 or newer.

## Updating

Pick any one:

- **In the app:** *Me → Updates → Check for updates → Install.* (The app also checks quietly about twice a day and
  shows a banner on the Today screen.) The first time, Android asks you to allow Fahm to install updates.
- **Obtainium** (automatic, recommended if you already use it): add the repository URL, and under *Additional options*
  set **Filter release titles** to `^Fahm`. This keeps other projects' releases from this repository out of the way.
- **By hand:** download the newest `fahm.apk` and open it. It installs over the old one.

Updates always install in place because **every release is signed with the same key** (see below), the package name
never changes, and the version number only goes up (it is the build date, e.g. `26.10.12.1530`).

## Signing key (read this once)

Android only installs an update over an app if both are signed by the **same key**. A key that changes between builds
(the default "debug" key does) silently breaks updating. Fahm therefore uses one fixed key:

| | |
|---|---|
| Package | `com.fahm.quran` |
| Key alias | `fahm` |
| Certificate SHA-256 | `15:96:3A:7C:B7:EA:41:81:D0:AE:47:37:46:B6:95:D1:2F:3A:A4:9D:AB:C8:D0:3C:6C:A2:EE:ED:64:B8:DD:E0` |

The key file is deliberately **not committed** to this (public) repository. The build workflow reads it from two
**repository secrets** instead:

| Secret | Value |
|---|---|
| `FAHM_KEYSTORE_B64` | the key file (`fahm.jks`) encoded as base64 — one long line |
| `FAHM_KEYSTORE_PASSWORD` | its password (the key password is the same) |

Add them under **Settings → Secrets and variables → Actions → New repository secret**. Until both exist, the
workflow still builds, but only as a **preview** artifact (signed with a throwaway key, never released), so nobody can
accidentally publish a build that would break updates.

> **Keep a copy of the key file and its password somewhere safe** (a password manager). If they are lost, a new key can
> be made, but every installed copy of Fahm then has to be uninstalled before the new one installs — use
> *Me → Backup & restore* first to keep your progress.

To make a brand-new key (only if you must):

```sh
keytool -genkeypair -v -keystore fahm.jks -alias fahm -keyalg RSA -keysize 2048 -validity 36500 \
        -storepass 'CHOOSE-A-LONG-PASSWORD' -keypass 'CHOOSE-A-LONG-PASSWORD' -dname 'CN=Fahm'
base64 -w0 fahm.jks      # paste the output into FAHM_KEYSTORE_B64
```

For local release builds put `fahm.jks` and a `signing.properties` (`storeFile=fahm.jks`, `storePassword=…`) in
`android/keystore/` (both are git-ignored), or set `FAHM_KEYSTORE_PATH` / `FAHM_KEYSTORE_PASSWORD`.

## Your progress and backups

*Me → Backup & restore → Create backup code* turns your whole progress (words, streak, badges, settings) into a
text code. Paste it into *Restore* on any phone. Do it before switching phones or resetting the key.

## How the learning works

- **Cards.** Each card is one word, prefix (و، ب، ل …), pronoun or demonstrative. A word in a verse is "known" when
  you know every piece it is built from (for example *bismi* = بِ + اسْم), so progress is counted honestly.
- **Path.** 44 units and 211 lessons ordered by how much of the Quran each word unlocks. Units end at a passage
  you can then fully understand.
- **Sessions.** The planner fits a session into your daily minutes: due reviews first (never more than about half the
  time), then new words, then a real verse. If many reviews are waiting it teaches fewer new words so you catch up.
- **Exercises.** Meet a word (with a real verse and, where useful, its common forms), pick the meaning, pick the Arabic,
  meaning in a verse, fill the gap, recognise a word-shape, match pairs, choose the translation of a whole verse.
- **Spaced repetition.** A missed word comes back tomorrow; a known word returns after 1, 3, 7, 14 days and then
  stretches out. There is no "ease hell": it is meant for people who miss days.
- **Reading power.** The share of all Quran words you can read now, plus per-verse and per-surah progress. Tap any
  word in any verse for its meaning, its pieces and a one-tap lesson on what you are missing.

## Development

Everything runs without a build step (plain ES modules + Preact/htm, vendored in `web/vendor`).

```sh
cd fahm
node --test tests/*.test.js        # learning engine + updater unit tests (Node 20+)
node tests/serve.mjs               # run the app at http://127.0.0.1:8080/
node tests/e2e/run.mjs             # end-to-end walkthrough in headless Chromium (needs Playwright)
node tests/e2e/advanced.mjs        # a learner with progress: every exercise type, dark mode, settings

cd android
FAHM_VERSION_CODE=1 FAHM_VERSION_NAME=dev ./gradlew assembleRelease   # needs JDK 17 + Android SDK 34
```

| Folder | What is in it |
|---|---|
| `web/` | the app (HTML/CSS/JS) and its generated data (`web/data`) — packaged into the APK as assets |
| `web/js/core` | pure logic: cards, spaced repetition, planner, exercises, backup codes (unit-tested) |
| `web/js/ui` | screens and components |
| `android/` | thin Kotlin shell: WebView, haptics, reminders (AlarmManager), in-app updater |
| `tools/` | data pipeline (`fetch_sources.py`, `build_data.py`), hand-written vocabulary in `tools/vocab/`, icon generator |
| `tests/` | unit and end-to-end tests |

Rebuilding the data (`python3 -I tools/fetch_sources.py && python3 -I tools/build_data.py`) needs internet once and
keeps card numbers stable (`data/card_ids.json` is append-only), so nobody's progress is ever reassigned to a different
word.

## Where releases come from

`.github/workflows/fahm-apk.yml` runs tests, builds a signed APK on every push that touches Fahm, publishes it as
release `fahm-v<date>` with the asset `fahm.apk`, and keeps the 15 newest Fahm releases. It only ever touches Fahm's
own files and `fahm-v*` releases, so it can live next to other projects.

**Moving Fahm to its own repository:** copy the contents of this folder to the new repository's root, copy
`.github/workflows/fahm-apk.yml`, add the two secrets, push. Nothing needs editing — the workflow detects the layout and
the app learns its release repository from the build. (Phones with a build from the old repository need one manual
install of the first build from the new one; after that updates continue from the new place.)

## Credits and licences

See [DATA_SOURCES.md](DATA_SOURCES.md): Quran.com word-by-word data, the Quranic Arabic Corpus (GNU GPL v3), Saheeh
International translation, Amiri Quran font (SIL OFL), Preact and htm.
