// assets/js/art.js
// Canvas: <canvas id="art"></canvas>
// Optional legend container: <div id="legend"></div>

(() => {
  const canvas = document.getElementById('art');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });

  // Optional: existing landing copy can remain; not required
  const legendEl = document.getElementById('legend');

  const state = {
    t0: performance.now(),
    last: performance.now(),
    w: 0,
    h: 0,
    dpr: 1,

    // visual configuration (explicit deviations)
    timeAccel: 80,              // simulation days per real second (explicit in legend)
    planetSizeBoost: 7.5,       // non-physical boost factor for radii (explicit in legend)
    inclZScale: 0.28,           // AU -> AU in z (visual scaling; explicit in legend)

    // camera / perspective
    cam: {
      yaw: -0.55,               // fixed camera yaw
      pitch: 0.52,              // fixed camera pitch (above ecliptic)
      dist: 6.2,                // camera distance in "scene units"
      fov: 1.05,                // projection scale
    },

    // radial mapping
    rMinPx: 42,
    rMaxPx: 0,

    // belts (schematic radial bands)
    asteroidBelt: { innerAU: 2.1, outerAU: 3.3 },
    kuiperBelt: { innerAU: 30.0, outerAU: 50.0 },

    // JPL SSD approximate elements (Table 1, J2000 reference frame)
    // a in AU, I in degrees, L0 in degrees (mean longitude at J2000)
    // Source: NASA/JPL SSD "Approximate Positions of the Planets" Table 1.
    planets: [
      { name: 'Mercury', aAU: 0.38709927, Ideg: 7.00497902, Ldeg: 252.25032350, color: 'rgba(230,230,230,0.95)', radiusKm: 2439.7 },
      { name: 'Venus',   aAU: 0.72333566, Ideg: 3.39467605, Ldeg: 181.97909950, color: 'rgba(220,220,220,0.92)', radiusKm: 6051.8 },
      { name: 'Earth',   aAU: 1.00000261, Ideg: -0.00001531, Ldeg: 100.46457166, color: 'rgba(235,235,235,0.95)', radiusKm: 6371.0 },
      { name: 'Mars',    aAU: 1.52371034, Ideg: 1.84969142, Ldeg: -4.55343205,  color: 'rgba(210,210,210,0.90)', radiusKm: 3389.5 },
      { name: 'Jupiter', aAU: 5.20288700, Ideg: 1.30439695, Ldeg: 34.39644051,  color: 'rgba(245,245,245,0.92)', radiusKm: 69911.0 },
      { name: 'Saturn',  aAU: 9.53667594, Ideg: 2.48599187, Ldeg: 49.95424423,  color: 'rgba(235,235,235,0.90)', radiusKm: 58232.0 },
      { name: 'Uranus',  aAU: 19.18916464, Ideg: 0.77263783, Ldeg: 313.23810451, color: 'rgba(225,225,225,0.90)', radiusKm: 25362.0 },
      { name: 'Neptune', aAU: 30.06992276, Ideg: 1.77004347, Ldeg: -55.12002969, color: 'rgba(240,240,240,0.92)', radiusKm: 24622.0 },
    ],

    // derived
    aMinAU: 0,
    aMaxAU: 0,
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

    state.rMaxPx = Math.max(120, Math.min(w, h) * 0.46);

    state.aMinAU = Math.min(...state.planets.map(p => p.aAU));
    // scale max should include Kuiper belt outer edge
    state.aMaxAU = Math.max(state.kuiperBelt.outerAU, ...state.planets.map(p => p.aAU));

    // initialize black
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, state.w, state.h);
  }

  function deg2rad(d) { return (d * Math.PI) / 180; }

  // Kepler 3rd law approximation: P(years) ~ a^(3/2)
  // For this visualization we use circular orbits with angular speed from P.
  function periodDaysFromA(aAU) {
    const years = Math.pow(aAU, 1.5);
    return years * 365.25;
  }

  // Log mapping AU -> pixel radius
  function mapAUtoPx(aAU) {
    const { rMinPx, rMaxPx, aMinAU, aMaxAU } = state;
    const t = Math.log(aAU / aMinAU) / Math.log(aMaxAU / aMinAU);
    return rMinPx + (rMaxPx - rMinPx) * t;
  }

  // Simple camera rotation + perspective projection
  function project3D(x, y, z) {
    const { yaw, pitch, dist, fov } = state.cam;

    // rotate around Y (yaw), then X (pitch)
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    let x1 = x * cy + z * sy;
    let z1 = -x * sy + z * cy;

    const cx = Math.cos(pitch), sx = Math.sin(pitch);
    let y2 = y * cx - z1 * sx;
    let z2 = y * sx + z1 * cx;

    // camera translate
    z2 += dist;

    // perspective
    const scale = fov / Math.max(0.001, z2);
    const sxp = x1 * scale;
    const syp = y2 * scale;

    // screen
    return {
      x: state.w * 0.5 + sxp * state.rMaxPx,
      y: state.h * 0.52 + syp * state.rMaxPx,
      scale,
      depth: z2,
    };
  }

  function vignette() {
    const g = ctx.createRadialGradient(
      state.w * 0.5, state.h * 0.52, 0,
      state.w * 0.5, state.h * 0.52, Math.max(state.w, state.h) * 0.75
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.w, state.h);
  }

  function drawRing(innerAU, outerAU, alpha, blur = 0) {
    const cx = state.w * 0.5;
    const cy = state.h * 0.52;

    const rInner = mapAUtoPx(innerAU);
    const rOuter = mapAUtoPx(outerAU);

    // Draw as filled annulus in 3D plane (ecliptic). We approximate perspective by drawing
    // multiple thin rings and projecting points.
    const steps = 160;
    const bands = 7;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    if (blur > 0) ctx.filter = `blur(${blur}px)`;

    for (let b = 0; b < bands; b++) {
      const t0 = b / bands;
      const t1 = (b + 1) / bands;
      const r0 = rInner + (rOuter - rInner) * t0;
      const r1 = rInner + (rOuter - rInner) * t1;

      ctx.beginPath();
      // outer edge
      for (let i = 0; i <= steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        const x = (r1 / state.rMaxPx) * Math.cos(ang);
        const y = 0;
        const z = (r1 / state.rMaxPx) * Math.sin(ang);
        const p = project3D(x, y, z);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      // inner edge (reverse)
      for (let i = steps; i >= 0; i--) {
        const ang = (i / steps) * Math.PI * 2;
        const x = (r0 / state.rMaxPx) * Math.cos(ang);
        const y = 0;
        const z = (r0 / state.rMaxPx) * Math.sin(ang);
        const p = project3D(x, y, z);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawOrbitBand(aAU, alpha) {
    // Thin ring zone around each planet orbit (abstract "band" not a line)
    const wAU = Math.max(0.01, aAU * 0.015);
    drawRing(aAU - wAU, aAU + wAU, alpha, 0);
  }

  function drawSun() {
    const p = project3D(0, 0, 0);
    const r = 12;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    // soft halo
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlanets(simDays) {
    // Compute positions, then painter-sort by depth for correct overlap
    const items = [];

    for (const pl of state.planets) {
      const P = periodDaysFromA(pl.aAU);
      const n = (2 * Math.PI) / P; // rad/day

      // Initial phase from mean longitude at J2000 (Ldeg), simplified
      const theta0 = deg2rad(pl.Ldeg);
      const theta = theta0 + n * simDays;

      const rPx = mapAUtoPx(pl.aAU);
      const rScene = rPx / state.rMaxPx;

      const I = deg2rad(pl.Ideg);
      const zIncl = Math.sin(I) * state.inclZScale * rScene;
      const yIncl = 0; // keep ecliptic as y=0; use z for out-of-plane

      const x = rScene * Math.cos(theta);
      const z = rScene * Math.sin(theta);
      const y = yIncl;
      const z3 = z + zIncl;

      const proj = project3D(x, y, z3);

      // size: radiusKm -> px with deliberate boost
      // baseline scale tuned for visibility, not physical size.
      const base = 1.25;
      const size = base + state.planetSizeBoost * Math.sqrt(pl.radiusKm / 69911); // normalize to Jupiter

      items.push({
        name: pl.name,
        x: proj.x,
        y: proj.y,
        depth: proj.depth,
        r: Math.max(1.8, size / Math.max(0.35, proj.scale * 12)), // slight perspective attenuation
        color: pl.color,
      });
    }

    items.sort((a, b) => b.depth - a.depth); // far first

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    for (const it of items) {
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function renderLegend() {
    const lines = [
      'Solar System (abstract, physically parameterized)',
      'Distance: logarithmic AU→screen radius',
      `Time: ${state.timeAccel} sim-days per real-second`,
      `Planet sizes: boosted (factor ≈ ${state.planetSizeBoost})`,
      `Inclination: visual z-scale = ${state.inclZScale} (AU-proportional)`,
      'Belts: schematic radial bands (Asteroid 2.1–3.3 AU, Kuiper 30–50 AU)',
      'Data: NASA/JPL SSD (Approximate Positions of the Planets, Table 1)',
    ];

    if (legendEl) {
      legendEl.textContent = lines.join('\n');
      return;
    }

    // If no HTML overlay exists, render in-canvas
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

    let x = 18;
    let y = 22;
    for (const s of lines) {
      ctx.fillText(s, x, y);
      y += 16;
    }
    ctx.restore();
  }

  function step(now) {
    const dt = Math.min(32, now - state.last);
    state.last = now;

    // fade-to-black trail
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, state.w, state.h);

    // simulation time in days
    const simDays = ((now - state.t0) / 1000) * state.timeAccel;

    // belts (diffuse) + orbit bands
    drawRing(state.kuiperBelt.innerAU, state.kuiperBelt.outerAU, 0.012, 1.2);
    drawRing(state.asteroidBelt.innerAU, state.asteroidBelt.outerAU, 0.020, 0.8);

    for (const pl of state.planets) drawOrbitBand(pl.aAU, 0.010);

    // sun + planets
    drawSun();
    drawPlanets(simDays);

    vignette();
    renderLegend();

    requestAnimationFrame(step);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  requestAnimationFrame(step);
})();
