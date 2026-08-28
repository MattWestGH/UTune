// Fetched once at boot; the Settings page reads it whenever it renders.
let APP_VERSION = '';

const Actions = {
  async importFiles() {
    const added = await window.utune.library.pickAndImport();
    await Store.refresh();
    if (added.length) toast(`Added ${added.length} track${added.length === 1 ? '' : 's'}`, 'good');
  },
  async importFolder() {
    const added = await window.utune.library.pickFolderAndImport();
    await Store.refresh();
    toast(added.length ? `Added ${added.length} tracks` : 'No audio files found there', added.length ? 'good' : 'bad');
  },
  async importPaths(paths) {
    if (!paths.length) return;
    const added = await window.utune.library.importPaths(paths);
    await Store.refresh();
    toast(added.length ? `Added ${added.length} track${added.length === 1 ? '' : 's'}` : 'Nothing playable in there', added.length ? 'good' : 'bad');
  },
};

/* ------------------------------ sidebar ------------------------------ */

/** The little avatar + name button at the top of the sidebar. */
function paintSidebarProfile() {
  const chip = $('#profile-chip');
  if (!chip) return;
  const p = Profile.get();
  chip.innerHTML = '';
  chip.appendChild(Profile.avatarNode('chip-avatar'));
  chip.appendChild(el('span', { class: 'chip-text' }, [
    el('span', { class: 'chip-name', text: p.name || 'Set up your profile' }),
    el('span', { class: 'chip-sub', text: p.name ? 'View profile' : 'Name, photo, a few words' }),
  ]));
  chip.classList.toggle('on', Store.state.view === 'profile');
}

function paintNav() {
  const { view, viewArg } = Store.state;
  $$('.nav-item[data-view]').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.view === view);
  });

  const list = $('#playlist-list');
  list.innerHTML = '';
  for (const pl of Store.state.playlists) {
    list.appendChild(el('button', {
      class: 'nav-item nav-pl' + (view === 'playlist' && viewArg === pl.id ? ' on' : ''),
      onclick: () => Store.navigate('playlist', pl.id),
      oncontextmenu: (e) => contextMenu(e, [
        { label: 'Play', action: () => Player.playTracks(Store.playlistTracks(pl), 0) },
        { label: 'Rename…', action: async () => {
          const name = await askText({ title: 'Rename playlist', label: 'Name', value: pl.name });
          if (!name) return;
          await window.utune.playlists.update(pl.id, { name });
          await Store.refresh();
        } },
        'sep',
        { label: 'Delete', danger: true, action: async () => {
          const ok = await askConfirm({ title: 'Delete playlist?', message: `"${pl.name}" will be removed.` });
          if (!ok) return;
          await window.utune.playlists.remove(pl.id);
          await Store.refresh();
          if (Store.state.viewArg === pl.id) Store.navigate('home');
        } },
      ]),
    }, [
      el('span', { class: 'nav-ico', text: '≡' }),
      el('span', { class: 'nav-pl-name', text: pl.name }),
      el('span', { class: 'nav-pl-count', text: String((pl.trackIds || []).length) }),
    ]));
  }
}

/* ------------------------------- queue ------------------------------- */

function paintQueue() {
  const panel = $('#queue-panel');
  if (panel.classList.contains('hidden')) return;
  const list = $('#queue-list');
  list.innerHTML = '';

  const { queue, index } = Player.state;
  if (!queue.length) {
    list.appendChild(el('div', { class: 'queue-empty', text: 'The queue is empty.' }));
    return;
  }

  queue.forEach((id, i) => {
    const track = Store.byId(id);
    if (!track) return;
    list.appendChild(el('div', {
      class: 'queue-item' + (i === index ? ' current' : '') + (i < index ? ' past' : ''),
      onDblclick: () => Player.jumpTo(i),
    }, [
      el('div', { class: 'q-art' }, [
        coverUrl(track) ? el('img', { src: coverUrl(track), alt: '' }) : el('div', { class: 'cover-fallback', text: '♪' }),
      ]),
      el('div', { class: 'q-text' }, [
        el('div', { class: 'q-title', text: track.title }),
        el('div', { class: 'q-artist', text: track.artist }),
      ]),
      i === index
        ? el('span', { class: 'q-now', html: ICONS.play })
        : el('button', { class: 'icon-btn', text: '×', title: 'Remove', onclick: () => { Player.removeFromQueue(i); paintQueue(); } }),
    ]));
  });
}

/* ---------------------------- drag and drop ---------------------------- */

function setupDragDrop() {
  const zone = $('#dropzone');
  let depth = 0;

  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
    depth += 1;
    zone.classList.add('on');
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) zone.classList.remove('on');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    depth = 0;
    zone.classList.remove('on');
    const files = Array.from(e.dataTransfer.files || []);
    const paths = files.map((f) => window.utune.pathForFile(f)).filter(Boolean);
    if (paths.length) Actions.importPaths(paths);
  });
}

/* --------------------------- resize grips --------------------------- */

/**
 * Drag the sidebar edge / the top of the player to resize them.
 *
 * The grip sits exactly on the edge it moves, so it tracks the pointer 1:1 and
 * there is no feedback: the pointer is captured on mousedown, which means the
 * drag keeps working even when the cursor outruns the element.
 */
function bindGrip(node, { axis, field, min, max, measure }) {
  let dragging = false;

  node.addEventListener('pointerdown', (e) => {
    dragging = true;
    node.setPointerCapture(e.pointerId);
    node.classList.add('dragging');
    document.body.classList.add('resizing', axis === 'x' ? 'resizing-x' : 'resizing-y');
    e.preventDefault();
  });

  node.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const raw = measure(e);
    Theme.set(field, Math.round(Math.min(max, Math.max(min, raw))));
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    try { node.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    node.classList.remove('dragging');
    document.body.classList.remove('resizing', 'resizing-x', 'resizing-y');
  };

  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);

  // Double-click an edge to snap it back to the default size.
  node.addEventListener('dblclick', () => {
    Theme.set(field, window.THEME_DEFAULTS[field]);
    Visualizer.resize();
  });
}

function setupGrips() {
  const limits = (key) => window.THEME_FIELDS.find((f) => f.key === key);
  const sidebar = limits('sidebarWidth');
  const player = limits('playerHeight');

  bindGrip($('#sidebar-grip'), {
    axis: 'x', field: 'sidebarWidth',
    min: sidebar.min, max: sidebar.max,
    measure: (e) => e.clientX,
  });

  bindGrip($('#player-grip'), {
    axis: 'y', field: 'playerHeight',
    min: player.min, max: player.max,
    measure: (e) => window.innerHeight - e.clientY,
  });
}

/* ---------------------------- keyboard ---------------------------- */

function setupKeys() {
  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      $('#search').focus();
      $('#search').select();
      return;
    }
    if (typing) return;

    switch (e.key) {
      case ' ': e.preventDefault(); Player.toggle(); break;
      case 'ArrowRight': if (e.ctrlKey) Player.next({ manual: true }); break;
      case 'ArrowLeft': if (e.ctrlKey) Player.prev(); break;
      case 'ArrowUp': e.preventDefault(); Player.setVolume(Player.state.volume + 0.05); break;
      case 'ArrowDown': e.preventDefault(); Player.setVolume(Player.state.volume - 0.05); break;
      case 'm': Player.toggleMute(); break;
      case 's': Player.toggleShuffle(); break;
      case 'r': Player.cycleRepeat(); break;
      default: break;
    }
  });
}

/* ------------------------------ chrome ------------------------------ */

function setupChrome() {
  $('#win-min').onclick = () => window.utune.window.minimize();
  $('#win-max').onclick = () => window.utune.window.toggleMaximize();
  $('#win-close').onclick = () => window.utune.window.close();

  $$('.nav-item[data-view]').forEach((btn) => {
    btn.onclick = () => Store.navigate(btn.dataset.view);
  });

  $('#btn-import-files').onclick = () => Actions.importFiles();
  $('#btn-import-folder').onclick = () => Actions.importFolder();

  $('#btn-new-playlist').onclick = async (e) => {
    e.stopPropagation();
    const name = await askText({ title: 'New playlist', label: 'Name', value: 'My mixtape', confirmText: 'Create' });
    if (!name) return;
    const pl = await window.utune.playlists.create(name);
    await Store.refresh();
    Store.navigate('playlist', pl.id);
  };

  const search = $('#search');
  search.addEventListener('input', debounce(() => Store.setSearch(search.value.trim()), 180));
  $('#search-clear').onclick = () => { search.value = ''; Store.setSearch(''); search.focus(); };

  $('#profile-chip').onclick = () => Store.navigate('profile');

  $('#btn-queue').onclick = () => {
    const panel = $('#queue-panel');
    panel.classList.toggle('hidden');
    document.body.classList.toggle('queue-open', !panel.classList.contains('hidden'));
    paintQueue();
    Visualizer.resize();
  };
  $('#queue-close').onclick = () => {
    $('#queue-panel').classList.add('hidden');
    document.body.classList.remove('queue-open');
    Visualizer.resize();
  };

  window.utune.window.onState(({ maximized }) => {
    document.body.classList.toggle('maximized', maximized);
  });
}

/* ------------------------------- boot ------------------------------- */

async function boot() {
  setMediaBase(await window.utune.app.mediaBase());
  APP_VERSION = await window.utune.app.version();

  await Theme.init();
  await Profile.init();

  // Must come before the chime: it restores the saved volume, and the chime is
  // scaled from it. Playing anything before this would use an unrelated level.
  Player.init();
  // Build the audio chain up front so the equaliser applies even before the
  // first track plays; the context resumes on the first gesture.
  AudioGraph.attach(Player.audio);
  Equalizer.load();
  Cove.init();

  // Start the chime and raise the greeting before the rest of the UI paints,
  // so the app is never briefly visible underneath it.
  Profile.playStartupSound();
  const intro = Profile.showIntro();

  await Store.refresh();

  setupChrome();
  setupDragDrop();
  setupKeys();
  setupGrips();

  Store.subscribe(() => {
    paintNav();
    paintSidebarProfile();
    Views.render();
    paintQueue();
  });

  Profile.subscribe(() => paintSidebarProfile());

  Player.subscribe(() => {
    paintQueue();
    // Keep the row highlight in step with what is actually playing.
    const view = Store.state.view;
    if (['songs', 'favorites', 'album', 'artist', 'playlist', 'home'].includes(view)) Views.render();
  });

  Theme.onChange(() => Visualizer.resize());

  window.utune.youtube.onProgress((evt) => Download.onProgress(evt));

  window.utune.library.onImportProgress(({ done, total, name }) => {
    if (total > 1 && done % 5 === 0) toast(`Importing ${done}/${total}…`, 'info', 900);
  });

  paintNav();
  paintSidebarProfile();
  Views.render();
  Visualizer.resize();

  await intro;

  const libHealth = await window.utune.library.health();
  if (libHealth && libHealth.message) {
    toast(libHealth.message, libHealth.ok ? 'info' : 'bad', libHealth.ok ? 7000 : 15000);
  }

  const recovered = await window.utune.app.recoveredFrom();
  if (recovered) toast('Your library was carried over from the previous location', 'good', 6000);
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:40px;color:#fff;font:14px monospace">UTune failed to start:\n\n${esc(err.stack || err.message)}</pre>`;
});
