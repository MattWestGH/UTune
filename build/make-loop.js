/**
 * Turns a long ambience recording into a short, genuinely seamless loop.
 *
 *   node_modules/.bin/electron build/make-loop.js <source> <out.webm> [seconds]
 *
 * Two things happen here.
 *
 * 1. The loop is made seamless by crossfading the tail into the head. A segment
 *    of length L+F is read; the output is the first L samples, but the first F
 *    of those are blended with the samples at L..L+F. The end of the buffer then
 *    flows into its own beginning, because out[0] is (mostly) what naturally
 *    followed out[L-1] in the source. An equal-power curve keeps the level
 *    steady through the blend rather than dipping.
 *
 * 2. It is re-encoded through MediaRecorder, which is Chromium's own Opus
 *    encoder, so no external tool is needed. Encoding runs in real time, so a
 *    45 second clip takes 45 seconds.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const [srcPath, outPath, secondsArg] = process.argv.slice(2);
const SECONDS = Number(secondsArg) || 45;
const FADE = 2;       // crossfade length, seconds
const SKIP = 20;      // ignore the first moments, which often fade in

if (!srcPath || !outPath) {
  console.error('usage: electron build/make-loop.js <source> <out.webm> [seconds]');
  app.exit(1);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { webSecurity: false } });
  await win.loadURL('data:text/html,<title>loop</title>');

  const b64 = fs.readFileSync(srcPath).toString('base64');

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const bin = atob(${JSON.stringify(b64)});
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      const ctx = new AudioContext();
      const src = await ctx.decodeAudioData(bytes.buffer);
      const rate = src.sampleRate;
      const channels = src.numberOfChannels;

      const F = Math.floor(${FADE} * rate);
      // The crossfade needs F samples of material beyond the loop, so the loop
      // can never be longer than the source minus F. Clamp rather than fail:
      // short sources simply give a slightly shorter loop.
      let L = Math.floor(${SECONDS} * rate);
      if (L + F > src.length) L = src.length - F;
      if (L <= F) throw new Error('source too short to build a loop from');

      let start = Math.floor(${SKIP} * rate);
      if (start + L + F > src.length) start = Math.max(0, src.length - L - F);

      const out = ctx.createBuffer(channels, L, rate);

      for (let c = 0; c < channels; c++) {
        const s = src.getChannelData(c);
        const d = out.getChannelData(c);
        for (let i = 0; i < L; i++) d[i] = s[start + i];
        // Blend the material that followed the segment over its opening, so the
        // join back to the start is continuous.
        for (let j = 0; j < F; j++) {
          const t = j / F;
          const a = Math.sin(t * Math.PI / 2);   // incoming (the true head)
          const b = Math.cos(t * Math.PI / 2);   // outgoing (what followed the tail)
          d[j] = s[start + j] * a + s[start + L + j] * b;
        }
      }

      // How big is the step at the loop point? Compare the last sample to the
      // first, against the material's own average sample-to-sample movement.
      const ch0 = out.getChannelData(0);
      let motion = 0;
      for (let i = 1; i < ch0.length; i++) motion += Math.abs(ch0[i] - ch0[i - 1]);
      motion /= ch0.length - 1;
      const seam = Math.abs(ch0[0] - ch0[ch0.length - 1]);

      // Encode in real time through Chromium's Opus encoder.
      const dest = ctx.createMediaStreamDestination();
      const player = ctx.createBufferSource();
      player.buffer = out;
      player.connect(dest);

      const rec = new MediaRecorder(dest.stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 112000,
      });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

      const done = new Promise((resolve) => { rec.onstop = resolve; });
      rec.start();
      player.start();
      player.onended = () => rec.stop();
      await done;

      const blob = new Blob(chunks, { type: 'audio/webm' });
      const arr = new Uint8Array(await blob.arrayBuffer());
      let s2 = '';
      for (let i = 0; i < arr.length; i++) s2 += String.fromCharCode(arr[i]);

      return { b64: btoa(s2), rate, channels, seconds: L / rate, seam, motion };
    })()
  `);

  const buf = Buffer.from(result.b64, 'base64');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);

  const before = fs.statSync(srcPath).size;
  console.log(`[loop] ${path.basename(srcPath)} -> ${path.basename(outPath)}`);
  console.log(`[loop]   ${result.seconds.toFixed(1)}s, ${result.channels}ch @ ${result.rate} Hz`);
  console.log(`[loop]   ${(before / 1048576).toFixed(2)} MB -> ${(buf.length / 1048576).toFixed(2)} MB`);
  console.log(`[loop]   seam step ${result.seam.toExponential(2)} vs typical sample motion ${result.motion.toExponential(2)}`);
  app.quit();
}).catch((err) => {
  console.error('[loop] FAILED', err);
  app.exit(1);
});
