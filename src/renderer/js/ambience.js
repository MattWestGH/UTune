/**
 * Cozy Cove's sound engine.
 *
 * Every layer is a real recording, looped with a crossfade: two overlapping
 * copies of the buffer, one fading in as the other fades out, so the seam is
 * inaudible. Recordings are almost never trimmed to a clean loop point, and a
 * plain `loop = true` clicks.
 *
 * `norm` is a per-file gain measured from the source material. The recordings
 * arrived with about 30 dB between the quietest and the loudest - crickets at
 * -55 dBFS RMS against a downpour at -24 - so without this, two layers at the
 * same slider position would be nowhere near the same volume. Each gain brings
 * the file to a common RMS, clamped so nothing can clip.
 *
 * Everything mixes into AudioGraph's ambience bus, which sits under the same
 * volume ceiling as music.
 */
const Ambience = (() => {
  const layers = new Map();       // id -> { gain, stop() }
  const buffers = new Map();      // url -> AudioBuffer
  let customSounds = [];

  let state = { levels: {}, master: 0.5, playing: false };
  const listeners = new Set();
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach((fn) => fn(state));

  /* ----------------------------- the catalogue -----------------------------
   * norm values come from measuring each file's RMS and levelling to the median.
   * Re-measure and update these if the files are ever replaced.
   */
  const SOUNDS = [
    { id: 'rain',     name: 'Rain',            icon: '☂', file: 'rain.mp3',     norm: 1.00 },
    { id: 'downpour', name: 'Heavy downpour',  icon: '☔', file: 'downpour.mp3', norm: 0.27 },
    { id: 'thunder',  name: 'Distant thunder', icon: '☁', file: 'thunder.mp3',  norm: 0.31 },
    { id: 'waves',    name: 'Ocean waves',     icon: '≈', file: 'waves.mp3',    norm: 2.15 },
    { id: 'stream',   name: 'Stream',          icon: '⌁', file: 'stream.mp3',   norm: 3.60 },
    { id: 'wind',     name: 'Wind',            icon: '❋', file: 'wind.mp3',     norm: 0.29 },
    { id: 'leaves',   name: 'Rustling trees',  icon: '❦', file: 'leaves.mp3',   norm: 1.38 },
    { id: 'crickets', name: 'Crickets',        icon: '♪', file: 'crickets.mp3', norm: 9.26 },
    { id: 'birds',    name: 'Birdsong',        icon: '❥', file: 'birds.mp3',    norm: 0.41 },
    { id: 'fire',     name: 'Crackling fire',  icon: '✦', file: 'fire.mp3',     norm: 0.99 },
  ];

  const byId = (id) => SOUNDS.find((s) => s.id === id);

  /* ------------------------------- loading ------------------------------- */

  async function loadBuffer(url) {
    if (buffers.has(url)) return buffers.get(url);
    const ctx = AudioGraph.context();
    if (!ctx) return null;
    const res = await fetch(url);
    if (!res.ok) throw new Error('could not fetch ' + url);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    buffers.set(url, buf);
    return buf;
  }

  /**
   * Crossfaded loop. Each pass starts FADE seconds before the previous one ends
   * and rides an equal-power-ish ramp, so the overlap keeps a steady level.
   */
  function startLoop(ctx, out, buffer) {
    const FADE = Math.min(2, buffer.duration * 0.2);
    const period = Math.max(0.5, buffer.duration - FADE);
    let stopped = false;
    const live = new Set();

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
      live.add(src);
      src.onended = () => live.delete(src);
      // Queue the next pass a little early so scheduling is never late.
      timer = setTimeout(() => fire(at + period), Math.max(50, period * 1000 - 400));
    };

    let timer = null;
    fire(ctx.currentTime + 0.05);

    return () => {
      stopped = true;
      clearTimeout(timer);
      live.forEach((s) => { try { s.stop(); } catch (err) { /* already done */ } });
      live.clear();
    };
  }

  /* ------------------------------- control ------------------------------- */

  function busGain() {
    const bus = AudioGraph.getAmbienceBus();
    if (bus) bus.gain.value = Player.currentAmplitude() * state.master;
    return bus;
  }

  const layerGain = (id, level) => {
    const sound = byId(id);
    return level * (sound ? sound.norm : 1);
  };

  async function setLevel(id, level) {
    state.levels[id] = Math.max(0, Math.min(1, level));
    const on = state.levels[id] > 0;

    if (on && !layers.has(id)) await startLayer(id);
    else if (!on && layers.has(id)) stopLayer(id);

    const layer = layers.get(id);
    if (layer) layer.gain.gain.value = layerGain(id, state.levels[id]);

    state.playing = layers.size > 0;
    busGain();
    emit();
    persist();
  }

  async function startLayer(id) {
    const ctx = AudioGraph.context();
    if (!ctx) return;
    if (!AudioGraph.isReady()) AudioGraph.attach(Player.audio);
    AudioGraph.resume();
    Visualizer.attachContextOnly();

    const bus = busGain();
    if (!bus) return;

    const sound = byId(id);
    const url = sound ? assetUrl('builtin', sound.file) : assetUrl('ambience', id);

    let buffer;
    try {
      buffer = await loadBuffer(url);
    } catch (err) {
      toast('Could not load that sound', 'bad');
      return;
    }
    if (!buffer) return;
    // A second call may have arrived while decoding.
    if (layers.has(id)) return;

    const gain = ctx.createGain();
    gain.gain.value = layerGain(id, state.levels[id] || 0);
    gain.connect(bus);

    const stop = startLoop(ctx, gain, buffer);
    layers.set(id, { gain, stop });
  }

  function stopLayer(id) {
    const layer = layers.get(id);
    if (!layer) return;
    try { layer.stop(); } catch (err) { /* already stopped */ }
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

  const syncVolume = () => busGain();

  async function refreshCustom() {
    customSounds = await window.utune.cove.listSounds();
    return customSounds;
  }

  /** Built-ins plus anything imported, in one list for the grid. */
  const catalogue = () => [
    ...SOUNDS,
    ...customSounds.map((f) => ({
      id: f.name, name: f.name.replace(/\.[^.]+$/, ''), icon: '❉', norm: 1, custom: true,
    })),
  ];

  const persist = debounce(() => {
    try {
      localStorage.setItem('utune.cove', JSON.stringify({ levels: state.levels, master: state.master }));
    } catch (err) { /* not important enough to surface */ }
  }, 300);

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem('utune.cove'));
      if (saved) {
        state.master = typeof saved.master === 'number' ? saved.master : 0.5;
        // Levels are remembered but nothing starts playing on its own.
        state.levels = saved.levels || {};
      }
    } catch (err) { /* defaults are fine */ }
    emit();
  }

  return {
    SOUNDS, catalogue, refreshCustom, subscribe, restore, syncVolume,
    get: () => state,
    setLevel, setMaster, stopAll,
    isActive: (id) => layers.has(id),
    activeCount: () => layers.size,
  };
})();
