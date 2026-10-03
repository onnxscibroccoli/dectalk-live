import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

const PRESETS = {
  orbital: { m1: 7, m2: 3, n11: 0.28, n12: 1.7, n13: 1.7, n21: 0.25, n22: 1.2, n23: 1.2 },
  chrysalis: { m1: 5, m2: 8, n11: 0.42, n12: 0.85, n13: 2.4, n21: 0.35, n22: 1.8, n23: 0.72 },
  starforge: { m1: 10, m2: 6, n11: 0.18, n12: 1.9, n13: 1.9, n21: 0.22, n22: 1.35, n23: 1.35 },
  bloom: { m1: 6, m2: 4, n11: 0.55, n12: 0.35, n13: 0.35, n21: 0.62, n22: 0.45, n23: 0.45 },
  crystal: { m1: 4, m2: 4, n11: 0.14, n12: 1.0, n13: 1.0, n21: 0.14, n22: 1.0, n23: 1.0 }
};

export function createSupersoundVisualizer(options = {}) {
  const stage = options.stage;
  if (!stage) throw new Error("SUPERSOUND requires a stage element.");

  const controls = options.controls || document;
  const getAnalyser = options.getAnalyser || (() => null);
  const getAudioContext = options.getAudioContext || (() => null);
  const isPlaying = options.isPlaying || (() => false);
  const byId = (id) => controls.querySelector("#" + id) || document.getElementById(id);

  const sourceEl = byId("viz-source");
  const fpsEl = byId("viz-fps");
  const lowMeter = byId("viz-low-meter");
  const midMeter = byId("viz-mid-meter");
  const highMeter = byId("viz-high-meter");

  const mobile = window.matchMedia("(max-width: 720px)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lowPower = mobile || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  const U_SEG = lowPower ? 56 : 88;
  const V_SEG = lowPower ? 36 : 56;
  const normalEvery = lowPower ? 4 : 2;

  const params = {
    m1: 10, m2: 6,
    n11: 0.18, n12: 1.9, n13: 1.9,
    n21: 0.22, n22: 1.35, n23: 1.35,
    deform: 0.72, morph: 0.18, sensitivity: 1.35, smoothing: 0.80,
    lowWeight: 1.10, midWeight: 0.85, highWeight: 0.70,
    colorDrive: 0.82, metalness: 0.48, roughness: 0.26, glow: 0.15,
    colorMode: "latitude",
    color1: "#5ee7ff", color2: "#9b6cff", color3: "#ff4fd8",
    rotation: reducedMotion ? 0.015 : 0.08
  };

  const state = {
    low: 0, mid: 0, high: 0, rms: 0, beat: 0, lowAverage: 0.08,
    frame: 0, lastFrame: performance.now(), fpsStart: performance.now(), fpsFrames: 0,
    pointerDown: false, pointerX: 0, pointerY: 0,
    targetX: 0.13, targetY: 0, currentX: 0.13, currentY: 0,
    visible: true, disposed: false, qualityReduced: false
  };

  const renderer = new THREE.WebGLRenderer({
    antialias: !lowPower,
    alpha: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false
  });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.8);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.setAttribute("aria-hidden", "true");
  stage.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070908, 0.13);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  camera.position.set(0, 0.05, 4.55);

  const root = new THREE.Group();
  scene.add(root);

  scene.add(new THREE.HemisphereLight(0xb9d7ff, 0x130b1b, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 3.6);
  key.position.set(3.2, 4.5, 5);
  scene.add(key);

  const rim = new THREE.PointLight(0x9b6cff, 13, 13, 2);
  rim.position.set(-3.5, 1.4, 3);
  scene.add(rim);

  const fill = new THREE.PointLight(0x5ee7ff, 10, 12, 2);
  fill.position.set(3, -2.2, 2.5);
  scene.add(fill);

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: params.metalness,
    roughness: params.roughness,
    clearcoat: 0.62,
    clearcoatRoughness: 0.22,
    iridescence: 0.72,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: [120, 430],
    side: THREE.DoubleSide
  });

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: params.color2,
    transparent: true,
    opacity: params.glow,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const vertexCount = (U_SEG + 1) * (V_SEG + 1);
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const freqMap = new Float32Array(vertexCount);
  const energySmoothing = new Float32Array(vertexCount);
  const lonCos = new Float32Array(U_SEG + 1);
  const lonSin = new Float32Array(U_SEG + 1);
  const latCos = new Float32Array(V_SEG + 1);
  const latSin = new Float32Array(V_SEG + 1);
  const lonAngle = new Float32Array(U_SEG + 1);
  const latAngle = new Float32Array(V_SEG + 1);

  for (let i = 0; i <= U_SEG; i++) {
    const u = i / U_SEG;
    const a = -Math.PI + u * Math.PI * 2;
    lonAngle[i] = a;
    lonCos[i] = Math.cos(a);
    lonSin[i] = Math.sin(a);
  }
  for (let j = 0; j <= V_SEG; j++) {
    const v = j / V_SEG;
    const a = -Math.PI / 2 + v * Math.PI;
    latAngle[j] = a;
    latCos[j] = Math.cos(a);
    latSin[j] = Math.sin(a);
  }

  let vi = 0;
  for (let j = 0; j <= V_SEG; j++) {
    const v = j / V_SEG;
    for (let i = 0; i <= U_SEG; i++, vi++) {
      const u = i / U_SEG;
      const equatorBias = 1 - Math.abs(v * 2 - 1);
      freqMap[vi] = clamp(0.74 * u + 0.26 * equatorBias);
    }
  }

  const indices = new Uint16Array(U_SEG * V_SEG * 6);
  let ii = 0;
  for (let j = 0; j < V_SEG; j++) {
    for (let i = 0; i < U_SEG; i++) {
      const a = j * (U_SEG + 1) + i;
      const b = a + 1;
      const c = a + U_SEG + 1;
      const d = c + 1;
      indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
      indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  const colorAttr = new THREE.BufferAttribute(colors, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  root.add(mesh);

  const glowMesh = new THREE.Mesh(geometry, glowMaterial);
  glowMesh.scale.setScalar(1.04);
  glowMesh.frustumCulled = false;
  root.add(glowMesh);

  const particleCount = lowPower ? 160 : 360;
  const particlePositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const r = 3.5 + Math.random() * 5.5;
    const a = Math.random() * Math.PI * 2;
    particlePositions[i * 3] = Math.cos(a) * r;
    particlePositions[i * 3 + 1] = Math.sin(a) * r * 0.62;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 6.5;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0xb9c4ff,
    size: lowPower ? 0.03 : 0.024,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  let analyser = null;
  let freqData = null;
  let timeData = null;
  const spectrumCurve = new Float32Array(192);

  function syncAnalyser() {
    const next = getAnalyser();
    if (next === analyser) return analyser;
    analyser = next || null;
    if (analyser) {
      freqData = new Uint8Array(analyser.frequencyBinCount);
      timeData = new Uint8Array(analyser.fftSize);
    } else {
      freqData = null;
      timeData = null;
    }
    return analyser;
  }

  function bandEnergy(minHz, maxHz) {
    const ctx = getAudioContext();
    if (!ctx || !freqData || !freqData.length) return 0;
    const nyquist = ctx.sampleRate / 2;
    let start = Math.floor((minHz / nyquist) * freqData.length);
    let end = Math.ceil((maxHz / nyquist) * freqData.length);
    start = clamp(start, 0, freqData.length - 1);
    end = clamp(end, start + 1, freqData.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += freqData[i] / 255;
    return sum / Math.max(1, end - start);
  }

  function analyzeAudio(dt) {
    const a = syncAnalyser();
    const active = Boolean(a && isPlaying());
    if (sourceEl) sourceEl.textContent = a ? (active ? "DECTALK" : "READY") : "WAITING";

    if (!active || !freqData || !timeData) {
      state.low = lerp(state.low, 0, 0.09);
      state.mid = lerp(state.mid, 0, 0.09);
      state.high = lerp(state.high, 0, 0.09);
      state.rms = lerp(state.rms, 0, 0.09);
      state.beat *= Math.exp(-dt * 5.5);
      spectrumCurve.fill(0);
      return;
    }

    a.smoothingTimeConstant = params.smoothing;
    a.getByteFrequencyData(freqData);
    a.getByteTimeDomainData(timeData);

    state.low = clamp(bandEnergy(25, 180) * params.sensitivity * params.lowWeight);
    state.mid = clamp(bandEnergy(180, 2200) * params.sensitivity * params.midWeight);
    state.high = clamp(bandEnergy(2200, 12000) * params.sensitivity * params.highWeight);

    let sumSq = 0;
    let samples = 0;
    for (let i = 0; i < timeData.length; i += 4) {
      const n = (timeData[i] - 128) / 128;
      sumSq += n * n;
      samples++;
    }
    state.rms = clamp(Math.sqrt(sumSq / Math.max(1, samples)) * params.sensitivity * 1.7);

    state.lowAverage = state.lowAverage * 0.965 + state.low * 0.035;
    if (state.low > Math.max(0.15, state.lowAverage * 1.25)) state.beat = 1;
    else state.beat *= Math.exp(-dt * 6.5);

    const ctx = getAudioContext();
    const nyquist = (ctx ? ctx.sampleRate : 48000) / 2;
    const minHz = 30;
    const maxHz = Math.min(14000, nyquist * 0.94);
    for (let i = 0; i < spectrumCurve.length; i++) {
      const t = i / (spectrumCurve.length - 1);
      const hz = minHz * Math.pow(maxHz / minHz, t);
      const bin = clamp(Math.floor((hz / nyquist) * freqData.length), 0, freqData.length - 1);
      spectrumCurve[i] = clamp((freqData[bin] / 255) * params.sensitivity);
    }
  }

  function superformula(angle, m, n1, n2, n3) {
    const p1 = Math.pow(Math.abs(Math.cos(m * angle / 4)), n2);
    const p2 = Math.pow(Math.abs(Math.sin(m * angle / 4)), n3);
    const sum = Math.max(1e-6, p1 + p2);
    const r = Math.pow(sum, -1 / Math.max(0.05, n1));
    return clamp(Number.isFinite(r) ? r : 0, 0, 3.15);
  }

  const lonR = new Float32Array(U_SEG + 1);
  const latR = new Float32Array(V_SEG + 1);
  const c1 = new THREE.Color();
  const c2 = new THREE.Color();
  const c3 = new THREE.Color();

  function mixColor(t, outIndex, brightness) {
    t = clamp(t);
    let r, g, b;
    if (t < 0.5) {
      const k = t * 2;
      r = lerp(c1.r, c2.r, k);
      g = lerp(c1.g, c2.g, k);
      b = lerp(c1.b, c2.b, k);
    } else {
      const k = (t - 0.5) * 2;
      r = lerp(c2.r, c3.r, k);
      g = lerp(c2.g, c3.g, k);
      b = lerp(c2.b, c3.b, k);
    }
    colors[outIndex] = clamp(r * brightness);
    colors[outIndex + 1] = clamp(g * brightness);
    colors[outIndex + 2] = clamp(b * brightness);
  }

  function updateGeometry(now, dt) {
    const t = now * 0.001;
    const m1 = params.m1 + state.beat * params.morph * 2.0 + state.mid * params.morph * 0.45;
    const m2 = params.m2 + state.high * params.morph * 1.25;
    const n11 = Math.max(0.05, params.n11 * (1 + state.low * params.morph * 0.20));
    const n21 = Math.max(0.05, params.n21 * (1 + state.mid * params.morph * 0.17));

    for (let i = 0; i <= U_SEG; i++) lonR[i] = superformula(lonAngle[i], m1, n11, params.n12, params.n13);
    for (let j = 0; j <= V_SEG; j++) latR[j] = superformula(latAngle[j], m2, n21, params.n22, params.n23);

    c1.set(params.color1);
    c2.set(params.color2);
    c3.set(params.color3);

    const globalEnergy = clamp(state.low * 0.42 + state.mid * 0.34 + state.high * 0.24);
    const idleBreath = isPlaying() ? 0 : 0.012 + 0.008 * Math.sin(t * 1.25);
    let vertex = 0;

    for (let j = 0; j <= V_SEG; j++) {
      const v = j / V_SEG;
      const r2 = latR[j];
      const cp = latCos[j];
      const sp = latSin[j];

      for (let i = 0; i <= U_SEG; i++, vertex++) {
        const r1 = lonR[i];
        let x = r1 * lonCos[i] * r2 * cp;
        let y = r1 * lonSin[i] * r2 * cp;
        let z = r2 * sp;

        const specIndex = Math.min(spectrumCurve.length - 1, Math.floor(freqMap[vertex] * (spectrumCurve.length - 1)));
        const local = spectrumCurve[specIndex];
        const smooth = energySmoothing[vertex] = lerp(energySmoothing[vertex], local, 1 - Math.exp(-dt * 10));
        const wave = 0.73 + 0.27 * Math.sin(lonAngle[i] * 3 + latAngle[j] * 5 + t * 1.55);
        const displacement = params.deform * (smooth * 0.58 + globalEnergy * 0.18 + state.beat * 0.24) * wave;
        const scale = 1 + displacement + idleBreath;

        x *= scale; y *= scale; z *= scale;
        const pi = vertex * 3;
        positions[pi] = x;
        positions[pi + 1] = y;
        positions[pi + 2] = z;

        let baseT;
        if (params.colorMode === "bands") baseT = freqMap[vertex] < 0.34 ? 0.1 : (freqMap[vertex] < 0.67 ? 0.5 : 0.92);
        else if (params.colorMode === "latitude") baseT = v;
        else if (params.colorMode === "pulse") baseT = clamp(0.18 + state.beat * 0.55 + smooth * 0.32);
        else baseT = clamp(0.12 + freqMap[vertex] * 0.35 + smooth * 0.72);

        const audioT = clamp(0.15 + smooth * 0.7 + globalEnergy * 0.25);
        const colorT = lerp(baseT, audioT, params.colorDrive);
        const brightness = 0.72 + params.colorDrive * (smooth * 0.72 + state.beat * 0.22);
        mixColor(colorT, pi, brightness);
      }
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    if ((state.frame % normalEvery) === 0) geometry.computeVertexNormals();

    material.metalness = params.metalness;
    material.roughness = params.roughness;
    glowMaterial.opacity = params.glow * (0.72 + globalEnergy * 0.8 + state.beat * 0.35);
    glowMaterial.color.set(params.color2);
    rim.color.set(params.color2);
    fill.color.set(params.color1);
    rim.intensity = 11 + state.mid * 13 + state.beat * 7;
    fill.intensity = 9 + state.high * 12;
  }

  const rangeBindings = [
    ["viz-m1", "m1"], ["viz-m2", "m2"],
    ["viz-n11", "n11"], ["viz-n12", "n12"], ["viz-n13", "n13"],
    ["viz-n21", "n21"], ["viz-n22", "n22"], ["viz-n23", "n23"],
    ["viz-deform", "deform"], ["viz-morph", "morph"],
    ["viz-sensitivity", "sensitivity"], ["viz-smoothing", "smoothing"],
    ["viz-low-weight", "lowWeight"], ["viz-mid-weight", "midWeight"], ["viz-high-weight", "highWeight"],
    ["viz-color-drive", "colorDrive"], ["viz-metalness", "metalness"],
    ["viz-roughness", "roughness"], ["viz-glow", "glow"]
  ];

  function refreshOutput(input) {
    const out = controls.querySelector('[data-viz-output="' + input.id + '"]');
    if (!out) return;
    const step = Number(input.step || 1);
    out.textContent = Number(input.value).toFixed(step < 0.1 ? 2 : 1);
  }

  rangeBindings.forEach(([id, key]) => {
    const input = byId(id);
    if (!input) return;
    params[key] = Number(input.value);
    refreshOutput(input);
    input.addEventListener("input", () => {
      params[key] = Number(input.value);
      refreshOutput(input);
      const preset = byId("viz-preset");
      if (preset) preset.value = "custom";
    });
  });

  ["viz-color1", "viz-color2", "viz-color3"].forEach((id, index) => {
    const input = byId(id);
    if (!input) return;
    const key = "color" + (index + 1);
    params[key] = input.value;
    input.addEventListener("input", () => { params[key] = input.value; });
  });

  const colorMode = byId("viz-color-mode");
  if (colorMode) {
    params.colorMode = colorMode.value;
    colorMode.addEventListener("change", () => { params.colorMode = colorMode.value; });
  }

  const wireframe = byId("viz-wireframe");
  if (wireframe) wireframe.addEventListener("change", () => { material.wireframe = wireframe.checked; });

  const preset = byId("viz-preset");
  function applyPreset(name) {
    const values = PRESETS[name];
    if (!values) return;
    Object.entries(values).forEach(([keyName, value]) => {
      params[keyName] = value;
      const input = byId("viz-" + keyName);
      if (input) {
        input.value = String(value);
        refreshOutput(input);
      }
    });
  }
  if (preset) {
    preset.addEventListener("change", () => {
      if (preset.value !== "custom") applyPreset(preset.value);
    });
    applyPreset(preset.value);
  }

  const randomize = byId("viz-randomize");
  if (randomize) randomize.addEventListener("click", () => {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const values = {
      m1: rnd(2, 12), m2: rnd(2, 12),
      n11: rnd(0.12, 0.85), n12: rnd(0.35, 2.4), n13: rnd(0.35, 2.4),
      n21: rnd(0.12, 0.85), n22: rnd(0.35, 2.4), n23: rnd(0.35, 2.4)
    };
    Object.entries(values).forEach(([keyName, value]) => {
      params[keyName] = value;
      const input = byId("viz-" + keyName);
      if (input) {
        input.value = String(value);
        refreshOutput(input);
      }
    });
    if (preset) preset.value = "custom";
  });

  const canvas = renderer.domElement;
  function resetView() {
    state.targetX = 0.13;
    state.targetY = 0;
    camera.position.z = 4.55;
  }

  canvas.addEventListener("pointerdown", (event) => {
    state.pointerDown = true;
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.pointerDown) return;
    const dx = event.clientX - state.pointerX;
    const dy = event.clientY - state.pointerY;
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
    state.targetY += dx * 0.006;
    state.targetX = clamp(state.targetX + dy * 0.0045, -1.2, 1.2);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((name) => {
    canvas.addEventListener(name, () => { state.pointerDown = false; });
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    camera.position.z = clamp(camera.position.z + event.deltaY * 0.003, 2.8, 7.5);
  }, { passive: false });
  canvas.addEventListener("dblclick", resetView);

  function resize() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);

  const intersectionObserver = new IntersectionObserver((entries) => {
    state.visible = entries[0]?.isIntersecting !== false;
  }, { rootMargin: "180px" });
  intersectionObserver.observe(stage);

  function updateMeters() {
    if (lowMeter) lowMeter.style.transform = "scaleX(" + state.low + ")";
    if (midMeter) midMeter.style.transform = "scaleX(" + state.mid + ")";
    if (highMeter) highMeter.style.transform = "scaleX(" + state.high + ")";
  }

  function animate(now) {
    if (state.disposed) return;
    requestAnimationFrame(animate);

    if (document.hidden || !state.visible) {
      state.lastFrame = now;
      return;
    }

    const targetFps = isPlaying() ? (lowPower ? 42 : 60) : 28;
    const minInterval = 1000 / targetFps;
    if (now - state.lastFrame < minInterval) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - state.lastFrame) / 1000));
    state.lastFrame = now;
    state.frame++;

    analyzeAudio(dt);
    updateGeometry(now, dt);

    state.currentX = lerp(state.currentX, state.targetX, 1 - Math.exp(-dt * 7));
    state.currentY = lerp(state.currentY, state.targetY, 1 - Math.exp(-dt * 7));
    if (!state.pointerDown) state.targetY += params.rotation * dt;
    root.rotation.x = state.currentX;
    root.rotation.y = state.currentY;
    root.rotation.z = reducedMotion ? 0 : Math.sin(now * 0.00022) * 0.06;

    const pulse = 1 + state.rms * 0.04 + state.beat * 0.03;
    root.scale.setScalar(pulse);
    particles.rotation.y += dt * 0.01;
    updateMeters();
    renderer.render(scene, camera);

    state.fpsFrames++;
    if (now - state.fpsStart > 900) {
      const fps = Math.round(state.fpsFrames * 1000 / (now - state.fpsStart));
      if (fpsEl) fpsEl.textContent = fps + " FPS";
      if (lowPower && isPlaying() && fps < 28 && !state.qualityReduced && pixelRatio > 1) {
        state.qualityReduced = true;
        pixelRatio = 1;
        renderer.setPixelRatio(pixelRatio);
        resize();
      }
      state.fpsFrames = 0;
      state.fpsStart = now;
    }
  }

  function destroy() {
    if (state.disposed) return;
    state.disposed = true;
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    geometry.dispose();
    material.dispose();
    glowMaterial.dispose();
    particleGeo.dispose();
    particleMat.dispose();
    renderer.dispose();
    stage.replaceChildren();
  }

  resize();
  updateGeometry(performance.now(), 1 / 60);
  geometry.computeVertexNormals();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);

  return { destroy, resetView, params };
}
