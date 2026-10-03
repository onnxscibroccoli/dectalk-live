const VOICES = [
  { id: 0, name: "Paul", note: "Default. Even, mid, the Hawking base." },
  { id: 1, name: "Betty", note: "Brighter, higher, slightly faster feel." },
  { id: 2, name: "Harry", note: "Deep, older, more chest." },
  { id: 3, name: "Frank", note: "Aged, thinner, a little shaky." },
  { id: 4, name: "Dennis", note: "Nasal, precise, lecturer." },
  { id: 5, name: "Kit", note: "Child voice. Higher pitch, smaller." },
  { id: 6, name: "Ursula", note: "Woman, slight German coloring." },
  { id: 7, name: "Rita", note: "Woman, fuller, more presence." },
  { id: 8, name: "Wendy", note: "Softer, breathier, closer." },
];

const PRESETS = [
  { id: "hello", label: "Hello", text: "Hello. This is DECtalk, a Digital Equipment Corporation speech synthesizer. I was first sold in 1984." },
  { id: "hawking", label: "Hawking", text: "We are just an advanced breed of monkeys on a minor planet of a very average star. But we can understand the Universe. That makes us something very special." },
  { id: "ready", label: "Ready", text: "Unit online. Voice processor ready. Please enter text to speak." },
  { id: "clock", label: "Clock", text: "The time is 3:45 P.M. Temperature, 72 degrees. Have a pleasant afternoon." },
  { id: "sing", label: "Sing", text: `[:phoneme on]
[sow<150,28>ay<150,28>wwey<300,37>kkih<150,37>nnth<20>uh<150,37>mor<200,33>nnihn<100,33>ae<150,33>nndday<150,33>ssteh<200,28>pp]
[aw<300,28>ttssah<150,26>ay<150,25>ddae<200,25>nday<150,25>ttey<150,26>kkuh<150,26>ddiy<150,37>ppbr<20>eh<300,35>thae<300,33>]
[ndgeh<300,35>ttrih<300,37>llhxay<300,33>ae<150,33>nnay<150,33>sk<150,33>rEy<150,33>m<150,33>_<150>tuh<150,33>tteh<150,33>ttaw<150,33>ppuh<150,33>]
[ffmaa<200,33>lluh<300,33>nngs<150,35>_<150>wah<300,35>ssgow<150,35>ih<300,37>ngaw<450,33>nn<300,33>_<1200>]` },
];

const KEY = "dectalk-lab";

const $ = (id) => document.getElementById(id);

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function setStatus(kind, text) {
  const el = $("status");
  el.querySelector(".dot").className = `dot ${kind}`;
  el.querySelector(".label").textContent = text;
}

function publicUrl(path) {
  return new URL(path, import.meta.url).href;
}

let voice = 0;
let rate = 180;
let worker = null;
let nextId = 1;
const pending = new Map();
let lastWav = null;
let audio = null;
let objectUrl = null;
let audioCtx = null;
let analyser = null;
let waveData = null;
let visualizer = null;
let playing = false;
let busy = false;

function renderVoices() {
  const root = $("voices");
  root.innerHTML = "";
  for (const v of VOICES) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = v.name;
    if (v.id === voice) b.classList.add("on");
    b.addEventListener("click", () => {
      voice = v.id;
      $("voice-note").textContent = v.note;
      save({ text: $("utterance").value, voice, rate });
      renderVoices();
    });
    root.append(b);
  }
  $("voice-note").textContent = VOICES[voice].note;
}

function renderPresets() {
  const root = $("presets");
  root.innerHTML = "";
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p.label;
    b.addEventListener("click", () => {
      $("utterance").value = p.text;
      save({ text: p.text, voice, rate });
    });
    root.append(b);
  }
}

function startWorker() {
  return new Promise((resolve, reject) => {
    if (typeof SharedArrayBuffer === "undefined") {
      setStatus("bad", "Threads blocked");
      reject(new Error("This browser is not cross-origin isolated, so DECtalk’s threaded WebAssembly cannot run."));
      return;
    }
    worker = new Worker(publicUrl("./dectalk/bridge-worker.js"), { type: "module", name: "dectalk-bridge" });
    worker.onmessage = (ev) => {
      const msg = ev.data;
      if (msg.type === "ready") {
        setStatus("ok", "Engine ready");
        resolve();
        return;
      }
      if (msg.type === "result") {
        pending.get(msg.id)?.resolve(msg.wav);
        pending.delete(msg.id);
      } else if (msg.type === "error") {
        pending.get(msg.id)?.reject(new Error(msg.message));
        pending.delete(msg.id);
      }
    };
    worker.onerror = (ev) => {
      setStatus("bad", "Engine error");
      reject(new Error(ev.message || "DECtalk worker failed"));
    };
    worker.postMessage({ type: "init" });
  });
}

function synthesize(text) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ type: "synthesize", id, text, voice, rate });
  });
}

function wavToBlob(wav) {
  const copy = new ArrayBuffer(wav.byteLength);
  new Uint8Array(copy).set(wav);
  return new Blob([copy], { type: "audio/wav" });
}

function ensureGraph(el) {
  if (!audioCtx) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error("Web Audio API is not supported in this browser.");
    audioCtx = new AudioContextCtor();
    const source = audioCtx.createMediaElementSource(el);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.minDecibels = -92;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.8;
    waveData = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
  }
}

function drawWave() {
  const path = $("wave");
  const steps = 96;
  const width = 640;
  const height = 88;
  const tick = () => {
    const data = analyser && playing ? waveData : null;
    if (analyser && data) analyser.getByteTimeDomainData(data);
    const parts = [];
    for (let i = 0; i < steps; i++) {
      const v = data ? data[Math.floor((i / (steps - 1)) * (data.length - 1))] / 128 : 1;
      const x = (i / (steps - 1)) * width;
      const y = (v * 0.5 + 0.25) * height;
      parts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    path.setAttribute("d", parts.join(" "));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}


async function startVisualizer() {
  const stage = $("supersound-stage");
  if (!stage) return;
  try {
    const { createSupersoundVisualizer } = await import("./supersound.js");
    visualizer = createSupersoundVisualizer({
      stage,
      controls: $("visualizer"),
      getAnalyser: () => analyser,
      getAudioContext: () => audioCtx,
      isPlaying: () => playing,
    });
  } catch (err) {
    console.error("SUPERSOUND failed to initialize", err);
    const status = $("viz-source");
    if (status) status.textContent = "VISUAL OFF";
    stage.innerHTML = '<p class="visualizer-fallback">3D visualizer unavailable. DECtalk speech remains active.</p>';
  }
}

function notice(text) {
  const el = $("notice");
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = text;
}

async function speak() {
  if (busy) return;
  const text = $("utterance").value.trim();
  if (!text) {
    notice("Type something to speak.");
    return;
  }
  notice("");
  busy = true;
  $("speak").disabled = true;
  try {
    const wav = await synthesize(text);
    lastWav = wav;
    $("wav").disabled = false;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const blob = wavToBlob(wav);
    objectUrl = URL.createObjectURL(blob);
    if (!audio) audio = new Audio();
    audio.src = objectUrl;
    audio.onended = () => {
      playing = false;
      $("stop").disabled = true;
    };
    ensureGraph(audio);
    if (audioCtx.state === "suspended") await audioCtx.resume();
    await audio.play();
    playing = true;
    $("stop").disabled = false;
  } catch (err) {
    notice(err.message || "Could not synthesize.");
  } finally {
    busy = false;
    $("speak").disabled = false;
  }
}

function boot() {
  const saved = load();
  voice = saved.voice ?? 0;
  rate = saved.rate ?? 180;
  $("utterance").value = saved.text || PRESETS[0].text;
  $("rate").value = String(rate);
  $("rate-label").textContent = `${rate} wpm`;
  renderVoices();
  renderPresets();
  drawWave();
  void startVisualizer();

  $("rate").addEventListener("input", (e) => {
    rate = Number(e.target.value);
    $("rate-label").textContent = `${rate} wpm`;
    save({ text: $("utterance").value, voice, rate });
  });
  $("utterance").addEventListener("input", () => {
    save({ text: $("utterance").value, voice, rate });
  });
  $("speak").addEventListener("click", () => void speak());
  $("stop").addEventListener("click", () => {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    playing = false;
    $("stop").disabled = true;
  });
  $("wav").addEventListener("click", () => {
    if (!lastWav) return;
    const url = URL.createObjectURL(wavToBlob(lastWav));
    const a = document.createElement("a");
    a.href = url;
    a.download = `dectalk-${VOICES[voice].name.toLowerCase()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  });

  startWorker().catch((err) => notice(err.message));
}

window.addEventListener("beforeunload", () => {
  visualizer?.destroy?.();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

boot();
