/**
 * Profile, the time-of-day greeting, and the start-up chime.
 * No accounts, no login - it is just a name, a picture and a line of text.
 */
const Profile = (() => {
  const MAX_SOUND_SECONDS = 5;

  let data = {
    name: '',
    avatar: null,
    bio: '',
    startupSound: 'startup.mp3',
    playStartupSound: true,
    showIntro: true,
  };

  const listeners = new Set();
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach((fn) => fn(data));

  /**
   * Four slots through the day: mornings run warm, afternoons cool, evenings
   * warm again as the light goes, and the small hours cold and quiet.
   */
  const SLOTS = [
    {
      id: 'morning', from: 5, to: 11, greeting: 'Good morning',
      colors: ['#ff8a4c', '#ffc46b', '#ff6f91'],
      glow: '#ffb35c',
      blurb: 'The kettle is on somewhere.',
    },
    {
      id: 'afternoon', from: 12, to: 16, greeting: 'Good afternoon',
      colors: ['#2f9bff', '#22d3ee', '#6366f1'],
      glow: '#38bdf8',
      blurb: 'Plenty of day left.',
    },
    {
      id: 'evening', from: 17, to: 21, greeting: 'Good evening',
      colors: ['#b1451a', '#8e2751', '#4c1d95'],
      glow: '#c2410c',
      blurb: 'Wind it down.',
    },
    {
      // Kept dark throughout - a bright colour anywhere in this gradient reads as
      // daytime, since the middle of the ramp is what fills most of the screen.
      id: 'night', from: 22, to: 4, greeting: 'Still up',
      colors: ['#04060f', '#131033', '#241a4d'],
      glow: '#3b2f6b',
      blurb: 'The good listening hours.',
    },
  ];

  // Local machine time - getHours() is the browser's local timezone, not UTC.
  function slotFor(hour = new Date().getHours()) {
    for (const slot of SLOTS) {
      // The night slot wraps past midnight, so it needs the OR form.
      const inSlot = slot.from <= slot.to
        ? hour >= slot.from && hour <= slot.to
        : hour >= slot.from || hour <= slot.to;
      if (inSlot) return slot;
    }
    return SLOTS[0];
  }

  /** Greeting plus the display name, or just the greeting before a name is set. */
  function greeting() {
    const slot = slotFor();
    return data.name ? `${slot.greeting}, ${data.name}` : slot.greeting;
  }

  /**
   * The wash pans across a 200%-wide gradient, so the colours are mirrored back
   * out to the far edge - otherwise the visible window sits on one flat colour
   * for most of the animation.
   */
  const introWash = (a, b, c) =>
    `linear-gradient(135deg, ${a} 0%, ${b} 28%, ${c} 52%, ${b} 76%, ${a} 100%)`;

  const avatarUrl = () => (data.avatar ? assetUrl('avatars', data.avatar) : null);

  function avatarNode(className = '') {
    const url = avatarUrl();
    return el('div', { class: 'avatar ' + className }, [
      url ? el('img', { src: url, alt: '' })
          : el('span', { class: 'avatar-initial', text: (data.name || 'U').trim().charAt(0).toUpperCase() }),
    ]);
  }

  /* ------------------------------ persistence ------------------------------ */

  async function init() {
    data = await window.utune.profile.get();
    emit();
  }

  async function save(patch) {
    data = await window.utune.profile.save(patch);
    emit();
    return data;
  }

  /* ------------------------------ start-up sound ------------------------------ */

  /** Reports duration so the UI can warn about clips longer than the cap. */
  function probeSound(name) {
    return new Promise((resolve) => {
      const audio = new Audio(assetUrl('sounds', name));
      audio.addEventListener('loadedmetadata', () => resolve({ duration: audio.duration }), { once: true });
      audio.addEventListener('error', () => resolve({ duration: 0, error: true }), { once: true });
      setTimeout(() => resolve({ duration: 0, error: true }), 5000);
    });
  }

  /**
   * The chime plays before anything can be adjusted, so it is deliberately the
   * quietest thing the app produces: it follows the player's volume setting and
   * sits well below it. It must never carry a level of its own.
   */
  const CHIME_RATIO = 0.6;

  /**
   * Plays at most MAX_SOUND_SECONDS, fading the last moment so a clip that is
   * cut short does not end on a click.
   */
  function playStartupSound(name = data.startupSound, { force = false } = {}) {
    if (!name) return null;
    if (!force && !data.playStartupSound) return null;

    const level = Player.currentAmplitude() * CHIME_RATIO;
    if (level <= 0) return null;   // muted means muted

    const audio = new Audio(assetUrl('sounds', name));
    audio.volume = level;

    const stopAt = MAX_SOUND_SECONDS;
    const fadeFrom = stopAt - 0.35;

    const tick = () => {
      if (audio.currentTime >= stopAt) {
        audio.pause();
        return;
      }
      if (audio.currentTime >= fadeFrom) {
        audio.volume = Math.max(0, level * (1 - (audio.currentTime - fadeFrom) / 0.35));
      }
    };
    audio.addEventListener('timeupdate', tick);
    audio.play().catch(() => { /* autoplay blocked */ });
    return audio;
  }

  /* --------------------------------- intro --------------------------------- */

  function showIntro() {
    return new Promise((resolve) => {
      if (!data.showIntro) return resolve();

      const slot = slotFor();
      const [a, b, c] = slot.colors;

      const overlay = el('div', { class: 'intro', dataset: { slot: slot.id } }, [
        el('div', { class: 'intro-wash', style: { backgroundImage: introWash(a, b, c) } }),
        el('div', { class: 'intro-orb', style: { background: c } }),
        el('div', { class: 'intro-body' }, [
          avatarNode('intro-avatar'),
          el('div', { class: 'intro-text' }, [
            el('h1', { class: 'intro-greeting', text: greeting() }),
            el('p', { class: 'intro-blurb', text: slot.blurb }),
          ]),
        ]),
        el('div', { class: 'intro-skip', text: 'click to skip' }),
      ]);

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('in'));

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        overlay.removeEventListener('click', finish);
        window.removeEventListener('keydown', finish);
        overlay.classList.remove('in');
        overlay.classList.add('out');
        setTimeout(() => { overlay.remove(); resolve(); }, 620);
      };

      const timer = setTimeout(finish, 2900);
      overlay.addEventListener('click', finish);
      window.addEventListener('keydown', finish);
    });
  }

  return {
    init, save, subscribe,
    get: () => data,
    greeting, slotFor, avatarUrl, avatarNode, introWash,
    showIntro, playStartupSound, probeSound,
    MAX_SOUND_SECONDS, SLOTS,
  };
})();
