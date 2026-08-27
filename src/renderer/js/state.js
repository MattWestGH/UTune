/** Library data + view routing. Views subscribe and re-render on change. */
const Store = (() => {
  const state = {
    tracks: [],
    playlists: [],
    view: 'home',
    viewArg: null,
    search: '',
    sort: { key: 'addedAt', dir: -1 },
  };

  const listeners = new Set();
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach((fn) => fn(state));

  async function refresh() {
    const lib = await window.utune.library.get();
    state.tracks = lib.tracks || [];
    state.playlists = lib.playlists || [];
    emit();
  }

  function navigate(view, arg = null) {
    state.view = view;
    state.viewArg = arg;
    emit();
  }

  function setSearch(q) {
    state.search = q;
    emit();
  }

  function setSort(key) {
    if (state.sort.key === key) state.sort.dir *= -1;
    else state.sort = { key, dir: key === 'addedAt' ? -1 : 1 };
    emit();
  }

  const byId = (id) => state.tracks.find((t) => t.id === id) || null;

  function matches(track, q) {
    if (!q) return true;
    const needle = q.toLowerCase();
    return [track.title, track.artist, track.album, track.genre]
      .some((f) => String(f || '').toLowerCase().includes(needle));
  }

  function sorted(tracks) {
    const { key, dir } = state.sort;
    return [...tracks].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === 'number' || typeof bv === 'number') return ((av || 0) - (bv || 0)) * dir;
      return String(av || '').localeCompare(String(bv || ''), undefined, { sensitivity: 'base' }) * dir;
    });
  }

  const searched = () => state.tracks.filter((t) => matches(t, state.search));

  function albums() {
    const map = new Map();
    for (const t of searched()) {
      const key = `${t.album}||${t.artist}`;
      if (!map.has(key)) map.set(key, { key, album: t.album, artist: t.artist, cover: t.cover, tracks: [] });
      const entry = map.get(key);
      entry.tracks.push(t);
      if (!entry.cover && t.cover) entry.cover = t.cover;
    }
    return [...map.values()].sort((a, b) => a.album.localeCompare(b.album));
  }

  function artists() {
    const map = new Map();
    for (const t of searched()) {
      if (!map.has(t.artist)) map.set(t.artist, { name: t.artist, cover: t.cover, tracks: [], albums: new Set() });
      const entry = map.get(t.artist);
      entry.tracks.push(t);
      entry.albums.add(t.album);
      if (!entry.cover && t.cover) entry.cover = t.cover;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const playlistTracks = (playlist) =>
    (playlist.trackIds || []).map(byId).filter(Boolean);

  return {
    state, subscribe, emit, refresh, navigate, setSearch, setSort,
    byId, sorted, searched, albums, artists, playlistTracks, matches,
  };
})();
