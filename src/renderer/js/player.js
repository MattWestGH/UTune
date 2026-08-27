const Player = (() => {
  const audio = $('#audio');
  audio.crossOrigin = 'anonymous';

  const state = {
    queue: [],        // track ids in play order
    index: -1,
    shuffle: false,
    repeat: 'off',    // off | all | one
    volume: 0.8,
    muted: false,
    playing: false,
  };

  const listeners = new Set();
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach((fn) => fn(state));

  const current = () => (state.index >= 0 ? Store.byId(state.queue[state.index]) : null);

  /* ----------------------------- playback ----------------------------- */

  function load(track, autoplay = true) {
    if (!track) return;
    audio.src = mediaUrl(track);
    audio.load();
    if (autoplay) {
      audio.play().catch((err) => toast('Could not play that file', 'bad'));
    }
    paint();
    Visualizer.attach(audio);
    mediaSession(track);
  }

  function playTracks(tracks, startIndex = 0) {
    if (!tracks.length) return;
    const ids = tracks.map((t) => t.id);
    if (state.shuffle) {
      const first = ids[startIndex];
      const rest = ids.filter((_, i) => i !== startIndex);
      shuffleArray(rest);
      state.queue = [first, ...rest];
      state.index = 0;
    } else {
      state.queue = ids;
      state.index = startIndex;
    }
    load(current());
    emit();
  }

  function playNow(track) {
    playTracks([track], 0);
  }

  function enqueue(tracks, { next = false } = {}) {
    const ids = tracks.map((t) => t.id);
    if (!state.queue.length) return playTracks(tracks, 0);
    if (next) state.queue.splice(state.index + 1, 0, ...ids);
    else state.queue.push(...ids);
    emit();
    toast(ids.length > 1 ? `${ids.length} tracks queued` : 'Queued', 'good', 1800);
  }

  function toggle() {
    if (!current()) {
      const all = Store.sorted(Store.searched());
      if (all.length) playTracks(all, 0);
      return;
    }
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function next({ manual = false } = {}) {
    if (!state.queue.length) return;
    if (state.repeat === 'one' && !manual) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    if (state.index < state.queue.length - 1) {
      state.index += 1;
    } else if (state.repeat === 'all') {
      state.index = 0;
    } else {
      audio.pause();
      audio.currentTime = 0;
      paint();
      emit();
      return;
    }
    load(current());
    emit();
  }

  function prev() {
    if (!state.queue.length) return;
    // Standard behaviour: restart the track unless pressed early on.
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (state.index > 0) state.index -= 1;
    else if (state.repeat === 'all') state.index = state.queue.length - 1;
    load(current());
    emit();
  }

  function jumpTo(queueIndex) {
    if (queueIndex < 0 || queueIndex >= state.queue.length) return;
    state.index = queueIndex;
    load(current());
    emit();
  }

  function removeFromQueue(queueIndex) {
    if (queueIndex === state.index) return;
    state.queue.splice(queueIndex, 1);
    if (queueIndex < state.index) state.index -= 1;
    emit();
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    if (state.shuffle && state.queue.length > 1) {
      const currentId = state.queue[state.index];
      const rest = state.queue.filter((id) => id !== currentId);
      shuffleArray(rest);
      state.queue = [currentId, ...rest];
      state.index = 0;
    }
    paintControls();
    emit();
  }

  function cycleRepeat() {
    state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
    paintControls();
    emit();
  }

  function seekRatio(ratio) {
    if (!isFinite(audio.duration)) return;
    audio.currentTime = ratio * audio.duration;
  }

  function setVolume(value) {
    state.volume = Math.min(1, Math.max(0, value));
    state.muted = state.volume === 0;
    audio.volume = state.volume;
    audio.muted = false;
    paintVolume();
    localStorage.setItem('utune.volume', String(state.volume));
  }

  function toggleMute() {
    state.muted = !state.muted;
    audio.muted = state.muted;
    paintVolume();
  }

  /* ------------------------------- paint ------------------------------- */

  function paint() {
    const track = current();
    const cover = $('#pl-cover');
    const url = coverUrl(track);
    cover.innerHTML = url
      ? `<img src="${esc(url)}" alt="" />`
      : '<div class="cover-fallback">♪</div>';
    $('#pl-title').textContent = track ? track.title : 'Nothing playing';
    $('#pl-artist').textContent = track ? track.artist : 'Pick something lovely';
    const fav = $('#pl-fav');
    const loved = !!(track && track.favorite);
    fav.classList.toggle('on', loved);
    fav.innerHTML = loved ? ICONS.heart : ICONS.heartOutline;
    paintControls();
    paintProgress();
  }

  function paintControls() {
    const play = $('#btn-play');
    play.innerHTML = state.playing ? ICONS.pause : ICONS.play;
    play.classList.toggle('is-playing', state.playing);
    play.title = state.playing ? 'Pause' : 'Play';

    $('#btn-prev').innerHTML = ICONS.prev;
    $('#btn-next').innerHTML = ICONS.next;
    $('#btn-queue').innerHTML = ICONS.queue;

    const shuffle = $('#btn-shuffle');
    shuffle.innerHTML = ICONS.shuffle;
    shuffle.classList.toggle('on', state.shuffle);

    const rep = $('#btn-repeat');
    rep.classList.toggle('on', state.repeat !== 'off');
    rep.innerHTML = state.repeat === 'one' ? ICONS.repeatOne : ICONS.repeat;
    rep.title = state.repeat === 'one' ? 'Repeat one' : state.repeat === 'all' ? 'Repeat all' : 'Repeat off';
  }

  function paintProgress() {
    const dur = isFinite(audio.duration) ? audio.duration : (current() ? current().duration : 0) || 0;
    const pos = audio.currentTime || 0;
    const pct = dur ? (pos / dur) * 100 : 0;
    $('#seek-fill').style.width = pct + '%';
    $('#seek-knob').style.left = pct + '%';
    $('#time-now').textContent = fmtTime(pos);
    $('#time-total').textContent = fmtTime(dur);
  }

  function paintVolume() {
    const level = state.muted ? 0 : state.volume;
    $('#vol-fill').style.width = level * 100 + '%';
    $('#vol-knob').style.left = level * 100 + '%';
    $('#btn-mute').innerHTML = level === 0 ? ICONS.volMute : level < 0.5 ? ICONS.volLow : ICONS.volHigh;
  }

  function mediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;
    const art = coverUrl(track);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: art ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => next({ manual: true }));
  }

  /* ------------------------------- events ------------------------------- */

  let seekBar;

  function init() {
    const savedVolume = parseFloat(localStorage.getItem('utune.volume'));
    setVolume(isNaN(savedVolume) ? 0.8 : savedVolume);

    audio.addEventListener('play', () => { state.playing = true; paintControls(); emit(); });
    audio.addEventListener('pause', () => { state.playing = false; paintControls(); emit(); });
    audio.addEventListener('ended', () => {
      const track = current();
      if (track) window.utune.library.update(track.id, { playCount: (track.playCount || 0) + 1 });
      next();
    });
    audio.addEventListener('timeupdate', () => { if (!seekBar || !seekBar.isDragging()) paintProgress(); });
    audio.addEventListener('loadedmetadata', paintProgress);
    audio.addEventListener('error', () => {
      if (audio.src) toast('That file could not be played', 'bad');
    });

    $('#btn-play').onclick = toggle;
    $('#btn-next').onclick = () => next({ manual: true });
    $('#btn-prev').onclick = prev;
    $('#btn-shuffle').onclick = toggleShuffle;
    $('#btn-repeat').onclick = cycleRepeat;
    $('#btn-mute').onclick = toggleMute;
    $('#pl-fav').onclick = async () => {
      const track = current();
      if (!track) return;
      await window.utune.library.update(track.id, { favorite: !track.favorite });
      await Store.refresh();
      paint();
    };

    seekBar = bindSlider($('#seek'), {
      onInput: (r) => {
        $('#seek-fill').style.width = r * 100 + '%';
        $('#seek-knob').style.left = r * 100 + '%';
        const dur = isFinite(audio.duration) ? audio.duration : 0;
        $('#time-now').textContent = fmtTime(r * dur);
      },
      onCommit: seekRatio,
    });

    bindSlider($('#volume'), { onInput: setVolume });

    paint();
    paintVolume();
  }

  return {
    init, state, subscribe, current, playTracks, playNow, enqueue, toggle,
    next, prev, jumpTo, removeFromQueue, toggleShuffle, cycleRepeat, seekRatio,
    setVolume, toggleMute, paint, audio,
  };
})();
