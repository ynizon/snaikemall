/* Assemblage : boucle principale, HUD et écrans d'overlay. */

(() => {
  const C = CONFIG;
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');

  /* --- canevas net sur écrans HiDPI --- */
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Renderer.width * dpr;
  canvas.height = Renderer.height * dpr;
  canvas.style.aspectRatio = `${Renderer.width} / ${Renderer.height}`;
  ctx.scale(dpr, dpr);

  /* --- nombre de joueurs (choisi au menu, mémorisé) --- */
  const COUNT_KEY = 'neonsnake.players.v1';
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clampCount = (n) => Math.max(C.minPlayers, Math.min(C.maxPlayers, n | 0));
  let playerCount = C.minPlayers;
  try { playerCount = clampCount(Number(localStorage.getItem(COUNT_KEY)) || C.minPlayers); } catch (e) { /* défaut */ }

  /* --- nombre de bots parmi ces serpents (les derniers emplacements) --- */
  const BOTS_KEY = 'neonsnake.bots.v1';
  let botCount = 0;
  try { botCount = Math.max(0, Math.min(playerCount, Number(localStorage.getItem(BOTS_KEY)) | 0)); } catch (e) { /* défaut */ }
  const humanCount = () => playerCount - botCount;

  function saveCounts() {
    try {
      localStorage.setItem(COUNT_KEY, String(playerCount));
      localStorage.setItem(BOTS_KEY, String(botCount));
    } catch (e) { /* sans persistance */ }
  }

  function setPlayerCount(n) {
    const next = clampCount(n);
    if (next === playerCount) return;
    playerCount = next;
    botCount = Math.min(botCount, playerCount);
    Sfx.tick();
    saveCounts();
  }

  function setBotCount(n) {
    const next = Math.max(0, Math.min(playerCount, n | 0));
    if (next === botCount) return;
    botCount = next;
    Sfx.tick();
    saveCounts();
  }

  // En partie : le nombre de serpents engagés ; au menu : la sélection courante.
  const activeCount = () => (Game.state.phase === 'menu' ? playerCount : Game.state.snakes.length || playerCount);

  /* --- références HUD --- */
  const hudRoot = document.querySelector('.hud');
  const panels = range(C.maxPlayers).map((i) => {
    const root = document.getElementById(`panel-${i}`);
    return {
      root,
      score: root.querySelector('[data-score]'),
      len: root.querySelector('[data-len]'),
      tail: root.querySelector('[data-tail]'),
      pad: root.querySelector('[data-pad]'),
      boost: root.querySelector('[data-boost]'),
      gun: root.querySelector('[data-gun]'),
      shield: root.querySelector('[data-shield]'),
      shieldGauge: root.querySelector('.gauge.shield'),
    };
  });
  const elRound = document.getElementById('round-label');
  const elTimer = document.getElementById('round-timer');
  const elMute = document.getElementById('mute-state');

  panels.forEach((p, i) => {
    p.root.style.setProperty('--player', C.players[i].color);
    p.root.querySelector('.pname').textContent = C.players[i].name;
  });

  /* --- overlays --- */
  // Libellés clavier affichés (disposition AZERTY, touches physiques de input.js).
  const KEY_LABELS = [
    { dir: 'Z Q S D', boost: 'Maj gauche', shoot: 'A', shield: 'E' },
    { dir: 'Flèches', boost: 'Pavé 0', shoot: 'Pavé 1', shield: 'Pavé 2' },
    { dir: 'I J K L', boost: 'H', shoot: 'U', shield: 'O' },
    { dir: 'Pavé 8 4 5 6', boost: 'Pavé +', shoot: 'Pavé 7', shield: 'Pavé 9' },
  ];

  function controlsHtml(n) {
    if (n <= 0) return '<p class="sub">Partie 100 % bots — regardez-les s’affronter.</p>';
    const ids = range(n);
    const cell = (k) => [...new Set(ids.map((i) => InputManager.buttonName(InputManager.getBinding(i, k))))].join(' / ');
    const cols = (k) => ids.map((i) => `<td>${KEY_LABELS[i][k]}</td>`).join('');
    return `
    <table class="controls">
      <thead><tr><th></th><th>Manette Xbox</th>${ids.map((i) => `<th>Clavier J${i + 1}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><td>Direction</td><td>Stick gauche / Croix</td>${cols('dir')}</tr>
        <tr><td>Boost</td><td>${cell('boost')}</td>${cols('boost')}</tr>
        <tr><td>Tir</td><td>${cell('shoot')}</td>${cols('shoot')}</tr>
        <tr><td>Bouclier</td><td>${cell('shield')}</td>${cols('shield')}</tr>
        <tr><td>Pause</td><td>Start</td><td colspan="${n}">Échap</td></tr>
      </tbody>
    </table>`;
  }

  function countSelector() {
    const humans = humanCount();
    const swatches = range(playerCount)
      .map((i) => `<i class="${i >= humans ? 'bot' : ''}" style="color:${C.players[i].color}"></i>`).join('');
    return `
      <div class="pcount">
        <span class="arrow${playerCount <= C.minPlayers ? ' off' : ''}">◀</span>
        <span>JOUEURS</span><b>${playerCount}</b><span class="swatches">${swatches}</span>
        <span class="arrow${playerCount >= C.maxPlayers ? ' off' : ''}">▶</span>
      </div>
      <div class="pcount bots">
        <span class="arrow${botCount <= 0 ? ' off' : ''}">▼</span>
        <span>DONT BOTS</span><b>${botCount}</b>
        <span class="arrow${botCount >= playerCount ? ' off' : ''}">▲</span>
      </div>`;
  }

  function menuScreen() {
    const pads = InputManager.padCount();
    const detected = `${pads} manette${pads > 1 ? 's' : ''} détectée${pads > 1 ? 's' : ''}`;
    const padMsg = pads >= humanCount()
      ? `<span class="ok">${detected}</span>`
      : `<span class="warn">${detected} — appuyez sur un bouton de chaque manette pour qu'elles apparaissent. Les joueurs sans manette utilisent le clavier.</span>`;
    return `
      <div class="screen">
        <h1 class="title">Sn<span>A.I.</span>k'Em All</h1>
        <p class="tagline">Match en ${C.round.pointsToWin} manches gagnantes</p>
        ${countSelector()}
        <div class="rules">
          <p><b>Objectif</b> — survivez. Le dernier serpent en vie remporte la manche. Au bout de ${C.round.durationMs / 1000}s, c'est le survivant qui a gardé la plus grande queue le plus longtemps qui l'emporte (longueur cumulée chaque seconde).</p>
          <p><b>Blocs</b> — +${C.food.growth} segments et un peu de boost.</p>
          <p><b>Tir</b> — coûte 1 segment, tranche la queue adverse (les morceaux tombent en blocs à ramasser) ; dans la tête, il tue net.</p>
          <p><b>Bouclier</b> — ${C.shield.durationMs / 1000}s d'intangibilité, vous traversez tout.</p>
          <p><b>Bords</b> — le plateau est un tore : sortir à gauche fait revenir à droite, idem haut/bas.</p>
        </div>
        ${controlsHtml(humanCount())}
        <p class="pads">${padMsg}</p>
        <p class="cta">START (manette) ou ESPACE pour lancer</p>
        <p class="sub">◀ ▶ ou touches 2 / 3 / 4 — nombre de serpents · ▲ ▼ — nombre de bots</p>
        <p class="sub">C ou BACK — configurer les boutons des manettes</p>
      </div>`;
  }

  function countdownScreen() {
    const n = Math.ceil(Game.state.countdown / 1000);
    return `<div class="screen bare"><div class="count">${n > 0 ? n : 'GO'}</div>
      <div class="count-sub">Manche ${Game.state.round}</div></div>`;
  }

  function roundEndScreen() {
    const st = Game.state;
    const w = st.lastWinner;
    const reason = st.lastReason === 'time' ? 'Temps écoulé' : 'Crash';
    const head = w
      ? `<h2 style="color:${w.color}">${w.name} marque !</h2>`
      : `<h2>Égalité</h2>`;
    return `<div class="screen bare">${head}
      <p class="sub">${reason} — ${st.snakes.map((s) => s.score).join(' / ')}</p>${tallyHtml(st.lastTally)}</div>`;
  }

  // Fin du temps : cumul queue × secondes des survivants, avec l'écart au premier.
  function tallyHtml(tally) {
    if (!tally || !tally.length) return '';
    const top = tally[0].total || 1;
    const rows = tally.map((t, i) => {
      const gap = tally[0].total - t.total;
      const gapTxt = i === 0
        ? (tally.length > 1 ? `+${tally[0].total - tally[1].total} d'avance` : 'seul survivant')
        : `−${gap} (${Math.round((gap / top) * 100)} %)`;
      return `<div class="tally-row" style="--c:${t.color}">
        <span class="tally-name">${t.name}</span>
        <span class="tally-bar"><i style="width:${Math.max(2, (t.total / top) * 100)}%"></i></span>
        <b class="tally-val">${t.total}</b>
        <span class="tally-gap">${gapTxt}</span>
      </div>`;
    }).join('');
    return `<div class="tally"><p class="tally-title">Cumul queue × secondes des survivants</p>${rows}</div>`;
  }

  function matchEndScreen() {
    const w = Game.state.matchWinner;
    return `<div class="screen">
      <h1 class="title small" style="color:${w.color}">${w.name} remporte le ${Game.state.snakes.length > 2 ? 'match' : 'duel'}</h1>
      <p class="sub">Score final ${Game.state.snakes.map((s) => s.score).join(' — ')}</p>
      ${Game.state.lastReason === 'time' ? `<p class="sub">Dernière manche au temps</p>${tallyHtml(Game.state.lastTally)}` : ''}
      <br>${countSelector()}
      <p class="cta">START ou ESPACE pour rejouer</p>
    </div>`;
  }

  function pauseScreen() {
    return `<div class="screen bare"><h2>PAUSE</h2><p class="sub">START ou Échap pour reprendre</p></div>`;
  }

  /* --- écran de configuration des manettes --- */
  const pcRoot = document.getElementById('padconfig');
  const pcPlayers = range(C.maxPlayers).map((i) => {
    const root = document.getElementById(`pc-${i}`);
    root.style.setProperty('--player', C.players[i].color);
    return {
      root,
      padname: root.querySelector('[data-padname]'),
      live: root.querySelector('[data-live]'),
      rows: Array.from(root.querySelectorAll('.pc-row')),
    };
  });

  let configOpen = false;
  let lastKey = null;

  const bindingSignature = () => range(C.maxPlayers)
    .map((i) => InputManager.PAD_ACTIONS.map((a) => InputManager.getBinding(i, a)).join('-'))
    .join('|');

  function openConfig() { configOpen = true; pcRoot.hidden = false; lastKey = null; }
  function closeConfig() { configOpen = false; pcRoot.hidden = true; InputManager.cancelCapture(); lastKey = null; }

  pcPlayers.forEach((p, i) => {
    for (const row of p.rows) {
      row.addEventListener('click', () => {
        Sfx.unlock();
        const cap = InputManager.getCapture();
        const action = row.dataset.action;
        if (cap && cap.player === i && cap.action === action) InputManager.cancelCapture();
        else InputManager.beginCapture(i, action);
      });
    }
  });

  document.getElementById('pc-close').addEventListener('click', closeConfig);
  document.getElementById('pc-reset').addEventListener('click', () => {
    InputManager.resetBindings();
    InputManager.cancelCapture();
  });

  function updateConfigUi() {
    if (!configOpen) return;
    const cap = InputManager.getCapture();
    for (let i = 0; i < C.maxPlayers; i++) {
      const p = pcPlayers[i];
      p.root.hidden = i >= humanCount();
      if (p.root.hidden) continue;
      const info = InputManager.padInfo(i);
      p.padname.textContent = info.connected
        ? info.id + (info.mapping === 'standard' ? '' : ' — mapping non standard, réassignez les boutons')
        : 'Aucune manette détectée — appuyez sur un bouton de la manette';
      p.padname.classList.toggle('connected', !!info.connected);

      const live = InputManager.liveButtons(i);
      p.live.textContent = live.length ? live.join(', ') : '—';

      for (const row of p.rows) {
        const action = row.dataset.action;
        const capturing = !!cap && cap.player === i && cap.action === action;
        row.classList.toggle('capturing', capturing);
        row.querySelector('[data-btn]').textContent = capturing
          ? 'appuyez…'
          : InputManager.buttonName(InputManager.getBinding(i, action));
      }
    }
  }

  function updateOverlay() {
    const st = Game.state;
    let key;
    let html = '';

    if (configOpen) { overlay.classList.add('hidden'); lastKey = null; return; }

    if (st.paused) { key = 'paused'; html = pauseScreen(); }
    else if (st.phase === 'menu') { key = 'menu' + playerCount + '-' + botCount + InputManager.padCount() + bindingSignature(); html = menuScreen(); }
    else if (st.phase === 'countdown') { key = 'cd' + Math.ceil(st.countdown / 1000); html = countdownScreen(); }
    else if (st.phase === 'roundend') { key = 'end' + st.round; html = roundEndScreen(); }
    else if (st.phase === 'matchend') { key = 'match' + playerCount + '-' + botCount; html = matchEndScreen(); }
    else { key = 'play'; }

    if (key === lastKey) return;
    lastKey = key;
    if (key === 'play') {
      overlay.classList.add('hidden');
      overlay.innerHTML = '';
    } else {
      overlay.classList.remove('hidden');
      overlay.classList.toggle('dim', key !== 'play' && !key.startsWith('cd') && !key.startsWith('end'));
      overlay.classList.toggle('clear', key.startsWith('cd'));
      overlay.innerHTML = html;
    }
  }

  /* --- HUD --- */
  const pct = (v) => `${Math.max(0, Math.min(100, v))}%`;

  function updateHud() {
    const st = Game.state;
    const n = activeCount();
    hudRoot.style.setProperty('--count', n);
    hudRoot.dataset.count = n;
    for (let i = 0; i < C.maxPlayers; i++) {
      const p = panels[i];
      p.root.hidden = i >= n;
      if (p.root.hidden) continue;
      const s = st.snakes[i];
      const inp = InputManager.players[i];
      const isBot = s && st.phase !== 'menu' ? s.bot : i >= humanCount();
      p.root.querySelector('.pname').textContent = isBot ? `BOT ${i + 1}` : C.players[i].name;
      p.pad.textContent = isBot ? 'Bot' : inp.source === 'pad' ? `Manette ${inp.padId + 1}` : 'Clavier';
      p.pad.classList.toggle('is-pad', !isBot && inp.source === 'pad');

      if (!s) {
        p.score.textContent = '0';
        p.len.textContent = C.snake.startLength;
        p.tail.textContent = '0';
        p.boost.style.width = '100%';
        p.gun.style.width = '100%';
        p.shield.style.width = '100%';
        continue;
      }

      p.score.textContent = s.score;
      p.len.textContent = s.body.length;
      p.tail.textContent = Math.floor(s.tailTime);
      p.boost.style.width = pct((s.energy / C.boost.max) * 100);
      p.root.classList.toggle('boosting', s.boosting);
      p.gun.style.width = pct((1 - s.gunCd / C.gun.cooldownMs) * 100);

      if (s.shieldTime > 0) {
        p.shield.style.width = pct((s.shieldTime / C.shield.durationMs) * 100);
        p.shieldGauge.classList.add('active');
      } else {
        p.shield.style.width = pct((1 - s.shieldCd / C.shield.cooldownMs) * 100);
        p.shieldGauge.classList.remove('active');
      }
      p.root.classList.toggle('dead', !s.alive);
    }

    const showTime = st.phase === 'playing' || st.phase === 'countdown' || st.phase === 'roundend';
    elRound.textContent = st.round > 0 ? `MANCHE ${st.round}` : 'PRÊT ?';
    const secs = Math.max(0, Math.ceil(st.roundTimeLeft / 1000));
    elTimer.textContent = showTime ? `${String((secs / 60) | 0).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}` : '--:--';
    elTimer.classList.toggle('urgent', showTime && secs <= 10);
  }

  /* --- déverrouillage audio ---
     Chrome n'autorise l'AudioContext qu'après un geste utilisateur, et une
     pression de manette n'en est pas un : on écoute clavier et souris. */
  const unlockAudio = () => Sfx.unlock();
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('pointerdown', unlockAudio);

  /* --- boucle --- */
  let last = performance.now();
  let lastPhase = null;
  let lastPadCount = 0;
  let phaseSince = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    InputManager.poll();
    const g = InputManager.global;

    if (g.confirmPressed) Sfx.unlock();
    if (g.mutePressed) {
      const m = Sfx.toggleMute();
      elMute.textContent = m ? 'son coupé (M)' : 'son actif (M)';
    }

    const st = Game.state;
    const inMenu = st.phase === 'menu' || st.phase === 'matchend';
    if (st.phase !== lastPhase) { lastPhase = st.phase; phaseSince = now; }
    // En fin de match, les joueurs ont encore le stick en main : on laisse
    // passer un instant avant d'accepter ◀ ▶ comme choix du nombre de joueurs.
    const stepReady = now - phaseSince > 900;

    if (g.configPressed) {
      if (configOpen) closeConfig();
      else if (inMenu) openConfig();
    }

    if (configOpen) {
      // Pendant le réassignement, aucune pression ne doit lancer la partie.
      if (g.pausePressed) closeConfig();
    } else if (inMenu) {
      // Une manette de plus vient d'apparaître : on ajoute le joueur qui va avec.
      const pads = InputManager.padCount();
      if (pads > lastPadCount && pads > humanCount()) {
        setPlayerCount(pads + botCount);
        setBotCount(playerCount - pads);
      }
      lastPadCount = pads;
      if (g.countKey) setPlayerCount(g.countKey);
      else if (g.menuStep && stepReady) setPlayerCount(playerCount + g.menuStep);
      else if (g.botStep && stepReady) setBotCount(botCount + g.botStep);
      if (g.confirmPressed) { Bot.reset(); Game.startMatch(playerCount, botCount); }
    } else if (g.pausePressed) {
      Game.togglePause();
    }

    // Les serpents bots reçoivent l'entrée de leur pilote automatique.
    const inputs = InputManager.players.map((inp, i) => {
      const s = st.snakes[i];
      return s && s.bot ? Bot.control(s, st, dt) : inp;
    });
    Game.update(dt, inputs);
    Renderer.draw(ctx);
    updateHud();
    updateConfigUi();
    updateOverlay();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
