/**
 * Ten-band graphic equaliser over the standard ISO octave centres.
 *
 * Presets follow the usual consumer-audio set (the same names and rough shapes
 * you see on iTunes/Apple Music and most hi-fi apps) so they behave the way
 * people expect.
 *
 * Gains are in dB, one per band, ordered 31 Hz to 16 kHz. The graph applies a
 * matching negative makeup gain so no preset can end up louder than flat - see
 * audio-graph.js.
 */
const Equalizer = (() => {
  const BANDS = AudioGraph.BANDS;
  const RANGE = 12;

  const PRESETS = {
    'Flat':            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'Acoustic':        [4, 4, 3, 1, 1.5, 1.5, 3, 3.5, 3, 2],
    'Bass Booster':    [6, 5.5, 4.5, 3, 1, 0, 0, 0, 0, 0],
    'Bass Reducer':    [-6, -5.5, -4.5, -3, -1, 0, 0, 0, 0, 0],
    'Classical':       [4.5, 4, 3, 2.5, -1, -1, 0, 2, 3, 3.5],
    'Dance':           [5, 6, 4, 0, 2, 3, 4.5, 3.5, 2, 0],
    'Deep':            [5.5, 4.5, 2.5, 1, 2.5, 2, 0.5, -2.5, -4, -5],
    'Electronic':      [4.5, 4, 1, 0, -1.5, 2, 1, 1.5, 4, 4.5],
    'Hip-Hop':         [5.5, 5, 2, 3, -1, -1, 1.5, -0.5, 2, 3],
    'Jazz':            [4, 3, 1.5, 2, -1.5, -1.5, 0, 1.5, 3, 4],
    'Latin':           [5, 3, 0, 0, -1.5, -1.5, -1.5, 0, 3, 5],
    'Loudness':        [6, 4.5, 0, 0, -2, 0, -1, -5, 5, 1],
    'Lounge':          [-3, -1.5, -0.5, 1.5, 4, 2.5, 0, -1.5, 2, 1],
    'Piano':           [3, 2, 0, 2.5, 3, 1, 2.5, 4, 3, 3.5],
    'Pop':             [-1.5, -1, 0, 2, 4, 4, 2, 0, -1, -1.5],
    'R&B':             [5.5, 6, 4.5, 1.5, -1.5, -1, 2, 2.5, 3, 3.5],
    'Rock':            [5, 4, 3, 1.5, -0.5, -1, 0.5, 3, 4, 4.5],
    'Small Speakers':  [6, 5, 4, 2.5, 1, 0, -1, -2, -3, -3.5],
    'Spoken Word':     [-3.5, -3, -1, 1, 4, 4.5, 4, 3, 1, -1],
    'Treble Booster':  [0, 0, 0, 0, 0, 1, 2.5, 4, 5, 6],
    'Treble Reducer':  [0, 0, 0, 0, 0, -1, -2.5, -4, -5, -6],
    'Vocal Booster':   [-2.5, -3, -2, 1.5, 4, 4, 3, 1.5, 0, -1.5],
  };

  let state = { enabled: false, preset: 'Flat', gains: PRESETS.Flat.slice() };
  const listeners = new Set();
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach((fn) => fn(state));

  let lastMakeupDb = 0;

  const persist = debounce(() => {
    try {
      localStorage.setItem('utune.eq', JSON.stringify(state));
    } catch (err) { /* storage unavailable - EQ just will not persist */ }
  }, 250);

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem('utune.eq'));
      if (saved && Array.isArray(saved.gains) && saved.gains.length === BANDS.length) {
        state = {
          enabled: !!saved.enabled,
          preset: saved.preset || 'Custom',
          gains: saved.gains.map((g) => clampGain(g)),
        };
      }
    } catch (err) { /* fall back to flat */ }
    apply();
  }

  const clampGain = (g) => Math.max(-RANGE, Math.min(RANGE, Number(g) || 0));

  /** Pushes the current curve into the graph, or flat when switched off. */
  function apply() {
    const active = state.enabled ? state.gains : PRESETS.Flat;
    lastMakeupDb = AudioGraph.setBandGains(active);
    emit();
    persist();
  }

  function setEnabled(on) {
    state.enabled = !!on;
    apply();
  }

  function usePreset(name) {
    if (!PRESETS[name]) return;
    state.preset = name;
    state.gains = PRESETS[name].slice();
    if (name !== 'Flat') state.enabled = true;
    apply();
  }

  function setBand(index, db) {
    if (index < 0 || index >= BANDS.length) return;
    state.gains[index] = clampGain(db);
    state.preset = matchPreset() || 'Custom';
    state.enabled = true;
    apply();
  }

  /** Keeps the preset name honest when a manual tweak happens to match one. */
  function matchPreset() {
    for (const [name, curve] of Object.entries(PRESETS)) {
      if (curve.every((g, i) => Math.abs(g - state.gains[i]) < 0.05)) return name;
    }
    return null;
  }

  function reset() {
    state.preset = 'Flat';
    state.gains = PRESETS.Flat.slice();
    apply();
  }

  const label = (hz) => (hz >= 1000 ? (hz / 1000) + 'k' : String(hz));

  return {
    BANDS, RANGE, PRESETS, label,
    load, apply, subscribe,
    get: () => state,
    setEnabled, usePreset, setBand, reset,
    // How much the output was pulled down to keep a boosted curve from
    // exceeding flat. Shown in the UI so the correction is not invisible.
    makeupDb: () => lastMakeupDb,
  };
})();
