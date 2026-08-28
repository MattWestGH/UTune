/** The Profile and Settings pages. */
const SettingsViews = (() => {

  /* ------------------------------- profile ------------------------------- */

  function viewProfile() {
    const p = Profile.get();
    const slot = Profile.slotFor();
    const [a, b, c] = slot.colors;

    const nameInput = el('input', {
      class: 'field-input', type: 'text', maxlength: 40,
      value: p.name, placeholder: 'What should I call you?',
    });

    const bioInput = el('textarea', {
      class: 'field-input profile-bio', rows: 4, maxlength: 400,
      placeholder: 'A line about you, a favourite lyric, anything.',
    });
    bioInput.value = p.bio || '';

    const avatarHost = el('div', { class: 'profile-avatar-host' }, [Profile.avatarNode('profile-avatar')]);

    const refreshAvatar = () => {
      avatarHost.innerHTML = '';
      avatarHost.appendChild(Profile.avatarNode('profile-avatar'));
    };

    const saveNow = debounce(async () => {
      await Profile.save({ name: nameInput.value.trim(), bio: bioInput.value });
      refreshAvatar();
      paintSidebarProfile();
    }, 300);

    nameInput.addEventListener('input', saveNow);
    bioInput.addEventListener('input', saveNow);

    return el('div', {}, [
      // A banner in the current time-of-day colours, so the page feels like the intro.
      el('div', {
        class: 'profile-banner',
        style: { backgroundImage: Profile.introWash(a, b, c) },
      }, [
        el('div', { class: 'profile-banner-inner' }, [
          avatarHost,
          el('div', {}, [
            el('div', { class: 'profile-greeting', text: Profile.greeting() }),
            p.bio ? el('div', { class: 'profile-banner-bio', text: p.bio }) : null,
          ]),
        ]),
      ]),

      el('section', { class: 'section' }, [
        el('h2', { class: 'section-title', text: 'Your profile' }),
        el('div', { class: 'panel profile-form' }, [
          el('div', { class: 'field' }, [
            el('label', { class: 'field-label', text: 'Display name' }),
            nameInput,
          ]),
          el('div', { class: 'field' }, [
            el('label', { class: 'field-label', text: 'About you' }),
            bioInput,
          ]),
          el('div', { class: 'field' }, [
            el('label', { class: 'field-label', text: 'Profile picture' }),
            el('div', { class: 'row-actions' }, [
              el('button', {
                class: 'ghost-btn', text: 'Choose a picture',
                onclick: async () => {
                  const added = await window.utune.profile.pickAvatar();
                  if (!added) return;
                  await Profile.save({ avatar: added.name });
                  refreshAvatar();
                  paintSidebarProfile();
                  toast('Looking good', 'good');
                },
              }),
              p.avatar ? el('button', {
                class: 'ghost-btn', text: 'Remove',
                onclick: async () => {
                  await Profile.save({ avatar: null });
                  Store.emit();
                  paintSidebarProfile();
                },
              }) : null,
            ]),
          ]),
        ]),
      ]),
    ]);
  }

  /* ------------------------------ equaliser ------------------------------ */

  function eqSection() {
    const eq = Equalizer.get();
    const makeupNote = el('div', { class: 'field-note' });

    const refreshNote = () => {
      const db = Equalizer.makeupDb();
      makeupNote.textContent = db < -0.05
        ? `Output trimmed by ${Math.abs(db).toFixed(1)} dB so this curve is never louder than flat.`
        : 'Boosts are compensated automatically, so no preset is louder than flat.';
    };

    const enable = el('input', { type: 'checkbox' });
    enable.checked = eq.enabled;
    enable.addEventListener('change', () => {
      Equalizer.setEnabled(enable.checked);
      paintBands();
      refreshNote();
    });

    const presetSelect = el('select', { class: 'field-select' },
      Object.keys(Equalizer.PRESETS).map((name) => el('option', { value: name, text: name })));
    if (!Equalizer.PRESETS[eq.preset]) {
      presetSelect.appendChild(el('option', { value: 'Custom', text: 'Custom' }));
    }
    presetSelect.value = eq.preset;
    presetSelect.addEventListener('change', () => {
      Equalizer.usePreset(presetSelect.value);
      enable.checked = Equalizer.get().enabled;
      paintBands();
      refreshNote();
    });

    const bandsNode = el('div', { class: 'eq-bands' });

    function paintBands() {
      const cur = Equalizer.get();
      bandsNode.innerHTML = '';
      Equalizer.BANDS.forEach((hz, i) => {
        const slider = el('input', {
          type: 'range', class: 'eq-slider', orient: 'vertical',
          min: -Equalizer.RANGE, max: Equalizer.RANGE, step: 0.5,
          value: cur.gains[i],
        });
        const readout = el('div', { class: 'eq-db', text: fmtDb(cur.gains[i]) });
        slider.addEventListener('input', () => {
          Equalizer.setBand(i, parseFloat(slider.value));
          readout.textContent = fmtDb(parseFloat(slider.value));
          enable.checked = true;
          const now = Equalizer.get();
          if (!Equalizer.PRESETS[now.preset] && presetSelect.value !== 'Custom') {
            if (!$('option[value="Custom"]', presetSelect)) {
              presetSelect.appendChild(el('option', { value: 'Custom', text: 'Custom' }));
            }
          }
          presetSelect.value = Equalizer.PRESETS[now.preset] ? now.preset : 'Custom';
          refreshNote();
        });
        bandsNode.appendChild(el('div', { class: 'eq-band' }, [
          readout, slider, el('div', { class: 'eq-hz', text: Equalizer.label(hz) }),
        ]));
      });
    }

    const fmtDb = (v) => (v > 0 ? '+' : '') + Number(v).toFixed(1);

    paintBands();
    refreshNote();

    return el('section', { class: 'section' }, [
      el('h2', { class: 'section-title', text: 'Equaliser' }),
      el('div', { class: 'panel settings-panel' }, [
        el('label', { class: 'setting-row' }, [
          enable,
          el('div', {}, [
            el('div', { class: 'setting-label', text: 'Use the equaliser' }),
            el('div', { class: 'field-note', text: 'Ten bands across the standard ISO octaves, 31 Hz to 16 kHz.' }),
          ]),
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field-label', text: 'Preset' }),
          presetSelect,
        ]),
        bandsNode,
        makeupNote,
        el('div', { class: 'row-actions' }, [
          el('button', {
            class: 'ghost-btn small', text: 'Reset to flat',
            onclick: () => { Equalizer.reset(); presetSelect.value = 'Flat'; paintBands(); refreshNote(); },
          }),
        ]),
      ]),
    ]);
  }

  /* ------------------------------- settings ------------------------------- */

  function viewSettings() {
    const p = Profile.get();

    const soundSelect = el('select', { class: 'field-select' });
    const soundStatus = el('div', { class: 'field-note' });

    const refreshSounds = async () => {
      const sounds = await window.utune.profile.listSounds();
      soundSelect.innerHTML = '';
      soundSelect.appendChild(el('option', { value: '', text: 'No sound' }));
      for (const s of sounds) {
        soundSelect.appendChild(el('option', {
          value: s.name,
          text: s.name === 'startup.mp3' ? 'Default chime' : s.name.replace(/\.[^.]+$/, ''),
        }));
      }
      soundSelect.value = p.startupSound || '';
      await describe(soundSelect.value);
    };

    const describe = async (name) => {
      if (!name) {
        soundStatus.textContent = 'Start-up is silent.';
        soundStatus.classList.remove('warn');
        return;
      }
      const { duration, error } = await Profile.probeSound(name);
      if (error) {
        soundStatus.textContent = 'That file could not be read.';
        soundStatus.classList.add('warn');
        return;
      }
      if (duration > Profile.MAX_SOUND_SECONDS) {
        soundStatus.textContent =
          `${duration.toFixed(1)}s — only the first ${Profile.MAX_SOUND_SECONDS} seconds will play.`;
        soundStatus.classList.add('warn');
      } else {
        soundStatus.textContent = `${duration.toFixed(1)}s`;
        soundStatus.classList.remove('warn');
      }
    };

    soundSelect.addEventListener('change', async () => {
      await Profile.save({ startupSound: soundSelect.value || null });
      await describe(soundSelect.value);
      if (soundSelect.value) Profile.playStartupSound(soundSelect.value, { force: true });
    });

    refreshSounds();

    const toggle = (label, note, key) => {
      const input = el('input', { type: 'checkbox' });
      input.checked = !!p[key];
      input.addEventListener('change', () => Profile.save({ [key]: input.checked }));
      return el('label', { class: 'setting-row' }, [
        input,
        el('div', {}, [
          el('div', { class: 'setting-label', text: label }),
          el('div', { class: 'field-note', text: note }),
        ]),
      ]);
    };

    return el('div', {}, [
      Views.header({ eyebrow: 'UTune', title: 'Settings' }),

      el('section', { class: 'section' }, [
        el('h2', { class: 'section-title', text: 'Opening the app' }),
        el('div', { class: 'panel settings-panel' }, [
          toggle('Show the greeting', 'A short hello in the colours of the time of day.', 'showIntro'),
          toggle('Play a sound on start-up', 'Only the first 5 seconds of a clip are used.', 'playStartupSound'),

          el('div', { class: 'field' }, [
            el('label', { class: 'field-label', text: 'Start-up sound' }),
            soundSelect,
            soundStatus,
            el('div', { class: 'row-actions' }, [
              el('button', {
                class: 'ghost-btn small', text: '▶ Preview',
                onclick: () => {
                  if (soundSelect.value) Profile.playStartupSound(soundSelect.value, { force: true });
                },
              }),
              el('button', {
                class: 'ghost-btn small', text: '＋ Add a sound',
                onclick: async () => {
                  const added = await window.utune.profile.pickSound();
                  if (!added) return;
                  const { duration } = await Profile.probeSound(added.name);
                  await Profile.save({ startupSound: added.name });
                  await refreshSounds();
                  if (duration > Profile.MAX_SOUND_SECONDS) {
                    toast(`Added — it is ${duration.toFixed(1)}s, so it will be cut to ${Profile.MAX_SOUND_SECONDS}s`, 'info', 5000);
                  } else {
                    toast('Sound added', 'good');
                  }
                  Profile.playStartupSound(added.name, { force: true });
                },
              }),
            ]),
          ]),
        ]),
      ]),

      eqSection(),

      el('section', { class: 'section' }, [
        el('h2', { class: 'section-title', text: 'Your library' }),
        el('div', { class: 'panel settings-panel' }, [
          el('p', { class: 'field-note', text: 'Your music files and the list of them are separate. '
            + 'If tracks ever go missing from the list, the audio is usually still on disk — this puts it back.' }),
          el('div', { class: 'row-actions' }, [
            el('button', {
              class: 'ghost-btn', text: 'Rescan my music folder',
              onclick: async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = 'Scanning…';
                const res = await window.utune.library.rescan();
                await Store.refresh();
                btn.disabled = false;
                btn.textContent = 'Rescan my music folder';
                if (res.blocked) toast('Cannot rescan while the library file is unreadable', 'bad', 8000);
                else if (res.added.length) toast(`Recovered ${res.added.length} track${res.added.length === 1 ? '' : 's'}`, 'good', 6000);
                else toast('Nothing missing — everything on disk is already listed', 'info');
              },
            }),
            el('button', {
              class: 'ghost-btn', text: 'Open my music folder',
              onclick: () => window.utune.app.openDataDir(),
            }),
          ]),
        ]),
      ]),

      el('section', { class: 'section' }, [
        el('h2', { class: 'section-title', text: 'Shortcuts' }),
        el('div', { class: 'panel settings-panel' }, [
          el('p', { class: 'field-note', text: 'UTune adds itself to the Start Menu automatically. Right-click it there (or its taskbar button while running) and choose "Pin to taskbar".' }),
          el('div', { class: 'row-actions' }, [
            el('button', {
              class: 'ghost-btn', text: 'Create a desktop shortcut',
              onclick: async () => {
                const ok = await window.utune.app.createDesktopShortcut(Theme.values().brandName || 'UTune');
                toast(ok ? 'Shortcut added to your desktop' : 'Could not create the shortcut', ok ? 'good' : 'bad');
              },
            }),
            el('button', {
              class: 'ghost-btn', text: 'Open my music folder',
              onclick: () => window.utune.app.openDataDir(),
            }),
          ]),
        ]),
      ]),

      el('section', { class: 'section' }, [
        el('h2', { class: 'section-title', text: 'About' }),
        el('div', { class: 'panel settings-panel' }, [
          el('div', { class: 'field-note', text: `UTune ${APP_VERSION} — made for you.` }),
          el('div', { class: 'field-note', text: 'Your music, artwork, themes and settings all live in the UTune-Data folder next to the app.' }),
        ]),
      ]),
    ]);
  }

  return { viewProfile, viewSettings };
})();
