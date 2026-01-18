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

  // --- HiDPI / Mobile sharpness (canvas interno) ---
  let DPR = Math.max(1, window.devicePixelRatio || 1);

  function applyDprTransform() {
    // Siempre mantenemos el transform con DPR (NO 1,0,0,1)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function resizeCanvasToDisplaySize() {
    DPR = Math.max(1, window.devicePixelRatio || 1);

    // Tamaño visual (CSS)
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.aspectRatio = `${W} / ${H}`;

    // Buffer interno (nítido)
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);

    applyDprTransform();

    ctx.imageSmoothingEnabled = true;
  }

  resizeCanvasToDisplaySize();
  window.addEventListener("resize", resizeCanvasToDisplaySize);

  // --- Helpers ---
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // --- AUDIO (MP3) ---
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

  // SFX: instancias nuevas para disparos rápidos
  function playSfx(src, volume = 0.8) {
    if (muted) return;
    const s = new Audio(src);
    s.volume = volume;
    s.play().catch(() => {});
  }
  function playStar() { playSfx(sfxStarSrc, 0.75); }
  function playNube() { playSfx(sfxNubeSrc, 0.85); }

  // --- Imágenes locales (misma carpeta) ---
  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }

  const characters = [
    { id:"nuveciela", label:"Nuveciela", desc:"La escritora", colorA:"rgba(124,58,237,.25)", colorB:"rgba(6,182,212,.25)", initial:"N", imageSrc:"nuveciela.png" },
    { id:"ciela",     label:"Ciela",     desc:"La sensible",  colorA:"rgba(6,182,212,.25)", colorB:"rgba(251,191,36,.22)", initial:"C", imageSrc:"ciela.png" },
    { id:"lunaria",   label:"Lunaria",   desc:"La inventora", colorA:"rgba(251,191,36,.24)", colorB:"rgba(239,68,68,.18)", initial:"L", imageSrc:"lunaria.png" },
    { id:"nuve",      label:"Nuve",      desc:"La valiente",  colorA:"rgba(167,139,250,.22)", colorB:"rgba(16,185,129,.18)", initial:"N", imageSrc:"nuve.png" },
  ];

  const imageCache = new Map();
  for (const c of characters) imageCache.set(c.id, loadImage(c.imageSrc));

  let selectedCharId = null;

  // --- Menu grid (con mini-foto) ---
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

  // --- Estado del juego ---
  let running = false;
  let lastTs = 0;

  let score = 0;
  let timeLeft = 60;
  let lives = 3;

  let level = 1;
  const LEVEL_STEP = 15;
  const MAX_LEVEL = 4;

  const keys = { left:false, right:false };
  let shake = 0;

  const player = {
    x: W * 0.5,
    y: H - 70,
    r: 28,
    speed: 460,
    name: "",
    char: null,
    dragging: false,
    dragOffsetX: 0
  };

  let stars = [];
  let clouds = [];
  let particles = [];

  let starSpawnAcc = 0;
  let cloudSpawnAcc = 0;

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
      level = newLevel;
      levelHud.textContent = String(level);
      playSfx(sfxStarSrc, 0.35);
    }
  }

  function settingsForLevel(lvl) {
    return {
      starEvery: clamp(0.55 - (lvl-1)*0.08, 0.28, 0.55),
      cloudEvery: clamp(1.35 - (lvl-1)*0.22, 0.65, 1.35),
      starSpeedMin: 130 + (lvl-1)*35,
      starSpeedMax: 220 + (lvl-1)*55,
      cloudSpeedMin: 110 + (lvl-1)*30,
      cloudSpeedMax: 180 + (lvl-1)*45,
    };
  }

  function resetGame() {
    score = 0;
    timeLeft = 60;
    lives = 3;
    level = 1;

    stars = [];
    clouds = [];
    particles = [];

    lastTs = 0;
    starSpawnAcc = 0;
    cloudSpawnAcc = 0;
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

  // --- Dibujo base ---
  function drawBackground(ts) {
    // Mantener DPR SIEMPRE (esto evita que se "achique" en móvil)
    applyDprTransform();
    ctx.clearRect(0, 0, W, H);

    // miniestrellas fondo
    for (let i=0;i<18;i++){
      const x = (i * 63) % W;
      const y = ((i * 111) % 170) + 18;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.arc(x + Math.sin(ts/700+i)*5, y, 1.5, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ondas
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

  function drawStars(ts) {
    for (const s of stars) {
      const wob = Math.sin(ts/260 + s.wobble) * 8;
      ctx.fillStyle = "rgba(251,191,36,0.95)";
      drawStarShape(s.x + wob, s.y, s.r);
      ctx.fillStyle = "rgba(124,58,237,.12)";
      ctx.beginPath();
      ctx.arc(s.x + wob, s.y, s.r*1.35, 0, Math.PI*2);
      ctx.fill();
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
    const s = settingsForLevel(level);

    starSpawnAcc += dt;
    cloudSpawnAcc += dt;

    if (starSpawnAcc >= s.starEvery) { starSpawnAcc = 0; spawnStar(level); }
    if (cloudSpawnAcc >= s.cloudEvery) { cloudSpawnAcc = 0; spawnCloud(level); }

    if (!player.dragging) {
      const dir = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
      player.x += dir * player.speed * dt;
    }
    player.x = clamp(player.x, player.r + 8, W - player.r - 8);

    stars = stars.filter(st => {
      st.y += st.vy * dt;

      if (collideCircle(st.x, st.y, st.r, player.x, player.y, player.r)) {
        score += 10;
        scoreEl.textContent = String(score);
        burst(st.x, st.y);
        playStar();
        return false;
      }
      if (st.y - st.r > H + 10) return false;
      return true;
    });

    clouds = clouds.filter(cl => {
      cl.y += cl.vy * dt;

      if (collideCircle(cl.x, cl.y, cl.r, player.x, player.y, player.r)) {
        score = Math.max(0, score - 15);
        scoreEl.textContent = String(score);
        loseLife();
        return false;
      }
      if (cl.y - cl.r > H + 10) return false;
      return true;
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
    // Mantener DPR
    applyDprTransform();

    ctx.fillStyle = "rgba(255,255,255,.60)";
    ctx.fillRect(0,0,W,H);

    ctx.textAlign = "center";

    const win = (timeLeft <= 0 && lives > 0);
    const title = win ? "¡Felicitaciones!" : "Uy… esta vez no salió";
    const subtitle = win
      ? "Terminaste el juego. ¿Jugamos otra vez?"
      : "Te quedaste sin vidas. Tocá Reiniciar para jugar de nuevo.";

    ctx.fillStyle = "rgba(17,24,39,.88)";
    ctx.font = "900 34px system-ui";
    ctx.fillText(title, W/2, H/2 - 28);

    ctx.fillStyle = "rgba(17,24,39,.72)";
    ctx.font = "800 16px system-ui";
    ctx.fillText(subtitle, W/2, H/2 + 4);

    ctx.fillStyle = "rgba(17,24,39,.70)";
    ctx.font = "900 18px system-ui";
    ctx.fillText(`Puntaje final: ${score}`, W/2, H/2 + 34);
  }

  function loop(ts) {
    const dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;

    drawBackground(ts);

    // Shake: aplicar como transform adicional SIN perder DPR.
    if (shake > 0) {
      const sx = rand(-shake, shake);
      const sy = rand(-shake, shake);
      ctx.translate(sx, sy); // translate sobre el transform DPR actual (ok)
    }

    drawStars(ts);
    drawClouds(ts);
    drawParticles();
    drawPlayer();

    if (running) update(dt);
    else if (!gameWrap.hidden) drawEndOverlay();

    if (!gameWrap.hidden) requestAnimationFrame(loop);
  }

  // --- Teclado ---
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") keys.left = true;
    if (e.key === "ArrowRight") keys.right = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft") keys.left = false;
    if (e.key === "ArrowRight") keys.right = false;
  });

  // --- Touch/Pointer: arrastrar ---
  // IMPORTANTE: convertimos el punto del dedo a coordenadas base W/H
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
    player.x = p.x - player.dragOffsetX;
    player.x = clamp(player.x, player.r + 8, W - player.r - 8);
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
