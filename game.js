(() => {
  // --- DOM ---
  const menu = document.getElementById("menu");
  const gameWrap = document.getElementById("gameWrap");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });

  const charGrid = document.getElementById("charGrid");
  const playerNameInput = document.getElementById("playerName");
  const nameRow = document.getElementById("nameRow");
  const knownRow = document.getElementById("knownRow");
  const knownHello = document.getElementById("knownHello");
  const notMeBtn = document.getElementById("notMeBtn");

  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");
  const backBtn = document.getElementById("backBtn");
  const muteBtn = document.getElementById("muteBtn");
  const pauseBtn = document.getElementById("pauseBtn");

  const scoreEl = document.getElementById("score");
  const timeEl = document.getElementById("time");
  const livesEl = document.getElementById("lives");
  const levelHud = document.getElementById("levelHud");
  const playerNameHud = document.getElementById("playerNameHud");

  const howBtn = document.getElementById("howBtn");
  const helpDialog = document.getElementById("helpDialog");
  const closeHelp = document.getElementById("closeHelp");
  const menuNote = document.getElementById("menuNote");
  const bestNote = document.getElementById("bestNote");

  // --- MUNDO COMPARTIDO ---
  // Definido por /nuve-world.js. Puede NO existir: este juego también se
  // publica solo en su propio dominio, y ahí tiene que andar igual que siempre.
  const World = window.NuveWorld || null;
  const GAME_ID = "estrellas";

  // Quién está jugando según el mundo. Si el hub ya sabe quién es, acá no se
  // vuelve a preguntar: ese es todo el punto de compartir el origen.
  let worldPlayer = World ? World.currentPlayer() : null;

  function refreshWhoIsPlaying() {
    worldPlayer = World ? World.currentPlayer() : null;
    if (!knownRow || !nameRow) return;

    if (worldPlayer) {
      knownHello.textContent = "¡Hola, " + worldPlayer.name + "!";
      knownRow.hidden = false;
      nameRow.hidden = true;
    } else {
      knownRow.hidden = true;
      nameRow.hidden = false;
    }
  }

  // --- BASE LOGIC SIZE (NO CAMBIA) ---
  const W = 900;
  const H = 520;

  // --- HiDPI ---
  let dpr = 1;

  function resizeCanvasToDisplaySize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  resizeCanvasToDisplaySize();
  window.addEventListener("resize", resizeCanvasToDisplaySize);

  // --- Helpers ---
  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function smooth01(t) {
    return t * t * (3 - 2 * t);
  }

  // --- AUDIO ---
  const music = new Audio("fondo.mp3");
  music.loop = true;
  music.volume = 0.35;

  const sfxStarSrc = "star.mp3";
  const sfxNubeSrc = "nube.mp3";

  let muted = false;
  try {
    muted = localStorage.getItem("nuve_muted") === "1";
  } catch (_) {}

  function playMusic() {
    if (muted) return;
    if (music.paused) music.play().catch(() => {});
  }
  function stopMusic() {
    music.pause();
    music.currentTime = 0;
  }
  function pauseMusic() {
    music.pause();
  }

  // Pool de audio: pre-creamos varias instancias por sonido y las rotamos,
  // en vez de hacer `new Audio()` en cada golpe (menos GC y menos lag en móvil).
  const POOL_SIZE = 6;
  function makePool(src) {
    const pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio(src);
      a.preload = "auto";
      pool.push(a);
    }
    return { pool, i: 0 };
  }
  const sfxPools = {
    [sfxStarSrc]: makePool(sfxStarSrc),
    [sfxNubeSrc]: makePool(sfxNubeSrc),
  };

  function playSfx(src, volume = 0.8) {
    if (muted) return;
    const p = sfxPools[src] || (sfxPools[src] = makePool(src));
    const a = p.pool[p.i];
    p.i = (p.i + 1) % p.pool.length;
    try {
      a.currentTime = 0;
      a.volume = volume;
      a.play().catch(() => {});
    } catch (_) {}
  }
  function playStar() {
    playSfx(sfxStarSrc, 0.75);
  }
  function playNube() {
    playSfx(sfxNubeSrc, 0.85);
  }

  // --- Images ---
  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }

  const characters = [
    {
      id: "nuveciela",
      label: "Nuveciela",
      desc: "La fuerte",
      colorA: "rgba(124,58,237,.25)",
      colorB: "rgba(6,182,212,.25)",
      initial: "N",
      imageSrc: "nuveciela.png",
    },
    {
      id: "ciela",
      label: "Ciela",
      desc: "La sabia",
      colorA: "rgba(6,182,212,.25)",
      colorB: "rgba(251,191,36,.22)",
      initial: "C",
      imageSrc: "ciela.png",
    },
    {
      id: "lunaria",
      label: "Lunaria",
      desc: "La inventora",
      colorA: "rgba(251,191,36,.24)",
      colorB: "rgba(239,68,68,.18)",
      initial: "L",
      imageSrc: "lunaria.png",
    },
    {
      id: "nuve",
      label: "Nuve",
      desc: "La tranquila",
      colorA: "rgba(167,139,250,.22)",
      colorB: "rgba(16,185,129,.18)",
      initial: "N",
      imageSrc: "nuve.png",
    },
  ];

  const imageCache = new Map();
  for (const c of characters) imageCache.set(c.id, loadImage(c.imageSrc));

  // --- Glow sprites cacheados ---
  // Pre-renderizamos los halos UNA vez en canvas off-screen y los dibujamos con
  // drawImage, en vez de crear un createRadialGradient por objeto en cada frame.
  function makeGlowSprite(size, stops) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    for (const [pos, col] of stops) grad.addColorStop(pos, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }
  const GLOW_SIZE = 128;
  const glowStarDay = makeGlowSprite(GLOW_SIZE, [
    [0, "rgba(251,191,36,0.55)"],
    [0.5, "rgba(251,191,36,0.18)"],
    [1, "rgba(251,191,36,0)"],
  ]);
  const glowStarNight = makeGlowSprite(GLOW_SIZE, [
    [0, "rgba(147,197,253,0.65)"],
    [0.5, "rgba(59,130,246,0.22)"],
    [1, "rgba(59,130,246,0)"],
  ]);
  const glowCloud = makeGlowSprite(GLOW_SIZE, [
    [0, "rgba(239,68,68,0.30)"],
    [0.6, "rgba(239,68,68,0.10)"],
    [1, "rgba(239,68,68,0)"],
  ]);
  function drawGlow(sprite, x, y, radius) {
    const d = radius * 2;
    ctx.drawImage(sprite, x - radius, y - radius, d, d);
  }

  // --- Fondos por nivel (imágenes) ---
  const BG_SOURCES = {
    amanecer: "amanecer.png",
    pradera: "pradera.png",
    montana: "montana.png",
    mar: "mar.png",
    noche: "noche.png",
    cielo: "cielo.png",
  };
  const bgCache = {};
  for (const k in BG_SOURCES) bgCache[k] = loadImage(BG_SOURCES[k]);

  // nivel -> { fondo, esNoche }; cada imagen ya trae su iluminación
  const LEVEL_SCENES = {
    1: { bg: "amanecer", night: false },
    2: { bg: "pradera", night: false },
    3: { bg: "montana", night: false },
    4: { bg: "mar", night: false },
    5: { bg: "noche", night: true },
  };

  // NUEVO: poder por personaje (se carga atrapando estrellas)
  const POWERS = {
    ciela: { name: "Imán Estelar", emoji: "🧲", color: "rgba(6,182,212,1)" },
    lunaria: { name: "Rayo de Sol", emoji: "☀️", color: "rgba(251,191,36,1)" },
    nuve: { name: "Hielo Mágico", emoji: "❄️", color: "rgba(147,197,253,1)" },
    nuveciela: {
      name: "Escudo Arcoíris",
      emoji: "🌈",
      color: "rgba(167,139,250,1)",
    },
  };
  const POWER_BTN = { r: 34, mx: 18, my: 18 };

  let selectedCharId = null;

  // --- Menu grid ---
  function renderCharacterGrid() {
    charGrid.innerHTML = "";
    for (const c of characters) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "char";
      btn.setAttribute("aria-selected", "false");

      const av = document.createElement("div");
      av.className = "avatar";
      av.style.background = `linear-gradient(135deg, ${c.colorA}, ${c.colorB})`;
      av.style.overflow = "hidden";

      const imgEl = document.createElement("img");
      imgEl.alt = c.label;
      imgEl.src = c.imageSrc;
      imgEl.style.width = "100%";
      imgEl.style.height = "100%";
      imgEl.style.objectFit = "cover";
      imgEl.style.display = "block";

      imgEl.onerror = () => {
        av.textContent = c.initial;
        av.style.display = "grid";
        av.style.placeItems = "center";
        av.style.fontWeight = "800";
      };

      av.appendChild(imgEl);

      const meta = document.createElement("div");
      meta.className = "meta";
      const pw = POWERS[c.id];
      meta.innerHTML =
        `<div class="name">${c.label}</div><div class="desc">${c.desc}</div>` +
        (pw ? `<div class="power">${pw.emoji} ${pw.name}</div>` : "");

      btn.appendChild(av);
      btn.appendChild(meta);

      btn.addEventListener("click", () => {
        selectedCharId = c.id;
        [...charGrid.querySelectorAll(".char")].forEach((x) =>
          x.setAttribute("aria-selected", "false"),
        );
        btn.setAttribute("aria-selected", "true");
        validateStart();
      });

      charGrid.appendChild(btn);
    }
  }

  function validateStart() {
    const nameOk =
      !!worldPlayer || (playerNameInput.value || "").trim().length >= 1;
    const charOk = !!selectedCharId;
    startBtn.disabled = !(nameOk && charOk);
    menuNote.textContent = startBtn.disabled
      ? worldPlayer
        ? "Elegí un personaje."
        : "Elegí un personaje y escribí tu nombre."
      : "Listo. Tocá “Ok, empezar”.";
  }
  playerNameInput.addEventListener("input", validateStart);

  // --- Game state ---
  let running = false;
  let lastTs = 0;

  let score = 0;
  let timeLeft = 60;
  let lives = 3;

  // Mejor puntaje. Con el mundo compartido es de CADA jugador: antes había un
  // solo récord para toda la casa, así que el hermano te lo pisaba.
  // El récord viejo (`nuve_best`) no se hereda ni se borra: cada uno arranca su
  // propia marca para tener algo propio que superar.
  let bestScore = 0;
  function loadBest() {
    if (World && worldPlayer) {
      const saved = World.gameState(GAME_ID).best;
      bestScore = typeof saved === "number" ? saved : 0;
      return;
    }
    try {
      bestScore = parseInt(localStorage.getItem("nuve_best") || "0", 10) || 0;
    } catch (_) {
      bestScore = 0;
    }
  }
  loadBest();

  function saveBest() {
    if (score <= bestScore) return;
    bestScore = score;
    if (World && worldPlayer) {
      World.recordBest(GAME_ID, "best", score, "higher");
      return;
    }
    try {
      localStorage.setItem("nuve_best", String(bestScore));
    } catch (_) {}
  }

  let level = 1;
  let played = 0; // tiempo real jugado (solo sube), base de la progresión de niveles
  const LEVEL_STEP = 12; // 5 niveles repartidos en 60s (antes 15 dejaba el nivel 5 sin tiempo)
  const MAX_LEVEL = 5;

  const keys = { left: false, right: false };
  let shake = 0;

  const isMobile = window.innerWidth < 600;
  const player = {
    x: W * 0.5,
    y: H - 70,
    r: isMobile ? 42 : 34,
    speed: 460,
    name: "",
    char: null,
    dragging: false,
    dragOffsetX: 0,
  };

  let stars = [];
  let clouds = [];
  let powerups = [];
  let particles = [];

  // NUEVO: copos (bonus)
  let snowflakes = [];
  let snowSpawnAcc = 0;

  // NUEVO: textos flotantes ("+10"), cartel de nivel y pausa
  let floatTexts = [];
  let levelUpText = "";
  let levelUpStart = 0;
  let levelUpUntil = 0;
  let paused = false;

  let starSpawnAcc = 0;
  let cloudSpawnAcc = 0;

  // spawn y estados de powerups
  let powerSpawnAcc = 0;
  let nextPowerIn = 6.5;

  let magnetUntil = 0;
  let noCollectUntil = 0;
  let immuneUntil = 0;

  // NUEVO: poder de personaje
  let freezeUntil = 0; // nubes congeladas (Nuve)
  let power = 0; // carga del poder 0..1
  let powerFlashUntil = 0; // destello al activar
  let powerBannerText = "";
  let powerBannerColor = "#fff";
  let powerBannerStart = 0;
  let powerBannerUntil = 0;

  // efectos de fondo
  let lightningUntil = 0;
  let rainbowBgUntil = 0;
  let rainbowBgStart = 0;

  // transición de escenario por nivel
  let sceneFrom = 1;
  let sceneTo = 1;
  let sceneT = 1;

  // día/noche (fade suave) — ahora intercalado de 2 en 2
  let nightAlpha = 0;

  // --- NUEVO: sol en el fondo (cuando es de día en nivel >= 4)
  function drawSun(ts, alpha = 1) {
    const x = W * 0.82 + Math.sin(ts / 900) * 4;
    const y = H * 0.18 + Math.cos(ts / 1100) * 3;
    ctx.save();
    ctx.globalAlpha = alpha;

    const g = ctx.createRadialGradient(x, y, 6, x, y, 55);
    g.addColorStop(0.0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.3, "rgba(251,191,36,0.42)");
    g.addColorStop(0.65, "rgba(245,158,11,0.22)");
    g.addColorStop(1.0, "rgba(245,158,11,0.00)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 60, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(251,191,36,0.22)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + ts / 6000;
      const r1 = 28,
        r2 = 44;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
      ctx.lineTo(x + Math.cos(ang) * r2, y + Math.sin(ang) * r2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function renderLives() {
    livesEl.textContent =
      lives <= 6 ? "❤️".repeat(Math.max(0, lives)) : "❤️ ×" + lives;
  }

  function resetHUD() {
    scoreEl.textContent = String(score);
    timeEl.textContent = String(Math.ceil(timeLeft));
    renderLives();
    levelHud.textContent = String(level);
  }

  function computeLevel() {
    const newLevel = clamp(1 + Math.floor(played / LEVEL_STEP), 1, MAX_LEVEL);

    if (newLevel > level) {
      sceneFrom = level;
      sceneTo = newLevel;
      sceneT = 0;

      level = newLevel;
      levelHud.textContent = String(level);
      const nowLvl = performance.now();
      levelUpText = `¡Nivel ${level}!`;
      levelUpStart = nowLvl;
      levelUpUntil = nowLvl + 1600;
      playSfx(sfxStarSrc, 0.35);
    }
  }

  function settingsForLevel(lvl) {
    return {
      starEvery: clamp(0.55 - (lvl - 1) * 0.07, 0.24, 0.55),
      cloudEvery: clamp(1.35 - (lvl - 1) * 0.2, 0.6, 1.35),
      starSpeedMin: 130 + (lvl - 1) * 35,
      starSpeedMax: 220 + (lvl - 1) * 55,
      cloudSpeedMin: 110 + (lvl - 1) * 30,
      cloudSpeedMax: 180 + (lvl - 1) * 45,
      powerEveryMin: clamp(8.8 - (lvl - 1) * 0.6, 6.0, 8.8),
      powerEveryMax: clamp(12.0 - (lvl - 1) * 0.6, 7.8, 12.0),

      // NUEVO: copos con frecuencia parecida al arcoíris (aprox. 8–12s en promedio)
      snowEveryMin: 8.2,
      snowEveryMax: 12.2,
    };
  }

  let nextSnowIn = 9.5;

  function resetGame() {
    score = 0;
    timeLeft = 60;
    lives = 3;
    level = 1;
    played = 0;

    stars = [];
    clouds = [];
    powerups = [];
    particles = [];

    snowflakes = [];
    snowSpawnAcc = 0;
    nextSnowIn = rand(8.2, 12.2);

    lastTs = 0;
    starSpawnAcc = 0;
    cloudSpawnAcc = 0;
    powerSpawnAcc = 0;
    nextPowerIn = rand(4.5, 7.5);

    magnetUntil = 0;
    noCollectUntil = 0;
    immuneUntil = 0;
    freezeUntil = 0;
    power = 0;
    powerFlashUntil = 0;
    powerBannerUntil = 0;

    lightningUntil = 0;
    rainbowBgUntil = 0;
    rainbowBgStart = 0;

    sceneFrom = 1;
    sceneTo = 1;
    sceneT = 1;
    nightAlpha = 0;

    shake = 0;
    floatTexts = [];
    levelUpText = "";
    levelUpUntil = 0;

    player.x = W * 0.5;
    player.y = H - 70;
    player.dragging = false;

    resetHUD();
  }

  function startGame() {
    const chosen = characters.find((c) => c.id === selectedCharId);

    let name;
    if (worldPlayer) {
      name = worldPlayer.name;
    } else {
      name = (playerNameInput.value || "").trim().slice(0, 18);
      // Entrar escribiendo el nombre acá también CREA el perfil: después el
      // hub y el Bosque Mágico van a reconocer a este chico sin volver a
      // preguntarle. Cualquier puerta sirve para entrar al mundo.
      if (World && World.enterByName(name)) {
        worldPlayer = World.currentPlayer();
        loadBest();
        refreshWhoIsPlaying();
        renderBest();
      }
    }

    player.char = chosen;
    player.name = name;
    playerNameHud.textContent = name;

    resetGame();

    menu.hidden = true;
    gameWrap.hidden = false;

    running = true;
    setPaused(false);
    playMusic();
    requestAnimationFrame(loop);
  }

  function stopGame() {
    running = false;
    stopMusic();
    saveBest();
  }

  function backToMenu() {
    stopGame();
    gameWrap.hidden = true;
    menu.hidden = false;
    playerNameHud.textContent = "—";
    if (typeof renderBest === "function") renderBest();
  }

  // --- Spawn ---
  function spawnStar(lvl) {
    const s = settingsForLevel(lvl);
    const r = rand(14, 22);
    stars.push({
      x: rand(r + 10, W - r - 10),
      y: -r - 10,
      r,
      vy: rand(s.starSpeedMin, s.starSpeedMax),
      wobble: rand(0, Math.PI * 2),
    });
  }

  function spawnCloud(lvl) {
    const s = settingsForLevel(lvl);
    const r = rand(22, 34);
    clouds.push({
      x: rand(r + 10, W - r - 10),
      y: -r - 10,
      r,
      vy: rand(s.cloudSpeedMin, s.cloudSpeedMax),
      wobble: rand(0, Math.PI * 2),
    });
  }

  // spawn powerups (magnet/time/block/rainbow)
  function spawnPowerup(lvl) {
    const roll = Math.random();
    let type = "time";

    const pMagnet = 0.29;
    const pTime = 0.33;
    const pBlock = 0.2 + (lvl - 1) * 0.02;
    const pRainbow = 0.26;

    const total = pMagnet + pTime + pBlock + pRainbow;
    const r = roll * total;

    if (r < pMagnet) type = "magnet";
    else if (r < pMagnet + pTime) type = "time";
    else if (r < pMagnet + pTime + pBlock) type = "block";
    else type = "rainbow";

    const rr = type === "time" ? rand(18, 23) : rand(18, 24);
    const vy = rand(140 + (lvl - 1) * 20, 220 + (lvl - 1) * 30);

    powerups.push({
      type,
      x: rand(rr + 10, W - rr - 10),
      y: -rr - 10,
      r: rr,
      vy,
      wobble: rand(0, Math.PI * 2),
    });
  }

  // NUEVO: copo de nieve (bonus)
  function spawnSnowflake(lvl) {
    // lvl >= 3
    const r = rand(13, 18);
    const vy = rand(145 + (lvl - 1) * 12, 220 + (lvl - 1) * 18);
    snowflakes.push({
      x: rand(r + 10, W - r - 10),
      y: -r - 10,
      r,
      vy,
      wobble: rand(0, Math.PI * 2),
      spin: rand(-2.5, 2.5),
      rot: rand(0, Math.PI * 2),
    });
  }

  // --- Draw ---
  function beginFrame() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
  }

  const RAINBOW_COLS = [
    [239, 68, 68],
    [245, 158, 11],
    [251, 191, 36],
    [16, 185, 129],
    [6, 182, 212],
    [59, 130, 246],
    [124, 58, 237],
  ];
  function rainbowColor(now) {
    const dur = Math.max(1, rainbowBgUntil - rainbowBgStart);
    const t01 = clamp((now - rainbowBgStart) / dur, 0, 1);
    const pos = t01 * (RAINBOW_COLS.length - 1);
    const i = Math.floor(pos);
    const f = smooth01(pos - i);
    const a = RAINBOW_COLS[i];
    const b = RAINBOW_COLS[Math.min(i + 1, RAINBOW_COLS.length - 1)];
    const r = Math.round(lerp(a[0], b[0], f));
    const g = Math.round(lerp(a[1], b[1], f));
    const bl = Math.round(lerp(a[2], b[2], f));
    return [r, g, bl];
  }

  function drawLightning() {
    const left = rand(0.18, 0.42) * W;
    const top = rand(0.0, 0.12) * H;
    const midX = left + rand(-40, 40);
    const midY = top + rand(120, 180);
    const botX = left + rand(-80, 80);
    const botY = top + rand(260, 340);

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(midX, midY);
    ctx.lineTo(midX + 30, midY + 15);
    ctx.lineTo(botX, botY);
    ctx.stroke();

    ctx.strokeStyle = "rgba(59,130,246,0.22)";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(midX, midY);
    ctx.lineTo(midX + 30, midY + 15);
    ctx.lineTo(botX, botY);
    ctx.stroke();

    ctx.restore();
  }

  // escenas por nivel
  function drawScene(levelId, ts, alpha = 1) {
    const cfg = LEVEL_SCENES[levelId] || LEVEL_SCENES[1];
    const img = bgCache[cfg.bg];
    ctx.save();
    ctx.globalAlpha = alpha;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#c7d2fe"; // fallback mientras carga
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function drawBackground(ts) {
    const now = performance.now();

    if (sceneT < 1) {
      const t = smooth01(sceneT);
      drawScene(sceneFrom, ts, 1);
      drawScene(sceneTo, ts, t);
    } else {
      drawScene(level, ts, 1);
    }

    // secuencia arcoíris
    if (now < rainbowBgUntil) {
      const [rr, gg, bb] = rainbowColor(now);
      const pulse = 0.45 + Math.sin(now / 120) * 0.08;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = `rgba(${rr},${gg},${bb},0.22)`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = `rgba(${rr},${gg},${bb},0.16)`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Los fondos ya traen su iluminación día/noche: no oscurecemos ni
    // dibujamos sol encima. Solo se mantienen rayos y arcoíris (gameplay).
    if (now < lightningUntil) drawLightning();
  }

  function drawStarShape(x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    const spikes = 5;
    const outer = r;
    const inner = r * 0.5;
    let rot = (Math.PI / 2) * 3;
    ctx.moveTo(0, -outer);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(Math.cos(rot) * outer, Math.sin(rot) * outer);
      rot += Math.PI / spikes;
      ctx.lineTo(Math.cos(rot) * inner, Math.sin(rot) * inner);
      rot += Math.PI / spikes;
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSnowflakeShape(x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.stroke();

      // ramitas
      const bx = Math.cos(a) * r * 0.7;
      const by = Math.sin(a) * r * 0.7;
      const s1 = a + 0.45;
      const s2 = a - 0.45;

      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(s1) * r * 0.28, by + Math.sin(s1) * r * 0.28);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(s2) * r * 0.28, by + Math.sin(s2) * r * 0.28);
      ctx.stroke();
    }

    // glow
    const g = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 1.6);
    g.addColorStop(0, "rgba(255,255,255,0.25)");
    g.addColorStop(0.55, "rgba(6,182,212,0.18)");
    g.addColorStop(1, "rgba(59,130,246,0.00)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawCloudShape(x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(-r * 0.6, 0, r * 0.55, 0, Math.PI * 2);
    ctx.arc(0, -r * 0.2, r * 0.75, 0, Math.PI * 2);
    ctx.arc(r * 0.65, 0, r * 0.6, 0, Math.PI * 2);
    ctx.arc(0, r * 0.35, r * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const c = player.char;
    if (!c) return;

    const now = performance.now();
    const immuneOn = now < immuneUntil;
    const magnetOn = now < magnetUntil;

    // Draw character image as tall sprite (not clipped to circle)
    const img = imageCache.get(c.id);
    const ready = img && img.complete && img.naturalWidth > 0;

    // sprite height = 2.8x radius so the whole figure is visible
    const spriteH = player.r * 2.8;
    const spriteW = ready
      ? (img.naturalWidth / img.naturalHeight) * spriteH
      : spriteH;
    const sx = player.x - spriteW / 2;
    const sy = player.y - spriteH * 0.72; // anchor bottom-ish at player.y

    // shadow under character
    ctx.save();
    ctx.globalAlpha = 0.18;
    const shadowGrad = ctx.createRadialGradient(
      player.x,
      player.y + player.r * 0.3,
      0,
      player.x,
      player.y + player.r * 0.3,
      player.r * 1.4,
    );
    shadowGrad.addColorStop(0, "rgba(0,0,0,0.55)");
    shadowGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(
      player.x,
      player.y + player.r * 0.25,
      player.r * 1.4,
      player.r * 0.5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();

    // immune rainbow halo
    if (immuneOn) {
      const pulse = 0.7 + Math.sin(now / 80) * 0.12;
      const halo = ctx.createRadialGradient(
        player.x,
        player.y,
        player.r * 0.2,
        player.x,
        player.y,
        player.r * 2.6,
      );
      halo.addColorStop(0.0, `rgba(255,255,255,${0.35 * pulse})`);
      halo.addColorStop(0.25, `rgba(236,72,153,${0.26 * pulse})`);
      halo.addColorStop(0.5, `rgba(251,191,36,${0.22 * pulse})`);
      halo.addColorStop(0.72, `rgba(16,185,129,${0.18 * pulse})`);
      halo.addColorStop(0.88, `rgba(6,182,212,${0.16 * pulse})`);
      halo.addColorStop(1.0, `rgba(124,58,237,${0.1 * pulse})`);
      ctx.save();
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r * 2.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // magnet field indicator
    if (magnetOn) {
      const pulse2 = 0.5 + Math.sin(now / 160) * 0.12;
      ctx.save();
      ctx.globalAlpha = pulse2 * 0.28;
      ctx.strokeStyle = "rgba(236,72,153,0.90)";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(player.x, player.y, 220, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // draw sprite image
    if (ready) {
      ctx.save();
      ctx.drawImage(img, sx, sy, spriteW, spriteH);
      ctx.restore();
    } else {
      // fallback: colored circle with initial
      const grad = ctx.createLinearGradient(
        player.x - player.r,
        player.y - player.r,
        player.x + player.r,
        player.y + player.r,
      );
      grad.addColorStop(0, c.colorA);
      grad.addColorStop(1, c.colorB);
      ctx.save();
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(17,24,39,.85)";
      ctx.font = "900 20px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.label.slice(0, 1).toUpperCase(), player.x, player.y);
      ctx.restore();
    }

    // player name tag
    ctx.save();
    ctx.font = "900 13px 'Nunito', system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const labelY = player.y + player.r * 0.45;
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillText(player.name, player.x + 1, labelY + 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(player.name, player.x, labelY);
    ctx.restore();
  }

  // estrellas: azules cuando está noche (según nightAlpha)
  function drawStars(ts) {
    const isNight = nightAlpha > 0.45;
    for (const s of stars) {
      const wob = Math.sin(ts / 260 + s.wobble) * 8;
      const twinkle = 0.85 + Math.sin(ts / 180 + s.wobble * 3) * 0.15;
      const sx = s.x + wob;

      if (!isNight) {
        ctx.save();
        ctx.globalAlpha = twinkle;
        drawGlow(glowStarDay, sx, s.y, s.r * 2.5);
        ctx.fillStyle = "rgba(251,191,36,0.95)";
        drawStarShape(sx, s.y, s.r);
        // highlight
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.arc(sx - s.r * 0.2, s.y - s.r * 0.25, s.r * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = twinkle;
        drawGlow(glowStarNight, sx, s.y, s.r * 2.8);
        ctx.fillStyle = "rgba(147,197,253,0.95)";
        drawStarShape(sx, s.y, s.r);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.arc(sx - s.r * 0.22, s.y - s.r * 0.22, s.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawSnowflakes(ts) {
    for (const f of snowflakes) {
      const wob = Math.sin(ts / 260 + f.wobble) * 10;
      drawSnowflakeShape(f.x + wob, f.y, f.r, f.rot);
    }
  }

  function drawClouds(ts) {
    for (const c of clouds) {
      const wob = Math.sin(ts / 280 + c.wobble) * 7;
      const cx = c.x + wob;

      // danger glow (sprite cacheado)
      ctx.save();
      drawGlow(glowCloud, cx, c.y, c.r * 2.2);

      // dark cloud body
      ctx.fillStyle = "rgba(23,20,38,0.82)";
      drawCloudShape(cx, c.y, c.r);

      // inner red shimmer
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "rgba(239,68,68,0.85)";
      drawCloudShape(cx, c.y, c.r * 0.7);
      ctx.globalAlpha = 1;

      // highlight edge
      ctx.strokeStyle = "rgba(239,68,68,0.28)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(
        cx - c.r * 0.2,
        c.y - c.r * 0.15,
        c.r * 0.6,
        Math.PI,
        Math.PI * 1.8,
      );
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawPowerups(ts) {
    for (const p of powerups) {
      const wob = Math.sin(ts / 260 + p.wobble) * 7;
      const x = p.x + wob;
      const y = p.y;

      if (p.type === "magnet") {
        ctx.save();
        ctx.fillStyle = "rgba(236,72,153,0.95)";
        drawStarShape(x, y, p.r);
        ctx.fillStyle = "rgba(236,72,153,0.18)";
        ctx.beginPath();
        ctx.arc(x, y, p.r * 1.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.arc(x - p.r * 0.25, y - p.r * 0.25, p.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (p.type === "time") {
        ctx.save();
        ctx.fillStyle = "rgba(6,182,212,0.20)";
        ctx.beginPath();
        ctx.arc(x, y, p.r * 1.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(6,182,212,0.95)";
        ctx.beginPath();
        ctx.arc(x, y, p.r * 0.95, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, p.r * 0.75, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(255,255,255,0.90)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - p.r * 0.45);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + p.r * 0.38, y);
        ctx.stroke();

        ctx.restore();
      }

      if (p.type === "block") {
        // Peligro: rojo tipo "prohibido" para que se lea como algo a evitar
        ctx.save();
        ctx.fillStyle = "rgba(239,68,68,0.20)";
        ctx.beginPath();
        ctx.arc(x, y, p.r * 1.45, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(239,68,68,0.95)";
        ctx.beginPath();
        ctx.arc(x, y, p.r * 0.95, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - p.r * 0.5, y);
        ctx.lineTo(x + p.r * 0.5, y);
        ctx.stroke();

        ctx.restore();
      }

      if (p.type === "rainbow") {
        ctx.save();

        const g = ctx.createRadialGradient(x, y, p.r * 0.2, x, y, p.r * 1.6);
        g.addColorStop(0.0, "rgba(255,255,255,0.35)");
        g.addColorStop(0.35, "rgba(236,72,153,0.28)");
        g.addColorStop(0.55, "rgba(251,191,36,0.24)");
        g.addColorStop(0.72, "rgba(16,185,129,0.22)");
        g.addColorStop(0.88, "rgba(6,182,212,0.20)");
        g.addColorStop(1.0, "rgba(124,58,237,0.16)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, p.r * 1.55, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 6;
        const ang = (ts / 800) % (Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(x, y, p.r * 0.95, ang, ang + Math.PI * 1.65);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.arc(x, y, p.r * 0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }
  }

  function drawStatusBadges() {
    const now = performance.now();
    let y = 14;
    const x = 14;

    ctx.save();
    ctx.font = "900 13px 'Nunito', system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    function badge(text, bg, textColor) {
      const pad = 10;
      const h = 26;
      const w = ctx.measureText(text).width + pad * 2;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fill();
      ctx.fillStyle = textColor;
      ctx.fillText(text, x + pad, y + h / 2);
      y += h + 5;
    }

    if (now < magnetUntil) {
      const t = ((magnetUntil - now) / 1000).toFixed(1);
      badge(`🧲 IMÁN ${t}s`, "rgba(236,72,153,0.92)", "#fff");
    }

    if (now < noCollectUntil) {
      const t = ((noCollectUntil - now) / 1000).toFixed(1);
      badge(`🚫 BLOQUEO ${t}s`, "rgba(23,20,38,0.85)", "#fff");
    }

    if (now < immuneUntil) {
      const t = ((immuneUntil - now) / 1000).toFixed(1);
      badge(`🌈 ARCOÍRIS ${t}s`, "rgba(16,185,129,0.90)", "#fff");
    }

    ctx.restore();
  }

  function burst(x, y, color) {
    const count = 20;
    const cols = color
      ? [color, color, "rgba(255,255,255,0.90)"]
      : [
          "rgba(251,191,36,0.95)",
          "rgba(124,58,237,0.75)",
          "rgba(6,182,212,0.75)",
          "rgba(255,255,255,0.90)",
        ];

    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(120, 400);
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - rand(20, 80),
        r: rand(3, 7),
        a: 1,
        col: cols[Math.floor(Math.random() * cols.length)],
        kind: Math.random() < 0.6 ? "spark" : "dot",
        life: rand(0.38, 0.75),
      });
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.a);
      ctx.fillStyle =
        p.col ||
        (p.kind === "spark"
          ? "rgba(251,191,36,0.95)"
          : "rgba(124,58,237,0.55)");
      if (p.kind === "spark") drawStarShape(p.x, p.y, p.r);
      else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function collideCircle(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const rr = (ar + br) * (ar + br);
    return dx * dx + dy * dy <= rr;
  }

  function loseLife() {
    lives -= 1;
    renderLives();
    shake = 10;
    playNube();

    lightningUntil = performance.now() + 180;

    if (lives <= 0) stopGame();
  }

  function update(dt) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      timeEl.textContent = "0";
      stopGame();
      return;
    }
    timeEl.textContent = String(Math.ceil(timeLeft));

    played += dt;
    computeLevel();

    if (sceneT < 1) sceneT = Math.min(1, sceneT + dt * 1.4);

    // día/noche según el fondo del nivel (estrellas azules en niveles de noche)
    const sceneNight = LEVEL_SCENES[level] && LEVEL_SCENES[level].night ? 1 : 0;
    nightAlpha = clamp(
      nightAlpha + (sceneNight - nightAlpha) * (1 - Math.exp(-dt * 2.2)),
      0,
      1,
    );

    const s = settingsForLevel(level);

    starSpawnAcc += dt;
    cloudSpawnAcc += dt;
    powerSpawnAcc += dt;
    snowSpawnAcc += dt;

    if (starSpawnAcc >= s.starEvery) {
      starSpawnAcc = 0;
      spawnStar(level);
    }
    if (cloudSpawnAcc >= s.cloudEvery) {
      cloudSpawnAcc = 0;
      spawnCloud(level);
    }

    if (powerSpawnAcc >= nextPowerIn) {
      powerSpawnAcc = 0;
      spawnPowerup(level);
      nextPowerIn = rand(s.powerEveryMin, s.powerEveryMax);
    }

    // CAMBIO 1: desde nivel 3 caen copos con frecuencia tipo arcoíris
    if (level >= 3 && snowSpawnAcc >= nextSnowIn) {
      snowSpawnAcc = 0;
      spawnSnowflake(level);
      nextSnowIn = rand(s.snowEveryMin, s.snowEveryMax);
    }

    if (!player.dragging) {
      const dir = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
      player.x += dir * player.speed * dt;
    }
    player.x = clamp(player.x, player.r + 8, W - player.r - 8);

    const now = performance.now();
    const magnetOn = now < magnetUntil;
    const blocked = now < noCollectUntil;
    const immuneOn = now < immuneUntil;

    const magnetCatchRadius = player.r + 95;
    const pullRadius = 220;
    const pullStrength = 420;

    stars = stars.filter((st) => {
      st.y += st.vy * dt;

      if (magnetOn) {
        const dx = player.x - st.x;
        const dy = player.y - st.y;
        const d = Math.hypot(dx, dy);

        if (d < pullRadius && d > 0.001) {
          st.x += (dx / d) * pullStrength * dt;
          st.y += (dy / d) * (pullStrength * 0.15) * dt;
        }
      }

      if (!blocked) {
        const effectiveR = magnetOn ? magnetCatchRadius : player.r;
        if (collideCircle(st.x, st.y, st.r, player.x, player.y, effectiveR)) {
          score += 10;
          scoreEl.textContent = String(score);
          burst(st.x, st.y, "rgba(251,191,36,0.95)");
          spawnFloatText(st.x, st.y, "+10", "rgba(251,191,36,0.98)");
          power = Math.min(1, power + 0.09);
          playStar();
          return false;
        }
      }

      return !(st.y - st.r > H + 10);
    });

    clouds = clouds.filter((cl) => {
      if (now >= freezeUntil) cl.y += cl.vy * dt;

      if (collideCircle(cl.x, cl.y, cl.r, player.x, player.y, player.r)) {
        if (!immuneOn) {
          score = Math.max(0, score - 5); // antes -15: doble castigo (puntos + vida) muy duro para chicos
          scoreEl.textContent = String(score);
          loseLife();
        } else {
          playSfx(sfxStarSrc, 0.25);
          burst(cl.x, cl.y, "rgba(16,185,129,0.90)");
        }
        return false;
      }
      return !(cl.y - cl.r > H + 10);
    });

    // NUEVO: copos (colisión -> +1 vida y +20s)
    snowflakes = snowflakes.filter((f) => {
      f.y += f.vy * dt;
      f.rot += f.spin * dt;

      if (collideCircle(f.x, f.y, f.r, player.x, player.y, player.r)) {
        lives += 1;
        renderLives();

        timeLeft += 20;
        timeLeft = Math.min(timeLeft, 180);
        timeEl.textContent = String(Math.ceil(timeLeft));

        playSfx(sfxStarSrc, 0.6);
        burst(f.x, f.y, "rgba(147,197,253,0.95)");
        spawnFloatText(f.x, f.y, "+1 ❤️  +20s", "rgba(147,197,253,0.98)");
        return false;
      }

      return !(f.y - f.r > H + 10);
    });

    powerups = powerups.filter((p) => {
      p.y += p.vy * dt;

      if (collideCircle(p.x, p.y, p.r, player.x, player.y, player.r)) {
        const now2 = performance.now();

        if (p.type === "magnet") {
          magnetUntil = Math.max(magnetUntil, now2 + 6000);
          playSfx(sfxStarSrc, 0.55);
          burst(p.x, p.y, "rgba(236,72,153,0.90)");
        }

        if (p.type === "time") {
          timeLeft += 5;
          timeLeft = Math.min(timeLeft, 180);
          timeEl.textContent = String(Math.ceil(timeLeft));
          playSfx(sfxStarSrc, 0.5);
          burst(p.x, p.y, "rgba(6,182,212,0.90)");
          spawnFloatText(p.x, p.y, "+5s", "rgba(6,182,212,0.98)");
        }

        if (p.type === "block") {
          noCollectUntil = Math.max(noCollectUntil, now2 + 2000);
          playSfx(sfxNubeSrc, 0.55);
          burst(p.x, p.y, "rgba(124,58,237,0.80)");
        }

        if (p.type === "rainbow") {
          immuneUntil = Math.max(immuneUntil, now2 + 5000);
          rainbowBgStart = now2;
          rainbowBgUntil = now2 + 5000;
          playSfx(sfxStarSrc, 0.55);
          burst(p.x, p.y, null); // multi-color
        }
        return false;
      }

      return !(p.y - p.r > H + 10);
    });

    particles = particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 3.2;
      p.vy *= 1 - dt * 3.2;
      p.vy += 380 * dt;
      p.a = clamp(p.life / 0.7, 0, 1);
      return p.life > 0;
    });

    updateFloatTexts(dt);

    if (shake > 0) shake = Math.max(0, shake - 40 * dt);
  }

  // --- NUEVO: textos flotantes ("+10") ---
  function spawnFloatText(x, y, text, color) {
    floatTexts.push({ x, y, text, color, life: 0.9, vy: -60 });
  }
  function updateFloatTexts(dt) {
    floatTexts = floatTexts.filter((t) => {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= 1 - dt * 1.5;
      return t.life > 0;
    });
  }
  function drawFloatTexts() {
    ctx.save();
    ctx.font = "900 18px 'Nunito', system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of floatTexts) {
      const a = clamp(t.life / 0.9, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillText(t.text, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // --- NUEVO: cartel "¡Nivel N!" ---
  function drawLevelBanner() {
    const now = performance.now();
    if (now >= levelUpUntil) return;
    const dur = Math.max(1, levelUpUntil - levelUpStart);
    const t = clamp((now - levelUpStart) / dur, 0, 1);
    const appear = smooth01(clamp(t / 0.25, 0, 1));
    const fade = 1 - smooth01(clamp((t - 0.6) / 0.4, 0, 1));
    const scale = 0.6 + appear * 0.5;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(W / 2, H * 0.32);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 46px 'Nunito', system-ui";
    ctx.lineWidth = 8;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.strokeText(levelUpText, 0, 0);
    const grad = ctx.createLinearGradient(-140, 0, 140, 0);
    grad.addColorStop(0, "#7c3aed");
    grad.addColorStop(1, "#06b6d4");
    ctx.fillStyle = grad;
    ctx.fillText(levelUpText, 0, 0);
    ctx.restore();
  }

  // --- NUEVO: overlay de pausa ---
  function drawPauseOverlay() {
    ctx.save();
    ctx.fillStyle = "rgba(26,16,53,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 40px 'Nunito', system-ui";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("⏸ Pausa", W / 2, H / 2 - 10);
    ctx.font = "800 16px 'Nunito', system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("Tocá \u201cSeguir\u201d para continuar", W / 2, H / 2 + 30);
    ctx.restore();
  }

  // ====== NUEVO: PODER DE PERSONAJE ======
  function powerBtnCenter() {
    return {
      x: W - POWER_BTN.mx - POWER_BTN.r,
      y: H - POWER_BTN.my - POWER_BTN.r,
    };
  }

  function showPowerBanner(text, color) {
    powerBannerText = text;
    powerBannerColor = color;
    powerBannerStart = performance.now();
    powerBannerUntil = powerBannerStart + 1300;
  }

  function activatePower() {
    if (!running || paused || power < 1) return;
    const cfg = POWERS[selectedCharId];
    if (!cfg) return;
    power = 0;
    const now = performance.now();
    powerFlashUntil = now + 380;
    showPowerBanner(cfg.name, cfg.color);
    playSfx(sfxStarSrc, 0.6);

    if (selectedCharId === "ciela") {
      magnetUntil = Math.max(magnetUntil, now + 6500); // Imán Estelar
    } else if (selectedCharId === "nuveciela") {
      immuneUntil = Math.max(immuneUntil, now + 6000); // Escudo Arcoíris
      rainbowBgStart = now;
      rainbowBgUntil = now + 6000;
    } else if (selectedCharId === "lunaria") {
      for (const cl of clouds) burst(cl.x, cl.y, "rgba(251,191,36,0.95)"); // Rayo de Sol
      clouds = [];
      lightningUntil = now + 220;
    } else if (selectedCharId === "nuve") {
      freezeUntil = now + 4500; // Hielo Mágico
    }
  }

  function drawPowerButton() {
    const cfg = POWERS[selectedCharId];
    if (!cfg) return;
    const c = powerBtnCenter();
    const r = POWER_BTN.r;
    const ready = power >= 1;
    const now = performance.now();

    ctx.save();
    ctx.globalAlpha = ready ? 1 : 0.6;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(26,16,53,0.55)";
    ctx.fill();

    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.arc(c.x, c.y, r - 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = cfg.color;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(
      c.x,
      c.y,
      r - 3,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * clamp(power, 0, 1),
    );
    ctx.stroke();

    if (ready) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.globalAlpha = 0.25 + 0.4 * pulse;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 4 + pulse * 3, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = cfg.color;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = ready ? 1 : 0.75;
    ctx.font = "22px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cfg.emoji, c.x, c.y + 1);
    ctx.restore();
  }

  function drawPowerBanner() {
    const now = performance.now();
    if (now >= powerBannerUntil) return;
    const dur = Math.max(1, powerBannerUntil - powerBannerStart);
    const t = clamp((now - powerBannerStart) / dur, 0, 1);
    const appear = smooth01(clamp(t / 0.2, 0, 1));
    const fade = 1 - smooth01(clamp((t - 0.6) / 0.4, 0, 1));
    const scale = 0.7 + appear * 0.4;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(W / 2, H * 0.44);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 30px 'Nunito', system-ui";
    ctx.lineWidth = 7;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.strokeText("✨ " + powerBannerText + " ✨", 0, 0);
    ctx.fillStyle = powerBannerColor;
    ctx.fillText("✨ " + powerBannerText + " ✨", 0, 0);
    ctx.restore();
  }

  function drawFreezeFx() {
    if (performance.now() >= freezeUntil) return;
    ctx.save();
    ctx.fillStyle = "rgba(147,197,253,0.16)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawPowerFlash() {
    const now = performance.now();
    if (now >= powerFlashUntil) return;
    const a = (powerFlashUntil - now) / 380;
    ctx.save();
    ctx.globalAlpha = 0.35 * a;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawEndOverlay() {
    // blur-like glass overlay
    ctx.save();
    ctx.fillStyle = "rgba(240,238,255,0.78)";
    ctx.fillRect(0, 0, W, H);

    const win = timeLeft <= 0 && lives > 0;
    const emoji = win ? "🎉" : "💫";
    const title = win ? "¡Felicitaciones!" : "¡Casi!";
    const subtitle = win
      ? "¡Terminaste! Tocá la pantalla para jugar otra vez."
      : "Te quedaste sin vidas. Tocá la pantalla para reintentar.";

    // card background
    const cardW = Math.min(460, W - 40);
    const cardH = 205;
    const cardX = (W - cardW) / 2;
    const cardY = H / 2 - cardH / 2;

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.shadowColor = "rgba(124,58,237,0.18)";
    ctx.shadowBlur = 32;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 22);
    ctx.fill();
    ctx.shadowBlur = 0;

    // emoji
    ctx.font = "56px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(emoji, W / 2, cardY + 18);

    // title
    ctx.font = "900 28px 'Nunito', system-ui";
    ctx.textBaseline = "top";
    const grad = ctx.createLinearGradient(W / 2 - 100, 0, W / 2 + 100, 0);
    grad.addColorStop(0, "#7c3aed");
    grad.addColorStop(1, "#06b6d4");
    ctx.fillStyle = grad;
    ctx.fillText(title, W / 2, cardY + 80);

    // subtitle
    ctx.font = "700 14px 'Nunito', system-ui";
    ctx.fillStyle = "rgba(107,114,128,0.95)";
    ctx.fillText(subtitle, W / 2, cardY + 116);

    // score
    ctx.font = "900 20px 'Nunito', system-ui";
    ctx.fillStyle = "#1a1035";
    ctx.fillText(`Puntaje: ${score}  ⭐`, W / 2, cardY + 142);

    // mejor puntaje
    const isNewBest = score >= bestScore && score > 0;
    ctx.font = "800 14px 'Nunito', system-ui";
    ctx.fillStyle = isNewBest ? "#7c3aed" : "rgba(107,114,128,0.95)";
    ctx.fillText(
      isNewBest ? `🏆 ¡Nuevo récord! ${score}` : `🏆 Mejor: ${bestScore}`,
      W / 2,
      cardY + 170,
    );

    ctx.restore();
  }

  function loop(ts) {
    let dt = lastTs ? (ts - lastTs) / 1000 : 0;
    if (dt > 0.05) dt = 0.05; // evita saltos al volver de otra pestaña / minimizar
    lastTs = ts;

    beginFrame();
    drawBackground(ts);

    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));

    drawStars(ts);
    drawClouds(ts);
    drawPowerups(ts);
    drawSnowflakes(ts); // NUEVO
    drawParticles();
    drawFloatTexts(); // NUEVO
    drawPlayer();
    ctx.restore();

    drawStatusBadges();
    drawLevelBanner(); // NUEVO
    if (running) {
      drawFreezeFx();
      drawPowerButton();
    }
    drawPowerBanner();
    drawPowerFlash();

    if (running && !paused) update(dt);
    else if (paused) drawPauseOverlay();
    else if (!gameWrap.hidden) drawEndOverlay();

    if (!gameWrap.hidden) requestAnimationFrame(loop);
  }

  // --- Keyboard ---
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") keys.left = true;
    if (e.key === "ArrowRight") keys.right = true;
    if (
      (e.key === "p" || e.key === "P" || e.key === " ") &&
      running &&
      !gameWrap.hidden
    ) {
      e.preventDefault();
      setPaused(!paused);
    }
    if (
      (e.key === "e" || e.key === "E") &&
      running &&
      !paused &&
      !gameWrap.hidden
    ) {
      e.preventDefault();
      activatePower();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft") keys.left = false;
    if (e.key === "ArrowRight") keys.right = false;
  });

  // --- Pointer / touch ---
  function canvasPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) * (W / rect.width);
    const y = (evt.clientY - rect.top) * (H / rect.height);
    return { x, y };
  }

  function hitPlayer(x, y) {
    const dx = x - player.x;
    const dy = y - player.y;
    return dx * dx + dy * dy <= player.r * player.r;
  }

  canvas.addEventListener("pointerdown", (evt) => {
    if (gameWrap.hidden) return;
    if (!running) {
      restartGame();
      return;
    } // partida terminada: tocar la pantalla reinicia
    if (paused) return; // sin movimiento durante la pausa
    const pp = canvasPoint(evt);
    const bc = powerBtnCenter();
    if (Math.hypot(pp.x - bc.x, pp.y - bc.y) <= POWER_BTN.r + 6) {
      if (power >= 1) activatePower();
      return; // tocó el botón de poder: no arrastrar
    }
    canvas.setPointerCapture(evt.pointerId);
    const p = canvasPoint(evt);
    // On mobile, allow dragging from anywhere in lower 55% of canvas for easier control
    const isMobileTouch =
      window.innerWidth < 700 || evt.pointerType === "touch";
    if (isMobileTouch && p.y > H * 0.45) {
      player.dragging = true;
      player.dragOffsetX = 0; // center under finger
    } else if (hitPlayer(p.x, p.y)) {
      player.dragging = true;
      player.dragOffsetX = p.x - player.x;
    }
  });

  canvas.addEventListener("pointermove", (evt) => {
    if (!player.dragging) return;
    const p = canvasPoint(evt);
    player.x = clamp(p.x - player.dragOffsetX, player.r + 8, W - player.r - 8);
  });

  canvas.addEventListener("pointerup", () => {
    player.dragging = false;
  });
  canvas.addEventListener("pointercancel", () => {
    player.dragging = false;
  });

  // --- UI ---
  startBtn.addEventListener("click", startGame);

  function restartGame() {
    running = true;
    resetGame();
    setPaused(false);
    playMusic();
  }
  restartBtn.addEventListener("click", restartGame);

  backBtn.addEventListener("click", backToMenu);

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.textContent = `Sonido: ${muted ? "OFF" : "ON"}`;
    try {
      localStorage.setItem("nuve_muted", muted ? "1" : "0");
    } catch (_) {}
    if (muted) pauseMusic();
    else if (running && !paused) playMusic();
  });

  function setPaused(p) {
    paused = p;
    if (pauseBtn) {
      pauseBtn.textContent = paused ? "▶ Seguir" : "⏸ Pausa";
      pauseBtn.setAttribute("aria-pressed", String(paused));
    }
    if (paused) pauseMusic();
    else if (running && !muted) playMusic();
  }

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      if (!running) return;
      setPaused(!paused);
    });
  }

  howBtn.addEventListener("click", () => helpDialog.showModal());
  closeHelp.addEventListener("click", () => helpDialog.close());

  // --- Init ---
  function renderBest() {
    if (!bestNote) return;
    bestNote.textContent =
      bestScore > 0 ? `🏆 Mejor puntaje: ${bestScore}` : "";
  }

  if (notMeBtn) {
    notMeBtn.addEventListener("click", () => {
      if (World) World.clearCurrentPlayer();
      refreshWhoIsPlaying();
      loadBest();
      renderBest();
      validateStart();
      if (playerNameInput) playerNameInput.focus();
    });
  }

  refreshWhoIsPlaying();
  renderCharacterGrid();
  validateStart();
  renderBest();

  // Aplicar el estado de sonido persistido al botón
  muteBtn.setAttribute("aria-pressed", String(muted));
  muteBtn.textContent = `Sonido: ${muted ? "OFF" : "ON"}`;

  menu.hidden = false;
  gameWrap.hidden = true;
})();
