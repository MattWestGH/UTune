const Views = (() => {
  const host = () => $('#view');

  /* --------------------------- shared pieces --------------------------- */

  function header({ eyebrow, title, subtitle, actions = [], art = null, artHue = null }) {
    return el('div', { class: 'page-head' + (art !== null ? ' with-art' : '') }, [
      art !== null ? el('div', { class: 'head-art' }, [
        art ? el('img', { src: art, alt: '' }) : el('div', { class: 'cover-fallback big', text: '♪' }),
      ]) : null,
      el('div', { class: 'head-text' }, [
        eyebrow ? el('div', { class: 'eyebrow', text: eyebrow }) : null,
        el('h1', { class: 'page-title', text: title }),
        subtitle ? el('div', { class: 'page-sub', text: subtitle }) : null,
        actions.length ? el('div', { class: 'head-actions' }, actions) : null,
      ]),
    ]);
  }

  const primaryBtn = (label, onclick) => el('button', { class: 'primary-btn', text: label, onclick });
  const ghostBtn = (label, onclick) => el('button', { class: 'ghost-btn', text: label, onclick });

  function playAllActions(getTracks) {
    return [
      primaryBtn('▶  Play', () => {
        const tracks = getTracks();
        if (tracks.length) Player.playTracks(tracks, 0);
      }),
      ghostBtn('Shuffle', () => {
        const tracks = getTracks();
        if (!tracks.length) return;
        if (!Player.state.shuffle) Player.toggleShuffle();
        Player.playTracks(tracks, Math.floor(Math.random() * tracks.length));
      }),
    ];
  }

  function emptyState(title, message, action) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty-ico', text: '♫' }),
      el('h2', { text: title }),
      el('p', { text: message }),
      action || null,
    ]);
  }

  /* ------------------------------ track list ------------------------------ */

  function trackRow(track, index, context) {
    const playing = Player.current() && Player.current().id === track.id;
    const art = coverUrl(track);

    const row = el('div', {
      class: 'track-row' + (playing ? ' playing' : ''),
      dataset: { id: track.id },
      onDblclick: () => Player.playTracks(context.tracks, index),
      onContextmenu: (e) => trackMenu(e, track, context),
    }, [
      el('div', { class: 'tr-index' }, [
        el('span', { class: 'tr-num', text: String(index + 1) }),
        el('button', {
          class: 'tr-play', html: playing && Player.state.playing ? ICONS.pause : ICONS.play,
          onclick: () => {
            if (playing) Player.toggle();
            else Player.playTracks(context.tracks, index);
          },
        }),
      ]),
      el('div', { class: 'tr-main' }, [
        el('div', { class: 'tr-art' }, [
          art ? el('img', { src: art, alt: '', loading: 'lazy' }) : el('div', { class: 'cover-fallback', text: '♪' }),
        ]),
        el('div', { class: 'tr-titles' }, [
          el('div', { class: 'tr-title', text: track.title }),
          el('div', { class: 'tr-artist', text: track.artist }),
        ]),
      ]),
      el('div', { class: 'tr-album', text: track.album }),
      el('button', {
        class: 'tr-fav icon-btn heart' + (track.favorite ? ' on' : ''),
        html: track.favorite ? ICONS.heart : ICONS.heartOutline,
        title: 'Love this track',
        onclick: async (e) => {
          e.stopPropagation();
          await window.utune.library.update(track.id, { favorite: !track.favorite });
          await Store.refresh();
          Player.paint();
        },
      }),
      el('div', { class: 'tr-time', text: fmtTime(track.duration) }),
      el('button', {
        class: 'tr-more icon-btn', text: '⋯', title: 'More',
        onclick: (e) => { e.stopPropagation(); trackMenu(e, track, context); },
      }),
    ]);
    return row;
  }

  function trackList(tracks, context = {}) {
    const ctx = { tracks, ...context };
    if (!tracks.length) return emptyState('Nothing here yet', 'Add some music and it will show up right here.');
    const list = el('div', { class: 'track-list' }, [
      el('div', { class: 'track-head' }, [
        el('div', { class: 'tr-index', text: '#' }),
        el('div', { class: 'th-sort tr-main', text: 'Title', onclick: () => Store.setSort('title') }),
        el('div', { class: 'th-sort tr-album', text: 'Album', onclick: () => Store.setSort('album') }),
        el('div', { class: 'tr-fav' }),
        el('div', { class: 'th-sort tr-time', text: '⏱', onclick: () => Store.setSort('duration') }),
        el('div', { class: 'tr-more' }),
      ]),
    ]);
    tracks.forEach((t, i) => list.appendChild(trackRow(t, i, ctx)));
    return list;
  }

  /* ------------------------------ menus ------------------------------ */

  function trackMenu(event, track, context = {}) {
    const items = [
      { label: 'Play now', action: () => Player.playNow(track) },
      { label: 'Play next', action: () => Player.enqueue([track], { next: true }) },
      { label: 'Add to queue', action: () => Player.enqueue([track]) },
      'sep',
      { label: 'Add to playlist…', action: () => addToPlaylistDialog([track.id]) },
      { label: track.favorite ? 'Remove from Loved' : 'Add to Loved', action: async () => {
        await window.utune.library.update(track.id, { favorite: !track.favorite });
        await Store.refresh();
        Player.paint();
      } },
      'sep',
      { label: 'Edit details…', action: () => editTrackDialog(track) },
      { label: 'Change artwork…', action: async () => {
        const updated = await window.utune.library.pickCover(track.id);
        if (updated) { await Store.refresh(); Player.paint(); toast('Artwork updated', 'good'); }
      } },
      { label: 'Show file', action: () => window.utune.library.reveal(track.id) },
    ];

    if (track.sourceUrl) {
      items.push({ label: 'Open on YouTube', action: () => window.utune.app.openExternal(track.sourceUrl) });
    }

    if (context.playlist) {
      items.push('sep', {
        label: 'Remove from this playlist',
        action: async () => {
          const ids = context.playlist.trackIds.filter((id) => id !== track.id);
          await window.utune.playlists.update(context.playlist.id, { trackIds: ids });
          await Store.refresh();
        },
      });
    }

    items.push('sep', {
      label: 'Delete from library', danger: true,
      action: async () => {
        const ok = await askConfirm({
          title: 'Delete this track?',
          message: `"${track.title}" will be removed from your library and its file deleted.`,
        });
        if (!ok) return;
        await window.utune.library.remove(track.id, true);
        await Store.refresh();
        toast('Deleted', 'good');
      },
    });

    contextMenu(event, items);
  }

  async function addToPlaylistDialog(trackIds) {
    const { playlists } = Store.state;
    const list = el('div', { class: 'pick-list' });

    for (const pl of playlists) {
      list.appendChild(el('button', {
        class: 'pick-item',
        onclick: async () => {
          closeModal();
          await window.utune.playlists.add(pl.id, trackIds);
          await Store.refresh();
          toast(`Added to ${pl.name}`, 'good');
        },
      }, [
        el('span', { class: 'pick-ico', text: '≡' }),
        el('span', { text: pl.name }),
        el('span', { class: 'pick-count', text: `${(pl.trackIds || []).length}` }),
      ]));
    }

    const node = el('div', { class: 'modal-form' }, [
      el('h3', { text: 'Add to playlist' }),
      playlists.length ? list : el('p', { class: 'modal-msg', text: 'You have no playlists yet.' }),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'ghost-btn', text: 'Cancel', onclick: closeModal }),
        el('button', {
          class: 'primary-btn', text: 'New playlist…',
          onclick: async () => {
            closeModal();
            const name = await askText({ title: 'New playlist', label: 'Name', value: 'My mixtape', confirmText: 'Create' });
            if (!name) return;
            const pl = await window.utune.playlists.create(name);
            await window.utune.playlists.add(pl.id, trackIds);
            await Store.refresh();
            toast(`Created ${name}`, 'good');
          },
        }),
      ]),
    ]);
    openModal(node, { width: 420 });
  }

  function editTrackDialog(track) {
    const fields = {};
    const field = (key, label, value) => {
      const input = el('input', { class: 'field-input', value: value || '', type: 'text' });
      fields[key] = input;
      return el('div', { class: 'field' }, [el('label', { class: 'field-label', text: label }), input]);
    };

    const form = el('form', {
      class: 'modal-form',
      onsubmit: async (e) => {
        e.preventDefault();
        closeModal();
        await window.utune.library.update(track.id, {
          title: fields.title.value.trim() || track.title,
          artist: fields.artist.value.trim() || 'Unknown Artist',
          album: fields.album.value.trim() || 'Unknown Album',
          genre: fields.genre.value.trim() || null,
        });
        await Store.refresh();
        Player.paint();
        toast('Saved', 'good');
      },
    }, [
      el('h3', { text: 'Edit details' }),
      field('title', 'Title', track.title),
      field('artist', 'Artist', track.artist),
      field('album', 'Album', track.album),
      field('genre', 'Genre', track.genre),
      el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'ghost-btn', text: 'Cancel', onclick: closeModal }),
        el('button', { type: 'submit', class: 'primary-btn', text: 'Save' }),
      ]),
    ]);
    openModal(form, { width: 440 });
  }

  /* ------------------------------- cards ------------------------------- */

  function card({ art, title, subtitle, round = false, onclick, onmenu }) {
    return el('button', { class: 'card', onclick, oncontextmenu: onmenu }, [
      el('div', { class: 'card-art' + (round ? ' round' : '') }, [
        art ? el('img', { src: art, alt: '', loading: 'lazy' }) : el('div', { class: 'cover-fallback', text: '♪' }),
        el('span', { class: 'card-play', text: '▶' }),
      ]),
      el('div', { class: 'card-title', text: title }),
      subtitle ? el('div', { class: 'card-sub', text: subtitle }) : null,
    ]);
  }

  const grid = (cards) => el('div', { class: 'card-grid' }, cards);

  /* ------------------------------- views ------------------------------- */

  function viewHome() {
    const all = Store.searched();
    if (!all.length) {
      return el('div', {}, [
        header({ eyebrow: Profile.greeting(), title: 'Your library is empty', subtitle: 'Let us fix that.' }),
        emptyState('No music yet',
          'Drop files anywhere in this window, add a folder, or paste a YouTube link.',
          el('div', { class: 'empty-actions' }, [
            primaryBtn('Add files', () => Actions.importFiles()),
            ghostBtn('Add a folder', () => Actions.importFolder()),
            ghostBtn('Paste a YouTube link', () => Store.navigate('download')),
          ])),
      ]);
    }

    const recent = [...all].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
    const mostPlayed = [...all].filter((t) => t.playCount > 0).sort((a, b) => b.playCount - a.playCount).slice(0, 12);
    const loved = all.filter((t) => t.favorite).slice(0, 12);

    const section = (title, tracks, more) => tracks.length ? el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, [
        el('h2', { class: 'section-title', text: title }),
        more ? el('button', { class: 'link-btn', text: 'See all', onclick: more }) : null,
      ]),
      grid(tracks.map((t, i) => card({
        art: coverUrl(t),
        title: t.title,
        subtitle: t.artist,
        onclick: () => Player.playTracks(tracks, i),
        onmenu: (e) => trackMenu(e, t, { tracks }),
      }))),
    ]) : null;

    return el('div', {}, [
      header({
        eyebrow: Profile.greeting(),
        title: Theme.values().brandName || 'UTune',
        subtitle: `${all.length} track${all.length === 1 ? '' : 's'} in your library`,
        actions: playAllActions(() => Store.sorted(all)),
      }),
      section('Recently added', recent, () => Store.navigate('songs')),
      section('On repeat', mostPlayed),
      section('Loved', loved, () => Store.navigate('favorites')),
    ]);
  }

  function viewSongs() {
    const tracks = Store.sorted(Store.searched());
    return el('div', {}, [
      header({
        eyebrow: 'Library',
        title: 'Songs',
        subtitle: `${tracks.length} track${tracks.length === 1 ? '' : 's'}`,
        actions: playAllActions(() => tracks),
      }),
      trackList(tracks),
    ]);
  }

  function viewFavorites() {
    const tracks = Store.sorted(Store.searched().filter((t) => t.favorite));
    return el('div', {}, [
      header({
        eyebrow: 'Library',
        title: 'Loved',
        subtitle: tracks.length ? `${tracks.length} track${tracks.length === 1 ? '' : 's'}` : 'Tap the heart on anything you adore',
        actions: playAllActions(() => tracks),
      }),
      trackList(tracks),
    ]);
  }

  function viewAlbums() {
    const albums = Store.albums();
    if (!albums.length) return emptyState('No albums yet', 'Import some music to see albums here.');
    return el('div', {}, [
      header({ eyebrow: 'Library', title: 'Albums', subtitle: `${albums.length} albums` }),
      grid(albums.map((a) => card({
        art: a.cover ? assetUrl('covers', a.cover) : null,
        title: a.album,
        subtitle: a.artist,
        onclick: () => Store.navigate('album', a.key),
      }))),
    ]);
  }

  function viewAlbum(key) {
    const album = Store.albums().find((a) => a.key === key);
    if (!album) return emptyState('Album not found', 'It may have been removed.');
    const tracks = album.tracks;
    return el('div', {}, [
      header({
        eyebrow: 'Album',
        title: album.album,
        subtitle: `${album.artist} · ${tracks.length} track${tracks.length === 1 ? '' : 's'}`,
        art: album.cover ? assetUrl('covers', album.cover) : null,
        actions: playAllActions(() => tracks),
      }),
      trackList(tracks),
    ]);
  }

  function viewArtists() {
    const artists = Store.artists();
    if (!artists.length) return emptyState('No artists yet', 'Import some music to see artists here.');
    return el('div', {}, [
      header({ eyebrow: 'Library', title: 'Artists', subtitle: `${artists.length} artists` }),
      grid(artists.map((a) => card({
        art: a.cover ? assetUrl('covers', a.cover) : null,
        title: a.name,
        subtitle: `${a.tracks.length} track${a.tracks.length === 1 ? '' : 's'}`,
        round: true,
        onclick: () => Store.navigate('artist', a.name),
      }))),
    ]);
  }

  function viewArtist(name) {
    const artist = Store.artists().find((a) => a.name === name);
    if (!artist) return emptyState('Artist not found', 'They may have been removed.');
    return el('div', {}, [
      header({
        eyebrow: 'Artist',
        title: artist.name,
        subtitle: `${artist.albums.size} album${artist.albums.size === 1 ? '' : 's'} · ${artist.tracks.length} tracks`,
        art: artist.cover ? assetUrl('covers', artist.cover) : null,
        actions: playAllActions(() => artist.tracks),
      }),
      trackList(artist.tracks),
    ]);
  }

  function viewPlaylist(id) {
    const pl = Store.state.playlists.find((p) => p.id === id);
    if (!pl) return emptyState('Playlist not found', 'It may have been deleted.');
    const tracks = Store.playlistTracks(pl).filter((t) => Store.matches(t, Store.state.search));
    const cover = tracks.find((t) => t.cover);

    return el('div', {}, [
      header({
        eyebrow: 'Playlist',
        title: pl.name,
        subtitle: `${tracks.length} track${tracks.length === 1 ? '' : 's'}`,
        art: cover ? assetUrl('covers', cover.cover) : null,
        actions: [
          ...playAllActions(() => tracks),
          ghostBtn('Rename', async () => {
            const name = await askText({ title: 'Rename playlist', label: 'Name', value: pl.name });
            if (!name) return;
            await window.utune.playlists.update(pl.id, { name });
            await Store.refresh();
          }),
          ghostBtn('Delete', async () => {
            const ok = await askConfirm({
              title: 'Delete playlist?',
              message: `"${pl.name}" will be removed. The tracks stay in your library.`,
            });
            if (!ok) return;
            await window.utune.playlists.remove(pl.id);
            await Store.refresh();
            Store.navigate('home');
          }),
        ],
      }),
      trackList(tracks, { playlist: pl }),
    ]);
  }

  /* ------------------------------- render ------------------------------- */

  function render() {
    const { view, viewArg } = Store.state;
    const node = (() => {
      switch (view) {
        case 'home': return viewHome();
        case 'songs': return viewSongs();
        case 'favorites': return viewFavorites();
        case 'albums': return viewAlbums();
        case 'album': return viewAlbum(viewArg);
        case 'artists': return viewArtists();
        case 'artist': return viewArtist(viewArg);
        case 'playlist': return viewPlaylist(viewArg);
        case 'download': return Download.render();
        case 'customize': return Customizer.render();
        case 'profile': return SettingsViews.viewProfile();
        case 'settings': return SettingsViews.viewSettings();
        default: return viewHome();
      }
    })();

    const container = host();
    container.innerHTML = '';
    container.appendChild(node);
    container.scrollTop = 0;
  }

  return { render, trackList, trackMenu, addToPlaylistDialog, header, emptyState, card, grid };
})();
