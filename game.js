(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const W = 270;
  const H = 480;
  canvas.width = W;
  canvas.height = H;

  const GROUND_Y = 438;
  const PLAYER_Y = 422;

  const CHARACTERS = [
    { id: 'meeks',   name: 'BIG MEEKS', skin: '#5c3a1e', hair: '#120800', shirt: '#cc2200', accent: '#ffd43b', shorts: '#1d4ed8' },
    { id: 'alan',    name: 'ALAN',      skin: '#f4c28b', hair: '#c8a040', shirt: '#111111', accent: '#eeeeee', shorts: '#111111' },
    { id: 'thierry', name: 'THIERRY',   skin: '#6b3420', hair: '#080400', shirt: '#cc0000', accent: '#ffffff', shorts: '#ffffff' },
    { id: 'lineker', name: 'LINEKER',   skin: '#f0c080', hair: '#7a4e28', shirt: '#0033cc', accent: '#ffffff', shorts: '#0033cc' },
    { id: 'zlatan',  name: 'ZLATAN',    skin: '#c88848', hair: '#120800', shirt: '#000080', accent: '#ffcc00', shorts: '#000080' },
  ];

  const storageKey = 'keepy-uppy-king-v4';
  const data = loadData();

  let state = 'menu';
  let selectedChar = CHARACTERS[0];
  let clicks = [];
  let keys = { left: false, right: false };
  let last = performance.now();
  let shake = 0;
  let particles = [];
  let floatTexts = [];
  let unlockedMessage = '';
  let unlockedTimer = 0;
  let player, ball, score, streak, bestRunCombo, perfects, level, earnedCoins;

  function loadData() {
    const base = { best: 0, coins: 0 };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      return { ...base, ...(saved || {}) };
    } catch (_) { return base; }
  }

  function saveData() { localStorage.setItem(storageKey, JSON.stringify(data)); }

  function resetGame() {
    state = 'playing';
    score = 0; streak = 0; bestRunCombo = 1; perfects = 0;
    level = 1; earnedCoins = 0; unlockedMessage = '';
    player = { x: W / 2, y: PLAYER_Y, leg: 0, face: 1, shuffle: 0 };
    ball = { x: W / 2 + 2, y: 290, vx: 6, vy: 12, r: 8, spin: 0 };
    particles = []; floatTexts = []; shake = 0;
  }

  function gameOver() {
    state = 'gameover';
    const oldBest = data.best;
    data.best = Math.max(data.best, score);
    earnedCoins = Math.max(1, Math.floor(score / 5) + perfects);
    data.coins += earnedCoins;
    if (score > oldBest) addFloatText('NEW BEST!', W / 2, 220, '#ffd43b');
    saveData();
  }

  function tryKick() {
    if (state !== 'playing') return;
    const footY = PLAYER_Y - 18;
    const dy = Math.abs(ball.y - footY);
    const dx = Math.abs(ball.x - player.x);
    if (dy >= 36 || dx >= 42 || ball.vy <= -100) {
      addFloatText(ball.y < footY ? 'TOO EARLY!' : 'REACH!', player.x, PLAYER_Y - 55, '#ff6b6b');
      shake = Math.max(shake, 2);
      return;
    }
    const perfect = dy < 9 && dx < 20 && ball.vy > 0;
    const combo = getCombo();
    const gained = (perfect ? 3 : 1) * combo;
    score += gained; streak += 1;
    bestRunCombo = Math.max(bestRunCombo, combo);
    level = 1 + Math.floor(score / 5);
    if (perfect) perfects += 1;

    const side = Math.sign(ball.x - player.x) || (Math.random() > 0.5 ? 1 : -1);
    const chaos = Math.min(100, level * 7);
    ball.vy = perfect ? -315 - Math.min(45, level * 2.5) : -285 - Math.min(35, level * 2);
    ball.vx += side * (6 + Math.random() * 10) + (Math.random() - 0.5) * chaos;
    ball.vx = clamp(ball.vx, -110 - level * 3, 110 + level * 3);
    ball.y = Math.min(ball.y, footY - 1);
    player.leg = 8; player.face = side;
    shake = perfect ? 5 : 2;

    if (perfect) {
      addFloatText(`PERFECT +${gained}`, ball.x, ball.y - 10, '#65ff7a');
      burst(ball.x, ball.y, '#65ff7a', 14);
    } else {
      addFloatText(`+${gained}`, ball.x, ball.y - 10, '#ffffff');
      burst(ball.x, ball.y, '#ffd43b', 7);
    }
  }

  function getCombo() { return Math.min(9, 1 + Math.floor(streak / 10)); }

  function burst(x, y, colour, count) {
    for (let i = 0; i < count; i++)
      particles.push({ x, y, vx: (Math.random()-0.5)*90, vy: (Math.random()-0.8)*85, life: 0.5+Math.random()*0.3, colour });
  }

  function addFloatText(text, x, y, colour) { floatTexts.push({ text, x, y, colour, life: 0.8 }); }

  function update(dt) {
    if (unlockedTimer > 0) unlockedTimer -= dt;
    updateEffects(dt);
    if (state !== 'playing') return;
    if (shake > 0) shake -= dt * 12;
    if (player.leg > 0) player.leg -= dt * 16;

    const manual = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    player.x += manual * 130 * dt;
    const autoSpeed = Math.max(18, 90 - level * 5);
    player.x += clamp(ball.x - player.x, -1, 1) * autoSpeed * dt;
    player.x = clamp(player.x, 34, W - 34);
    player.shuffle += dt * (6 + level * 0.3);

    const gravity = 280 + level * 24;
    ball.vy += gravity * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spin += ball.vx * dt * 0.04;
    ball.vx *= (0.994 - Math.min(0.003, level * 0.00012));

    if (ball.x < 14) { ball.x = 14; ball.vx = Math.abs(ball.vx) * 0.82; }
    if (ball.x > W - 14) { ball.x = W - 14; ball.vx = -Math.abs(ball.vx) * 0.82; }
    if (ball.y + ball.r >= GROUND_Y) {
      ball.y = GROUND_Y - ball.r;
      burst(ball.x, ball.y, '#ff4b4b', 18);
      gameOver();
    }
  }

  function updateEffects(dt) {
    particles.forEach(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; });
    particles = particles.filter(p => p.life > 0);
    floatTexts.forEach(t => { t.life -= dt; t.y -= 26 * dt; });
    floatTexts = floatTexts.filter(t => t.life > 0);
  }

  function draw() {
    clicks = [];
    ctx.save();
    if (shake > 0) ctx.translate(Math.round((Math.random()-0.5)*shake), Math.round((Math.random()-0.5)*shake));
    drawBackground();
    if (state === 'playing' || state === 'gameover') {
      drawPlayer(player.x, player.y, selectedChar);
      drawBall(ball.x, ball.y);
      drawKickZone();
      drawEffects();
      drawHud();
      if (state === 'playing') {
        const hint = streak === 0 ? 'TAP WHEN BALL REACHES FOOT!' : 'KEEP IT UP!';
        pixelText(hint, W/2 - textWidth(hint,6)/2, H - 8, 6, '#dbeafe');
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
    ctx.fillStyle = '#07122f';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = ['#ffd43b','#ff5e42','#41f8ff','#65ff7a'][i%4];
      ctx.fillRect((i*53+11)%W, (i*31+7)%110, 2, 2);
    }
    drawFloodlight(55, 70); drawFloodlight(215, 68);
    ctx.fillStyle = '#182044'; ctx.fillRect(0, 110, W, 110);
    for (let cy = 116; cy < 218; cy += 5) {
      for (let cx = 0; cx < W; cx += 5) {
        ctx.fillStyle = ['#244a8f','#ef4444','#facc15','#22c55e','#f5cda6','#e879f9','#ffffff','#38bdf8'][(cx*13+cy*7)%8];
        ctx.fillRect(cx, cy, 3, 3);
      }
    }
    [['PLAY EVERY DAY!','#2563eb',110],['GOAL!','#dc2626',60],['FOOTBALL!','#15803d',100]].reduce((bx,[t,c,w])=>{
      ctx.fillStyle=c; ctx.fillRect(bx,220,w,13);
      ctx.fillStyle='#fff'; pixelText(t,bx+4,230,6);
      return bx+w;
    }, 0);
    ctx.fillStyle = '#2f9e28'; ctx.fillRect(0, 233, W, H - 233);
    for (let px = -30; px < W; px += 42) {
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.beginPath(); ctx.moveTo(px,233); ctx.lineTo(px+28,233); ctx.lineTo(px+60,H); ctx.lineTo(px+22,H); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W/2, 438, 58, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W/2,233); ctx.lineTo(W/2,H); ctx.stroke();
  }

  function drawFloodlight(x, y) {
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-26,228); ctx.lineTo(x+26,228); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#dbeafe';
    for (let fy=0;fy<3;fy++) for (let fx=0;fx<3;fx++) ctx.fillRect(x+fx*4-4,y+fy*4,3,3);
  }

  function drawKickZone() {
    const footY = PLAYER_Y - 18;
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
    ctx.setLineDash([3,3]); ctx.strokeRect(player.x-40,footY-36,80,72); ctx.setLineDash([]);
  }

  function drawPlayer(x, y, char) {
    const bob = Math.sin(player.shuffle) * 1.2;
    const leg = Math.max(0, player.leg);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x-18, y+14, 36, 5);
    ctx.fillStyle = char.skin;
    ctx.fillRect(x-11, y-2+bob, 6, 20);
    ctx.fillRect(x+5,  y-2+bob-leg*.4, 6+leg*.7, 20-leg*.5);
    ctx.fillStyle = '#111827';
    ctx.fillRect(x-13, y+17+bob, 11, 5);
    ctx.fillRect(x+9+leg*.7, y+14+bob-leg*.5, 13, 5);
    ctx.fillStyle = char.shorts; ctx.fillRect(x-13, y-11+bob, 27, 14);
    ctx.fillStyle = char.shirt;  ctx.fillRect(x-16, y-36+bob, 32, 27);
    ctx.fillStyle = char.accent; ctx.fillRect(x-3,  y-36+bob, 6, 27);
    ctx.fillStyle = char.skin;
    ctx.fillRect(x-25, y-31+bob, 9, 6);
    ctx.fillRect(x+16, y-31+bob, 9, 6);
    ctx.fillRect(x-11, y-55+bob, 22, 20);
    ctx.fillStyle = char.hair;
    if (char.id === 'meeks')   { ctx.fillRect(x-11,y-57+bob,22,3); }
    else if (char.id === 'alan')    { ctx.fillRect(x-11,y-62+bob,22,8); ctx.fillRect(x-13,y-57+bob,4,5); }
    else if (char.id === 'thierry') { ctx.fillRect(x-12,y-60+bob,24,6); }
    else if (char.id === 'lineker') { ctx.fillRect(x-11,y-61+bob,22,7); ctx.fillRect(x-13,y-56+bob,4,4); ctx.fillRect(x+9,y-56+bob,4,4); }
    else                            { ctx.fillRect(x-3,y-67+bob,6,13); ctx.fillRect(x-11,y-60+bob,22,6); }
    ctx.fillStyle = '#111827';
    ctx.fillRect(x-5+player.face, y-47+bob, 3, 3);
    ctx.fillRect(x+2+player.face, y-47+bob, 3, 3);
    ctx.fillRect(x-1, y-42+bob, 2, 2);
    ctx.fillRect(x-4, y-38+bob, 8, 2);
    ctx.fillStyle = '#ff9980'; ctx.fillRect(x-3, y-37+bob, 6, 1);
  }

  function drawBall(x, y) {
    const r = ball.r;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(Math.round(x-11), Math.round(GROUND_Y+2), 22, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x-r), Math.round(y-r+2), r*2, r*2-4);
    ctx.fillRect(Math.round(x-r+2), Math.round(y-r), r*2-4, r*2);
    ctx.fillStyle = '#111111';
    ctx.fillRect(Math.round(x-2),Math.round(y-2),4,4);
    ctx.fillRect(Math.round(x-7),Math.round(y-6),4,4);
    ctx.fillRect(Math.round(x+4),Math.round(y-5),4,4);
    ctx.fillRect(Math.round(x-6),Math.round(y+4),4,4);
    ctx.fillRect(Math.round(x+3),Math.round(y+5),4,4);
    ctx.strokeStyle='#333'; ctx.lineWidth=1; ctx.strokeRect(Math.round(x-r),Math.round(y-r+2),r*2,r*2-4);
  }

  function drawHud() {
    panel(5,5,120,44);
    pixelText('SCORE',13,22,8);
    pixelText(String(score).padStart(3,'0'),13,42,16,'#ffd43b');
    panel(145,5,120,44);
    pixelText('COMBO',153,22,8,'#ffd43b');
    pixelText('x'+getCombo(),192,44,18,'#ff4fd8');
  }

  function drawMenu() {
    pixelText('KEEPY-UPPY', W/2-textWidth('KEEPY-UPPY',18)/2, 120, 18, '#dbeafe','#0b4b8e');
    pixelText('KING', W/2-textWidth('KING',28)/2, 155, 28, '#ffd43b','#7c2d12');
    ctx.fillStyle='#ffd43b';
    ctx.fillRect(188,96,8,6); ctx.fillRect(198,92,8,10); ctx.fillRect(208,96,8,6); ctx.fillRect(185,102,36,6);
    if (data.best > 0)
      pixelText(`BEST: ${data.best}`, W/2-textWidth(`BEST: ${data.best}`,9)/2, 200, 9, '#ffd43b');
    addButton('PLAY', W/2-60, 225, 120, 44, () => { state = 'charselect'; });
    pixelText(`COINS: ${data.coins}`, W/2-textWidth(`COINS: ${data.coins}`,8)/2, 300, 8, '#41f8ff');
  }

  function drawCharSelect() {
    pixelText('CHOOSE YOUR', W/2-textWidth('CHOOSE YOUR',10)/2, 38, 10, '#ffffff');
    pixelText('PUNDIT', W/2-textWidth('PUNDIT',17)/2, 60, 17, '#ffd43b');

    const cardW=115, cardH=105, gap=8;
    const row1x = (W - 2*cardW - gap) / 2;
    const positions = [
      [row1x,           72],
      [row1x+cardW+gap, 72],
      [row1x,           185],
      [row1x+cardW+gap, 185],
      [(W-cardW)/2,     298],
    ];

    positions.forEach(([cx,cy], i) => {
      const char = CHARACTERS[i];
      const sel = selectedChar.id === char.id;
      ctx.fillStyle = sel ? '#1d4ed8' : '#0b1029';
      ctx.fillRect(cx,cy,cardW,cardH);
      ctx.strokeStyle = sel ? '#ffd43b' : '#41f8ff'; ctx.lineWidth=2; ctx.strokeRect(cx,cy,cardW,cardH);
      if (sel) { ctx.strokeStyle='#ffd43b'; ctx.lineWidth=1; ctx.strokeRect(cx+3,cy+3,cardW-6,cardH-6); }
      drawCharPortrait(cx+cardW/2, cy+58, char);
      pixelText(char.name, cx+cardW/2-textWidth(char.name,7)/2, cy+cardH-8, 7, '#ffffff');
      addClickZone(cx,cy,cardW,cardH, () => { selectedChar = char; });
    });

    addButton('KICK OFF!', W/2-68, 415, 136, 36, () => resetGame());
  }

  function drawCharPortrait(cx, cy, char) {
    // Body
    ctx.fillStyle = char.shirt;  ctx.fillRect(cx-13,cy+2,26,20);
    ctx.fillStyle = char.accent; ctx.fillRect(cx-3,cy+2,6,20);
    // Neck
    ctx.fillStyle = char.skin; ctx.fillRect(cx-4,cy-4,8,8);
    // Head
    ctx.fillStyle = char.skin; ctx.fillRect(cx-10,cy-22,20,18);
    // Ears
    ctx.fillRect(cx-13,cy-17,3,5); ctx.fillRect(cx+10,cy-17,3,5);
    // Hair
    ctx.fillStyle = char.hair;
    if (char.id === 'meeks')        { ctx.fillRect(cx-10,cy-24,20,3); }
    else if (char.id === 'alan')    { ctx.fillRect(cx-10,cy-29,20,8); ctx.fillRect(cx-12,cy-24,3,5); }
    else if (char.id === 'thierry') { ctx.fillRect(cx-11,cy-27,22,6); }
    else if (char.id === 'lineker') { ctx.fillRect(cx-10,cy-26,20,6); ctx.fillRect(cx-12,cy-22,3,4); ctx.fillRect(cx+9,cy-22,3,4); }
    else { ctx.fillRect(cx-2,cy-33,4,12); ctx.fillRect(cx-10,cy-26,20,5); } // zlatan spike
    // Eyes
    ctx.fillStyle = '#111827';
    ctx.fillRect(cx-6,cy-14,3,3); ctx.fillRect(cx+3,cy-14,3,3);
    ctx.fillRect(cx-1,cy-9,2,2);  // nose
    ctx.fillRect(cx-4,cy-5,8,2);  // mouth
    ctx.fillStyle='#ff9980'; ctx.fillRect(cx-3,cy-4,6,1);
  }

  function drawGameOver() {
    ctx.fillStyle='rgba(3,7,18,.91)'; ctx.fillRect(10,55,W-20,315);
    ctx.strokeStyle='#41f8ff'; ctx.lineWidth=2; ctx.strokeRect(10,55,W-20,315);
    ctx.strokeStyle='#ffd43b'; ctx.lineWidth=1; ctx.strokeRect(14,59,W-28,307);

    pixelText('GAME OVER', W/2-textWidth('GAME OVER',16)/2, 94, 16,'#ff6b6b');
    pixelText(`SCORE  ${score}`,    W/2-textWidth(`SCORE  ${score}`,11)/2,   130, 11,'#ffd43b');
    pixelText(`BEST   ${data.best}`,W/2-textWidth(`BEST   ${data.best}`,9)/2,157, 9, '#ffffff');
    pixelText(`COMBO  x${bestRunCombo}`, W/2-textWidth(`COMBO  x${bestRunCombo}`,9)/2, 181,9,'#ff4fd8');
    pixelText(`PERFECTS  ${perfects}`,   W/2-textWidth(`PERFECTS  ${perfects}`,9)/2,   205,9,'#65ff7a');
    pixelText(`+${earnedCoins} COINS`,   W/2-textWidth(`+${earnedCoins} COINS`,9)/2,   229,9,'#41f8ff');

    addButton('RETRY', 18,  268, 70, 30, () => resetGame());
    addButton('SHARE', 100, 268, 70, 30, shareScore);
    addButton('MENU',  182, 268, 70, 30, () => { state='menu'; });
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
      ctx.fillRect(Math.round(p.x),Math.round(p.y),3,3);
    });
    ctx.globalAlpha=1;
    floatTexts.forEach(t => {
      ctx.globalAlpha=Math.max(0,Math.min(1,t.life*2));
      pixelText(t.text,Math.round(t.x-textWidth(t.text,7)/2),Math.round(t.y),7,t.colour,'#000000');
    });
    ctx.globalAlpha=1;
  }

  function drawToast(text) {
    const tw=textWidth(text,8)+20;
    panel(W/2-tw/2,14,tw,26);
    pixelText(text,W/2-textWidth(text,8)/2,31,8,'#ffd43b');
  }

  function panel(x,y,w,h) {
    ctx.fillStyle='#030712'; ctx.fillRect(x+3,y+3,w,h);
    ctx.fillStyle='#0b1029'; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='#41f8ff'; ctx.lineWidth=2; ctx.strokeRect(x,y,w,h);
    ctx.strokeStyle='#ffd43b'; ctx.lineWidth=1; ctx.strokeRect(x+3,y+3,w-6,h-6);
  }

  function addButton(label,x,y,w,h,action,enabled=true) {
    ctx.fillStyle=enabled?'#1d4ed8':'#334155'; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle=enabled?'#ffd43b':'#64748b'; ctx.lineWidth=2; ctx.strokeRect(x,y,w,h);
    pixelText(label,x+w/2-textWidth(label,7)/2,y+h/2+3,7,enabled?'#ffffff':'#94a3b8');
    if (enabled) clicks.push({x,y,w,h,action});
  }

  function addClickZone(x,y,w,h,action) { clicks.push({x,y,w,h,action}); }

  function pixelText(text,x,y,size=8,fill='#ffffff',shadow='#000000') {
    ctx.font=`900 ${size}px ui-monospace,Menlo,Consolas,monospace`;
    ctx.textBaseline='alphabetic';
    ctx.fillStyle=shadow; ctx.fillText(text,Math.round(x+1),Math.round(y+1));
    ctx.fillStyle=fill;   ctx.fillText(text,Math.round(x),Math.round(y));
  }

  function textWidth(text,size=8) {
    ctx.font=`900 ${size}px ui-monospace,Menlo,Consolas,monospace`;
    return ctx.measureText(text).width;
  }

  function clamp(v,min,max) { return Math.max(min,Math.min(max,v)); }

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
    if (e.code==='Space')    { e.preventDefault(); if(state==='playing') tryKick(); }
    if (e.code==='ArrowLeft'||e.code==='KeyA')  keys.left=true;
    if (e.code==='ArrowRight'||e.code==='KeyD') keys.right=true;
    if (e.code==='Enter'&&state==='menu') state='charselect';
    if (e.code==='Escape') state='menu';
  });
  window.addEventListener('keyup', e => {
    if (e.code==='ArrowLeft'||e.code==='KeyA')  keys.left=false;
    if (e.code==='ArrowRight'||e.code==='KeyD') keys.right=false;
  });

  function loop(now) {
    const dt=Math.min(0.033,(now-last)/1000||0);
    last=now; update(dt); draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
