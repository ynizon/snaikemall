/* Dessin du plateau. Lit Game.state, n'écrit rien. */

const Renderer = (() => {
  const C = CONFIG;
  const W = C.cols * C.cell;
  const H = C.rows * C.cell;
  let gridCache = null;

  function rrect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function buildGrid() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');

    g.fillStyle = '#070b14';
    g.fillRect(0, 0, W, H);

    g.strokeStyle = 'rgba(148, 197, 255, 0.045)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < C.cols; x++) {
      g.moveTo(x * C.cell + 0.5, 0);
      g.lineTo(x * C.cell + 0.5, H);
    }
    for (let y = 1; y < C.rows; y++) {
      g.moveTo(0, y * C.cell + 0.5);
      g.lineTo(W, y * C.cell + 0.5);
    }
    g.stroke();

    // Repères visuels aux bords : rappel que le plateau est un tore.
    g.strokeStyle = 'rgba(148, 197, 255, 0.16)';
    g.setLineDash([C.cell * 0.5, C.cell * 0.5]);
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
    g.setLineDash([]);

    return c;
  }

  function drawFood(ctx, f, t) {
    const cell = C.cell;
    const pulse = 0.5 + 0.5 * Math.sin(t / 220 + f.seed);
    const size = cell * (0.48 + 0.1 * pulse);
    const cx = f.x * cell + cell / 2;
    const cy = f.y * cell + cell / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4 + t / 1400);
    ctx.shadowColor = '#a3e635';
    ctx.shadowBlur = 14 + 8 * pulse;
    ctx.fillStyle = '#84cc16';
    rrect(ctx, -size / 2, -size / 2, size, size, size * 0.28);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ecfccb';
    const inner = size * 0.42;
    rrect(ctx, -inner / 2, -inner / 2, inner, inner, inner * 0.3);
    ctx.fill();
    ctx.restore();
  }

  // Le meilleur cumul (seul en tête) porte une couronne.
  function cumulLeader(snakes) {
    let best = null;
    let tie = false;
    for (const s of snakes) {
      if (!s.alive) continue;
      const v = Math.floor(s.tailTime);
      if (!best || v > Math.floor(best.tailTime)) { best = s; tie = false; }
      else if (v === Math.floor(best.tailTime)) tie = true;
    }
    return best && !tie && best.tailTime >= 1 ? best : null;
  }

  function drawSnake(ctx, s, t) {
    const cell = C.cell;
    const n = s.body.length;

    ctx.save();

    for (let i = n - 1; i >= 1; i--) {
      const seg = s.body[i];
      const taper = 1 - (i / n) * 0.42;
      const size = cell * 0.8 * taper;
      const cx = seg.x * cell + cell / 2;
      const cy = seg.y * cell + cell / 2;

      ctx.shadowColor = s.glow;
      ctx.shadowBlur = s.boosting ? 16 : 9;
      ctx.fillStyle = s.flash > 0 && Math.floor(t / 60) % 2 === 0 ? '#ffffff' : s.color;
      rrect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.34);
      ctx.fill();

      if (s.shieldActive) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Tête
    const h = s.body[0];
    const hs = cell * 0.92;
    const hx = h.x * cell + cell / 2;
    const hy = h.y * cell + cell / 2;
    ctx.shadowColor = s.glow;
    ctx.shadowBlur = s.boosting ? 30 : 18;
    ctx.fillStyle = s.color;
    rrect(ctx, hx - hs / 2, hy - hs / 2, hs, hs, hs * 0.36);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Yeux orientés dans le sens de la marche
    const d = s.dir;
    const perp = { x: -d.y, y: d.x };
    const eo = cell * 0.2;
    const er = cell * 0.11;
    ctx.fillStyle = '#04070f';
    for (const sgn of [-1, 1]) {
      const ex = hx + d.x * eo * 0.9 + perp.x * eo * sgn;
      const ey = hy + d.y * eo * 0.9 + perp.y * eo * sgn;
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
    }

    if (s.shieldActive) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 90);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.4 * pulse})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(hx, hy, cell * (0.78 + 0.08 * pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  function drawBullets(ctx) {
    const cell = C.cell;
    ctx.save();
    for (const b of Game.state.bullets) {
      for (let k = 3; k >= 0; k--) {
        const bx = ((b.x - b.dir.x * k * 0.45) % C.cols + C.cols) % C.cols;
        const by = ((b.y - b.dir.y * k * 0.45) % C.rows + C.rows) % C.rows;
        const a = 1 - k * 0.24;
        ctx.globalAlpha = a;
        ctx.fillStyle = k === 0 ? '#ffffff' : b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(bx * cell + cell / 2, by * cell + cell / 2, cell * (0.24 - k * 0.04), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawParticles(ctx) {
    const cell = C.cell;
    ctx.save();
    for (const p of Game.state.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * cell, p.y * cell, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Pendant le décompte : anneau pulsé et nom au-dessus de chaque tête,
  // pour que chacun repère sa position (tirée au hasard à chaque manche).
  function drawSpawnMarker(ctx, s, t) {
    const cell = C.cell;
    const h = s.body[0];
    const hx = h.x * cell + cell / 2;
    const hy = h.y * cell + cell / 2;
    const pulse = 0.5 + 0.5 * Math.sin(t / 140);

    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.shadowColor = s.glow;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.beginPath();
    ctx.arc(hx, hy, cell * (1.1 + 0.5 * pulse), 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 10;
    ctx.fillStyle = s.color;
    ctx.font = `800 ${Math.round(cell * 0.75)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const above = hy - cell * 1.7;
    ctx.fillText(s.name, hx, above < cell ? hy + cell * 2.6 : above);
    ctx.restore();
  }

  // Couronne flottant au-dessus de la tête (en dessous si la tête touche le haut).
  function drawCrown(ctx, s, t) {
    const cell = C.cell;
    const h = s.body[0];
    const w = cell * 0.95;
    const ht = cell * 0.62;
    const bob = Math.sin(t / 260) * cell * 0.08;
    const cx = h.x * cell + cell / 2;
    const base = (h.y === 0 ? (h.y + 1) * cell + ht + cell * 0.25 : h.y * cell - cell * 0.12) + bob;
    const l = cx - w / 2;
    const r = cx + w / 2;
    const top = base - ht;

    ctx.save();
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#fcd34d';
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(l, base);
    ctx.lineTo(l, top + ht * 0.25);
    ctx.lineTo(l + w * 0.25, top + ht * 0.6);
    ctx.lineTo(cx, top);
    ctx.lineTo(r - w * 0.25, top + ht * 0.6);
    ctx.lineTo(r, top + ht * 0.25);
    ctx.lineTo(r, base);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();

    // Pierres aux pointes
    ctx.fillStyle = '#ef4444';
    for (const [px, py] of [[l, top + ht * 0.25], [cx, top], [r, top + ht * 0.25]]) {
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw(ctx) {
    const st = Game.state;
    const t = st.time;

    if (!gridCache) gridCache = buildGrid();
    ctx.drawImage(gridCache, 0, 0);

    for (const f of st.foods) drawFood(ctx, f, t);
    // Un serpent mort disparaît (l'explosion de particules marque sa chute).
    const leader = st.phase === 'playing' ? cumulLeader(st.snakes) : null;
    for (const s of st.snakes) if (s.alive) drawSnake(ctx, s, t);
    drawBullets(ctx);
    drawParticles(ctx);
    if (leader) drawCrown(ctx, leader, t);
    if (st.phase === 'countdown') for (const s of st.snakes) drawSpawnMarker(ctx, s, t);
  }

  return { draw, width: W, height: H };
})();
