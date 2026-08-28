/** Canvas visualiser in the player bar; also drives the "pulse with the music" backdrop. */
const Visualizer = (() => {
  const canvas = $('#visualizer');
  const ctx = canvas.getContext('2d');

  let analyser = null;
  let freqData = null;
  let timeData = null;
  let running = false;

  // The graph itself lives in audio-graph.js so the equaliser and the ambience
  // engine can share the same context and analyser.
  function attach(audioEl) {
    if (!analyser) {
      const nodes = AudioGraph.attach(audioEl);
      if (!nodes || !nodes.analyser) return;
      analyser = nodes.analyser;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      timeData = new Uint8Array(analyser.frequencyBinCount);
      start();
    }
    AudioGraph.resume();
  }

  /** Ambience can start the loop without any track being loaded. */
  function attachContextOnly() {
    const a = AudioGraph.getAnalyser();
    if (!a || analyser) return;
    analyser = a;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.frequencyBinCount);
    start();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (!rect.width) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    requestAnimationFrame(frame);
  }

  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /**
   * Auto gain. A normally-mastered track rarely fills the analyser's range, so
   * without this the bars barely move except at very high volume. A slowly
   * decaying peak is tracked and the levels scaled against it, which keeps quiet
   * and loud music equally animated.
   */
  let peakEnv = 0.25;
  let gain = 1;

  // Below QUIET the bars fade out rather than snapping off, so a soft passage
  // still shows movement instead of flatlining. These thresholds hold true
  // silence (paused or muted) at zero without damping quiet playback.
  const SILENT = 0.002;
  const QUIET = 0.012;

  function updateGain(usable) {
    let frameMax = 0;
    let sum = 0;
    for (let i = 0; i < usable; i++) {
      const v = freqData[i] / 255;
      if (v > frameMax) frameMax = v;
      sum += v;
    }
    const average = sum / usable;

    // Rise instantly to a new peak, fall back slowly.
    peakEnv = frameMax > peakEnv ? frameMax : peakEnv * 0.99 + frameMax * 0.01;

    const ramp = Math.min(1, Math.max(0, (average - SILENT) / (QUIET - SILENT)));
    gain = (1 / Math.max(0.18, peakEnv)) * ramp;
    return average;
  }

  // Normalised 0..1 magnitude for a bin, with the auto gain applied.
  const level = (i) => Math.min(1, (freqData[i] / 255) * gain);

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);

    const vals = Theme.values();
    if (!analyser) return;

    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);

    // Ignore the very top bins - they are mostly empty and waste width.
    const usable = Math.floor(freqData.length * 0.7);
    const average = updateGain(usable);

    // The backdrop pulse is independent of the bars: it has its own switch in a
    // different tab, so hiding the visualiser must not silently disable it.
    if (vals.bgReactive) {
      Theme.setPulse(1 + Math.min(1, average * gain) * 0.09);
    }

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !vals.showVisualizer) return;
    ctx.clearRect(0, 0, w, h);

    const accent = cssVar('--accent') || '#c084fc';
    const accent2 = cssVar('--accent-2') || accent;
    const style = vals.visualStyle || 'bars';

    if (style === 'wave') drawWave(w, h, accent);
    else if (style === 'mirror') drawBars(w, h, usable, accent, accent2, true);
    else if (style === 'dots') drawDots(w, h, usable, accent, accent2);
    else if (style === 'blocks') drawBlocks(w, h, usable, accent, accent2);
    else drawBars(w, h, usable, accent, accent2, false);
  }

  function gradientFor(w, a, b) {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    return g;
  }

  function drawBars(w, h, usable, a, b, mirrored) {
    const count = 44;
    const step = Math.floor(usable / count) || 1;
    const barW = w / count;
    ctx.fillStyle = gradientFor(w, a, b);
    for (let i = 0; i < count; i++) {
      const value = level(i * step);
      const barH = Math.max(1.5, value * (mirrored ? h / 2 : h));
      const x = i * barW;
      const width = Math.max(1, barW - 2);
      if (mirrored) {
        ctx.fillRect(x, h / 2 - barH, width, barH);
        ctx.globalAlpha = 0.4;
        ctx.fillRect(x, h / 2, width, barH);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillRect(x, h - barH, width, barH);
      }
    }
  }

  function drawBlocks(w, h, usable, a, b) {
    const count = 30;
    const step = Math.floor(usable / count) || 1;
    const barW = w / count;
    const rows = 7;
    const cell = h / rows;
    ctx.fillStyle = gradientFor(w, a, b);
    for (let i = 0; i < count; i++) {
      const lit = Math.round(level(i * step) * rows);
      for (let r = 0; r < lit; r++) {
        ctx.globalAlpha = 0.35 + (r / rows) * 0.65;
        ctx.fillRect(i * barW, h - (r + 1) * cell + 1, Math.max(1, barW - 2), cell - 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawDots(w, h, usable, a, b) {
    const count = 36;
    const step = Math.floor(usable / count) || 1;
    ctx.fillStyle = gradientFor(w, a, b);
    for (let i = 0; i < count; i++) {
      const value = level(i * step);
      const x = (i + 0.5) * (w / count);
      const y = h - Math.max(2, value * h);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.2, value * 3.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The waveform needs its own gain: it reads raw amplitude, which sits close to
  // the centre line for anything but a very loud track.
  let wavePeak = 0.08;

  function drawWave(w, h, a) {
    let maxSwing = 0;
    for (let i = 0; i < timeData.length; i++) {
      const swing = Math.abs(timeData[i] - 128) / 128;
      if (swing > maxSwing) maxSwing = swing;
    }
    wavePeak = maxSwing > wavePeak ? maxSwing : wavePeak * 0.99 + maxSwing * 0.01;
    const waveGain = maxSwing < 0.004 ? 0 : 1 / Math.max(0.12, wavePeak);

    ctx.strokeStyle = a;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const slice = w / timeData.length;
    const mid = h / 2;
    for (let i = 0; i < timeData.length; i++) {
      const swing = ((timeData[i] - 128) / 128) * waveGain;
      const y = mid + Math.max(-1, Math.min(1, swing)) * (mid - 1);
      const x = i * slice;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  window.addEventListener('resize', debounce(resize, 120));

  return { attach, attachContextOnly, resize, start };
})();
