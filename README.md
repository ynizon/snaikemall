# SnA.I.k'Em All — 2 à 4 joueurs

Snake compétitif de 2 à 4 joueurs, dans le navigateur, jouable aux manettes sur le même PC
(clavier en secours). Aucune dépendance, aucun build : sept fichiers JS chargés en
scripts classiques.

## Lancer

- **Avec Laragon** : démarrer Apache, puis ouvrir `http://localhost/snake/`.
- **Sans serveur** : double-cliquer sur `index.html`. Le jeu fonctionne en `file://`
  (pas de modules ES, pas de `fetch`).

Au menu, choisir le nombre de serpents avec **◀ ▶** (stick, croix ou flèches) ou les
touches **2 / 3 / 4**, combien d'entre eux sont des **bots** avec **▲ ▼**, puis
**START** (manette) ou **Espace** pour lancer le match. Les choix sont mémorisés.

## Bots

Les bots prennent les derniers emplacements (3 serpents dont 1 bot = J1 et J2 humains,
BOT 3). Les humains gardent donc leur clavier et leur manette habituels. Avec autant
de bots que de serpents, la partie se joue toute seule.

Le pilote (`js/bot.js`) produit le même état d'entrée qu'une manette. À chaque case,
il choisit entre tout droit, gauche et droite : il écarte les cases occupées,
privilégie l'espace libre accessible (en tenant compte des queues qui se retirent),
évite les têtes adverses et va vers la nourriture la plus proche. Il tire quand un
adversaire est dans sa ligne de mire, et active son bouclier s'il est coincé ou si un
projectile arrive sur lui.

## Manettes

Le jeu utilise l'API Gamepad. Chrome et Firefox ne révèlent une manette qu'après
une première pression de bouton : **appuyer sur un bouton de chaque manette**
avant de lancer. Les manettes sont attribuées dans l'ordre de détection (1re = J1,
2e = J2, etc.). Un joueur sans manette bascule automatiquement au clavier.

|             | Manette Xbox         | Clavier J1  | Clavier J2 | Clavier J3 | Clavier J4   |
|-------------|----------------------|-------------|------------|------------|--------------|
| Direction   | Stick gauche / Croix | Z Q S D     | Flèches    | I J K L    | Pavé 8 4 5 6 |
| Boost       | **A**                | Maj gauche  | Pavé 0     | H          | Pavé +       |
| Tir         | **X**                | A           | Pavé 1     | U          | Pavé 7       |
| Bouclier    | **B**                | E           | Pavé 2     | O          | Pavé 9       |
| Pause       | Start                | Échap       | Échap      | Échap      | Échap        |
| Config pads | Back                 | C           | C          | C          | C            |
| Son on/off  | —                    | M           | M          | M          | M            |

Seuls A, X et B déclenchent les pouvoirs : les gâchettes et les bumpers ne sont
liés à rien.

Le clavier lit les *codes physiques* : la disposition AZERTY comme QWERTY donnent
les mêmes touches sous les doigts.

### Si les boutons ne correspondent pas

Toutes les manettes ne renvoient pas les mêmes index de boutons : une manette en
mode DirectInput, une manette tierce ou un pilote exotique décalent la
numérotation, et `navigator.getGamepads()` signale alors `mapping: ""` au lieu de
`"standard"`.

Depuis le menu, **C** (ou **Back** sur la manette) ouvre l'écran de configuration :

- il affiche le nom de chaque manette détectée et prévient si le mapping n'est pas
  standard ;
- la ligne « Bouton pressé » montre **en direct** le bouton que la manette envoie,
  ce qui permet de vérifier ce que le navigateur reçoit réellement ;
- cliquer sur Boost / Tir / Bouclier puis appuyer sur un bouton le réassigne, pour
  chaque joueur séparément ;
- « Valeurs Xbox (A / X / B) » remet les défauts.

Les réglages sont conservés dans le `localStorage`.

## Règles

- **Plateau torique** : sortir par la gauche fait réapparaître à droite, idem
  haut/bas. Il n'y a pas de mur, donc pas de mort par le bord.
- **Blocs** (losanges verts) : +3 segments et un peu de jauge de boost. Un nouveau
  bloc apparaît toutes les 2,2 s, jusqu'à 4 sur le plateau.
- **Mort** : entrer dans son propre corps ou dans celui d'un adversaire. Choc
  frontal = les deux tombent. Un serpent mort disparaît aussitôt du
  plateau (il explose en particules) pour ne pas gêner la vue.
- **Manche gagnée** : le dernier serpent en vie marque (plus aucun survivant =
  manche nulle), ou, au bout de 60 s, c'est le survivant qui a porté la plus
  grande queue le plus longtemps qui marque : chaque serpent vivant cumule sa
  longueur à chaque seconde (« cumul » dans le HUD), le plus gros cumul l'emporte
  (égalité = manche nulle). Le match se joue en 5 points.

### Les trois pouvoirs

| Pouvoir | Effet | Coût / recharge |
|---|---|---|
| **Boost** | Accélère de ~108 ms à ~58 ms par case tant que le bouton est tenu | Jauge de 100, vidée en ~2,2 s, rechargée en ~6 s. Les blocs en redonnent 25 |
| **Tir** | Projectile rapide qui tranche la queue adverse au point d'impact ; **dans la tête, il tue net** | Coûte 1 segment, 1,7 s de recharge |
| **Bouclier** | Intangibilité totale : traverse les corps, absorbe les tirs | 2,5 s d'effet, 9 s de recharge (comptées dès l'activation) |

Le tir a un contrepoids volontaire : les segments arrachés **retombent en blocs
ramassables**, donc raccourcir l'adversaire crée du butin que les deux peuvent
récupérer. Comme la longueur départage à la fin du temps, être court n'est pas
qu'un avantage.

## Structure

```
index.html
css/style.css
js/config.js   tout l'équilibrage (tailles, vitesses, coûts, recharges)
js/audio.js    bruitages générés en WebAudio, zéro asset
js/input.js    manettes + clavier -> état d'entrée normalisé
js/game.js     logique pure : serpents, blocs, projectiles, manches
js/bot.js      pilote automatique des bots -> même état d'entrée qu'une manette
js/render.js   dessin du canevas
js/main.js     boucle principale, HUD, écrans
```

`js/game.js` ne touche jamais au DOM : `Game.state` est la seule source de vérité,
lue par le renderer et le HUD.

## Régler l'équilibrage

Tout est dans `js/config.js` : vitesse de base et sous boost, durée de manche,
points pour gagner, cadence d'apparition des blocs, coût du tir, durée du
bouclier, taille de la grille. Rien d'autre à modifier.

## Jeu à distance — la suite

L'architecture y a été préparée sur un point précis : la logique ne lit que
`InputManager.players[i]`, une structure sérialisable
(`{ axisX, axisY, boost, shoot, shield, pressed }`). Brancher le réseau revient à
remplir ce tableau depuis une socket au lieu d'un périphérique local.

Le chemin le plus court, sachant que le pas de temps est déjà discret :

1. **Autorité serveur.** Un petit serveur Node + `ws` fait tourner `game.js` tel
   quel (le test de fumée le charge déjà hors navigateur, sans DOM). Les clients
   envoient leurs entrées, le serveur diffuse l'état ~20 fois par seconde.
2. **Interpolation côté client.** Le rendu lit l'état reçu au lieu de l'état local.
   À 20 Hz sur une grille, un simple affichage du dernier état reçu passe déjà
   correctement.
3. **Prédiction locale** seulement si la latence gêne : rejouer ses propres entrées
   par-dessus le dernier état serveur.

Deux points à traiter à ce moment-là, aujourd'hui non résolus : `Math.random()`
(apparition des blocs, particules) doit passer par un générateur à graine partagée
si l'on veut de la simulation déterministe côté client, et l'accumulateur de
déplacement (`moveAcc`) doit être avancé par pas fixe plutôt que par `dt` d'écran.

## Vérifications effectuées

- Syntaxe des six fichiers JS validée (`node --check`).
- Test de fumée hors navigateur : 8 minutes de jeu simulées, 13 manches, un match
  complet jusqu'à 5 points, avec assertions sur les invariants (aucun segment hors
  plateau, longueur minimale respectée, projectiles bornés, nombre de blocs borné).
- Mapping manette testé hors navigateur avec deux manettes Xbox simulées
  (27 assertions) : A/X/B déclenchent bien boost/tir/bouclier et rien d'autre,
  LB/RB/LT/RT sont inertes, les deux manettes sont indépendantes, le front montant
  du tir ne se répète pas, la zone morte du stick et la croix fonctionnent, et le
  réassignement (y compris l'échange quand un bouton est déjà pris) persiste.
- Présence de tous les sélecteurs HUD utilisés par `main.js` dans `index.html`.

Le rendu visuel et la lecture d'une **vraie** manette n'ont pas pu être testés dans
un navigateur depuis cette session.
