/**
 * Cozy Cove's own look, kept completely apart from the main theme.
 *
 * The Cove is meant to be its own room, so styling it must not touch the
 * customiser's settings and vice versa. It gets its own values, its own storage
 * (cove.json) and its own backdrop layer, which is shown only while the Cove is
 * on screen. Leave the Cove and the normal background comes straight back -
 * nothing about the user's theme has been altered.
 */
const CoveTheme = (() => {
  const DEFAULTS = {
    bgType: 'gradient',       // gradient | image | video
    color1: '#0b1f2a',
    color2: '#123b4a',
    color3: '#2a5f63',
    gradientType: 'linear',   // linear | radial | conic
    gradientAngle: 200,
    asset: '',
    fit: 'cover',
    blur: 0,
    opacity: 1,
    tint: '#000000',
    tintOpacity: 0.1,
    motion: 'drift',          // none | pan | zoom | drift | sway | spin
    motionSpeed: 80,
    vignette: 0.35,
    grain: 0,
  };

  let values = { ...DEFAULTS };
  const listeners = new Set();
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach((fn) => fn(values));

  const persist = debounce(() => window.utune.cove.saveTheme(values), 300);

  async function init() {
    const stored = await window.utune.cove.getTheme();
    if (stored) values = { ...DEFAULTS, ...stored };
    apply();
  }

  function gradientCss(v) {
    const { color1: a, color2: b, color3: c } = v;
    switch (v.gradientType) {
      case 'radial': return `radial-gradient(circle at 30% 20%, ${c} 0%, ${b} 45%, ${a} 100%)`;
      case 'conic': return `conic-gradient(from ${v.gradientAngle}deg at 50% 50%, ${a}, ${b}, ${c}, ${a})`;
      default: return `linear-gradient(${v.gradientAngle}deg, ${a} 0%, ${b} 55%, ${c} 100%)`;
    }
  }

  function apply() {
    const host = $('#cove-backdrop');
    if (!host) return;
    const media = $('#cove-media', host);
    const tint = $('#cove-tint', host);
    const vignette = $('#cove-vignette', host);
    const grain = $('#cove-grain', host);

    media.innerHTML = '';
    media.style.cssText = '';
    media.className = '';

    if (values.bgType === 'image' && values.asset) {
      media.style.backgroundImage = `url("${assetUrl('backgrounds', values.asset)}")`;
      media.style.backgroundPosition = 'center';
      if (values.fit === 'tile') {
        media.style.backgroundRepeat = 'repeat';
        media.style.backgroundSize = 'auto';
      } else {
        media.style.backgroundRepeat = 'no-repeat';
        media.style.backgroundSize = values.fit === 'center' ? 'auto' : values.fit;
      }
    } else if (values.bgType === 'video' && values.asset) {
      const video = el('video', {
        src: assetUrl('backgrounds', values.asset),
        autoplay: true, loop: true, muted: true, playsinline: true,
      });
      video.muted = true;
      video.style.objectFit = values.fit === 'contain' ? 'contain' : 'cover';
      media.appendChild(video);
      video.play().catch(() => {});
    } else {
      media.style.backgroundImage = gradientCss(values);
      media.style.backgroundSize = values.gradientType === 'conic' ? '100% 100%' : '300% 300%';
      media.classList.add('anim-gradient');
    }

    media.style.opacity = values.opacity;
    media.style.filter = values.blur > 0 ? `blur(${values.blur}px)` : 'none';

    if (values.motion && values.motion !== 'none') {
      media.classList.add('motion-' + values.motion, 'bleed');
    }
    host.style.setProperty('--motion-speed', values.motionSpeed + 's');

    tint.style.background = values.tint;
    tint.style.opacity = values.tintOpacity;
    vignette.style.opacity = values.vignette;
    grain.style.opacity = values.grain;

    emit();
    persist();
  }

  function set(key, value) {
    values[key] = value;
    apply();
  }

  function setMany(patch) {
    Object.assign(values, patch);
    apply();
  }

  function reset() {
    values = { ...DEFAULTS };
    apply();
  }

  /** Shows or hides the Cove backdrop without disturbing the main one. */
  function setVisible(on) {
    const host = $('#cove-backdrop');
    if (host) host.classList.toggle('on', !!on);
  }

  return { DEFAULTS, init, apply, set, setMany, reset, setVisible, subscribe, get: () => values, gradientCss };
})();
