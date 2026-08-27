# UTune

A standalone Windows music player with a deep visual customiser. Runs from a
single `.exe`, keeps its library beside itself, and never phones home.

## Two builds

`npm run dist` produces both:

| File | Use it when |
| --- | --- |
| **`dist\UTune-Setup.exe`** | **Recommended.** Double-click, it installs and launches. Can be pinned to the taskbar. Library lives in `%APPDATA%\UTune`, untouched by updates and uninstalls. |
| `dist\UTune.exe` | Portable — runs from anywhere including a USB stick, keeps its library in a folder beside it. **Cannot be pinned to the taskbar** (see below). |

Both are the same app; only where they live and where they keep their data differs.

### Why the portable one can't be pinned

A portable exe is a self-extracting bundle: it unpacks into `%TEMP%\utune-runtime`
and the real process runs *from there*. Windows will not pin an executable living
in a volatile temp path, no matter what AppUserModelID it declares — so you get
"Pin to Start" but never "Pin to taskbar". Installing puts a real exe at a fixed
path with proper shortcuts, which is what pinning needs.

## Where your library lives

Installed build: `%APPDATA%\UTune\UTune-Data`
Portable build: a `UTune-Data` folder beside the exe

Either way it holds everything:

```
UTune.exe
UTune-Data\
  library.json      track + playlist database
  theme.json        the current look, saved looks, window size
  profile.json      name, picture, bio, start-up preferences
  media\            the audio files themselves
  covers\           artwork
  backgrounds\      images / GIFs / videos used as app backgrounds
  fonts\            any font files added in the customiser
  avatars\          profile pictures
  sounds\           start-up chimes
```

## Your library is never wiped by an update

Updating means replacing the exe (or re-running the installer). Neither touches
the data folder, so tracks, playlists, themes, backgrounds and your profile all
survive.

On top of that, UTune records where its data folder is in
`%APPDATA%\UTune\location.json`. If it ever starts up somewhere new with nothing
of its own — you moved the exe, switched from portable to installed, or ran a
copy from another folder — it finds the previous library and **copies** it across
(copies, so the original is still there if anything goes wrong) and tells you it
did.

> Do not run the exe from `dist\`. That is a build folder: `npm run dist` clears
> its own outputs there. It leaves `UTune-Data` untouched, but a build folder is
> still the wrong home for a music library. Copy the exe elsewhere, or install it.

## Profile & greeting

**Profile** (top of the sidebar) holds a display name, a picture and a short bio.
No account, no login — it is just stored in `profile.json`.

Opening the app plays a short greeting that reads the clock:

| Time | Greeting | Colours |
| --- | --- | --- |
| 05:00–11:59 | Good morning | warm — amber, gold, rose |
| 12:00–16:59 | Good afternoon | cool — blue, cyan, indigo |
| 17:00–21:59 | Good evening | warm dusk — burnt orange, wine, violet |
| 22:00–04:59 | Still up | near-black indigo |

Times are your PC's local clock.

Click or press any key to skip it. Both the greeting and the start-up sound can
be turned off in **Settings**.

The start-up sound defaults to the bundled chime. Add your own in Settings —
anything longer than **5 seconds** is played only up to the 5 second mark, with a
short fade so it does not end on a click.

## Getting music in

**Local files** — drag audio files or whole folders anywhere onto the window,
or use *Add files* / *Add folder*. Files are copied into `UTune-Data\media`, so
the originals can be moved or deleted afterwards. Tags and embedded artwork are
read automatically. Handles mp3, m4a, aac, flac, wav, ogg, opus and webm.

**YouTube** — paste one or more links into the *YouTube* view. It downloads the
best audio-only stream (no video, so it is fast) and pulls the title, artist,
upload year and thumbnail in as artwork.

- *Best AAC (m4a)* is the default — the most compatible if you ever copy files out.
- *Highest bitrate available* usually gets Opus, which is better quality per
  byte and plays fine in the app.
- Tick the playlist box to grab a whole playlist (capped at 50).
- For age-restricted or private videos, supply cookies via the dropdown.

### Cookies

Most videos need no cookies. They are only required when YouTube demands a
sign-in — age-restricted, private or members-only videos.

Reading cookies straight out of **Chrome or Edge no longer works reliably on
Windows**. Chrome 127+ encrypts its cookie store with an app-bound key that other
programs cannot unwrap ([yt-dlp #10927][abe]), and while the browser is running
the database is locked so it cannot even be copied ([#7271][lock]). Firefox is
unaffected.

The reliable option is a **cookies.txt file**: install a "Get cookies.txt"
extension in whichever browser you are signed into YouTube with, export, and
pick the file in the dropdown.

If cookie extraction fails, the download does not fail with it — it retries once
without cookies and only reports an error if that also fails. Videos that did not
need a sign-in download normally.

[abe]: https://github.com/yt-dlp/yt-dlp/issues/10927
[lock]: https://github.com/yt-dlp/yt-dlp/issues/7271

`yt-dlp.exe` is bundled inside the exe — nothing to install. If YouTube changes
something and downloads start failing, drop a newer `yt-dlp.exe` into
`resources\bin\` and rebuild (see below).

## Making it yours

Everything visual is a live control under **Customise** — no apply button, the
app repaints as you drag.

| Tab | What it does |
| --- | --- |
| **Colours** | 23 separate colours: text, accents, panels, rows, borders, sidebar, title bar, player, sliders, scrollbar, glow, selection… |
| **Typography** | Any font installed on the PC, or drop in your own `.ttf`/`.otf`/`.woff`. Separate body and heading fonts, weights, sizes, letter spacing, line height, casing. |
| **Shape & borders** | Corner radius per element type, border width and style (solid, dashed, dotted, double, groove, ridge), artwork borders, and an "outline every element" mode. |
| **Effects** | Frosted glass, panel opacity, shadows, accent glow, hover lift, animation speed, film grain, vignette, plus whole-app saturation and contrast. |
| **Background** | Solid, gradient, animated gradient, image/GIF or looping video. Fit, zoom, blur, opacity, tint, and six motion styles (pan, breathing zoom, drift, sway, spin) — optionally pulsing in time with the music. |
| **Layout** | Sidebar width, player height, row height, spacing, artwork size, visualiser style (bars, waveform, mirrored, dots, blocks), and the app's name in the title bar. |

The **sidebar edge** and the **top of the player bar** can also be dragged
directly to resize them. Double-click either edge to snap it back to default.

Ten presets ship with it — Midnight Amethyst, Classic Green, Cherry Blossom,
Vapourwave, Terminal, Paper & Ink, Deep Ocean, Peach Sunset, Monochrome and
Cotton Candy. **Surprise me** generates a fresh coherent palette at random.

Looks can be **saved** by name, **exported** to a `.utunetheme.json` file and
**imported** again. Any single control can be reset with the ↺ next to it.

## Volume

The slider never reaches full digital scale. 100% sits at −6 dBFS, and the
travel follows a square-law taper rather than a linear one, so usable levels are
spread across the whole slider instead of bunched at the bottom. A fresh install
starts at 50%.

The start-up chime is scaled from the same setting and sits about 14 dB below
music, because it plays before anything can be adjusted. Muting silences it too.

Every level in the app comes from one function, `amplitudeFor()` in
`player.js` — nothing else assigns to `.volume`. Output changes only when the
slider, the mute button or the volume keys are used; it is never adjusted
automatically. The visualiser's auto-gain scales bar heights only and is not in
the audio path (`source → analyser → destination`, all unity gain).

The one exception is a 0.35 s fade at the end of a start-up clip that has hit the
five-second cap, which only ever ramps down and exists to avoid a click.

## Keyboard

| Key | |
| --- | --- |
| `Space` | play / pause |
| `Ctrl + →` / `Ctrl + ←` | next / previous |
| `↑` / `↓` | volume |
| `M` | mute |
| `S` | shuffle |
| `R` | repeat |
| `Ctrl + F` | search |

Right-click any track for play next, queue, playlists, edit details, change
artwork, show file, or delete.

## Rebuilding

```bash
npm install
npm start        # run from source
npm run dist     # produce dist\UTune.exe
```

`npm run icon` regenerates `build\icon.ico` from `build\source-icon.png`. To
change the icon, drop a new square PNG in at that path and re-run it. It renders
256/128/64/48/32/16px with rounded corners; it runs under Electron so it can use
`nativeImage` for the downscaling.

### Build script

`npm run dist` runs `build\build.js` rather than calling electron-builder
directly. electron-builder resolves its code-signing toolchain before determining
that there is nothing to sign, and extracting that bundle requires the Windows
privilege to create symlinks, which a standard user account does not hold — so
the build fails. The script disables that pass (`win.signAndEditExecutable:
false`) and applies the icon and version resources itself using the `rcedit`
bundled with `app-builder`. Same output, no signing toolchain required.

## How it fits together

```
src/main/       Electron main process
  main.js         window, IPC, dialogs
  server.js       loopback HTTP server for media  (see below)
  library.js      import, tags, artwork, playlists
  youtube.js      yt-dlp wrapper
  paths.js        portable data folder resolution
  shortcuts.js    Start Menu / desktop shortcuts + AppUserModelID
src/renderer/   the UI
  js/theme-schema.js   every customiser control, declaratively
  js/theme.js          turns those values into CSS custom properties
  js/customizer.js     builds the customiser UI from the schema
  js/profile.js        profile, time-of-day greeting, start-up chime
  js/visualizer.js     the player-bar visualiser
```

Adding a new customiser control means adding one entry to `theme-schema.js` —
the UI, the persistence and the CSS variable all follow from it.

Media is served over a loopback HTTP server on `127.0.0.1` (random port, random
per-run token) rather than `file://` or a custom protocol. `<audio>` needs real
HTTP Range support to seek, and the visualiser needs a CORS-clean response or
WebAudio silences the audio graph — this gives both.

### Implementation notes

**The visualiser auto-gains.** A normally-mastered track never fills the
analyser's default −100..−30 dB window, which leaves the bars pinned near the top
and barely moving except at very high volume. It uses a narrower dB window plus a
decaying peak-follower instead, so quiet and loud music animate about the same.
A soft gate fades the bars out below a threshold, holding true silence at zero
rather than amplifying the noise floor.

**The layout sliders drag by movement, not position.** Sidebar width, player
height and spacing all move the customiser itself. With an ordinary slider that
is a feedback loop — the value follows the pointer's absolute position, the page
reflows, the thumb slides out from under the pointer and the value jumps again.
Those three sliders are flagged `reflow: true` in the schema and track relative
pointer movement instead, so a reflow cannot feed back into the value.
