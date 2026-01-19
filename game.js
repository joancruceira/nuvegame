(() => {
  "use strict";

  // =========================
  // DOM (con defensivo)
  // =========================
  const $ = (id) => document.getElementById(id);

  const menu = $("menu");
  const gameWrap = $("gameWrap");
  const canvas = $("canvas");
  const ctx = canvas?.getContext("2d", { alpha: true });

  const charGrid = $("charGrid");
  const playerNameInput = $("playerName");
  const startBtn = $("startBtn");
  const backBtn = $("backBtn");
  const muteBtn = $("muteBtn");

  const howBtn = $("howBtn");
  const helpDialog = $("helpDialog");
  const closeHelp = $("closeHelp");
  const menuNote = $("menuNote");

  const playerNameHud = $("playerNameHud");
  const charHud = $("charHud");
  const countHud = $("countHud");
  const timeHud = $("timeHud");

  const storyText = $("storyText");
  const promptLine = $("promptLine");
  const templateLine = $("templateLine");

  const undoBtn = $("undoBtn");
  const clearBtn = $("clearBtn");
  const copyBtn = $("copyBtn");
  const pdfBtn = $("pdfBtn");

  const endOverlay = $("endOverlay");
  const endStory = $("endStory");
  const endCopyBtn = $("endCopyBtn");
  const endPdfBtn = $("endPdfBtn");
  const againBtn = $("againBtn");

  if (!canvas || !ctx) {
    console.error("No se encontró #canvas o no se pudo crear el contexto 2D.");
    return;
  }

  // =========================
  // Helpers
  // =========================
  const rand = (min, max) => Math.random() * (max - min) + min;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // =========================
  // Logical size
  // =========================
  const W = 900;
  const H = 520;

  function resizeCanvasToDisplaySize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
  resizeCanvasToDisplaySize();
  window.addEventListener("resize", resizeCanvasToDisplaySize);

  // =========================
  // AUDIO
  // =========================
  const music = new Audio("fondo.mp3");
  music.loop = true;
  music.volume = 0.35;
  const sfxWordSrc = "word.mp3";
  let muted = false;

  function playMusic() {
    if (muted) return;
    if (music.paused) music.play().catch(() => {});
  }
  function stopMusic() { music.pause(); music.currentTime = 0; }
  function pauseMusic() { music.pause(); }

  function playWordSfx() {
    if (muted) return;
    const s = new Audio(sfxWordSrc);
    s.volume = 0.9;
    s.play().catch(() => {});
  }

  function syncMuteUi() {
    if (!muteBtn) return;
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.textContent = `Sonido: ${muted ? "OFF" : "ON"}`;
    if (muted) pauseMusic();
    else if (running) playMusic();
  }

  // =========================
  // Images / Characters
  // =========================
  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }

  const characters = [
    { id:"ciela",     label:"Ciela",     desc:"La sabia",      imageSrc:"ciela.png" },
    { id:"nuve",      label:"Nuve",      desc:"La tranquila",  imageSrc:"nuve.png" },
    { id:"nuveciela", label:"Nuveciela", desc:"La fuerte",     imageSrc:"nuveciela.png" },
    { id:"lunaria",   label:"Lunaria",   desc:"La inventora",  imageSrc:"lunaria.png" },
  ];

  const imageCache = new Map();
  for (const c of characters) imageCache.set(c.id, loadImage(c.imageSrc));

  let selectedCharId = null;
  let selectedCharMeta = null;
  let playerName = "";

  function renderCharacterGrid() {
    if (!charGrid) return;
    charGrid.innerHTML = "";

    for (const c of characters) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "char";
      btn.setAttribute("aria-selected", "false");

      const av = document.createElement("div");
      av.className = "avatar";
      const img = document.createElement("img");
      img.alt = c.label;
      img.src = c.imageSrc;
      img.onerror = () => { img.remove(); av.textContent = c.label.slice(0,1); };
      av.appendChild(img);

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `<div class="name">${c.label}</div><div class="desc">${c.desc}</div>`;

      btn.appendChild(av);
      btn.appendChild(meta);

      btn.addEventListener("click", () => {
        selectedCharId = c.id;
        selectedCharMeta = c;
        [...charGrid.querySelectorAll(".char")].forEach(x => x.setAttribute("aria-selected","false"));
        btn.setAttribute("aria-selected","true");
        validateStart();
      });

      charGrid.appendChild(btn);
    }
  }

  function validateStart() {
    const nameOk = ((playerNameInput?.value || "").trim().length >= 1);
    const charOk = !!selectedCharId;
    if (startBtn) startBtn.disabled = !(nameOk && charOk);
    if (menuNote) {
      menuNote.textContent = (nameOk && charOk)
        ? "Listo. Tocá “Empezar”."
        : "Elegí un personaje y escribí tu nombre.";
    }
  }
  playerNameInput?.addEventListener("input", validateStart);

  // =========================
  // Banco de palabras (más grande + más coherente)
  // En vez de “adjetivos” (problema de género), usamos “tono” (frases adverbiales).
  // =========================
  const LABEL = {
    sujeto: "Sujeto",
    verbo: "Acción",
    objeto: "Cosa",
    lugar: "Lugar",
    tono: "Tono"
  };

  const WORDBANK = {
    ciela: {
      prompt: "Arma tu historia en 30 segundos. Ciela te guía con ideas claras y pistas.",
      sujeto: [
        "Ciela", "una maestra", "una bibliotecaria", "un libro antiguo", "una pregunta", "un mapa", "un farol",
        "una brújula", "un cuaderno", "una voz", "un mensaje", "una regla secreta", "un consejo", "una señal",
        "una carta", "una llave", "un espejo", "una historia", "un silencio atento", "un reloj"
      ],
      verbo: [
        "explica", "ordena", "descifra", "observa", "elige", "recuerda", "anota", "conecta", "aclara", "resuelve",
        "enseña", "compara", "descubre", "pregunta", "comprende", "señala", "revela", "traza", "lee", "guía"
      ],
      objeto: [
        "una pista", "una idea", "una verdad", "una regla", "una respuesta", "una dirección", "un plan",
        "una palabra justa", "un secreto", "una solución", "un camino", "una señal brillante", "un mensaje corto",
        "una nota", "una historia nueva", "un paso", "un dibujo", "una promesa", "una memoria", "un detalle"
      ],
      lugar: [
        "en la biblioteca", "en el bosque", "bajo la luna", "junto al río", "en un aula secreta",
        "en la cima de una colina", "entre hojas doradas", "en un pasillo silencioso", "al pie de un árbol",
        "detrás de una puerta", "en un claro", "sobre un puente", "en un rincón tibio", "en una plaza vacía"
      ],
      tono: [
        "con calma", "con paciencia", "con precisión", "sin apuro", "con ternura", "con atención",
        "como si fuera un acertijo", "como si fuera un juego", "con un brillo en los ojos", "en voz bajita",
        "sin perder el hilo", "mirando de cerca", "con cuidado", "paso a paso"
      ],
      templates: [
        ["sujeto","verbo","objeto","lugar","tono"],
        ["lugar","sujeto","verbo","objeto","tono"],
        ["sujeto","verbo","objeto","tono","lugar"]
      ]
    },

    nuve: {
      prompt: "Arma tu historia en 30 segundos. Nuve trae calma, luz y suavidad.",
      sujeto: [
        "Nuve", "una nube", "una brisa", "un susurro", "un abrazo", "una estrella lenta", "una manta",
        "un té", "una canción", "una pluma", "una tarde", "un rayo suave", "un aroma", "una sonrisa",
        "un viento", "una ola", "un jardín", "un silencio", "un cielo claro", "un sueño"
      ],
      verbo: [
        "flota", "respira", "acompaña", "calma", "espera", "escucha", "sonríe", "abraza", "protege", "suaviza",
        "ilumina", "descansa", "susurra", "arrulla", "sigue", "se desliza", "se queda", "se acomoda", "late", "brilla"
      ],
      objeto: [
        "una paz", "una luz tibia", "una promesa", "una melodía", "un momento", "un secreto bueno",
        "una palabra suave", "un sueño corto", "una idea bonita", "un recuerdo", "una chispa", "una caricia",
        "un refugio", "una risa", "un color", "una señal amable", "un camino", "una nube pequeñita"
      ],
      lugar: [
        "en la tarde", "en el cielo", "en un jardín", "cerca del mar", "bajo una manta",
        "en una siesta", "en una ventana", "entre nubes", "en una vereda", "sobre una colina",
        "en una hamaca", "junto a una fogata", "en un patio", "en un balcón", "en un rincón de sol"
      ],
      tono: [
        "despacito", "con dulzura", "sin hacer ruido", "con una sonrisa", "con calma", "como una canción",
        "como una brisa", "sin apuro", "con ternura", "casi en secreto", "con luz", "con cariño",
        "respirando hondo", "dejando que pase"
      ],
      templates: [
        ["sujeto","verbo","objeto","lugar","tono"],
        ["tono","sujeto","verbo","objeto","lugar"],
        ["lugar","tono","sujeto","verbo","objeto"]
      ]
    },

    nuveciela: {
      prompt: "Arma tu historia en 30 segundos. Nuveciela es fuerza, decisión y corazón.",
      sujeto: [
        "Nuveciela", "una guardiana", "una tormenta", "una amiga leal", "un escudo", "una montaña",
        "un juramento", "una chispa valiente", "una puerta pesada", "una voz firme", "un faro",
        "un paso gigante", "un corazón", "una bandera", "una cuerda", "un trueno", "una llama",
        "una promesa", "un puente", "una elección"
      ],
      verbo: [
        "enfrenta", "protege", "resiste", "levanta", "decide", "defiende", "salta", "corre", "rompe", "abre",
        "sostiene", "avanza", "se planta", "guarda", "salva", "empuja", "acompaña", "cambia", "grita", "abraza"
      ],
      objeto: [
        "un peligro", "una llave", "un mensaje", "un camino difícil", "una luz fuerte", "una idea clara",
        "una salida", "una victoria", "una verdad", "un secreto", "un plan", "una señal", "un puente nuevo",
        "una oportunidad", "una historia valiente", "un paso adelante", "una decisión"
      ],
      lugar: [
        "en la noche", "bajo la lluvia", "en el bosque", "en la cima", "sobre un puente",
        "en una plaza vacía", "en una puerta vieja", "entre sombras", "en un camino de piedras",
        "junto a un faro", "en un pasillo oscuro", "en una escalera", "frente a un espejo"
      ],
      tono: [
        "con valentía", "sin dudar", "con el corazón firme", "a toda velocidad", "con fuerza",
        "como un trueno", "sin mirar atrás", "con una risa enorme", "con decisión", "sin miedo",
        "con una chispa", "con cuidado pero firme", "mirando al frente"
      ],
      templates: [
        ["sujeto","verbo","objeto","lugar","tono"],
        ["tono","sujeto","verbo","objeto","lugar"],
        ["sujeto","verbo","lugar","objeto","tono"]
      ]
    },

    lunaria: {
      prompt: "Arma tu historia en 30 segundos. Lunaria inventa cosas raras y geniales.",
      sujeto: [
        "Lunaria", "un robot", "un engranaje", "una antena", "un telescopio", "una máquina",
        "un rayo", "un dron", "un chip", "una palanca", "un imán", "un botón misterioso",
        "una lámpara", "un cable", "una rueda", "un plano", "un motor", "un casco", "una alarma", "un láser"
      ],
      verbo: [
        "inventa", "construye", "mezcla", "prueba", "enciende", "calibra", "programa", "transforma", "ajusta", "conecta",
        "desarma", "arma", "tunea", "repara", "suelta", "activa", "descarga", "cambia", "explora", "experimenta"
      ],
      objeto: [
        "un prototipo", "una fórmula", "un truco", "un mapa holográfico", "una chispa azul",
        "un plan secreto", "un mensaje codificado", "una idea imposible", "una llave magnética",
        "un motor pequeño", "un casco brillante", "una nube eléctrica", "un cristal", "una pantalla",
        "un interruptor", "una brújula rara", "un portal", "un dron curioso", "un invento nuevo"
      ],
      lugar: [
        "en el taller", "en un laboratorio", "en la luna", "en un garaje secreto", "en una cueva eléctrica",
        "en una mesa llena de tornillos", "bajo una luz violeta", "entre cables", "en una sala de pruebas",
        "en un pasillo futurista", "en una torre", "dentro de una caja", "sobre una mesa", "en una azotea"
      ],
      tono: [
        "con curiosidad", "como una científica", "con una risa rara", "a toda velocidad", "con brillo en los ojos",
        "sin parar", "con cuidado", "probando otra vez", "como si fuera magia", "con un click", "con paciencia",
        "con un zumbido", "con una idea loca"
      ],
      templates: [
        ["sujeto","verbo","objeto","lugar","tono"],
        ["lugar","sujeto","verbo","objeto","tono"],
        ["tono","sujeto","verbo","lugar","objeto"]
      ]
    }
  };

  // =========================
  // Template / coherencia
  // =========================
  function pickTemplate(charId) {
    const tpls = WORDBANK[charId].templates;
    return pick(tpls);
  }

  let TEMPLATE = ["sujeto","verbo","objeto","lugar","tono"];
  function expectedKind() { return TEMPLATE[templateIndex]; }

  function templateText() {
    const parts = TEMPLATE.map((k, i) => (i === templateIndex ? `→ ${LABEL[k]}` : LABEL[k]));
    return parts.join("  •  ");
  }

  // =========================
  // Anti-repetición (bolsas + recientes)
  // =========================
  const RECENT_LIMIT = 10;
  let recentTexts = [];

  function pushRecent(t) {
    recentTexts.push(t);
    if (recentTexts.length > RECENT_LIMIT) recentTexts.shift();
  }
  function isRecent(t) {
    return recentTexts.includes(t);
  }

  let bags = null;

  function rebuildBags(charId) {
    const b = WORDBANK[charId];
    bags = {
      sujeto: shuffle([...b.sujeto]),
      verbo: shuffle([...b.verbo]),
      objeto: shuffle([...b.objeto]),
      lugar: shuffle([...b.lugar]),
      tono: shuffle([...b.tono]),
    };
  }

  function takeFromBag(kind) {
    if (!bags || !bags[kind]) return null;

    // si se vació, reconstruimos SOLO ese kind remezclado
    if (bags[kind].length === 0) {
      bags[kind] = shuffle([...WORDBANK[selectedCharId][kind]]);
    }

    // buscamos algo que no sea “reciente” (hasta N intentos)
    for (let tries = 0; tries < 8; tries++) {
      if (bags[kind].length === 0) break;
      const t = bags[kind].pop();
      if (!isRecent(t)) return t;
    }

    // si todo era reciente, devolvemos igual (para no bloquear spawns)
    return bags[kind].pop() || null;
  }

  // =========================
  // Story (frases completas)
  // =========================
  let storySentences = [];
  let currentSentence = [];
  let templateIndex = 0;
  let caughtCount = 0;

  function flushSentenceIfComplete() {
    if (templateIndex >= TEMPLATE.length) {
      const s = currentSentence.join(" ").trim();
      if (s) storySentences.push(s);
      currentSentence = [];
      templateIndex = 0;

      // variación: cambiar plantilla al cerrar frase
      TEMPLATE = pickTemplate(selectedCharId);
      if (templateLine) templateLine.textContent = templateText();
    }
  }

  function addWordToStory(text) {
    if (!text) return;

    // Capitalizar si es inicio de frase
    if (currentSentence.length === 0) {
      currentSentence.push(text.charAt(0).toUpperCase() + text.slice(1));
    } else {
      currentSentence.push(text);
    }

    caughtCount += 1;
    templateIndex += 1;

    pushRecent(text);
    flushSentenceIfComplete();
    refreshStoryText();
  }

  function getStoryString() {
    const lines = [...storySentences];
    if (currentSentence.length) lines.push(currentSentence.join(" ").trim());

    return lines
      .filter(Boolean)
      .map(s => /[.!?]$/.test(s) ? s : (s + "."))
      .join(" ");
  }

  function refreshStoryText() {
    const t = getStoryString().trim();
    if (storyText) storyText.textContent = t.length ? t : "Mové tu personaje para atrapar palabras…";
    if (endStory) endStory.textContent = t.length ? t : "Todavía no atrapaste palabras.";
    if (countHud) countHud.textContent = String(caughtCount);
    if (templateLine) templateLine.textContent = templateText();
  }

  function undoWord() {
    if (currentSentence.length > 0) {
      const removed = currentSentence.pop();
      // retrocede templateIndex con cuidado
      templateIndex = Math.max(0, templateIndex - 1);
      if (removed) {
        caughtCount = Math.max(0, caughtCount - 1);
      }
    } else if (storySentences.length > 0) {
      const last = storySentences.pop().replace(/[.!?]$/,"");
      const parts = last.split(" ").filter(Boolean);
      currentSentence = parts;
      templateIndex = clamp(currentSentence.length, 0, TEMPLATE.length);
      if (currentSentence.length > 0) {
        currentSentence.pop();
        templateIndex = Math.max(0, templateIndex - 1);
        caughtCount = Math.max(0, caughtCount - 1);
      }
    }
    refreshStoryText();
  }

  function clearStory() {
    storySentences = [];
    currentSentence = [];
    templateIndex = 0;
    caughtCount = 0;
    recentTexts = [];
    refreshStoryText();
  }

  async function copyStory() {
    const t = getStoryString().trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      if (copyBtn) {
        copyBtn.textContent = "Copiado";
        setTimeout(() => (copyBtn.textContent = "Copiar"), 900);
      }
    } catch {
      if (copyBtn) {
        copyBtn.textContent = "Listo";
        setTimeout(() => (copyBtn.textContent = "Copiar"), 900);
      }
    }
  }

  async function exportPdf() {
    const story = getStoryString().trim();
    if (!story) return;

    const jspdf = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
    if (!jspdf) {
      alert("No se cargó jsPDF. Verificá que el script CDN esté en el HTML.");
      return;
    }

    const doc = new jspdf({ unit: "pt", format: "a4" });
    const margin = 48;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Nuvecielas — Bosque de las Palabras", margin, y);
    y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`Jugador: ${playerName || "—"}   |   Personaje: ${selectedCharMeta?.label || "—"} — ${selectedCharMeta?.desc || ""}`, margin, y);
    y += 18;

    const img = imageCache.get(selectedCharId);
    const ready = img && img.complete && img.naturalWidth > 0;

    if (ready) {
      const oc = document.createElement("canvas");
      const s = 260;
      oc.width = s; oc.height = s;
      const octx = oc.getContext("2d");

      octx.save();
      octx.beginPath();
      octx.arc(s/2, s/2, s/2, 0, Math.PI*2);
      octx.clip();

      const scale = Math.max(s / img.naturalWidth, s / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      octx.drawImage(img, s/2 - dw/2, s/2 - dh/2, dw, dh);
      octx.restore();

      const dataUrl = oc.toDataURL("image/png");
      doc.addImage(dataUrl, "PNG", 360, margin, 180, 180);
    }

    y += 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Historia", margin, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);

    const maxWidth = 500;
    const lines = doc.splitTextToSize(story, maxWidth);
    doc.text(lines, margin, y);

    doc.save("nuvecielas-historia.pdf");
  }

  // =========================
  // Player movement + jump
  // =========================
  const keys = { left:false, right:false };

  const player = {
    x: W * 0.5,
    baseY: H - 78,
    y: H - 78,
    r: 46,
    speed: 560,
    dragging: false,
    dragOffsetX: 0,
    jumpV: 0
  };

  function jump() { player.jumpV = -320; }

  function updatePlayer(dt) {
    if (!player.dragging) {
      const dir = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
      player.x += dir * player.speed * dt;
    }
    player.x = clamp(player.x, player.r + 10, W - player.r - 10);

    player.jumpV += 1200 * dt;
    player.y += player.jumpV * dt;
    if (player.y > player.baseY) {
      player.y = player.baseY;
      player.jumpV = 0;
    }
  }

  function drawPlayer(ts) {
    const img = imageCache.get(selectedCharId);
    const ready = img && img.complete && img.naturalWidth > 0;

    // sombra
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.ellipse(player.x, player.baseY + player.r + 16, player.r * 1.08, player.r * 0.44, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // halo
    const pulse = 1 + Math.sin(ts / 520) * 0.035;
    ctx.fillStyle = "rgba(255, 90, 180, .16)";
    ctx.beginPath();
    ctx.arc(player.x, player.y, (player.r + 10) * pulse, 0, Math.PI*2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI*2);
    ctx.clip();

    if (ready) {
      const size = player.r * 2;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = Math.max(size / iw, size / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, player.x - dw/2, player.y - dh/2, dw, dh);
    } else {
      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.fillRect(player.x-player.r, player.y-player.r, player.r*2, player.r*2);
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(0,0,0,.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI*2);
    ctx.stroke();
  }

  function canvasPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) * (W / rect.width);
    const y = (evt.clientY - rect.top) * (H / rect.height);
    return { x, y };
  }
  function hitPlayer(px, py) {
    const dx = px - player.x;
    const dy = py - player.y;
    return (dx*dx + dy*dy) <= (player.r * player.r);
  }

  canvas.addEventListener("pointerdown", (evt) => {
    if (gameWrap?.hidden || !running) return;
    const p = canvasPoint(evt);
    canvas.setPointerCapture(evt.pointerId);
    if (hitPlayer(p.x, p.y)) {
      player.dragging = true;
      player.dragOffsetX = p.x - player.x;
    }
  });
  canvas.addEventListener("pointermove", (evt) => {
    if (!player.dragging || !running) return;
    const p = canvasPoint(evt);
    player.x = p.x - player.dragOffsetX;
    player.x = clamp(player.x, player.r + 10, W - player.r - 10);
  });
  canvas.addEventListener("pointerup", () => { player.dragging = false; });
  canvas.addEventListener("pointercancel", () => { player.dragging = false; });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") keys.left = true;
    if (e.key === "ArrowRight") keys.right = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft") keys.left = false;
    if (e.key === "ArrowRight") keys.right = false;
  });

  // =========================
  // Words falling (más variedad + menos repetición)
  // =========================
  function roundRect(c, x, y, w, h, r, fill, stroke) {
    const rr = Math.min(r, w/2, h/2);
    c.beginPath();
    c.moveTo(x+rr, y);
    c.arcTo(x+w, y, x+w, y+h, rr);
    c.arcTo(x+w, y+h, x, y+h, rr);
    c.arcTo(x, y+h, x, y, rr);
    c.arcTo(x, y, x+w, y, rr);
    c.closePath();
    if (fill) c.fill();
    if (stroke) c.stroke();
  }

  let words = [];
  let spawnAcc = 0;

  function isImportant(kind) {
    // “objeto” y “tono” resaltan más (tienen más “sabor” narrativo)
    return kind === "objeto" || kind === "tono";
  }

  function nextWordItem() {
    const need = expectedKind();

    // 75%: la que toca (para coherencia)
    // 25%: otra al azar (para sorpresa)
    const kind = (Math.random() < 0.75) ? need : pick(["sujeto","verbo","objeto","lugar","tono"]);
    const text = takeFromBag(kind);
    if (!text) return null;
    return { text, kind, important: isImportant(kind) };
  }

  function spawnWord() {
    const item = nextWordItem();
    if (!item) return;

    ctx.font = "900 18px system-ui";
    const padX = 14;
    const w = ctx.measureText(item.text).width + padX * 2;
    const h = 38;

    const x = rand(20, W - w - 20);
    const y = -h - rand(10, 80);

    words.push({
      text: item.text,
      kind: item.kind,
      important: item.important,
      x, y, w, h,
      vy: rand(125, 220),
      wob: rand(0, Math.PI * 2),
    });
  }

  function drawWordBubble(b, ts) {
    const wobX = Math.sin(ts/420 + b.wob) * 3;

    const baseX = b.x + wobX;

    if (b.important) {
      ctx.save();
      ctx.shadowColor = "rgba(255, 215, 90, .95)";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "rgba(255,255,255,.97)";
      roundRect(ctx, baseX, b.y, b.w, b.h, 16, true, false);
      ctx.restore();

      ctx.strokeStyle = "rgba(255, 170, 60, .85)";
      ctx.lineWidth = 2.2;
      roundRect(ctx, baseX, b.y, b.w, b.h, 16, false, true);
    } else {
      ctx.fillStyle = "rgba(255,255,255,.92)";
      roundRect(ctx, baseX, b.y, b.w, b.h, 16, true, false);
      ctx.strokeStyle = "rgba(0,0,0,.08)";
      ctx.lineWidth = 1;
      roundRect(ctx, baseX, b.y, b.w, b.h, 16, false, true);
    }

    // etiqueta
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(124,58,237,.85)";
    ctx.font = "900 11px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(LABEL[b.kind].toUpperCase(), baseX + 12, b.y - 4);
    ctx.globalAlpha = 1;

    // texto
    ctx.fillStyle = "rgba(31,36,48,.95)";
    ctx.font = "900 18px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(b.text, baseX + 14, b.y + b.h/2);
  }

  function collideCircleRect(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx*dx + dy*dy) <= (cr*cr);
  }

  // =========================
  // Background (más vistoso)
  // =========================
  function drawBackground(ts) {
    ctx.clearRect(0,0,W,H);

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "rgba(255, 230, 250, 1)");
    g.addColorStop(0.35, "rgba(210, 245, 255, 1)");
    g.addColorStop(0.7, "rgba(255, 250, 210, 1)");
    g.addColorStop(1, "rgba(230, 255, 220, 1)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    // capas “bosque”
    ctx.fillStyle = "rgba(124,58,237,.12)";
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - 120);
    for (let x=0; x<=W; x+=18){
      const y = H - 120 + Math.sin((x/115) + ts/900) * 10;
      ctx.lineTo(x,y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(6,182,212,.10)";
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - 80);
    for (let x=0; x<=W; x+=18){
      const y = H - 80 + Math.sin((x/95) + ts/820 + 1.4) * 8;
      ctx.lineTo(x,y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // partículas
    for (let i=0;i<18;i++){
      const x = (i * 71 + 30) % W;
      const y = ((i * 97) % 210) + 25;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.arc(x + Math.sin(ts/700+i)*5, y + Math.cos(ts/800+i)*3, 1.6, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // UI superior (buscá ahora)
    ctx.fillStyle = "rgba(17,24,39,.70)";
    ctx.font = "900 13px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`Buscá ahora: ${LABEL[expectedKind()]}`, 16, 14);
  }

  // =========================
  // Game state
  // =========================
  let running = false;
  let lastTs = 0;

  const GAME_SECONDS = 30;
  let timeLeft = GAME_SECONDS;

  function setHUD() {
    if (playerNameHud) playerNameHud.textContent = playerName || "—";
    if (charHud) charHud.textContent = selectedCharMeta ? `${selectedCharMeta.label} — ${selectedCharMeta.desc}` : "—";
    if (countHud) countHud.textContent = String(caughtCount);
    if (timeHud) timeHud.textContent = String(Math.ceil(timeLeft));
  }

  function resetGameState() {
    clearStory();

    words = [];
    spawnAcc = 0;
    lastTs = 0;

    player.x = W * 0.5;
    player.y = player.baseY;
    player.jumpV = 0;
    player.dragging = false;

    timeLeft = GAME_SECONDS;

    // plantilla inicial
    TEMPLATE = pickTemplate(selectedCharId);
    templateIndex = 0;

    setHUD();

    if (endOverlay) endOverlay.hidden = true;
  }

  function endGame() {
    running = false;
    stopMusic();
    if (endOverlay) endOverlay.hidden = false;
    setHUD();
    refreshStoryText();
  }

  function update(dt) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      setHUD();
      endGame();
      return;
    }

    setHUD();
    updatePlayer(dt);

    spawnAcc += dt;

    // spawneo más “rico”:
    // - genera más al inicio
    // - mantiene un piso de palabras en pantalla
    const desired = 12;
    if (words.length < desired && spawnAcc > 0.18) {
      spawnAcc = 0;
      spawnWord();
      if (Math.random() < 0.35) spawnWord(); // a veces doble para variedad
    } else if (spawnAcc > 0.45) {
      spawnAcc = 0;
      if (words.length < 16) spawnWord();
    }

    for (const w of words) w.y += w.vy * dt;

    words = words.filter(w => {
      if (w.y > H + 60) return false;
      const hit = collideCircleRect(player.x, player.y, player.r, w.x, w.y, w.w, w.h);
      if (hit) {
        addWordToStory(w.text);
        playWordSfx();
        jump();
        return false;
      }
      return true;
    });
  }

  function render(ts) {
    drawBackground(ts);
    for (const w of words) drawWordBubble(w, ts);
    drawPlayer(ts);
  }

  function loop(ts) {
    const dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;

    if (running) update(dt);
    render(ts);

    if (!gameWrap?.hidden) requestAnimationFrame(loop);
  }

  // =========================
  // Flow
  // =========================
  function startGame() {
    playerName = (playerNameInput?.value || "").trim().slice(0, 18);
    selectedCharMeta = characters.find(c => c.id === selectedCharId);

    if (!selectedCharMeta || !playerName) {
      validateStart();
      return;
    }

    // prompt + bolsas
    if (promptLine) promptLine.textContent = WORDBANK[selectedCharId].prompt;

    rebuildBags(selectedCharId);

    resetGameState();

    // spawn inicial generoso
    for (let i=0;i<12;i++) spawnWord();

    if (templateLine) templateLine.textContent = templateText();

    menu.hidden = true;
    gameWrap.hidden = false;
    running = true;

    playMusic();
    requestAnimationFrame(loop);
  }

  function backToMenu() {
    running = false;
    stopMusic();
    gameWrap.hidden = true;
    menu.hidden = false;
    if (endOverlay) endOverlay.hidden = true;

    if (playerNameHud) playerNameHud.textContent = "—";
    if (charHud) charHud.textContent = "—";
    if (countHud) countHud.textContent = "0";
    if (timeHud) timeHud.textContent = String(GAME_SECONDS);
  }

  function playAgain() {
    resetGameState();
    for (let i=0;i<12;i++) spawnWord();
    running = true;
    playMusic();
  }

  // =========================
  // UI
  // =========================
  startBtn?.addEventListener("click", startGame);
  backBtn?.addEventListener("click", backToMenu);

  howBtn?.addEventListener("click", () => helpDialog?.showModal());
  closeHelp?.addEventListener("click", () => helpDialog?.close());

  undoBtn?.addEventListener("click", undoWord);
  clearBtn?.addEventListener("click", clearStory);
  copyBtn?.addEventListener("click", copyStory);
  pdfBtn?.addEventListener("click", exportPdf);

  endCopyBtn?.addEventListener("click", copyStory);
  endPdfBtn?.addEventListener("click", exportPdf);
  againBtn?.addEventListener("click", playAgain);

  muteBtn?.addEventListener("click", () => {
    muted = !muted;
    syncMuteUi();
  });

  // desbloqueo audio en móviles
  window.addEventListener("pointerdown", () => {
    if (!muted && running) playMusic();
  }, { once: true });

  // =========================
  // Init
  // =========================
  renderCharacterGrid();
  validateStart();
  syncMuteUi();
  refreshStoryText();
  if (timeHud) timeHud.textContent = String(GAME_SECONDS);

  menu.hidden = false;
  gameWrap.hidden = true;
  if (endOverlay) endOverlay.hidden = true;
})();
