// assets/js/art.js
(() => {
  const canvas = document.getElementById('art');
  const ctx = canvas.getContext('2d', { alpha: true });

  const copy = document.getElementById('landingCopy');

  const state = {
    t0: performance.now(),
    w: 0,
    h: 0,
    dpr: 1,
    seeds: [],
    field: [],
    cols: 90,
    rows: 54,
    flow: [],
    last: performance.now(),
  };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { innerWidth: w, innerHeight: h } = window;
    state.w = w; state.h = h; state.dpr = dpr;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // flow grid scales with viewport
    state.cols = Math.max(70, Math.min(120, Math.floor(w / 14)));
    state.rows = Math.max(44, Math.min(90, Math.floor(h / 16)));
    buildFlow();
    seedParticles();
  }

  function hash(n) {
    // small deterministic pseudo-random
    const x = Math.sin(n) * 10000;
    return x - Math.floor(x);
  }

  function buildFlow() {
    const { cols, rows } = state;
    state.flow = new Array(cols * rows);
    const s = 0.18;
    let k = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // gentle vector field shaped by two attractors + slow warp
        const nx = x / (cols - 1);
        const ny = y / (rows - 1);
        const a1x = 0.33, a1y = 0.42;
        const a2x = 0.72, a2y = 0.58;

        const dx1 = nx - a1x, dy1 = ny - a1y;
        const dx2 = nx - a2x, dy2 = ny - a2y;

        const r1 = Math.sqrt(dx1*dx1 + dy1*dy1) + 1e-6;
        const r2 = Math.sqrt(dx2*dx2 + dy2*dy2) + 1e-6;

        const ang = (Math.atan2(dy1, dx1) - Math.atan2(dy2, dx2)) * 0.7;
        const mag = (1 / (1 + 6*r1) + 1 / (1 + 6*r2)) * 0.8;

        state.flow[k++] = { ang, mag, nx, ny };
      }
    }
  }

  function seedParticles() {
    const n = Math.floor(Math.min(1400, Math.max(700, (state.w * state.h) / 1400)));
    state.seeds = new Array(n);
    for (let i = 0; i < n; i++) {
      const r = hash(i * 13.37);
      const r2 = hash(i * 91.17);
      state.seeds[i] = {
        x: r * state.w,
        y: r2 * state.h,
        vx: 0,
        vy: 0,
        life: 0,
        ttl: 240 + Math.floor(hash(i * 7.77) * 220),
      };
    }
  }

  function flowAt(x, y, time) {
    const { cols, rows, w, h } = state;
    const gx = Math.max(0, Math.min(cols - 1, Math.floor((x / w) * cols)));
    const gy = Math.max(0, Math.min(rows - 1, Math.floor((y / h) * rows)));
    const f = state.flow[gy * cols + gx];

    // subtle temporal drift
    const drift = Math.sin(time * 0.00018 + f.nx * 4.0) * 0.35 + Math.cos(time * 0.00014 + f.ny * 3.0) * 0.22;
    const ang = f.ang + drift;
    const mag = f.mag;

    return { ax: Math.cos(ang) * mag, ay: Math.sin(ang) * mag };
  }

  function vignette() {
    // very subtle in-canvas vignette so the whole thing "sinks" into black
    const g = ctx.createRadialGradient(
      state.w * 0.5, state.h * 0.48, 0,
      state.w * 0.5, state.h * 0.48, Math.max(state.w, state.h) * 0.75
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.w, state.h);
  }

  function step(now) {
    const dt = Math.min(32, now - state.last);
    state.last = now;

    const t = now - state.t0;

    // slow fade trail
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, state.w, state.h);

    // draw: thin luminous strands
    ctx.lineWidth = 1;
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < state.seeds.length; i++) {
      const p = state.seeds[i];
      const prevX = p.x, prevY = p.y;

      const f = flowAt(p.x, p.y, now);
      // critically damped-ish motion
      p.vx = p.vx * 0.94 + f.ax * 0.9;
      p.vy = p.vy * 0.94 + f.ay * 0.9;

      p.x += p.vx * (dt * 0.35);
      p.y += p.vy * (dt * 0.35);

      p.life++;

      // reset if out of bounds or old
      if (p.life > p.ttl || p.x < -30 || p.y < -30 || p.x > state.w + 30 || p.y > state.h + 30) {
        p.life = 0;
        // reseed near interesting regions (not uniform) to avoid "screensaver noise"
        const a = hash(i * 3.11 + t * 0.00003);
        const b = hash(i * 8.17 + t * 0.00005);
        const cx = state.w * (0.25 + 0.55 * a);
        const cy = state.h * (0.30 + 0.50 * b);
        p.x = cx + (hash(i * 19.1) - 0.5) * state.w * 0.18;
        p.y = cy + (hash(i * 29.7) - 0.5) * state.h * 0.18;
        p.vx = 0;
        p.vy = 0;
      }

      // brightness: calm, not flashy
      const alpha = Math.min(0.18, 0.04 + (p.life / p.ttl) * 0.16);
      const shade = 220 + Math.floor(35 * hash(i * 2.71)); // near-white
      ctx.strokeStyle = `rgba(${shade},${shade},${shade},${alpha})`;

      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
    vignette();

    // reveal copy after ~10s
    if (t > 10000 && copy && copy.classList.contains('is-hidden')) {
      copy.classList.remove('is-hidden');
      copy.classList.add('is-visible');
    }

    requestAnimationFrame(step);
  }

  // init
  window.addEventListener('resize', resize, { passive: true });
  resize();

  // start with a clean black frame
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, state.w, state.h);

  requestAnimationFrame(step);
})();
