/** The YouTube grabber view. Jobs live at module level so navigating away never loses one. */
const Download = (() => {
  const jobs = new Map();      // jobId -> job state
  const pending = [];          // urls submitted before their jobId came back
  let listNode = null;

  const options = {
    quality: 'm4a',
    playlist: false,
    cookiesFromBrowser: '',
    cookiesFile: '',
  };

  function isLikelyUrl(text) {
    return /^https?:\/\/\S+$/i.test(text.trim());
  }

  async function submit(rawInput) {
    const urls = rawInput
      .split(/[\n\r]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const bad = urls.filter((u) => !isLikelyUrl(u));
    if (!urls.length || bad.length) {
      toast('That does not look like a link', 'bad');
      return;
    }

    for (const url of urls) {
      const placeholder = {
        jobId: null, url, phase: 'queued', percent: 0,
        title: url, key: 'pending-' + Math.random().toString(36).slice(2),
      };
      jobs.set(placeholder.key, placeholder);
      paint();

      const jobId = await window.utune.youtube.download(url, { ...options });
      // Re-key the placeholder once the real job id is known.
      jobs.delete(placeholder.key);
      placeholder.jobId = jobId;
      placeholder.key = jobId;
      jobs.set(jobId, placeholder);
      paint();
    }
  }

  function onProgress(evt) {
    const job = jobs.get(evt.jobId) || { key: evt.jobId };
    // Real progress supersedes a one-off notice, which would otherwise stick.
    if (!evt.notice && evt.percent > 0) delete job.notice;
    Object.assign(job, evt, { key: evt.jobId });
    jobs.set(evt.jobId, job);

    if (evt.phase === 'done') {
      const count = (evt.tracks || []).length;
      toast(count > 1 ? `Added ${count} tracks` : `Added "${evt.title || 'track'}"`, 'good');
      Store.refresh();
      setTimeout(() => { jobs.delete(evt.jobId); paint(); }, 4000);
    }
    if (evt.phase === 'error') {
      toast('Download failed - see the list for details', 'bad', 5000);
    }
    paint();
  }

  function phaseLabel(job) {
    if (job.notice && job.phase !== 'error' && job.phase !== 'done') return job.notice;
    switch (job.phase) {
      case 'queued': return 'Queued';
      case 'starting': return 'Looking it up…';
      case 'downloading': return [job.percent.toFixed(0) + '%', job.speed, job.eta ? 'ETA ' + job.eta : '']
        .filter(Boolean).join(' · ');
      case 'processing': return 'Processing…';
      case 'importing': return 'Adding to library…';
      case 'done': return 'Done';
      case 'error': return job.error || 'Failed';
      default: return job.phase;
    }
  }

  function jobRow(job) {
    const pct = job.phase === 'done' ? 100 : (job.percent || 0);
    return el('div', { class: 'dl-job dl-' + job.phase }, [
      el('div', { class: 'dl-top' }, [
        el('div', { class: 'dl-title', text: job.title || job.url, title: job.url }),
        job.phase === 'error' || job.phase === 'done'
          ? el('button', { class: 'icon-btn', text: '×', title: 'Dismiss', onclick: () => { jobs.delete(job.key); paint(); } })
          : el('button', { class: 'icon-btn', text: '×', title: 'Cancel', onclick: async () => {
              if (job.jobId) await window.utune.youtube.cancel(job.jobId);
              jobs.delete(job.key);
              paint();
            } }),
      ]),
      el('div', { class: 'dl-bar' }, [el('div', { class: 'dl-bar-fill', style: { width: pct + '%' } })]),
      el('div', { class: 'dl-status', text: phaseLabel(job) }),
    ]);
  }

  function paint() {
    if (!listNode || !listNode.isConnected) return;
    listNode.innerHTML = '';
    const list = [...jobs.values()];
    if (!list.length) {
      listNode.appendChild(el('div', { class: 'dl-idle', text: 'No downloads running.' }));
      return;
    }
    list.forEach((job) => listNode.appendChild(jobRow(job)));
  }

  function render() {
    const input = el('textarea', {
      class: 'dl-input',
      rows: 3,
      placeholder: 'Paste a YouTube link (or several, one per line) and press Enter',
      spellcheck: false,
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const value = input.value;
        input.value = '';
        submit(value);
      }
    });

    const qualitySelect = el('select', {
      class: 'field-select',
      onchange: (e) => { options.quality = e.target.value; },
    }, [
      el('option', { value: 'm4a', text: 'Best AAC (m4a) — most compatible' }),
      el('option', { value: 'best', text: 'Highest bitrate available (usually Opus)' }),
    ]);
    qualitySelect.value = options.quality;

    const playlistToggle = el('label', { class: 'switch-row' }, [
      (() => {
        const cb = el('input', { type: 'checkbox', onchange: (e) => { options.playlist = e.target.checked; } });
        cb.checked = options.playlist;
        return cb;
      })(),
      el('span', { text: 'Grab the whole playlist when the link has one' }),
    ]);

    const cookieNote = el('div', { class: 'field-note' });

    const describeCookies = () => {
      if (options.cookiesFile) {
        cookieNote.textContent = 'Using ' + options.cookiesFile.split(/[\\/]/).pop();
        cookieNote.classList.remove('warn');
      } else if (options.cookiesFromBrowser === 'firefox') {
        cookieNote.textContent = 'Firefox cookies usually work.';
        cookieNote.classList.remove('warn');
      } else if (options.cookiesFromBrowser) {
        cookieNote.textContent =
          'Chrome and Edge encrypt their cookies so other apps cannot read them. '
          + 'This often fails - a cookies.txt file is the reliable option.';
        cookieNote.classList.add('warn');
      } else {
        cookieNote.textContent = 'Only needed for age-restricted or private videos.';
        cookieNote.classList.remove('warn');
      }
    };

    const cookiesSelect = el('select', {
      class: 'field-select',
      onchange: async (e) => {
        const value = e.target.value;
        if (value === 'file') {
          const picked = await window.utune.youtube.pickCookies();
          if (!picked) {
            cookiesSelect.value = options.cookiesFile ? 'file' : options.cookiesFromBrowser;
            return;
          }
          options.cookiesFile = picked;
          options.cookiesFromBrowser = '';
        } else {
          options.cookiesFile = '';
          options.cookiesFromBrowser = value;
        }
        describeCookies();
      },
    }, [
      el('option', { value: '', text: 'No sign-in (default)' }),
      el('option', { value: 'file', text: 'Cookies.txt file — most reliable' }),
      el('option', { value: 'firefox', text: 'Firefox cookies' }),
      el('option', { value: 'chrome', text: 'Chrome cookies (often blocked)' }),
      el('option', { value: 'edge', text: 'Edge cookies (often blocked)' }),
    ]);
    cookiesSelect.value = options.cookiesFile ? 'file' : options.cookiesFromBrowser;
    describeCookies();

    listNode = el('div', { class: 'dl-list' });

    const node = el('div', {}, [
      Views.header({
        eyebrow: 'Get music',
        title: 'From YouTube',
        subtitle: 'Audio only, at the best quality the video offers. Artwork and details come along for the ride.',
      }),
      el('div', { class: 'panel dl-panel' }, [
        input,
        el('div', { class: 'dl-actions' }, [
          el('button', {
            class: 'primary-btn', text: '↓  Download',
            onclick: () => { const v = input.value; input.value = ''; submit(v); },
          }),
          el('button', {
            class: 'ghost-btn', text: 'Paste from clipboard',
            onclick: async () => {
              try {
                const text = await navigator.clipboard.readText();
                input.value = input.value ? input.value + '\n' + text : text;
                input.focus();
              } catch (err) {
                toast('Clipboard is not available', 'bad');
              }
            },
          }),
        ]),
        el('div', { class: 'dl-options' }, [
          el('div', { class: 'field' }, [el('label', { class: 'field-label', text: 'Quality' }), qualitySelect]),
          el('div', { class: 'field' }, [
            el('label', { class: 'field-label', text: 'Age-restricted videos' }),
            cookiesSelect,
            cookieNote,
          ]),
        ]),
        playlistToggle,
      ]),
      el('section', { class: 'section' }, [
        el('h2', { class: 'section-title', text: 'Downloads' }),
        listNode,
      ]),
    ]);

    setTimeout(() => { paint(); input.focus(); }, 0);
    return node;
  }

  return { render, onProgress, submit, hasJobs: () => jobs.size > 0 };
})();
