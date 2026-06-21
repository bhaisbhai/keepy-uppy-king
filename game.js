(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const W = 360;
  const H = 640;
  canvas.width = W;
  canvas.height = H;

  const GROUND_Y = 584;
  const PLAYER_Y = 563;

  const CHARACTERS = [
    { id: 'meeks',   name: 'BIG MEEKS', skin: '#5c3a1e', hair: '#1a0800', shirt: '#cc2200', accent: '#ffd43b', shorts: '#1d4ed8' },
    { id: 'alan',    name: 'ALAN',      skin: '#f4c28b', hair: null,      shirt: '#111111', accent: '#eeeeee', shorts: '#111111' },
    { id: 'thierry', name: 'THIERRY',   skin: '#6b3420', hair: null,      shirt: '#cc0000', accent: '#ffffff', shorts: '#ffffff' },
    { id: 'lineker', name: 'LINEKER',   skin: '#f0c080', hair: '#aaaaaa', shirt: '#0033cc', accent: '#ffffff', shorts: '#0033cc' },
    { id: 'zlatan',  name: 'ZLATAN',    skin: '#c88848', hair: '#2a1000', shirt: '#000080', accent: '#ffcc00', shorts: '#000080' },
  ];

  const storageKey = 'keepy-uppy-king-v4';
  const data = loadData();

  let state = 'menu';
  let selectedChar = CHARACTERS[0];
  let clicks = [];
  let keys = { left: false, right: false };
  let last = performance.now();
  let shake = 0, shakePhase = 0;
  let particles = [];
  let floatTexts = [];
  let unlockedMessage = '';
  let unlockedTimer = 0;
  let player, ball, score, streak, bestRunCombo, perfects, level, earnedCoins;

  function loadData() {
    const base = { best: 0, coins: 0 };
    try { return { ...base, ...(JSON.parse(localStorage.getItem(storageKey)) || {}) }; }
    catch (_) { return base; }
  }

  function saveData() { localStorage.setItem(storageKey, JSON.stringify(data)); }

  function resetGame() {
    state = 'playing';
    score = 0; streak = 0; bestRunCombo = 1; perfects = 0;
    level = 1; earnedCoins = 0; unlockedMessage = '';
    player = { x: W / 2, y: PLAYER_Y, leg: 0, face: 1, shuffle: 0 };
    ball = { x: W / 2 + 2, y: 387, vx: 8, vy: 16, r: 11, spin: 0 };
    particles = []; floatTexts = []; shake = 0; shakePhase = 0;
  }

  function gameOver() {
    state = 'gameover';
    const oldBest = data.best;
    data.best = Math.max(data.best, score);
    earnedCoins = Math.max(1, Math.floor(score / 5) + perfects);
    data.coins += earnedCoins;
    if (score > oldBest) addFloatText('NEW BEST!', W / 2, 293, '#ffd43b');
    saveData();
  }

  function tryKick() {
    if (state !== 'playing') return;
    const footY = PLAYER_Y - 24;
    const dy = Math.abs(ball.y - footY);
    const dx = Math.abs(ball.x - player.x);
    if (dy >= 48 || dx >= 56 || ball.vy <= -133) {
      addFloatText(ball.y < footY ? 'TOO EARLY!' : 'REACH!', player.x, PLAYER_Y - 73, '#ff6b6b');
      return;
    }
    const perfect = dy < 12 && dx < 27 && ball.vy > 0;
    const combo = getCombo();
    const gained = (perfect ? 3 : 1) * combo;
    score += gained; streak++;
    bestRunCombo = Math.max(bestRunCombo, combo);
    level = 1 + Math.floor(score / 5);
    if (perfect) perfects++;

    const side = Math.sign(ball.x - player.x) || (Math.random() > 0.5 ? 1 : -1);
    const chaos = Math.min(133, level * 9);
    ball.vy = perfect ? -420 - Math.min(60, level * 3) : -380 - Math.min(47, level * 3);
    ball.vx += side * (8 + Math.random() * 13) + (Math.random() - 0.5) * chaos;
    ball.vx = clamp(ball.vx, -147 - level * 4, 147 + level * 4);
    ball.y = Math.min(ball.y, footY - 1);
    player.leg = 8; player.face = side;
    if (perfect) { shake = 1.5; shakePhase = 0; }

    if (perfect) {
      addFloatText(`PERFECT +${gained}`, ball.x, ball.y - 13, '#65ff7a');
      burst(ball.x, ball.y, '#65ff7a', 14);
    } else {
      addFloatText(`+${gained}`, ball.x, ball.y - 13, '#ffffff');
      burst(ball.x, ball.y, '#ffd43b', 7);
    }
  }

  function getCombo() { return Math.min(9, 1 + Math.floor(streak / 10)); }

  function burst(x, y, colour, count) {
    for (let i = 0; i < count; i++)
      particles.push({ x, y, vx: (Math.random()-0.5)*120, vy: (Math.random()-0.8)*113, life: 0.5+Math.random()*0.3, colour });
  }

  function addFloatText(text, x, y, colour) { floatTexts.push({ text, x, y, colour, life: 0.8 }); }

  function update(dt) {
    if (unlockedTimer > 0) unlockedTimer -= dt;
    updateEffects(dt);
    if (state !== 'playing') return;
    if (shake > 0) { shake -= dt * 25; shakePhase += dt * 35; }
    if (player.leg > 0) player.leg -= dt * 16;

    const manual = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    player.x += manual * 173 * dt;
    const autoSpeed = Math.max(24, 120 - level * 7);
    player.x += clamp(ball.x - player.x, -1, 1) * autoSpeed * dt;
    player.x = clamp(player.x, 45, W - 45);
    player.shuffle += dt * (8 + level * 0.4);

    const gravity = 373 + level * 32;
    ball.vy += gravity * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spin += ball.vx * dt * 0.04;
    ball.vx *= (0.994 - Math.min(0.003, level * 0.00012));

    if (ball.x < 19) { ball.x = 19; ball.vx = Math.abs(ball.vx) * 0.82; }
    if (ball.x > W - 19) { ball.x = W - 19; ball.vx = -Math.abs(ball.vx) * 0.82; }
    if (ball.y + ball.r >= GROUND_Y) {
      ball.y = GROUND_Y - ball.r;
      burst(ball.x, ball.y, '#ff4b4b', 18);
      gameOver();
    }
  }

  function updateEffects(dt) {
    particles.forEach(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 187 * dt; });
    particles = particles.filter(p => p.life > 0);
    floatTexts.forEach(t => { t.life -= dt; t.y -= 35 * dt; });
    floatTexts = floatTexts.filter(t => t.life > 0);
  }

  function draw() {
    clicks = [];
    ctx.save();
    if (shake > 0.3) {
      ctx.translate(
        Math.round(Math.sin(shakePhase) * shake),
        Math.round(Math.sin(shakePhase * 1.3) * shake * 0.5)
      );
    }
    drawBackground();
    if (state === 'playing' || state === 'gameover') {
      drawPlayer(player.x, player.y, selectedChar);
      drawBall(ball.x, ball.y);
      drawKickZone();
      drawEffects();
      drawHud();
      if (state === 'playing') {
        const hint = streak === 0 ? 'TAP WHEN BALL REACHES FOOT!' : 'KEEP IT UP!';
        pixelText(hint, W/2 - textWidth(hint,8)/2, H - 10, 8, '#dbeafe');
      }
      if (state === 'gameover') drawGameOver();
    } else if (state === 'charselect') {
      drawCharSelect();
    } else {
      drawMenu();
    }
    if (unlockedTimer > 0) drawToast(unlockedMessage);
    ctx.restore();
  }

  function drawBackground() {
    ctx.fillStyle = '#07122f'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = ['#ffd43b','#ff5e42','#41f8ff','#65ff7a'][i%4];
      ctx.fillRect((i*71+15)%W, (i*41+9)%147, 2, 2);
    }
    drawFloodlight(73, 93); drawFloodlight(287, 91);
    ctx.fillStyle = '#182044'; ctx.fillRect(0, 147, W, 147);
    for (let cy = 154; cy < 291; cy += 7) {
      for (let cx = 0; cx < W; cx += 7) {
        ctx.fillStyle = ['#244a8f','#ef4444','#facc15','#22c55e','#f5cda6','#e879f9','#ffffff','#38bdf8'][(cx*13+cy*7)%8];
        ctx.fillRect(cx, cy, 4, 4);
      }
    }
    [['PLAY EVERY DAY!','#2563eb',147],['GOAL!','#dc2626',80],['FOOTBALL!','#15803d',133]].reduce((bx,[t,c,w])=>{
      ctx.fillStyle=c; ctx.fillRect(bx,293,w,17);
      ctx.fillStyle='#fff'; pixelText(t,bx+5,307,6);
      return bx+w;
    }, 0);
    ctx.fillStyle = '#2f9e28'; ctx.fillRect(0, 311, W, H - 311);
    for (let px = -40; px < W; px += 56) {
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.beginPath(); ctx.moveTo(px,311); ctx.lineTo(px+37,311); ctx.lineTo(px+80,H); ctx.lineTo(px+29,H); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W/2, GROUND_Y, 77, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W/2,311); ctx.lineTo(W/2,H); ctx.stroke();
  }

  function drawFloodlight(x, y) {
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-35,304); ctx.lineTo(x+35,304); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#dbeafe';
    for (let fy=0;fy<3;fy++) for (let fx=0;fx<3;fx++) ctx.fillRect(x+fx*5-5,y+fy*5,4,4);
  }

  function drawKickZone() {
    const footY = PLAYER_Y - 24;
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
    ctx.setLineDash([4,4]); ctx.strokeRect(player.x-53,footY-48,107,96); ctx.setLineDash([]);
  }

  function drawPlayer(x, y, char) {
    const bob = Math.sin(player.shuffle) * 1.6;
    const leg = Math.max(0, player.leg);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x-24, y+19+bob, 48, 7);
    // Legs
    ctx.fillStyle = char.skin;
    ctx.fillRect(x-15, y-3+bob, 8, 27);
    ctx.fillRect(x+7,  y-3+bob-leg*.5, 8+leg*.9, 27-leg*.7);
    // Boots
    ctx.fillStyle = '#111827';
    ctx.fillRect(x-17, y+23+bob, 15, 7);
    ctx.fillRect(x+12+leg*.9, y+19+bob-leg*.7, 17, 7);
    // Shorts
    ctx.fillStyle = char.shorts; ctx.fillRect(x-17, y-15+bob, 36, 19);
    // Shirt
    ctx.fillStyle = char.shirt;  ctx.fillRect(x-21, y-48+bob, 43, 36);
    ctx.fillStyle = char.accent; ctx.fillRect(x-5,  y-48+bob, 10, 36);
    // Arms
    ctx.fillStyle = char.skin;
    ctx.fillRect(x-33, y-41+bob, 12, 8);
    ctx.fillRect(x+21, y-41+bob, 12, 8);
    // Head
    ctx.fillRect(x-15, y-73+bob, 29, 27);
    // Hair per character
    if (char.id === 'meeks') {
      ctx.fillStyle = '#1a0800';
      ctx.fillRect(x-15,y-81+bob,29,9);  // full dark hair cap
    } else if (char.id === 'lineker') {
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(x-15,y-81+bob,29,9);
      ctx.fillRect(x-17,y-75+bob,5,5);
      ctx.fillRect(x+11,y-75+bob,5,5);
    } else if (char.id === 'zlatan') {
      ctx.fillStyle = '#2a1000'; ctx.fillRect(x-15,y-80+bob,29,9);
    }
    // Eyes
    ctx.fillStyle = '#111827';
    ctx.fillRect(x-7+player.face, y-63+bob, 4, 4);
    ctx.fillRect(x+3+player.face, y-63+bob, 4, 4);
    ctx.fillRect(x-1, y-56+bob, 3, 3);
    ctx.fillRect(x-5, y-51+bob, 11, 3);
    ctx.fillStyle = '#ff9980'; ctx.fillRect(x-4, y-49+bob, 8, 1);
    // Glasses for Meeks
    if (char.id === 'meeks') {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x-10,y-67+bob,8,2);  ctx.fillRect(x-10,y-60+bob,8,2);
      ctx.fillRect(x-10,y-67+bob,2,9);  ctx.fillRect(x-3, y-67+bob,2,9);
      ctx.fillRect(x+2, y-67+bob,8,2);  ctx.fillRect(x+2, y-60+bob,8,2);
      ctx.fillRect(x+2, y-67+bob,2,9);  ctx.fillRect(x+8, y-67+bob,2,9);
      ctx.fillRect(x-1, y-64+bob,3,2);
    }
    // Beard
    if (char.id === 'meeks') {
      ctx.fillStyle = '#1a0800';
      ctx.fillRect(x-13,y-53+bob,27,5);
      ctx.fillRect(x-11,y-49+bob,23,3);
    } else if (char.id === 'zlatan') {
      ctx.fillStyle = '#2a1000'; ctx.fillRect(x-13,y-53+bob,27,4);
    }
  }

  function drawBall(x, y) {
    const r = ball.r;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(Math.round(x-15), Math.round(GROUND_Y+3), 29, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x-r), Math.round(y-r+3), r*2, r*2-6);
    ctx.fillRect(Math.round(x-r+3), Math.round(y-r), r*2-6, r*2);
    ctx.fillStyle = '#111111';
    ctx.fillRect(Math.round(x-3),Math.round(y-3),5,5);
    ctx.fillRect(Math.round(x-9),Math.round(y-8),5,5);
    ctx.fillRect(Math.round(x+5),Math.round(y-7),5,5);
    ctx.fillRect(Math.round(x-8),Math.round(y+5),5,5);
    ctx.fillRect(Math.round(x+4),Math.round(y+6),5,5);
    ctx.strokeStyle='#333'; ctx.lineWidth=1; ctx.strokeRect(Math.round(x-r),Math.round(y-r+3),r*2,r*2-6);
  }

  function drawHud() {
    panel(7,7,160,59);
    pixelText('SCORE',17,29,11);
    pixelText(String(score).padStart(3,'0'),17,56,21,'#ffd43b');
    panel(193,7,160,59);
    pixelText('COMBO',203,29,11,'#ffd43b');
    const cs='x'+getCombo();
    pixelText(cs, Math.round(273-textWidth(cs,24)/2), 56, 24,'#ff4fd8');
  }

  function drawMenu() {
    pixelText('KEEPY-UPPY', W/2-textWidth('KEEPY-UPPY',24)/2, 160, 24, '#dbeafe','#0b4b8e');
    pixelText('KING', W/2-textWidth('KING',37)/2, 207, 37, '#ffd43b','#7c2d12');
    ctx.fillStyle='#ffd43b';
    ctx.fillRect(251,128,11,8); ctx.fillRect(264,123,11,13); ctx.fillRect(277,128,11,8); ctx.fillRect(247,136,48,8);
    if (data.best > 0)
      pixelText(`BEST: ${data.best}`, W/2-textWidth(`BEST: ${data.best}`,12)/2, 267, 12, '#ffd43b');
    addButton('PLAY', W/2-80, 300, 160, 59, () => { state = 'charselect'; });
    pixelText(`COINS: ${data.coins}`, W/2-textWidth(`COINS: ${data.coins}`,10)/2, 400, 10, '#41f8ff');
  }

  function drawCharSelect() {
    pixelText('CHOOSE YOUR', W/2-textWidth('CHOOSE YOUR',13)/2, 51, 13, '#ffffff');
    pixelText('PUNDIT', W/2-textWidth('PUNDIT',23)/2, 80, 23, '#ffd43b');

    const cardW=153, cardH=140, gap=11;
    const row1x = Math.round((W - 2*cardW - gap) / 2);
    const positions = [
      [row1x,           96],
      [row1x+cardW+gap, 96],
      [row1x,           247],
      [row1x+cardW+gap, 247],
      [Math.round((W-cardW)/2), 408],
    ];

    positions.forEach(([cx,cy], i) => {
      const char = CHARACTERS[i];
      const sel = selectedChar.id === char.id;
      ctx.fillStyle = sel ? '#1d4ed8' : '#0b1029';
      ctx.fillRect(cx,cy,cardW,cardH);
      ctx.strokeStyle = sel ? '#ffd43b' : '#41f8ff'; ctx.lineWidth=2; ctx.strokeRect(cx,cy,cardW,cardH);
      if (sel) { ctx.strokeStyle='#ffd43b'; ctx.lineWidth=1; ctx.strokeRect(cx+4,cy+4,cardW-8,cardH-8); }
      drawCharPortrait(cx + Math.round(cardW/2), cy+77, char);
      const lx = cx + Math.round(cardW/2) - Math.round(textWidth(char.name,9)/2);
      pixelText(char.name, lx, cy+cardH-10, 9, '#ffffff');
      addClickZone(cx,cy,cardW,cardH, () => { selectedChar = char; });
    });

    addButton('KICK OFF!', W/2-91, 568, 182, 48, () => resetGame());
  }

  function drawCharPortrait(cx, cy, char) {
    // Shirt
    ctx.fillStyle = char.shirt;  ctx.fillRect(cx-17,cy+3, 35,27);
    ctx.fillStyle = char.accent; ctx.fillRect(cx-5, cy+3, 10,27);
    // Neck
    ctx.fillStyle = char.skin; ctx.fillRect(cx-5,cy-6,10,10);
    // Head
    ctx.fillStyle = char.skin; ctx.fillRect(cx-13,cy-30,27,25);
    // Ears
    ctx.fillStyle = char.skin;
    ctx.fillRect(cx-17,cy-23,4,7); ctx.fillRect(cx+13,cy-23,4,7);

    // Hair
    if (char.id === 'meeks') {
      ctx.fillStyle = '#1a0800';
      ctx.fillRect(cx-13,cy-35,27,8);   // full dark hair cap
      ctx.fillRect(cx-15,cy-28,3,4);    // left fade
      ctx.fillRect(cx+12,cy-28,3,4);    // right fade
    } else if (char.id === 'lineker') {
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(cx-13,cy-35,27,8);
      ctx.fillRect(cx-16,cy-28,4,5); ctx.fillRect(cx+12,cy-28,4,5);
    } else if (char.id === 'zlatan') {
      ctx.fillStyle = '#2a1000'; ctx.fillRect(cx-13,cy-35,27,7);
    }
    // alan + thierry: bald — no hair drawn

    // Eyes
    ctx.fillStyle = '#111827';
    ctx.fillRect(cx-8,cy-19,4,4); ctx.fillRect(cx+4,cy-19,4,4);
    ctx.fillRect(cx-1,cy-12,3,3);
    ctx.fillRect(cx-5,cy-7,11,3);
    ctx.fillStyle='#ff9980'; ctx.fillRect(cx-4,cy-6,9,1);

    // Glasses for Meeks
    if (char.id === 'meeks') {
      ctx.fillStyle = '#1a1a1a';
      // left lens
      ctx.fillRect(cx-11,cy-22,9,2); ctx.fillRect(cx-11,cy-14,9,2);
      ctx.fillRect(cx-11,cy-22,2,10); ctx.fillRect(cx-3, cy-22,2,10);
      // right lens
      ctx.fillRect(cx+2, cy-22,9,2); ctx.fillRect(cx+2, cy-14,9,2);
      ctx.fillRect(cx+2, cy-22,2,10); ctx.fillRect(cx+9, cy-22,2,10);
      // bridge
      ctx.fillRect(cx-1,cy-19,3,2);
      // temple arms to ears
      ctx.fillRect(cx-15,cy-18,4,2); ctx.fillRect(cx+11,cy-18,4,2);
    }

    // Beard
    if (char.id === 'meeks') {
      ctx.fillStyle = '#1a0800';
      ctx.fillRect(cx-11,cy-5,23,5);
      ctx.fillRect(cx-9, cy-1,19,3);
    } else if (char.id === 'zlatan') {
      ctx.fillStyle = '#2a1000'; ctx.fillRect(cx-11,cy-5,23,4);
    }
  }

  function drawGameOver() {
    ctx.fillStyle='rgba(3,7,18,.91)'; ctx.fillRect(13,73,W-27,420);
    ctx.strokeStyle='#41f8ff'; ctx.lineWidth=2; ctx.strokeRect(13,73,W-27,420);
    ctx.strokeStyle='#ffd43b'; ctx.lineWidth=1; ctx.strokeRect(18,79,W-36,408);

    pixelText('GAME OVER', W/2-textWidth('GAME OVER',21)/2, 126, 21,'#ff6b6b');
    pixelText(`SCORE  ${score}`,    W/2-textWidth(`SCORE  ${score}`,15)/2,  173,15,'#ffd43b');
    pixelText(`BEST   ${data.best}`,W/2-textWidth(`BEST   ${data.best}`,12)/2,209,12,'#ffffff');
    pixelText(`COMBO  x${bestRunCombo}`,W/2-textWidth(`COMBO  x${bestRunCombo}`,12)/2,241,12,'#ff4fd8');
    pixelText(`PERFECTS  ${perfects}`,W/2-textWidth(`PERFECTS  ${perfects}`,12)/2,273,12,'#65ff7a');
    pixelText(`+${earnedCoins} COINS`,W/2-textWidth(`+${earnedCoins} COINS`,12)/2,305,12,'#41f8ff');

    addButton('RETRY', 24,  357, 93, 40, () => resetGame());
    addButton('SHARE', 133, 357, 93, 40, shareScore);
    addButton('MENU',  242, 357, 93, 40, () => { state='menu'; });
  }

  async function shareScore() {
    const text = `I scored ${score} in Keepy-Uppy King! Can you beat me?`;
    try {
      if (navigator.share) await navigator.share({ title:'Keepy-Uppy King', text });
      else { await navigator.clipboard.writeText(text); unlockedMessage='SCORE COPIED!'; unlockedTimer=1.2; }
    } catch(_) {}
  }

  function drawEffects() {
    particles.forEach(p => {
      ctx.globalAlpha=Math.max(0,p.life*2); ctx.fillStyle=p.colour;
      ctx.fillRect(Math.round(p.x),Math.round(p.y),4,4);
    });
    ctx.globalAlpha=1;
    floatTexts.forEach(t => {
      ctx.globalAlpha=Math.max(0,Math.min(1,t.life*2));
      pixelText(t.text,Math.round(t.x-textWidth(t.text,9)/2),Math.round(t.y),9,t.colour,'#000000');
    });
    ctx.globalAlpha=1;
  }

  function drawToast(text) {
    const tw=textWidth(text,11)+27;
    panel(W/2-tw/2,19,tw,35);
    pixelText(text,W/2-textWidth(text,11)/2,41,11,'#ffd43b');
  }

  function panel(x,y,w,h) {
    ctx.fillStyle='#030712'; ctx.fillRect(x+4,y+4,w,h);
    ctx.fillStyle='#0b1029'; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='#41f8ff'; ctx.lineWidth=2; ctx.strokeRect(x,y,w,h);
    ctx.strokeStyle='#ffd43b'; ctx.lineWidth=1; ctx.strokeRect(x+4,y+4,w-8,h-8);
  }

  function addButton(label,x,y,w,h,action,enabled=true) {
    ctx.fillStyle=enabled?'#1d4ed8':'#334155'; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle=enabled?'#ffd43b':'#64748b'; ctx.lineWidth=2; ctx.strokeRect(x,y,w,h);
    pixelText(label, x+w/2-textWidth(label,9)/2, y+h/2+4, 9, enabled?'#ffffff':'#94a3b8');
    if (enabled) clicks.push({x,y,w,h,action});
  }

  function addClickZone(x,y,w,h,action) { clicks.push({x,y,w,h,action}); }

  function pixelText(text,x,y,size=11,fill='#ffffff',shadow='#000000') {
    ctx.font=`900 ${size}px ui-monospace,Menlo,Consolas,monospace`;
    ctx.textBaseline='alphabetic';
    ctx.fillStyle=shadow; ctx.fillText(text,Math.round(x+1),Math.round(y+1));
    ctx.fillStyle=fill;   ctx.fillText(text,Math.round(x),Math.round(y));
  }

  function textWidth(text,size=11) {
    ctx.font=`900 ${size}px ui-monospace,Menlo,Consolas,monospace`;
    return ctx.measureText(text).width;
  }

  function clamp(v,mn,mx) { return Math.max(mn,Math.min(mx,v)); }

  function pointerToGame(e) {
    const rect=canvas.getBoundingClientRect();
    const cx=e.clientX??e.touches?.[0]?.clientX;
    const cy=e.clientY??e.touches?.[0]?.clientY;
    return { x:(cx-rect.left)*W/rect.width, y:(cy-rect.top)*H/rect.height };
  }

  function handlePointer(e) {
    e.preventDefault();
    const p=pointerToGame(e);
    for (const z of clicks) {
      if (p.x>=z.x&&p.x<=z.x+z.w&&p.y>=z.y&&p.y<=z.y+z.h) { z.action(); return; }
    }
    if (state==='playing') tryKick();
  }

  canvas.addEventListener('pointerdown', handlePointer, {passive:false});
  window.addEventListener('keydown', e => {
    if (e.code==='Space')                        { e.preventDefault(); if(state==='playing') tryKick(); }
    if (e.code==='ArrowLeft' ||e.code==='KeyA')  keys.left=true;
    if (e.code==='ArrowRight'||e.code==='KeyD')  keys.right=true;
    if (e.code==='Enter'&&state==='menu')         state='charselect';
    if (e.code==='Escape')                        state='menu';
  });
  window.addEventListener('keyup', e => {
    if (e.code==='ArrowLeft' ||e.code==='KeyA')  keys.left=false;
    if (e.code==='ArrowRight'||e.code==='KeyD')  keys.right=false;
  });

  function loop(now) {
    const dt=Math.min(0.033,(now-last)/1000||0);
    last=now; update(dt); draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
