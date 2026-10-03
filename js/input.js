/*
 * Couche d'entrées. Elle produit, pour chaque joueur, un état normalisé :
 *   { axisX, axisY, boost, shoot, shield, start, back, pressed:{...} }
 *
 * La logique de jeu ne connaît QUE cette structure : pour du jeu en ligne il
 * suffira de remplir `InputManager.players[i]` depuis le réseau au lieu d'un
 * périphérique local (voir README).
 *
 * Les trois pouvoirs sont assignables : toutes les manettes ne renvoient pas
 * les mêmes index de boutons. Les valeurs par défaut suivent la disposition
 * Xbox standard (A / X / B) et l'écran de configuration permet de les changer.
 */

const InputManager = (() => {
  const MAX = CONFIG.maxPlayers;
  const DEADZONE = 0.4;
  const STORAGE_KEY = 'neonsnake.bindings.v1';

  // Index tels que renvoyés par l'API Gamepad en mapping "standard" (= Xbox).
  const BUTTON_NAMES = {
    0: 'A', 1: 'B', 2: 'X', 3: 'Y',
    4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'Back', 9: 'Start', 10: 'L3', 11: 'R3',
    12: 'Croix haut', 13: 'Croix bas', 14: 'Croix gauche', 15: 'Croix droite',
    16: 'Xbox',
  };

  const DEFAULT_BINDINGS = { boost: 0, shoot: 2, shield: 1 }; // A, X, B
  const PAD_ACTIONS = ['boost', 'shoot', 'shield'];
  const START_BUTTON = 9;
  const BACK_BUTTON = 8;

  // Codes physiques : fonctionne en AZERTY comme en QWERTY.
  const KEYMAP = [
    {
      up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
      boost: ['ShiftLeft'], shoot: ['KeyQ'], shield: ['KeyE'],
    },
    {
      up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
      boost: ['Numpad0', 'ShiftRight'], shoot: ['Numpad1', 'ControlRight'], shield: ['Numpad2', 'NumpadDecimal'],
    },
    {
      up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'],
      boost: ['KeyH'], shoot: ['KeyU'], shield: ['KeyO'],
    },
    {
      up: ['Numpad8'], down: ['Numpad5'], left: ['Numpad4'], right: ['Numpad6'],
      boost: ['NumpadAdd'], shoot: ['Numpad7'], shield: ['Numpad9'],
    },
  ];

  const ACTIONS = ['boost', 'shoot', 'shield', 'start', 'back'];

  const keys = new Set();
  const players = Array.from({ length: MAX }, blankState);
  const global = {
    confirmPressed: false, pausePressed: false, mutePressed: false, configPressed: false,
    menuStep: 0,        // -1 / +1 : gauche / droite pressé dans le menu
    botStep: 0,         // -1 / +1 : bas / haut pressé dans le menu (nombre de bots)
    countKey: null,     // 2, 3 ou 4 : touche numérique pressée
  };

  let prevGlobal = { confirm: false, pause: false, mute: false, config: false, menuX: 0, menuY: 0, countKey: null };
  let bindings = loadBindings();
  let capture = null;                       // { player, action } pendant un réassignement
  const prevRaw = Array.from({ length: MAX }, () => new Set());   // boutons pressés à la frame précédente
  const liveRaw = Array.from({ length: MAX }, () => new Set());   // boutons pressés maintenant (affichage)
  const knownPads = new Set();              // index des manettes déjà vues

  function blankState() {
    return {
      axisX: 0, axisY: 0,
      boost: false, shoot: false, shield: false, start: false, back: false,
      pressed: { boost: false, shoot: false, shield: false, start: false, back: false },
      _prev: { boost: false, shoot: false, shield: false, start: false, back: false },
      source: 'none',
      padId: null,
      padName: '',
    };
  }

  /* ---------- assignation des boutons ---------- */

  function loadBindings() {
    const base = Array.from({ length: MAX }, () => ({ ...DEFAULT_BINDINGS }));
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.slice(0, MAX).forEach((b, i) => {
            if (!b) return;
            for (const a of PAD_ACTIONS) if (Number.isInteger(b[a])) base[i][a] = b[a];
          });
        }
      }
    } catch (e) {
      // Stockage indisponible (navigation privée, file://…) : valeurs par défaut.
    }
    return base;
  }

  function saveBindings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    } catch (e) { /* on joue quand même, sans persistance */ }
  }

  function setBinding(player, action, index) {
    if (!PAD_ACTIONS.includes(action)) return;
    const b = bindings[player];
    // Si le bouton servait déjà à autre chose chez ce joueur, on échange.
    for (const other of PAD_ACTIONS) {
      if (other !== action && b[other] === index) b[other] = b[action];
    }
    b[action] = index;
    saveBindings();
  }

  function resetBindings() {
    bindings = Array.from({ length: MAX }, () => ({ ...DEFAULT_BINDINGS }));
    saveBindings();
  }

  const buttonName = (i) => BUTTON_NAMES[i] || `Bouton ${i}`;
  const getBinding = (player, action) => bindings[player][action];
  const beginCapture = (player, action) => { if (PAD_ACTIONS.includes(action)) capture = { player, action }; };
  const cancelCapture = () => { capture = null; };
  const getCapture = () => capture;
  const liveButtons = (player) => [...liveRaw[player]].sort((a, b) => a - b).map(buttonName);

  /* ---------- clavier ---------- */

  function onKey(e, down) {
    if (down && e.repeat) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (down) keys.add(e.code); else keys.delete(e.code);
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => keys.clear());

  function held(list) {
    for (const code of list) if (keys.has(code)) return true;
    return false;
  }

  /* ---------- manettes ---------- */

  function connectedPads() {
    const raw = navigator.getGamepads ? navigator.getGamepads() : [];
    const pads = [];
    for (const p of raw) if (p && p.connected) pads.push(p);
    pads.sort((a, b) => a.index - b.index);
    return pads;
  }

  // `.pressed` suffit pour les boutons ; `.value` rattrape les gâchettes
  // analogiques que certains pilotes ne marquent jamais comme pressées.
  function isDown(pad, i) {
    const b = pad.buttons[i];
    if (!b) return false;
    return b.pressed || b.value > 0.55;
  }

  function rawPressedSet(pad) {
    const set = new Set();
    for (let i = 0; i < pad.buttons.length; i++) if (isDown(pad, i)) set.add(i);
    return set;
  }

  function readPad(pad, out, playerIndex) {
    const bind = bindings[playerIndex];
    let ax = pad.axes[0] || 0;
    let ay = pad.axes[1] || 0;
    if (Math.abs(ax) < DEADZONE) ax = 0;
    if (Math.abs(ay) < DEADZONE) ay = 0;
    // La croix directionnelle prend le pas sur le stick si elle est utilisée.
    if (isDown(pad, 12)) ay = -1; else if (isDown(pad, 13)) ay = 1;
    if (isDown(pad, 14)) ax = -1; else if (isDown(pad, 15)) ax = 1;

    out.axisX = ax;
    out.axisY = ay;
    out.boost = isDown(pad, bind.boost);
    out.shoot = isDown(pad, bind.shoot);
    out.shield = isDown(pad, bind.shield);
    out.start = isDown(pad, START_BUTTON);
    out.back = isDown(pad, BACK_BUTTON);
    out.source = 'pad';
    out.padId = pad.index;
    out.padName = pad.id || 'Manette';
  }

  function readKeyboard(map, out) {
    let ax = 0, ay = 0;
    if (held(map.left)) ax -= 1;
    if (held(map.right)) ax += 1;
    if (held(map.up)) ay -= 1;
    if (held(map.down)) ay += 1;
    out.axisX = ax;
    out.axisY = ay;
    out.boost = held(map.boost);
    out.shoot = held(map.shoot);
    out.shield = held(map.shield);
    out.start = false;
    out.back = false;
    out.source = 'keyboard';
    out.padId = null;
    out.padName = '';
  }

  /* ---------- boucle ---------- */

  function poll() {
    const pads = connectedPads();

    // État brut des boutons, utilisé par le réassignement et l'affichage live.
    for (let i = 0; i < MAX; i++) {
      liveRaw[i] = pads[i] ? rawPressedSet(pads[i]) : new Set();
    }

    // Réassignement : on prend le premier bouton nouvellement enfoncé.
    if (capture) {
      const p = capture.player;
      for (const idx of liveRaw[p]) {
        if (!prevRaw[p].has(idx)) {
          setBinding(p, capture.action, idx);
          capture = null;
          break;
        }
      }
    }

    // Le navigateur ne révèle une manette qu'à son premier appui : cet appui
    // sert à la faire apparaître, pas à lancer la partie.
    const freshPads = new Set();
    for (const p of pads) if (!knownPads.has(p.index)) { knownPads.add(p.index); freshPads.add(p.index); }

    let anyPadConfirm = false;
    let anyPadBack = false;

    for (let i = 0; i < MAX; i++) {
      const st = players[i];
      for (const a of ACTIONS) st._prev[a] = st[a];

      const pad = pads[i];
      if (pad) readPad(pad, st, i);
      else readKeyboard(KEYMAP[i], st);

      for (const a of ACTIONS) st.pressed[a] = st[a] && !st._prev[a];

      if (pad && !freshPads.has(pad.index)) {
        // START seul : A sert à réveiller les manettes au menu.
        if (liveRaw[i].has(START_BUTTON) && !prevRaw[i].has(START_BUTTON)) anyPadConfirm = true;
        if (liveRaw[i].has(BACK_BUTTON)) anyPadBack = true;
      }
    }

    const confirm = held(['Space', 'Enter', 'NumpadEnter']) || anyPadConfirm;
    const pause = held(['Escape', 'KeyP']) || players.some((p) => p.pressed.start);
    const mute = held(['KeyM']);
    const config = held(['KeyC']) || anyPadBack;
    // Navigation du menu : n'importe quel stick, croix ou jeu de touches.
    const menuX = players.some((p) => p.axisX < 0) ? -1 : players.some((p) => p.axisX > 0) ? 1 : 0;
    const menuY = players.some((p) => p.axisY < 0) ? 1 : players.some((p) => p.axisY > 0) ? -1 : 0;
    const countKey = held(['Digit2']) ? 2 : held(['Digit3']) ? 3 : held(['Digit4']) ? 4 : null;

    global.confirmPressed = (confirm && !prevGlobal.confirm);
    global.pausePressed = (pause && !prevGlobal.pause);
    global.mutePressed = (mute && !prevGlobal.mute);
    global.configPressed = (config && !prevGlobal.config);
    global.menuStep = menuX !== prevGlobal.menuX ? menuX : 0;
    global.botStep = menuY !== prevGlobal.menuY ? menuY : 0;
    global.countKey = countKey !== prevGlobal.countKey ? countKey : null;
    prevGlobal = { confirm, pause, mute, config, menuX, menuY, countKey };

    for (let i = 0; i < MAX; i++) prevRaw[i] = liveRaw[i];

    return players;
  }

  function padCount() { return connectedPads().length; }

  function padInfo(player) {
    const pads = connectedPads();
    const p = pads[player];
    return p ? { connected: true, id: p.id, index: p.index, mapping: p.mapping } : { connected: false };
  }

  return {
    poll, players, global, padCount, padInfo,
    KEYMAP, PAD_ACTIONS, DEFAULT_BINDINGS,
    getBinding, setBinding, resetBindings, buttonName,
    beginCapture, cancelCapture, getCapture, liveButtons,
  };
})();
