/**
 * Turns a flat bag of theme values into live CSS. Everything the UI paints with
 * comes from a custom property set here, so the customiser can restyle any
 * element without the stylesheets needing to change.
 */
const Theme = (() => {
  const root = document.documentElement;

  let state = {
    current: { name: 'Midnight Amethyst', preset: 'amethyst', values: { ...window.THEME_DEFAULTS } },
    saved: [],
    fonts: [],
  };

  const listeners = new Set();
  const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach((fn) => fn(state));

  /* ---------------------------- persistence ---------------------------- */

  const persist = debounce(() => window.utune.theme.save(state), 350);

  async function init() {
    const stored = await window.utune.theme.get();
    if (stored && stored.current) {
      state = {
        current: {
          name: stored.current.name || 'Custom',
          preset: stored.current.preset || null,
          values: { ...window.THEME_DEFAULTS, ...(stored.current.values || {}) },
        },
        saved: Array.isArray(stored.saved) ? stored.saved : [],
        fonts: Array.isArray(stored.fonts) ? stored.fonts : [],
      };
    }
    await refreshFonts();
    apply();
  }

  /* ------------------------------- fonts ------------------------------- */

  const fontStyle = document.createElement('style');
  document.head.appendChild(fontStyle);

  async function refreshFonts() {
    const files = await window.utune.assets.listFonts();
    state.fonts = files.map((f) => ({
      file: f.name,
      family: f.name.replace(/\.[^.]+$/, ''),
      ext: f.ext,
    }));
    fontStyle.textContent = state.fonts.map((f) => {
      const format = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' }[f.ext] || 'truetype';
      return `@font-face{font-family:"${f.family}";src:url("${assetUrl("fonts", f.file)}") format("${format}");font-display:swap;}`;
    }).join('\n');
    return state.fonts;
  }

  /** Installed fonts, when the browser will tell us; a solid fallback list otherwise. */
  const FALLBACK_FONTS = [
    'Segoe UI', 'Arial', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas',
    'Constantia', 'Corbel', 'Courier New', 'Franklin Gothic Medium', 'Gabriola', 'Garamond',
    'Georgia', 'Impact', 'Ink Free', 'Lucida Console', 'Lucida Sans Unicode', 'Malgun Gothic',
    'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Segoe UI Light',
    'Sitka', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  ];

  let systemFonts = null;
  async function listSystemFonts() {
    if (systemFonts) return systemFonts;
    try {
      if (typeof window.queryLocalFonts === 'function') {
        const faces = await window.queryLocalFonts();
        const families = [...new Set(faces.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
        if (families.length) {
          systemFonts = families;
          return systemFonts;
        }
      }
    } catch (err) { /* permission denied - fall through */ }
    systemFonts = FALLBACK_FONTS.slice();
    return systemFonts;
  }

  /* ------------------------------- apply ------------------------------- */

  const v = () => state.current.values;

  function fontStack(name) {
    if (!name) return 'system-ui, sans-serif';
    return `"${name}", system-ui, "Segoe UI", sans-serif`;
  }

  function gradient(vals, colors) {
    const [a, b, c] = colors;
    switch (vals.gradientType) {
      case 'radial': return `radial-gradient(circle at 30% 20%, ${c} 0%, ${b} 45%, ${a} 100%)`;
      case 'conic': return `conic-gradient(from ${vals.gradientAngle}deg at 50% 50%, ${a}, ${b}, ${c}, ${a})`;
      default: return `linear-gradient(${vals.gradientAngle}deg, ${a} 0%, ${b} 55%, ${c} 100%)`;
    }
  }

  function apply() {
    const vals = v();

    // 1. Direct schema -> CSS variable mapping.
    for (const field of window.THEME_FIELDS) {
      if (!field.css) continue;
      const raw = vals[field.key];
      if (raw === undefined || raw === null) continue;
      root.style.setProperty(field.css, field.unit ? `${raw}${field.unit}` : String(raw));
    }

    // 2. Composites that need a bit of maths.
    root.style.setProperty('--font-body', fontStack(vals.fontBody));
    root.style.setProperty('--font-heading', fontStack(vals.fontHeading));
    root.style.setProperty('--heading-size', `calc(var(--font-size) * ${vals.headingScale})`);
    root.style.setProperty('--surface-rgba', rgba(vals.surface, vals.surfaceOpacity));
    root.style.setProperty('--surface-2-rgba', rgba(vals.surface2, Math.min(1, vals.surfaceOpacity + 0.08)));
    root.style.setProperty('--sidebar-rgba', rgba(vals.sidebarBg, vals.surfaceOpacity));
    root.style.setProperty('--player-rgba', rgba(vals.playerBg, Math.min(1, vals.surfaceOpacity + 0.06)));
    root.style.setProperty('--header-rgba', rgba(vals.headerBg, Math.min(1, vals.surfaceOpacity + 0.06)));
    root.style.setProperty('--accent-soft', rgba(vals.accent, 0.16));
    root.style.setProperty('--accent-mid', rgba(vals.accent, 0.4));
    root.style.setProperty('--selection-rgba', rgba(vals.selection, 0.45));
    root.style.setProperty('--border-rule', `${vals.borderWidth}px ${vals.borderStyle} var(--border)`);
    root.style.setProperty('--shadow',
      vals.shadowSize > 0 ? `0 ${Math.round(vals.shadowSize / 3)}px ${vals.shadowSize}px ${rgba(vals.shadowColor, vals.shadowOpacity)}` : 'none');
    root.style.setProperty('--glow',
      vals.glowSize > 0 ? `0 0 ${vals.glowSize}px ${rgba(vals.glowColor, 0.75)}` : 'none');
    root.style.setProperty('--cover-glow',
      vals.showCoverGlow && vals.glowSize >= 0 ? `0 8px ${Math.max(18, vals.glowSize + 18)}px ${rgba(vals.glowColor, 0.35)}` : 'none');
    root.style.setProperty('--app-filter', `saturate(${vals.appSaturate}) contrast(${vals.appContrast})`);
    root.style.setProperty('--motion-speed', `${vals.bgMotionSpeed}s`);

    // 3. Flags that toggle whole behaviours.
    root.classList.toggle('outline-all', !!vals.outlineEverything);
    root.classList.toggle('crisp-text', !!vals.fontSmoothing);
    root.classList.toggle('no-visualizer', !vals.showVisualizer);
    root.classList.toggle('no-cover-glow', !vals.showCoverGlow);

    applyBackground(vals);

    const brand = $('#brand-name');
    if (brand) brand.textContent = vals.brandName || 'UTune';
    document.title = vals.brandName || 'UTune';

    emit();
    persist();
  }

  /* ----------------------------- background ----------------------------- */

  function applyBackground(vals) {
    const media = $('#backdrop-media');
    const tint = $('#backdrop-tint');
    const grain = $('#backdrop-grain');
    const vignette = $('#backdrop-vignette');
    if (!media) return;

    const colors = [vals.bgColor1, vals.bgColor2, vals.bgColor3];
    media.innerHTML = '';
    media.style.cssText = '';
    media.className = '';

    const usesAsset = vals.bgType === 'image' || vals.bgType === 'video';
    const asset = vals.bgAsset;

    if (vals.bgType === 'solid') {
      media.style.background = vals.bgColor1;
    } else if (vals.bgType === 'gradient') {
      media.style.backgroundImage = gradient(vals, colors);
    } else if (vals.bgType === 'animated') {
      media.style.backgroundImage = gradient(vals, colors);
      media.style.backgroundSize = vals.gradientType === 'conic' ? '100% 100%' : '300% 300%';
      media.classList.add('anim-gradient');
    } else if (vals.bgType === 'image' && asset) {
      media.style.backgroundImage = `url("${assetUrl("backgrounds", asset)}")`;
      media.style.backgroundPosition = 'center';
      if (vals.bgFit === 'tile') {
        media.style.backgroundRepeat = 'repeat';
        media.style.backgroundSize = 'auto';
      } else {
        media.style.backgroundRepeat = 'no-repeat';
        media.style.backgroundSize = vals.bgFit === 'center' ? 'auto' : vals.bgFit;
      }
    } else if (vals.bgType === 'video' && asset) {
      const video = el('video', {
        src: assetUrl("backgrounds", asset),
        autoplay: true, loop: true, muted: true, playsinline: true,
      });
      video.muted = true;
      video.style.objectFit = vals.bgFit === 'contain' ? 'contain' : 'cover';
      media.appendChild(video);
      video.play().catch(() => {});
    } else {
      // Asked for an asset but none chosen yet - fall back to the gradient.
      media.style.backgroundImage = gradient(vals, colors);
    }

    media.style.opacity = vals.bgOpacity;
    media.style.filter = vals.bgBlur > 0 ? `blur(${vals.bgBlur}px)` : 'none';
    media.style.setProperty('--bg-scale', vals.bgScale);
    media.style.transform = `scale(${vals.bgScale})`;

    const motion = vals.bgMotion;
    if (motion && motion !== 'none') {
      media.classList.add('motion-' + motion);
      // Blur and motion both need extra bleed so edges never show through.
      if (vals.bgBlur > 0 || motion !== 'none') media.classList.add('bleed');
    }
    if (vals.bgReactive) media.classList.add('reactive');

    tint.style.background = vals.bgTint;
    tint.style.opacity = vals.bgTintOpacity;

    grain.style.opacity = vals.grain;
    vignette.style.opacity = vals.vignette;

    // Solid backdrops don't need the extra compositing layers.
    media.dataset.type = vals.bgType;
    if (usesAsset && !asset) media.dataset.missing = 'true';
    else delete media.dataset.missing;
  }

  /* ------------------------------ mutation ------------------------------ */

  function set(key, value, { silent = false } = {}) {
    state.current.values[key] = value;
    state.current.preset = null;
    if (!silent) apply();
  }

  function setMany(patch) {
    Object.assign(state.current.values, patch);
    apply();
  }

  function usePreset(presetId) {
    const preset = window.THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    state.current = {
      name: preset.name,
      preset: preset.id,
      values: { ...window.THEME_DEFAULTS, ...preset.values },
    };
    apply();
  }

  function resetField(key) {
    set(key, window.THEME_DEFAULTS[key]);
  }

  function resetAll() {
    state.current = { name: 'Midnight Amethyst', preset: 'amethyst', values: { ...window.THEME_DEFAULTS } };
    apply();
  }

  function saveAs(name) {
    const entry = {
      id: 'saved-' + Date.now().toString(36),
      name,
      values: { ...state.current.values },
      savedAt: Date.now(),
    };
    state.saved.push(entry);
    state.current.name = name;
    apply();
    return entry;
  }

  function loadSaved(id) {
    const entry = state.saved.find((s) => s.id === id);
    if (!entry) return;
    state.current = { name: entry.name, preset: null, values: { ...window.THEME_DEFAULTS, ...entry.values } };
    apply();
  }

  function deleteSaved(id) {
    state.saved = state.saved.filter((s) => s.id !== id);
    apply();
  }

  async function exportCurrent() {
    const ok = await window.utune.theme.exportFile(
      { utuneTheme: 1, name: state.current.name, values: state.current.values },
      state.current.name);
    if (ok) toast('Theme exported', 'good');
  }

  async function importFromFile() {
    const data = await window.utune.theme.importFile();
    if (!data || !data.values) {
      toast('That file is not a UTune theme', 'bad');
      return;
    }
    state.current = {
      name: data.name || 'Imported theme',
      preset: null,
      values: { ...window.THEME_DEFAULTS, ...data.values },
    };
    apply();
    toast(`Loaded "${state.current.name}"`, 'good');
  }

  /** Used by the visualiser so the background can breathe with the track. */
  function setPulse(amount) {
    root.style.setProperty('--pulse', amount.toFixed(3));
  }

  return {
    init, apply, set, setMany, get: () => state, values: v,
    usePreset, resetField, resetAll, saveAs, loadSaved, deleteSaved,
    exportCurrent, importFromFile, onChange,
    listSystemFonts, refreshFonts, setPulse,
  };
})();
