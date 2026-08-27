/**
 * The Customise view. Every control is generated from THEME_SCHEMA and writes
 * straight through to Theme, so edits are live - no apply button, no preview gap.
 */
const Customizer = (() => {
  let activeGroup = 'palette';
  let bodyNode = null;
  let backgroundsCache = [];

  /* Fields that only make sense for certain background types. */
  const RELEVANT = {
    bgColor1: (v) => ['solid', 'gradient', 'animated'].includes(v.bgType),
    bgColor2: (v) => ['gradient', 'animated'].includes(v.bgType),
    bgColor3: (v) => ['gradient', 'animated'].includes(v.bgType),
    gradientType: (v) => ['gradient', 'animated'].includes(v.bgType),
    gradientAngle: (v) => ['gradient', 'animated'].includes(v.bgType),
    bgAsset: (v) => ['image', 'video'].includes(v.bgType),
    bgFit: (v) => ['image', 'video'].includes(v.bgType),
    bgScale: (v) => v.bgType !== 'solid',
    bgBlur: (v) => v.bgType !== 'solid',
    bgOpacity: (v) => v.bgType !== 'solid',
    bgMotion: (v) => v.bgType !== 'solid',
    bgMotionSpeed: (v) => v.bgType !== 'solid' && v.bgMotion !== 'none',
    visualStyle: (v) => !!v.showVisualizer,
  };

  const isRelevant = (key, vals) => (RELEVANT[key] ? RELEVANT[key](vals) : true);

  /* ----------------------------- controls ----------------------------- */

  function controlRow(field) {
    const vals = Theme.values();
    const value = vals[field.key];

    const control = (() => {
      switch (field.type) {
        case 'color': return colorControl(field, value);
        case 'range': return rangeControl(field, value);
        case 'select': return selectControl(field, value);
        case 'toggle': return toggleControl(field, value);
        case 'text': return textControl(field, value);
        case 'font': return fontControl(field, value);
        case 'background': return backgroundControl(field, value);
        default: return el('div');
      }
    })();

    const changed = JSON.stringify(value) !== JSON.stringify(window.THEME_DEFAULTS[field.key]);

    return el('div', { class: 'ctrl' + (field.type === 'background' ? ' ctrl-wide' : ''), dataset: { key: field.key } }, [
      el('div', { class: 'ctrl-label' }, [
        el('span', { text: field.label }),
        changed ? el('button', {
          class: 'ctrl-reset', text: '↺', title: 'Reset to default',
          onclick: () => { Theme.resetField(field.key); repaintBody(); },
        }) : null,
      ]),
      control,
    ]);
  }

  function colorControl(field, value) {
    const start = normaliseHex(value);

    // The native swatch only opens the OS colour picker; the visible chip is
    // painted here so it always shows exactly the stored value.
    const picker = el('input', { type: 'color', class: 'color-picker', value: start });
    const chip = el('label', { class: 'color-chip', style: { background: start } }, [picker]);
    const hex = el('input', { type: 'text', class: 'color-hex', value: start.toUpperCase(), spellcheck: false, maxlength: 7 });

    const push = (raw) => {
      const clean = normaliseHex(raw);
      chip.style.background = clean;
      hex.value = clean.toUpperCase();
      picker.value = clean;
      Theme.set(field.key, clean);
    };

    picker.addEventListener('input', () => push(picker.value));
    hex.addEventListener('change', () => push(hex.value));

    return el('div', { class: 'ctrl-body color-ctrl' }, [chip, hex]);
  }

  function normaliseHex(input) {
    let s = String(input || '').trim();
    if (!s.startsWith('#')) s = '#' + s;
    if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).split('').map((c) => c + c).join('');
    return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : '#000000';
  }

  function rangeControl(field, value) {
    const slider = el('input', {
      type: 'range', class: 'range-input',
      min: field.min, max: field.max, step: field.step, value,
    });
    const readout = el('input', { type: 'number', class: 'range-number', min: field.min, max: field.max, step: field.step, value });

    const push = (raw) => {
      const clamped = Math.min(field.max, Math.max(field.min, Number(raw)));
      // Snap to the field's step, or relative dragging leaves values like 253.904.
      const step = field.step || 1;
      const snapped = Math.round((clamped - field.min) / step) * step + field.min;
      // Re-round to kill floating point dust from the division above.
      const num = parseFloat(snapped.toFixed(4));
      slider.value = num;
      readout.value = num;
      Theme.set(field.key, num);
    };

    readout.addEventListener('change', () => push(readout.value));

    if (field.reflow) {
      /**
       * Sidebar width, player height and spacing all move the customiser itself
       * when they change. With a normal slider that is a feedback loop: the
       * value follows the pointer's absolute position, the page reflows, the
       * thumb slides out from under the pointer, and the value jumps again.
       *
       * These fields drag by relative movement instead: the value tracks how far
       * the pointer moved, not where it is, so a reflow cannot feed back into it.
       */
      let dragging = false;

      slider.addEventListener('pointerdown', (e) => {
        dragging = true;
        slider.setPointerCapture(e.pointerId);
        e.preventDefault(); // suppress the native jump-to-click
      });

      slider.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const perPixel = (field.max - field.min) / Math.max(1, slider.clientWidth);
        push(Number(slider.value) + e.movementX * perPixel);
      });

      const stop = (e) => {
        if (!dragging) return;
        dragging = false;
        try { slider.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
      };
      slider.addEventListener('pointerup', stop);
      slider.addEventListener('pointercancel', stop);

      // Keyboard still works normally.
      slider.addEventListener('keydown', () => { dragging = false; });
      slider.addEventListener('input', () => push(slider.value));
    } else {
      slider.addEventListener('input', () => push(slider.value));
    }

    return el('div', { class: 'ctrl-body range-ctrl' }, [
      slider, readout,
      field.unit ? el('span', { class: 'range-unit', text: field.unit }) : null,
    ]);
  }

  function selectControl(field, value) {
    const select = el('select', { class: 'field-select' },
      field.options.map(([val, label]) => el('option', { value: val, text: label })));
    select.value = value;
    select.addEventListener('change', () => {
      Theme.set(field.key, select.value);
      repaintBody();
    });
    return el('div', { class: 'ctrl-body' }, [select]);
  }

  function toggleControl(field, value) {
    const input = el('input', { type: 'checkbox' });
    input.checked = !!value;
    input.addEventListener('change', () => {
      Theme.set(field.key, input.checked);
      repaintBody();
    });
    return el('label', { class: 'ctrl-body switch' }, [input, el('span', { class: 'switch-track' })]);
  }

  function textControl(field, value) {
    const input = el('input', { type: 'text', class: 'field-input', value: value || '' });
    input.addEventListener('input', () => Theme.set(field.key, input.value));
    return el('div', { class: 'ctrl-body' }, [input]);
  }

  /* -------------------------- font control -------------------------- */

  function fontControl(field, value) {
    const preview = el('div', { class: 'font-preview', text: 'The quick brown fox' });
    preview.style.fontFamily = `"${value}", sans-serif`;

    const search = el('input', { type: 'text', class: 'field-input font-search', placeholder: 'Search fonts…', spellcheck: false });
    const list = el('div', { class: 'font-list' });

    const build = async (filter = '') => {
      const system = await Theme.listSystemFonts();
      const custom = Theme.get().fonts.map((f) => f.family);
      const all = [...new Set([...custom, ...system])];
      const needle = filter.trim().toLowerCase();
      const shown = (needle ? all.filter((f) => f.toLowerCase().includes(needle)) : all).slice(0, 400);

      list.innerHTML = '';
      for (const family of shown) {
        const isCustom = custom.includes(family);
        const item = el('button', {
          class: 'font-item' + (family === Theme.values()[field.key] ? ' on' : ''),
          onclick: () => {
            Theme.set(field.key, family);
            preview.style.fontFamily = `"${family}", sans-serif`;
            $$('.font-item', list).forEach((n) => n.classList.remove('on'));
            item.classList.add('on');
          },
        }, [
          el('span', { class: 'font-name', text: family, style: { fontFamily: `"${family}", sans-serif` } }),
          isCustom ? el('span', { class: 'font-tag', text: 'yours' }) : null,
        ]);
        list.appendChild(item);
      }
      if (!shown.length) list.appendChild(el('div', { class: 'font-none', text: 'No matches' }));
    };

    search.addEventListener('input', debounce(() => build(search.value), 120));
    build();

    return el('div', { class: 'ctrl-body font-ctrl' }, [
      preview,
      search,
      list,
      el('button', {
        class: 'ghost-btn small', text: '＋ Add a font file',
        onclick: async () => {
          const added = await window.utune.assets.pickFont();
          if (!added.length) return;
          await Theme.refreshFonts();
          const family = added[0].name.replace(/\.[^.]+$/, '');
          Theme.set(field.key, family);
          toast(`Added ${family}`, 'good');
          repaintBody();
        },
      }),
    ]);
  }

  /* ----------------------- background asset picker ----------------------- */

  function backgroundControl(field, value) {
    const gridNode = el('div', { class: 'bg-grid' });

    const paintGrid = () => {
      gridNode.innerHTML = '';
      const wantVideo = Theme.values().bgType === 'video';
      const items = backgroundsCache.filter((a) =>
        wantVideo ? ['mp4', 'webm', 'mov', 'mkv'].includes(a.ext)
                  : ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'].includes(a.ext));

      if (!items.length) {
        gridNode.appendChild(el('div', { class: 'bg-none', text: wantVideo ? 'No videos added yet.' : 'No images added yet.' }));
      }

      for (const asset of items) {
        const url = assetUrl('backgrounds', asset.name);
        const thumb = wantVideo
          ? el('video', { src: url, muted: true, loop: true, autoplay: true, playsinline: true })
          : el('img', { src: url, alt: '', loading: 'lazy' });
        if (wantVideo) thumb.muted = true;

        const tile = el('div', {
          class: 'bg-tile' + (asset.name === Theme.values().bgAsset ? ' on' : ''),
          title: asset.name,
          onclick: () => {
            Theme.set('bgAsset', asset.name);
            repaintBody();
          },
        }, [
          thumb,
          el('button', {
            class: 'bg-del', text: '×', title: 'Remove',
            onclick: async (e) => {
              e.stopPropagation();
              await window.utune.assets.deleteBackground(asset.name);
              if (Theme.values().bgAsset === asset.name) Theme.set('bgAsset', '');
              backgroundsCache = await window.utune.assets.listBackgrounds();
              paintGrid();
            },
          }),
        ]);
        gridNode.appendChild(tile);
      }
    };

    window.utune.assets.listBackgrounds().then((list) => {
      backgroundsCache = list;
      paintGrid();
    });

    return el('div', { class: 'ctrl-body bg-ctrl' }, [
      gridNode,
      el('button', {
        class: 'ghost-btn small', text: '＋ Add image or video',
        onclick: async () => {
          const added = await window.utune.assets.pickBackground();
          if (!added.length) return;
          backgroundsCache = await window.utune.assets.listBackgrounds();
          Theme.set('bgAsset', added[0].name);
          repaintBody();
        },
      }),
    ]);
  }

  /* ------------------------------ presets ------------------------------ */

  function presetGallery() {
    const current = Theme.get().current.preset;
    return el('div', { class: 'preset-grid' }, window.THEME_PRESETS.map((p) => el('button', {
      class: 'preset' + (p.id === current ? ' on' : ''),
      onclick: () => { Theme.usePreset(p.id); repaint(); },
    }, [
      el('div', { class: 'preset-swatch' }, p.swatch.map((c) => el('span', { style: { background: c } }))),
      el('div', { class: 'preset-name', text: p.name }),
    ])));
  }

  function savedGallery() {
    const saved = Theme.get().saved;
    if (!saved.length) return null;
    return el('section', { class: 'section' }, [
      el('h2', { class: 'section-title', text: 'Your saved looks' }),
      el('div', { class: 'preset-grid' }, saved.map((s) => el('div', { class: 'preset saved' }, [
        el('button', {
          class: 'preset-open',
          onclick: () => { Theme.loadSaved(s.id); repaint(); },
        }, [
          el('div', { class: 'preset-swatch' }, [s.values.bgColor1, s.values.accent, s.values.accent2]
            .map((c) => el('span', { style: { background: c } }))),
          el('div', { class: 'preset-name', text: s.name }),
        ]),
        el('button', {
          class: 'preset-del', text: '×', title: 'Delete',
          onclick: async () => {
            const ok = await askConfirm({ title: 'Delete this look?', message: `"${s.name}" will be removed.` });
            if (!ok) return;
            Theme.deleteSaved(s.id);
            repaint();
          },
        }),
      ]))),
    ]);
  }

  /* ------------------------------ randomise ------------------------------ */

  function randomTheme() {
    const rand = (min, max) => Math.random() * (max - min) + min;
    const hsl = (h, s, l) => {
      // Convert to hex so it drops straight into the colour inputs.
      const a = (s * Math.min(l, 1 - l)) / 100;
      const f = (n) => {
        const k = (n + h / 30) % 12;
        const c = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
        return Math.round(255 * c).toString(16).padStart(2, '0');
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    };

    const hue = Math.floor(rand(0, 360));
    const comp = (hue + rand(90, 200)) % 360;
    const dark = Math.random() > 0.35;
    const sat = rand(35, 95);

    const values = {
      bgColor1: hsl(hue, sat * 0.6, dark ? rand(5, 12) : rand(88, 96)),
      bgColor2: hsl(comp, sat * 0.5, dark ? rand(12, 24) : rand(82, 92)),
      bgColor3: hsl((hue + 40) % 360, sat, dark ? rand(20, 38) : rand(78, 90)),
      surface: hsl(hue, sat * 0.35, dark ? rand(8, 15) : rand(96, 100)),
      surface2: hsl(hue, sat * 0.3, dark ? rand(14, 22) : rand(92, 97)),
      surfaceHover: hsl(hue, sat * 0.3, dark ? rand(22, 32) : rand(86, 92)),
      sidebarBg: hsl(hue, sat * 0.4, dark ? rand(4, 10) : rand(90, 96)),
      headerBg: hsl(hue, sat * 0.4, dark ? rand(4, 10) : rand(90, 96)),
      playerBg: hsl(hue, sat * 0.35, dark ? rand(6, 13) : rand(94, 99)),
      text: dark ? hsl(hue, 25, rand(92, 99)) : hsl(hue, 40, rand(10, 20)),
      textDim: dark ? hsl(hue, 20, rand(60, 74)) : hsl(hue, 18, rand(40, 55)),
      sidebarText: dark ? hsl(hue, 20, rand(62, 78)) : hsl(hue, 20, rand(35, 50)),
      accent: hsl(comp, rand(70, 95), dark ? rand(58, 72) : rand(45, 58)),
      accent2: hsl((comp + 30) % 360, rand(70, 95), dark ? rand(62, 78) : rand(50, 62)),
      sidebarActive: hsl(comp, rand(70, 95), dark ? rand(62, 76) : rand(42, 55)),
      onAccent: dark ? hsl(comp, 60, 8) : '#ffffff',
      border: hsl(hue, sat * 0.4, dark ? rand(22, 34) : rand(78, 88)),
      borderHover: hsl(comp, rand(60, 90), dark ? 60 : 50),
      progressTrack: hsl(hue, sat * 0.35, dark ? rand(24, 34) : rand(76, 86)),
      progressFill: hsl(comp, rand(70, 95), dark ? 66 : 50),
      knob: dark ? '#ffffff' : hsl(comp, 80, 40),
      heart: hsl((comp + 180) % 360, 80, 62),
      glowColor: hsl(comp, 90, 65),
      scrollbar: hsl(hue, sat * 0.4, dark ? 40 : 70),
      selection: hsl(comp, 70, dark ? 45 : 75),
      shadowColor: dark ? '#000000' : hsl(hue, 30, 55),
      gradientType: ['linear', 'radial', 'conic'][Math.floor(rand(0, 3))],
      gradientAngle: Math.floor(rand(0, 360)),
      bgType: Math.random() > 0.4 ? 'animated' : 'gradient',
      bgMotion: ['none', 'drift', 'sway', 'zoom'][Math.floor(rand(0, 4))],
      bgMotionSpeed: Math.floor(rand(25, 90)),
      radius: Math.floor(rand(0, 26)),
      cardRadius: Math.floor(rand(0, 30)),
      coverRadius: Math.floor(rand(0, 26)),
      borderWidth: Math.random() > 0.6 ? Math.round(rand(1, 3)) : 0,
      surfaceOpacity: rand(0.6, 1),
      surfaceBlur: Math.floor(rand(0, 28)),
      glowSize: Math.random() > 0.5 ? Math.floor(rand(4, 26)) : 0,
      grain: Math.random() > 0.7 ? rand(0.05, 0.25) : 0,
      vignette: rand(0, 0.5),
      headingScale: rand(1.6, 2.6),
      headingWeight: [400, 600, 700, 800, 900][Math.floor(rand(0, 5))],
    };

    Theme.setMany(values);
    Theme.get().current.name = 'Surprise ' + Math.floor(rand(100, 999));
    repaint();
  }

  /* ------------------------------- render ------------------------------- */

  function groupTabs() {
    return el('div', { class: 'cz-tabs' }, window.THEME_SCHEMA.map((g) => el('button', {
      class: 'cz-tab' + (g.id === activeGroup ? ' on' : ''),
      onclick: () => { activeGroup = g.id; repaint(); },
    }, [
      el('span', { class: 'cz-tab-ico', text: g.icon }),
      el('span', { text: g.title }),
    ])));
  }

  function groupBody() {
    const group = window.THEME_SCHEMA.find((g) => g.id === activeGroup);
    const vals = Theme.values();
    const fields = group.fields.filter((f) => isRelevant(f.key, vals));
    return el('div', { class: 'cz-body' }, [
      el('p', { class: 'cz-blurb', text: group.blurb }),
      el('div', { class: 'ctrl-grid' }, fields.map(controlRow)),
    ]);
  }

  function repaintBody() {
    if (!bodyNode || !bodyNode.isConnected) return;
    const fresh = groupBody();
    bodyNode.replaceWith(fresh);
    bodyNode = fresh;
  }

  function repaint() {
    if (Store.state.view === 'customize') Views.render();
  }

  function render() {
    bodyNode = groupBody();

    const node = el('div', { class: 'customizer' }, [
      Views.header({
        eyebrow: 'Make it yours',
        title: 'Customise',
        subtitle: `Currently wearing: ${Theme.get().current.name}`,
        actions: [
          el('button', { class: 'primary-btn', text: '🎲  Surprise me', onclick: randomTheme }),
          el('button', {
            class: 'ghost-btn', text: 'Save this look',
            onclick: async () => {
              const name = await askText({
                title: 'Save this look', label: 'Give it a name',
                value: Theme.get().current.name, confirmText: 'Save',
              });
              if (!name) return;
              Theme.saveAs(name);
              toast(`Saved "${name}"`, 'good');
              repaint();
            },
          }),
          el('button', { class: 'ghost-btn', text: 'Export', onclick: () => Theme.exportCurrent() }),
          el('button', { class: 'ghost-btn', text: 'Import', onclick: async () => { await Theme.importFromFile(); repaint(); } }),
          el('button', {
            class: 'ghost-btn', text: 'Reset all',
            onclick: async () => {
              const ok = await askConfirm({ title: 'Reset everything?', message: 'All customisations go back to the defaults.', confirmText: 'Reset' });
              if (!ok) return;
              Theme.resetAll();
              repaint();
            },
          }),
        ],
      }),

      el('section', { class: 'section' }, [
        el('h2', { class: 'section-title', text: 'Start from a look' }),
        presetGallery(),
      ]),

      savedGallery(),

      el('section', { class: 'section' }, [
        el('h2', { class: 'section-title', text: 'Fine tuning' }),
        el('div', { class: 'cz-panel' }, [groupTabs(), bodyNode]),
      ]),
    ]);

    return node;
  }

  return { render };
})();
