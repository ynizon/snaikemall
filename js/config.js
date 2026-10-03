/* Réglages globaux du jeu. Tout ce qui s'équilibre se trouve ici. */

const CONFIG = {
  cols: 48,
  rows: 30,
  cell: 22,

  snake: {
    startLength: 6,
    minLength: 4,
    baseStepMs: 108,   // durée d'une case à vitesse normale
    boostStepMs: 58,   // durée d'une case sous boost
  },

  food: {
    growth: 3,         // segments gagnés par bloc
    spawnEveryMs: 2200,
    maxOnBoard: 4,
    initial: 3,
    energyBonus: 25,   // le bloc recharge aussi un peu de boost
  },

  boost: {
    max: 100,
    drainPerSec: 46,
    regenPerSec: 17,
    minToEngage: 12,   // évite le boost qui bégaie quand la jauge est vide
  },

  gun: {
    cooldownMs: 1700,
    speed: 26,         // cases par seconde
    lifeMs: 2600,
    segmentCost: 1,    // tirer coûte un segment
    maxDropsPerHit: 6, // segments arrachés recyclés en blocs ramassables
  },

  shield: {
    durationMs: 2500,
    cooldownMs: 9000,  // décompté à partir de l'activation
  },

  round: {
    durationMs: 60000,
    countdownMs: 4000,     // laisse le temps de repérer son serpent
    endDelayMs: 2000,
    timeEndDelayMs: 5000,   // fin au temps : on laisse lire le tableau des cumuls
    pointsToWin: 5,
  },

  minPlayers: 2,
  maxPlayers: 4,

  players: [
    {
      name: 'JOUEUR 1',
      color: '#38bdf8',
      glow: '#0ea5e9',
      spawn: { x: 8, y: 15 },
      dir: 'right',
    },
    {
      name: 'JOUEUR 2',
      color: '#fb923c',
      glow: '#f97316',
      spawn: { x: 39, y: 14 },
      dir: 'left',
    },
    {
      name: 'JOUEUR 3',
      color: '#f472b6',
      glow: '#ec4899',
      spawn: { x: 19, y: 5 },
      dir: 'down',
      trioSpawn: { x: 24, y: 15 },  // à 3 joueurs : au milieu des deux autres
      trioDir: 'down',
    },
    {
      name: 'JOUEUR 4',
      color: '#facc15',
      glow: '#eab308',
      spawn: { x: 28, y: 24 },
      dir: 'up',
    },
  ],
};
