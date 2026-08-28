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

  // Each applies a whole backdrop, so the room matches what you are hearing.
  const VIBES = [
    {
      id: 'cove', name: 'Cozy Cove', suggests: [],
      values: { bgType: 'animated', gradientType: 'linear', gradientAngle: 200,
        bgColor1: '#0b1f2a', bgColor2: '#123b4a', bgColor3: '#2a5f63',
        bgMotion: 'drift', bgMotionSpeed: 80, bgBlur: 0, bgTintOpacity: 0.1, vignette: 0.35 },
    },
    {
      id: 'forest', name: 'Deep forest', suggests: ['leaves', 'birds', 'wind'],
      values: { bgType: 'animated', gradientType: 'radial', gradientAngle: 150,
        bgColor1: '#07130c', bgColor2: '#14301b', bgColor3: '#2f5a32',
        bgMotion: 'sway', bgMotionSpeed: 90, bgTintOpacity: 0.12, vignette: 0.45 },
    },
    {
      id: 'rainy', name: 'Rainy window', suggests: ['rain', 'thunder'],
      values: { bgType: 'animated', gradientType: 'linear', gradientAngle: 175,
        bgColor1: '#0a0f18', bgColor2: '#1b2735', bgColor3: '#3b4a5c',
        bgMotion: 'drift', bgMotionSpeed: 55, bgBlur: 6, bgTintOpacity: 0.18, vignette: 0.5 },
    },
    {
      id: 'shore', name: 'Quiet shore', suggests: ['waves', 'wind'],
      values: { bgType: 'animated', gradientType: 'linear', gradientAngle: 195,
        bgColor1: '#071a2b', bgColor2: '#0f3d55', bgColor3: '#4a7f8c',
        bgMotion: 'sway', bgMotionSpeed: 70, bgTintOpacity: 0.1, vignette: 0.38 },
    },
    {
      id: 'fireside', name: 'Fireside', suggests: ['fire', 'wind'],
      values: { bgType: 'animated', gradientType: 'radial', gradientAngle: 160,
        bgColor1: '#160a06', bgColor2: '#3d1a0c', bgColor3: '#8a3d16',
        bgMotion: 'zoom', bgMotionSpeed: 75, bgTintOpacity: 0.15, vignette: 0.55 },
    },
    {
      id: 'night', name: 'Summer night', suggests: ['crickets', 'wind'],
      values: { bgType: 'animated', gradientType: 'linear', gradientAngle: 205,
        bgColor1: '#05060f', bgColor2: '#12132e', bgColor3: '#2b2a55',
        bgMotion: 'drift', bgMotionSpeed: 100, bgTintOpacity: 0.14, vignette: 0.5 },
    },
  ];

  async function useVibe(vibe) {
    Theme.setMany(vibe.values);
    for (const id of vibe.suggests) {
      if (!Ambience.get().levels[id]) await Ambience.setLevel(id, 0.5);
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

  function init() {
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onClick, true);
    Ambience.restore();
    Ambience.subscribe(() => { if (Store.state.view === 'cove') repaintLevels(); });
    Player.subscribe(() => Ambience.syncVolume());
    refreshCustom();
  }

  async function refreshCustom() {
    customSounds = await window.utune.cove.listSounds();
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

  function render() {
    const state = Ambience.get();

    const master = el('input', {
      type: 'range', class: 'range-input', min: 0, max: 100, step: 1,
      value: Math.round(state.master * 100),
    });
    master.addEventListener('input', () => Ambience.setMaster(master.value / 100));

    const all = [
      ...Ambience.SOUNDS,
      ...customSounds.map((f) => ({
        id: f.name, name: f.name.replace(/\.[^.]+$/, ''), icon: '❉', custom: true,
      })),
    ];

    gridNode = el('div', { class: 'sound-grid' }, all.map(soundCard));

    const node = el('div', { class: 'cove' }, [
      Views.header({
        eyebrow: 'Cozy Cove',
        title: 'Somewhere quiet',
        subtitle: 'Layer as many as you like. Everything here is generated as it plays, so nothing ever loops.',
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
            backgroundImage: `linear-gradient(135deg, ${v.values.bgColor1}, ${v.values.bgColor2} 55%, ${v.values.bgColor3})`,
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
