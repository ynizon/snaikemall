/* Bruitages minimalistes générés en WebAudio : aucun asset à charger. */

const Sfx = (() => {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(opts) {
    if (muted || !ensure()) return;
    const {
      freq = 440, freqTo = null, dur = 0.12,
      type = 'square', vol = 1, delay = 0,
    } = opts;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur = 0.2, vol = 0.6) {
    if (muted || !ensure()) return;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600;
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  return {
    unlock: ensure,
    toggleMute() { muted = !muted; return muted; },
    isMuted() { return muted; },
    eat() { tone({ freq: 620, freqTo: 1080, dur: 0.1, type: 'triangle', vol: 0.7 }); },
    shoot() { tone({ freq: 900, freqTo: 220, dur: 0.12, type: 'sawtooth', vol: 0.5 }); },
    hit() { noise(0.22, 0.7); tone({ freq: 180, freqTo: 60, dur: 0.2, type: 'square', vol: 0.5 }); },
    shield() { tone({ freq: 300, freqTo: 780, dur: 0.22, type: 'sine', vol: 0.6 }); },
    boost() { tone({ freq: 160, freqTo: 420, dur: 0.14, type: 'sawtooth', vol: 0.25 }); },
    death() {
      noise(0.45, 0.8);
      tone({ freq: 420, freqTo: 50, dur: 0.5, type: 'square', vol: 0.6 });
    },
    tick() { tone({ freq: 520, dur: 0.08, type: 'square', vol: 0.5 }); },
    go() { tone({ freq: 880, dur: 0.22, type: 'square', vol: 0.6 }); },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.6, delay: i * 0.12 }));
    },
  };
})();
