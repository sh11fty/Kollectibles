#!/usr/bin/env python3
"""Layla and the Magic Words - a 3 minute animated Islamic story for kids.
Renders frames with pycairo, voice with espeak-ng (mbrola), music with numpy, muxes with ffmpeg."""
import math, os, subprocess, wave, random, sys
import numpy as np
import cairo

W, H, FPS = 1280, 720, 24
OUT = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(OUT, "build")
os.makedirs(TMP, exist_ok=True)

# (spoken text, caption, scene id) -- spoken uses phonetic spellings
SCENES = [
 ("title", "Assalamu alaikum, little friends! Try using them every day, and watch the smiles grow. Welcome! Today's story is called, Layla and the Magic Words. Are you ready? Let's go! Grab your imagination, and come along with Layla for a very special day.",
  "Layla and the Magic Words"),
 ("morning", "One sunny morning, Layla woke up with a big stretch. The very first thing she said was, Alhamdulillah. That means, All praise and thanks belong to Allah. Thank you Allah, for giving me a brand new day! Every morning is a gift from Allah, and we should always say thank you.",
  "Alhamdulillah - Thank you Allah!"),
 ("breakfast", "Mama made a yummy breakfast. Warm bread, honey, and juicy dates. Before Layla took a bite, she said, Bismillah. That means, In the name of Allah. Can you say it with me? Bismillah! Wonderful! Saying Bismillah reminds us that every good thing comes from Allah, so we begin with His name.",
  "Bismillah - In the name of Allah"),
 ("share", "Suddenly, Layla heard a tiny meow. It was Mimi, the little cat, and she was so hungry! Layla shared her breakfast with Mimi. Our Prophet, peace be upon him, taught us to be kind to every living creature. Sharing makes Allah happy, and it makes our hearts happy too! Mimi purred, and Layla giggled. Even a little cat can teach us about being kind.",
  "Be kind to all of Allah's creatures"),
 ("greet", "After breakfast, Layla went outside and saw her neighbor. She smiled and said, Assalamu alaikum! That means, peace be upon you. And her neighbor smiled back and said, Wa alaikum assalam! What a lovely way to say hello! Saying salam is a gift we give to everyone we meet, and it spreads love like sunshine.",
  "Assalamu alaikum - Peace be upon you"),
 ("help", "Her neighbor was carrying heavy bags. Layla ran to help. Her neighbor said, Jazakallahu khayran! That means, may Allah reward you with goodness. Layla felt warm and happy inside. Even a smile is a gift, a sadaqa, in Islam! When we help others, Allah helps us too.",
  "Jazakallahu khayran - May Allah reward you"),
 ("sunset", "The day went by so quickly. As the sun set, the sky turned orange and pink. It was time for Maghrib prayer. Layla and her family stood together to pray and thank Allah for everything. Allah is always with us, and Allah loves us very much. Layla felt calm, safe, and so thankful for her wonderful day.",
  "Allah loves us very much"),
 ("recap", "Let's remember our magic words together! Alhamdulillah, when we are thankful. Bismillah, before we eat or begin. Assalamu alaikum, when we meet someone. And Jazakallahu khayran, when someone is kind to us. Wonderful job, little friends!",
  "Our Magic Words"),
 ("bye", "Thank you for learning with us today. Always be kind, always be thankful, and always remember Allah. We love you, and we will see you next time. Fee amaanillah! Goodbye! May Allah bless you and your family.",
  "Fi amanillah - Goodbye!"),
]

# ---------------------------------------------------------------- audio
KOKORO_DIR = os.environ.get("KOKORO_DIR", ".")  # needs kokoro.onnx + voices.bin from
# https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
_kokoro = None
# Kokoro narrates in English; Arabic phrases are spoken by a native Arabic Piper voice
# (https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-ar_JO-kareem-medium.tar.bz2)
ARABIC_DIR = os.environ.get("ARABIC_DIR", "vits-piper-ar_JO-kareem-medium")
ARABIC = {
    "Assalamu alaikum": "السَّلَامُ عَلَيْكُمْ",
    "Wa alaikum assalam": "وَعَلَيْكُمُ السَّلَامُ",
    "Jazakallahu khayran": "جَزَاكَ اللَّهُ خَيْرًا",
    "Fee amaanillah": "فِي أَمَانِ اللَّهِ",
    "Alhamdulillah": "الْحَمْدُ لِلَّهِ",
    "Bismillah": "بِسْمِ اللَّهِ",
    "Allah": "اللَّهُ",
}
_ar = None
def arabic(text):
    global _ar
    import sherpa_onnx
    if _ar is None:
        cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
            model=f"{ARABIC_DIR}/ar_JO-kareem-medium.onnx", tokens=f"{ARABIC_DIR}/tokens.txt", data_dir=f"{ARABIC_DIR}/espeak-ng-data",
            length_scale=1.0), num_threads=2))
        _ar = sherpa_onnx.OfflineTts(cfg)
    g = _ar.generate(text, sid=0, speed=1.0)
    return np.array(g.samples, dtype=np.float32), g.sample_rate

def resample(x, a, b):
    if a == b: return x
    t = np.arange(int(len(x) * b / a)) * a / b
    return np.interp(t, np.arange(len(x)), x).astype(np.float32)

_kokoro = None
def tts(i, text):
    global _kokoro
    import re, soundfile as sf
    from kokoro_onnx import Kokoro
    if _kokoro is None:
        _kokoro = Kokoro(os.path.join(KOKORO_DIR, "kokoro.onnx"), os.path.join(KOKORO_DIR, "voices.bin"))
    pat = "(" + "|".join(sorted(ARABIC, key=len, reverse=True)) + ")"
    chunks, sr = [], 24000
    gap = np.zeros(int(.12 * sr), dtype=np.float32)
    for part in re.split(pat, text):
        if not part.strip(): continue
        if part in ARABIC:
            x, xsr = arabic(ARABIC[part])
            x = resample(x, xsr, sr); x = x / (np.abs(x).max() + 1e-6) * 0.8
            chunks += [gap, x, gap]
        else:
            x, _ = _kokoro.create(part, voice="am_michael", speed=1.05, lang="en-us")
            chunks.append(x)
    samples = np.concatenate(chunks)
    wav = os.path.join(TMP, f"s{i}.wav")
    sf.write(wav, samples, sr)
    return wav, len(samples) / sr, sr

PAD_START, PAD_END = 0.7, 0.9
voices = [tts(i, s[1]) for i, s in enumerate(SCENES)]
durs = [v[1] + PAD_START + PAD_END for v in voices]
starts = np.cumsum([0] + durs)
TOTAL = float(starts[-1])
print("scene durations", [round(d, 1) for d in durs], "total", round(TOTAL, 1))
NF = int(TOTAL * FPS)

SR = 44100
def build_audio():
    n = int(TOTAL * SR) + SR
    voice = np.zeros(n, dtype=np.float32)
    for i, (wav, d, sr) in enumerate(voices):
        with wave.open(wav) as w:
            x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        # resample to SR
        t = np.arange(int(len(x) * SR / sr)) * sr / SR
        x = np.interp(t, np.arange(len(x)), x)
        x = x / (np.abs(x).max() + 1e-6) * 0.9
        s = int((starts[i] + PAD_START) * SR)
        voice[s:s + len(x)] += x.astype(np.float32)
    # gentle lullaby: pentatonic music box
    music = np.zeros(n, dtype=np.float32)
    scale = [0, 2, 4, 7, 9]
    base = 261.63
    rng = random.Random(7)
    prog = [[0, 4, 7], [9, 0, 4], [5, 9, 0], [7, 11, 2]]  # C Am F G (semitones)
    beat = 0.5
    t0, bar = 0.0, 0
    while t0 < TOTAL:
        chord = prog[bar % 4]
        for k in range(8):
            if rng.random() < 0.8:
                semi = scale[rng.choice([0, 1, 2, 3, 4])] + 12 * rng.choice([0, 1])
                f = base * 2 ** (semi / 12) * (2 if rng.random() < .3 else 1)
            else:
                f = None
            tt = t0 + k * beat
            if f:
                L = int(0.9 * SR); tx = np.arange(L) / SR
                note = (np.sin(2*np.pi*f*tx) + .3*np.sin(2*np.pi*2*f*tx)) * np.exp(-tx * 4.5) * 0.08
                s = int(tt * SR)
                if s + L < n: music[s:s+L] += note.astype(np.float32)
        # soft pad
        L = int(4 * SR); tx = np.arange(L) / SR
        env = np.minimum(tx / .5, 1) * np.exp(-tx * .5)
        for semi in chord:
            f = base / 2 * 2 ** (semi / 12)
            pad = np.sin(2*np.pi*f*tx) * env * 0.035
            s = int(t0 * SR)
            if s + L < n: music[s:s+L] += pad.astype(np.float32)
        t0 += 4.0; bar += 1
    mix = voice + music * 0.9
    mix = np.clip(mix / max(1.0, np.abs(mix).max()) * 0.95, -1, 1)
    pcm = (mix[: int(TOTAL * SR)] * 32767).astype(np.int16)
    path = os.path.join(TMP, "audio.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    return path

# ---------------------------------------------------------------- drawing helpers
def ease(x): x = max(0, min(1, x)); return x * x * (3 - 2 * x)
def rgb(h):
    if len(h) == 4: h = '#' + ''.join(ch*2 for ch in h[1:])
    return tuple(int(h[i:i+2], 16) / 255 for i in (1, 3, 5))
def circ(c, x, y, r, col, a=1):
    c.set_source_rgba(*rgb(col), a); c.arc(x, y, r, 0, 2*math.pi); c.fill()
def ell(c, x, y, rx, ry, col, a=1):
    c.save(); c.translate(x, y); c.scale(rx, ry); c.set_source_rgba(*rgb(col), a)
    c.arc(0, 0, 1, 0, 2*math.pi); c.restore(); c.fill()
def rrect(c, x, y, w, h, r, col, a=1):
    c.set_source_rgba(*rgb(col), a)
    c.new_sub_path()
    c.arc(x+w-r, y+r, r, -math.pi/2, 0); c.arc(x+w-r, y+h-r, r, 0, math.pi/2)
    c.arc(x+r, y+h-r, r, math.pi/2, math.pi); c.arc(x+r, y+r, r, math.pi, 1.5*math.pi)
    c.close_path(); c.fill()
def gradient(c, top, bot, y0=0, y1=H):
    g = cairo.LinearGradient(0, y0, 0, y1)
    g.add_color_stop_rgb(0, *rgb(top)); g.add_color_stop_rgb(1, *rgb(bot))
    c.set_source(g); c.rectangle(0, 0, W, H); c.fill()
def poly(c, pts, col, a=1):
    c.set_source_rgba(*rgb(col), a); c.move_to(*pts[0])
    for p in pts[1:]: c.line_to(*p)
    c.close_path(); c.fill()
def star(c, x, y, r, col, a=1, rot=0, n=5):
    pts = []
    for k in range(n*2):
        rr = r if k % 2 == 0 else r*0.45
        ang = rot - math.pi/2 + k*math.pi/n
        pts.append((x + rr*math.cos(ang), y + rr*math.sin(ang)))
    poly(c, pts, col, a)
def heart(c, x, y, s, col, a=1):
    c.set_source_rgba(*rgb(col), a); c.save(); c.translate(x, y); c.scale(s, s)
    c.move_to(0, .3); c.curve_to(-1, -.4, -.5, -1, 0, -.45); c.curve_to(.5, -1, 1, -.4, 0, .3)
    c.restore(); c.fill()
def crescent(c, x, y, r, col, a=1):
    c.save(); c.push_group()
    c.set_source_rgb(*rgb(col)); c.arc(x, y, r, 0, 2*math.pi); c.fill()
    c.set_operator(cairo.OPERATOR_CLEAR); c.arc(x + r*.45, y - r*.15, r*.85, 0, 2*math.pi); c.fill()
    c.pop_group_to_source(); c.paint_with_alpha(a); c.restore()
def cloud(c, x, y, s, a=1):
    for dx, dy, r in [(-40, 6, 28), (-10, -10, 36), (28, -2, 30), (55, 8, 22), (-60, 12, 20)]:
        circ(c, x+dx*s, y+dy*s, r*s, "#ffffff", a)
    rrect(c, x-70*s, y+6*s, 140*s, 26*s, 13*s, "#ffffff", a)

def text(c, s, x, y, size, col="#ffffff", bold=True, align="c", shadow=True, font="DejaVu Sans"):
    c.select_font_face(font, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    c.set_font_size(size)
    e = c.text_extents(s)
    px = x - e.width/2 - e.x_bearing if align == "c" else x
    if shadow:
        c.set_source_rgba(0, 0, 0, .35); c.move_to(px+3, y+3); c.show_text(s)
    c.set_source_rgba(*rgb(col), 1); c.move_to(px, y); c.show_text(s)

def wrap(c, s, size, maxw):
    c.select_font_face("DejaVu Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD); c.set_font_size(size)
    lines, cur = [], ""
    for w in s.split():
        t = (cur + " " + w).strip()
        if c.text_extents(t).width > maxw and cur: lines.append(cur); cur = w
        else: cur = t
    return lines + [cur]

def caption(c, s, t):
    a = ease(t / .5) * ease((SCENE_T - t) / .5) if False else ease(t / .5)
    c.save(); c.push_group()
    rrect(c, 120, H-96, W-240, 70, 35, "#000000", .45)
    text(c, s, W/2, H-50, 30, "#fff8d6", shadow=False)
    c.pop_group_to_source(); c.paint_with_alpha(a); c.restore()

def pop(t, delay=0, dur=.5):  # bounce-in scale 0->1
    x = (t - delay) / dur
    if x <= 0: return 0.0001
    if x >= 1: return 1
    return max(0.0001, ease(x) * (1 + .15 * math.sin(x * math.pi)))

# ---------------------------------------------------------------- characters
def layla(c, x, y, s=1, t=0, mood="happy", arms="down", mouth_open=False, scarf="#ff8fb1", dress="#7c5cff"):
    bob = math.sin(t * 3) * 3 * s
    c.save(); c.translate(x, y + bob); c.scale(s, s)
    # shadow
    ell(c, 0, 150 - bob/s, 70, 12, "#000000", .15)
    # dress
    poly(c, [(-45, 20), (45, 20), (78, 145), (-78, 145)], dress)
    rrect(c, -78, 135, 156, 14, 7, "#ffffff", .25)
    # arms
    skin = "#f2c29b"
    if arms == "up":
        ang = math.sin(t * 5) * .15
        for sx in (-1, 1):
            c.save(); c.translate(sx*48, 35); c.rotate(sx * (-2.3 + ang))
            rrect(c, -9, 0, 18, 70, 9, dress); circ(c, 0, 72, 12, skin); c.restore()
    elif arms == "pray":
        for sx in (-1, 1):
            c.save(); c.translate(sx*40, 40); c.rotate(sx * -.55)
            rrect(c, -9, 0, 18, 55, 9, dress); c.restore()
        circ(c, 0, 80, 14, skin)
    elif arms == "wave":
        c.save(); c.translate(-48, 35); c.rotate(.3); rrect(c, -9, 0, 18, 70, 9, dress); circ(c, 0, 72, 12, skin); c.restore()
        c.save(); c.translate(48, 35); c.rotate(-2.4 + math.sin(t * 9) * .4); rrect(c, -9, 0, 18, 70, 9, dress); circ(c, 0, 72, 12, skin); c.restore()
    else:
        for sx in (-1, 1):
            c.save(); c.translate(sx*48, 35); c.rotate(sx * .25)
            rrect(c, -9, 0, 18, 70, 9, dress); circ(c, 0, 72, 12, skin); c.restore()
    # head w/ scarf
    circ(c, 0, -35, 62, scarf)
    poly(c, [(-60, -20), (60, -20), (70, 50), (0, 60), (-70, 50)], scarf)
    ell(c, 0, -30, 44, 46, skin)
    # eyes
    blink = (t % 3.2) > 3.05
    for sx in (-1, 1):
        if blink:
            c.set_source_rgb(.15, .1, .1); c.set_line_width(4); c.move_to(sx*18-8, -32); c.line_to(sx*18+8, -32); c.stroke()
        else:
            circ(c, sx*18, -32, 8, "#2b1b17"); circ(c, sx*18+3, -35, 3, "#ffffff")
    ell(c, -30, -15, 9, 6, "#ff9a9a", .55); ell(c, 30, -15, 9, 6, "#ff9a9a", .55)
    c.set_source_rgb(.55, .2, .2); c.set_line_width(4)
    if mouth_open:
        ell(c, 0, -5, 11, 8 + 4*abs(math.sin(t*12)), "#7a2a2a")
    else:
        c.arc(0, -10, 14, .2, math.pi-.2); c.stroke()
    c.restore()

def mimi(c, x, y, s=1, t=0, happy=True):
    c.save(); c.translate(x, y); c.scale(s, s)
    ell(c, 0, 40, 60, 10, "#000000", .15)
    wag = math.sin(t * 4) * .4
    c.save(); c.translate(50, 15); c.rotate(wag - 1.0)
    rrect(c, -8, -80, 16, 80, 8, "#ff9d3c"); c.restore()
    ell(c, 0, 10, 52, 34, "#ffb35c")
    for sx in (-1, 1):
        rrect(c, sx*28-9, 28, 18, 18, 9, "#ffb35c")
    circ(c, -42, -22, 32, "#ffb35c")
    poly(c, [(-68, -40), (-62, -75), (-42, -50)], "#ffb35c"); poly(c, [(-18, -40), (-24, -75), (-44, -50)], "#ffb35c")
    poly(c, [(-64, -45), (-61, -66), (-50, -52)], "#ff9a9a"); poly(c, [(-22, -45), (-25, -66), (-36, -52)], "#ff9a9a")
    for sx in (-52, -32):
        if happy and int(t) % 4 == 3: pass
        circ(c, sx, -26, 5, "#2b1b17"); circ(c, sx+1.5, -28, 1.8, "#fff")
    poly(c, [(-45, -17), (-39, -17), (-42, -12)], "#e8647a")
    c.set_source_rgb(.3, .2, .15); c.set_line_width(2)
    c.arc(-45, -12, 4, 0, math.pi); c.stroke(); c.arc(-39, -12, 4, 0, math.pi); c.stroke()
    for sy in (-14, -8):
        for sx in (-1, 1):
            c.move_to(-42 + sx*10, sy); c.line_to(-42 + sx*34, sy + sx*2 - 2); c.stroke()
    c.restore()

def mama_silhouette(c, x, y, s=1, t=0, col="#7a5a8c"):
    c.save(); c.translate(x, y); c.scale(s, s)
    poly(c, [(-40, 0), (40, 0), (70, 170), (-70, 170)], col)
    circ(c, 0, -30, 52, "#5a3d6b"); poly(c, [(-52, -20), (52, -20), (58, 40), (0, 50), (-58, 40)], "#5a3d6b")
    ell(c, 0, -22, 36, 38, "#f2c29b")
    for sx in (-1, 1): circ(c, sx*14, -24, 6, "#2b1b17"); circ(c, sx*14+2, -26, 2, "#fff")
    c.set_source_rgb(.55, .2, .2); c.set_line_width(3.5); c.arc(0, -8, 11, .2, math.pi-.2); c.stroke()
    c.restore()

def neighbor(c, x, y, s=1, t=0, bags=False):
    bob = math.sin(t * 3) * 3
    c.save(); c.translate(x, y + bob); c.scale(s, s)
    ell(c, 0, 165 - bob, 70, 10, "#000000", .15)
    poly(c, [(-45, 15), (45, 15), (72, 160), (-72, 160)], "#3fb38a")
    circ(c, 0, -35, 58, "#f5f1e8"); poly(c, [(-56, -20), (56, -20), (64, 45), (0, 55), (-64, 45)], "#f5f1e8")
    ell(c, 0, -28, 40, 42, "#d9a47c")
    for sx in (-1, 1): circ(c, sx*16, -30, 7, "#2b1b17"); circ(c, sx*16+2, -32, 2.5, "#fff")
    c.set_source_rgb(.5, .2, .2); c.set_line_width(4); c.arc(0, -12, 13, .2, math.pi-.2); c.stroke()
    for sx in (-1, 1):
        c.save(); c.translate(sx*46, 30); c.rotate(sx * .2); rrect(c, -9, 0, 18, 70, 9, "#3fb38a"); circ(c, 0, 72, 12, "#d9a47c"); c.restore()
    if bags:
        for sx, col in ((-60, "#e9a23b"), (60, "#d9534f")):
            rrect(c, sx-26, 100, 52, 62, 10, col)
            c.set_source_rgb(.3, .2, .1); c.set_line_width(4); c.arc(sx, 100, 14, math.pi, 2*math.pi); c.stroke()
    c.restore()

# ---------------------------------------------------------------- scenes
def sky_stars(c, t, n=40, a=1.0):
    r = random.Random(3)
    for _ in range(n):
        x, y, p = r.uniform(0, W), r.uniform(0, H*.55), r.uniform(0, 6)
        circ(c, x, y, 2 + 1.5*math.sin(t*3 + p), "#fff6c8", a*(.6 + .4*math.sin(t*2+p)))

def hills(c, base, col1="#6cc070", col2="#52a85c", t=0):
    c.set_source_rgb(*rgb(col2)); c.move_to(0, base)
    for x in range(0, W+20, 20): c.line_to(x, base - 50 + 40*math.sin(x/190 + 1))
    c.line_to(W, H); c.line_to(0, H); c.fill()
    c.set_source_rgb(*rgb(col1)); c.move_to(0, base+70)
    for x in range(0, W+20, 20): c.line_to(x, base + 20 + 30*math.sin(x/130 + 3))
    c.line_to(W, H); c.line_to(0, H); c.fill()

def flower(c, x, y, t, col="#ff7aa8", s=1):
    sw = math.sin(t*2 + x) * 3
    c.set_source_rgb(.2, .55, .25); c.set_line_width(4); c.move_to(x, y); c.line_to(x+sw, y-40*s); c.stroke()
    for k in range(5):
        a = k * 2*math.pi/5
        circ(c, x+sw+12*s*math.cos(a), y-40*s+12*s*math.sin(a), 8*s, col)
    circ(c, x+sw, y-40*s, 7*s, "#ffe066")

def mosque(c, x, y, s, col="#2f3e7e", windows=True):
    c.save(); c.translate(x, y); c.scale(s, s)
    rrect(c, -120, -80, 240, 80, 6, col)
    c.set_source_rgb(*rgb(col)); c.arc(0, -80, 80, math.pi, 2*math.pi); c.fill()
    rrect(c, -4, -190, 8, 40, 3, col); crescent(c, 0, -200, 14, "#ffd54a")
    for sx in (-1, 1):
        rrect(c, sx*150-15, -170, 30, 170, 4, col)
        c.set_source_rgb(*rgb(col)); c.arc(sx*150, -170, 15, math.pi, 2*math.pi); c.fill()
        poly(c, [(sx*150-3, -210), (sx*150+3, -210), (sx*150, -240)], col)
    if windows:
        for wx in (-80, -30, 30, 80): rrect(c, wx-9, -60, 18, 40, 9, "#ffd54a", .9)
    c.restore()

def scene_title(c, t):
    gradient(c, "#79d2ff", "#d4f1ff")
    sun_a = t
    c.save(); c.translate(1050, 150); c.rotate(t*.3)
    for k in range(12):
        c.rotate(math.pi/6); rrect(c, 70, -6, 40, 12, 6, "#ffe066", .8)
    c.restore(); circ(c, 1050, 150, 58, "#ffd23f")
    for i, (cx, cy, sp) in enumerate([(200, 120, 14), (620, 80, 9), (900, 230, 12)]):
        cloud(c, (cx + t*sp) % (W+300) - 100, cy, 1.3)
    hills(c, 520)
    for fx in range(60, W, 110): flower(c, fx, 620 + (fx % 3)*20, t, ["#ff7aa8", "#ffd23f", "#ff9a5c", "#b98cff"][fx//110 % 4])
    mosque(c, 330, 520, .8, "#8a74d6")
    s = pop(t, .2, .8)
    c.save(); c.translate(W/2, 230); c.scale(s, s)
    text(c, "Layla and", 0, 0, 76, "#ff5c8a"); text(c, "the Magic Words", 0, 90, 76, "#7c5cff")
    c.restore()
    text(c, "An Islamic story for kids", 450, 395, 34, "#ffffff") if t > 1.2 else None
    layla(c, 860, 500, 1.15, t, arms="wave", mouth_open=t > .7)
    mimi(c, 980, 600, 1.0, t)
    crescent(c, 150, 90, 38, "#ffd23f"); star(c, 205, 80, 14, "#ffd23f", rot=t)

def scene_morning(c, t):
    k = ease(t / 6)
    gradient(c, "#2b3a8c" if k < .5 else "#ffb36b", "#ff9a8b")
    top = np.array(rgb("#2b3a8c")); mid = np.array(rgb("#ff9a8b")); sky = np.array(rgb("#7fd3ff"))
    g = cairo.LinearGradient(0, 0, 0, H)
    g.add_color_stop_rgb(0, *(top*(1-k) + sky*k)); g.add_color_stop_rgb(1, *(np.array(rgb("#ff7b7b"))*(1-k) + np.array(rgb("#fff1c8"))*k))
    c.set_source(g); c.rectangle(0, 0, W, H); c.fill()
    sky_stars(c, t, a=1-k)
    sy = 560 - k*400
    for r_, a in ((130, .15), (95, .25)): circ(c, 900, sy, r_, "#fff1a8", a)
    circ(c, 900, sy, 62, "#ffd23f")
    cloud(c, (300 + t*10) % (W+300) - 100, 130, 1.2, .9)
    hills(c, 560, "#6cc070", "#52a85c")
    # house/room
    rrect(c, 90, 250, 520, 370, 18, "#fff2dc"); rrect(c, 90, 250, 520, 36, 18, "#e07a5f")
    rrect(c, 410, 330, 150, 150, 10, "#9ed8ff"); c.set_source_rgb(1, 1, 1); c.set_line_width(6)
    c.move_to(485, 330); c.line_to(485, 480); c.move_to(410, 405); c.line_to(560, 405); c.stroke()
    rrect(c, 130, 480, 230, 110, 18, "#5bb7e8"); rrect(c, 130, 450, 230, 60, 22, "#f7f7ff")
    # layla wakes and stretches
    up = ease((t-1)/1.5)
    layla(c, 245 + up*0, 520 - up*70, 1.0, t, arms="up" if t > 1.5 else "down", mouth_open=(t > 2 and t < 10))
    rrect(c, 130, 520, 230, 80, 18, "#5bb7e8")
    # floating alhamdulillah
    if t > 3:
        s = pop(t, 3, .8)
        c.save(); c.translate(820, 330 + math.sin(t*2)*8); c.scale(s, s)
        rrect(c, -250, -60, 500, 120, 50, "#ffffff", .9); text(c, "Alhamdulillah!", 0, 22, 62, "#ff5c8a", shadow=False); c.restore()
    for i in range(6):
        if t > 4:
            tt = (t*.5 + i/6) % 1
            heart(c, 700 + i*60, 430 - tt*250, 18, "#ff6b8b", 1 - tt)

def table(c):
    rrect(c, 0, 520, W, 200, 0, "#c98b57"); rrect(c, 0, 505, W, 30, 0, "#e3a971")

def food(c, t):
    ell(c, 430, 505, 150, 24, "#fff", 1); ell(c, 430, 498, 130, 16, "#f3e3c3")
    for i, dx in enumerate((-60, -20, 20, 60)): ell(c, 430+dx, 490, 20, 12, "#8a3b1d"); ell(c, 428+dx, 487, 8, 4, "#a9552c")
    ell(c, 760, 500, 60, 26, "#e9a23b"); ell(c, 760, 490, 55, 18, "#ffd37a")
    circ(c, 920, 470, 30, "#ffd23f"); rrect(c, 905, 480, 30, 40, 6, "#fff2b3", .8)

def scene_breakfast(c, t):
    gradient(c, "#ffe9c7", "#ffd6a0")
    rrect(c, 80, 60, 260, 200, 14, "#9ed8ff"); c.set_source_rgb(1, 1, 1); c.set_line_width(6)
    c.move_to(210, 60); c.line_to(210, 260); c.move_to(80, 160); c.line_to(340, 160); c.stroke()
    circ(c, 250, 120, 26, "#ffd23f", .9)
    table(c)
    mama_silhouette(c, 1000, 330, 1.1, t)
    layla(c, 640, 330, 1.2, t, arms="down", mouth_open=(t > 4.5 and t < 12))
    food(c, t)
    if t > 3:
        s = pop(t, 3, .7)
        c.save(); c.translate(640, 140 + math.sin(t*2)*6); c.scale(s, s)
        rrect(c, -230, -65, 460, 120, 50, "#ffffff", .92); text(c, "Bismillah!", 0, 22, 66, "#7c5cff", shadow=False); c.restore()
    if t > 5 and t % 3 < 1.5:
        for i in range(8):
            a = i*math.pi/4 + t; star(c, 640 + 150*math.cos(a), 150 + 70*math.sin(a), 10, "#ffd23f", .9, rot=a)

def scene_share(c, t):
    gradient(c, "#ffe9c7", "#ffd6a0")
    table(c)
    layla(c, 520, 330, 1.2, t, arms="down", mouth_open=(t > 8 and t < 20))
    food(c, t)
    cx = 1250 - ease(t/2.5) * 400
    mimi(c, cx, 610, 1.15, t)
    if t > 2.5:
        s = pop(t, 2.5, .6)
        c.save(); c.translate(cx-40, 480 + math.sin(t*3)*5); c.scale(s, s)
        rrect(c, -70, -32, 140, 56, 28, "#ffffff", .95); text(c, "Meow!", 0, 12, 36, "#ff9d3c", shadow=False); c.restore()
    if t > 6:
        for i in range(7):
            tt = (t*.4 + i/7) % 1
            heart(c, 700 + i*50, 480 - tt*260, 20, "#ff6b8b", 1 - tt)
    if t > 10:
        s = pop(t, 10, .8)
        c.save(); c.translate(W/2, 150); c.scale(s, s)
        rrect(c, -380, -55, 760, 100, 50, "#ffffff", .92); text(c, "Sharing is caring!", 0, 22, 56, "#2fa66b", shadow=False); c.restore()

def scene_greet(c, t):
    gradient(c, "#79d2ff", "#d4f1ff")
    for cx, cy, sp in [(200, 120, 12), (700, 90, 8), (1000, 200, 10)]:
        cloud(c, (cx + t*sp) % (W+300) - 100, cy, 1.2)
    hills(c, 480)
    # houses
    for hx, col in ((140, "#ff9a8b"), (1060, "#ffd37a")):
        rrect(c, hx-110, 330, 220, 180, 8, col); poly(c, [(hx-130, 335), (hx, 230), (hx+130, 335)], "#b04b3b")
        rrect(c, hx-25, 410, 50, 100, 8, "#7a4a2a")
    rrect(c, 0, 600, W, 120, 0, "#b9a98f");
    for fx in range(40, W, 140): flower(c, fx, 580, t, ["#ff7aa8", "#ffd23f", "#b98cff"][fx//140 % 3])
    lx = 300 + ease(t/3) * 120
    layla(c, lx, 400, 1.15, t, arms="wave" if t > 3 else "down", mouth_open=(t > 4 and t < 14))
    nx = 1050 - ease(t/3) * 180
    neighbor(c, nx, 400, 1.15, t)
    if 4 < t < 12:
        s = pop(t, 4, .6)
        c.save(); c.translate(lx+40, 150); c.scale(s, s)
        rrect(c, -230, -45, 460, 85, 42, "#ffffff", .95); text(c, "Assalamu alaikum!", 0, 18, 40, "#7c5cff", shadow=False); c.restore()
    if t > 9:
        s = pop(t, 9, .6)
        c.save(); c.translate(nx-60, 150); c.scale(s, s)
        rrect(c, -290, -45, 580, 85, 42, "#ffffff", .95); text(c, "Wa alaikum assalam!", 0, 18, 40, "#2fa66b", shadow=False); c.restore()
    if t > 6:
        for i in range(5):
            tt = (t*.35 + i/5) % 1
            heart(c, 640 + i*30, 330 - tt*180, 16, "#ff6b8b", 1 - tt)

def scene_help(c, t):
    gradient(c, "#9be3ff", "#fef0cf")
    cloud(c, (400 + t*8) % (W+300) - 100, 120, 1.1)
    hills(c, 500, "#78c47b", "#5fae63")
    rrect(c, 0, 610, W, 110, 0, "#b9a98f")
    for fx in range(60, W, 160): flower(c, fx, 600, t, ["#ffd23f", "#ff7aa8"][fx//160 % 2])
    take = ease((t-2)/2.5)
    neighbor(c, 780, 400, 1.2, t, bags=(take < 1))
    # bags moving to layla
    if take > 0:
        for sx, col in ((-60, "#e9a23b"), (60, "#d9534f")):
            bx = 780 + sx + (400 - 780 - sx + (-60 if sx < 0 else 60)*0.6) * take
            by = 500 + (-30 * math.sin(take*math.pi))
            if take >= 1: bx = 400 + (sx*.5)
    layla(c, 450, 400, 1.2, t, arms="up" if t < 2 else "down", mouth_open=(t > 5 and t < 15))
    if take > .02:
        for sx, col in ((-30, "#e9a23b"), (30, "#d9534f")):
            bx = 780 + (-sx*2.5 - 0)*0  + (450 + sx - (780 + sx*2)) * take + sx*2
            rrect(c, bx-26, 485 - 25*math.sin(take*math.pi), 52, 62, 10, col)
    if t > 5:
        s = pop(t, 5, .7)
        c.save(); c.translate(780, 150); c.scale(s, s)
        rrect(c, -330, -55, 660, 100, 50, "#ffffff", .95); text(c, "Jazakallahu khayran!", 0, 22, 48, "#7c5cff", shadow=False); c.restore()
    if t > 8:
        s = pop(t, 8, .7)
        c.save(); c.translate(450, 255); c.scale(s, s)
        rrect(c, -190, -40, 380, 75, 38, "#fff4c2", .97); text(c, "A smile is Sadaqa", 0, 14, 36, "#d9822b", shadow=False); c.restore()
        for i in range(8):
            a = i*math.pi/4 + t*.8; star(c, 450 + 210*math.cos(a), 330 + 150*math.sin(a), 10, "#ffd23f", .9, rot=a)

def scene_sunset(c, t):
    k = ease(t/10)
    g = cairo.LinearGradient(0, 0, 0, H)
    c1 = np.array(rgb("#ff8a5c"))*(1-k) + np.array(rgb("#1d2a6e"))*k
    c2 = np.array(rgb("#ffd27a"))*(1-k) + np.array(rgb("#7b4aa8"))*k
    g.add_color_stop_rgb(0, *c1); g.add_color_stop_rgb(1, *c2)
    c.set_source(g); c.rectangle(0, 0, W, H); c.fill()
    sky_stars(c, t, 50, a=k)
    circ(c, 300, 300 + k*300, 70, "#ffe08a", 1-k*.8)
    crescent(c, 1000, 150, 50, "#fff3b0", k)
    hills(c, 560, "#3b6e57", "#2e5a49")
    mosque(c, 900, 600, 1.15, "#202b66")
    rrect(c, 0, 620, W, 100, 0, "#243b5a")
    # prayer mat + layla and mama
    rrect(c, 70, 560, 320, 80, 10, "#2fa6a0"); rrect(c, 85, 570, 290, 60, 8, "#43c6bd", .7)
    layla(c, 280, 420, 1.0, t, arms="pray", mouth_open=False)
    mama_silhouette(c, 150, 400, .95, t)
    if t > 6:
        for i in range(10):
            tt = (t*.3 + i/10) % 1
            heart(c, 120 + i*28, 360 - tt*220, 14, "#ffd2e6", (1-tt)*.9)
    if t > 3:
        a = ease((t-3)/1.5)
        c.save(); c.push_group(); rrect(c, 420, 120, 600, 90, 45, "#ffffff", .9)
        text(c, "Allah loves you!", 720, 185, 54, "#7c5cff", shadow=False); c.pop_group_to_source(); c.paint_with_alpha(a); c.restore()

def scene_recap(c, t):
    gradient(c, "#7c5cff", "#c7a8ff")
    for i in range(24):
        x = (i*97 + t*20) % W; y = (i*53 + t*10) % H
        star(c, x, y, 7 + (i % 3)*3, "#ffffff", .25, rot=t+i)
    text(c, "Our Magic Words", W/2, 105, 66, "#ffe066")
    items = [("Alhamdulillah", "Thank you Allah", "#ff8fb1"), ("Bismillah", "Before we start or eat", "#ffd23f"),
             ("Assalamu alaikum", "Peace be upon you", "#6ee7b7"), ("Jazakallahu khayran", "May Allah reward you", "#7dd3fc")]
    for i, (a, b, col) in enumerate(items):
        s = pop(t, 1.2 + i*1.6, .7)
        if s <= .001: continue
        y = 235 + i*120
        c.save(); c.translate(W/2, y); c.scale(s, s)
        rrect(c, -460, -50, 920, 100, 40, "#ffffff", .96); circ(c, -405, 0, 30, col)
        star(c, -405, 0, 20, "#ffffff", rot=t*2)
        text(c, a, -350, -2, 42, "#4a3aa8", align="l", shadow=False)
        text(c, b, -350, 38, 26, "#6b6b8a", bold=False, align="l", shadow=False)
        c.restore()
    layla(c, 1130, 540, .85, t, arms="wave", mouth_open=True)
    mimi(c, 150, 650, .8, t)

def scene_bye(c, t):
    k = ease(t/6)
    g = cairo.LinearGradient(0, 0, 0, H)
    g.add_color_stop_rgb(0, *rgb("#1d2a6e")); g.add_color_stop_rgb(1, *rgb("#7b4aa8"))
    c.set_source(g); c.rectangle(0, 0, W, H); c.fill()
    sky_stars(c, t, 70)
    crescent(c, 1050, 140, 60, "#fff3b0")
    hills(c, 560, "#3b6e57", "#2e5a49")
    mosque(c, 330, 600, 1.1, "#202b66")
    layla(c, 760, 460, 1.3, t, arms="wave", mouth_open=t < 9)
    mimi(c, 990, 620, 1.1, t)
    s = pop(t, .3, .8)
    c.save(); c.translate(W/2, 150); c.scale(s, s)
    text(c, "Fi Amanillah!", 0, 0, 90, "#ffe066"); c.restore()
    if t > 1.5: text(c, "Subscribe for more stories", W/2, 230, 36, "#ffffff")
    for i in range(10):
        tt = (t*.3 + i/10) % 1
        heart(c, 600 + i*45, 600 - tt*400, 18, "#ff9ec2", (1-tt)*.9)

DRAW = {"title": scene_title, "morning": scene_morning, "breakfast": scene_breakfast, "share": scene_share,
        "greet": scene_greet, "help": scene_help, "sunset": scene_sunset, "recap": scene_recap, "bye": scene_bye}

SCENE_T = 0
def render():
    global SCENE_T
    audio = build_audio()
    out = os.path.join(OUT, "layla_and_the_magic_words.mp4")
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", f"{W}x{H}",
                           "-r", str(FPS), "-i", "-", "-i", audio, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out],
                          stdin=subprocess.PIPE)
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    c = cairo.Context(surf)
    fo = cairo.FontOptions(); fo.set_antialias(cairo.ANTIALIAS_GRAY)
    sc = 0
    for f in range(NF):
        now = f / FPS
        while sc + 1 < len(SCENES) and now >= starts[sc+1]: sc += 1
        t = now - starts[sc]; SCENE_T = durs[sc]
        c.save(); c.set_source_rgb(0, 0, 0); c.paint()
        DRAW[SCENES[sc][0]](c, t)
        if SCENES[sc][0] not in ("title", "recap"): caption(c, SCENES[sc][2], t)
        # fades
        fade = min(1, t/.5, (durs[sc] - t)/.5)
        if fade < 1:
            c.set_source_rgba(0, 0, 0, 1 - fade); c.paint()
        c.restore()
        ff.stdin.write(surf.get_data())
        if f % 240 == 0: print(f"frame {f}/{NF}", flush=True)
    ff.stdin.close(); ff.wait()
    print("done", out)

if __name__ == "__main__":
    render()
