(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const W = 360;
  const H = 640;
  
  // Use a scale factor to lower the canvas resolution for that retro Street Fighter pixel density
  const SCALE_FACTOR = 0.5; // 180x320 physical resolution
  canvas.width = W * SCALE_FACTOR;
  canvas.height = H * SCALE_FACTOR;
  ctx.imageSmoothingEnabled = false;

  const GROUND_Y = 584;
  const PLAYER_Y = 563;

  const CHARACTERS = [
    { id: 'meeks',   name: 'BIG MEEKS', skin: '#5c3a1e', hair: '#1a0800', shirt: '#cc2200', accent: '#ffd43b', shorts: '#1d4ed8', trackMult: 0.85, reachMult: 0.9, chaosMult: 1.15 },
    { id: 'alan',    name: 'ALAN',      skin: '#f4c28b', hair: null,      shirt: '#111111', accent: '#eeeeee', shorts: '#111111', trackMult: 1.0, reachMult: 1.0, chaosMult: 1.0 },
    { id: 'thierry', name: 'THIERRY',   skin: '#6b3420', hair: null,      shirt: '#cc0000', accent: '#ffffff', shorts: '#ffffff', trackMult: 1.15, reachMult: 1.1, chaosMult: 0.85 },
    { id: 'lineker', name: 'LINEKER',   skin: '#f0c080', hair: '#aaaaaa', shirt: '#0033cc', accent: '#ffffff', shorts: '#0033cc', trackMult: 1.0, reachMult: 1.0, chaosMult: 1.0 },
    { id: 'zlatan',  name: 'ZLATAN',    skin: '#c88848', hair: '#2a1000', shirt: '#000080', accent: '#ffcc00', shorts: '#000080', trackMult: 1.0, reachMult: 1.0, chaosMult: 1.0 },
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
  let daylightProgress = 0;
  let cloudTimer = 0;

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
    ball = { x: W / 2 + 2, y: 387, vx: 8, vy: 16, r: 11, spin: 0, canKick: true, wobblePhase: 0 };
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
    if (!ball.canKick) return;  // Make sure ball can be kicked
    
    player.hasTap = false; // Consume tap immediately
    
    const headY = PLAYER_Y - 69;
    const kneeY = PLAYER_Y - 44;
    const footY = PLAYER_Y - 24;
    const dx = Math.abs(ball.x - player.x);
    
    const reach = selectedChar.reachMult ?? 1.0;
    let touchType = null; // 'header', 'knee', 'volley', 'perfect_volley'
    let gainedPoints = 0;
    let bounceVy = 0;
    
    // Determine which zone the ball is in vertically
    if (ball.y < PLAYER_Y - 56) {
      // HEADER ZONE
      const dy = Math.abs(ball.y - headY);
      if (dy < (22 * reach) && dx < (32 * reach) && ball.vy > -133) {
        touchType = 'header';
        gainedPoints = 1;
        bounceVy = -230 - Math.min(40, level * 2);
      }
    } else if (ball.y >= PLAYER_Y - 56 && ball.y < PLAYER_Y - 34) {
      // KNEE ZONE
      const dy = Math.abs(ball.y - kneeY);
      if (dy < (14 * reach) && dx < (45 * reach) && ball.vy > -133) {
        touchType = 'knee';
        gainedPoints = 2;
        bounceVy = -310 - Math.min(50, level * 2.5);
      }
    } else {
      // VOLLEY / FOOT ZONE
      const dy = Math.abs(ball.y - footY);
      if (dy < (18 * reach) && dx < (56 * reach) && ball.vy > -133) {
        const isPerfect = dy < (10 * reach) && dx < (27 * reach) && ball.vy > 0;
        touchType = isPerfect ? 'perfect_volley' : 'volley';
        gainedPoints = isPerfect ? 5 : 3;
        bounceVy = isPerfect ? -430 - Math.min(60, level * 3) : -375 - Math.min(45, level * 3);
      }
    }
    
    if (!touchType) {
      // WHIFF!
      const side = Math.sign(ball.x - player.x) || player.face;
      player.leg = 8;
      player.face = side;
      
      let whiffMsg = 'REACH!';
      if (ball.y < headY - 15) whiffMsg = 'TOO EARLY!';
      else if (ball.y > footY + 15) whiffMsg = 'TOO LATE!';
      
      addFloatText(whiffMsg, player.x, PLAYER_Y - 73, '#ff6b6b');
      return;
    }
    
    // Success! Lock the kick and refund the tap
    ball.canKick = false;
    player.hasTap = true;
    
    const combo = getCombo();
    const gained = gainedPoints * combo;
    score += gained;
    streak++;
    bestRunCombo = Math.max(bestRunCombo, combo);
    level = 1 + Math.floor(score / 5);
    
    const side = Math.sign(ball.x - player.x) || (Math.random() > 0.5 ? 1 : -1);
    const chaosMult = selectedChar.chaosMult ?? 1.0;
    const chaos = Math.min(133, level * 9) * chaosMult;
    
    ball.vy = bounceVy;
    ball.vx += side * (8 + Math.random() * 13) + (Math.random() - 0.5) * chaos;
    ball.vx = clamp(ball.vx, -147 - level * 4, 147 + level * 4);
    
    // Set animations based on touch type
    player.face = side;
    if (touchType === 'header') {
      player.leg = -5; // head nod animation
      addFloatText(`HEADER! +${gained}`, ball.x, ball.y - 13, '#60a5fa');
      burst(ball.x, ball.y, '#60a5fa', 5);
    } else if (touchType === 'knee') {
      player.leg = 4; // knee raise animation
      addFloatText(`KNEE-UP! +${gained}`, ball.x, ball.y - 13, '#fb923c');
      burst(ball.x, ball.y, '#fb923c', 7);
    } else if (touchType === 'perfect_volley') {
      perfects++;
      player.leg = 8; // full kick
      shake = 1.5; shakePhase = 0;
      addFloatText(`PERFECT! +${gained}`, ball.x, ball.y - 13, '#65ff7a');
      burst(ball.x, ball.y, '#65ff7a', 15);
    } else { // normal volley
      player.leg = 8;
      addFloatText(`VOLLEY! +${gained}`, ball.x, ball.y - 13, '#ffffff');
      burst(ball.x, ball.y, '#ffd43b', 8);
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
    
    // Daylight transition progress
    const targetDaylight = (state === 'playing' || state === 'gameover') && score >= 150 ? 1 : 0;
    daylightProgress += (targetDaylight - daylightProgress) * Math.min(1, dt * 2.0);
    cloudTimer += dt;

    if (state !== 'playing') return;
    if (shake > 0) { shake -= dt * 25; shakePhase += dt * 35; }
    if (player.leg > 0) player.leg = Math.max(0, player.leg - dt * 16);
    if (player.leg < 0) player.leg = Math.min(0, player.leg + dt * 16);
    
    // Re-enable kicking as soon as the ball starts falling
    if (ball.vy > 0) ball.canKick = true;

    // Wander: smoothly drift toward a random offset, changing target every 0.5-1.3s
    player.wanderTimer -= dt;
    if (player.wanderTimer <= 0) {
      player.wanderTarget = (Math.random() - 0.5) * 64;
      player.wanderTimer = 0.5 + Math.random() * 0.8;
    }
    player.wander += (player.wanderTarget - player.wander) * Math.min(1, dt * 2.5);

    // Auto-tracking logic (no manual horizontal steering)
    const trackMult = selectedChar.trackMult ?? 1.0;
    const autoStep = Math.max(24, 120 - level * 7) * trackMult * dt;
    const dx = (ball.x + player.wander) - player.x;
    player.x += Math.sign(dx) * Math.min(Math.abs(dx), autoStep);
    player.x = clamp(player.x, 45, W - 45);
    player.shuffle += dt * 3.5;

    const gravity = 400 + level * 47;
    ball.vy += gravity * dt;

    // Erratic knuckleball movement as game progresses (level >= 2)
    if (ball.vy > 0 && level >= 2) {
      const wobbleFreq = 6 + level * 0.5;
      const wobbleAmpX = Math.min(25, level * 3);
      const wobbleAmpY = Math.min(18, level * 2.2);
      
      ball.wobblePhase += dt * wobbleFreq;
      ball.vx += Math.sin(ball.wobblePhase) * wobbleAmpX * dt;
      ball.vy += Math.cos(ball.wobblePhase * 1.35) * wobbleAmpY * dt;

      // Add a bit of random wind gust turbulence at level 3+
      if (level >= 3) {
        ball.vx += (Math.random() - 0.5) * level * 4 * dt;
        ball.vy += (Math.random() - 0.5) * level * 3 * dt;
      }
    }

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
    
    // Scale everything down to render at retro pixel resolution
    ctx.scale(SCALE_FACTOR, SCALE_FACTOR);
    ctx.imageSmoothingEnabled = false;
    
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
    // --- 1. NIGHT BACKGROUND ---
    if (daylightProgress < 0.99) {
      ctx.save();
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
      ctx.restore();
    }

    // --- 2. DAYLIGHT BACKGROUND ---
    if (daylightProgress > 0) {
      ctx.save();
      ctx.globalAlpha = daylightProgress;
      
      // Day Sky gradient
      const daySkyGrad = ctx.createLinearGradient(0, 0, 0, H);
      daySkyGrad.addColorStop(0, '#7dd3fc');
      daySkyGrad.addColorStop(0.5, '#bae6fd');
      daySkyGrad.addColorStop(1, '#e0f2fe');
      ctx.fillStyle = daySkyGrad;
      ctx.fillRect(0, 0, W, H);

      // Golden Sun
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(W - 60, 50, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(254, 240, 138, 0.22)';
      ctx.beginPath();
      ctx.arc(W - 60, 50, 32, 0, Math.PI * 2);
      ctx.fill();

      // Drifting clouds
      drawPixelCloud(Math.round((cloudTimer * 4) % (W + 120) - 60), 30, 0.8);
      drawPixelCloud(Math.round((cloudTimer * 6 + 160) % (W + 160) - 80), 55, 1.2);
      drawPixelCloud(Math.round((cloudTimer * 3 + 80) % (W + 140) - 70), 85, 0.6);

      // Stadium seating stand silhouette
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.moveTo(0, 200);
      ctx.bezierCurveTo(W * 0.25, 175, W * 0.75, 175, W, 200);
      ctx.lineTo(W, 311);
      ctx.lineTo(0, 311);
      ctx.closePath();
      ctx.fill();

      // Day stadium seating structure
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 230, W, 81);
      
      // Day crowd spectators matrix
      for (let cy = 236; cy < 305; cy += 6) {
        for (let cx = 4; cx < W; cx += 8) {
          ctx.fillStyle = ['#475569', '#3b82f6', '#ef4444', '#eab308', '#22c55e', '#ec4899', '#ffffff', '#06b6d4'][(cx * 17 + cy * 11) % 8];
          ctx.fillRect(cx + (cy % 4), cy, 3, 3);
        }
      }

      // Billboard ads at front of stands
      const ads = [['PLAY EVERY DAY!', '#2563eb', 130], ['KEEPY KING!', '#dc2626', 100], ['GOAL!', '#16a34a', 130]];
      ads.reduce((bx, [t, c, w]) => {
        ctx.fillStyle = c;
        ctx.fillRect(bx, 297, w, 14);
        ctx.fillStyle = '#ffffff';
        pixelText(t, bx + 8, 307, 6);
        return bx + w;
      }, 0);

      // Grass pitch gradient
      const dayPitchGrad = ctx.createLinearGradient(0, 311, 0, H);
      dayPitchGrad.addColorStop(0, '#15803d');
      dayPitchGrad.addColorStop(1, '#166534');
      ctx.fillStyle = dayPitchGrad;
      ctx.fillRect(0, 311, W, H - 311);

      // Day Diagonal grass stripes
      for (let px = -60; px < W; px += 64) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.beginPath();
        ctx.moveTo(px, 311);
        ctx.lineTo(px + 40, 311);
        ctx.lineTo(px + 90, H);
        ctx.lineTo(px + 40, H);
        ctx.closePath();
        ctx.fill();
      }

      // Day White pitch markings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
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
      ctx.restore();
    }
  }

  function drawPixelCloud(cx, cy, scale) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(cx, cy, Math.round(32 * scale), Math.round(12 * scale));
    ctx.fillRect(cx + Math.round(6 * scale), cy - Math.round(6 * scale), Math.round(20 * scale), Math.round(6 * scale));
    ctx.fillRect(cx - Math.round(4 * scale), cy + Math.round(3 * scale), Math.round(8 * scale), Math.round(6 * scale));
    ctx.fillRect(cx + Math.round(28 * scale), cy + Math.round(3 * scale), Math.round(8 * scale), Math.round(6 * scale));
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
    const legOffset = Math.round(Math.max(0, leg));
    const lx = Math.round(legOffset * 0.9);
    const ly = Math.round(legOffset * 0.5);
    const lh = Math.round(legOffset * 0.7);

    // Left Leg (standing)
    ctx.fillRect(cx - 13, cy - 3 + bob, 6, 22);
    ctx.strokeStyle = '#271008';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx - 13, cy - 3 + bob, 6, 22);
    // Highlights on leg front (facing left)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(cx - 13, cy - 3 + bob, 2, 22);

    ctx.fillStyle = '#111827'; // Boot
    ctx.fillRect(cx - 15, cy + 19 + bob, 9, 6);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(cx - 15, cy + 19 + bob, 9, 6);
    ctx.fillStyle = '#ffffff'; // White sole
    ctx.fillRect(cx - 15, cy + 24 + bob, 9, 1);

    // Right Leg (kicking/standing)
    ctx.fillStyle = char.skin;
    ctx.fillRect(cx + 7, cy - 3 + bob - ly, 6 + lx, 22 - lh);
    ctx.strokeStyle = '#271008';
    ctx.strokeRect(cx + 7, cy - 3 + bob - ly, 6 + lx, 22 - lh);

    ctx.fillStyle = '#111827'; // Boot
    ctx.fillRect(cx + 9 + lx, cy + 19 + bob - ly, 9, 6);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(cx + 9 + lx, cy + 19 + bob - ly, 9, 6);
    ctx.fillStyle = '#ffffff'; // White sole
    ctx.fillRect(cx + 9 + lx, cy + 24 + bob - ly, 9, 1);

    // 2. Shorts / Trousers
    ctx.fillStyle = char.shorts;
    ctx.fillRect(cx - 15, cy - 13 + bob, 31, 13);
    ctx.strokeStyle = '#090a14';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 15, cy - 13 + bob, 31, 13);
    
    // Shorts highlights & shadows
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(cx - 15, cy - 13 + bob, 3, 13); // Left edge highlight
    ctx.fillRect(cx - 15, cy - 13 + bob, 31, 3);  // Top edge highlight
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(cx + 12, cy - 13 + bob, 3, 13);  // Right edge shadow
    
    // Shorts hem highlight
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(cx - 15, cy - 3 + bob, 31, 3);

    // 3. Torso (Shirt / Suit)
    ctx.fillStyle = char.shirt;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(cx - 19, cy - 47 + bob, 38, 35, [8, 8, 0, 0]);
    } else {
      ctx.rect(cx - 19, cy - 47 + bob, 38, 35);
    }
    ctx.fill();
    ctx.strokeStyle = '#090a14';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 16-bit Torso Shading (highlights and muscle crease)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(cx - 19, cy - 47 + bob, 4, 35); // Left highlight
    ctx.fillRect(cx - 19, cy - 47 + bob, 38, 4);  // Top highlight
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(cx + 15, cy - 47 + bob, 4, 35); // Right shadow
    ctx.fillRect(cx - 19, cy - 16 + bob, 38, 4);  // Bottom shadow
    ctx.fillRect(cx - 1, cy - 43 + bob, 2, 28);   // Chest line division

    // Sleeves / Arms
    ctx.fillStyle = char.shirt;
    ctx.fillRect(cx - 27, cy - 41 + bob, 9, 14); // Left sleeve
    ctx.strokeStyle = '#090a14';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 27, cy - 41 + bob, 9, 14);

    ctx.fillStyle = char.shirt;
    ctx.fillRect(cx + 18, cy - 41 + bob, 9, 14); // Right sleeve
    ctx.strokeRect(cx + 18, cy - 41 + bob, 9, 14);
    
    ctx.fillStyle = char.skin;
    ctx.fillRect(cx - 26, cy - 27 + bob, 7, 10); // Left hand
    ctx.strokeStyle = '#271008';
    ctx.strokeRect(cx - 26, cy - 27 + bob, 7, 10);

    ctx.fillStyle = char.skin;
    ctx.fillRect(cx + 19, cy - 27 + bob, 7, 10); // Right hand
    ctx.strokeRect(cx + 19, cy - 27 + bob, 7, 10);

    // Character Tattoos (Zlatan only)
    if (char.id === 'zlatan') {
      ctx.fillStyle = '#2d3748'; // Dark ink
      // Left arm ink details
      ctx.fillRect(cx - 25, cy - 25 + bob, 4, 3);
      ctx.fillRect(cx - 24, cy - 20 + bob, 3, 3);
      // Right arm ink details
      ctx.fillRect(cx + 20, cy - 26 + bob, 4, 3);
      ctx.fillRect(cx + 19, cy - 21 + bob, 3, 4);
    }

    // Shirt detailing (stripes/collars/suits)
    if (char.id === 'alan') {
      // Newcastle black-and-white stripes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 14, cy - 47 + bob, 5, 35);
      ctx.fillRect(cx - 3, cy - 47 + bob, 6, 35);
      ctx.fillRect(cx + 9, cy - 47 + bob, 5, 35);
      // Gold crest/star on Newcastle shirt
      ctx.fillStyle = '#ffd43b';
      ctx.fillRect(cx + 7 * face, cy - 39 + bob, 3, 3);
    } else if (char.id === 'thierry') {
      // Arsenal white sleeves
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 27, cy - 41 + bob, 9, 14);
      ctx.fillRect(cx + 18, cy - 41 + bob, 9, 14);
      ctx.strokeStyle = '#090a14';
      ctx.strokeRect(cx - 27, cy - 41 + bob, 9, 14);
      ctx.strokeRect(cx + 18, cy - 41 + bob, 9, 14);
      // White collar trim
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 7, cy - 47 + bob, 14, 3);
    } else if (char.id === 'meeks') {
      // Micah Richards Pundit Suit (3-piece grey suit with V-cut lapels)
      ctx.fillStyle = '#374151'; // Darker grey suit lapels
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy - 47 + bob);
      ctx.lineTo(cx - 4, cy - 29 + bob);
      ctx.lineTo(cx - 19, cy - 29 + bob);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 15, cy - 47 + bob);
      ctx.lineTo(cx + 4, cy - 29 + bob);
      ctx.lineTo(cx + 19, cy - 29 + bob);
      ctx.fill();

      // White inner collared shirt
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 47 + bob);
      ctx.lineTo(cx + 5, cy - 47 + bob);
      ctx.lineTo(cx, cy - 36 + bob);
      ctx.closePath();
      ctx.fill();
      
      // Red silk tie
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(cx - 1.5, cy - 41 + bob, 3, 14);

      // Gold chain necklace (Micah signature!)
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy - 47 + bob, 6, 0, Math.PI);
      ctx.stroke();
    } else if (char.id === 'zlatan') {
      // Sweden yellow diagonal sash
      ctx.fillStyle = char.accent;
      ctx.beginPath();
      ctx.moveTo(cx - 19, cy - 42 + bob);
      ctx.lineTo(cx - 14, cy - 47 + bob);
      ctx.lineTo(cx + 19, cy - 25 + bob);
      ctx.lineTo(cx + 19, cy - 30 + bob);
      ctx.closePath();
      ctx.fill();
    } else if (char.id === 'lineker') {
      // Gary Lineker smart MOTD open-collar shirt
      ctx.fillStyle = char.skin; // chest skin reveal
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 47 + bob);
      ctx.lineTo(cx + 4, cy - 47 + bob);
      ctx.lineTo(cx, cy - 38 + bob);
      ctx.closePath();
      ctx.fill();
      // Collar flaps
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - 6, cy - 47 + bob, 3, 5);
      ctx.fillRect(cx + 3, cy - 47 + bob, 3, 5);
    }

    // 4. Neck
    ctx.fillStyle = char.skin;
    ctx.fillRect(cx - 5, cy - 54 + bob, 10, 8);

    // 5. Head & Custom Jawlines
    const hx = cx;
    const headNod = leg < 0 ? -leg * 1.5 : 0;
    const hy = cy - 69 + bob + headNod;
    
    ctx.fillStyle = char.skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#271008';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 16-bit Head Shading (Clipped spherical lighting)
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'; // top-left highlights
    ctx.beginPath();
    ctx.arc(hx - 5, hy - 5, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)'; // bottom-right shadow
    ctx.beginPath();
    ctx.arc(hx + 5, hy + 5, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Sculpt jawlines with outlines
    ctx.fillStyle = char.skin;
    ctx.strokeStyle = '#271008';
    ctx.lineWidth = 1.5;
    if (char.id === 'meeks') {
      // Micah strong square jaw
      ctx.fillRect(hx - 11, hy + 4, 22, 9);
      ctx.strokeRect(hx - 11, hy + 4, 22, 9);
    } else if (char.id === 'alan') {
      // Shearer square jaw
      ctx.fillRect(hx - 12, hy + 3, 24, 10);
      ctx.strokeRect(hx - 12, hy + 3, 24, 10);
    } else if (char.id === 'thierry') {
      // Thierry sleek tapered chin
      ctx.beginPath();
      ctx.moveTo(hx - 13, hy - 2);
      ctx.lineTo(hx - 9, hy + 12);
      ctx.lineTo(hx + 9, hy + 12);
      ctx.lineTo(hx + 13, hy - 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Gary Lineker big ears with inner folds and shading
    if (char.id === 'lineker') {
      ctx.fillStyle = char.skin;
      ctx.beginPath();
      ctx.ellipse(hx - 15, hy, 5.5, 6, Math.PI / 12, 0, Math.PI * 2);
      ctx.ellipse(hx + 15, hy, 5.5, 6, -Math.PI / 12, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner fold shadow
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx - 15, hy, 2.5, Math.PI, 0);
      ctx.arc(hx + 15, hy, 2.5, 0, Math.PI);
      ctx.stroke();
    } else {
      ctx.fillStyle = char.skin;
      ctx.beginPath();
      ctx.arc(hx - 14, hy, 2.5, 0, Math.PI * 2);
      ctx.arc(hx + 14, hy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Zlatan's prominent pointed nose or general nose shadow for others
    if (char.id === 'zlatan') {
      ctx.fillStyle = char.skin;
      ctx.beginPath();
      ctx.moveTo(hx + 11 * face, hy - 4);
      ctx.lineTo(hx + 18 * face, hy + 1); // Pointy tip
      ctx.lineTo(hx + 11 * face, hy + 4);
      ctx.closePath();
      ctx.fill();
      // Nose shadow/outline
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(hx + 10 * face, hy + 1, 2, 2);
    } else {
      // General subtle nose shape
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(hx + 11 * face, hy + 1, 2, 2);
    }

    // Alan Shearer shiny bald glare
    if (char.id === 'alan') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(hx + 4, hy - 8, 6, 3, Math.PI / 4, 0, Math.PI * 2);
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
      
      // Side fade stubble
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(hx - 14, hy - 1, 2, 6);
      ctx.fillRect(hx + 12, hy - 1, 2, 6);
      
      // Micah Beard
      ctx.fillStyle = '#1a0800';
      ctx.fillRect(hx - 11, hy + 7, 22, 5);
      ctx.fillRect(hx - 7, hy + 11, 14, 3);
    } else if (char.id === 'zlatan') {
      // Zlatan dark hair + ponytail man-bun (at the BACK of the head)
      ctx.fillStyle = '#2a1000';
      ctx.beginPath();
      ctx.arc(hx, hy - 4, 14.2, Math.PI, 0);
      ctx.fill();
      
      // Hair tie (red)
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(hx - 13 * face, hy - 7, 3, 4);
      
      // Ponytail bun
      ctx.fillStyle = '#1e0f06'; // Dark brown
      ctx.beginPath();
      ctx.arc(hx - 15 * face, hy - 5, 5, 0, Math.PI * 2);
      ctx.fill();
      
      // Zlatan Goatee/Mustache with curled tips
      ctx.fillStyle = '#2a1000';
      ctx.fillRect(hx - 8, hy + 5, 16, 2); // mustache
      ctx.fillRect(hx - 9, hy + 4, 2, 2);  // left curl tip
      ctx.fillRect(hx + 7, hy + 4, 2, 2);  // right curl tip
      ctx.fillRect(hx - 3, hy + 7, 6, 6);  // chin goatee
    } else if (char.id === 'lineker') {
      // Lineker silver-grey styled hair
      ctx.fillStyle = '#b5b5b5'; // Base silver-grey
      ctx.beginPath();
      ctx.arc(hx, hy - 4, 14.5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      ctx.fillRect(hx - 14, hy - 6, 2, 7);
      ctx.fillRect(hx + 12, hy - 6, 2, 7);
      
      // Bright highlights
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(hx - 8, hy - 14, 5, 2);
      ctx.fillRect(hx + 3, hy - 13, 5, 2);
      ctx.fillRect(hx - 4, hy - 16, 7, 2);
      
      // Grey stubble
      ctx.fillStyle = '#a0a0a0';
      ctx.fillRect(hx - 8, hy + 7, 16, 4);
      ctx.fillStyle = '#808080';
      ctx.fillRect(hx - 5, hy + 11, 10, 2);
    } else if (char.id === 'thierry') {
      // Thierry detailed thin goatee and mustache (seamless circle goatee)
      ctx.strokeStyle = '#110906';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy + 6, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (char.id === 'alan') {
      // Alan Shearer side stubble shadow
      ctx.fillStyle = '#c5a382';
      ctx.fillRect(hx - 14, hy - 2, 2, 6);
      ctx.fillRect(hx + 12, hy - 2, 2, 6);
    }

    // 7. Cartoon Eyes (Whites & Expressive shapes)
    if (char.id === 'meeks') {
      // Micah has laughing squinted eyes (closed)
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx - 9, hy - 2); ctx.lineTo(hx - 2, hy - 1);
      ctx.moveTo(hx - 9, hy);     ctx.lineTo(hx - 2, hy - 1);
      ctx.moveTo(hx + 2, hy - 1); ctx.lineTo(hx + 9, hy - 2);
      ctx.moveTo(hx + 2, hy - 1); ctx.lineTo(hx + 9, hy);
      ctx.stroke();
    } else if (char.id === 'thierry') {
      // Thierry quizzical eye shapes (left round/high, right squint/lower)
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      
      // Left eye white (round & high)
      ctx.beginPath();
      ctx.arc(hx - 5, hy - 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Right eye white (ellipse & lower)
      ctx.beginPath();
      ctx.ellipse(hx + 5, hy - 1, 3.5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Standard circular eyes
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
    }

    // 8. Pupil Eye-Tracking (Only if not closed/squinted)
    if (char.id !== 'meeks') {
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
    }

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
      // Quizzical left eyebrow (arched and high)
      ctx.moveTo(hx - 9, hy - 8);
      ctx.quadraticCurveTo(hx - 5, hy - 10, hx - 1, hy - 6);
      // Normal right eyebrow (low and flat)
      ctx.moveTo(hx + 2, hy - 5);
      ctx.lineTo(hx + 8, hy - 5);
      ctx.stroke();
    } else if (char.id === 'alan') {
      // Serious, furrowed eyebrows slanting down in the middle
      ctx.beginPath();
      ctx.moveTo(hx - 8, hy - 4); ctx.lineTo(hx - 2, hy - 6);
      ctx.moveTo(hx + 2, hy - 6); ctx.lineTo(hx + 8, hy - 4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(hx - 8, hy - 5); ctx.lineTo(hx - 3, hy - 5);
      ctx.moveTo(hx + 3, hy - 5); ctx.lineTo(hx + 8, hy - 5);
      ctx.stroke();
    }

    // 10. Mouths
    if (char.id === 'meeks') {
      // Micah Richards wide laugh mouth cavity
      ctx.fillStyle = '#4a0800'; // Dark red mouth interior
      ctx.beginPath();
      ctx.arc(hx, hy + 5, 6, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      
      // Top teeth
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx - 5, hy + 4, 10, 2);
      // Bottom teeth
      ctx.fillRect(hx - 4, hy + 8, 8, 1);
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
      
      // Light blue lens reflection
      ctx.fillStyle = 'rgba(65, 248, 255, 0.4)';
      ctx.fillRect(hx - 8, hy - 2, 4, 2);
      ctx.fillRect(hx + 4, hy - 2, 4, 2);
    }

    ctx.restore();
  }

  function drawPlayer(x, y, char) {
    const px = Math.round(x);
    const py = Math.round(y);
    const bob = Math.round(Math.sin(player.shuffle) * 1.5);
    const leg = Math.round(player.leg);
    const face = player.face;
    
    drawPundit(px, py, char, bob, leg, face, ball.x, ball.y);
  }

  function drawBall(x, y) {
    const r = ball.r;
    
    // Premium Knuckleball trail ripples
    if (level >= 2 && ball.vy > 0 && state === 'playing') {
      ctx.save();
      ctx.strokeStyle = 'rgba(65, 248, 255, 0.28)';
      ctx.lineWidth = 1.5;
      
      // Ripple 1
      const rx1 = x - Math.sin(ball.wobblePhase - 0.4) * 5;
      const ry1 = y - ball.vy * 0.04;
      ctx.beginPath();
      ctx.arc(rx1, ry1, r + 2, 0, Math.PI * 2);
      ctx.stroke();

      // Ripple 2
      ctx.strokeStyle = 'rgba(65, 248, 255, 0.12)';
      const rx2 = x - Math.sin(ball.wobblePhase - 0.8) * 9;
      const ry2 = y - ball.vy * 0.08;
      ctx.beginPath();
      ctx.arc(rx2, ry2, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.restore();
    }

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
    if (e.repeat) return; // Prevent keydown auto-repeat from triggering multiple taps
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
