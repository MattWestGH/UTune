const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Inline SVG icons. These have to be SVG rather than unicode glyphs: characters
 * like ⏮ and 🔊 are rendered by the system emoji font in colour and completely
 * ignore the theme, which looks broken on anything but a dark purple palette.
 */
const ICONS = (() => {
  const svg = (body, opts = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${opts}>${body}</svg>`;
  const solid = (body) => `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">${body}</svg>`;

  return {
    play: solid('<path d="M8 5.5v13l11-6.5z"/>'),
    pause: solid('<rect x="7" y="5.5" width="3.6" height="13" rx="1"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1"/>'),
    prev: solid('<path d="M7 6a1 1 0 0 1 2 0v12a1 1 0 0 1-2 0z"/><path d="M18 6.9v10.2a.9.9 0 0 1-1.4.75l-7.2-5.1a.9.9 0 0 1 0-1.5l7.2-5.1A.9.9 0 0 1 18 6.9z"/>'),
    next: solid('<path d="M17 6a1 1 0 0 0-2 0v12a1 1 0 0 0 2 0z"/><path d="M6 6.9v10.2a.9.9 0 0 0 1.4.75l7.2-5.1a.9.9 0 0 0 0-1.5L7.4 6.15A.9.9 0 0 0 6 6.9z"/>'),
    shuffle: svg('<path d="M17 3.5 20.5 7 17 10.5"/><path d="M17 13.5 20.5 17 17 20.5"/><path d="M3.5 7h3.2c1.3 0 2.5.6 3.2 1.7l4.2 6.6c.7 1.1 1.9 1.7 3.2 1.7h3.2"/><path d="M3.5 17h3.2c1.3 0 2.5-.6 3.2-1.7l.9-1.4"/><path d="M14.2 9.1l.9-1.4c.7-1.1 1.9-1.7 3.2-1.7h2.7"/>'),
    repeat: svg('<path d="M4 9.5A3.5 3.5 0 0 1 7.5 6H19"/><path d="M16 3l3 3-3 3"/><path d="M20 14.5a3.5 3.5 0 0 1-3.5 3.5H5"/><path d="M8 21l-3-3 3-3"/>'),
    repeatOne: svg('<path d="M4 9.5A3.5 3.5 0 0 1 7.5 6H19"/><path d="M16 3l3 3-3 3"/><path d="M20 14.5a3.5 3.5 0 0 1-3.5 3.5H5"/><path d="M8 21l-3-3 3-3"/><path d="M11.4 10.6l1.3-.8v4.4" stroke-width="1.7"/>'),
    queue: svg('<path d="M4 7h11"/><path d="M4 12h11"/><path d="M4 17h7"/><path d="M18 9.5v7.2"/><circle cx="16.4" cy="17.2" r="1.7" fill="currentColor" stroke="none"/><path d="M18 9.5l3-.9v2.1l-3 .9"/>'),
    volHigh: solid('<path d="M11 4.8v14.4a.8.8 0 0 1-1.32.6L5.9 16.5H3.4a.9.9 0 0 1-.9-.9v-7.2a.9.9 0 0 1 .9-.9h2.5l3.78-3.3A.8.8 0 0 1 11 4.8z"/>')
      .replace('</svg>', '<path d="M14.5 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M17.2 6.4a7.6 7.6 0 0 1 0 11.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'),
    volLow: solid('<path d="M11 4.8v14.4a.8.8 0 0 1-1.32.6L5.9 16.5H3.4a.9.9 0 0 1-.9-.9v-7.2a.9.9 0 0 1 .9-.9h2.5l3.78-3.3A.8.8 0 0 1 11 4.8z"/>')
      .replace('</svg>', '<path d="M14.5 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'),
    volMute: solid('<path d="M11 4.8v14.4a.8.8 0 0 1-1.32.6L5.9 16.5H3.4a.9.9 0 0 1-.9-.9v-7.2a.9.9 0 0 1 .9-.9h2.5l3.78-3.3A.8.8 0 0 1 11 4.8z"/>')
      .replace('</svg>', '<path d="M15 9.5l4.5 5M19.5 9.5l-4.5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'),
    heart: solid('<path d="M12 20.3l-1.4-1.28C5.6 14.5 2.8 11.95 2.8 8.8 2.8 6.25 4.8 4.3 7.35 4.3c1.44 0 2.82.67 3.72 1.73l.93 1.1.93-1.1a4.86 4.86 0 0 1 3.72-1.73c2.55 0 4.55 1.95 4.55 4.5 0 3.15-2.8 5.7-7.8 10.24z"/>'),
    heartOutline: svg('<path d="M12 20.3l-1.4-1.28C5.6 14.5 2.8 11.95 2.8 8.8 2.8 6.25 4.8 4.3 7.35 4.3c1.44 0 2.82.67 3.72 1.73l.93 1.1.93-1.1a4.86 4.86 0 0 1 3.72-1.73c2.55 0 4.55 1.95 4.55 4.5 0 3.15-2.8 5.7-7.8 10.24z"/>'),
  };
})();

function fmtTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function throttle(fn, wait = 100) {
  let last = 0;
  let pending = null;
  return (...args) => {
    const now = performance.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    } else {
      clearTimeout(pending);
      pending = setTimeout(() => {
        last = performance.now();
        fn(...args);
      }, wait - (now - last));
    }
  };
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full.slice(0, 6), 16);
  if (isNaN(num)) return { r: 0, g: 0, b: 0 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

const rgba = (hex, alpha) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Set once at boot from the loopback media server.
let MEDIA_BASE = '';
const setMediaBase = (base) => { MEDIA_BASE = base || ''; };

const assetUrl = (kind, name) =>
  (name ? `${MEDIA_BASE}/${kind}/${encodeURIComponent(name)}` : null);

const coverUrl = (track) => (track && track.cover ? assetUrl('covers', track.cover) : null);
const mediaUrl = (track) => (track ? assetUrl('media', track.file) : null);

/* ------------------------------ toasts ------------------------------ */

function toast(message, kind = 'info', ms = 3200) {
  const host = $('#toasts');
  const node = el('div', { class: `toast toast-${kind}`, text: message });
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('in'));
  setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 260);
  }, ms);
  return node;
}

/* ------------------------------ modal ------------------------------ */

function openModal(content, { width = 460 } = {}) {
  const host = $('#modal-host');
  const body = $('#modal-body');
  body.innerHTML = '';
  body.style.width = width + 'px';
  body.appendChild(content);
  host.classList.remove('hidden');
  const close = () => closeModal();
  $('.modal-backdrop', host).onclick = close;
  document.addEventListener('keydown', escClose);
  return close;
}

function escClose(e) {
  if (e.key === 'Escape') closeModal();
}

function closeModal() {
  $('#modal-host').classList.add('hidden');
  document.removeEventListener('keydown', escClose);
}

/** Small prompt dialog that resolves with the typed string (or null). */
function askText({ title, label, value = '', placeholder = '', confirmText = 'Save' }) {
  return new Promise((resolve) => {
    const input = el('input', { class: 'field-input', value, placeholder, type: 'text' });
    const done = (val) => { closeModal(); resolve(val); };
    const form = el('form', { class: 'modal-form', onsubmit: (e) => { e.preventDefault(); done(input.value.trim() || null); } }, [
      el('h3', { text: title }),
      label ? el('label', { class: 'field-label', text: label }) : null,
      input,
      el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'ghost-btn', text: 'Cancel', onclick: () => done(null) }),
        el('button', { type: 'submit', class: 'primary-btn', text: confirmText }),
      ]),
    ]);
    openModal(form);
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}

function askConfirm({ title, message, confirmText = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    const done = (val) => { closeModal(); resolve(val); };
    const node = el('div', { class: 'modal-form' }, [
      el('h3', { text: title }),
      el('p', { class: 'modal-msg', text: message }),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'ghost-btn', text: 'Cancel', onclick: () => done(false) }),
        el('button', { class: danger ? 'danger-btn' : 'primary-btn', text: confirmText, onclick: () => done(true) }),
      ]),
    ]);
    openModal(node);
  });
}

/** Lightweight right-click menu. items: [{label, action, danger}] or 'sep'. */
function contextMenu(event, items) {
  event.preventDefault();
  $$('.ctx-menu').forEach((m) => m.remove());
  const menu = el('div', { class: 'ctx-menu' });
  for (const item of items) {
    if (item === 'sep') {
      menu.appendChild(el('div', { class: 'ctx-sep' }));
      continue;
    }
    menu.appendChild(el('button', {
      class: 'ctx-item' + (item.danger ? ' danger' : ''),
      text: item.label,
      onclick: () => { menu.remove(); item.action(); },
    }));
  }
  document.body.appendChild(menu);
  const { innerWidth: vw, innerHeight: vh } = window;
  const rect = menu.getBoundingClientRect();
  menu.style.left = Math.min(event.clientX, vw - rect.width - 8) + 'px';
  menu.style.top = Math.min(event.clientY, vh - rect.height - 8) + 'px';
  const dismiss = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('mousedown', dismiss);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
}

/** Drag-anywhere slider used by the seek and volume bars. */
function bindSlider(node, { onInput, onCommit }) {
  let dragging = false;
  const ratioFrom = (e) => {
    const rect = node.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };
  node.addEventListener('mousedown', (e) => {
    dragging = true;
    node.classList.add('dragging');
    onInput(ratioFrom(e));
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (dragging) onInput(ratioFrom(e));
  });
  window.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;
    node.classList.remove('dragging');
    onCommit && onCommit(ratioFrom(e));
  });
  node.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = node.querySelector('.track-fill');
    const current = parseFloat(rect.style.width || '0') / 100;
    const next = Math.min(1, Math.max(0, current + (e.deltaY < 0 ? 0.05 : -0.05)));
    onInput(next);
    onCommit && onCommit(next);
  }, { passive: false });
  return { isDragging: () => dragging };
}
