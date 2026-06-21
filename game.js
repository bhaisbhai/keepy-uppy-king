(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = 230;
  const PLAYER_Y = 216;

  const TEAM_FLAGS = [
    { id: 'ENG', name: 'England', colours: ['#ffffff', '#d91e36'] },
    { id: 'BRA', name: 'Brazil', colours: ['#139447', '#ffd43b', '#2557d6'] },
    { id: 'ARG', name: 'Argentina', colours: ['#75aadb', '#ffffff', '#f6c945'] },
    { id: 'JPN', name: 'Japan', colours: ['#ffffff', '#d91e36'] },
    { id: 'GER', name: 'Germany', colours: ['#111111', '#dd2323', '#f2c230'] },
    { id: 'FRA', name: 'France', colours: ['#123cce', '#ffffff', '#e63232'] }
  ];

  const BALL_SKINS = [
    { id: 'classic', name: 'Classic', cost: 0, a: '#ffffff', b: '#101010', unlock: 'FREE' },
    { id: 'gold', name: 'Golden', cost: 60, a: '#ffd43b', b: '#7c4a03', unlock: '60 COINS' },
    { id: 'neon', name: 'Neon', cost: 120, a: '#41f8ff', b: '#ff4fd8', unlock: '120 COINS' },
    { id: 'lava', name: 'Lava', cost: 180, a: '#ff6b2b', b: '#2b0b00', unlock: '180 COINS' }
  ];

  const dailyMatches = [
    ['England', 'Ghana'], ['Brazil', 'Morocco'], ['Argentina', 'Austria'],
    ['Japan', 'Sweden'], ['Portugal', 'Colombia'], ['France', 'Norway'],
    ['Mexico', 'South Korea'], ['Germany', 'Ivory Coast']
  ];

  const storageKey = 'keepy-uppy-king-v3';
  const data = loadData();

  let state = 'menu';
  let mode = 'classic';
  let clicks = [];
  let keys = { left: false, right: false };
  let last = performance.now();
  let shake = 0;
  let particles = [];
  let floatTexts = [];
  let unlockedMessage = '';
  let unlockedTimer = 0;

  let player, ball, score, streak, bestRunCombo, perfects, level, gameTimer, earnedCoins, dailyComplete;

  function loadData() {
    const base = {
      best: 0,
      coins: 0,
      selectedTeam: 'ENG',
      selectedBall: 'classic',
      unlockedBalls: ['classic'],
      daily: {}
    };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      return { ...base, ...(saved || {}), unlockedBalls: saved?.unlockedBalls || ['classic'], daily: saved?.daily || {} };
    } catch (_) {
      return base;
    }
  }

  function saveData() {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function getDailyChallenge() {
    const key = todayKey();
    const h = hashString(key);
    const match = dailyMatches[h % dailyMatches.length];
    return {
      key,
      match,
      target: 35 + (h % 26),
      best: data.daily[key]?.best || 0,
      complete: !!data.daily[key]?.complete
    };
  }

  function selectedSkin() {
    return BALL_SKINS.find(s => s.id === data.selectedBall) || BALL_SKINS[0];
  }

  function selectedTeam() {
    return TEAM_FLAGS.find(t => t.id === data.selectedTeam) || TEAM_FLAGS[0];
  }

  function resetGame(nextMode = 'classic') {
    mode = nextMode;
    state = 'playing';
    score = 0;
    streak = 0;
    bestRunCombo = 1;
    perfects = 0;
    level = 1;
    gameTimer = 0;
    earnedCoins = 0;
    dailyComplete = false;
    unlockedMessage = '';
    player = { x: W / 2, y: PLAYER_Y, leg: 0, face: 1, shuffle: 0 };
    ball = { x: W / 2 + 4, y: 88, vx: 18, vy: 15, r: 7, spin: 0 };
    particles = [];
    floatTexts = [];
    shake = 0;
  }

  function gameOver() {
    state = 'gameover';
    const oldBest = data.best;
    data.best = Math.max(data.best, score);
    earnedCoins = Math.max(1, Math.floor(score / 5) + perfects);
    data.coins += earnedCoins;

    if (mode === 'daily') {
      const d = getDailyChallenge();
      const existing = data.daily[d.key] || { best: 0, complete: false };
      existing.best = Math.max(existing.best || 0, score);
      existing.complete = existing.complete || score >= d.target;
      data.daily[d.key] = existing;
    }

    if (score > oldBest) addFloatText('NEW BEST!', W / 2, 76, '#ffd43b');
    saveData();
  }

  function tryKick() {
    if (state !== 'playing') return;

    const footY = PLAYER_Y - 16;
    const dy = Math.abs(ball.y - footY);
    const dx = Math.abs(ball.x - player.x);
    const fallingEnough = ball.vy > -120;
    const canKick = dy < 34 && dx < 39 && fallingEnough;

    if (!canKick) {
      addFloatText(ball.y < footY ? 'TOO EARLY!' : 'REACH!', player.x, PLAYER_Y - 50, '#ff6b6b');
      shake = Math.max(shake, 2);
      return;
    }

    const perfect = dy < 8 && dx < 18 && ball.vy > 0;
    const combo = getCombo();
    const base = perfect ? 3 : 1;
    const gained = base * combo;
    score += gained;
    streak += 1;
    bestRunCombo = Math.max(bestRunCombo, combo);
    level = 1 + Math.floor(score / 10);
    if (perfect) perfects += 1;

    const side = Math.sign(ball.x - player.x) || (Math.random() > 0.5 ? 1 : -1);
    const chaos = Math.min(70, level * 4);
    ball.vy = perfect ? -242 - Math.min(38, level * 2) : -218 - Math.min(28, level * 1.6);
    ball.vx += side * (8 + Math.random() * 12) + (Math.random() - 0.5) * chaos;
    ball.vx = clamp(ball.vx, -125 - level * 3, 125 + level * 3);
    ball.y = Math.min(ball.y, footY - 1);
    player.leg = 8;
    player.face = side;
    shake = perfect ? 5 : 2;

    if (perfect) {
      addFloatText(`PERFECT +${gained}`, ball.x, ball.y - 8, '#65ff7a');
      burst(ball.x, ball.y, '#65ff7a', 12);
    } else {
      addFloatText(`+${gained}`, ball.x, ball.y - 8, '#ffffff');
      burst(ball.x, ball.y, '#ffd43b', 6);
    }

    const d = getDailyChallenge();
    if (mode === 'daily' && score >= d.target && !dailyComplete) {
      dailyComplete = true;
      addFloatText('DAILY DONE!', W / 2, 92, '#41f8ff');
      burst(W / 2, 100, '#41f8ff', 30);
    }
  }

  function getCombo() {
    return Math.min(9, 1 + Math.floor(streak / 10));
  }

  function burst(x, y, colour, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 100,
        vy: (Math.random() - 0.8) * 95,
        life: 0.45 + Math.random() * 0.35,
        colour
      });
    }
  }

  function addFloatText(text, x, y, colour) {
    floatTexts.push({ text, x, y, colour, life: 0.8 });
  }

  function update(dt) {
    if (unlockedTimer > 0) unlockedTimer -= dt;
    updateEffects(dt);
    if (state !== 'playing') return;

    gameTimer += dt;
    if (shake > 0) shake -= dt * 12;
    if (player.leg > 0) player.leg -= dt * 16;

    const manual = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    player.x += manual * 125 * dt;
    const autoSpeed = Math.max(48, 96 - level * 2.2);
    const toBall = clamp(ball.x - player.x, -1, 1);
    player.x += toBall * autoSpeed * dt;
    player.x = clamp(player.x, 44, W - 44);
    player.shuffle += dt * (6 + level * 0.3);

    const gravity = 390 + level * 18;
    ball.vy += gravity * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spin += ball.vx * dt * 0.04;

    const airDrag = 0.994 - Math.min(0.003, level * 0.00012);
    ball.vx *= airDrag;

    if (ball.x < 18) { ball.x = 18; ball.vx = Math.abs(ball.vx) * 0.82; }
    if (ball.x > W - 18) { ball.x = W - 18; ball.vx = -Math.abs(ball.vx) * 0.82; }

    if (ball.y + ball.r >= GROUND_Y) {
      ball.y = GROUND_Y - ball.r;
      burst(ball.x, ball.y, '#ff4b4b', 18);
      gameOver();
    }
  }

  function updateEffects(dt) {
    particles.forEach(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 130 * dt; });
    particles = particles.filter(p => p.life > 0);
    floatTexts.forEach(t => { t.life -= dt; t.y -= 24 * dt; });
    floatTexts = floatTexts.filter(t => t.life > 0);
  }

  function draw() {
    clicks = [];
    ctx.save();
    ctx.translate(Math.round((Math.random() - 0.5) * Math.max(0, shake)), Math.round((Math.random() - 0.5) * Math.max(0, shake)));

    drawBackground();
    if (state === 'menu') drawMenu();
    if (state === 'shop') drawShop();
    if (state === 'playing') drawPlaying();
    if (state === 'gameover') drawPlaying(true), drawGameOver();

    drawEffects();
    if (unlockedTimer > 0) drawToast(unlockedMessage);
    ctx.restore();
  }

  function drawBackground() {
    // sky
    ctx.fillStyle = '#07122f';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      const x = (i * 73 + 17) % W;
      const y = (i * 31 + 11) % 100;
      ctx.fillStyle = ['#ffd43b', '#ff5e42', '#41f8ff', '#65ff7a'][i % 4];
      ctx.fillRect(x, y, 2, 2);
    }

    // floodlights
    drawFloodlight(92, 80);
    drawFloodlight(385, 78);

    // crowd
    ctx.fillStyle = '#182044';
    ctx.fillRect(0, 88, W, 68);
    for (let y = 94; y < 154; y += 5) {
      for (let x = 0; x < W; x += 5) {
        const n = (x * 13 + y * 7) % 8;
        ctx.fillStyle = ['#244a8f', '#ef4444', '#facc15', '#22c55e', '#f5cda6', '#e879f9', '#ffffff', '#38bdf8'][n];
        ctx.fillRect(x, y, 3, 3);
      }
    }

    // banner boards
    const banners = [
      ['PLAY EVERY DAY!', '#2563eb'], ['GOAL!', '#dc2626'], ['WORLD CUP', '#1d4ed8'],
      ['FOOTBALL IS FUN!', '#15803d'], ['YOU CAN DO IT!', '#f59e0b']
    ];
    let bx = 0;
    banners.forEach(([text, colour], i) => {
      const bw = i === 2 ? 110 : 92;
      ctx.fillStyle = colour;
      ctx.fillRect(bx, 152, bw, 17);
      ctx.fillStyle = '#ffffff';
      pixelText(text, bx + 7, 164, 7);
      bx += bw;
    });

    // pitch
    ctx.fillStyle = '#2f9e28';
    ctx.fillRect(0, 169, W, H - 169);
    for (let x = -40; x < W; x += 54) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.beginPath();
      ctx.moveTo(x, 169);
      ctx.lineTo(x + 35, 169);
      ctx.lineTo(x + 78, H);
      ctx.lineTo(x + 28, H);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, 229, 75, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2, 169); ctx.lineTo(W / 2, H); ctx.stroke();
  }

  function drawFloodlight(x, y) {
    ctx.fillStyle = 'rgba(255,255,255,.17)';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - 38, 168); ctx.lineTo(x + 38, 168); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#dbeafe';
    for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 4; xx++) ctx.fillRect(x + xx * 5, y + yy * 5, 4, 4);
  }

  function drawPlaying(isFrozen = false) {
    drawHud();
    drawPlayer(player.x, player.y, selectedTeam());
    drawBall(ball.x, ball.y, selectedSkin());
    drawKickZone();

    if (!isFrozen) {
      const hint = streak === 0 ? 'TAP WHEN THE BALL REACHES YOUR FOOT!' : 'KEEP IT UP!';
      pixelText(hint, W / 2 - textWidth(hint, 7) / 2, 259, 7, '#ffffff');
    }
  }

  function drawHud() {
    panel(10, 10, 112, 45);
    pixelText('SCORE', 18, 25, 8);
    pixelText(String(score).padStart(3, '0'), 68, 39, 15, '#ffd43b');

    panel(132, 10, 90, 45);
    pixelText('BEST', 142, 25, 8);
    pixelText(String(data.best).padStart(3, '0'), 180, 39, 12, '#ffd43b');

    panel(232, 10, 98, 45);
    pixelText('COMBO', 242, 25, 8, '#ffd43b');
    pixelText('x' + getCombo(), 286, 43, 16, '#ff4fd8');

    panel(340, 10, 130, 45);
    pixelText(mode === 'daily' ? 'DAILY' : 'CLASSIC', 350, 25, 8, '#41f8ff');
    pixelText('LVL ' + level, 350, 43, 10, '#ffffff');

    if (mode === 'daily') {
      const d = getDailyChallenge();
      const barW = 76;
      ctx.fillStyle = '#111827'; ctx.fillRect(385, 34, barW, 7);
      ctx.fillStyle = score >= d.target ? '#65ff7a' : '#ffd43b';
      ctx.fillRect(385, 34, Math.min(barW, Math.floor(barW * score / d.target)), 7);
      pixelText(`${score}/${d.target}`, 390, 50, 6, '#ffffff');
    }
  }

  function drawKickZone() {
    const footY = PLAYER_Y - 16;
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(player.x - 38, footY - 34, 76, 68);
    ctx.setLineDash([]);
  }

  function drawPlayer(x, y, team) {
    const bob = Math.sin(player.shuffle) * 1.2;
    const leg = Math.max(0, player.leg);
    const shirt = team.id === 'BRA' ? '#ffd43b' : team.id === 'ARG' ? '#75aadb' : team.id === 'GER' ? '#eeeeee' : team.id === 'FRA' ? '#2148d8' : '#ffffff';
    const accent = team.id === 'ENG' ? '#d91e36' : team.id === 'BRA' ? '#139447' : team.id === 'ARG' ? '#ffffff' : team.id === 'JPN' ? '#d91e36' : '#ef4444';

    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - 16, y + 13, 34, 5);
    // legs
    ctx.fillStyle = '#f4c28b';
    ctx.fillRect(x - 10, y - 2 + bob, 5, 18);
    ctx.fillRect(x + 5, y - 2 + bob - leg * .4, 5 + leg * .7, 18 - leg * .5);
    ctx.fillStyle = '#111827';
    ctx.fillRect(x - 12, y + 15 + bob, 10, 4);
    ctx.fillRect(x + 8 + leg * .7, y + 12 + bob - leg * .5, 12, 4);
    // shorts
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(x - 12, y - 10 + bob, 25, 13);
    // body
    ctx.fillStyle = shirt; ctx.fillRect(x - 15, y - 33 + bob, 30, 25);
    ctx.fillStyle = accent; ctx.fillRect(x - 2, y - 33 + bob, 5, 25);
    // arms
    ctx.fillStyle = '#f4c28b';
    ctx.fillRect(x - 23, y - 29 + bob, 8, 5);
    ctx.fillRect(x + 15, y - 29 + bob, 8, 5);
    // head
    ctx.fillStyle = '#f4c28b'; ctx.fillRect(x - 10, y - 50 + bob, 20, 17);
    ctx.fillStyle = '#2b1b13'; ctx.fillRect(x - 10, y - 54 + bob, 20, 7); ctx.fillRect(x - 12, y - 49 + bob, 5, 6);
    ctx.fillStyle = '#111827'; ctx.fillRect(x - 3 + player.face * 2, y - 45 + bob, 2, 2);
  }

  function drawBall(x, y, skin) {
    const r = 7;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(x - 9), Math.round(GROUND_Y + 2), 18, 3);
    ctx.fillStyle = skin.a;
    ctx.fillRect(Math.round(x - r), Math.round(y - r + 2), r * 2, r * 2 - 4);
    ctx.fillRect(Math.round(x - r + 2), Math.round(y - r), r * 2 - 4, r * 2);
    ctx.fillStyle = skin.b;
    ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4);
    ctx.fillRect(Math.round(x - 6), Math.round(y - 5), 3, 3);
    ctx.fillRect(Math.round(x + 4), Math.round(y - 4), 3, 3);
    ctx.fillRect(Math.round(x - 5), Math.round(y + 4), 3, 3);
    ctx.fillRect(Math.round(x + 3), Math.round(y + 5), 3, 3);
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x - r), Math.round(y - r + 2), r * 2, r * 2 - 4);
  }

  function drawMenu() {
    drawTitle();
    const d = getDailyChallenge();
    panel(122, 78, 236, 105);
    pixelText('VERSION 3 MINI ARCADE', 150, 96, 8, '#41f8ff');
    pixelText('PERFECT KICKS • COMBOS • DAILY CHALLENGE', 137, 111, 6, '#ffffff');
    pixelText(`TODAY: ${d.match[0]} vs ${d.match[1]}`, 158, 130, 8, '#ffd43b');
    pixelText(`TARGET SCORE: ${d.target}`, 181, 145, 8, '#65ff7a');
    pixelText(`COINS: ${data.coins}`, 205, 166, 8, '#ffffff');

    addButton('CLASSIC', 134, 190, 92, 24, () => resetGame('classic'));
    addButton('DAILY', 236, 190, 92, 24, () => resetGame('daily'));
    addButton('BALL SHOP', 185, 220, 110, 22, () => state = 'shop');

    drawTeamPicker();
  }

  function drawTitle() {
    pixelText('KEEPY-UPPY', 126, 42, 20, '#dbeafe', '#0b4b8e');
    pixelText('KING', 181, 67, 27, '#ffd43b', '#7c2d12');
    ctx.fillStyle = '#ffd43b';
    ctx.fillRect(222, 18, 10, 8); ctx.fillRect(236, 13, 10, 13); ctx.fillRect(250, 18, 10, 8); ctx.fillRect(218, 26, 46, 8);
    pixelText('BE THE KING!', 193, 108, 8, '#ffffff');
  }

  function drawTeamPicker() {
    panel(13, 193, 104, 55);
    pixelText('TEAM', 43, 207, 7);
    const idx = TEAM_FLAGS.findIndex(t => t.id === data.selectedTeam);
    addButton('<', 23, 216, 20, 21, () => { data.selectedTeam = TEAM_FLAGS[(idx - 1 + TEAM_FLAGS.length) % TEAM_FLAGS.length].id; saveData(); });
    drawFlag(49, 216, selectedTeam(), 32, 21);
    addButton('>', 87, 216, 20, 21, () => { data.selectedTeam = TEAM_FLAGS[(idx + 1) % TEAM_FLAGS.length].id; saveData(); });
    pixelText(data.selectedTeam, 52, 245, 7, '#ffd43b');
  }

  function drawShop() {
    drawTitle();
    panel(54, 74, 372, 154);
    pixelText('BALL SHOP', 185, 94, 13, '#ffd43b');
    pixelText(`COINS: ${data.coins}`, 202, 111, 8, '#ffffff');

    BALL_SKINS.forEach((skin, i) => {
      const x = 76 + i * 89;
      const y = 128;
      const unlocked = data.unlockedBalls.includes(skin.id);
      const selected = data.selectedBall === skin.id;
      ctx.fillStyle = selected ? '#2148d8' : '#0b1029';
      ctx.fillRect(x, y, 68, 68);
      ctx.strokeStyle = selected ? '#ffd43b' : '#41f8ff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 68, 68);
      drawBall(x + 34, y + 25, skin);
      pixelText(skin.name.toUpperCase(), x + 8, y + 47, 6, '#ffffff');
      pixelText(unlocked ? (selected ? 'SELECTED' : 'SELECT') : skin.unlock, x + 7, y + 61, 6, unlocked ? '#65ff7a' : '#ffd43b');
      addClickZone(x, y, 68, 68, () => chooseBall(skin));
    });

    addButton('BACK', 190, 237, 100, 22, () => state = 'menu');
  }

  function chooseBall(skin) {
    if (data.unlockedBalls.includes(skin.id)) {
      data.selectedBall = skin.id;
      saveData();
      return;
    }
    if (data.coins >= skin.cost) {
      data.coins -= skin.cost;
      data.unlockedBalls.push(skin.id);
      data.selectedBall = skin.id;
      unlockedMessage = `${skin.name.toUpperCase()} BALL UNLOCKED!`;
      unlockedTimer = 1.4;
      saveData();
    } else {
      unlockedMessage = 'NOT ENOUGH COINS';
      unlockedTimer = 1.0;
    }
  }

  function drawGameOver() {
    panel(118, 62, 244, 158);
    pixelText('GAME OVER', 168, 89, 18, '#ff6b6b');
    pixelText(`SCORE ${score}`, 190, 113, 11, '#ffd43b');
    pixelText(`BEST ${data.best}`, 196, 130, 8, '#ffffff');
    pixelText(`MAX COMBO x${bestRunCombo}`, 178, 145, 8, '#ff4fd8');
    pixelText(`PERFECTS ${perfects}`, 185, 160, 8, '#65ff7a');
    pixelText(`+${earnedCoins} COINS`, 195, 175, 8, '#41f8ff');

    addButton('RETRY', 135, 192, 74, 22, () => resetGame(mode));
    addButton('SHARE', 217, 192, 74, 22, shareScore);
    addButton('MENU', 299, 192, 48, 22, () => state = 'menu');
  }

  async function shareScore() {
    const text = `I scored ${score} in Keepy-Uppy King. Can you beat me?`;
    try {
      if (navigator.share) await navigator.share({ title: 'Keepy-Uppy King', text });
      else {
        await navigator.clipboard.writeText(text);
        unlockedMessage = 'SCORE COPIED!';
        unlockedTimer = 1.2;
      }
    } catch (_) {}
  }

  function drawEffects() {
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.colour;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
      ctx.globalAlpha = 1;
    });
    floatTexts.forEach(t => {
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life * 2));
      pixelText(t.text, Math.round(t.x - textWidth(t.text, 7) / 2), Math.round(t.y), 7, t.colour, '#000000');
      ctx.globalAlpha = 1;
    });
  }

  function drawToast(text) {
    const tw = textWidth(text, 8) + 24;
    panel(W / 2 - tw / 2, 18, tw, 28);
    pixelText(text, W / 2 - textWidth(text, 8) / 2, 36, 8, '#ffd43b');
  }

  function drawFlag(x, y, team, w, h) {
    const c = team.colours;
    ctx.fillStyle = '#111827'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    if (team.id === 'ENG') {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#d91e36'; ctx.fillRect(x + w/2 - 2, y, 4, h); ctx.fillRect(x, y + h/2 - 2, w, 4);
    } else if (team.id === 'BRA') {
      ctx.fillStyle = c[0]; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = c[1]; ctx.beginPath(); ctx.moveTo(x+w/2, y+3); ctx.lineTo(x+w-4, y+h/2); ctx.lineTo(x+w/2, y+h-3); ctx.lineTo(x+4, y+h/2); ctx.fill();
      ctx.fillStyle = c[2]; ctx.fillRect(x+w/2-4, y+h/2-4, 8, 8);
    } else if (team.id === 'JPN') {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#d91e36'; ctx.fillRect(x+w/2-5, y+h/2-5, 10, 10);
    } else {
      c.forEach((colour, i) => { ctx.fillStyle = colour; ctx.fillRect(x, y + i * h / c.length, w, h / c.length + 1); });
    }
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = '#030712'; ctx.fillRect(x + 3, y + 3, w, h);
    ctx.fillStyle = '#0b1029'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#41f8ff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 1; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  }

  function addButton(label, x, y, w, h, action, enabled = true) {
    ctx.fillStyle = enabled ? '#1d4ed8' : '#334155';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = enabled ? '#ffd43b' : '#64748b'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    pixelText(label, x + w / 2 - textWidth(label, 7) / 2, y + h / 2 + 3, 7, enabled ? '#ffffff' : '#94a3b8');
    if (enabled) addClickZone(x, y, w, h, action);
  }

  function addClickZone(x, y, w, h, action) {
    clicks.push({ x, y, w, h, action });
  }

  function pixelText(text, x, y, size = 8, fill = '#ffffff', shadow = '#000000') {
    ctx.font = `900 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = shadow;
    ctx.fillText(text, Math.round(x + 1), Math.round(y + 1));
    ctx.fillStyle = fill;
    ctx.fillText(text, Math.round(x), Math.round(y));
  }

  function textWidth(text, size = 8) {
    ctx.font = `900 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    return ctx.measureText(text).width;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function pointerToGame(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    return { x: (clientX - rect.left) * W / rect.width, y: (clientY - rect.top) * H / rect.height };
  }

  function handlePointer(e) {
    e.preventDefault();
    const p = pointerToGame(e);
    for (const z of clicks) {
      if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) {
        z.action();
        return;
      }
    }
    if (state === 'playing') tryKick();
  }

  canvas.addEventListener('pointerdown', handlePointer);
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); if (state === 'playing') tryKick(); }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'Enter' && state === 'menu') resetGame('classic');
    if (e.code === 'Escape') state = 'menu';
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  });

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
