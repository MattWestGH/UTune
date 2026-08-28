/**
 * Cozy Cove's sound engine.
 *
 * The built-in sounds are generated rather than played from files. A short noise
 * buffer is looped and then shaped by filters and slow modulation, so there is
 * no loop point to hear - the texture never repeats. It also costs nothing to
 * ship and very little to run: a couple of nodes per active layer.
 *
 * Imported files are handled the other way round, as real buffers, and looped
 * with a short crossfade so the seam does not click.
 *
 * Everything mixes into AudioGraph's ambience bus, which sits under the same
 * volume ceiling as music. Layer sliders set the balance between sounds; the
 * player's volume still sets how loud the whole thing is.
 */
const Ambience = (() => {
  const layers = new Map();       // id -> { gain, nodes[], stop() }
  let noiseBuffers = null;
  let customBuffers = new Map();  // filename -> AudioBuffer

  let state = { levels: {}, master: 0.7, playing: false };
  const listeners = new Set();
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach((fn) => fn(state));

  /* ----------------------------- the catalogue ----------------------------- */

  const SOUNDS = [
    { id: 'rain',     name: 'Rain',           icon: '☂', build: buildRain },
    { id: 'downpour', name: 'Heavy downpour', icon: '☔', build: buildDownpour },
    { id: 'thunder',  name: 'Distant thunder',icon: '☁', build: buildThunder },
    { id: 'waves',    name: 'Ocean waves',    icon: '≈', build: buildWaves },
    { id: 'stream',   name: 'Stream',         icon: '⌁', build: buildStream },
    { id: 'wind',     name: 'Wind',           icon: '❋', build: buildWind },
    { id: 'leaves',   name: 'Rustling trees', icon: '❦', build: buildLeaves },
    { id: 'crickets', name: 'Crickets',       icon: '♪', build: buildCrickets },
    { id: 'birds',    name: 'Birdsong',       icon: '❥', build: buildBirds },
    { id: 'fire',     name: 'Crackling fire', icon: '✦', build: buildFire },
  ];

  /* ------------------------------- noise ------------------------------- */

  // Generated once and shared by every layer.
  function buffers(ctx) {
    if (noiseBuffers) return noiseBuffers;
    const seconds = 4;
    const len = ctx.sampleRate * seconds;

    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;

    // Brown noise: integrated white, which gives the -6 dB/octave slope that
    // reads as wind and surf rather than hiss.
    const brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }

    // Match the ends so the loop itself is seamless before any shaping.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      w[i] = w[i] * t + w[len - fade + i] * (1 - t);
      b[i] = b[i] * t + b[len - fade + i] * (1 - t);
    }

    noiseBuffers = { white, brown };
    return noiseBuffers;
  }

  const noiseSource = (ctx, kind) => {
    const src = ctx.createBufferSource();
    src.buffer = buffers(ctx)[kind];
    src.loop = true;
    return src;
  };

  /** Slow random drift, so a layer never sits perfectly still. */
  function lfo(ctx, target, { rate = 0.08, depth = 1, base = 0 }) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = rate;
    const amp = ctx.createGain();
    amp.gain.value = depth;
    osc.connect(amp).connect(target);
    if (base !== null) target.value = base;
    osc.start();
    return [osc, amp];
  }

  /* --------------------------- the generators --------------------------- */

  function buildRain(ctx, out) {
    const src = noiseSource(ctx, 'white');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 7000;
    const shimmer = ctx.createGain(); shimmer.gain.value = 0.75;
    const nodes = lfo(ctx, shimmer.gain, { rate: 0.07, depth: 0.06, base: 0.75 });
    src.connect(hp).connect(lp).connect(shimmer).connect(out);
    src.start();
    return [src, ...nodes];
  }

  function buildDownpour(ctx, out) {
    const src = noiseSource(ctx, 'white');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 350;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 9000;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking'; body.frequency.value = 500; body.gain.value = 4; body.Q.value = 0.8;
    src.connect(hp).connect(body).connect(lp).connect(out);
    src.start();
    return [src];
  }

  function buildThunder(ctx, out) {
    // Occasional low rumbles rather than a constant bed.
    const gain = ctx.createGain(); gain.gain.value = 0;
    const src = noiseSource(ctx, 'brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 220;
    src.connect(lp).connect(gain).connect(out);
    src.start();

    let timer = null;
    const roll = () => {
      const now = ctx.currentTime;
      const peak = 0.5 + Math.random() * 0.5;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.4 + Math.random() * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3 + Math.random() * 3);
      timer = setTimeout(roll, 12000 + Math.random() * 30000);
    };
    timer = setTimeout(roll, 3000 + Math.random() * 8000);
    return [src, { stop: () => clearTimeout(timer) }];
  }

  function buildWaves(ctx, out) {
    const src = noiseSource(ctx, 'brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const swell = ctx.createGain(); swell.gain.value = 0.5;
    // Two out-of-step swells so the sets do not fall into an obvious rhythm.
    const a = lfo(ctx, swell.gain, { rate: 0.09, depth: 0.32, base: 0.5 });
    const b = lfo(ctx, lp.frequency, { rate: 0.06, depth: 320, base: 900 });
    src.connect(lp).connect(swell).connect(out);
    src.start();
    return [src, ...a, ...b];
  }

  function buildStream(ctx, out) {
    const src = noiseSource(ctx, 'white');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.6;
    const trickle = ctx.createBiquadFilter();
    trickle.type = 'peaking'; trickle.frequency.value = 3200; trickle.gain.value = 6; trickle.Q.value = 2;
    const nodes = lfo(ctx, trickle.frequency, { rate: 0.5, depth: 700, base: 3200 });
    src.connect(bp).connect(trickle).connect(out);
    src.start();
    return [src, ...nodes];
  }

  function buildWind(ctx, out) {
    const src = noiseSource(ctx, 'brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 3;
    const gust = ctx.createGain(); gust.gain.value = 0.6;
    const a = lfo(ctx, lp.frequency, { rate: 0.05, depth: 340, base: 520 });
    const b = lfo(ctx, gust.gain, { rate: 0.035, depth: 0.28, base: 0.6 });
    src.connect(lp).connect(gust).connect(out);
    src.start();
    return [src, ...a, ...b];
  }

  function buildLeaves(ctx, out) {
    const src = noiseSource(ctx, 'white');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.9;
    const rustle = ctx.createGain(); rustle.gain.value = 0.35;
    const a = lfo(ctx, rustle.gain, { rate: 0.13, depth: 0.3, base: 0.4 });
    const b = lfo(ctx, bp.frequency, { rate: 0.09, depth: 800, base: 2600 });
    src.connect(bp).connect(rustle).connect(out);
    src.start();
    return [src, ...a, ...b];
  }

  function buildCrickets(ctx, out) {
    const src = noiseSource(ctx, 'white');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 4600; bp.Q.value = 22;
    // Chirp rhythm: a fast tremolo gated into short bursts.
    const chirp = ctx.createGain(); chirp.gain.value = 0;
    src.connect(bp).connect(chirp).connect(out);
    src.start();

    let timer = null;
    const burst = () => {
      const now = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.09;
        chirp.gain.setValueAtTime(0, t);
        chirp.gain.linearRampToValueAtTime(0.5, t + 0.012);
        chirp.gain.linearRampToValueAtTime(0, t + 0.055);
      }
      timer = setTimeout(burst, 600 + Math.random() * 700);
    };
    burst();
    return [src, { stop: () => clearTimeout(timer) }];
  }

  function buildBirds(ctx, out) {
    // The least convincing of the generated sounds - real recordings are better
    // here, which is what the import option is for.
    const mix = ctx.createGain(); mix.gain.value = 0.28;
    mix.connect(out);
    let timer = null;

    const chirp = () => {
      const now = ctx.currentTime;
      const notes = 2 + Math.floor(Math.random() * 3);
      for (let n = 0; n < notes; n++) {
        const t = now + n * (0.08 + Math.random() * 0.07);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const top = 2200 + Math.random() * 1800;
        osc.frequency.setValueAtTime(top * 0.7, t);
        osc.frequency.exponentialRampToValueAtTime(top, t + 0.04);
        osc.frequency.exponentialRampToValueAtTime(top * 0.8, t + 0.1);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(env).connect(mix);
        osc.start(t);
        osc.stop(t + 0.16);
      }
      timer = setTimeout(chirp, 1500 + Math.random() * 5000);
    };
    timer = setTimeout(chirp, 500 + Math.random() * 2000);
    return [{ stop: () => clearTimeout(timer) }];
  }

  function buildFire(ctx, out) {
    const src = noiseSource(ctx, 'brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1100;
    const bed = ctx.createGain(); bed.gain.value = 0.45;
    src.connect(lp).connect(bed).connect(out);
    src.start();

    // Crackles on top of the bed.
    let timer = null;
    const crack = () => {
      const now = ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = buffers(ctx).white;
      s.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500 + Math.random() * 3000;
      bp.Q.value = 6;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.3 + Math.random() * 0.4, now + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.05 + Math.random() * 0.09);
      s.connect(bp).connect(env).connect(out);
      s.start(now);
      s.stop(now + 0.2);
      timer = setTimeout(crack, 90 + Math.random() * 500);
    };
    crack();
    return [src, { stop: () => clearTimeout(timer) }];
  }

  /* ------------------------------ imported ------------------------------ */

  async function loadCustom(fileName) {
    if (customBuffers.has(fileName)) return customBuffers.get(fileName);
    const ctx = AudioGraph.context();
    if (!ctx) return null;
    const res = await fetch(assetUrl('ambience', fileName));
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    customBuffers.set(fileName, buf);
    return buf;
  }

  /**
   * Loops a real recording with overlapping copies, so the seam is crossfaded
   * rather than butt-joined. Recordings are rarely trimmed to a clean loop.
   */
  function buildCustom(ctx, out, buffer) {
    const FADE = Math.min(1.5, buffer.duration * 0.25);
    const period = buffer.duration - FADE;
    let stopped = false;
    const live = [];

    const fire = (at) => {
      if (stopped) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(1, at + FADE);
      g.gain.setValueAtTime(1, at + period);
      g.gain.linearRampToValueAtTime(0.0001, at + period + FADE);
      src.connect(g).connect(out);
      src.start(at);
      src.stop(at + period + FADE + 0.05);
      live.push(src);
      src.onended = () => {
        const i = live.indexOf(src);
        if (i >= 0) live.splice(i, 1);
      };
      setTimeout(() => fire(at + period), Math.max(50, period * 1000 - 300));
    };

    fire(ctx.currentTime + 0.05);
    return [{ stop: () => { stopped = true; live.forEach((s) => { try { s.stop(); } catch (e) {} }); } }];
  }

  /* ------------------------------- control ------------------------------- */

  function busGain() {
    const bus = AudioGraph.getAmbienceBus();
    if (bus) bus.gain.value = Player.currentAmplitude() * state.master;
    return bus;
  }

  async function setLevel(id, level) {
    state.levels[id] = Math.max(0, Math.min(1, level));
    const on = state.levels[id] > 0;

    if (on && !layers.has(id)) await startLayer(id);
    if (!on && layers.has(id)) stopLayer(id);

    const layer = layers.get(id);
    if (layer) layer.gain.gain.value = state.levels[id];

    state.playing = layers.size > 0;
    busGain();
    emit();
    persist();
  }

  async function startLayer(id) {
    const ctx = AudioGraph.context();
    if (!ctx) return;
    // Ambience can be the only thing playing, so make sure the graph exists.
    if (!AudioGraph.isReady()) AudioGraph.attach(Player.audio);
    AudioGraph.resume();
    Visualizer.attachContextOnly();

    const bus = busGain();
    if (!bus) return;

    const gain = ctx.createGain();
    gain.gain.value = state.levels[id] || 0;
    gain.connect(bus);

    const sound = SOUNDS.find((s) => s.id === id);
    let nodes;
    if (sound) {
      nodes = sound.build(ctx, gain);
    } else {
      const buf = await loadCustom(id).catch(() => null);
      if (!buf) return;
      nodes = buildCustom(ctx, gain, buf);
    }
    layers.set(id, { gain, nodes });
  }

  function stopLayer(id) {
    const layer = layers.get(id);
    if (!layer) return;
    for (const n of layer.nodes || []) {
      try { if (n.stop) n.stop(); } catch (err) { /* already stopped */ }
      try { if (n.disconnect) n.disconnect(); } catch (err) { /* fine */ }
    }
    try { layer.gain.disconnect(); } catch (err) { /* fine */ }
    layers.delete(id);
  }

  function stopAll() {
    [...layers.keys()].forEach(stopLayer);
    state.levels = {};
    state.playing = false;
    emit();
    persist();
  }

  function setMaster(value) {
    state.master = Math.max(0, Math.min(1, value));
    busGain();
    emit();
    persist();
  }

  // Follows the player's volume, so the ceiling applies here too.
  const syncVolume = () => busGain();

  const persist = debounce(() => {
    try {
      localStorage.setItem('utune.cove', JSON.stringify({ levels: state.levels, master: state.master }));
    } catch (err) { /* not important enough to surface */ }
  }, 300);

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem('utune.cove'));
      if (saved) {
        state.master = typeof saved.master === 'number' ? saved.master : 0.7;
        state.levels = saved.levels || {};
      }
    } catch (err) { /* defaults are fine */ }
    emit();
  }

  return {
    SOUNDS, subscribe, restore, syncVolume,
    get: () => state,
    setLevel, setMaster, stopAll,
    isActive: (id) => layers.has(id),
    activeCount: () => layers.size,
  };
})();
