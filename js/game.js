/*
 * Logique du match (2 à 4 serpents, humains ou bots) : serpents, blocs, projectiles, manches.
 * Aucun accès au DOM ici — `Game.state` est la seule source de vérité,
 * lue par le renderer et le HUD.
 */

const Game = (() => {
  const C = CONFIG;

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const state = {
    phase: 'menu',        // menu | countdown | playing | roundend | matchend
    paused: false,
    snakes: [],
    foods: [],
    bullets: [],
    particles: [],
    round: 0,
    roundTimeLeft: 0,
    countdown: 0,
    endTimer: 0,
    foodTimer: 0,
    lastWinner: null,
    lastReason: null,
    lastTally: null,      // fin au temps : [{ id, name, color, total }] trié
    matchWinner: null,
    time: 0,
  };

  /* ---------- utilitaires ---------- */

  const mod = (v, m) => ((v % m) + m) % m;
  const same = (a, b) => a.x === b.x && a.y === b.y;

  function cellOccupied(x, y, ignoreSnake) {
    for (const s of state.snakes) {
      if (s === ignoreSnake || !s.alive) continue;
      for (const seg of s.body) if (seg.x === x && seg.y === y) return true;
    }
    return false;
  }

  function cellFree(x, y) {
    for (const s of state.snakes) {
      if (!s.alive) continue;
      for (const seg of s.body) if (seg.x === x && seg.y === y) return false;
    }
    for (const f of state.foods) if (f.x === x && f.y === y) return false;
    return true;
  }

  /* ---------- création ---------- */

  // Les positions de départ sont celles des joueurs de la config ; à 3 joueurs,
  // la 3e est remplacée par sa variante centrale.
  function spawnSlot(slot, count) {
    const p = C.players[slot];
    const trio = count === 3 && p.trioSpawn;
    return { spawn: trio ? p.trioSpawn : p.spawn, dir: DIRS[trio ? p.trioDir : p.dir] };
  }

  function shuffledSlots(count) {
    const slots = Array.from({ length: count }, (_, i) => i);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    return slots;
  }

  function createSnake(index, slot, count) {
    const p = C.players[index];
    const { spawn, dir } = spawnSlot(slot, count);
    const body = [];
    for (let i = 0; i < C.snake.startLength; i++) {
      body.push({
        x: mod(spawn.x - dir.x * i, C.cols),
        y: mod(spawn.y - dir.y * i, C.rows),
      });
    }
    return {
      id: index,
      name: p.name,
      color: p.color,
      glow: p.glow,
      body,
      dir: { ...dir },
      queue: [],
      growth: 0,
      moveAcc: 0,
      alive: true,
      score: 0,
      energy: C.boost.max,
      boosting: false,
      shieldTime: 0,
      shieldCd: 0,
      shieldActive: false,
      gunCd: 0,
      flash: 0,
      deathAt: 0,
      tailTime: 0,        // longueur cumulée par seconde de vie (départage à la fin du temps)
    };
  }

  function resetSnake(s, index, slot) {
    const fresh = createSnake(index, slot, state.snakes.length);
    const { score, bot, name } = s;
    Object.assign(s, fresh);
    Object.assign(s, { score, bot, name });
  }

  function makeFood(x, y) {
    return { x, y, seed: Math.random() * Math.PI * 2, born: state.time };
  }

  function spawnFood() {
    for (let tries = 0; tries < 300; tries++) {
      const x = (Math.random() * C.cols) | 0;
      const y = (Math.random() * C.rows) | 0;
      if (cellFree(x, y)) {
        state.foods.push(makeFood(x, y));
        return true;
      }
    }
    return false;
  }

  /* ---------- particules ---------- */

  function burst(x, y, color, count, power) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = power * (0.35 + Math.random() * 0.8);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        decay: 1.4 + Math.random() * 1.6,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= p.decay * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  /* ---------- direction ---------- */

  function readDirection(inp, s) {
    let ax = inp.axisX;
    let ay = inp.axisY;
    if (!ax && !ay) return null;

    let useX;
    if (ax && !ay) useX = true;
    else if (!ax && ay) useX = false;
    else {
      // Entrée diagonale : on privilégie l'axe perpendiculaire à la course.
      const ref = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
      useX = ref.x === 0;
    }
    if (useX) return ax > 0 ? DIRS.right : DIRS.left;
    return ay > 0 ? DIRS.down : DIRS.up;
  }

  function queueDirection(s, d) {
    if (!d || s.queue.length >= 2) return;
    const ref = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (d.x === ref.x && d.y === ref.y) return;         // déjà dans ce sens
    if (d.x === -ref.x && d.y === -ref.y) return;       // demi-tour interdit
    s.queue.push({ ...d });
  }

  /* ---------- pouvoirs ---------- */

  function updatePowers(s, inp, dt) {
    const ms = dt * 1000;

    // Boost : jauge consommée tant que le bouton est maintenu.
    const threshold = s.boosting ? 0 : C.boost.minToEngage;
    const wantsBoost = inp.boost && s.alive && s.energy > threshold;
    if (wantsBoost && !s.boosting) Sfx.boost();
    s.boosting = wantsBoost;
    if (s.boosting) s.energy = Math.max(0, s.energy - C.boost.drainPerSec * dt);
    else s.energy = Math.min(C.boost.max, s.energy + C.boost.regenPerSec * dt);

    // Bouclier : intangibilité temporaire.
    s.shieldTime = Math.max(0, s.shieldTime - ms);
    s.shieldCd = Math.max(0, s.shieldCd - ms);
    if (inp.pressed.shield && s.alive && s.shieldTime <= 0 && s.shieldCd <= 0) {
      s.shieldTime = C.shield.durationMs;
      s.shieldCd = C.shield.cooldownMs;
      Sfx.shield();
      burst(s.body[0].x + 0.5, s.body[0].y + 0.5, '#ffffff', 16, 6);
    }
    s.shieldActive = s.shieldTime > 0;

    // Tir : coûte un segment, donc on ne peut pas tirer à vide.
    s.gunCd = Math.max(0, s.gunCd - ms);
    if (inp.pressed.shoot && s.alive && s.gunCd <= 0 && s.body.length > C.snake.minLength) {
      fire(s);
    }

    s.flash = Math.max(0, s.flash - ms);
  }

  function fire(s) {
    s.gunCd = C.gun.cooldownMs;
    for (let i = 0; i < C.gun.segmentCost && s.body.length > C.snake.minLength; i++) s.body.pop();
    const h = s.body[0];
    state.bullets.push({
      owner: s.id,
      color: s.color,
      x: mod(h.x + s.dir.x, C.cols),
      y: mod(h.y + s.dir.y, C.rows),
      dir: { ...s.dir },
      life: C.gun.lifeMs,
    });
    Sfx.shoot();
    burst(h.x + 0.5 + s.dir.x * 0.5, h.y + 0.5 + s.dir.y * 0.5, s.color, 6, 5);
  }

  /* ---------- déplacement ---------- */

  function stepSnake(s) {
    if (s.queue.length) {
      const d = s.queue.shift();
      if (!(d.x === -s.dir.x && d.y === -s.dir.y)) s.dir = d;
    }

    const head = s.body[0];
    const nx = mod(head.x + s.dir.x, C.cols);   // traversée des bords
    const ny = mod(head.y + s.dir.y, C.rows);
    s.body.unshift({ x: nx, y: ny });

    const fi = state.foods.findIndex((f) => f.x === nx && f.y === ny);
    if (fi >= 0) {
      state.foods.splice(fi, 1);
      s.growth += C.food.growth;
      s.energy = Math.min(C.boost.max, s.energy + C.food.energyBonus);
      Sfx.eat();
      burst(nx + 0.5, ny + 0.5, s.color, 14, 7);
    }

    if (s.growth > 0) s.growth--;
    else s.body.pop();

    checkCollision(s);
  }

  function checkCollision(s) {
    if (!s.alive || s.shieldActive) return;
    const h = s.body[0];

    for (let i = 1; i < s.body.length; i++) {
      if (same(s.body[i], h)) return kill(s);
    }

    for (const o of state.snakes) {
      if (o === s || !o.alive || o.shieldActive) continue;
      for (let i = 0; i < o.body.length; i++) {
        if (same(o.body[i], h)) {
          if (i === 0) kill(o);   // choc frontal : les deux tombent
          return kill(s);
        }
      }
    }
  }

  function kill(s) {
    if (!s.alive) return;
    s.alive = false;
    s.boosting = false;
    s.deathAt = state.time;
    Sfx.death();
    for (const seg of s.body) {
      if (Math.random() < 0.5) burst(seg.x + 0.5, seg.y + 0.5, s.color, 3, 6);
    }
  }

  /* ---------- projectiles ---------- */

  function updateBullets(dt) {
    const stepLen = 0.4;
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.life -= dt * 1000;
      if (b.life <= 0) { state.bullets.splice(i, 1); continue; }

      let remaining = C.gun.speed * dt;
      let dead = false;
      while (remaining > 0 && !dead) {
        const d = Math.min(stepLen, remaining);
        remaining -= d;
        b.x = mod(b.x + b.dir.x * d, C.cols);
        b.y = mod(b.y + b.dir.y * d, C.rows);

        const cx = mod(Math.round(b.x), C.cols);
        const cy = mod(Math.round(b.y), C.rows);

        for (const s of state.snakes) {
          if (s.id === b.owner || !s.alive) continue;
          if (s.shieldActive) continue;               // le bouclier laisse passer
          const idx = s.body.findIndex((seg) => seg.x === cx && seg.y === cy);
          if (idx >= 0) { hitSnake(s, idx); dead = true; break; }
        }
      }

      if (dead) state.bullets.splice(i, 1);
    }

    // Deux projectiles qui se croisent s'annulent.
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      for (let j = i - 1; j >= 0; j--) {
        const a = state.bullets[i];
        const b = state.bullets[j];
        if (a.owner === b.owner) continue;
        if (Math.abs(a.x - b.x) < 0.7 && Math.abs(a.y - b.y) < 0.7) {
          burst((a.x + b.x) / 2 + 0.5, (a.y + b.y) / 2 + 0.5, '#ffffff', 12, 8);
          state.bullets.splice(i, 1);
          state.bullets.splice(j, 1);
          i--;
          break;
        }
      }
    }
  }

  function hitSnake(target, index) {
    // Tir dans la tête : mort immédiate, le corps retombe en blocs.
    const headshot = index === 0;
    const removed = headshot ? target.body.slice() : target.body.splice(Math.max(C.snake.minLength, index));
    target.flash = 260;
    Sfx.hit();

    const hx = target.body[Math.min(index, target.body.length - 1)];
    if (hx) burst(hx.x + 0.5, hx.y + 0.5, '#ffffff', 18, 9);
    if (headshot) kill(target);

    // Les segments arrachés retombent en blocs ramassables.
    let drops = 0;
    for (let k = removed.length - 1; k >= 0 && drops < C.gun.maxDropsPerHit; k -= 2) {
      const seg = removed[k];
      if (cellFree(seg.x, seg.y)) {
        state.foods.push(makeFood(seg.x, seg.y));
        drops++;
      }
    }
  }

  /* ---------- manches ---------- */

  // Les bots occupent les derniers emplacements : les humains gardent
  // leur clavier / leur manette (joueur 1 = manette 1, etc.).
  function startMatch(count = C.minPlayers, bots = 0) {
    const n = Math.max(C.minPlayers, Math.min(C.maxPlayers, count | 0));
    const nb = Math.max(0, Math.min(n, bots | 0));
    state.snakes = Array.from({ length: n }, (_, i) => {
      const s = createSnake(i, i, n);
      s.bot = i >= n - nb;
      if (s.bot) s.name = `BOT ${i + 1}`;
      return s;
    });
    state.round = 0;
    state.matchWinner = null;
    state.lastWinner = null;
    state.lastReason = null;
    state.lastTally = null;
    startRound();
  }

  function startRound() {
    state.round++;
    const slots = shuffledSlots(state.snakes.length);
    state.snakes.forEach((s, i) => resetSnake(s, i, slots[i]));
    state.foods.length = 0;
    state.bullets.length = 0;
    state.particles.length = 0;
    for (let i = 0; i < C.food.initial; i++) spawnFood();
    state.foodTimer = C.food.spawnEveryMs;
    state.roundTimeLeft = C.round.durationMs;
    state.countdown = C.round.countdownMs;
    state.phase = 'countdown';
    state._lastBeep = -1;
  }

  function resolveRound(reason) {
    const alive = state.snakes.filter((s) => s.alive);
    let winner = null;

    if (reason === 'crash') {
      // Dernier survivant ; aucun survivant (choc frontal final) = manche nulle.
      if (alive.length === 1) winner = alive[0];
    } else {
      // Fin du temps : le survivant qui a porté la plus grande queue le plus
      // longtemps (longueur × secondes cumulée), égalité = manche nulle.
      const best = Math.max(...alive.map((s) => Math.floor(s.tailTime)));
      const top = alive.filter((s) => Math.floor(s.tailTime) === best);
      if (top.length === 1) winner = top[0];
    }

    if (winner) winner.score++;
    state.lastWinner = winner;
    state.lastReason = reason;
    state.lastTally = reason === 'time'
      ? alive
        .map((s) => ({ id: s.id, name: s.name, color: s.color, total: Math.floor(s.tailTime) }))
        .sort((a, b) => b.total - a.total)
      : null;
    state.phase = 'roundend';
    state.endTimer = reason === 'time' ? C.round.timeEndDelayMs : C.round.endDelayMs;

    if (winner && winner.score >= C.round.pointsToWin) {
      state.matchWinner = winner;
      Sfx.win();
    }
  }

  /* ---------- boucle ---------- */

  function tickPlaying(dt, inputs) {
    for (let i = 0; i < state.snakes.length; i++) {
      const s = state.snakes[i];
      const inp = inputs[i];
      if (s.alive) queueDirection(s, readDirection(inp, s));
      updatePowers(s, inp, dt);
    }

    for (const s of state.snakes) {
      if (!s.alive) continue;
      const interval = s.boosting ? C.snake.boostStepMs : C.snake.baseStepMs;
      s.moveAcc += dt * 1000;
      let guard = 0;
      while (s.moveAcc >= interval && s.alive && guard++ < 5) {
        s.moveAcc -= interval;
        stepSnake(s);
      }
      if (s.boosting && s.alive) {
        const tail = s.body[s.body.length - 1];
        if (Math.random() < 0.6) burst(tail.x + 0.5, tail.y + 0.5, s.color, 1, 2);
      }
    }

    updateBullets(dt);

    for (const s of state.snakes) if (s.alive) s.tailTime += s.body.length * dt;

    state.foodTimer -= dt * 1000;
    if (state.foodTimer <= 0) {
      state.foodTimer = C.food.spawnEveryMs;
      if (state.foods.length < C.food.maxOnBoard) spawnFood();
    }

    state.roundTimeLeft -= dt * 1000;

    if (state.snakes.filter((s) => s.alive).length <= 1) return resolveRound('crash');
    if (state.roundTimeLeft <= 0) {
      state.roundTimeLeft = 0;
      return resolveRound('time');
    }
  }

  function update(dt, inputs) {
    state.time += dt * 1000;
    updateParticles(dt);
    if (state.paused) return;

    switch (state.phase) {
      case 'countdown': {
        state.countdown -= dt * 1000;
        const n = Math.ceil(state.countdown / 1000);
        if (n !== state._lastBeep) {
          state._lastBeep = n;
          if (n > 0) Sfx.tick();
        }
        if (state.countdown <= 0) {
          state.phase = 'playing';
          Sfx.go();
        }
        break;
      }
      case 'playing':
        tickPlaying(dt, inputs);
        break;
      case 'roundend':
        state.endTimer -= dt * 1000;
        if (state.endTimer <= 0) {
          if (state.matchWinner) state.phase = 'matchend';
          else startRound();
        }
        break;
      default:
        break;
    }
  }

  function togglePause() {
    if (state.phase === 'playing' || state.phase === 'countdown') {
      state.paused = !state.paused;
      return true;
    }
    return false;
  }

  return { state, update, startMatch, togglePause, DIRS };
})();
