/**
 * The one AudioContext, and the chain the music runs through.
 *
 *   <audio> --> source --> [ 10 EQ bands ] --> makeup --> analyser --> output
 *
 * The element's own .volume still sets the listening level (see player.js), so
 * this chain only shapes tone. `makeup` exists so the equaliser cannot raise the
 * output past the level the volume slider allows: it applies the inverse of the
 * largest positive band gain, which means no setting of the EQ can ever be
 * louder than flat.
 *
 * That correction is a fixed number recomputed only when the EQ is changed. It
 * is deliberately not a compressor or limiter - those move the level while you
 * listen, which is exactly what must not happen here.
 *
 * Ambience does not pass through the EQ; it mixes in after it, since tone
 * shaping a rain generator is meaningless.
 */
const AudioGraph = (() => {
  // ISO octave centres - the standard ten-band layout.
  const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  let ctx = null;
  let source = null;
  let filters = [];
  let makeup = null;
  let analyser = null;
  let ambienceBus = null;
  let failed = false;

  const dbToGain = (db) => Math.pow(10, db / 20);

  function context() {
    if (!ctx && !failed) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (err) {
        failed = true;
      }
    }
    return ctx;
  }

  /** Builds the chain around the media element. Safe to call repeatedly. */
  function attach(mediaEl) {
    if (failed || source) return getNodes();
    if (!context()) return null;

    try {
      source = ctx.createMediaElementSource(mediaEl);

      filters = BANDS.map((freq, i) => {
        const f = ctx.createBiquadFilter();
        f.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
        f.frequency.value = freq;
        // ~1 octave bandwidth, the usual choice for a graphic EQ.
        if (f.type === 'peaking') f.Q.value = 1.41;
        f.gain.value = 0;
        return f;
      });

      makeup = ctx.createGain();
      makeup.gain.value = 1;

      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.7;
      analyser.minDecibels = -78;
      analyser.maxDecibels = -22;

      // Ambience joins after the EQ but before the analyser, so the visualiser
      // and the backdrop pulse react to the cove too.
      ambienceBus = ctx.createGain();
      ambienceBus.gain.value = 1;

      let node = source;
      for (const f of filters) { node.connect(f); node = f; }
      node.connect(makeup);
      makeup.connect(analyser);
      ambienceBus.connect(analyser);
      analyser.connect(ctx.destination);
    } catch (err) {
      // Without the graph the element still plays on its own.
      failed = true;
      console.warn('audio graph unavailable', err);
      return null;
    }

    // Re-apply anything chosen before the chain existed.
    if (wantedGains) setBandGains(wantedGains);

    resume();
    return getNodes();
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  // Remembered so a curve chosen before anything played is applied once the
  // chain exists, and so the trim can be reported before then.
  let wantedGains = null;

  /**
   * Applies band gains in dB and compensates so the loudest band sits at unity.
   * Returns the compensation actually applied, in dB.
   */
  function setBandGains(gainsDb) {
    const clamped = (gainsDb || []).map((g) => Math.max(-12, Math.min(12, Number(g) || 0)));
    wantedGains = clamped;

    filters.forEach((f, i) => { f.gain.value = clamped[i] || 0; });

    const loudest = Math.max(0, ...clamped);
    if (makeup) makeup.gain.value = dbToGain(-loudest);
    return -loudest;
  }

  const getNodes = () => ({ ctx, source, filters, makeup, analyser, ambienceBus });

  return {
    BANDS, attach, resume, setBandGains, context, getNodes,
    isReady: () => !!analyser,
    getAnalyser: () => analyser,
    getAmbienceBus: () => ambienceBus,
  };
})();
