(() => {
  'use strict';

  // =========================================================================
  // Canvas & DOM Setup
  // =========================================================================
  const canvas = document.getElementById('petCanvas');
  const ctx = canvas.getContext('2d');
  const statusHintEl = document.getElementById('statusHint');
  const petCountEl = document.getElementById('petCount');
  const motionToggleBtn = document.getElementById('motionToggle');
  const motionIconEl = document.getElementById('motionIcon');
  const motionLabelEl = document.getElementById('motionLabel');
  const themeToggleBtn = document.getElementById('themeToggle');
  const themeIconEl = document.getElementById('themeIcon');
  const themeLabelEl = document.getElementById('themeLabel');
  const exportBtn = document.getElementById('exportBtn');
  const viewTabs = Array.from(document.querySelectorAll('.char-tab'));

  const STAGE_W = 1120;
  const STAGE_H = 620;

  // 'all' | 'sunny' (图1 墨镜金毛) | 'daisy' (图2 蓝巾笑柴) | 'kuro' (图3 歪头黑柴)
  let currentView = 'all';
  let isDarkTheme = false;
  let motionEnabled = true;

  const viewport = {
    cssW: window.innerWidth,
    cssH: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 2.5),
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };

  function resizeCanvas() {
    viewport.cssW = window.innerWidth;
    viewport.cssH = window.innerHeight;
    viewport.dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    canvas.width = Math.round(viewport.cssW * viewport.dpr);
    canvas.height = Math.round(viewport.cssH * viewport.dpr);

    const padX = 24;
    const padTop = 66;
    const padBottom = 56;
    const availW = Math.max(320, viewport.cssW - padX * 2);
    const availH = Math.max(240, viewport.cssH - padTop - padBottom);

    viewport.scale = Math.min(availW / STAGE_W, availH / STAGE_H);
    viewport.offsetX = (viewport.cssW - STAGE_W * viewport.scale) * 0.5;
    viewport.offsetY = padTop + (availH - STAGE_H * viewport.scale) * 0.5;
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // =========================================================================
  // Subtle Colored-Pencil Texture Tile
  // =========================================================================
  let crayonLightPattern = null;
  let crayonDarkPattern = null;

  function initPatterns() {
    const makeTile = (c1, c2) => {
      const tile = document.createElement('canvas');
      tile.width = 128;
      tile.height = 128;
      const tctx = tile.getContext('2d');
      if (!tctx) return null;
      tctx.lineCap = 'round';
      for (let i = 0; i < 64; i++) {
        const x = (i * 37 + (i % 5) * 11) % 128;
        const y = (i * 53 + (i % 7) * 9) % 128;
        const len = 18 + (i % 4) * 7;
        tctx.strokeStyle = i % 2 === 0 ? c1 : c2;
        tctx.lineWidth = 1.4 + (i % 3) * 0.5;
        tctx.beginPath();
        tctx.moveTo(x - len * 0.5, y + len * 0.32);
        tctx.lineTo(x + len * 0.5, y - len * 0.32);
        tctx.stroke();
      }
      return ctx.createPattern(tile, 'repeat');
    };

    crayonLightPattern = makeTile('rgba(134, 184, 240, 0.14)', 'rgba(255, 255, 255, 0.28)');
    crayonDarkPattern = makeTile('rgba(128, 174, 232, 0.05)', 'rgba(255, 255, 255, 0.025)');
  }

  initPatterns();

  // =========================================================================
  // Per-Character Live Animation State (Unified Squatting Pose Rig)
  // =========================================================================
  function createDogState(phaseOffset, baseTilt) {
    return {
      phaseOffset,
      baseTilt,
      breathPhase: phaseOffset,
      tailPhase: phaseOffset * 1.7,
      bounce: 0,
      earKick: 0,
      excitement: 0,
      blinkTimer: 1.8 + phaseOffset * 0.9,
      blinkProgress: 0,
      glintProgress: 0,
      lookX: 0,
      lookY: 0,
    };
  }

  const dogs = {
    sunny: {
      id: 'sunny',
      name: '墨镜金毛',
      subtitle: '图1 · 垂耳酷金毛（粉领巾/叼骨头）',
      state: createDogState(0.0, -0.035),
    },
    daisy: {
      id: 'daisy',
      name: '蓝巾笑柴',
      subtitle: '图2 · 蓝花巾笑柴（基准蹲坐原画）',
      state: createDogState(2.1, 0.045),
    },
    kuro: {
      id: 'kuro',
      name: '歪头黑柴',
      subtitle: '图3 · 豆眉小黑柴（蓬松胸毛/三色爪）',
      state: createDogState(4.2, 0.092),
    },
  };

  const scene = {
    time: 0,
    petCount: 0,
    pointerStageX: STAGE_W * 0.5,
    pointerStageY: STAGE_H * 0.45,
    pointerActive: false,
    FloatingHearts: [],
    ripples: [],
  };

  // =========================================================================
  // Math & Path Helpers
  // =========================================================================
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  }

  function roundRectPath(c, x, y, w, h, r) {
    const rad = Math.min(r, w * 0.5, h * 0.5);
    c.beginPath();
    c.moveTo(x + rad, y);
    c.arcTo(x + w, y, x + w, y + h, rad);
    c.arcTo(x + w, y + h, x, y + h, rad);
    c.arcTo(x, y + h, x, y, rad);
    c.arcTo(x, y, x + w, y, rad);
    c.closePath();
  }

  // Returns active puppy placements on the stage for rendering & hit-testing
  function getActivePlacements() {
    if (currentView === 'all') {
      return [
        { dog: dogs.sunny, cx: 215, groundY: 468, scale: 0.9 },
        { dog: dogs.daisy, cx: 560, groundY: 468, scale: 0.9 },
        { dog: dogs.kuro, cx: 905, groundY: 468, scale: 0.9 },
      ];
    }
    const target = dogs[currentView] || dogs.daisy;
    return [{ dog: target, cx: STAGE_W * 0.5, groundY: 498, scale: 1.18 }];
  }

  // =========================================================================
  // Controls & Interaction
  // =========================================================================
  function syncThemeUI() {
    document.body.classList.toggle('theme-dark', isDarkTheme);
    document.body.classList.toggle('theme-light', !isDarkTheme);
    themeToggleBtn.setAttribute('aria-pressed', String(isDarkTheme));
    themeIconEl.textContent = isDarkTheme ? '🌙' : '☀️';
    themeLabelEl.textContent = isDarkTheme ? '深色' : '浅色';
  }

  function setView(viewId) {
    currentView = viewId;
    for (const btn of viewTabs) {
      const active = btn.dataset.view === viewId;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
    const placements = getActivePlacements();
    for (const { dog } of placements) {
      dog.state.bounce = 1;
      dog.state.earKick = 0.9;
      dog.state.excitement = Math.max(dog.state.excitement, 0.55);
      if (dog.id === 'sunny') dog.state.glintProgress = 0.01;
    }

    if (viewId === 'all') {
      statusHintEl.textContent = '已切换：三只同框 · 统一采用图2正面乖巧蹲坐姿势';
    } else if (dogs[viewId]) {
      statusHintEl.textContent = `已切换：${dogs[viewId].subtitle}`;
    }
    drawScene();
  }

  for (const btn of viewTabs) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setView(btn.dataset.view);
      btn.blur();
    });
  }

  motionToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    motionEnabled = !motionEnabled;
    motionToggleBtn.setAttribute('aria-pressed', String(motionEnabled));
    motionIconEl.textContent = motionEnabled ? '✨' : '⏸️';
    motionLabelEl.textContent = motionEnabled ? '微动开' : '已定格';
    statusHintEl.textContent = motionEnabled ? '已开启呼吸/摇尾/眨眼微动' : '已切换为静态定格展示';
    motionToggleBtn.blur();
  });

  themeToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isDarkTheme = !isDarkTheme;
    syncThemeUI();
    themeToggleBtn.blur();
  });

  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportTransparentPNG();
    exportBtn.blur();
  });

  function clientToStage(clientX, clientY) {
    return {
      sx: (clientX - viewport.offsetX) / viewport.scale,
      sy: (clientY - viewport.offsetY) / viewport.scale,
    };
  }

  window.addEventListener('mousemove', (e) => {
    const { sx, sy } = clientToStage(e.clientX, e.clientY);
    scene.pointerStageX = sx;
    scene.pointerStageY = sy;
    scene.pointerActive = true;
  });

  function spawnPetFeedback(x, y, accentColor) {
    scene.ripples.push({ x, y, color: accentColor, life: 0, maxLife: 0.45 });
    for (let i = 0; i < 4; i++) {
      scene.FloatingHearts.push({
        x: x + (Math.random() - 0.5) * 64,
        y: y - 16 + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 34,
        vy: -56 - Math.random() * 36,
        size: 10 + Math.random() * 6,
        rot: (Math.random() - 0.5) * 0.45,
        color: i % 2 === 0 ? '#FF85A2' : accentColor,
        life: 0,
        maxLife: 0.85 + Math.random() * 0.3,
      });
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    const { sx, sy } = clientToStage(e.clientX, e.clientY);
    scene.pointerStageX = sx;
    scene.pointerStageY = sy;
    scene.pointerActive = true;

    const placements = getActivePlacements();
    let hit = null;
    let bestDist = Infinity;

    for (const p of placements) {
      const centerY = p.groundY - 155 * p.scale;
      const dx = (sx - p.cx) / p.scale;
      const dy = (sy - centerY) / p.scale;
      const dist = Math.hypot(dx, dy * 0.85);
      if (dist < 155 && dist < bestDist) {
        bestDist = dist;
        hit = p;
      }
    }

    const targets = hit ? [hit] : placements;
    for (const t of targets) {
      const st = t.dog.state;
      st.bounce = 1.0;
      st.earKick = 1.0;
      st.excitement = Math.min(1, st.excitement + 0.65);
      if (t.dog.id === 'sunny') st.glintProgress = 0.01;

      const badgeColor =
        t.dog.id === 'sunny' ? '#FFB84D' : t.dog.id === 'daisy' ? '#73A6EE' : '#F0B27A';
      spawnPetFeedback(t.cx, t.groundY - 265 * t.scale, badgeColor);
    }

    scene.petCount += 1;
    petCountEl.textContent = String(scene.petCount);
    if (hit) {
      statusHintEl.textContent = `摸了摸「${hit.dog.name}」的脑袋 🐾`;
    }
  });

  function exportTransparentPNG() {
    const offCanvas = document.createElement('canvas');
    const exportScale = 2;
    offCanvas.width = STAGE_W * exportScale;
    offCanvas.height = STAGE_H * exportScale;
    const octx = offCanvas.getContext('2d');
    if (!octx) return;

    octx.scale(exportScale, exportScale);
    const placements = getActivePlacements();
    for (const p of placements) {
      drawPuppyCharacter(octx, p.dog, p.cx, p.groundY, p.scale, true);
    }

    const link = document.createElement('a');
    link.download = `peng-dogs-${currentView}-squat.png`;
    link.href = offCanvas.toDataURL('image/png');
    link.click();
    statusHintEl.textContent = `已导出透明 PNG：peng-dogs-${currentView}-squat.png`;
  }

  // =========================================================================
  // Simulation Update
  // =========================================================================
  function update(dt) {
    if (motionEnabled) {
      scene.time += dt;
    }

    const placements = getActivePlacements();
    for (const p of placements) {
      const st = p.dog.state;

      if (motionEnabled) {
        st.breathPhase += dt * 2.5;
        st.tailPhase += dt * (4.4 + st.excitement * 9.5);
        st.excitement = Math.max(0, st.excitement - dt * 0.55);
        st.bounce *= Math.exp(-dt * 12);
        st.earKick *= Math.exp(-dt * 10);

        // Natural blinking
        st.blinkTimer -= dt;
        if (st.blinkTimer <= 0) {
          st.blinkProgress += dt * 8.0;
          if (st.blinkProgress >= Math.PI) {
            st.blinkProgress = 0;
            st.blinkTimer = 2.4 + Math.random() * 3.2;
          }
        }

        // Sunglasses lens glint for Sunny
        if (st.glintProgress > 0) {
          st.glintProgress += dt * 2.4;
          if (st.glintProgress >= 1) st.glintProgress = 0;
        } else if (Math.random() < dt * 0.22) {
          st.glintProgress = 0.01;
        }
      } else {
        st.bounce = 0;
        st.earKick = 0;
        st.blinkProgress = 0;
      }

      // Gentle cursor gaze tracking
      const headWorldY = p.groundY - 205 * p.scale;
      const targetLX = scene.pointerActive
        ? clamp((scene.pointerStageX - p.cx) / 340, -0.75, 0.75)
        : 0;
      const targetLY = scene.pointerActive
        ? clamp((scene.pointerStageY - headWorldY) / 280, -0.55, 0.55)
        : 0;

      const follow = motionEnabled ? 1 - Math.exp(-dt * 9) : 0.2;
      st.lookX = lerp(st.lookX, motionEnabled ? targetLX : 0, follow);
      st.lookY = lerp(st.lookY, motionEnabled ? targetLY : 0, follow);
    }

    for (let i = scene.ripples.length - 1; i >= 0; i--) {
      scene.ripples[i].life += dt;
      if (scene.ripples[i].life >= scene.ripples[i].maxLife) scene.ripples.splice(i, 1);
    }

    for (let i = scene.FloatingHearts.length - 1; i >= 0; i--) {
      const h = scene.FloatingHearts[i];
      h.life += dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.vy += 45 * dt;
      if (h.life >= h.maxLife) scene.FloatingHearts.splice(i, 1);
    }
  }

  // =========================================================================
  // Backdrop & Storybook Decorations (Adapted to View Mode)
  // =========================================================================
  function drawBackdropFullViewport() {
    const w = viewport.cssW;
    const h = viewport.cssH;

    if (isDarkTheme) {
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
      grad.addColorStop(0, '#252E3F');
      grad.addColorStop(0.6, '#1B2230');
      grad.addColorStop(1, '#131822');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      if (crayonDarkPattern) {
        ctx.fillStyle = crayonDarkPattern;
        ctx.fillRect(0, 0, w, h);
      }
      return;
    }

    const grad = ctx.createRadialGradient(w * 0.5, h * 0.44, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.82);
    if (currentView === 'daisy') {
      // Image 2 pastel sky-blue colored-pencil storybook background
      grad.addColorStop(0, '#F3F9FF');
      grad.addColorStop(0.55, '#DCEEFF');
      grad.addColorStop(1, '#C1E1FE');
    } else if (currentView === 'sunny') {
      // Warm cream doodle paper matching Image 1
      grad.addColorStop(0, '#FFFEFA');
      grad.addColorStop(0.6, '#FFF7E4');
      grad.addColorStop(1, '#F8E9C8');
    } else if (currentView === 'kuro') {
      // Clean warm ivory sketch paper matching Image 3
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.65, '#FAF8F4');
      grad.addColorStop(1, '#EFECE4');
    } else {
      // Harmonious soft pastel studio backdrop for all 3 puppies together
      grad.addColorStop(0, '#FCFDFE');
      grad.addColorStop(0.6, '#EDF4FC');
      grad.addColorStop(1, '#DCE9F8');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    if (crayonLightPattern && (currentView === 'daisy' || currentView === 'all')) {
      ctx.fillStyle = crayonLightPattern;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawPastelHeart(c, x, y, size, rot, phase) {
    const bob = motionEnabled ? Math.sin(scene.time * 2.2 + phase) * 4 : 0;
    c.save();
    c.translate(x, y + bob);
    c.rotate(rot);

    const path = () => {
      c.beginPath();
      c.moveTo(0, size * 0.34);
      c.bezierCurveTo(-size * 0.16, -size * 0.44, -size * 1.15, -size * 0.24, -size * 0.9, size * 0.38);
      c.bezierCurveTo(-size * 0.72, size * 0.85, -size * 0.14, size * 1.05, 0, size * 1.2);
      c.bezierCurveTo(size * 0.14, size * 1.05, size * 0.72, size * 0.85, size * 0.9, size * 0.38);
      c.bezierCurveTo(size * 1.15, -size * 0.24, size * 0.16, -size * 0.44, 0, size * 0.34);
      c.closePath();
    };

    path();
    c.strokeStyle = isDarkTheme ? 'rgba(255,255,255,0.75)' : '#FFFFFF';
    c.lineWidth = 6.5;
    c.lineJoin = 'round';
    c.stroke();

    const g = c.createLinearGradient(0, -size * 0.3, 0, size * 1.2);
    g.addColorStop(0, '#FFB8CE');
    g.addColorStop(1, '#F58BAA');
    c.fillStyle = g;
    c.fill();

    c.strokeStyle = '#E67698';
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }

  function drawPastelStar(c, x, y, r, rot, phase) {
    const bob = motionEnabled ? Math.sin(scene.time * 1.9 + phase) * 3.5 : 0;
    c.save();
    c.translate(x, y + bob);
    c.rotate(rot);

    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.54;
      const a = (i * Math.PI) / 5 - Math.PI * 0.5;
      if (i === 0) c.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    c.closePath();
    c.strokeStyle = isDarkTheme ? 'rgba(255,255,255,0.75)' : '#FFFFFF';
    c.lineWidth = 6;
    c.lineJoin = 'round';
    c.stroke();
    c.fillStyle = '#FFE985';
    c.fill();
    c.strokeStyle = '#F0C048';
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }

  // Blue ribbon bow matching Image 2's background bows!
  function drawBlueRibbonBow(c, x, y, s, rot, phase) {
    const bob = motionEnabled ? Math.sin(scene.time * 2.0 + phase) * 4 : 0;
    c.save();
    c.translate(x, y + bob);
    c.rotate(rot);
    c.scale(s, s);

    const stroke = '#6D96CC';
    const fill = '#B8D8FA';

    // Ribbon tails
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * 3, 4);
      c.quadraticCurveTo(side * 16, 18, side * 12, 34);
      c.lineTo(side * 2, 28);
      c.quadraticCurveTo(side * 4, 16, 0, 6);
      c.closePath();
      c.fillStyle = '#A4CBF6';
      c.fill();
      c.strokeStyle = stroke;
      c.lineWidth = 2;
      c.stroke();
    }

    // Left & right bow loops
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(side * 14, -18, side * 36, -14, side * 32, 4);
      c.bezierCurveTo(side * 28, 18, side * 10, 12, 0, 3);
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      c.strokeStyle = stroke;
      c.lineWidth = 2.2;
      c.stroke();

      // Subtle plaid stripe inside bow loop
      c.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(side * 10, -4);
      c.lineTo(side * 26, 2);
      c.stroke();
    }

    // Center knot
    c.beginPath();
    c.ellipse(0, 1, 6.5, 7.5, 0, 0, Math.PI * 2);
    c.fillStyle = '#9BC5F4';
    c.fill();
    c.strokeStyle = stroke;
    c.lineWidth = 2.2;
    c.stroke();

    c.restore();
  }

  function drawStageAmbientDecorations() {
    if (currentView === 'daisy') {
      drawBlueRibbonBow(ctx, 290, 165, 1.05, -0.22, 0.4);
      drawBlueRibbonBow(ctx, 835, 265, 1.05, 0.18, 1.9);
      drawBlueRibbonBow(ctx, 270, 390, 0.92, -0.15, 2.7);
      drawBlueRibbonBow(ctx, 845, 430, 0.95, 0.16, 3.4);

      drawPastelHeart(ctx, 645, 98, 20, 0.14, 0.2);
      drawPastelHeart(ctx, 315, 265, 18, -0.2, 1.5);
      drawPastelHeart(ctx, 815, 345, 19, 0.18, 2.6);

      drawPastelStar(ctx, 365, 108, 18, -0.18, 0.9);
      drawPastelStar(ctx, 795, 138, 19, 0.22, 2.1);
    } else if (currentView === 'all') {
      // Subtle floating accents framing the trio without clutter
      drawPastelStar(ctx, 96, 136, 15, -0.2, 0.6);
      drawPastelHeart(ctx, 560, 88, 15, 0.1, 1.4);
      drawBlueRibbonBow(ctx, 412, 148, 0.72, -0.18, 2.1);
      drawPastelStar(ctx, 1024, 144, 14, 0.24, 2.9);
    }
  }

  // =========================================================================
  // UNIFIED SQUATTING POSE RIG (Exact Pose of Image 2!)
  // =========================================================================
  // Local Coordinate System for every puppy:
  //   (0, 0) = Ground contact midpoint right between the two front paws
  //   Front paws rest flat around (-34, 0) and (+34, 0)
  //   Squatting hind thighs & tucked hind paws sit slightly higher (-74, -18) & (+74, -18)
  //   Tail peeks out behind the left hip (-72, -62)
  //   Compact plump chest/belly spans y = -132 .. -18
  //   Big round mochi head centers around (0, -206)

  function defineSquatHindThighPath(c, side, breath) {
    c.beginPath();
    c.moveTo(side * 46, -98 + breath * 0.3);
    c.bezierCurveTo(side * 86, -92 + breath * 0.2, side * 94, -50, side * 80, -22);
    c.bezierCurveTo(side * 70, -12, side * 52, -14, side * 44, -26);
    c.closePath();
  }

  function defineTuckedHindPawPath(c, side) {
    c.beginPath();
    c.ellipse(side * 71, -17, 18, 10.5, side * 0.12, 0, Math.PI * 2);
  }

  function defineSquatTorsoPath(c, breath) {
    const topY = -134 + breath * 0.5;
    c.beginPath();
    c.moveTo(0, topY);
    c.bezierCurveTo(50, topY, 72, -104 + breath * 0.35, 70, -58);
    c.bezierCurveTo(68, -28, 38, -17, 0, -17);
    c.bezierCurveTo(-38, -17, -68, -28, -70, -58);
    c.bezierCurveTo(-72, -104 + breath * 0.35, -50, topY, 0, topY);
    c.closePath();
  }

  // Symmetrical plump front leg + rounded ground-resting paw (Image 2 signature!)
  function defineFrontLegAndPawPath(c, side, breath) {
    const sy = -106 + breath * 0.4;
    c.beginPath();
    // Outer shoulder down to wrist
    c.moveTo(side * 58, sy);
    c.bezierCurveTo(side * 63, -76, side * 59, -42, side * 56, -22);
    // Outer curve of plump rounded paw resting on ground (y = +3)
    c.bezierCurveTo(side * 62, -12, side * 59, 3, side * 42, 4);
    // Flat-ish cushioned bottom of paw across to inner toe
    c.bezierCurveTo(side * 33, 5.5, side * 23, 5.5, side * 15, 3.5);
    // Inner curve of paw up to inner wrist & inner leg
    c.bezierCurveTo(side * 8, 1, side * 9, -12, side * 13, -22);
    c.bezierCurveTo(side * 12, -46, side * 11, -74, side * 14, -92 + breath * 0.35);
    c.closePath();
  }

  function drawPawToeCreases(c, side, strokeColor, lineWidth) {
    c.save();
    c.strokeStyle = strokeColor;
    c.lineWidth = lineWidth;
    c.lineCap = 'round';
    // 3 gentle curved toe splits creating 4 adorable plump puppy toes
    const offsets = [21, 32, 43];
    for (const ox of offsets) {
      c.beginPath();
      c.moveTo(side * ox, -7.5);
      c.quadraticCurveTo(side * (ox + 1.2), -1.5, side * ox, 3.6);
      c.stroke();
    }
    c.restore();
  }

  function drawHindPawToeCreases(c, side, strokeColor, lineWidth) {
    c.save();
    c.strokeStyle = strokeColor;
    c.lineWidth = lineWidth;
    c.lineCap = 'round';
    for (const ox of [66, 75]) {
      c.beginPath();
      c.moveTo(side * ox, -21);
      c.lineTo(side * (ox + 1), -12);
      c.stroke();
    }
    c.restore();
  }

  // Smooth mochi-cheek puppy head shared base silhouette (lush round dome + plump lower cheeks!)
  function definePlumpPuppyHeadPath(c) {
    c.beginPath();
    c.moveTo(0, -92);
    c.bezierCurveTo(60, -92, 108, -46, 112, 14);
    c.bezierCurveTo(115, 58, 66, 84, 0, 84);
    c.bezierCurveTo(-66, 84, -115, 58, -112, 14);
    c.bezierCurveTo(-108, -46, -60, -92, 0, -92);
    c.closePath();
  }

  // =========================================================================
  // CHARACTER 1 (图1): 🕶️ 墨镜金毛 (Sunny — Cool Golden Retriever in Squat Pose)
  // =========================================================================
  function drawSunnyTail(c, wagAngle, breath) {
    const ink = '#181411';
    c.save();
    c.translate(-66, -54 + breath * 0.3);
    c.rotate(-0.18 + wagAngle);

    // Feathered golden retriever tail curving up-left
    const tailPath = () => {
      c.beginPath();
      c.moveTo(6, 12);
      c.bezierCurveTo(-18, 16, -46, 2, -58, -22);
      c.bezierCurveTo(-64, -34, -54, -44, -42, -36);
      c.bezierCurveTo(-46, -44, -36, -50, -26, -40);
      c.bezierCurveTo(-16, -28, -4, -10, 10, -6);
      c.closePath();
    };

    tailPath();
    const tg = c.createLinearGradient(0, 10, -56, -38);
    tg.addColorStop(0, '#ECC564');
    tg.addColorStop(0.6, '#F9DF86');
    tg.addColorStop(1, '#FCEAA4');
    c.fillStyle = tg;
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 3.8;
    c.lineJoin = 'round';
    c.stroke();

    // Signature comic wag motion lines (( around tail from Image 1!
    c.strokeStyle = ink;
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(-48, -32, 16, Math.PI * 0.88, Math.PI * 1.24);
    c.stroke();
    c.beginPath();
    c.arc(-52, -34, 22, Math.PI * 0.92, Math.PI * 1.2);
    c.stroke();

    c.restore();
  }

  function drawSunnyCollar(c, breath) {
    const ink = '#181411';
    const y = -124 + breath * 0.55;
    c.save();
    c.beginPath();
    c.moveTo(-62, y - 8);
    c.quadraticCurveTo(0, y + 14, 62, y - 8);
    c.quadraticCurveTo(66, y + 5, 56, y + 12);
    c.quadraticCurveTo(0, y + 32, -56, y + 12);
    c.quadraticCurveTo(-66, y + 5, -62, y - 8);
    c.closePath();

    const cg = c.createLinearGradient(-60, y, 60, y + 24);
    cg.addColorStop(0, '#F8B2C6');
    cg.addColorStop(0.5, '#F398B2');
    cg.addColorStop(1, '#E67F9D');
    c.fillStyle = cg;
    c.fill();

    c.strokeStyle = ink;
    c.lineWidth = 3.8;
    c.lineJoin = 'round';
    c.stroke();
    c.restore();
  }

  function drawSunnyFloppyEar(c, side, kick) {
    const ink = '#181411';
    c.save();
    c.translate(side * 96, -38);
    c.rotate(side * (0.1 + kick * 0.1));

    // Drooping golden retriever floppy ear framing outside of cheek (Image 1 signature!)
    const earPath = () => {
      c.beginPath();
      c.moveTo(side * -18, -26);
      c.bezierCurveTo(side * 12, -28, side * 34, -4, side * 38, 28);
      c.bezierCurveTo(side * 42, 58, side * 22, 76, side * 2, 70);
      c.bezierCurveTo(side * -16, 64, side * -20, 36, side * -15, 6);
      c.closePath();
    };

    earPath();
    // Creamy yellow top -> warm apricot-orange ear lobe matching Image 1!
    const eg = c.createLinearGradient(0, -26, side * 14, 72);
    eg.addColorStop(0, '#F9DF86');
    eg.addColorStop(0.36, '#F6CE72');
    eg.addColorStop(0.74, '#ED9F4E');
    eg.addColorStop(1, '#E28B38');
    c.fillStyle = eg;
    c.fill();

    // Soft warm-orange fur texture strokes inside lower ear lobe
    c.save();
    earPath();
    c.clip();
    c.strokeStyle = 'rgba(196, 102, 28, 0.36)';
    c.lineWidth = 2.2;
    c.lineCap = 'round';
    for (const oy of [20, 34, 48]) {
      c.beginPath();
      c.moveTo(side * 0, oy);
      c.quadraticCurveTo(side * 15, oy + 6, side * 26, oy + 14);
      c.stroke();
    }
    c.restore();

    // Crisp outer & inner-lower floppy ear stroke (seamless blend into crown at top!)
    c.beginPath();
    c.moveTo(side * -8, -25);
    c.bezierCurveTo(side * 14, -26, side * 34, -4, side * 38, 28);
    c.bezierCurveTo(side * 42, 58, side * 22, 76, side * 2, 70);
    c.bezierCurveTo(side * -14, 65, side * -18, 42, side * -14, 14);
    c.strokeStyle = ink;
    c.lineWidth = 3.8;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke();

    c.restore();
  }

  function drawSunnyCharacter(c, st, breath) {
    const ink = '#181411';
    const lineW = 3.8;
    const wag = Math.sin(st.tailPhase) * (0.14 + st.excitement * 0.24);

    // 1. Waggy golden tail behind left hip
    drawSunnyTail(c, wag, breath);

    // 2. Squatting hind thighs & tucked hind paws
    for (const side of [-1, 1]) {
      defineSquatHindThighPath(c, side, breath);
      c.fillStyle = '#EBC462';
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = lineW;
      c.lineJoin = 'round';
      c.stroke();

      defineTuckedHindPawPath(c, side);
      c.fillStyle = '#F7DC82';
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = 3.4;
      c.stroke();
      drawHindPawToeCreases(c, side, ink, 2.4);
    }

    // 3. Squatting torso + Image 1's signature pastel pink belly!
    c.save();
    defineSquatTorsoPath(c, breath);
    const bodyGrad = c.createRadialGradient(0, -96, 14, 0, -64, 90);
    bodyGrad.addColorStop(0, '#FBE69B');
    bodyGrad.addColorStop(0.6, '#F7DC80');
    bodyGrad.addColorStop(1, '#EBC362');
    c.fillStyle = bodyGrad;
    c.fill();

    // Pastel pink belly patch clipped inside torso
    c.save();
    defineSquatTorsoPath(c, breath);
    c.clip();
    const bellyGrad = c.createLinearGradient(0, -112, 0, -16);
    bellyGrad.addColorStop(0, '#F8B4C8');
    bellyGrad.addColorStop(1, '#F29AB4');
    c.fillStyle = bellyGrad;
    c.beginPath();
    c.ellipse(0, -56 + breath * 0.25, 36, 52, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 2.8;
    c.stroke();
    c.restore();

    defineSquatTorsoPath(c, breath);
    c.strokeStyle = ink;
    c.lineWidth = lineW;
    c.lineJoin = 'round';
    c.stroke();
    c.restore();

    // 4. Two plump golden front legs & paws resting side-by-side on ground (Image 2 pose!)
    for (const side of [-1, 1]) {
      defineFrontLegAndPawPath(c, side, breath);
      const legGrad = c.createLinearGradient(0, -106, 0, 5);
      legGrad.addColorStop(0, '#F8DE84');
      legGrad.addColorStop(0.75, '#FCE596');
      legGrad.addColorStop(1, '#F4D372');
      c.fillStyle = legGrad;
      c.fill();

      // Seamless shoulder blend at top, crisp ink around legs & paws
      c.beginPath();
      c.moveTo(side * 58, -98 + breath * 0.4);
      c.bezierCurveTo(side * 63, -74, side * 59, -42, side * 56, -22);
      c.bezierCurveTo(side * 62, -12, side * 59, 3, side * 42, 4);
      c.bezierCurveTo(side * 33, 5.5, side * 23, 5.5, side * 15, 3.5);
      c.bezierCurveTo(side * 8, 1, side * 9, -12, side * 13, -22);
      c.bezierCurveTo(side * 12, -46, side * 11, -72, side * 14, -88 + breath * 0.35);
      c.strokeStyle = ink;
      c.lineWidth = lineW;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke();

      drawPawToeCreases(c, side, ink, 2.8);
    }

    // 5. Pastel Pink Collar
    drawSunnyCollar(c, breath);

    // 6. Big Fluffy Golden Head + Floppy Ears + Sunglasses + Bone-in-Mouth!
    const headY = -204 + breath * 0.85 - st.bounce * 8;
    const headTilt = st.baseTilt + st.lookX * 0.05;

    c.save();
    c.translate(st.lookX * 4, headY);
    c.rotate(headTilt);

    // Scruffy hand-drawn crown tufts + plump head outline pass
    const defineCrownFluff = () => {
      c.beginPath();
      c.moveTo(-46, -72);
      c.lineTo(-44, -84);
      c.quadraticCurveTo(-33, -101, -18, -90);
      c.quadraticCurveTo(-6, -105, 10, -91);
      c.quadraticCurveTo(26, -101, 40, -84);
      c.lineTo(42, -72);
      c.closePath();
    };

    defineCrownFluff();
    c.strokeStyle = ink;
    c.lineWidth = lineW * 2;
    c.lineJoin = 'round';
    c.stroke();

    definePlumpPuppyHeadPath(c);
    c.strokeStyle = ink;
    c.lineWidth = lineW * 2;
    c.lineJoin = 'round';
    c.stroke();

    // Head warm butter-gold fill
    definePlumpPuppyHeadPath(c);
    const hg = c.createRadialGradient(-18, -42, 16, 0, 6, 128);
    hg.addColorStop(0, '#FDF0B4');
    hg.addColorStop(0.55, '#F9DF85');
    hg.addColorStop(1, '#ECC666');
    c.fillStyle = hg;
    c.fill();

    defineCrownFluff();
    c.fillStyle = '#FBE69A';
    c.fill();

    // Drooping apricot-shaded floppy ears framing both sides of the head!
    drawSunnyFloppyEar(c, -1, st.earKick);
    drawSunnyFloppyEar(c, 1, st.earKick);

    // Subtle Lighter Muzzle Cushion
    const fx = st.lookX * 5;
    const fy = st.lookY * 3.5;
    c.save();
    c.translate(fx, fy);

    c.fillStyle = '#FFF3BF';
    c.beginPath();
    c.ellipse(0, 26, 46, 31, 0, 0, Math.PI * 2);
    c.fill();

    // Cute coral-pink blush ticks (///) under sunglasses matching Image 1!
    c.strokeStyle = '#EB8676';
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    for (const side of [-1, 1]) {
      const bx = side * 56;
      const by = 12;
      for (const ox of [-6, 0, 6]) {
        c.beginPath();
        c.moveTo(bx + ox - 1.5, by + 3.5);
        c.lineTo(bx + ox + 2, by - 3.5);
        c.stroke();
      }
    }

    // Cool Black Wayfarer Sunglasses!
    c.save();
    const sgY = -12 - st.bounce * 2;
    // Temple arms going cleanly to inner edge of floppy ears
    c.strokeStyle = '#141518';
    c.lineWidth = 6.0;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-79, sgY - 5);
    c.lineTo(-56, sgY - 2);
    c.moveTo(56, sgY - 2);
    c.lineTo(79, sgY - 5);
    // Nose bridge
    c.moveTo(-16, sgY - 3);
    c.quadraticCurveTo(0, sgY - 7, 16, sgY - 3);
    c.stroke();

    // Left & right cool angled lenses
    for (const side of [-1, 1]) {
      c.save();
      c.translate(side * 37, sgY);
      c.beginPath();
      c.moveTo(-25, -11);
      c.lineTo(25, -11);
      c.quadraticCurveTo(28, -11, 26, -2);
      c.bezierCurveTo(24, 13, 14, 17, 0, 17);
      c.bezierCurveTo(-14, 17, -24, 13, -26, -2);
      c.quadraticCurveTo(-28, -11, -25, -11);
      c.closePath();

      const lg = c.createLinearGradient(-20, -12, 20, 18);
      lg.addColorStop(0, '#262930');
      lg.addColorStop(0.45, '#111216');
      lg.addColorStop(1, '#090A0C');
      c.fillStyle = lg;
      c.fill();
      c.strokeStyle = '#0D0E10';
      c.lineWidth = 3.2;
      c.stroke();

      // Crisp glossy lens reflection slash
      c.save();
      c.clip();
      const glintShift = st.glintProgress > 0 ? (st.glintProgress - 0.3) * 56 : 0;
      c.strokeStyle = 'rgba(255, 255, 255, 0.36)';
      c.lineWidth = 4.5;
      c.beginPath();
      c.moveTo(-18 + glintShift, 14);
      c.lineTo(-4 + glintShift, -12);
      c.stroke();

      c.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-8 + glintShift, 14);
      c.lineTo(5 + glintShift, -12);
      c.stroke();
      c.restore();

      c.restore();
    }
    c.restore();

    // Smug cute ω smile mouth
    c.strokeStyle = ink;
    c.lineWidth = 3.4;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(0, 25);
    c.lineTo(0, 32);
    c.moveTo(-24, 33);
    c.quadraticCurveTo(-12, 41, 0, 32);
    c.quadraticCurveTo(13, 41, 25, 31);
    c.stroke();

    // Iconic Small White Dog Bone (🦴) held in left corner of mouth! (Image 1 signature!)
    const boneWiggle = motionEnabled ? Math.sin(scene.time * 4.2) * 0.06 + st.excitement * 0.12 : 0;
    c.save();
    c.translate(-11, 34);
    c.rotate(-0.48 + boneWiggle);

    const drawMiniBone = () => {
      c.beginPath();
      // Shaft top from mouth outward to left (-24)
      c.moveTo(2, -3.4);
      c.lineTo(-22, -3.4);
      // Symmetrical upper-left bone knob
      c.bezierCurveTo(-24, -10.5, -33, -9.5, -31.5, -2.2);
      // Slight indent at outer tip between the two knobs
      c.quadraticCurveTo(-29.5, 0, -31.5, 2.2);
      // Symmetrical lower-left bone knob
      c.bezierCurveTo(-33, 9.5, -24, 10.5, -22, 3.4);
      // Shaft bottom back into mouth
      c.lineTo(2, 3.4);
      c.quadraticCurveTo(4.5, 0, 2, -3.4);
      c.closePath();
    };

    drawMiniBone();
    c.fillStyle = '#FFFFFF';
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 3.0;
    c.lineJoin = 'round';
    c.stroke();

    // Tiny comic wiggle ticks around bone tip matching Image 1!
    c.strokeStyle = ink;
    c.lineWidth = 2.0;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(-28, 1, 11, Math.PI * 0.72, Math.PI * 1.18);
    c.stroke();
    c.beginPath();
    c.arc(-30, 2, 15, Math.PI * 0.78, Math.PI * 1.12);
    c.stroke();
    c.restore();

    // Big glossy oval black retriever nose
    c.beginPath();
    c.ellipse(0, 16, 15.5, 10.5, 0, 0, Math.PI * 2);
    c.fillStyle = '#141210';
    c.fill();

    c.fillStyle = 'rgba(255, 255, 255, 0.72)';
    c.beginPath();
    c.ellipse(-4.5, 12.5, 4.2, 2.1, -0.25, 0, Math.PI * 2);
    c.fill();

    c.restore(); // end face look offset
    c.restore(); // end head transform
  }

  // =========================================================================
  // CHARACTER 2 (图2): 🌼 蓝巾笑柴 (Daisy — Reference Happy Shiba in Squat Pose)
  // =========================================================================
  function drawMiniWhiteFlower(c, x, y, r) {
    c.save();
    c.translate(x, y);
    c.fillStyle = '#FFFFFF';
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      c.beginPath();
      c.ellipse(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68, r * 0.54, r * 0.4, a, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#FBE27A';
    c.beginPath();
    c.arc(0, 0, r * 0.36, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawDaisyTail(c, wagAngle, breath) {
    const outline = '#7A5134';
    c.save();
    // Tail peeks out behind left hip just like Image 2!
    c.translate(-68, -56 + breath * 0.3);
    c.rotate(-0.1 + wagAngle);

    const tailPath = () => {
      c.beginPath();
      c.moveTo(8, 18);
      c.bezierCurveTo(-18, 22, -44, 0, -42, -32);
      c.bezierCurveTo(-40, -56, -18, -66, 0, -52);
      c.bezierCurveTo(12, -42, 16, -16, 8, 18);
      c.closePath();
    };

    tailPath();
    const tg = c.createLinearGradient(-38, -52, 8, 14);
    tg.addColorStop(0, '#F7BD6B');
    tg.addColorStop(0.55, '#EC9846');
    tg.addColorStop(1, '#DC8232');
    c.fillStyle = tg;
    c.fill();

    // Soft cream highlight along upper tail curve
    c.save();
    tailPath();
    c.clip();
    c.fillStyle = 'rgba(255, 250, 240, 0.55)';
    c.beginPath();
    c.ellipse(-22, -44, 18, 14, -0.3, 0, Math.PI * 2);
    c.fill();
    c.restore();

    tailPath();
    c.strokeStyle = outline;
    c.lineWidth = 2.8;
    c.lineJoin = 'round';
    c.stroke();

    c.restore();
  }

  function drawDaisyBandana(c, st, breath) {
    const outline = '#5B4A5E';
    const y = -124 + breath * 0.55;
    const flutter = motionEnabled ? Math.sin(scene.time * 3.1) * 0.05 + st.excitement * 0.1 : 0;

    c.save();
    c.translate(0, y);

    // Soft shadow beneath bandana
    c.fillStyle = 'rgba(120, 78, 36, 0.14)';
    c.beginPath();
    c.ellipse(0, 18, 66, 14, 0, 0, Math.PI * 2);
    c.fill();

    // Right-side tied ribbon tails (viewer's right, exact match to Image 2!)
    c.save();
    c.translate(56, 6);
    c.rotate(flutter);

    // Upper-right ribbon leaf
    const upperLeaf = () => {
      c.beginPath();
      c.moveTo(0, -4);
      c.bezierCurveTo(22, -16, 52, -8, 62, 10);
      c.bezierCurveTo(44, 18, 20, 12, 0, 4);
      c.closePath();
    };
    upperLeaf();
    c.fillStyle = '#7DA9EA';
    c.fill();
    c.save();
    c.clip();
    drawMiniWhiteFlower(c, 36, 3, 7.5);
    c.restore();
    upperLeaf();
    c.strokeStyle = outline;
    c.lineWidth = 2.4;
    c.lineJoin = 'round';
    c.stroke();

    // Lower-right hanging floral ribbon leaf
    const lowerLeaf = () => {
      c.beginPath();
      c.moveTo(-4, 2);
      c.bezierCurveTo(18, 12, 34, 34, 26, 56);
      c.bezierCurveTo(6, 50, -6, 30, -8, 8);
      c.closePath();
    };
    lowerLeaf();
    c.fillStyle = '#6B99DF';
    c.fill();
    c.save();
    c.clip();
    drawMiniWhiteFlower(c, 12, 32, 8.2);
    drawMiniWhiteFlower(c, 22, 49, 6.2);
    c.restore();
    lowerLeaf();
    c.strokeStyle = outline;
    c.lineWidth = 2.4;
    c.lineJoin = 'round';
    c.stroke();

    c.restore();

    // Main curved periwinkle-blue floral scarf around neck
    const scarfPath = () => {
      c.beginPath();
      c.moveTo(-68, -14);
      c.quadraticCurveTo(-4, 12, 66, -10);
      c.quadraticCurveTo(72, 6, 54, 16);
      c.quadraticCurveTo(-6, 40, -62, 12);
      c.quadraticCurveTo(-74, 0, -68, -14);
      c.closePath();
    };

    c.save();
    scarfPath();
    const bg = c.createLinearGradient(-64, -10, 56, 32);
    bg.addColorStop(0, '#89B5F0');
    bg.addColorStop(0.55, '#72A0E4');
    bg.addColorStop(1, '#5D8CD4');
    c.fillStyle = bg;
    c.fill();
    c.clip();

    // Fabric fold crease
    c.strokeStyle = 'rgba(48, 84, 146, 0.32)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-50, 6);
    c.quadraticCurveTo(0, 24, 46, 6);
    c.stroke();

    // White 5-petal daisies scattered across blue scarf
    drawMiniWhiteFlower(c, -44, -1, 8.0);
    drawMiniWhiteFlower(c, -12, 12, 8.6);
    drawMiniWhiteFlower(c, 22, 11, 8.2);
    drawMiniWhiteFlower(c, -28, 19, 6.5);
    c.restore();

    scarfPath();
    c.strokeStyle = outline;
    c.lineWidth = 2.5;
    c.lineJoin = 'round';
    c.stroke();

    // Cute plump knot on right side
    c.save();
    c.translate(50, 4);
    c.rotate(-0.15);
    c.beginPath();
    c.ellipse(0, 0, 10.5, 9.5, 0, 0, Math.PI * 2);
    c.fillStyle = '#7BA8E8';
    c.fill();
    c.strokeStyle = outline;
    c.lineWidth = 2.4;
    c.stroke();
    c.restore();

    c.restore();
  }

  function drawDaisyEar(c, side, kick, pass) {
    const outline = '#7A5134';
    c.save();
    c.translate(side * 64, -50);
    c.rotate(side * (0.22 + kick * 0.12));

    const earPath = () => {
      c.beginPath();
      c.moveTo(side * -30, 22);
      c.bezierCurveTo(side * -24, -32, side * 2, -74, side * 22, -66);
      c.bezierCurveTo(side * 44, -56, side * 46, 4, side * 28, 38);
      c.closePath();
    };

    if (pass === 'stroke') {
      earPath();
      c.strokeStyle = outline;
      c.lineWidth = 5.6;
      c.lineJoin = 'round';
      c.stroke();
      c.restore();
      return;
    }

    earPath();
    const eg = c.createLinearGradient(0, -68, 0, 34);
    eg.addColorStop(0, '#F7BD6C');
    eg.addColorStop(0.55, '#EC9846');
    eg.addColorStop(1, '#DF8635');
    c.fillStyle = eg;
    c.fill();

    // Creamy white inner ear border
    c.beginPath();
    c.moveTo(side * -14, 16);
    c.bezierCurveTo(side * -8, -22, side * 6, -48, side * 19, -43);
    c.bezierCurveTo(side * 32, -36, side * 32, 4, side * 20, 24);
    c.closePath();
    c.fillStyle = '#FFFDF9';
    c.fill();

    // Soft dusty sakura-pink inner ear
    c.beginPath();
    c.moveTo(side * -7, 14);
    c.bezierCurveTo(side * -3, -14, side * 8, -34, side * 17, -30);
    c.bezierCurveTo(side * 26, -24, side * 26, 4, side * 16, 20);
    c.closePath();
    c.fillStyle = '#E8A5AC';
    c.fill();

    // Fluffy white ear-tuft strokes overlapping base
    c.strokeStyle = '#FFFDF9';
    c.lineWidth = 3.2;
    c.lineCap = 'round';
    for (const ox of [-4, 4, 11]) {
      c.beginPath();
      c.moveTo(side * ox, 18);
      c.lineTo(side * (ox + 3), 6);
      c.stroke();
    }

    c.restore();
  }

  function drawDaisyCharacter(c, st, breath) {
    const outline = '#7A5134';
    const lineW = 2.8;
    const wag = Math.sin(st.tailPhase) * (0.14 + st.excitement * 0.24);

    // 1. Soft golden Shiba tail peeking behind left hip
    drawDaisyTail(c, wag, breath);

    // 2. Squatting hind thighs & little white hind toes
    for (const side of [-1, 1]) {
      defineSquatHindThighPath(c, side, breath);
      c.fillStyle = '#E69140';
      c.fill();
      c.strokeStyle = outline;
      c.lineWidth = lineW;
      c.stroke();

      defineTuckedHindPawPath(c, side);
      c.fillStyle = '#FFFDF9';
      c.fill();
      c.strokeStyle = outline;
      c.lineWidth = 2.5;
      c.stroke();
      drawHindPawToeCreases(c, side, outline, 2.0);
    }

    // 3. Squatting torso (warm Shiba orange outer + snowy-white chest/belly)
    c.save();
    defineSquatTorsoPath(c, breath);
    const bodyGrad = c.createRadialGradient(0, -92, 16, 0, -64, 88);
    bodyGrad.addColorStop(0, '#F8BE6E');
    bodyGrad.addColorStop(0.6, '#EC9846');
    bodyGrad.addColorStop(1, '#DC8332');
    c.fillStyle = bodyGrad;
    c.fill();

    c.save();
    defineSquatTorsoPath(c, breath);
    c.clip();
    const bellyGrad = c.createLinearGradient(0, -116, 0, -16);
    bellyGrad.addColorStop(0, '#FFFFFF');
    bellyGrad.addColorStop(0.8, '#FFFDF9');
    bellyGrad.addColorStop(1, '#F5ECE0');
    c.fillStyle = bellyGrad;
    c.beginPath();
    c.ellipse(0, -56 + breath * 0.25, 44, 58, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    defineSquatTorsoPath(c, breath);
    c.strokeStyle = outline;
    c.lineWidth = lineW;
    c.stroke();
    c.restore();

    // 4. Two plump front legs & snowy-white paws resting on ground (exact Image 2!)
    for (const side of [-1, 1]) {
      defineFrontLegAndPawPath(c, side, breath);
      // Smooth gradient from toasted orange upper leg to snowy cream-white lower leg & paw!
      const legGrad = c.createLinearGradient(0, -104, 0, 4);
      legGrad.addColorStop(0, '#EE9C4B');
      legGrad.addColorStop(0.36, '#F7BE72');
      legGrad.addColorStop(0.62, '#FFFBF4');
      legGrad.addColorStop(1, '#FFFDF9');
      c.fillStyle = legGrad;
      c.fill();

      c.beginPath();
      c.moveTo(side * 58, -98 + breath * 0.4);
      c.bezierCurveTo(side * 63, -74, side * 59, -42, side * 56, -22);
      c.bezierCurveTo(side * 62, -12, side * 59, 3, side * 42, 4);
      c.bezierCurveTo(side * 33, 5.5, side * 23, 5.5, side * 15, 3.5);
      c.bezierCurveTo(side * 8, 1, side * 9, -12, side * 13, -22);
      c.bezierCurveTo(side * 12, -40, side * 11.5, -58, side * 13, -72 + breath * 0.35);
      c.strokeStyle = outline;
      c.lineWidth = lineW;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke();

      drawPawToeCreases(c, side, '#8C684C', 2.2);
    }

    // 5. Sky-Blue Floral Bandana
    drawDaisyBandana(c, st, breath);

    // 6. Big Plush Smiling Shiba Head (Image 2 Reference)
    const headY = -204 + breath * 0.85 - st.bounce * 8;
    const headTilt = st.baseTilt + st.lookX * 0.05;

    c.save();
    c.translate(st.lookX * 4, headY);
    c.rotate(headTilt);

    // Unified ear + head outline
    drawDaisyEar(c, -1, st.earKick, 'stroke');
    drawDaisyEar(c, 1, st.earKick, 'stroke');
    definePlumpPuppyHeadPath(c);
    c.strokeStyle = outline;
    c.lineWidth = lineW * 2;
    c.lineJoin = 'round';
    c.stroke();

    // Ear & Head warm toasted Shiba-orange fills
    drawDaisyEar(c, -1, st.earKick, 'fill');
    drawDaisyEar(c, 1, st.earKick, 'fill');

    definePlumpPuppyHeadPath(c);
    const hg = c.createRadialGradient(-16, -48, 16, 0, 4, 130);
    hg.addColorStop(0, '#F9C478');
    hg.addColorStop(0.55, '#EE9C4B');
    hg.addColorStop(1, '#DF8636');
    c.fillStyle = hg;
    c.fill();

    // Snowy-white Shiba Urajiro cheek mask + soft white eyebrow dots + colored-pencil fur strokes
    c.save();
    definePlumpPuppyHeadPath(c);
    c.clip();

    c.beginPath();
    c.moveTo(0, -10);
    c.bezierCurveTo(20, -34, 72, -30, 118, 14);
    c.lineTo(120, 96);
    c.lineTo(-120, 96);
    c.lineTo(-118, 14);
    c.bezierCurveTo(-72, -30, -20, -34, 0, -10);
    c.closePath();

    const fg = c.createLinearGradient(0, -30, 0, 86);
    fg.addColorStop(0, '#FFFFFF');
    fg.addColorStop(0.82, '#FFFDF9');
    fg.addColorStop(1, '#F6EEE3');
    c.fillStyle = fg;
    c.fill();

    // Soft white oval Shiba eyebrow dots (豆眉) matching Image 2!
    c.fillStyle = 'rgba(255, 253, 248, 0.92)';
    c.beginPath();
    c.ellipse(-34, -40, 12, 7.5, -0.22, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(34, -40, 12, 7.5, 0.22, 0, Math.PI * 2);
    c.fill();

    // Soft golden highlight arc along forehead instead of rigid lines
    c.strokeStyle = 'rgba(255, 238, 198, 0.55)';
    c.lineWidth = 4.5;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, -10, 74, -Math.PI * 0.66, -Math.PI * 0.34);
    c.stroke();
    c.restore();

    // Joyous Face Features
    const fx = st.lookX * 4.5;
    const fy = st.lookY * 3.0;
    c.save();
    c.translate(fx, fy);

    // Airbrushed rosy-pink cheeks + pastel blush strokes
    for (const side of [-1, 1]) {
      const bx = side * 66;
      const by = 18;
      const bg = c.createRadialGradient(bx, by, 2, bx, by, 26);
      bg.addColorStop(0, 'rgba(249, 152, 172, 0.72)');
      bg.addColorStop(1, 'rgba(249, 152, 172, 0)');
      c.fillStyle = bg;
      c.beginPath();
      c.ellipse(bx, by, 26, 16, side * 0.1, 0, Math.PI * 2);
      c.fill();

      c.strokeStyle = 'rgba(228, 114, 136, 0.55)';
      c.lineWidth = 2.0;
      c.lineCap = 'round';
      for (const ox of [-6, 0, 6]) {
        c.beginPath();
        c.moveTo(bx + ox - 2, by + 3.5);
        c.lineTo(bx + ox + 2.5, by - 3.5);
        c.stroke();
      }
    }

    // Happy arched smiling crescent eyes (◠ ◠)
    for (const side of [-1, 1]) {
      c.save();
      c.translate(side * 42, -8 - st.bounce * 1.5);
      c.strokeStyle = '#322018';
      c.lineWidth = 4.8;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0, 9, 17, Math.PI * 1.14, Math.PI * 1.86);
      c.stroke();

      // Subtle outer happy eyelash flick
      c.lineWidth = 3.0;
      c.beginPath();
      c.moveTo(side * 14, 2);
      c.lineTo(side * 19, 4.5);
      c.stroke();
      c.restore();
    }

    // Wide joyful open laugh mouth + plump rosy-pink puppy tongue!
    const pant = motionEnabled ? Math.sin(scene.time * 4.8) * 1.6 + st.excitement * 4.5 : 0;
    const mouthPath = () => {
      c.beginPath();
      c.moveTo(-29, 20);
      c.quadraticCurveTo(0, 30, 29, 20);
      c.bezierCurveTo(26, 50 + pant, 14, 62 + pant, 0, 62 + pant);
      c.bezierCurveTo(-14, 62 + pant, -26, 50 + pant, -29, 20);
      c.closePath();
    };

    c.save();
    mouthPath();
    c.fillStyle = '#4B2424';
    c.fill();

    // Rosy pink tongue hanging happily out
    c.save();
    c.clip();
    const tg = c.createLinearGradient(0, 28, 0, 64 + pant);
    tg.addColorStop(0, '#E87A8A');
    tg.addColorStop(0.35, '#F797A6');
    tg.addColorStop(1, '#FBAAB7');
    c.fillStyle = tg;
    c.beginPath();
    c.ellipse(0, 46 + pant * 0.85, 18.5, 21, 0, 0, Math.PI * 2);
    c.fill();

    // Central tongue groove
    c.strokeStyle = '#D96D7D';
    c.lineWidth = 2.0;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, 30 + pant * 0.3);
    c.lineTo(0, 48 + pant * 0.7);
    c.stroke();
    c.restore();

    mouthPath();
    c.strokeStyle = '#3B231A';
    c.lineWidth = 3.0;
    c.lineJoin = 'round';
    c.stroke();
    c.restore();

    // Upper smiling ω lip curves framing the nose & laugh
    c.strokeStyle = '#3B231A';
    c.lineWidth = 3.2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, 14);
    c.lineTo(0, 22);
    c.moveTo(0, 22);
    c.bezierCurveTo(-8, 30, -24, 29, -32, 18);
    c.moveTo(0, 22);
    c.bezierCurveTo(8, 30, 24, 29, 32, 18);
    c.stroke();

    // Delicate muzzle whiskers matching Image 2
    c.strokeStyle = 'rgba(110, 82, 66, 0.38)';
    c.lineWidth = 1.4;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * 22, 15);
      c.quadraticCurveTo(side * 38, 13, side * 50, 17);
      c.moveTo(side * 24, 20);
      c.quadraticCurveTo(side * 40, 20, side * 52, 25);
      c.stroke();
    }

    // Cute dark textured dog nose with nostrils & highlight
    c.beginPath();
    c.moveTo(0, 2);
    c.bezierCurveTo(12, 1.5, 15, 9, 9, 15);
    c.quadraticCurveTo(0, 19, -9, 15);
    c.bezierCurveTo(-15, 9, -12, 1.5, 0, 2);
    c.closePath();
    c.fillStyle = '#2B201D';
    c.fill();

    c.fillStyle = 'rgba(255, 255, 255, 0.65)';
    c.beginPath();
    c.ellipse(-3.6, 6.2, 3.8, 1.9, -0.3, 0, Math.PI * 2);
    c.fill();

    c.restore(); // end face look
    c.restore(); // end head
  }

  // =========================================================================
  // CHARACTER 3 (图3): 🖤 歪头黑柴 (Kuro — Fluffy Black-and-Tan Shiba in Squat Pose)
  // =========================================================================
  function drawKuroTail(c, wagAngle, breath) {
    const ink = '#0B0C0E';
    c.save();
    // Fluffy curled black brush tail peeking out behind left hip (matches Image 2 & Image 3!)
    c.translate(-66, -54 + breath * 0.3);
    c.rotate(-0.08 + wagAngle);

    const spikyTailPath = () => {
      c.beginPath();
      c.moveTo(8, 18);
      c.lineTo(-10, 18);
      c.lineTo(-22, 12);
      c.lineTo(-16, 8);
      c.lineTo(-34, -2);
      c.lineTo(-26, -6);
      c.lineTo(-44, -22);
      c.lineTo(-34, -25);
      c.lineTo(-46, -42);
      c.lineTo(-33, -42);
      c.lineTo(-38, -58);
      c.lineTo(-24, -52);
      c.lineTo(-22, -66);
      c.lineTo(-10, -55);
      c.lineTo(-4, -64);
      c.quadraticCurveTo(10, -48, 12, -18);
      c.closePath();
    };

    spikyTailPath();
    const tg = c.createRadialGradient(-18, -32, 6, -18, -28, 48);
    tg.addColorStop(0, '#2B2E36');
    tg.addColorStop(0.65, '#191B20');
    tg.addColorStop(1, '#101215');
    c.fillStyle = tg;
    c.fill();

    // Subtle cream-white under-tail fur peek matching Image 3
    c.strokeStyle = 'rgba(248, 238, 224, 0.55)';
    c.lineWidth = 2.2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-26, 4);
    c.quadraticCurveTo(-34, -8, -30, -20);
    c.stroke();

    spikyTailPath();
    c.strokeStyle = ink;
    c.lineWidth = 3.2;
    c.lineJoin = 'round';
    c.stroke();

    c.restore();
  }

  function drawKuroEar(c, side, kick, pass) {
    const ink = '#0B0C0E';
    c.save();
    c.translate(side * 64, -52);
    c.rotate(side * (0.24 + kick * 0.12));

    const earPath = () => {
      c.beginPath();
      c.moveTo(side * -30, 22);
      c.bezierCurveTo(side * -24, -30, side * 4, -74, side * 24, -66);
      c.bezierCurveTo(side * 44, -56, side * 46, 4, side * 28, 38);
      c.closePath();
    };

    if (pass === 'stroke') {
      earPath();
      c.strokeStyle = ink;
      c.lineWidth = 6.4;
      c.lineJoin = 'round';
      c.stroke();
      c.restore();
      return;
    }

    earPath();
    c.fillStyle = '#191B20';
    c.fill();

    // Warm peachy-tan inner ear matching Image 3!
    c.beginPath();
    c.moveTo(side * -12, 15);
    c.bezierCurveTo(side * -6, -20, side * 7, -46, side * 19, -41);
    c.bezierCurveTo(side * 30, -35, side * 30, 4, side * 19, 22);
    c.closePath();
    const ig = c.createLinearGradient(0, -44, 0, 20);
    ig.addColorStop(0, '#EAC0A8');
    ig.addColorStop(1, '#D89F84');
    c.fillStyle = ig;
    c.fill();

    // Fluffy black ear-base fur tufts overlapping inner ear bottom
    c.fillStyle = '#191B20';
    c.beginPath();
    c.moveTo(side * -14, 18);
    c.lineTo(side * -5, 6);
    c.lineTo(side * 1, 14);
    c.lineTo(side * 9, 5);
    c.lineTo(side * 20, 22);
    c.closePath();
    c.fill();

    c.restore();
  }

  // Fluffy cheek-tufted head path for Kuro matching Image 3's fuzzy fur silhouette!
  function defineKuroFluffyHeadPath(c) {
    c.beginPath();
    c.moveTo(0, -92);
    c.bezierCurveTo(56, -92, 100, -52, 106, -6);
    // Right fuzzy cheek fur tufts
    c.lineTo(115, 4);
    c.lineTo(109, 10);
    c.lineTo(117, 22);
    c.lineTo(108, 27);
    c.lineTo(112, 39);
    c.bezierCurveTo(96, 68, 56, 84, 0, 84);
    c.bezierCurveTo(-56, 84, -96, 68, -112, 39);
    // Left fuzzy cheek fur tufts
    c.lineTo(-108, 27);
    c.lineTo(-117, 22);
    c.lineTo(-109, 10);
    c.lineTo(-115, 4);
    c.lineTo(-106, -6);
    c.bezierCurveTo(-100, -52, -56, -92, 0, -92);
    c.closePath();
  }

  function drawKuroEye(c, x, y, side, blinkAmount, lookX, lookY) {
    c.save();
    c.translate(x, y);

    if (blinkAmount > 0.72) {
      c.strokeStyle = '#FAF2E6';
      c.lineWidth = 3.4;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-13, 2);
      c.quadraticCurveTo(0, 8, 13, 2);
      c.stroke();
      c.restore();
      return;
    }

    const sy = Math.max(0.15, 1 - blinkAmount * 0.9);
    c.scale(1, sy);

    const gx = lookX * 2.8;
    const gy = lookY * 2.0;

    // Signature crisp white outer-lower eye rim from Image 3 that makes black eyes sparkle!
    c.fillStyle = '#FFFFFF';
    c.beginPath();
    c.ellipse(gx + side * 1.8, gy + 1.5, 15.8, 16.8, 0, 0, Math.PI * 2);
    c.fill();

    // Deep glossy dark eye
    c.fillStyle = '#0F0E11';
    c.beginPath();
    c.ellipse(gx, gy, 14.8, 16.0, 0, 0, Math.PI * 2);
    c.fill();

    // Subtle warm espresso lower iris glow
    const ig = c.createRadialGradient(gx, gy + 6, 1, gx, gy + 6, 10);
    ig.addColorStop(0, 'rgba(92, 58, 38, 0.55)');
    ig.addColorStop(1, 'rgba(15, 14, 17, 0)');
    c.fillStyle = ig;
    c.beginPath();
    c.ellipse(gx, gy + 6, 10, 6.5, 0, 0, Math.PI * 2);
    c.fill();

    // Bright upper catchlight + tiny lower sparkle
    c.fillStyle = '#FFFFFF';
    c.beginPath();
    c.ellipse(gx - 4.5, gy - 5.5, 4.8, 4.2, -0.25, 0, Math.PI * 2);
    c.fill();

    c.beginPath();
    c.arc(gx + 4.8, gy + 5.2, 2.0, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  function drawKuroCharacter(c, st, breath) {
    const ink = '#0B0C0E';
    const lineW = 3.2;
    const wag = Math.sin(st.tailPhase) * (0.14 + st.excitement * 0.24);

    // 1. Fluffy curled black Shiba tail behind left hip
    drawKuroTail(c, wag, breath);

    // 2. Squatting black hind thighs + tan/white tucked hind paws
    for (const side of [-1, 1]) {
      defineSquatHindThighPath(c, side, breath);
      c.fillStyle = '#181A1F';
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = lineW;
      c.stroke();

      defineTuckedHindPawPath(c, side);
      const hpg = c.createLinearGradient(side * 56, -24, side * 84, -10);
      hpg.addColorStop(0, '#E8A86E');
      hpg.addColorStop(0.55, '#FCF3E6');
      hpg.addColorStop(1, '#FFFFFF');
      c.fillStyle = hpg;
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = 2.8;
      c.stroke();
      drawHindPawToeCreases(c, side, ink, 2.2);
    }

    // 3. Squatting black torso + fluffy white winged V-shaped chest fur tuft (Image 3 signature!)
    c.save();
    defineSquatTorsoPath(c, breath);
    const bodyGrad = c.createRadialGradient(0, -96, 12, 0, -64, 92);
    bodyGrad.addColorStop(0, '#292C34');
    bodyGrad.addColorStop(0.65, '#191B20');
    bodyGrad.addColorStop(1, '#111317');
    c.fillStyle = bodyGrad;
    c.fill();

    // Creamy-white winged V-chest fur patch clipped inside torso
    c.save();
    defineSquatTorsoPath(c, breath);
    c.clip();

    const chestY = -98 + breath * 0.45;
    c.fillStyle = '#FCF3E6';
    c.beginPath();
    c.moveTo(0, chestY + 8);
    c.quadraticCurveTo(26, chestY - 2, 52, chestY + 4);
    c.lineTo(44, chestY + 14);
    c.lineTo(50, chestY + 20);
    c.lineTo(32, chestY + 26);
    c.lineTo(36, chestY + 33);
    c.lineTo(14, chestY + 34);
    c.lineTo(0, chestY + 44);
    c.lineTo(-14, chestY + 34);
    c.lineTo(-36, chestY + 33);
    c.lineTo(-32, chestY + 26);
    c.lineTo(-50, chestY + 20);
    c.lineTo(-44, chestY + 14);
    c.lineTo(-52, chestY + 4);
    c.quadraticCurveTo(-26, chestY - 2, 0, chestY + 8);
    c.closePath();
    c.fill();
    c.restore();

    defineSquatTorsoPath(c, breath);
    c.strokeStyle = ink;
    c.lineWidth = lineW;
    c.stroke();
    c.restore();

    // 4. Two front legs in Image 2 squat pose with Image 3's tri-color stockings (Black -> Tan -> White Paws!)
    for (const side of [-1, 1]) {
      c.save();
      defineFrontLegAndPawPath(c, side, breath);
      c.clip();

      // Base black upper leg
      c.fillStyle = '#191B20';
      c.fillRect(side * 66, -112, -side * 62, 122);

      // Warm tan lower stocking starting with fuzzy fur zigzags at y = -54
      c.fillStyle = '#E8A86E';
      c.beginPath();
      c.moveTo(side * 8, -50);
      c.lineTo(side * 22, -58);
      c.lineTo(side * 30, -51);
      c.lineTo(side * 42, -59);
      c.lineTo(side * 64, -48);
      c.lineTo(side * 64, 10);
      c.lineTo(side * 8, 10);
      c.closePath();
      c.fill();

      // Crisp snowy-white front paw sock at bottom (y = -15 .. +6)
      c.fillStyle = '#FFFDF9';
      c.beginPath();
      c.ellipse(side * 34, -1, 29, 14.5, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();

      // Outer ink stroke for front leg & paw
      c.beginPath();
      c.moveTo(side * 58, -98 + breath * 0.4);
      c.bezierCurveTo(side * 63, -74, side * 59, -42, side * 56, -22);
      c.bezierCurveTo(side * 62, -12, side * 59, 3, side * 42, 4);
      c.bezierCurveTo(side * 33, 5.5, side * 23, 5.5, side * 15, 3.5);
      c.bezierCurveTo(side * 8, 1, side * 9, -12, side * 13, -22);
      c.bezierCurveTo(side * 12, -46, side * 11, -72, side * 14, -88 + breath * 0.35);
      c.strokeStyle = ink;
      c.lineWidth = lineW;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke();

      drawPawToeCreases(c, side, ink, 2.5);
    }

    // 5. Natural U-curved Fluffy Black Neck Ruff + Prominent White Winged V-Chest Patch!
    const ruffY = -124 + breath * 0.55;
    c.save();
    c.beginPath();
    c.moveTo(-54, ruffY - 2);
    c.lineTo(-58, ruffY + 8);
    c.lineTo(-46, ruffY + 12);
    c.lineTo(-48, ruffY + 20);
    c.lineTo(-30, ruffY + 18);
    c.lineTo(-22, ruffY + 25);
    c.lineTo(-8, ruffY + 20);
    c.lineTo(0, ruffY + 27);
    c.lineTo(8, ruffY + 20);
    c.lineTo(22, ruffY + 25);
    c.lineTo(30, ruffY + 18);
    c.lineTo(48, ruffY + 20);
    c.lineTo(46, ruffY + 12);
    c.lineTo(58, ruffY + 8);
    c.lineTo(54, ruffY - 2);
    c.closePath();
    c.fillStyle = '#191B20';
    c.fill();

    // Prominent fluffy white V-chest fur patch resting right below the neck ruff (visible between front shoulders!)
    const vY = ruffY + 22;
    c.fillStyle = '#FCF3E6';
    c.beginPath();
    c.moveTo(0, vY + 3);
    c.quadraticCurveTo(22, vY - 3, 44, vY + 2);
    c.lineTo(37, vY + 11);
    c.lineTo(42, vY + 16);
    c.lineTo(26, vY + 22);
    c.lineTo(14, vY + 26);
    c.lineTo(0, vY + 38);
    c.lineTo(-14, vY + 26);
    c.lineTo(-26, vY + 22);
    c.lineTo(-42, vY + 16);
    c.lineTo(-37, vY + 11);
    c.lineTo(-44, vY + 2);
    c.quadraticCurveTo(-22, vY - 3, 0, vY + 3);
    c.closePath();
    c.fill();
    c.restore();

    // 6. Fluffy Black-and-Tan Shiba Head with Signature Cute Head Tilt!
    const headY = -204 + breath * 0.85 - st.bounce * 8;
    const headTilt = st.baseTilt + st.lookX * 0.05;

    c.save();
    c.translate(st.lookX * 4, headY);
    c.rotate(headTilt);

    drawKuroEar(c, -1, st.earKick, 'stroke');
    drawKuroEar(c, 1, st.earKick, 'stroke');
    defineKuroFluffyHeadPath(c);
    c.strokeStyle = ink;
    c.lineWidth = lineW * 2;
    c.lineJoin = 'round';
    c.stroke();

    drawKuroEar(c, -1, st.earKick, 'fill');
    drawKuroEar(c, 1, st.earKick, 'fill');

    defineKuroFluffyHeadPath(c);
    const hg = c.createRadialGradient(-18, -46, 12, 0, 4, 130);
    hg.addColorStop(0, '#2D313A');
    hg.addColorStop(0.55, '#1A1C21');
    hg.addColorStop(1, '#111216');
    c.fillStyle = hg;
    c.fill();

    // Cream-ivory lower cheeks/muzzle + tan cheek accents + tan eyebrow spots (豆眉)
    c.save();
    defineKuroFluffyHeadPath(c);
    c.clip();

    // Tan transition border right at upper cheek / outer eye corners
    c.fillStyle = '#E6A56A';
    c.beginPath();
    c.ellipse(-58, 12, 34, 18, -0.22, 0, Math.PI * 2);
    c.ellipse(58, 12, 34, 18, 0.22, 0, Math.PI * 2);
    c.fill();

    // Plush creamy-ivory lower cheeks & muzzle curving up at nose bridge
    c.beginPath();
    c.moveTo(-104, 20);
    c.bezierCurveTo(-76, 6, -48, 14, -26, 16);
    c.bezierCurveTo(-14, 16, -10, 0, 0, 0);
    c.bezierCurveTo(10, 0, 14, 16, 26, 16);
    c.bezierCurveTo(48, 14, 76, 6, 104, 20);
    c.lineTo(114, 94);
    c.lineTo(-114, 94);
    c.closePath();

    const cg = c.createLinearGradient(0, 0, 0, 86);
    cg.addColorStop(0, '#FDF6EA');
    cg.addColorStop(0.75, '#FAF0E1');
    cg.addColorStop(1, '#EFE2CE');
    c.fillStyle = cg;
    c.fill();

    // Soft grey-beige chin shadow tuft at bottom center
    c.fillStyle = 'rgba(206, 186, 166, 0.45)';
    c.beginPath();
    c.ellipse(0, 76, 36, 12, 0, 0, Math.PI * 2);
    c.fill();

    c.restore();

    // Face Features
    const fx = st.lookX * 4.5;
    const fy = st.lookY * 3.0;
    c.save();
    c.translate(fx, fy);

    // Classic Black-Shiba warm tan oval eyebrow dots (豆眉) matching Image 3!
    c.fillStyle = '#EEB67E';
    c.beginPath();
    c.ellipse(-28, -28, 11.5, 7.2, 0.28, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(28, -28, 11.5, 7.2, -0.28, 0, Math.PI * 2);
    c.fill();

    // Big soulful glossy dark puppy eyes
    const blinkAmount = st.blinkProgress > 0 ? Math.sin(st.blinkProgress) : 0;
    drawKuroEye(c, -40, -3, -1, blinkAmount, st.lookX, st.lookY);
    drawKuroEye(c, 40, -3, 1, blinkAmount, st.lookX, st.lookY);

    // Subtle soft muzzle shading mound
    c.fillStyle = 'rgba(218, 198, 176, 0.35)';
    c.beginPath();
    c.ellipse(0, 26, 20, 14, 0, 0, Math.PI * 2);
    c.fill();

    // Gentle sweet puppy ω smile with softly upturned corners (matching Image 3!)
    c.strokeStyle = ink;
    c.lineWidth = 2.9;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(0, 20);
    c.lineTo(0, 26);
    c.moveTo(-19, 30);
    c.bezierCurveTo(-13, 34, -5, 32, 0, 26);
    c.bezierCurveTo(5, 32, 13, 34, 19, 29.5);
    c.stroke();

    // Delicate cheek whisker ticks matching Image 3
    c.strokeStyle = 'rgba(42, 34, 28, 0.55)';
    c.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * 24, 19);
      c.lineTo(side * 34, 17);
      c.moveTo(side * 26, 25);
      c.lineTo(side * 37, 25);
      c.stroke();
    }

    // Glossy black button nose
    c.beginPath();
    c.moveTo(0, 7);
    c.bezierCurveTo(11, 6.5, 14, 13, 8, 18.5);
    c.quadraticCurveTo(0, 22, -8, 18.5);
    c.bezierCurveTo(-14, 13, -11, 6.5, 0, 7);
    c.closePath();
    c.fillStyle = '#0E0D10';
    c.fill();

    c.fillStyle = 'rgba(255, 255, 255, 0.78)';
    c.beginPath();
    c.ellipse(-3.5, 10.8, 3.6, 1.8, -0.3, 0, Math.PI * 2);
    c.fill();

    c.restore(); // end face look
    c.restore(); // end head
  }

  // =========================================================================
  // Unified Character Dispatcher + Ground Shadow & Labels
  // =========================================================================
  function drawGroundShadowForDog(c, dogId) {
    c.save();
    if (dogId === 'daisy' && !isDarkTheme) {
      c.fillStyle = 'rgba(116, 168, 232, 0.34)';
      c.beginPath();
      c.ellipse(0, -4, 106, 23, 0, 0, Math.PI * 2);
      c.fill();
    } else {
      c.fillStyle = isDarkTheme ? 'rgba(0, 0, 0, 0.38)' : 'rgba(92, 74, 56, 0.14)';
      c.beginPath();
      c.ellipse(0, -4, 102, 21, 0, 0, Math.PI * 2);
      c.fill();
    }

    // Crisp hand-drawn ground sketch lines for Kuro (matching Image 3!)
    if (dogId === 'kuro') {
      c.strokeStyle = isDarkTheme ? 'rgba(255,255,255,0.18)' : 'rgba(30, 32, 36, 0.28)';
      c.lineWidth = 2.0;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-98, 2);
      c.lineTo(-62, 3);
      c.moveTo(60, 3);
      c.lineTo(96, 1);
      c.stroke();
    }
    c.restore();
  }

  function drawPuppyCharacter(c, dog, cx, groundY, scale, isExport = false) {
    const st = dog.state;
    const breath = motionEnabled && !isExport ? Math.sin(st.breathPhase) * 3.2 : 0;
    const squashX = 1 + st.bounce * 0.04;
    const squashY = 1 - st.bounce * 0.04;

    c.save();
    c.translate(cx, groundY);
    c.scale(scale * squashX, scale * squashY);

    if (!isExport) {
      drawGroundShadowForDog(c, dog.id);
    } else {
      // Subtle soft contact shadow even in transparent export so paws feel grounded
      c.fillStyle = 'rgba(0, 0, 0, 0.12)';
      c.beginPath();
      c.ellipse(0, -2, 92, 16, 0, 0, Math.PI * 2);
      c.fill();
    }

    if (dog.id === 'sunny') {
      drawSunnyCharacter(c, st, breath);
    } else if (dog.id === 'daisy') {
      drawDaisyCharacter(c, st, breath);
    } else {
      drawKuroCharacter(c, st, breath);
    }

    c.restore();
  }

  function drawTrioCaptions(placements) {
    if (currentView !== 'all') return;

    ctx.save();
    for (const p of placements) {
      const y = p.groundY + 42;
      const pillW = 148;
      const pillH = 30;

      roundRectPath(ctx, p.cx - pillW * 0.5, y - pillH * 0.5, pillW, pillH, 15);
      ctx.fillStyle = isDarkTheme ? 'rgba(34, 42, 58, 0.78)' : 'rgba(255, 255, 255, 0.78)';
      ctx.fill();
      ctx.strokeStyle = isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(130, 160, 200, 0.3)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.font = '600 13.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isDarkTheme ? '#E6ECF5' : '#334155';
      ctx.fillText(p.dog.name, p.cx, y + 0.5);
    }
    ctx.restore();
  }

  function drawEffects() {
    for (const r of scene.ripples) {
      const t = r.life / r.maxLife;
      const rad = 14 + easeOutCubic(t) * 52;
      ctx.save();
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - t) * 0.65;
      ctx.lineWidth = 2.6 * (1 - t * 0.5);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const h of scene.FloatingHearts) {
      const t = h.life / h.maxLife;
      const alpha = t < 0.2 ? t / 0.2 : 1 - easeOutCubic((t - 0.2) / 0.8);
      const s = h.size * (0.7 + 0.35 * Math.sin(Math.min(1, t * 3) * Math.PI * 0.5));
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.3);
      ctx.bezierCurveTo(-s * 0.15, -s * 0.4, -s * 1.1, -s * 0.2, -s * 0.85, s * 0.36);
      ctx.bezierCurveTo(-s * 0.68, s * 0.8, -s * 0.12, s * 1.0, 0, s * 1.15);
      ctx.bezierCurveTo(s * 0.12, s * 1.0, s * 0.68, s * 0.8, s * 0.85, s * 0.36);
      ctx.bezierCurveTo(s * 1.1, -s * 0.2, s * 0.15, -s * 0.4, 0, s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // =========================================================================
  // Main Render Loop
  // =========================================================================
  let lastTs = performance.now();

  function drawScene() {
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    drawBackdropFullViewport();

    ctx.save();
    ctx.translate(viewport.offsetX, viewport.offsetY);
    ctx.scale(viewport.scale, viewport.scale);

    drawStageAmbientDecorations();

    const placements = getActivePlacements();
    for (const p of placements) {
      drawPuppyCharacter(ctx, p.dog, p.cx, p.groundY, p.scale, false);
    }

    drawTrioCaptions(placements);
    drawEffects();

    ctx.restore();
  }

  function renderFrame(ts) {
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;

    update(dt);
    drawScene();

    requestAnimationFrame(renderFrame);
  }

  syncThemeUI();
  drawScene();
  requestAnimationFrame(renderFrame);
})();
