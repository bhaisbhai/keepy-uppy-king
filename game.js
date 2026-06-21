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
    player = { x: W / 2, y: PLAYER_Y, leg: 0, face: 1, shuffle: 0,
               wander: 0, wanderTarget: 0, wanderTimer: 0, hasTap: true };
    ball = { x: W / 2 + 2, y: 387, vx: 8, vy: 16, r: 11, spin: 0, canKick: true };
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
    if (!player.hasTap) return; // Only allow one tap attempt per bounce
    
    player.hasTap = false; // Consume tap immediately
    
    const footY = PLAYER_Y - 24;
    const dy = Math.abs(ball.y - footY);
    const dx = Math.abs(ball.x - player.x);
    if (dy >= 48 || dx >= 56 || ball.vy <= -133) {
      // Trigger whiff animation and face the ball
      const side = Math.sign(ball.x - player.x) || player.face;
      player.leg = 8;
      player.face = side;
      addFloatText(ball.y < footY ? 'TOO EARLY!' : 'REACH!', player.x, PLAYER_Y - 73, '#ff6b6b');
      return;
    }
    if (!ball.canKick) return;
    ball.canKick = false;
    
    player.hasTap = true; // Refund tap on successful kick
    
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
    // Unlock kick once ball has risen at least 100px above foot level
    if (!ball.canKick && ball.y < PLAYER_Y - 100) ball.canKick = true;

    // Wander: smoothly drift toward a random offset, changing target every 0.5-1.3s
    player.wanderTimer -= dt;
    if (player.wanderTimer <= 0) {
      player.wanderTarget = (Math.random() - 0.5) * 64;
      player.wanderTimer = 0.5 + Math.random() * 0.8;
    }
    player.wander += (player.wanderTarget - player.wander) * Math.min(1, dt * 2.5);

    // Auto-tracking logic (no manual horizontal steering)
    const autoStep = Math.max(24, 120 - level * 7) * dt;
    const dx = (ball.x + player.wander) - player.x;
    player.x += Math.sign(dx) * Math.min(Math.abs(dx), autoStep);
    player.x = clamp(player.x, 45, W - 45);
    player.shuffle += dt * 3.5;

    const gravity = 400 + level * 47;
    ball.vy += gravity * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spin += ball.vx * dt * 0.04;
    ball.vx *= (0.994 - Math.min(0.003, level * 0.00012));

    if (ball.x < 19) { ball.x = 19; ball.vx = Math.abs(ball.vx) * 0.62; }
    if (ball.x > W - 19) { ball.x = W - 19; ball.vx = -Math.abs(ball.vx) * 0.62; }
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
    // Sky gradient (Deep night blue to purple)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#030512');
    skyGrad.addColorStop(0.3, '#090d2e');
    skyGrad.addColorStop(0.6, '#131842');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Glowing stars
    for (let i = 0; i < 35; i++) {
      ctx.fillStyle = ['rgba(255, 212, 59, 0.45)', 'rgba(65, 248, 255, 0.45)', 'rgba(255, 255, 255, 0.6)'][i % 3];
      const sx = (i * 79 + 17) % W;
      const sy = (i * 37 + 11) % 150;
      ctx.fillRect(sx, sy, i % 2 === 0 ? 2 : 1, i % 2 === 0 ? 2 : 1);
    }

    // Floodlight glow cones
    drawFloodlight(73, 93); 
    drawFloodlight(287, 91);

    // Stadium seating stand silhouette
    ctx.fillStyle = '#0a0d2a';
    ctx.beginPath();
    ctx.moveTo(0, 200);
    ctx.bezierCurveTo(W * 0.25, 175, W * 0.75, 175, W, 200);
    ctx.lineTo(W, 311);
    ctx.lineTo(0, 311);
    ctx.closePath();
    ctx.fill();

    // Dark stadium seating structure
    ctx.fillStyle = '#0b0f34';
    ctx.fillRect(0, 230, W, 81);
    
    // Colorful crowd spectators matrix
    for (let cy = 236; cy < 305; cy += 6) {
      for (let cx = 4; cx < W; cx += 8) {
        ctx.fillStyle = ['#1e293b', '#3b82f6', '#ef4444', '#eab308', '#22c55e', '#ec4899', '#ffffff', '#06b6d4'][(cx * 17 + cy * 11) % 8];
        ctx.fillRect(cx + (cy % 4), cy, 3, 3);
      }
    }

    // Billboard ads at front of stands
    const ads = [['PLAY EVERY DAY!', '#1e3a8a', 130], ['KEEPY KING!', '#991b1b', 100], ['GOAL!', '#065f46', 130]];
    ads.reduce((bx, [t, c, w]) => {
      ctx.fillStyle = c;
      ctx.fillRect(bx, 297, w, 14);
      ctx.fillStyle = '#ffffff';
      pixelText(t, bx + 8, 307, 6);
      return bx + w;
    }, 0);

    // Grass pitch gradient
    const pitchGrad = ctx.createLinearGradient(0, 311, 0, H);
    pitchGrad.addColorStop(0, '#135c24');
    pitchGrad.addColorStop(1, '#093a15');
    ctx.fillStyle = pitchGrad;
    ctx.fillRect(0, 311, W, H - 311);

    // Diagonal grass cut stripes
    for (let px = -60; px < W; px += 64) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.beginPath();
      ctx.moveTo(px, 311);
      ctx.lineTo(px + 40, 311);
      ctx.lineTo(px + 90, H);
      ctx.lineTo(px + 40, H);
      ctx.closePath();
      ctx.fill();
    }

    // White pitch markings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    
    // Halfway line
    ctx.beginPath();
    ctx.moveTo(W / 2, 311);
    ctx.lineTo(W / 2, H);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(W / 2, GROUND_Y, 77, Math.PI, 0);
    ctx.stroke();
  }

  function drawFloodlight(x, y) {
    // Draw glowing light beam using radial gradient
    const grad = ctx.createRadialGradient(x, y, 2, x, y + 220, 160);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
    grad.addColorStop(0.3, 'rgba(65, 248, 255, 0.08)');
    grad.addColorStop(1, 'rgba(65, 248, 255, 0)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 120, H);
    ctx.lineTo(x + 120, H);
    ctx.closePath();
    ctx.fill();
    
    // Draw the physical lights grid
    ctx.fillStyle = '#ffffff';
    for (let fy = 0; fy < 3; fy++) {
      for (let fx = 0; fx < 3; fx++) {
        ctx.beginPath();
        ctx.arc(x + fx * 6 - 6, y + fy * 6, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawKickZone() {
    const footY = PLAYER_Y - 24;
    const px = Math.round(player.x);
    ctx.strokeStyle = 'rgba(65, 248, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(px - 53, footY - 48, 107, 96);
    ctx.setLineDash([]);
  }

  function drawPundit(cx, cy, char, bob, leg, face, ballX, ballY) {
    ctx.save();
    
    // Smooth shadow on the pitch
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 18 + bob, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 1. Draw Legs
    ctx.fillStyle = char.skin;
    const legOffset = Math.round(leg);
    const lx = Math.round(legOffset * 0.9);
    const ly = Math.round(legOffset * 0.5);
    const lh = Math.round(legOffset * 0.7);

    // Left Leg (standing)
    ctx.fillRect(cx - 13, cy - 3 + bob, 6, 22);
    ctx.fillStyle = '#111827'; // Boot
    ctx.fillRect(cx - 15, cy + 19 + bob, 9, 6);

    // Right Leg (kicking/standing)
    ctx.fillStyle = char.skin;
    ctx.fillRect(cx + 7, cy - 3 + bob - ly, 6 + lx, 22 - lh);
    ctx.fillStyle = '#111827'; // Boot
    ctx.fillRect(cx + 9 + lx, cy + 19 + bob - ly, 9, 6);

    // 2. Shorts
    ctx.fillStyle = char.shorts;
    ctx.fillRect(cx - 15, cy - 13 + bob, 31, 13);
    
    // Shorts hem highlight
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(cx - 15, cy - 3 + bob, 31, 3);

    // 3. Torso (Shirt)
    ctx.fillStyle = char.shirt;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(cx - 19, cy - 47 + bob, 38, 35, [8, 8, 0, 0]);
    } else {
      ctx.rect(cx - 19, cy - 47 + bob, 38, 35);
    }
    ctx.fill();

    // Sleeves / Arms
    ctx.fillRect(cx - 27, cy - 41 + bob, 9, 14); // Left sleeve
    ctx.fillRect(cx + 18, cy - 41 + bob, 9, 14); // Right sleeve
    
    ctx.fillStyle = char.skin;
    ctx.fillRect(cx - 26, cy - 27 + bob, 7, 10); // Left hand
    ctx.fillRect(cx + 19, cy - 27 + bob, 7, 10); // Right hand

    // Shirt detailing (stripes/collars/suits)
    if (char.id === 'alan') {
      // Newcastle stripes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 11, cy - 47 + bob, 5, 35);
      ctx.fillRect(cx + 6, cy - 47 + bob, 5, 35);
    } else if (char.id === 'thierry') {
      // Arsenal white sleeves
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 27, cy - 41 + bob, 9, 14);
      ctx.fillRect(cx + 18, cy - 41 + bob, 9, 14);
    } else if (char.id === 'meeks') {
      // Pundit suit (Micah Richards)
      ctx.fillStyle = '#ffffff'; // White shirt V-collar
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 47 + bob);
      ctx.lineTo(cx + 4, cy - 47 + bob);
      ctx.lineTo(cx, cy - 35 + bob);
      ctx.closePath();
      ctx.fill();
      
      ctx.fillStyle = '#dc2626'; // Red tie
      ctx.fillRect(cx - 1, cy - 42 + bob, 2, 12);
      
      ctx.fillStyle = char.accent; // Gold button highlights
      ctx.fillRect(cx - 3, cy - 29 + bob, 2, 2);
      ctx.fillRect(cx - 3, cy - 23 + bob, 2, 2);
    } else if (char.id === 'zlatan') {
      // Sweden yellow shirt accent line
      ctx.fillStyle = char.accent;
      ctx.fillRect(cx - 19, cy - 47 + bob, 38, 3);
      ctx.fillRect(cx - 19, cy - 30 + bob, 38, 2);
    } else if (char.id === 'lineker') {
      // England white V-neck collar
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 47 + bob);
      ctx.lineTo(cx + 5, cy - 47 + bob);
      ctx.lineTo(cx, cy - 41 + bob);
      ctx.closePath();
      ctx.fill();
    }

    // 4. Neck
    ctx.fillStyle = char.skin;
    ctx.fillRect(cx - 5, cy - 54 + bob, 10, 8);

    // 5. Head
    const hx = cx;
    const hy = cy - 69 + bob;
    
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, Math.PI * 2);
    ctx.fill();

    // Gary Lineker big ears
    if (char.id === 'lineker') {
      ctx.beginPath();
      ctx.arc(hx - 15, hy, 4.5, 0, Math.PI * 2);
      ctx.arc(hx + 15, hy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(hx - 14, hy, 2.5, 0, Math.PI * 2);
      ctx.arc(hx + 14, hy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Hair & Facial Hair
    if (char.id === 'meeks') {
      // Micah Richards neat fade
      ctx.fillStyle = '#1a0800';
      ctx.beginPath();
      ctx.arc(hx, hy - 4, 14.5, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(hx - 14, hy - 6, 28, 6);
      
      // Micah Beard
      ctx.fillRect(hx - 11, hy + 7, 22, 5);
      ctx.fillRect(hx - 7, hy + 11, 14, 3);
    } else if (char.id === 'zlatan') {
      // Zlatan dark hair + ponytail man-bun
      ctx.fillStyle = '#2a1000';
      ctx.beginPath();
      ctx.arc(hx, hy - 4, 14.2, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx + 11 * face, hy - 11, 4.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Zlatan Goatee/Mustache
      ctx.fillRect(hx - 8, hy + 5, 16, 2);
      ctx.fillRect(hx - 3, hy + 7, 6, 6);
    } else if (char.id === 'lineker') {
      // Lineker silver-grey styled hair
      ctx.fillStyle = '#cccccc';
      ctx.beginPath();
      ctx.arc(hx, hy - 4, 14.5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      ctx.fillRect(hx - 14, hy - 6, 2, 7);
      ctx.fillRect(hx + 12, hy - 6, 2, 7);
      
      // Grey stubble
      ctx.fillStyle = '#b0b0b0';
      ctx.fillRect(hx - 6, hy + 11, 12, 2);
    } else if (char.id === 'thierry') {
      // Thierry detailed goatee
      ctx.fillStyle = '#22110c';
      ctx.fillRect(hx - 9, hy + 6, 18, 2);
      ctx.fillRect(hx - 3, hy + 8, 6, 6);
      ctx.fillRect(hx - 7, hy + 10, 14, 2);
    } else if (char.id === 'alan') {
      // Alan Shearer side stubble shadow
      ctx.fillStyle = '#d0b090';
      ctx.fillRect(hx - 14, hy - 2, 2, 5);
      ctx.fillRect(hx + 12, hy - 2, 2, 5);
    }

    // 7. Cartoon Eyes (Whites)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.arc(hx - 5, hy - 1, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(hx + 5, hy - 1, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 8. Pupil Eye-Tracking
    let peX = 0, peY = 0;
    if (ballX !== null && ballY !== null) {
      const dx = ballX - hx;
      const dy = ballY - hy;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        peX = (dx / dist) * 1.5;
        peY = (dy / dist) * 1.5;
      }
    } else {
      peX = 1 * face;
    }

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(hx - 5 + peX, hy - 1 + peY, 1.5, 0, Math.PI * 2);
    ctx.arc(hx + 5 + peX, hy - 1 + peY, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 9. Eyebrows
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    if (char.id === 'zlatan') {
      ctx.beginPath();
      ctx.moveTo(hx - 8, hy - 5); ctx.lineTo(hx - 3, hy - 4);
      ctx.moveTo(hx + 3, hy - 5); ctx.lineTo(hx + 8, hy - 6);
      ctx.stroke();
    } else if (char.id === 'thierry') {
      ctx.beginPath();
      ctx.moveTo(hx - 8, hy - 5); ctx.lineTo(hx - 3, hy - 6);
      ctx.moveTo(hx + 3, hy - 4); ctx.lineTo(hx + 8, hy - 6);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(hx - 8, hy - 5); ctx.lineTo(hx - 3, hy - 5);
      ctx.moveTo(hx + 3, hy - 5); ctx.lineTo(hx + 8, hy - 5);
      ctx.stroke();
    }

    // 10. Mouths
    if (char.id === 'meeks') {
      // Micah Richards legendary wide laugh
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#5a1200';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy + 5, 5, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx - 3, hy + 4, 6, 1);
    } else if (char.id === 'alan') {
      // Alan deadpan straight mouth
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx - 4, hy + 6);
      ctx.lineTo(hx + 4, hy + 6);
      ctx.stroke();
    } else if (char.id === 'thierry') {
      // Thierry smirk
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx - 4, hy + 6);
      ctx.lineTo(hx + 4, hy + 5);
      ctx.stroke();
    } else if (char.id === 'lineker') {
      // Gary Lineker friendly open smile
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy + 5, 3.5, 0, Math.PI);
      ctx.stroke();
    } else if (char.id === 'zlatan') {
      // Zlatan cocky smirk
      ctx.strokeStyle = '#2a1000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx - 4, hy + 6);
      ctx.lineTo(hx + 3, hy + 4);
      ctx.stroke();
    }

    // 11. Big Meeks Glasses
    if (char.id === 'meeks') {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx - 9, hy - 3, 6, 4);
      ctx.strokeRect(hx + 3, hy - 3, 6, 4);
      ctx.beginPath();
      ctx.moveTo(hx - 3, hy - 1);
      ctx.lineTo(hx + 3, hy - 1);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPlayer(x, y, char) {
    const px = Math.round(x);
    const py = Math.round(y);
    const bob = Math.round(Math.sin(player.shuffle) * 1.5);
    const leg = Math.round(Math.max(0, player.leg));
    const face = player.face;
    
    drawPundit(px, py, char, bob, leg, face, ball.x, ball.y);
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
    // In character select, draw the pundit at cx, cy + 18 (centered)
    // facing right with no bobbing, no leg kick, and looking slightly right
    drawPundit(cx, cy + 18, char, 0, 0, 1, null, null);
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
    ctx.save();
    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    
    // Glass background
    const glass = ctx.createLinearGradient(x, y, x, y + h);
    glass.addColorStop(0, 'rgba(16, 24, 61, 0.85)');
    glass.addColorStop(1, 'rgba(8, 12, 36, 0.95)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
    else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.shadowColor = 'transparent'; // Reset shadow

    // Glowing borders
    ctx.strokeStyle = 'rgba(65, 248, 255, 0.4)'; // Cyan glow border
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
    else ctx.rect(x, y, w, h);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 212, 59, 0.15)'; // inner gold trace
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 6);
    else ctx.rect(x + 3, y + 3, w - 6, h - 6);
    ctx.stroke();
    ctx.restore();
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
