/*
 * Pilote automatique. Pour un serpent, il produit le même état d'entrée qu'un
 * joueur humain ({ axisX, axisY, boost, shoot, shield, pressed }) : la logique
 * de jeu ne fait aucune différence entre un bot et une manette.
 *
 * Décision à chaque nouvelle case : parmi tout droit / gauche / droite, on
 * écarte les cases occupées, puis on préfère l'espace libre accessible (pour
 * ne pas s'enfermer), l'éloignement des têtes adverses, et la nourriture la
 * plus proche.
 */

const Bot = (() => {
  const C = CONFIG;
  const W = C.cols;
  const H = C.rows;
  const SPACE_CAP = 220;          // au-delà, l'espace est jugé « largement suffisant »
  const SHOOT_RANGE = 14;
  // Pour jouer « comme un humain » : un bloc n'est remarqué qu'au bout d'un
  // moment, et seulement s'il est dans les parages.
  const FOOD_NOTICE_MS = 1200;
  const FOOD_RADIUS = 18;

  const mod = (v, m) => ((v % m) + m) % m;
  const idx = (x, y) => y * W + x;
  const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

  const brains = new Map();       // id du serpent → mémoire du bot

  function blankInput() {
    return {
      axisX: 0, axisY: 0, boost: false, shoot: false, shield: false,
      pressed: { boost: false, shoot: false, shield: false, start: false, back: false },
      source: 'bot', padId: null, padName: '',
    };
  }

  function brainFor(s) {
    let b = brains.get(s.id);
    if (!b) {
      b = { input: blankInput(), headKey: -1, choice: null, boostWanted: false, reaction: 0 };
      brains.set(s.id, b);
    }
    return b;
  }

  /* ---------- lecture du plateau ---------- */

  // Pour chaque case : dans combien de pas elle sera libre (0 = libre).
  // Un segment à l'indice i d'un corps de longueur n se libère dans n - i pas
  // (plus la croissance en attente) : les queues finissent par se retirer.
  // Un adversaire peut ne pas avoir encore avancé ce pas-ci : un pas de marge.
  function buildGrid(state, self) {
    const grid = new Uint16Array(W * H);
    for (const s of state.snakes) {
      if (!s.alive) continue;
      if (s !== self && s.shieldActive) continue;   // un serpent sous bouclier ne bloque pas
      const n = s.body.length;
      for (let i = 0; i < n; i++) {
        const k = idx(s.body[i].x, s.body[i].y);
        grid[k] = Math.max(grid[k], n - i + s.growth + (s === self ? 0 : 1));
      }
    }
    return grid;
  }

  // Parcours en largeur depuis la case visée (atteinte au pas 1) : place
  // accessible et distance à la nourriture la plus proche.
  function explore(grid, sx, sy, foodSet) {
    const seen = new Uint8Array(W * H);
    const queue = [idx(sx, sy)];
    const dist = [1];
    seen[queue[0]] = 1;
    let food = Infinity;
    let head = 0;
    while (head < queue.length && head < SPACE_CAP) {
      const cur = queue[head];
      const d = dist[head++];
      if (food === Infinity && foodSet.has(cur)) food = d;
      const cx = cur % W;
      const cy = (cur / W) | 0;
      for (const dir of DIRS) {
        const n = idx(mod(cx + dir.x, W), mod(cy + dir.y, H));
        if (seen[n] || grid[n] > d + 1) continue;
        seen[n] = 1;
        queue.push(n);
        dist.push(d + 1);
      }
    }
    // Nourriture hors du rayon exploré : distance à vol d'oiseau sur le tore.
    if (food === Infinity && foodSet.size) {
      for (const f of foodSet) {
        const dx = Math.abs((f % W) - sx);
        const dy = Math.abs(((f / W) | 0) - sy);
        food = Math.min(food, Math.min(dx, W - dx) + Math.min(dy, H - dy) + 20);
      }
    }
    return { space: head, food: Math.min(food, 60) };   // plateau sans nourriture : neutre
  }

  function torusDist(ax, ay, bx, by) {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return Math.min(dx, W - dx) + Math.min(dy, H - dy);
  }

  function nearEnemyHead(state, self, x, y) {
    for (const o of state.snakes) {
      if (o === self || !o.alive) continue;
      const h = o.body[0];
      const dx = Math.abs(h.x - x);
      const dy = Math.abs(h.y - y);
      if (Math.min(dx, W - dx) + Math.min(dy, H - dy) <= 1) return true;
    }
    return false;
  }

  function decide(state, s) {
    const grid = buildGrid(state, s);
    const h0 = s.body[0];
    const foodSet = new Set(state.foods
      .filter((f) => state.time - f.born >= FOOD_NOTICE_MS && torusDist(f.x, f.y, h0.x, h0.y) <= FOOD_RADIUS)
      .map((f) => idx(f.x, f.y)));
    const h = s.body[0];
    const need = Math.min(SPACE_CAP, s.body.length + 4);
    let best = null;

    for (const d of DIRS) {
      if (d.x === -s.dir.x && d.y === -s.dir.y) continue;   // pas de demi-tour
      const nx = mod(h.x + d.x, W);
      const ny = mod(h.y + d.y, H);
      const blocked = grid[idx(nx, ny)] > 1;
      let score;
      let space = 0;
      let food = Infinity;
      if (blocked && !s.shieldActive) {
        score = -1e6;
      } else {
        ({ space, food } = explore(grid, nx, ny, foodSet));
        score = (space >= need ? 10000 : space * 50) - food * 10;
        if (nearEnemyHead(state, s, nx, ny)) score -= 4000;
        if (d.x === s.dir.x && d.y === s.dir.y) score += 3;   // léger goût pour la ligne droite
        score += Math.random() * 2;
      }
      if (!best || score > best.score) best = { dir: d, score, space, food, blocked };
    }
    return best;
  }

  /* ---------- tir & bouclier ---------- */

  // Un adversaire (tête de préférence) dans la ligne de mire, sans obstacle propre.
  function hasTarget(state, s) {
    const h = s.body[0];
    for (let k = 1; k <= SHOOT_RANGE; k++) {
      const x = mod(h.x + s.dir.x * k, W);
      const y = mod(h.y + s.dir.y * k, H);
      if (s.body.some((seg) => seg.x === x && seg.y === y)) return false;
      for (const o of state.snakes) {
        if (o === s || !o.alive || o.shieldActive) continue;
        const i = o.body.findIndex((seg) => seg.x === x && seg.y === y);
        if (i === 0) return true;
        if (i >= 0) return o.body.length - i > 3;   // tronçon qui vaut le coup
      }
    }
    return false;
  }

  // Projectile adverse qui arrive droit sur la tête.
  function incomingBullet(state, s) {
    const h = s.body[0];
    for (const b of state.bullets) {
      if (b.owner === s.id) continue;
      for (let k = 0; k <= 4; k++) {
        const x = mod(Math.round(b.x + b.dir.x * k), W);
        const y = mod(Math.round(b.y + b.dir.y * k), H);
        if (x === h.x && y === h.y) return true;
      }
    }
    return false;
  }

  /* ---------- entrée produite ---------- */

  function control(s, state, dt) {
    const b = brainFor(s);
    const inp = b.input;
    inp.pressed.shoot = false;
    inp.pressed.shield = false;
    inp.shoot = false;
    inp.shield = false;

    if (!s.alive || state.phase !== 'playing') {
      inp.axisX = 0; inp.axisY = 0; inp.boost = false;
      b.headKey = -1;
      return inp;
    }

    // Une décision par case parcourue.
    const h = s.body[0];
    const key = idx(h.x, h.y) * 4 + DIRS.findIndex((d) => d.x === s.dir.x && d.y === s.dir.y);
    if (key !== b.headKey && !s.queue.length) {
      b.headKey = key;
      b.choice = decide(state, s);
      const c = b.choice;
      // Boost rare : courte pointe vers un bloc tout proche, jauge presque pleine.
      if (s.energy < 30) b.boostWanted = false;
      else if (!b.boostWanted) b.boostWanted = !!c && !c.blocked && c.space >= SPACE_CAP && c.food <= 6 && s.energy >= 85;
      else b.boostWanted = !!c && !c.blocked && c.food <= 6;
    }

    const c = b.choice;
    inp.axisX = c && !s.queue.length ? c.dir.x : 0;
    inp.axisY = c && !s.queue.length ? c.dir.y : 0;
    inp.boost = b.boostWanted;

    // Petit temps de réaction pour les pouvoirs, sinon le bot est imbattable.
    b.reaction -= dt * 1000;
    if (b.reaction <= 0) {
      b.reaction = 120 + Math.random() * 180;
      const shieldReady = s.shieldTime <= 0 && s.shieldCd <= 0;
      if (shieldReady && ((c && c.score < -1000) || incomingBullet(state, s))) {
        inp.shield = inp.pressed.shield = true;
      } else if (s.gunCd <= 0 && s.body.length > C.snake.minLength + 2 && hasTarget(state, s)) {
        inp.shoot = inp.pressed.shoot = true;
      }
    }
    return inp;
  }

  function reset() { brains.clear(); }

  return { control, reset };
})();
