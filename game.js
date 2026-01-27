(() => {
  // --- DOM ---
  const menu = document.getElementById("menu");
  const gameWrap = document.getElementById("gameWrap");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });

  const charGrid = document.getElementById("charGrid");
  const playerNameInput = document.getElementById("playerName");

  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");
  const backBtn = document.getElementById("backBtn");
  const muteBtn = document.getElementById("muteBtn");

  const scoreEl = document.getElementById("score");
  const timeEl = document.getElementById("time");
  const livesEl = document.getElementById("lives");
  const levelHud = document.getElementById("levelHud");
  const playerNameHud = document.getElementById("playerNameHud");

  const howBtn = document.getElementById("howBtn");
  const helpDialog = document.getElementById("helpDialog");
  const closeHelp = document.getElementById("closeHelp");
  const menuNote = document.getElementById("menuNote");

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
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function smooth01(t){ return t*t*(3-2*t); }

  // --- AUDIO ---
  const music = new Audio("fondo.mp3");
  music.loop = true;
  music.volume = 0.35;

  const sfxStarSrc = "star.mp3";
  const sfxNubeSrc = "nube.mp3";

  let muted = false;

  function playMusic() {
    if (muted) return;
    if (music.paused) music.play().catch(() => {});
  }
  function stopMusic() { music.pause(); music.currentTime = 0; }
  function pauseMusic() { music.pause(); }

  function playSfx(src, volume = 0.8) {
    if (muted) return;
    const s = new Audio(src);
    s.volume = volume;
    s.play().catch(() => {});
  }
  function playStar() { playSfx(sfxStarSrc, 0.75); }
  function playNube() { playSfx(sfxNubeSrc, 0.85); }

  // --- Images ---
  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }

  const characters = [
    { id:"nuveciela", label:"Nuveciela", desc:"La fuerte", colorA:"rgba(124,58,237,.25)", colorB:"rgba(6,182,212,.25)", initial:"N", imageSrc:"nuveciela.png" },
    { id:"ciela",     label:"Ciela",     desc:"La sabia",  colorA:"rgba(6,182,212,.25)", colorB:"rgba(251,191,36,.22)", initial:"C", imageSrc:"ciela.png" },
    { id:"lunaria",   label:"Lunaria",   desc:"La inventora", colorA:"rgba(251,191,36,.24)", colorB:"rgba(239,68,68,.18)", initial:"L", imageSrc:"lunaria.png" },
    { id:"nuve",      label:"Nuve",      desc:"La tranquila",  colorA:"rgba(167,139,250,.22)", colorB:"rgba(16,185,129,.18)", initial:"N", imageSrc:"nuve.png" },
  ];

  const imageCache = new Map();
  for (const c of characters) imageCache.set(c.id, loadImage(c.imageSrc));

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
      meta.innerHTML = `<div class="name">${c.label}</div><div class="desc">${c.desc}</div>`;

      btn.appendChild(av);
      btn.appendChild(meta);

      btn.addEventListener("click", () => {
        selectedCharId = c.id;
        [...charGrid.querySelectorAll(".char")].forEach(x => x.setAttribute("aria-selected","false"));
        btn.setAttribute("aria-selected","true");
        validateStart();
      });

      charGrid.appendChild(btn);
    }
  }

  function validateStart() {
    const nameOk = (playerNameInput.value || "").trim().length >= 1;
    const charOk = !!selectedCharId;
    startBtn.disabled = !(nameOk && charOk);
    menuNote.textContent = startBtn.disabled
      ? "Elegí un personaje y escribí tu nombre."
      : "Listo. Tocá “Ok, empezar”.";
  }
  playerNameInput.addEventListener("input", validateStart);

  // --- Game state ---
  let running = false;
  let lastTs = 0;

  let score = 0;
  let timeLeft = 60;
  let lives = 3;

  let level = 1;
  const LEVEL_STEP = 15;
  const MAX_LEVEL = 5;

  const keys = { left:false, right:false };
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
    dragOffsetX: 0
  };

  let stars = [];
  let clouds = [];
  let powerups = [];
  let particles = [];

  // NUEVO: copos (bonus)
  let snowflakes = [];
  let snowSpawnAcc = 0;

  let starSpawnAcc = 0;
  let cloudSpawnAcc = 0;

  // spawn y estados de powerups
  let powerSpawnAcc = 0;
  let nextPowerIn = 6.5;

  let magnetUntil = 0;
  let noCollectUntil = 0;
  let immuneUntil = 0;

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
    const x = W * 0.82 + Math.sin(ts/900) * 4;
    const y = H * 0.18 + Math.cos(ts/1100) * 3;
    ctx.save();
    ctx.globalAlpha = alpha;

    const g = ctx.createRadialGradient(x, y, 6, x, y, 55);
    g.addColorStop(0.0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.30, "rgba(251,191,36,0.42)");
    g.addColorStop(0.65, "rgba(245,158,11,0.22)");
    g.addColorStop(1.0, "rgba(245,158,11,0.00)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 60, 0, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = "rgba(251,191,36,0.22)";
    ctx.lineWidth = 2;
    for (let i=0;i<10;i++){
      const ang = (i/10) * Math.PI*2 + ts/6000;
      const r1 = 28, r2 = 44;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang)*r1, y + Math.sin(ang)*r1);
      ctx.lineTo(x + Math.cos(ang)*r2, y + Math.sin(ang)*r2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function resetHUD() {
    scoreEl.textContent = String(score);
    timeEl.textContent = String(Math.ceil(timeLeft));
    livesEl.textContent = String(lives);
    levelHud.textContent = String(level);
  }

  function computeLevel() {
    const elapsed = 60 - timeLeft;
    const newLevel = clamp(1 + Math.floor(elapsed / LEVEL_STEP), 1, MAX_LEVEL);

    if (newLevel !== level) {
      sceneFrom = level;
      sceneTo = newLevel;
      sceneT = 0;

      level = newLevel;
      levelHud.textContent = String(level);
      playSfx(sfxStarSrc, 0.35);
    }
  }

  function settingsForLevel(lvl) {
    return {
      starEvery: clamp(0.55 - (lvl-1)*0.07, 0.24, 0.55),
      cloudEvery: clamp(1.35 - (lvl-1)*0.20, 0.60, 1.35),
      starSpeedMin: 130 + (lvl-1)*35,
      starSpeedMax: 220 + (lvl-1)*55,
      cloudSpeedMin: 110 + (lvl-1)*30,
      cloudSpeedMax: 180 + (lvl-1)*45,
      powerEveryMin: clamp(8.8 - (lvl-1)*0.6, 6.0, 8.8),
      powerEveryMax: clamp(12.0 - (lvl-1)*0.6, 7.8, 12.0),

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

    lightningUntil = 0;
    rainbowBgUntil = 0;
    rainbowBgStart = 0;

    sceneFrom = 1;
    sceneTo = 1;
    sceneT = 1;
    nightAlpha = 0;

    shake = 0;

    player.x = W * 0.5;
    player.y = H - 70;
    player.dragging = false;

    resetHUD();
  }

  function startGame() {
    const chosen = characters.find(c => c.id === selectedCharId);
    const name = (playerNameInput.value || "").trim().slice(0,18);

    player.char = chosen;
    player.name = name;
    playerNameHud.textContent = name;

    resetGame();

    menu.hidden = true;
    gameWrap.hidden = false;

    running = true;
    playMusic();
    requestAnimationFrame(loop);
  }

  function stopGame() { running = false; stopMusic(); }

  function backToMenu() {
    stopGame();
    gameWrap.hidden = true;
    menu.hidden = false;
    playerNameHud.textContent = "—";
  }

  // --- Spawn ---
  function spawnStar(lvl) {
    const s = settingsForLevel(lvl);
    const r = rand(14, 22);
    stars.push({
      x: rand(r+10, W - r - 10),
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
      x: rand(r+10, W - r - 10),
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

    const pMagnet  = 0.29;
    const pTime    = 0.33;
    const pBlock   = 0.20 + (lvl-1)*0.02;
    const pRainbow = 0.26;

    const total = pMagnet + pTime + pBlock + pRainbow;
    const r = roll * total;

    if (r < pMagnet) type = "magnet";
    else if (r < pMagnet + pTime) type = "time";
    else if (r < pMagnet + pTime + pBlock) type = "block";
    else type = "rainbow";

    const rr = (type === "time") ? rand(18, 23) : rand(18, 24);
    const vy = rand(140 + (lvl-1)*20, 220 + (lvl-1)*30);

    powerups.push({
      type,
      x: rand(rr+10, W - rr - 10),
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
    const vy = rand(145 + (lvl-1)*12, 220 + (lvl-1)*18);
    snowflakes.push({
      x: rand(r+10, W - r - 10),
      y: -r - 10,
      r,
      vy,
      wobble: rand(0, Math.PI * 2),
      spin: rand(-2.5, 2.5),
      rot: rand(0, Math.PI*2),
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
    const b = RAINBOW_COLS[Math.min(i+1, RAINBOW_COLS.length-1)];
    const r = Math.round(lerp(a[0], b[0], f));
    const g = Math.round(lerp(a[1], b[1], f));
    const bl = Math.round(lerp(a[2], b[2], f));
    return [r,g,bl];
  }

  function drawLightning() {
    const left = rand(0.18, 0.42) * W;
    const top = rand(0.00, 0.12) * H;
    const midX = left + rand(-40, 40);
    const midY = top + rand(120, 180);
    const botX = left + rand(-80, 80);
    const botY = top + rand(260, 340);

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.fillRect(0,0,W,H);

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
    ctx.save();
    ctx.globalAlpha = alpha;

    if (levelId === 1) {
      ctx.fillStyle = "rgba(124,58,237,.10)";
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, H - 110);
      for (let x=0; x<=W; x+=18){
        const y = H - 110 + Math.sin((x/110) + ts/900) * 14;
        ctx.lineTo(x,y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(6,182,212,.10)";
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, H - 70);
      for (let x=0; x<=W; x+=18){
        const y = H - 70 + Math.sin((x/95) + ts/820 + 1.2) * 10;
        ctx.lineTo(x,y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }

    if (levelId === 2) {
      const groundY = H - 85;
      ctx.fillStyle = "rgba(16,185,129,0.12)";
      ctx.fillRect(0, groundY, W, H-groundY);

      for (let i=0;i<14;i++){
        const x = i*(W/13) + Math.sin(ts/500+i)*6;
        const h = 70 + (i%4)*18;
        ctx.fillStyle = "rgba(17,24,39,0.25)";
        ctx.fillRect(x-6, groundY - h + 18, 12, h-18);
        ctx.fillStyle = "rgba(16,185,129,0.20)";
        ctx.beginPath(); ctx.arc(x, groundY - h + 18, 26, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "rgba(6,182,212,0.12)";
        ctx.beginPath(); ctx.arc(x+10, groundY - h + 12, 20, 0, Math.PI*2); ctx.fill();
      }
    }

    if (levelId === 3) {
      const base = H - 90;
      ctx.fillStyle = "rgba(59,130,246,0.10)";
      ctx.fillRect(0, base, W, H-base);

      for (let i=0;i<16;i++){
        const w = 38 + (i%5)*10;
        const h = 70 + (i%6)*22;
        const x = 20 + i*(W/16);
        ctx.fillStyle = "rgba(17,24,39,0.22)";
        ctx.fillRect(x, base - h, w, h);

        ctx.fillStyle = "rgba(255,255,255,0.10)";
        for (let r=0;r<4;r++){
          for (let c=0;c<3;c++){
            ctx.fillRect(x+6+c*10, base-h+10+r*14, 6, 8);
          }
        }
      }
    }

    if (levelId === 4) {
      ctx.fillStyle = "rgba(124,58,237,0.10)";
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, H-120);
      ctx.lineTo(W*0.22, H-180);
      ctx.lineTo(W*0.45, H-140);
      ctx.lineTo(W*0.70, H-210);
      ctx.lineTo(W, H-130);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(17,24,39,0.20)";
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, H-95);
      ctx.lineTo(W*0.18, H-140);
      ctx.lineTo(W*0.42, H-115);
      ctx.lineTo(W*0.72, H-170);
      ctx.lineTo(W, H-105);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(W*0.68, H-210);
      ctx.lineTo(W*0.62, H-180);
      ctx.lineTo(W*0.74, H-175);
      ctx.closePath();
      ctx.fill();
    }

    if (levelId === 5) {
      const seaY = H - 120;
      ctx.fillStyle = "rgba(6,182,212,0.14)";
      ctx.fillRect(0, seaY, W, H-seaY);

      ctx.fillStyle = "rgba(59,130,246,0.10)";
      ctx.beginPath();
      ctx.moveTo(0, seaY);
      for (let x=0; x<=W; x+=20){
        const y = seaY + Math.sin((x/70) + ts/650) * 8;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x=0; x<=W; x+=26){
        const y = seaY + Math.sin((x/55) + ts/520) * 6 + 14;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBackground(ts) {
    const now = performance.now();

    if (sceneT < 1) {
      const t = smooth01(sceneT);
      drawScene(sceneFrom, ts, 1 - t);
      drawScene(sceneTo, ts, t);
    } else {
      drawScene(level, ts, 1);
    }

    // miniestrellas del fondo
    const night = nightAlpha;
    for (let i=0;i<18;i++){
      const x = (i * 63) % W;
      const y = ((i * 111) % 170) + 18;
      ctx.globalAlpha = (0.22 + night*0.10);
      ctx.fillStyle = night > 0 ? "rgba(255,255,255,0.85)" : "#111827";
      ctx.beginPath();
      ctx.arc(x + Math.sin(ts/700+i)*5, y, 1.5, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // secuencia arcoíris
    if (now < rainbowBgUntil) {
      const [rr, gg, bb] = rainbowColor(now);
      const pulse = 0.45 + Math.sin(now/120) * 0.08;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = `rgba(${rr},${gg},${bb},0.22)`;
      ctx.fillRect(0,0,W,H);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = `rgba(${rr},${gg},${bb},0.16)`;
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    }

    // noche (oscurece)
    if (nightAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = 0.55 * nightAlpha;
      ctx.fillStyle = "rgba(3,7,18,0.90)";
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    }

    // CAMBIO 2: en nivel 4 vuelve de día y aparece sol
    // + CAMBIO 3: día/noche se intercalan de 2 en 2 (ver update)
    const isDayNow = (nightAlpha < 0.25);
    if (level >= 4 && isDayNow) drawSun(ts, 0.85);

    if (now < lightningUntil) drawLightning();
  }

  function drawStarShape(x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    const spikes = 5;
    const outer = r;
    const inner = r * 0.5;
    let rot = Math.PI / 2 * 3;
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
    for (let i=0;i<6;i++){
      const a = (i/6)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*r*0.15, Math.sin(a)*r*0.15);
      ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
      ctx.stroke();

      // ramitas
      const bx = Math.cos(a)*r*0.70;
      const by = Math.sin(a)*r*0.70;
      const s1 = a + 0.45;
      const s2 = a - 0.45;

      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(s1)*r*0.28, by + Math.sin(s1)*r*0.28);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(s2)*r*0.28, by + Math.sin(s2)*r*0.28);
      ctx.stroke();
    }

    // glow
    const g = ctx.createRadialGradient(0,0, r*0.15, 0,0, r*1.6);
    g.addColorStop(0, "rgba(255,255,255,0.25)");
    g.addColorStop(0.55, "rgba(6,182,212,0.18)");
    g.addColorStop(1, "rgba(59,130,246,0.00)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0,0, r*1.55, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function drawCloudShape(x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(-r*0.6, 0, r*0.55, 0, Math.PI*2);
    ctx.arc(0, -r*0.2, r*0.75, 0, Math.PI*2);
    ctx.arc(r*0.65, 0, r*0.6, 0, Math.PI*2);
    ctx.arc(0, r*0.35, r*0.95, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const c = player.char;
    if (!c) return;

    const now = performance.now();
    const immuneOn = now < immuneUntil;

    if (immuneOn) {
      const pulse = 0.65 + Math.sin(now/90) * 0.10;
      const halo = ctx.createRadialGradient(
        player.x, player.y, player.r*0.3,
        player.x, player.y, player.r*2.2
      );
      halo.addColorStop(0.0, `rgba(255,255,255,${0.30*pulse})`);
      halo.addColorStop(0.35, `rgba(236,72,153,${0.22*pulse})`);
      halo.addColorStop(0.55, `rgba(251,191,36,${0.18*pulse})`);
      halo.addColorStop(0.72, `rgba(16,185,129,${0.16*pulse})`);
      halo.addColorStop(0.88, `rgba(6,182,212,${0.14*pulse})`);
      halo.addColorStop(1.0, `rgba(124,58,237,${0.10*pulse})`);

      ctx.save();
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r*2.15, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    const grad = ctx.createLinearGradient(player.x - player.r, player.y - player.r, player.x + player.r, player.y + player.r);
    grad.addColorStop(0, c.colorA);
    grad.addColorStop(1, c.colorB);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r+3, 0, Math.PI*2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI*2);
    ctx.closePath();
    ctx.save();
    ctx.clip();

    const img = imageCache.get(c.id);
    const ready = img && img.complete && img.naturalWidth > 0;

    if (ready) {
      const size = player.r * 2;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = Math.max(size / iw, size / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = player.x - dw/2;
      const dy = player.y - dh/2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.fillRect(player.x-player.r, player.y-player.r, player.r*2, player.r*2);
      ctx.fillStyle = "rgba(17,24,39,.85)";
      ctx.font = "900 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.label.slice(0,1).toUpperCase(), player.x, player.y);
    }

    ctx.restore();

    ctx.strokeStyle = "rgba(0,0,0,.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI*2);
    ctx.stroke();

    ctx.fillStyle = "rgba(17,24,39,.70)";
    ctx.font = "800 12px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(player.name, player.x, player.y + player.r + 10);
  }

  // estrellas: azules cuando está noche (según nightAlpha)
  function drawStars(ts) {
    const isNight = (nightAlpha > 0.45);
    for (const s of stars) {
      const wob = Math.sin(ts/260 + s.wobble) * 8;

      if (!isNight) {
        ctx.fillStyle = "rgba(251,191,36,0.95)";
        drawStarShape(s.x + wob, s.y, s.r);
        ctx.fillStyle = "rgba(124,58,237,.12)";
        ctx.beginPath();
        ctx.arc(s.x + wob, s.y, s.r*1.35, 0, Math.PI*2);
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(59,130,246,0.95)";
        drawStarShape(s.x + wob, s.y, s.r);
        ctx.fillStyle = "rgba(6,182,212,0.16)";
        ctx.beginPath();
        ctx.arc(s.x + wob, s.y, s.r*1.55, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.beginPath();
        ctx.arc(s.x + wob - s.r*0.25, s.y - s.r*0.25, s.r*0.35, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }

  function drawSnowflakes(ts) {
    for (const f of snowflakes) {
      const wob = Math.sin(ts/260 + f.wobble) * 10;
      drawSnowflakeShape(f.x + wob, f.y, f.r, f.rot);
    }
  }

  function drawClouds(ts) {
    for (const c of clouds) {
      const wob = Math.sin(ts/280 + c.wobble) * 7;
      ctx.fillStyle = "rgba(17,24,39,.72)";
      drawCloudShape(c.x + wob, c.y, c.r);
      ctx.fillStyle = "rgba(239,68,68,.16)";
      ctx.beginPath();
      ctx.arc(c.x + wob, c.y, c.r*1.15, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function drawPowerups(ts) {
    for (const p of powerups) {
      const wob = Math.sin(ts/260 + p.wobble) * 7;
      const x = p.x + wob;
      const y = p.y;

      if (p.type === "magnet") {
        ctx.save();
        ctx.fillStyle = "rgba(236,72,153,0.95)";
        drawStarShape(x, y, p.r);
        ctx.fillStyle = "rgba(236,72,153,0.18)";
        ctx.beginPath();
        ctx.arc(x, y, p.r*1.65, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.arc(x - p.r*0.25, y - p.r*0.25, p.r*0.35, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }

      if (p.type === "time") {
        ctx.save();
        ctx.fillStyle = "rgba(6,182,212,0.20)";
        ctx.beginPath();
        ctx.arc(x, y, p.r*1.3, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = "rgba(6,182,212,0.95)";
        ctx.beginPath();
        ctx.arc(x, y, p.r*0.95, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, p.r*0.75, 0, Math.PI*2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(255,255,255,0.90)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - p.r*0.45);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + p.r*0.38, y);
        ctx.stroke();

        ctx.restore();
      }

      if (p.type === "block") {
        ctx.save();
        ctx.fillStyle = "rgba(124,58,237,0.18)";
        ctx.beginPath();
        ctx.arc(x, y, p.r*1.35, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = "rgba(17,24,39,0.80)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y, p.r*0.85, 0, Math.PI*2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(17,24,39,0.80)";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x - p.r*0.6, y + p.r*0.6);
        ctx.lineTo(x + p.r*0.6, y - p.r*0.6);
        ctx.stroke();

        ctx.restore();
      }

      if (p.type === "rainbow") {
        ctx.save();

        const g = ctx.createRadialGradient(x, y, p.r*0.2, x, y, p.r*1.6);
        g.addColorStop(0.0, "rgba(255,255,255,0.35)");
        g.addColorStop(0.35, "rgba(236,72,153,0.28)");
        g.addColorStop(0.55, "rgba(251,191,36,0.24)");
        g.addColorStop(0.72, "rgba(16,185,129,0.22)");
        g.addColorStop(0.88, "rgba(6,182,212,0.20)");
        g.addColorStop(1.0, "rgba(124,58,237,0.16)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, p.r*1.55, 0, Math.PI*2);
        ctx.fill();

        ctx.lineWidth = 6;
        const ang = (ts / 800) % (Math.PI*2);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(x, y, p.r*0.95, ang, ang + Math.PI*1.65);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.arc(x, y, p.r*0.35, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
      }
    }
  }

  function drawStatusBadges() {
    const now = performance.now();
    let x = 18;
    let y = 18;

    ctx.save();
    ctx.font = "900 14px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    if (now < magnetUntil) {
      const t = ((magnetUntil - now) / 1000).toFixed(1);
      ctx.fillStyle = "rgba(236,72,153,0.92)";
      ctx.fillText(`IMÁN ${t}s`, x, y);
      y += 18;
    }

    if (now < noCollectUntil) {
      const t = ((noCollectUntil - now) / 1000).toFixed(1);
      ctx.fillStyle = "rgba(17,24,39,0.82)";
      ctx.fillText(`BLOQUEO ${t}s`, x, y);
      y += 18;
    }

    if (now < immuneUntil) {
      const t = ((immuneUntil - now) / 1000).toFixed(1);
      ctx.fillStyle = "rgba(16,185,129,0.92)";
      ctx.fillText(`ARCOIRIS ${t}s`, x, y);
      y += 18;
    }

    ctx.restore();
  }

  function burst(x, y) {
    const count = 18;
    for (let i=0;i<count;i++){
      const ang = rand(0, Math.PI*2);
      const spd = rand(130, 380);
      particles.push({
        x, y,
        vx: Math.cos(ang)*spd,
        vy: Math.sin(ang)*spd,
        r: rand(3, 6),
        a: 1,
        kind: Math.random() < 0.65 ? "spark" : "dot",
        life: rand(0.38, 0.70)
      });
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.a);
      ctx.fillStyle = p.kind === "spark"
        ? "rgba(251,191,36,0.95)"
        : "rgba(124,58,237,0.35)";
      if (p.kind === "spark") drawStarShape(p.x, p.y, p.r);
      else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function collideCircle(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const rr = (ar + br) * (ar + br);
    return (dx*dx + dy*dy) <= rr;
  }

  function loseLife() {
    lives -= 1;
    livesEl.textContent = String(lives);
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

    computeLevel();

    if (sceneT < 1) sceneT = Math.min(1, sceneT + dt * 1.4);

    // CAMBIO 3: día/noche se intercalan de 2 en 2:
    // niveles 1-2 = día, 3-4 = noche, 5-6 = día, ...
    const isNightByLevel = (Math.floor((level - 1) / 2) % 2) === 1;

    // CAMBIO 2: desde nivel 4 vuelve a hacerse de día (override)
    // (si querés que sea estrictamente 2 en 2, eliminá este override)
    const forcedDayAtLvl4 = (level === 4);

    const targetNight = (forcedDayAtLvl4 ? 0 : (isNightByLevel ? 1 : 0));
    nightAlpha = clamp(
      nightAlpha + (targetNight - nightAlpha) * (1 - Math.exp(-dt*2.2)),
      0, 1
    );

    const s = settingsForLevel(level);

    starSpawnAcc += dt;
    cloudSpawnAcc += dt;
    powerSpawnAcc += dt;
    snowSpawnAcc += dt;

    if (starSpawnAcc >= s.starEvery) { starSpawnAcc = 0; spawnStar(level); }
    if (cloudSpawnAcc >= s.cloudEvery) { cloudSpawnAcc = 0; spawnCloud(level); }

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

    stars = stars.filter(st => {
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
          burst(st.x, st.y);
          playStar();
          return false;
        }
      }

      return !(st.y - st.r > H + 10);
    });

    clouds = clouds.filter(cl => {
      cl.y += cl.vy * dt;

      if (collideCircle(cl.x, cl.y, cl.r, player.x, player.y, player.r)) {
        if (!immuneOn) {
          score = Math.max(0, score - 15);
          scoreEl.textContent = String(score);
          loseLife();
        } else {
          playSfx(sfxStarSrc, 0.25);
          burst(cl.x, cl.y);
        }
        return false;
      }
      return !(cl.y - cl.r > H + 10);
    });

    // NUEVO: copos (colisión -> +1 vida y +20s)
    snowflakes = snowflakes.filter(f => {
      f.y += f.vy * dt;
      f.rot += f.spin * dt;

      if (collideCircle(f.x, f.y, f.r, player.x, player.y, player.r)) {
        lives += 1;
        livesEl.textContent = String(lives);

        timeLeft += 20;
        timeLeft = Math.min(timeLeft, 180);
        timeEl.textContent = String(Math.ceil(timeLeft));

        playSfx(sfxStarSrc, 0.60);
        burst(f.x, f.y);
        return false;
      }

      return !(f.y - f.r > H + 10);
    });

    powerups = powerups.filter(p => {
      p.y += p.vy * dt;

      if (collideCircle(p.x, p.y, p.r, player.x, player.y, player.r)) {
        const now2 = performance.now();

        if (p.type === "magnet") {
          magnetUntil = Math.max(magnetUntil, now2 + 6000);
          playSfx(sfxStarSrc, 0.55);
        }

        if (p.type === "time") {
          timeLeft += 5;
          timeLeft = Math.min(timeLeft, 180);
          timeEl.textContent = String(Math.ceil(timeLeft));
          playSfx(sfxStarSrc, 0.50);
        }

        if (p.type === "block") {
          noCollectUntil = Math.max(noCollectUntil, now2 + 2000);
          playSfx(sfxNubeSrc, 0.55);
        }

        if (p.type === "rainbow") {
          immuneUntil = Math.max(immuneUntil, now2 + 5000);
          rainbowBgStart = now2;
          rainbowBgUntil = now2 + 5000;
          playSfx(sfxStarSrc, 0.55);
        }

        burst(p.x, p.y);
        return false;
      }

      return !(p.y - p.r > H + 10);
    });

    particles = particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - dt*3.2);
      p.vy *= (1 - dt*3.2);
      p.vy += 380 * dt;
      p.a = clamp(p.life / 0.70, 0, 1);
      return p.life > 0;
    });

    if (shake > 0) shake = Math.max(0, shake - 40*dt);
  }

  function drawEndOverlay() {
    ctx.fillStyle = "rgba(255,255,255,.60)";
    ctx.fillRect(0,0,W,H);

    ctx.textAlign = "center";
    const win = (timeLeft <= 0 && lives > 0);

    ctx.fillStyle = "rgba(17,24,39,.88)";
    ctx.font = "900 34px system-ui";
    ctx.fillText(win ? "¡Felicitaciones!" : "Uy… esta vez no salió", W/2, H/2 - 28);

    ctx.fillStyle = "rgba(17,24,39,.72)";
    ctx.font = "800 16px system-ui";
    ctx.fillText(
      win ? "Terminaste el juego. ¿Jugamos otra vez?" : "Te quedaste sin vidas. Tocá Reiniciar para jugar de nuevo.",
      W/2, H/2 + 4
    );

    ctx.fillStyle = "rgba(17,24,39,.70)";
    ctx.font = "900 18px system-ui";
    ctx.fillText(`Puntaje final: ${score}`, W/2, H/2 + 34);
  }

  function loop(ts) {
    const dt = lastTs ? (ts - lastTs) / 1000 : 0;
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
    drawPlayer();
    ctx.restore();

    drawStatusBadges();

    if (running) update(dt);
    else if (!gameWrap.hidden) drawEndOverlay();

    if (!gameWrap.hidden) requestAnimationFrame(loop);
  }

  // --- Keyboard ---
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") keys.left = true;
    if (e.key === "ArrowRight") keys.right = true;
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
    return {x,y};
  }

  function hitPlayer(x,y){
    const dx = x - player.x;
    const dy = y - player.y;
    return (dx*dx + dy*dy) <= (player.r*player.r);
  }

  canvas.addEventListener("pointerdown", (evt) => {
    if (gameWrap.hidden) return;
    canvas.setPointerCapture(evt.pointerId);
    const p = canvasPoint(evt);
    if (hitPlayer(p.x,p.y)) {
      player.dragging = true;
      player.dragOffsetX = p.x - player.x;
    }
  });

  canvas.addEventListener("pointermove", (evt) => {
    if (!player.dragging) return;
    const p = canvasPoint(evt);
    player.x = clamp(p.x - player.dragOffsetX, player.r + 8, W - player.r - 8);
  });

  canvas.addEventListener("pointerup", () => { player.dragging = false; });
  canvas.addEventListener("pointercancel", () => { player.dragging = false; });

  // --- UI ---
  startBtn.addEventListener("click", startGame);

  restartBtn.addEventListener("click", () => {
    running = true;
    resetGame();
    playMusic();
  });

  backBtn.addEventListener("click", backToMenu);

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.textContent = `Sonido: ${muted ? "OFF" : "ON"}`;
    if (muted) pauseMusic();
    else if (running) playMusic();
  });

  howBtn.addEventListener("click", () => helpDialog.showModal());
  closeHelp.addEventListener("click", () => helpDialog.close());

  // --- Init ---
  renderCharacterGrid();
  validateStart();
  menu.hidden = false;
  gameWrap.hidden = true;
})();
