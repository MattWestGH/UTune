/**
 * Cozy Cove: a mixer of ambient layers, plus a distraction-free mode.
 *
 * Immersive mode hides the sidebar, title bar and player and goes fullscreen.
 * Escape leaves. So does a click near any edge - a 200px band on all four sides
 * - which gives a way out that does not need a keyboard, without a stray click
 * in the middle of the screen throwing you back to the menus.
 */
const Cove = (() => {
  const EDGE = 200;
  let immersive = false;
  let customSounds = [];

  /* ------------------------------- vibes ------------------------------- */

  /**
   * Scenes set the Cove's own look and switch on layers that suit it. They write
   * to CoveTheme, never to Theme, so using one never disturbs the theme chosen
   * for the rest of the app.
   *
   * Levels are kept low on purpose: these are a starting point to build on, not
   * a finished mix, and layering three at 0.5 was overwhelming.
   */
  const VIBES = [
    {
      id: 'cove', name: 'Cozy Cove', suggests: {},
      values: { bgType: 'gradient', gradientType: 'linear', gradientAngle: 200,
        color1: '#0b1f2a', color2: '#123b4a', color3: '#2a5f63',
        motion: 'drift', motionSpeed: 80, blur: 0, tintOpacity: 0.1, vignette: 0.35 },
    },
    {
      id: 'forest', name: 'Deep forest', suggests: { leaves: 0.3, birds: 0.22, wind: 0.18 },
      values: { bgType: 'gradient', gradientType: 'radial', gradientAngle: 150,
        color1: '#07130c', color2: '#14301b', color3: '#2f5a32',
        motion: 'sway', motionSpeed: 90, blur: 0, tintOpacity: 0.12, vignette: 0.45 },
    },
    {
      id: 'rainy', name: 'Rainy window', suggests: { rain: 0.35, thunder: 0.2 },
      values: { bgType: 'gradient', gradientType: 'linear', gradientAngle: 175,
        color1: '#0a0f18', color2: '#1b2735', color3: '#3b4a5c',
        motion: 'drift', motionSpeed: 55, blur: 6, tintOpacity: 0.18, vignette: 0.5 },
    },
    {
      id: 'shore', name: 'Quiet shore', suggests: { waves: 0.35, wind: 0.15 },
      values: { bgType: 'gradient', gradientType: 'linear', gradientAngle: 195,
        color1: '#071a2b', color2: '#0f3d55', color3: '#4a7f8c',
        motion: 'sway', motionSpeed: 70, blur: 0, tintOpacity: 0.1, vignette: 0.38 },
    },
    {
      id: 'fireside', name: 'Fireside', suggests: { fire: 0.35, wind: 0.12 },
      values: { bgType: 'gradient', gradientType: 'radial', gradientAngle: 160,
        color1: '#160a06', color2: '#3d1a0c', color3: '#8a3d16',
        motion: 'zoom', motionSpeed: 75, blur: 0, tintOpacity: 0.15, vignette: 0.55 },
    },
    {
      id: 'night', name: 'Summer night', suggests: { crickets: 0.3, wind: 0.12 },
      values: { bgType: 'gradient', gradientType: 'linear', gradientAngle: 205,
        color1: '#05060f', color2: '#12132e', color3: '#2b2a55',
        motion: 'drift', motionSpeed: 100, blur: 0, tintOpacity: 0.14, vignette: 0.5 },
    },
  ];

  async function useVibe(vibe) {
    CoveTheme.setMany(vibe.values);
    // Replace the mix rather than piling on top of whatever was already running.
    Ambience.stopAll();
    for (const [id, level] of Object.entries(vibe.suggests)) {
      await Ambience.setLevel(id, level);
    }
    render();
  }

  /* ---------------------------- immersive mode ---------------------------- */

  function enterImmersive() {
    if (immersive) return;
    immersive = true;
    document.body.classList.add('immersive');
    window.utune.window.setFullScreen(true);
    showHint();
    Visualizer.resize();
  }

  function exitImmersive() {
    if (!immersive) return;
    immersive = false;
    document.body.classList.remove('immersive');
    window.utune.window.setFullScreen(false);
    Visualizer.resize();
  }

  const toggleImmersive = () => (immersive ? exitImmersive() : enterImmersive());

  function showHint() {
    const hint = el('div', { class: 'cove-hint' },
      [el('span', { text: 'Press Esc or click near any edge to bring the menus back' })]);
    document.body.appendChild(hint);
    requestAnimationFrame(() => hint.classList.add('in'));
    setTimeout(() => {
      hint.classList.remove('in');
      setTimeout(() => hint.remove(), 500);
    }, 4000);
  }

  // A click inside the edge band leaves immersive mode; the middle is left alone
  // so the sliders stay usable.
  function onClick(e) {
    if (!immersive) return;
    const nearEdge = e.clientX <= EDGE
      || e.clientY <= EDGE
      || e.clientX >= window.innerWidth - EDGE
      || e.clientY >= window.innerHeight - EDGE;
    if (nearEdge) exitImmersive();
  }

  function onKey(e) {
    if (e.key === 'Escape' && immersive) {
      e.preventDefault();
      exitImmersive();
    }
  }

  async function init() {
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onClick, true);
    Ambience.restore();
    Ambience.subscribe(() => { if (Store.state.view === 'cove') repaintLevels(); });
    Player.subscribe(() => Ambience.syncVolume());
    await CoveTheme.init();
    await Ambience.refreshCustom();

    // The Cove's backdrop is only up while the Cove is.
    Store.subscribe(() => CoveTheme.setVisible(Store.state.view === 'cove'));
    CoveTheme.setVisible(Store.state.view === 'cove');
  }

  /* ------------------------------- render ------------------------------- */

  let gridNode = null;

  function repaintLevels() {
    if (!gridNode || !gridNode.isConnected) return;
    const levels = Ambience.get().levels;
    for (const node of $$('.sound-card', gridNode)) {
      const id = node.dataset.id;
      const level = levels[id] || 0;
      node.classList.toggle('on', level > 0);
      const fill = $('.sound-level', node);
      if (fill) fill.style.width = level * 100 + '%';
      // Keep the thumb in step when a level is changed from elsewhere, e.g. a
      // vibe switching layers on.
      const slider = $('.sound-slider', node);
      if (slider && document.activeElement !== slider) {
        slider.value = Math.round(level * 100);
      }
    }
  }

  function soundCard(sound) {
    const level = Ambience.get().levels[sound.id] || 0;

    const slider = el('input', {
      type: 'range', class: 'sound-slider',
      min: 0, max: 100, step: 1, value: Math.round(level * 100),
    });
    slider.addEventListener('input', () => Ambience.setLevel(sound.id, slider.value / 100));

    return el('div', {
      class: 'sound-card' + (level > 0 ? ' on' : ''),
      dataset: { id: sound.id },
    }, [
      el('div', { class: 'sound-level', style: { width: level * 100 + '%' } }),
      el('button', {
        class: 'sound-head',
        title: level > 0 ? 'Turn off' : 'Turn on',
        onclick: () => Ambience.setLevel(sound.id, level > 0 ? 0 : 0.5),
      }, [
        el('span', { class: 'sound-icon', text: sound.icon || '♪' }),
        el('span', { class: 'sound-name', text: sound.name }),
      ]),
      slider,
      sound.custom ? el('button', {
        class: 'sound-del', text: '×', title: 'Remove this sound',
        onclick: async () => {
          await Ambience.setLevel(sound.id, 0);
          await window.utune.cove.deleteSound(sound.id);
          await refreshCustom();
          render();
        },
      }) : null,
    ]);
  }

  /* ---------------------------- style controls ---------------------------- */

  // Small self-contained controls. The Cove deliberately does not reuse the
  // customiser's schema - its settings are its own and must stay separate.
  function styleControls() {
    const v = CoveTheme.get();
    const row = (label, control, wide) =>
      el('div', { class: 'ctrl' + (wide ? ' ctrl-wide' : '') }, [
        el('div', { class: 'ctrl-label' }, [el('span', { text: label })]),
        control,
      ]);

    const colour = (key) => {
      const picker = el('input', { type: 'color', class: 'color-picker', value: v[key] });
      const chip = el('label', { class: 'color-chip', style: { background: v[key] } }, [picker]);
      picker.addEventListener('input', () => {
        chip.style.background = picker.value;
        CoveTheme.set(key, picker.value);
      });
      return el('div', { class: 'ctrl-body color-ctrl' }, [chip]);
    };

    const slider = (key, min, max, step, unit) => {
      const input = el('input', { type: 'range', class: 'range-input', min, max, step, value: v[key] });
      const out = el('span', { class: 'range-unit', text: v[key] + (unit || '') });
      input.addEventListener('input', () => {
        CoveTheme.set(key, parseFloat(input.value));
        out.textContent = input.value + (unit || '');
      });
      return el('div', { class: 'ctrl-body range-ctrl' }, [input, out]);
    };

    const choice = (key, options, onAfter) => {
      const sel = el('select', { class: 'field-select' },
        options.map(([val, text]) => el('option', { value: val, text })));
      sel.value = v[key];
      sel.addEventListener('change', () => {
        CoveTheme.set(key, sel.value);
        if (onAfter) onAfter();
      });
      return el('div', { class: 'ctrl-body' }, [sel]);
    };

    const isGradient = v.bgType === 'gradient';
    const usesAsset = v.bgType === 'image' || v.bgType === 'video';

    const assetPicker = el('div', { class: 'ctrl-body bg-ctrl' }, [
      el('div', { class: 'field-note', text: v.asset || 'Nothing chosen yet.' }),
      el('button', {
        class: 'ghost-btn small', text: '＋ Choose image, GIF or video',
        onclick: async () => {
          const added = await window.utune.assets.pickBackground();
          if (!added.length) return;
          const name = added[0].name;
          const isVideo = /\.(mp4|webm|mov|mkv)$/i.test(name);
          CoveTheme.setMany({ asset: name, bgType: isVideo ? 'video' : 'image' });
          render();
        },
      }),
    ]);

    const controls = [
      row('Background', choice('bgType', [
        ['gradient', 'Gradient'], ['image', 'Image or GIF'], ['video', 'Video'],
      ], render)),
    ];

    if (isGradient) {
      controls.push(
        row('Shape', choice('gradientType', [
          ['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Conic'],
        ])),
        row('Angle', slider('gradientAngle', 0, 360, 1, '°')),
        row('Colour A', colour('color1')),
        row('Colour B', colour('color2')),
        row('Colour C', colour('color3')),
      );
    }

    if (usesAsset) {
      controls.push(
        row('File', assetPicker, true),
        row('Fit', choice('fit', [
          ['cover', 'Cover'], ['contain', 'Contain'], ['tile', 'Tile'], ['center', 'Centre'],
        ])),
      );
    }

    controls.push(
      row('Movement', choice('motion', [
        ['none', 'Still'], ['pan', 'Slow pan'], ['zoom', 'Breathing zoom'],
        ['drift', 'Drift'], ['sway', 'Sway'], ['spin', 'Spin'],
      ], render)),
    );

    if (v.motion !== 'none') {
      // Higher number = longer cycle = slower, so the label is inverted.
      controls.push(row('Speed', slider('motionSpeed', 10, 160, 1, 's per cycle')));
    }

    controls.push(
      row('Vignette', slider('vignette', 0, 1, 0.01)),
      row('Blur', slider('blur', 0, 40, 1, 'px')),
      row('Tint strength', slider('tintOpacity', 0, 1, 0.01)),
      row('Grain', slider('grain', 0, 1, 0.01)),
    );

    return el('div', { class: 'ctrl-grid' }, controls);
  }

  function render() {
    const state = Ambience.get();

    const master = el('input', {
      type: 'range', class: 'range-input', min: 0, max: 100, step: 1,
      value: Math.round(state.master * 100),
    });
    master.addEventListener('input', () => Ambience.setMaster(master.value / 100));

    gridNode = el('div', { class: 'sound-grid' }, Ambience.catalogue().map(soundCard));

    const node = el('div', { class: 'cove' }, [
      Views.header({
        eyebrow: 'Cozy Cove',
        title: 'Somewhere quiet',
        subtitle: 'Layer as many as you like. Every sound is levelled against the others and loops with a crossfade, so nothing jumps.',
        actions: [
          el('button', { class: 'primary-btn', text: '⤢  Immersive mode', onclick: enterImmersive }),
          el('button', { class: 'ghost-btn', text: 'Silence everything', onclick: () => { Ambience.stopAll(); render(); } }),
          el('button', {
            class: 'ghost-btn', text: '＋ Add your own',
            onclick: async () => {
              const added = await window.utune.cove.pickSounds();
              if (!added.length) return;
              await refreshCustom();
              render();
              toast(`Added ${added.length} sound${added.length === 1 ? '' : 's'}`, 'good');
            },
          }),
        ],
      }),

      el('section', { class: 'section' }, [
        el('h2', { class: 'section-title', text: 'Set the scene' }),
        el('div', { class: 'vibe-grid' }, VIBES.map((v) => el('button', {
          class: 'vibe', onclick: () => useVibe(v),
          style: {
            backgroundImage: `linear-gradient(135deg, ${v.values.color1}, ${v.values.color2} 55%, ${v.values.color3})`,
          },
        }, [el('span', { text: v.name })]))),
      ]),

      el('section', { class: 'section' }, [
        el('div', { class: 'section-head' }, [
          el('h2', { class: 'section-title', text: 'Sounds' }),
          el('div', { class: 'cove-master' }, [
            el('span', { class: 'field-note', text: 'Ambience level' }),
            master,
          ]),
        ]),
        gridNode,
      ]),

      el('section', { class: 'section' }, [
        el('div', { class: 'section-head' }, [
          el('h2', { class: 'section-title', text: 'Style this space' }),
          el('button', {
            class: 'link-btn', text: 'Reset',
            onclick: () => { CoveTheme.reset(); render(); },
          }),
        ]),
        el('p', { class: 'cz-blurb', text: 'The Cove keeps its own look. Nothing here touches the theme you set everywhere else.' }),
        el('div', { class: 'cz-panel' }, [el('div', { class: 'cz-body' }, [styleControls()])]),
      ]),
    ]);

    if (Store.state.view === 'cove') {
      const host = $('#view');
      host.innerHTML = '';
      host.appendChild(node);
    }
    return node;
  }

  return { init, render, enterImmersive, exitImmersive, toggleImmersive, VIBES, isImmersive: () => immersive };
})();
