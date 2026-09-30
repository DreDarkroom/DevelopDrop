/* SquidgySqueegee — recording and export.
   Four ways to keep a set:
     wav    24-bit lossless, streamed to disk where the browser allows it (Chrome / Edge), so a long set never fills memory
     mp3    320 kbps, encoded live in a background worker (LAME via lamejs, loaded only when chosen)
     perf   the compact, replayable performance file (.sqz): what the instrument DID, not the sound; play it in player.html
     video  the picture and the sound together (WebM or MP4, whichever the browser can make)
   plus a PNG snapshot of the picture. Everything records the FINAL output (after the limiter), exactly what the room hears. */
(function (SS) {
  'use strict';

  const A = SS.audio;
  const R = (SS.rec = { state: { active: false }, onUpdate: null, onAuto: null });

  const pad = (n) => String(n).padStart(2, '0');
  const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  R.memoryLimit = 1.5 * 1024 * 1024 * 1024;     // bytes a recording may occupy when the browser cannot stream it to disk

  R.FORMATS = {
    wav: { label: 'WAV · lossless', hint: '24-bit, about 16 MB a minute' },
    mp3: { label: 'MP3 · 320 kbps', hint: 'about 2.4 MB a minute' },
    perf: { label: 'Performance', hint: 'a tiny replayable file (a few KB a minute); play it in player.html' },
    video: { label: 'Video + audio', hint: 'the picture and the sound together' },
  };

  const VIDEO_TYPES = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
  ];
  const videoType = () => (window.MediaRecorder ? VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) : null);

  R.support = function () {
    const vt = videoType();
    return {
      disk: typeof window.showSaveFilePicker === 'function',
      mp3: typeof Worker !== 'undefined',
      video: !!vt && typeof HTMLCanvasElement.prototype.captureStream === 'function',
      videoType: vt ? (vt.startsWith('video/mp4') ? 'MP4' : 'WebM') : null,
    };
  };

  /* ---------------- where the bytes go ---------------- */

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  /** Streams to a file the person picked (Chrome / Edge), or collects in memory and downloads at the end. */
  async function openSink(name, mime, ext, label) {
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: label, accept: { [mime]: ['.' + ext] } }] });
        const w = await handle.createWritable();
        return {
          kind: 'disk', name: handle.name,
          write: (b) => w.write(b),
          close: async (header) => { if (header) await w.write({ type: 'write', position: 0, data: header }); await w.close(); },
          abort: async () => { try { await w.abort(); } catch (e) { /* already closed */ } },
        };
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;     // the person cancelled the save dialog: stop quietly
        /* any other problem: fall back to the in-memory route below */
      }
    }
    const parts = [];
    return {
      kind: 'memory', name,
      write: (b) => { parts.push(b); },
      close: async (header) => { if (header) parts[0] = header; download(new Blob(parts, { type: mime }), name); },
      abort: async () => { parts.length = 0; },
    };
  }

  /* ---------------- capturing the final audio ---------------- */

  const WORKLET = `class Cap extends AudioWorkletProcessor{constructor(){super();this.N=4096;this.l=new Float32Array(this.N);this.r=new Float32Array(this.N);this.n=0;
this.port.onmessage=e=>{if(e.data==='flush'){this.port.postMessage({l:this.l.slice(0,this.n),r:this.r.slice(0,this.n),end:true});this.n=0}}}
process(inp){const i=inp[0];if(i&&i[0]){const L=i[0],Rr=i[1]||i[0];for(let k=0;k<L.length;k++){this.l[this.n]=L[k];this.r[this.n]=Rr[k];
if(++this.n===this.N){this.port.postMessage({l:this.l,r:this.r},[this.l.buffer,this.r.buffer]);this.l=new Float32Array(this.N);this.r=new Float32Array(this.N);this.n=0}}}return true}}
registerProcessor('sq-capture',Cap)`;

  /* The capture processor may only be registered once per audio context (a second registerProcessor of the same
     name throws inside the worklet), so every recording shares one load. */
  let workletLoad = null;
  function loadWorklet(ctx) {
    if (workletLoad && workletLoad.ctx === ctx) return workletLoad.promise;
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    const promise = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    promise.catch(() => { if (workletLoad && workletLoad.promise === promise) workletLoad = null; });   // allow a retry after a failure
    workletLoad = { ctx, promise };
    return promise;
  }

  async function makeCapture(onChunk) {
    const ctx = A.ctx(), src = A.tapSource();
    const mute = ctx.createGain();
    mute.gain.value = 0;                                     // keeps the node in the graph without adding any sound
    let node = null, ended = null;
    if (ctx.audioWorklet && ctx.audioWorklet.addModule) {
      try {
        await loadWorklet(ctx);
        node = new AudioWorkletNode(ctx, 'sq-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [2] });
        node.port.onmessage = (e) => { onChunk(e.data.l, e.data.r); if (e.data.end && ended) ended(); };
      } catch (err) {
        node = null;                                         // no worklet support: use the older, universal route
      }
    }
    if (!node) {
      node = ctx.createScriptProcessor(4096, 2, 2);
      node.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)), new Float32Array(e.inputBuffer.getChannelData(1)));
    }
    src.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
    return {
      async stop() {
        if (node.port) {                                     // collect the last partial block so nothing at the end is lost
          await new Promise((res) => { ended = res; node.port.postMessage('flush'); setTimeout(res, 500); });
        }
        try { src.disconnect(node); node.disconnect(); mute.disconnect(); } catch (err) { /* already gone */ }
        if (node.port) node.port.onmessage = null;
        else node.onaudioprocess = null;
      },
    };
  }

  function mp3Worker(sampleRate) {
    const lib = new URL('js/vendor/lame.min.js?v=' + encodeURIComponent(SS.config.version), document.baseURI).href;
    const src = `importScripts(${JSON.stringify(lib)});
let enc=null;
const i16=(a)=>{const o=new Int16Array(a.length);for(let i=0;i<a.length;i++){const v=a[i]>1?1:a[i]<-1?-1:a[i];o[i]=v<0?v*32768:v*32767}return o};
onmessage=(e)=>{const d=e.data;
 if(d.init){enc=new lamejs.Mp3Encoder(2,d.sr,d.kbps);postMessage({ready:true});return}
 if(d.l){const out=enc.encodeBuffer(i16(d.l),i16(d.r));if(out.length){const u=new Uint8Array(out);postMessage({mp3:u},[u.buffer])}}
 if(d.end){const out=enc.flush();const u=new Uint8Array(out);postMessage({mp3:u,end:true},[u.buffer])}
};`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('the MP3 encoder did not start')), 6000);
      w.onerror = () => { clearTimeout(t); reject(new Error('the MP3 encoder could not load (it needs the hosted page or localhost; WAV works everywhere)')); };
      w.onmessage = (e) => { if (e.data.ready) { clearTimeout(t); resolve(w); } };
      w.postMessage({ init: true, sr: sampleRate, kbps: 320 });
    });
  }

  /* ---------------- start / stop ---------------- */

  let job = null, ticker = null;

  const notify = () => { if (R.onUpdate) R.onUpdate(R.state); };

  R.start = async function (format) {
    if (R.state.active) return;
    if (!A.ready) throw new Error('turn on the safelight first');
    const f = R.FORMATS[format];
    if (!f) throw new Error('unknown format');
    const sup = R.support();
    const sr = A.ctx().sampleRate;
    let sink, capture, worker, mr, chain = Promise.resolve(), bytes = 0, vt;
    const enqueue = (u8) => {
      bytes += u8.length;
      R.state.bytes = bytes;
      chain = chain.then(() => sink.write(u8));
      // Without disk streaming the whole recording lives in memory: stop safely before it can take the set down with it.
      if (sink.kind === 'memory' && bytes > R.memoryLimit && R.state.active) {
        R.stop('this browser is holding the recording in memory, so it was saved at 1.5 GB to protect your set. Chrome or Edge can stream long recordings straight to disk').catch(() => {});
      }
      return chain;
    };

    try {
      if (format === 'wav') {
        sink = await openSink(`squidgysqueegee-${stamp()}.wav`, 'audio/wav', 'wav', 'WAV audio');
        await sink.write(SS.wav.header(sr, 2, 24, 0));
        capture = await makeCapture((l, r) => {
          if (bytes > SS.wav.MAX_DATA_BYTES - 1e6) { R.stop('the file reached the 4 GB limit of the WAV format'); return; }
          enqueue(SS.wav.pcm24(l, r));
        });
      } else if (format === 'mp3') {
        if (!sup.mp3) throw new Error('this browser cannot encode MP3 in the background; use WAV');
        worker = await mp3Worker(sr);
        sink = await openSink(`squidgysqueegee-${stamp()}.mp3`, 'audio/mpeg', 'mp3', 'MP3 audio');
        let finished;
        const done = new Promise((res) => { finished = res; });
        worker.onmessage = (e) => { if (e.data.mp3 && e.data.mp3.length) enqueue(e.data.mp3); if (e.data.end) finished(); };
        capture = await makeCapture((l, r) => worker.postMessage({ l, r }, [l.buffer, r.buffer]));
        job = { done, worker };
      } else if (format === 'perf') {
        sink = await openSink(`squidgysqueegee-${stamp()}.sqz`, 'application/octet-stream', 'sqz', 'SquidgySqueegee performance');
        SS.perf.start(A.now(), SS.seq.snapshot('loop'));
        A.hook = SS.perf.log;
      } else if (format === 'video') {
        if (!sup.video) throw new Error('this browser cannot record video from the page');
        vt = videoType();
        const ext = vt.startsWith('video/mp4') ? 'mp4' : 'webm';
        sink = await openSink(`squidgysqueegee-${stamp()}.${ext}`, vt.split(';')[0], ext, 'Video');
        const ms = new MediaStream([...document.getElementById('stage').captureStream(30).getVideoTracks(), ...A.stream().getAudioTracks()]);
        mr = new MediaRecorder(ms, { mimeType: vt, videoBitsPerSecond: 10000000, audioBitsPerSecond: 256000 });
        mr.ondataavailable = (e) => { if (e.data && e.data.size) chain = chain.then(async () => { const u8 = new Uint8Array(await e.data.arrayBuffer()); bytes += u8.length; R.state.bytes = bytes; await sink.write(u8); }); };
        mr.start(1000);
      }
    } catch (err) {
      if (sink) await sink.abort();
      if (worker) worker.terminate();
      A.hook = null;
      if (err && err.name === 'AbortError') return;          // cancelled the save dialog
      throw err;
    }

    R.state = { active: true, format, label: f.label, startedAt: performance.now(), bytes: 0, name: sink.name, where: sink.kind };
    job = Object.assign(job || {}, { sink, capture, mr, format, chain: () => chain, bytesNow: () => bytes });
    clearInterval(ticker);
    ticker = setInterval(notify, 500);
    notify();
  };

  /** Finish and save. Resolves to {name, bytes, seconds, where}. `reason` is shown if it was an automatic stop. */
  R.stop = async function (reason) {
    if (!R.state.active || !job) return null;
    const j = job, st = R.state;
    job = null;
    clearInterval(ticker);
    R.state = { active: false };
    let header = null;
    try {
      if (j.format === 'wav' || j.format === 'mp3') await j.capture.stop();
      if (j.format === 'mp3') { j.worker.postMessage({ end: true }); await j.done; j.worker.terminate(); }
      if (j.format === 'video') await new Promise((res) => { j.mr.onstop = res; j.mr.stop(); });
      await j.chain();
      if (j.format === 'wav') header = SS.wav.header(A.ctx().sampleRate, 2, 24, j.bytesNow());   // bytesNow() counts audio data only, not the 44-byte header
      if (j.format === 'perf') {
        A.hook = null;
        const enc = await SS.perf.encode(SS.perf.stop(A.now()));
        await j.sink.write(enc.bytes);
        j.bytesTotal = enc.bytes.length;
      }
      await j.sink.close(header);
    } catch (err) {
      await j.sink.abort();
      A.hook = null;
      notify();
      throw err;
    }
    const result = { name: j.sink.name, bytes: j.format === 'perf' ? j.bytesTotal : j.bytesNow(), seconds: (performance.now() - st.startedAt) / 1000, where: j.sink.kind, reason: reason || null };
    if (reason && R.onAuto) R.onAuto(result);
    notify();
    return result;
  };

  /** A PNG of exactly what is on screen (without the panel). */
  R.snap = function () {
    const c = document.getElementById('stage');
    return new Promise((resolve, reject) => {
      c.toBlob((b) => {
        if (!b) return reject(new Error('could not read the picture'));
        const name = `squidgysqueegee-${stamp()}.png`;
        download(b, name);
        resolve(name);
      }, 'image/png');
    });
  };

  R.elapsed = () => (R.state.active ? (performance.now() - R.state.startedAt) / 1000 : 0);
})(window.SS);
