(() => {
  'use strict';

  // =========================================================================
  // Canvas & DOM Setup
  // =========================================================================
  const canvas = document.getElementById('petCanvas');
  const ctx = canvas.getContext('2d');
  const statusHintEl = document.getElementById('statusHint');
  const actionCountEl = document.getElementById('actionCount');
  const soundToggleBtn = document.getElementById('soundToggle');
  const soundIconEl = document.getElementById('soundIcon');
  const soundLabelEl = document.getElementById('soundLabel');
  const themeToggleBtn = document.getElementById('themeToggle');
  const themeIconEl = document.getElementById('themeIcon');
  const themeLabelEl = document.getElementById('themeLabel');
  const exportBtn = document.getElementById('exportBtn');
  const viewTabs = Array.from(document.querySelectorAll('.char-tab'));

  const STAGE_W = 1320;
  const STAGE_H = 700;

  // 'all' | 'sunny' (图1 墨镜金毛) | 'daisy' (图2 蓝巾笑柴) | 'kuro' (图3 歪头黑柴)
  let currentView = 'all';
  let isDarkTheme = false;

  const viewport = {
    cssW: window.innerWidth,
    cssH: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 2.5),
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };

  function resizeCanvas() {
    viewport.cssW = Math.max(1, window.innerWidth);
    viewport.cssH = Math.max(1, window.innerHeight);
    viewport.dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    canvas.width = Math.round(viewport.cssW * viewport.dpr);
    canvas.height = Math.round(viewport.cssH * viewport.dpr);

    const padX = 20;
    const padTop = 60;
    const padBottom = 50;
    const availW = Math.max(320, viewport.cssW - padX * 2);
    const availH = Math.max(240, viewport.cssH - padTop - padBottom);

    viewport.scale = Math.min(availW / STAGE_W, availH / STAGE_H);
    viewport.offsetX = (viewport.cssW - STAGE_W * viewport.scale) * 0.5;
    viewport.offsetY = padTop + (availH - STAGE_H * viewport.scale) * 0.5;
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
    drawScene();
  });
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
  // Web Audio Synthesizer (Optional Crisp Key & Mouse Sounds)
  // =========================================================================
  let soundEnabled = false;
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  function playKeySound(isBigKey = false) {
    if (!soundEnabled) return;
    ensureAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'triangle';
    const baseFreq = isBigKey ? 165 : 235 + Math.random() * 50;
    osc.frequency.setValueAtTime(baseFreq * 1.45, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.52, now + 0.045);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isBigKey ? 940 : 1520, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(isBigKey ? 0.14 : 0.1, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.065);
  }

  function playMouseClickSound(isRight = false) {
    if (!soundEnabled) return;
    ensureAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    const freq = isRight ? 620 : 760;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.42, now + 0.032);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.042);
  }

  // =========================================================================
  // Local Puppy + Unobstructed Front Desk Geometry
  // =========================================================================
  // Coordinate system per puppy unit (around (cx, baseY)):
  //   Puppy squats cleanly ABOVE y = 0:
  //     - Head & Ears: y = -302 .. -120
  //     - Torso & Hind Paws: y = -134 .. -16
  //     - Resting Squatting Front Paws: bottom at y = +4 (centered at DOG_X ± 35, y = -6)
  //   Keyboard & Mouse sit cleanly IN FRONT OF (BELOW) the puppy (y >= +22):
  //     - ZERO overlap with the puppy! Puppy's full squatting body & paws are 100% visible!
  //     - Paws stay tucked in the squatting pose until user presses a key or moves/clicks mouse!
  const DOG_X = 6;

  const KB_LOCAL = {
    cx: 36,
    cy: 53, // Top edge = 53 - 44 = +9 (clean unobstructed gap below puppy's front toes at +4!)
    w: 258,
    h: 88,
    angle: 0.018,
    padX: 7,
    padY: 7,
    gap: 2.3,
  };

  const MOUSE_PAD_LOCAL = {
    cx: -124,
    cy: 54, // Top edge = 54 - 38 = +16
    w: 82,
    h: 76,
  };

  const MOUSE_BOUNDS_LOCAL = {
    minX: -137,
    maxX: -111,
    minY: 43,
    maxY: 66,
  };

  const MOUSE_SIZE_LOCAL = {
    w: 46,
    h: 62,
  };

  const INIT_MOUSE_LX = -124;
  const INIT_MOUSE_LY = 54;

  // Squatting front-paw home coordinates (exact resting paw center under fixed shoulder pivot!)
  const SHOULDER_OFFSET_X = 37;
  const SHOULDER_Y = -94;
  const LEFT_SQUAT_HOME_X = DOG_X - 35;
  const LEFT_SQUAT_HOME_Y = -8;
  const RIGHT_SQUAT_HOME_X = DOG_X + 35;
  const RIGHT_SQUAT_HOME_Y = -8;

  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

  const KEY_ROWS_SPEC = [
    [
      { code: 'Escape', label: 'Esc', popup: 'Esc', w: 1, accent: true, hand: 'left' },
      { code: 'Digit1', label: '1', shift: '!', popup: '1', w: 1, hand: 'left' },
      { code: 'Digit2', label: '2', shift: '@', popup: '2', w: 1, hand: 'left' },
      { code: 'Digit3', label: '3', shift: '#', popup: '3', w: 1, hand: 'left' },
      { code: 'Digit4', label: '4', shift: '$', popup: '4', w: 1, hand: 'left' },
      { code: 'Digit5', label: '5', shift: '%', popup: '5', w: 1, hand: 'left' },
      { code: 'Digit6', label: '6', shift: '^', popup: '6', w: 1, hand: 'right' },
      { code: 'Digit7', label: '7', shift: '&', popup: '7', w: 1, hand: 'right' },
      { code: 'Digit8', label: '8', shift: '*', popup: '8', w: 1, hand: 'right' },
      { code: 'Digit9', label: '9', shift: '(', popup: '9', w: 1, hand: 'right' },
      { code: 'Digit0', label: '0', shift: ')', popup: '0', w: 1, hand: 'right' },
      { code: 'Minus', label: '-', shift: '_', popup: '-', w: 1, hand: 'right' },
      { code: 'Equal', label: '=', shift: '+', popup: '=', w: 1, hand: 'right' },
      { code: 'Backspace', label: '⌫', popup: '⌫', w: 2, hand: 'right' },
    ],
    [
      { code: 'Tab', label: 'Tab', popup: 'Tab', w: 1.5, hand: 'left' },
      { code: 'KeyQ', label: 'Q', popup: 'Q', w: 1, hand: 'left' },
      { code: 'KeyW', label: 'W', popup: 'W', w: 1, hand: 'left' },
      { code: 'KeyE', label: 'E', popup: 'E', w: 1, hand: 'left' },
      { code: 'KeyR', label: 'R', popup: 'R', w: 1, hand: 'left' },
      { code: 'KeyT', label: 'T', popup: 'T', w: 1, hand: 'left' },
      { code: 'KeyY', label: 'Y', popup: 'Y', w: 1, hand: 'right' },
      { code: 'KeyU', label: 'U', popup: 'U', w: 1, hand: 'right' },
      { code: 'KeyI', label: 'I', popup: 'I', w: 1, hand: 'right' },
      { code: 'KeyO', label: 'O', popup: 'O', w: 1, hand: 'right' },
      { code: 'KeyP', label: 'P', popup: 'P', w: 1, hand: 'right' },
      { code: 'BracketLeft', label: '[', shift: '{', popup: '[', w: 1, hand: 'right' },
      { code: 'BracketRight', label: ']', shift: '}', popup: ']', w: 1, hand: 'right' },
      { code: 'Backslash', label: '\\', shift: '|', popup: '\\', w: 1.5, hand: 'right' },
    ],
    [
      { code: 'CapsLock', label: 'Caps', popup: 'Caps', w: 1.75, hand: 'left' },
      { code: 'KeyA', label: 'A', popup: 'A', w: 1, hand: 'left' },
      { code: 'KeyS', label: 'S', popup: 'S', w: 1, hand: 'left' },
      { code: 'KeyD', label: 'D', popup: 'D', w: 1, hand: 'left' },
      { code: 'KeyF', label: 'F', popup: 'F', w: 1, hand: 'left' },
      { code: 'KeyG', label: 'G', popup: 'G', w: 1, hand: 'left' },
      { code: 'KeyH', label: 'H', popup: 'H', w: 1, hand: 'right' },
      { code: 'KeyJ', label: 'J', popup: 'J', w: 1, hand: 'right' },
      { code: 'KeyK', label: 'K', popup: 'K', w: 1, hand: 'right' },
      { code: 'KeyL', label: 'L', popup: 'L', w: 1, hand: 'right' },
      { code: 'Semicolon', label: ';', shift: ':', popup: ';', w: 1, hand: 'right' },
      { code: 'Quote', label: "'", shift: '"', popup: "'", w: 1, hand: 'right' },
      { code: 'Enter', label: '⏎', popup: 'Enter', w: 2.25, accent: true, hand: 'right' },
    ],
    [
      { code: 'ShiftLeft', label: '⇧', popup: 'Shift', w: 2.25, accent: true, hand: 'left' },
      { code: 'KeyZ', label: 'Z', popup: 'Z', w: 1, hand: 'left' },
      { code: 'KeyX', label: 'X', popup: 'X', w: 1, hand: 'left' },
      { code: 'KeyC', label: 'C', popup: 'C', w: 1, hand: 'left' },
      { code: 'KeyV', label: 'V', popup: 'V', w: 1, hand: 'left' },
      { code: 'KeyB', label: 'B', popup: 'B', w: 1, hand: 'left' },
      { code: 'KeyN', label: 'N', popup: 'N', w: 1, hand: 'right' },
      { code: 'KeyM', label: 'M', popup: 'M', w: 1, hand: 'right' },
      { code: 'Comma', label: ',', shift: '<', popup: ',', w: 1, hand: 'right' },
      { code: 'Period', label: '.', shift: '>', popup: '.', w: 1, hand: 'right' },
      { code: 'Slash', label: '/', shift: '?', popup: '/', w: 1, hand: 'right' },
      { code: 'ShiftRight', label: '⇧', popup: 'Shift', w: 1.75, hand: 'right' },
      { code: 'ArrowUp', label: '↑', popup: '↑', w: 1, hand: 'right' },
    ],
    [
      { code: 'ControlLeft', label: 'Ctrl', popup: 'Ctrl', w: 1.25, hand: 'left' },
      { code: 'MetaLeft', label: isMac ? '⌘' : 'Win', popup: isMac ? '⌘' : 'Win', w: 1.25, hand: 'left' },
      { code: 'AltLeft', label: isMac ? '⌥' : 'Alt', popup: isMac ? 'Opt' : 'Alt', w: 1.25, hand: 'left' },
      { code: 'Space', label: '', popup: 'Space', w: 5.25, hand: 'right' },
      { code: 'AltRight', label: isMac ? '⌥' : 'Alt', popup: isMac ? 'Opt' : 'Alt', w: 1, hand: 'right' },
      { code: 'MetaRight', label: isMac ? '⌘' : 'Win', popup: isMac ? '⌘' : 'Win', w: 1, hand: 'right' },
      { code: 'ControlRight', label: 'Ctrl', popup: 'Ctrl', w: 1, hand: 'right' },
      { code: 'ArrowLeft', label: '←', popup: '←', w: 1, hand: 'right' },
      { code: 'ArrowDown', label: '↓', popup: '↓', w: 1, hand: 'right' },
      { code: 'ArrowRight', label: '→', popup: '→', w: 1, hand: 'right' },
    ],
  ];

  const CODE_ALIAS = {
    Backquote: { target: 'Escape', popup: '`', shift: '~' },
    Delete: { target: 'Backspace', popup: 'Del' },
    Insert: { target: 'Backspace', popup: 'Ins' },
    F1: { target: 'Digit1', popup: 'F1' },
    F2: { target: 'Digit2', popup: 'F2' },
    F3: { target: 'Digit3', popup: 'F3' },
    F4: { target: 'Digit4', popup: 'F4' },
    F5: { target: 'Digit5', popup: 'F5' },
    F6: { target: 'Digit6', popup: 'F6' },
    F7: { target: 'Digit7', popup: 'F7' },
    F8: { target: 'Digit8', popup: 'F8' },
    F9: { target: 'Digit9', popup: 'F9' },
    F10: { target: 'Digit0', popup: 'F10' },
    F11: { target: 'Minus', popup: 'F11' },
    F12: { target: 'Equal', popup: 'F12' },
    Numpad0: { target: 'Digit0', popup: '0' },
    Numpad1: { target: 'Digit1', popup: '1' },
    Numpad2: { target: 'Digit2', popup: '2' },
    Numpad3: { target: 'Digit3', popup: '3' },
    Numpad4: { target: 'Digit4', popup: '4' },
    Numpad5: { target: 'Digit5', popup: '5' },
    Numpad6: { target: 'Digit6', popup: '6' },
    Numpad7: { target: 'Digit7', popup: '7' },
    Numpad8: { target: 'Digit8', popup: '8' },
    Numpad9: { target: 'Digit9', popup: '9' },
    NumpadEnter: { target: 'Enter', popup: 'Enter' },
    NumpadAdd: { target: 'Equal', popup: '+' },
    NumpadSubtract: { target: 'Minus', popup: '-' },
    NumpadMultiply: { target: 'Digit8', popup: '*' },
    NumpadDivide: { target: 'Slash', popup: '/' },
    NumpadDecimal: { target: 'Period', popup: '.' },
    Home: { target: 'ArrowLeft', popup: 'Home' },
    End: { target: 'ArrowRight', popup: 'End' },
    PageUp: { target: 'ArrowUp', popup: 'PgUp' },
    PageDown: { target: 'ArrowDown', popup: 'PgDn' },
    ContextMenu: { target: 'ControlRight', popup: 'Menu' },
    IntlBackslash: { target: 'Backslash', popup: '\\' },
    OSLeft: { target: 'MetaLeft', popup: isMac ? '⌘' : 'Win' },
    OSRight: { target: 'MetaRight', popup: isMac ? '⌘' : 'Win' },
  };

  const keysList = [];
  const keyByCode = new Map();

  function kbToUnitLocal(kx, ky) {
    const cos = Math.cos(KB_LOCAL.angle);
    const sin = Math.sin(KB_LOCAL.angle);
    return {
      ux: KB_LOCAL.cx + kx * cos - ky * sin,
      uy: KB_LOCAL.cy + kx * sin + ky * cos,
    };
  }

  function buildKeyboardGeometry() {
    const innerW = KB_LOCAL.w - KB_LOCAL.padX * 2;
    const innerH = KB_LOCAL.h - KB_LOCAL.padY * 2;
    const numRows = KEY_ROWS_SPEC.length;
    const rowH = (innerH - KB_LOCAL.gap * (numRows - 1)) / numRows;

    let curY = -KB_LOCAL.h * 0.5 + KB_LOCAL.padY;

    for (const row of KEY_ROWS_SPEC) {
      const totalUnits = row.reduce((sum, k) => sum + k.w, 0);
      const unitW = (innerW - KB_LOCAL.gap * (row.length - 1)) / totalUnits;
      let curX = -KB_LOCAL.w * 0.5 + KB_LOCAL.padX;

      for (const spec of row) {
        const kw = spec.w * unitW;
        const lcx = curX + kw * 0.5;
        const lcy = curY + rowH * 0.5;
        const { ux, uy } = kbToUnitLocal(lcx, lcy);

        const keyObj = {
          ...spec,
          lx: curX,
          ly: curY,
          w: kw,
          h: rowH,
          lcx,
          lcy,
          ux,
          uy,
          isDown: false,
          press: 0,
          glow: 0,
        };
        keysList.push(keyObj);
        keyByCode.set(keyObj.code, keyObj);
        curX += kw + KB_LOCAL.gap;
      }
      curY += rowH + KB_LOCAL.gap;
    }
  }

  buildKeyboardGeometry();

  // =========================================================================
  // Per-Puppy Squatting + On-Demand Reaching Paw State
  // =========================================================================
  function createDogState(phaseOffset, baseTilt) {
    return {
      phaseOffset,
      baseTilt,
      breathPhase: phaseOffset,
      tailPhase: phaseOffset * 1.6,
      bounce: 0,
      leftEarKick: 0,
      rightEarKick: 0,
      excitement: 0,
      blinkTimer: 2.0 + phaseOffset * 0.8,
      blinkProgress: 0,
      glintProgress: 0,
      leanX: 0,
      targetLeanX: 0,
      lookX: 0,
      lookY: 0,
      targetLookX: 0,
      targetLookY: 0,
      // Left paw: defaults to 'squat' (tucked on ground!). Only reaches out on left-key OR mouse move/click!
      leftPaw: {
        x: LEFT_SQUAT_HOME_X,
        y: LEFT_SQUAT_HOME_Y,
        targetX: LEFT_SQUAT_HOME_X,
        targetY: LEFT_SQUAT_HOME_Y,
        mode: 'squat', // 'squat' | 'mouse' | 'keyboard'
        activeKeyCode: null,
        holdUntil: 0,
        clickShiftX: 0,
        clickShiftY: 0,
        lift: 0,
        press: 0,
        isExtended: false, // true whenever paw has left the resting squat pose
      },
      // Right paw: defaults to 'squat' (tucked on ground!). Only reaches out on right-key!
      rightPaw: {
        x: RIGHT_SQUAT_HOME_X,
        y: RIGHT_SQUAT_HOME_Y,
        targetX: RIGHT_SQUAT_HOME_X,
        targetY: RIGHT_SQUAT_HOME_Y,
        prevX: RIGHT_SQUAT_HOME_X,
        prevY: RIGHT_SQUAT_HOME_Y,
        ghostAlpha: 0,
        mode: 'squat', // 'squat' | 'keyboard'
        activeKeyCode: null,
        holdUntil: 0,
        lift: 0,
        press: 0,
        isExtended: false,
      },
    };
  }

  const dogs = {
    sunny: {
      id: 'sunny',
      name: '墨镜金毛',
      subtitle: '图1 · 垂耳酷金毛',
      state: createDogState(0.0, -0.032),
    },
    daisy: {
      id: 'daisy',
      name: '蓝巾笑柴',
      subtitle: '图2 · 蓝花巾笑柴',
      state: createDogState(2.1, 0.042),
    },
    kuro: {
      id: 'kuro',
      name: '歪头黑柴',
      subtitle: '图3 · 豆眉小黑柴',
      state: createDogState(4.2, 0.088),
    },
  };

  const inputState = {
    time: 0,
    actionCount: 0,
    shiftDown: false,
    metaDown: false,
    activeCodes: new Set(),
    metaPressedCodes: new Set(),

    mouseNormX: 0.5,
    mouseNormY: 0.5,
    mouseLX: INIT_MOUSE_LX,
    mouseLY: INIT_MOUSE_LY,
    mouseTargetLX: INIT_MOUSE_LX,
    mouseTargetLY: INIT_MOUSE_LY,
    mouseVx: 0,
    mouseTilt: 0.02,
    mouseActiveUntil: -1,

    leftDown: false,
    rightDown: false,
    middleDown: false,
    leftGlow: 0,
    rightGlow: 0,
    middleGlow: 0,
    wheelOffset: 0,
    wheelVel: 0,

    popups: [],
    ripples: [],
    particles: [],
    mouseBadges: [],
  };

  // =========================================================================
  // Math & Stage Layout Helpers
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

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const x = clamp(t, 0, 1);
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
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

  function getActivePlacements() {
    if (currentView === 'all') {
      return [
        { dog: dogs.sunny, cx: 235, baseY: 446, scale: 0.94 },
        { dog: dogs.daisy, cx: 660, baseY: 446, scale: 0.94 },
        { dog: dogs.kuro, cx: 1085, baseY: 446, scale: 0.94 },
      ];
    }
    const target = dogs[currentView] || dogs.daisy;
    return [{ dog: target, cx: STAGE_W * 0.5, baseY: 446, scale: 1.16 }];
  }

  function unitToStage(placement, ux, uy) {
    return {
      sx: placement.cx + ux * placement.scale,
      sy: placement.baseY + uy * placement.scale,
    };
  }

  function incrementAction(hintText) {
    inputState.actionCount += 1;
    actionCountEl.textContent = String(inputState.actionCount);
    if (hintText) statusHintEl.textContent = hintText;
  }

  function spawnRipple(x, y, color, maxRadius = 32) {
    inputState.ripples.push({ x, y, color, maxRadius, life: 0, maxLife: 0.36 });
  }

  function spawnSparkles(x, y, color, count = 4) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const speed = 42 + Math.random() * 68;
      inputState.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 22,
        size: 2.8 + Math.random() * 3.0,
        color,
        life: 0,
        maxLife: 0.36 + Math.random() * 0.2,
        rot: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 8,
      });
    }
  }

  function spawnMouseBadge(x, y, text, color) {
    inputState.mouseBadges.push({ x, y, text, color, life: 0, maxLife: 0.72 });
  }

  // =========================================================================
  // Enlarged Floating Keycap Popups (Pop-Up + Smooth Gradient Fade-Out!)
  // =========================================================================
  function getKeyDisplayInfo(e, keyObj, alias) {
    if (alias) {
      let main = alias.popup;
      if (e.shiftKey && alias.shift) main = alias.shift;
      return {
        main,
        widthFactor: main.length >= 4 ? 1.52 : main.length >= 3 ? 1.28 : 1.0,
      };
    }
    if (keyObj) {
      let main = keyObj.popup || keyObj.label || 'Key';
      if (e.shiftKey && keyObj.shift) main = keyObj.shift;
      let widthFactor = 1.0;
      if (keyObj.code === 'Space') widthFactor = 2.0;
      else if (main.length >= 5) widthFactor = 1.62;
      else if (main.length >= 3) widthFactor = 1.32;
      return { main, widthFactor };
    }
    const rawKey =
      e.key && e.key !== 'Process' && e.key !== 'Unidentified'
        ? e.key.length === 1
          ? e.key.toUpperCase()
          : e.key.slice(0, 5)
        : (e.code || 'Key').slice(0, 5);
    return {
      main: rawKey,
      widthFactor: rawKey.length >= 3 ? 1.38 : 1.0,
    };
  }

  function spawnOrPulseKeyPopup(code, keyObj, displayInfo, isRepeat) {
    if (isRepeat) {
      const existing = [...inputState.popups].reverse().find((p) => p.code === code && p.isHeld);
      if (existing) {
        existing.pulse = 1;
        existing.holdElapsed = 0;
        return;
      }
    }

    const placements = getActivePlacements();
    const anchorPlacement = placements.length === 3 ? placements[1] : placements[0];
    const keyUX = keyObj ? keyObj.ux : KB_LOCAL.cx;
    const keyUY = keyObj ? keyObj.uy : KB_LOCAL.cy;
    const startPos = unitToStage(anchorPlacement, keyUX, keyUY - 8);

    const boxH = 74;
    const boxW = Math.round(74 * displayInfo.widthFactor);
    const isLeftSide = keyObj ? keyObj.hand === 'left' : false;

    let targetX;
    let targetY;

    if (currentView === 'all') {
      const normKeyX = clamp((keyUX - KB_LOCAL.cx) / (KB_LOCAL.w * 0.5), -1, 1);
      targetX = STAGE_W * 0.5 + normKeyX * 260;
      targetY = 106;

      const fresh = inputState.popups.filter((p) => p.fadeProgress < 0.45);
      for (let attempt = 0; attempt < 6; attempt++) {
        let overlap = false;
        for (const other of fresh) {
          const minX = (boxW + other.w) * 0.5 + 14;
          const minY = 66;
          if (Math.abs(targetX - other.targetX) < minX && Math.abs(targetY - other.targetY) < minY) {
            const dir = attempt % 2 === 0 ? 1 : -1;
            targetX += dir * (minX + 6) * Math.ceil((attempt + 1) / 2);
            targetX = clamp(targetX, 90 + boxW * 0.5, STAGE_W - 90 - boxW * 0.5);
            overlap = true;
          }
        }
        if (!overlap) break;
      }
    } else {
      targetX = isLeftSide
        ? clamp(235 + (keyUX - KB_LOCAL.cx) * 0.35, 95 + boxW * 0.5, 355 - boxW * 0.5)
        : clamp(1085 + (keyUX - KB_LOCAL.cx) * 0.35, 965 + boxW * 0.5, 1225 - boxW * 0.5);
      targetY = 235;

      const fresh = inputState.popups.filter((p) => p.fadeProgress < 0.45);
      for (let attempt = 0; attempt < 5; attempt++) {
        let overlap = false;
        for (const other of fresh) {
          const minX = (boxW + other.w) * 0.5 + 12;
          const minY = 68;
          if (Math.abs(targetX - other.targetX) < minX && Math.abs(targetY - other.targetY) < minY) {
            targetY -= 72;
            if (targetY < 96) {
              targetY = 300;
              targetX += isLeftSide ? -52 : 52;
              targetX = clamp(targetX, 80 + boxW * 0.5, STAGE_W - 80 - boxW * 0.5);
            }
            overlap = true;
          }
        }
        if (!overlap) break;
      }
    }

    if (inputState.popups.length >= 6) {
      inputState.popups[0].fastFade = true;
      inputState.popups[0].isHeld = false;
    }

    inputState.popups.push({
      code,
      main: displayInfo.main,
      w: boxW,
      h: boxH,
      startX: startPos.sx,
      startY: startPos.sy,
      x: startPos.sx,
      y: startPos.sy,
      targetX,
      targetY,
      age: 0,
      holdElapsed: 0,
      fadeElapsed: 0,
      fadeProgress: 0,
      isHeld: true,
      fastFade: false,
      pulse: 1,
      isAccent: Boolean(keyObj && keyObj.accent),
    });
  }

  // =========================================================================
  // HUD Controls & Global Keyboard / Mouse Listeners
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

    for (const { dog } of getActivePlacements()) {
      dog.state.bounce = 0.85;
      dog.state.leftEarKick = 0.85;
      dog.state.rightEarKick = 0.85;
      dog.state.excitement = Math.max(dog.state.excitement, 0.4);
      if (dog.id === 'sunny') dog.state.glintProgress = 0.01;
    }

    if (viewId === 'all') {
      statusHintEl.textContent = '保持乖巧蹲坐 · 按键盘或动/点鼠标时才伸前爪去操作';
    } else if (dogs[viewId]) {
      statusHintEl.textContent = `已切换：${dogs[viewId].name} · 按键盘或动/点鼠标试试`;
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

  soundToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    soundEnabled = !soundEnabled;
    soundToggleBtn.setAttribute('aria-pressed', String(soundEnabled));
    soundIconEl.textContent = soundEnabled ? '🔊' : '🔇';
    soundLabelEl.textContent = soundEnabled ? '音效开' : '音效关';
    if (soundEnabled) {
      ensureAudio();
      playKeySound(false);
    }
    soundToggleBtn.blur();
  });

  themeToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isDarkTheme = !isDarkTheme;
    syncThemeUI();
    drawScene();
    themeToggleBtn.blur();
  });

  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportTransparentPNG();
    exportBtn.blur();
  });

  function resolveKeyTarget(code) {
    if (keyByCode.has(code)) return { keyObj: keyByCode.get(code), alias: null };
    const alias = CODE_ALIAS[code];
    if (alias && keyByCode.has(alias.target)) return { keyObj: keyByCode.get(alias.target), alias };
    return { keyObj: keyByCode.get('Space'), alias: null, unknown: true };
  }

  function assignPawForDogKey(dogObj, keyObj) {
    if (!keyObj) return;
    const st = dogObj.state;

    const mouseBusy =
      inputState.leftDown ||
      inputState.rightDown ||
      inputState.middleDown ||
      inputState.time < inputState.mouseActiveUntil;

    let useLeft = keyObj.hand === 'left';
    if (useLeft && mouseBusy) {
      useLeft = false;
    }

    if (useLeft) {
      const lp = st.leftPaw;
      lp.mode = 'keyboard';
      lp.isExtended = true;
      lp.activeKeyCode = keyObj.code;
      lp.targetX = keyObj.ux;
      lp.targetY = keyObj.uy - 3;
      lp.holdUntil = inputState.time + 0.36;
      st.leftEarKick = 1;
    } else {
      const rp = st.rightPaw;
      rp.prevX = rp.x;
      rp.prevY = rp.y;
      rp.ghostAlpha = rp.isExtended ? 0.36 : 0.18;
      rp.mode = 'keyboard';
      rp.isExtended = true;
      rp.activeKeyCode = keyObj.code;
      rp.targetX = keyObj.code === 'Space' ? keyObj.ux + 16 : keyObj.ux;
      rp.targetY = keyObj.uy - 3;
      rp.holdUntil = inputState.time + 0.36;
      st.rightEarKick = 1;
    }

    st.targetLeanX = clamp((keyObj.ux - DOG_X) * 0.14, -18, 18);
    st.targetLookX = clamp((keyObj.ux - DOG_X) / 175, -0.8, 0.85);
    st.targetLookY = 0.52;
    st.bounce = 0.9;
    st.excitement = Math.min(1, st.excitement + 0.25);
    if (dogObj.id === 'sunny' && st.glintProgress === 0 && Math.random() < 0.35) {
      st.glintProgress = 0.01;
    }
  }

  window.addEventListener('keydown', (e) => {
    const isBrowserShortcut =
      ((e.metaKey || e.ctrlKey) &&
        (e.code === 'KeyR' || e.code === 'KeyW' || e.code === 'KeyT' || e.code === 'KeyL')) ||
      e.code === 'F12';

    if (!isBrowserShortcut) {
      if (
        e.code === 'Space' ||
        e.code === 'Tab' ||
        e.code === 'Backspace' ||
        e.code === 'Slash' ||
        e.code === 'Quote' ||
        e.code.startsWith('Arrow') ||
        e.code.startsWith('F')
      ) {
        e.preventDefault();
      }
    }

    inputState.shiftDown = e.shiftKey;
    if (e.code === 'MetaLeft' || e.code === 'MetaRight') inputState.metaDown = true;

    const { keyObj, alias, unknown } = resolveKeyTarget(e.code);
    const displayInfo = getKeyDisplayInfo(e, unknown ? null : keyObj, alias);

    if (keyObj) {
      keyObj.isDown = true;
      keyObj.glow = 1;
    }

    inputState.activeCodes.add(e.code);
    if (inputState.metaDown && e.code !== 'MetaLeft' && e.code !== 'MetaRight') {
      inputState.metaPressedCodes.add(e.code);
    }

    spawnOrPulseKeyPopup(e.code, keyObj, displayInfo, e.repeat);

    if (!e.repeat && keyObj) {
      const placements = getActivePlacements();
      for (const p of placements) {
        assignPawForDogKey(p.dog, keyObj);
        const pos = unitToStage(p, keyObj.ux, keyObj.uy);
        spawnRipple(pos.sx, pos.sy, '#FFA234', Math.max(18, keyObj.w * p.scale * 0.72));
        spawnSparkles(pos.sx, pos.sy - 3, '#FFB84D', placements.length > 1 ? 3 : 5);
      }

      playKeySound(keyObj.w >= 1.75);
      incrementAction(`按下按键：${displayInfo.main}`);
    }
  });

  function releaseKeyCode(code) {
    inputState.activeCodes.delete(code);
    const { keyObj } = resolveKeyTarget(code);
    if (keyObj) {
      let stillHeld = false;
      for (const active of inputState.activeCodes) {
        if (resolveKeyTarget(active).keyObj === keyObj) {
          stillHeld = true;
          break;
        }
      }
      if (!stillHeld) keyObj.isDown = false;
    }

    for (const p of inputState.popups) {
      if (p.code === code && p.isHeld) p.isHeld = false;
    }

    for (const dogObj of Object.values(dogs)) {
      const st = dogObj.state;
      if (keyObj && st.leftPaw.activeKeyCode === keyObj.code) {
        st.leftPaw.activeKeyCode = null;
        st.leftPaw.holdUntil = Math.min(st.leftPaw.holdUntil, inputState.time + 0.24);
      }
      if (keyObj && st.rightPaw.activeKeyCode === keyObj.code) {
        st.rightPaw.activeKeyCode = null;
        st.rightPaw.holdUntil = Math.min(st.rightPaw.holdUntil, inputState.time + 0.24);
      }
    }
  }

  window.addEventListener('keyup', (e) => {
    inputState.shiftDown = e.shiftKey;
    releaseKeyCode(e.code);

    if (e.code === 'MetaLeft' || e.code === 'MetaRight') {
      inputState.metaDown = false;
      for (const stuckCode of [...inputState.metaPressedCodes]) releaseKeyCode(stuckCode);
      inputState.metaPressedCodes.clear();
    }
  });

  function activateMouseReach(clientX, clientY, holdSeconds = 0.65) {
    const nx = clamp(clientX / Math.max(1, window.innerWidth), 0, 1);
    const ny = clamp(clientY / Math.max(1, window.innerHeight), 0, 1);

    inputState.mouseNormX = nx;
    inputState.mouseNormY = ny;
    inputState.mouseTargetLX = lerp(MOUSE_BOUNDS_LOCAL.minX, MOUSE_BOUNDS_LOCAL.maxX, nx);
    inputState.mouseTargetLY = lerp(MOUSE_BOUNDS_LOCAL.minY, MOUSE_BOUNDS_LOCAL.maxY, ny);
    inputState.mouseActiveUntil = Math.max(inputState.mouseActiveUntil, inputState.time + holdSeconds);

    for (const dogObj of Object.values(dogs)) {
      const st = dogObj.state;
      st.leftPaw.mode = 'mouse';
      st.leftPaw.isExtended = true;
      st.leftPaw.activeKeyCode = null;
      st.targetLookX = (nx - 0.5) * 1.2 - 0.25;
      st.targetLookY = 0.35 + (ny - 0.5) * 0.45;
      st.targetLeanX = -14 + (nx - 0.5) * 8;
    }
  }

  function syncMouseButtonsBitmask(buttons) {
    if (typeof buttons !== 'number') return;
    inputState.leftDown = (buttons & 1) !== 0;
    inputState.rightDown = (buttons & 2) !== 0;
    inputState.middleDown = (buttons & 4) !== 0;
  }

  window.addEventListener('mousemove', (e) => {
    if (e.target && e.target.closest && e.target.closest('.hud-top')) return;
    activateMouseReach(e.clientX, e.clientY, 0.62);
    syncMouseButtonsBitmask(e.buttons);
  });

  window.addEventListener('mousedown', (e) => {
    if (e.target && e.target.closest && e.target.closest('.hud-top')) return;

    activateMouseReach(e.clientX, e.clientY, 0.78);
    const placements = getActivePlacements();

    for (const p of placements) {
      const st = p.dog.state;
      st.leftEarKick = 0.95;
      st.bounce = 0.72;
      st.excitement = Math.min(1, st.excitement + 0.24);
    }

    if (e.button === 0) {
      inputState.leftDown = true;
      inputState.leftGlow = 1;
      for (const p of placements) {
        const mPos = unitToStage(p, inputState.mouseLX - 12, inputState.mouseLY + 16);
        spawnRipple(mPos.sx, mPos.sy, '#FF7849', 34 * p.scale);
        spawnSparkles(mPos.sx, mPos.sy, '#FF7849', placements.length > 1 ? 3 : 5);
        spawnMouseBadge(mPos.sx - 6, mPos.sy + 36 * p.scale, '左键', '#FF6B42');
      }
      playMouseClickSound(false);
      incrementAction('点击鼠标左键');
    } else if (e.button === 2) {
      inputState.rightDown = true;
      inputState.rightGlow = 1;
      for (const p of placements) {
        const mPos = unitToStage(p, inputState.mouseLX + 12, inputState.mouseLY + 16);
        spawnRipple(mPos.sx, mPos.sy, '#38BDF8', 34 * p.scale);
        spawnSparkles(mPos.sx, mPos.sy, '#38BDF8', placements.length > 1 ? 3 : 5);
        spawnMouseBadge(mPos.sx + 6, mPos.sy + 36 * p.scale, '右键', '#0EA5E9');
      }
      playMouseClickSound(true);
      incrementAction('点击鼠标右键');
    } else if (e.button === 1) {
      e.preventDefault();
      inputState.middleDown = true;
      inputState.middleGlow = 1;
      for (const p of placements) {
        const mPos = unitToStage(p, inputState.mouseLX, inputState.mouseLY + 14);
        spawnRipple(mPos.sx, mPos.sy, '#A78BFA', 30 * p.scale);
        spawnMouseBadge(mPos.sx, mPos.sy + 36 * p.scale, '中键', '#8B5CF6');
      }
      playMouseClickSound(true);
      incrementAction('点击鼠标中键');
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) inputState.leftDown = false;
    else if (e.button === 2) inputState.rightDown = false;
    else if (e.button === 1) inputState.middleDown = false;
    syncMouseButtonsBitmask(e.buttons);
    inputState.mouseActiveUntil = Math.max(inputState.mouseActiveUntil, inputState.time + 0.5);
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  window.addEventListener(
    'wheel',
    (e) => {
      inputState.wheelVel += clamp(e.deltaY, -120, 120) * 0.28;
      inputState.middleGlow = Math.max(inputState.middleGlow, 0.85);
      inputState.mouseActiveUntil = Math.max(inputState.mouseActiveUntil, inputState.time + 0.65);
      for (const dogObj of Object.values(dogs)) {
        const st = dogObj.state;
        st.leftPaw.mode = 'mouse';
        st.leftPaw.isExtended = true;
        st.excitement = Math.min(1, st.excitement + 0.08);
      }
    },
    { passive: true }
  );

  window.addEventListener('blur', () => {
    for (const code of [...inputState.activeCodes]) releaseKeyCode(code);
    inputState.metaDown = false;
    inputState.shiftDown = false;
    inputState.metaPressedCodes.clear();
    inputState.leftDown = false;
    inputState.rightDown = false;
    inputState.middleDown = false;
  });

  function exportTransparentPNG() {
    const offCanvas = document.createElement('canvas');
    const exportScale = 2;
    offCanvas.width = STAGE_W * exportScale;
    offCanvas.height = STAGE_H * exportScale;
    const octx = offCanvas.getContext('2d');
    if (!octx) return;

    octx.scale(exportScale, exportScale);
    for (const p of getActivePlacements()) {
      drawPuppyWorkstation(octx, p, true);
    }

    const link = document.createElement('a');
    link.download = `peng-dogs-${currentView}-squat-desk.png`;
    link.href = offCanvas.toDataURL('image/png');
    link.click();
    statusHintEl.textContent = `已导出透明 PNG：peng-dogs-${currentView}-squat-desk.png`;
  }

  // =========================================================================
  // Simulation Update
  // =========================================================================
  function update(dt) {
    inputState.time += dt;

    // Shared Mouse glide & button glows
    const prevMx = inputState.mouseLX;
    const mFollow = 1 - Math.exp(-dt * 24);
    inputState.mouseLX = lerp(inputState.mouseLX, inputState.mouseTargetLX, mFollow);
    inputState.mouseLY = lerp(inputState.mouseLY, inputState.mouseTargetLY, mFollow);
    inputState.mouseVx = (inputState.mouseLX - prevMx) / Math.max(0.001, dt);
    const targetTilt = clamp(
      0.02 + inputState.mouseVx * 0.0006 + (inputState.mouseNormX - 0.5) * 0.07,
      -0.14,
      0.16
    );
    inputState.mouseTilt = lerp(inputState.mouseTilt, targetTilt, 1 - Math.exp(-dt * 14));

    inputState.wheelOffset += inputState.wheelVel * dt;
    inputState.wheelVel *= Math.exp(-dt * 10);

    if (inputState.leftDown) inputState.leftGlow = 1;
    else inputState.leftGlow = Math.max(0, inputState.leftGlow - dt * 3.0);

    if (inputState.rightDown) inputState.rightGlow = 1;
    else inputState.rightGlow = Math.max(0, inputState.rightGlow - dt * 3.0);

    if (inputState.middleDown) inputState.middleGlow = 1;
    else inputState.middleGlow = Math.max(0, inputState.middleGlow - dt * 3.2);

    const anyMouseHeld = inputState.leftDown || inputState.rightDown || inputState.middleDown;
    if (anyMouseHeld) {
      inputState.mouseActiveUntil = Math.max(inputState.mouseActiveUntil, inputState.time + 0.55);
    }
    const mouseWanted = inputState.time < inputState.mouseActiveUntil;

    for (const k of keysList) {
      k.press = lerp(k.press, k.isDown ? 1 : 0, 1 - Math.exp(-dt * 30));
      if (k.isDown) k.glow = 1;
      else k.glow = Math.max(0, k.glow - dt * 3.4);
    }

    const pawFollow = 1 - Math.exp(-dt * 24);
    for (const dogObj of Object.values(dogs)) {
      const st = dogObj.state;
      st.breathPhase += dt * 2.5;
      st.excitement = Math.max(0, st.excitement - dt * 0.45);
      st.tailPhase += dt * (4.5 + st.excitement * 11.0);

      st.leanX = lerp(st.leanX, st.targetLeanX, 1 - Math.exp(-dt * 9));
      st.targetLeanX *= Math.exp(-dt * 2.0);

      // Gently return gaze forward when idle
      if (!mouseWanted && inputState.activeCodes.size === 0) {
        st.targetLookX *= Math.exp(-dt * 2.2);
        st.targetLookY *= Math.exp(-dt * 2.2);
      }
      st.lookX = lerp(st.lookX, st.targetLookX, 1 - Math.exp(-dt * 10));
      st.lookY = lerp(st.lookY, st.targetLookY, 1 - Math.exp(-dt * 10));
      st.leftEarKick *= Math.exp(-dt * 13);
      st.rightEarKick *= Math.exp(-dt * 13);
      st.bounce *= Math.exp(-dt * 15);

      st.blinkTimer -= dt;
      if (st.blinkTimer <= 0) {
        st.blinkProgress += dt * 7.6;
        if (st.blinkProgress >= Math.PI) {
          st.blinkProgress = 0;
          st.blinkTimer = 2.4 + Math.random() * 3.0;
        }
      }

      if (st.glintProgress > 0) {
        st.glintProgress += dt * 2.4;
        if (st.glintProgress >= 1) st.glintProgress = 0;
      } else if (dogObj.id === 'sunny' && Math.random() < dt * 0.18) {
        st.glintProgress = 0.01;
      }

      const bodyX = DOG_X + st.leanX;
      const leftHomeX = bodyX - 35;
      const leftHomeY = LEFT_SQUAT_HOME_Y;
      const rightHomeX = bodyX + 35;
      const rightHomeY = RIGHT_SQUAT_HOME_Y;

      // ---- LEFT PAW STATE MACHINE ('squat' <-> 'mouse' / 'keyboard') ----
      const lp = st.leftPaw;
      const leftKeyWanted = lp.mode === 'keyboard' && (lp.activeKeyCode !== null || inputState.time < lp.holdUntil);

      if (leftKeyWanted) {
        lp.isExtended = true;
      } else if (mouseWanted) {
        lp.mode = 'mouse';
        lp.isExtended = true;
        let cShiftX = 0;
        let cShiftY = 0;
        if (inputState.leftDown || inputState.leftGlow > 0.3) {
          const s = Math.max(inputState.leftDown ? 1 : 0, inputState.leftGlow);
          cShiftX = -4.5 * s;
          cShiftY = 3.5 * s;
        } else if (inputState.rightDown || inputState.rightGlow > 0.3) {
          const s = Math.max(inputState.rightDown ? 1 : 0, inputState.rightGlow);
          cShiftX = 4.5 * s;
          cShiftY = 3.5 * s;
        }
        lp.clickShiftX = lerp(lp.clickShiftX, cShiftX, 1 - Math.exp(-dt * 26));
        lp.clickShiftY = lerp(lp.clickShiftY, cShiftY, 1 - Math.exp(-dt * 26));
        lp.targetX = inputState.mouseLX + 2 + lp.clickShiftX;
        lp.targetY = inputState.mouseLY - 16 + lp.clickShiftY;
      } else {
        // Retract back to pure squatting pose!
        lp.mode = 'squat';
        lp.targetX = leftHomeX;
        lp.targetY = leftHomeY;
      }

      const lpDist = Math.hypot(lp.targetX - lp.x, lp.targetY - lp.y);
      lp.x = lerp(lp.x, lp.targetX, pawFollow);
      lp.y = lerp(lp.y, lp.targetY, pawFollow);

      const lpDistFromHome = Math.hypot(lp.x - leftHomeX, lp.y - leftHomeY);
      if (lp.mode === 'squat' && lpDist < 0.6) {
        lp.x = leftHomeX;
        lp.y = leftHomeY;
        lp.isExtended = false;
      } else if (lpDistFromHome > 0.8) {
        lp.isExtended = true;
      }

      const lpClicking =
        lp.mode === 'mouse'
          ? anyMouseHeld
          : lp.mode === 'keyboard' && lp.activeKeyCode !== null && lpDist < 16;
      lp.lift = lerp(lp.lift, clamp(lpDist / 58, 0, 0.85), 1 - Math.exp(-dt * 22));
      lp.press = lerp(lp.press, lpClicking ? 1 : 0, 1 - Math.exp(-dt * 28));

      // ---- RIGHT PAW STATE MACHINE ('squat' <-> 'keyboard') ----
      const rp = st.rightPaw;
      const rightKeyWanted = rp.activeKeyCode !== null || inputState.time < rp.holdUntil;

      if (rightKeyWanted) {
        rp.mode = 'keyboard';
        rp.isExtended = true;
      } else {
        // Retract back to pure squatting pose!
        rp.mode = 'squat';
        rp.targetX = rightHomeX;
        rp.targetY = rightHomeY;
      }

      const rpDist = Math.hypot(rp.targetX - rp.x, rp.targetY - rp.y);
      rp.x = lerp(rp.x, rp.targetX, pawFollow);
      rp.y = lerp(rp.y, rp.targetY, pawFollow);
      rp.ghostAlpha = Math.max(0, rp.ghostAlpha - dt * 3.8);

      const rpDistFromHome = Math.hypot(rp.x - rightHomeX, rp.y - rightHomeY);
      if (rp.mode === 'squat' && rpDist < 0.6) {
        rp.x = rightHomeX;
        rp.y = rightHomeY;
        rp.isExtended = false;
      } else if (rpDistFromHome > 0.8) {
        rp.isExtended = true;
      }

      rp.lift = lerp(rp.lift, clamp(rpDist / 55, 0, 0.85), 1 - Math.exp(-dt * 24));
      rp.press = lerp(rp.press, rightKeyWanted && rpDist < 16 ? 1 : 0, 1 - Math.exp(-dt * 30));
    }

    // Enlarged floating keycaps (pop-up + smooth gradient fade-out!)
    for (let i = inputState.popups.length - 1; i >= 0; i--) {
      const p = inputState.popups[i];
      p.age += dt;
      p.pulse *= Math.exp(-dt * 14);

      const moveT = easeOutCubic(Math.min(1, p.age / 0.16));
      p.x = lerp(p.startX, p.targetX, moveT);
      p.y = lerp(p.startY, p.targetY, moveT);

      const minHold = p.fastFade ? 0.14 : 0.44;
      if (!p.isHeld || p.age > 1.35) p.holdElapsed += dt;

      if (p.age >= minHold && (!p.isHeld || p.age > 1.35)) {
        const fadeDur = p.fastFade ? 0.34 : 0.76;
        p.fadeElapsed += dt;
        p.fadeProgress = clamp(p.fadeElapsed / fadeDur, 0, 1);
      }

      if (p.fadeProgress >= 1) inputState.popups.splice(i, 1);
    }

    for (let i = inputState.ripples.length - 1; i >= 0; i--) {
      inputState.ripples[i].life += dt;
      if (inputState.ripples[i].life >= inputState.ripples[i].maxLife) inputState.ripples.splice(i, 1);
    }

    for (let i = inputState.particles.length - 1; i >= 0; i--) {
      const pt = inputState.particles[i];
      pt.life += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 160 * dt;
      pt.vx *= Math.exp(-dt * 2.5);
      pt.rot += pt.vRot * dt;
      if (pt.life >= pt.maxLife) inputState.particles.splice(i, 1);
    }

    for (let i = inputState.mouseBadges.length - 1; i >= 0; i--) {
      inputState.mouseBadges[i].life += dt;
      if (inputState.mouseBadges[i].life >= inputState.mouseBadges[i].maxLife) {
        inputState.mouseBadges.splice(i, 1);
      }
    }
  }

  // =========================================================================
  // Backdrop & Ambient Decorations
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
      grad.addColorStop(0, '#F3F9FF');
      grad.addColorStop(0.55, '#DCEEFF');
      grad.addColorStop(1, '#C1E1FE');
    } else if (currentView === 'sunny') {
      grad.addColorStop(0, '#FFFEFA');
      grad.addColorStop(0.6, '#FFF7E4');
      grad.addColorStop(1, '#F8E9C8');
    } else if (currentView === 'kuro') {
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.65, '#FAF8F4');
      grad.addColorStop(1, '#EFECE4');
    } else {
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
    const bob = Math.sin(inputState.time * 2.2 + phase) * 4;
    c.save();
    c.translate(x, y + bob);
    c.rotate(rot);

    c.beginPath();
    c.moveTo(0, size * 0.34);
    c.bezierCurveTo(-size * 0.16, -size * 0.44, -size * 1.15, -size * 0.24, -size * 0.9, size * 0.38);
    c.bezierCurveTo(-size * 0.72, size * 0.85, -size * 0.14, size * 1.05, 0, size * 1.2);
    c.bezierCurveTo(size * 0.14, size * 1.05, size * 0.72, size * 0.85, size * 0.9, size * 0.38);
    c.bezierCurveTo(size * 1.15, -size * 0.24, size * 0.16, -size * 0.44, 0, size * 0.34);
    c.closePath();

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
    const bob = Math.sin(inputState.time * 1.9 + phase) * 3.5;
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

  function drawBlueRibbonBow(c, x, y, s, rot, phase) {
    const bob = Math.sin(inputState.time * 2.0 + phase) * 4;
    c.save();
    c.translate(x, y + bob);
    c.rotate(rot);
    c.scale(s, s);

    const stroke = '#6D96CC';
    const fill = '#B8D8FA';

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

      c.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(side * 10, -4);
      c.lineTo(side * 26, 2);
      c.stroke();
    }

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
      drawBlueRibbonBow(ctx, 320, 150, 1.05, -0.22, 0.4);
      drawBlueRibbonBow(ctx, 995, 195, 1.05, 0.18, 1.9);
      drawPastelHeart(ctx, 760, 92, 20, 0.14, 0.2);
      drawPastelHeart(ctx, 345, 310, 18, -0.2, 1.5);
      drawPastelHeart(ctx, 985, 340, 19, 0.18, 2.6);
      drawPastelStar(ctx, 430, 102, 18, -0.18, 0.9);
      drawPastelStar(ctx, 925, 118, 19, 0.22, 2.1);
    }
  }

  // =========================================================================
  // Shared Squatting Torso, Hind Legs & Resting Front Legs (Image 2 Pose!)
  // =========================================================================
  function defineSquatHindThighPath(c, bodyX, side, breath) {
    c.beginPath();
    c.moveTo(bodyX + side * 46, -98 + breath * 0.3);
    c.bezierCurveTo(bodyX + side * 86, -92 + breath * 0.2, bodyX + side * 94, -50, bodyX + side * 80, -22);
    c.bezierCurveTo(bodyX + side * 70, -12, bodyX + side * 52, -14, bodyX + side * 44, -26);
    c.closePath();
  }

  function defineTuckedHindPawPath(c, bodyX, side) {
    c.beginPath();
    c.ellipse(bodyX + side * 71, -17, 18, 10.5, side * 0.12, 0, Math.PI * 2);
  }

  function drawHindPawToeCreases(c, bodyX, side, strokeColor, lineWidth) {
    c.save();
    c.strokeStyle = strokeColor;
    c.lineWidth = lineWidth;
    c.lineCap = 'round';
    for (const ox of [66, 75]) {
      c.beginPath();
      c.moveTo(bodyX + side * ox, -21);
      c.lineTo(bodyX + side * (ox + 1), -12);
      c.stroke();
    }
    c.restore();
  }

  function defineSquatTorsoPath(c, bodyX, breath) {
    const topY = -134 + breath * 0.5;
    c.beginPath();
    c.moveTo(bodyX, topY);
    c.bezierCurveTo(bodyX + 50, topY, bodyX + 72, -104 + breath * 0.35, bodyX + 70, -58);
    c.bezierCurveTo(bodyX + 68, -28, bodyX + 38, -17, bodyX, -17);
    c.bezierCurveTo(bodyX - 38, -17, bodyX - 68, -28, bodyX - 70, -58);
    c.bezierCurveTo(bodyX - 72, -104 + breath * 0.35, bodyX - 50, topY, bodyX, topY);
    c.closePath();
  }

  // Image 2's Resting Squatting Front Leg & Ground-Tucked Paw (drawn whenever paw is NOT reaching out!)
  function defineRestingFrontLegPath(c, bodyX, side, breath) {
    const sy = -106 + breath * 0.4;
    c.beginPath();
    c.moveTo(bodyX + side * 58, sy);
    c.bezierCurveTo(bodyX + side * 63, -76, bodyX + side * 59, -42, bodyX + side * 56, -22);
    c.bezierCurveTo(bodyX + side * 62, -12, bodyX + side * 59, 3, bodyX + side * 42, 4);
    c.bezierCurveTo(bodyX + side * 33, 5.5, bodyX + side * 23, 5.5, bodyX + side * 15, 3.5);
    c.bezierCurveTo(bodyX + side * 8, 1, bodyX + side * 9, -12, bodyX + side * 13, -22);
    c.bezierCurveTo(bodyX + side * 12, -46, bodyX + side * 11, -74, bodyX + side * 14, -92 + breath * 0.35);
    c.closePath();
  }

  function drawRestingSquatFrontLeg(c, dogId, bodyX, side, breath) {
    if (dogId === 'sunny') {
      const ink = '#181411';
      defineRestingFrontLegPath(c, bodyX, side, breath);
      const lg = c.createLinearGradient(0, -106, 0, 5);
      lg.addColorStop(0, '#F8DE84');
      lg.addColorStop(0.75, '#FCE596');
      lg.addColorStop(1, '#F4D372');
      c.fillStyle = lg;
      c.fill();

      c.beginPath();
      c.moveTo(bodyX + side * 58, -98 + breath * 0.4);
      c.bezierCurveTo(bodyX + side * 63, -74, bodyX + side * 59, -42, bodyX + side * 56, -22);
      c.bezierCurveTo(bodyX + side * 62, -12, bodyX + side * 59, 3, bodyX + side * 42, 4);
      c.bezierCurveTo(bodyX + side * 33, 5.5, bodyX + side * 23, 5.5, bodyX + side * 15, 3.5);
      c.bezierCurveTo(bodyX + side * 8, 1, bodyX + side * 9, -12, bodyX + side * 13, -22);
      c.bezierCurveTo(bodyX + side * 12, -46, bodyX + side * 11, -72, bodyX + side * 14, -88 + breath * 0.35);
      c.strokeStyle = ink;
      c.lineWidth = 3.8;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke();

      c.strokeStyle = ink;
      c.lineWidth = 2.8;
      for (const ox of [21, 32, 43]) {
        c.beginPath();
        c.moveTo(bodyX + side * ox, -7.5);
        c.quadraticCurveTo(bodyX + side * (ox + 1.2), -1.5, bodyX + side * ox, 3.6);
        c.stroke();
      }
      return;
    }

    if (dogId === 'daisy') {
      const outline = '#7A5134';
      defineRestingFrontLegPath(c, bodyX, side, breath);
      const lg = c.createLinearGradient(0, -104, 0, 4);
      lg.addColorStop(0, '#EE9C4B');
      lg.addColorStop(0.36, '#F7BE72');
      lg.addColorStop(0.62, '#FFFBF4');
      lg.addColorStop(1, '#FFFDF9');
      c.fillStyle = lg;
      c.fill();

      c.beginPath();
      c.moveTo(bodyX + side * 58, -98 + breath * 0.4);
      c.bezierCurveTo(bodyX + side * 63, -74, bodyX + side * 59, -42, bodyX + side * 56, -22);
      c.bezierCurveTo(bodyX + side * 62, -12, bodyX + side * 59, 3, bodyX + side * 42, 4);
      c.bezierCurveTo(bodyX + side * 33, 5.5, bodyX + side * 23, 5.5, bodyX + side * 15, 3.5);
      c.bezierCurveTo(bodyX + side * 8, 1, bodyX + side * 9, -12, bodyX + side * 13, -22);
      c.bezierCurveTo(bodyX + side * 12, -40, bodyX + side * 11.5, -58, bodyX + side * 13, -72 + breath * 0.35);
      c.strokeStyle = outline;
      c.lineWidth = 2.8;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke();

      c.strokeStyle = '#8C684C';
      c.lineWidth = 2.2;
      for (const ox of [21, 32, 43]) {
        c.beginPath();
        c.moveTo(bodyX + side * ox, -7.5);
        c.quadraticCurveTo(bodyX + side * (ox + 1.2), -1.5, bodyX + side * ox, 3.6);
        c.stroke();
      }
      return;
    }

    // Kuro tri-color Black -> Tan -> White front leg
    const ink = '#0B0C0E';
    c.save();
    defineRestingFrontLegPath(c, bodyX, side, breath);
    c.clip();

    c.fillStyle = '#191B20';
    c.fillRect(bodyX + side * 66, -112, -side * 62, 122);

    c.fillStyle = '#E8A86E';
    c.beginPath();
    c.moveTo(bodyX + side * 8, -50);
    c.lineTo(bodyX + side * 22, -58);
    c.lineTo(bodyX + side * 30, -51);
    c.lineTo(bodyX + side * 42, -59);
    c.lineTo(bodyX + side * 64, -48);
    c.lineTo(bodyX + side * 64, 10);
    c.lineTo(bodyX + side * 8, 10);
    c.closePath();
    c.fill();

    c.fillStyle = '#FFFDF9';
    c.beginPath();
    c.ellipse(bodyX + side * 34, -1, 29, 14.5, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    c.beginPath();
    c.moveTo(bodyX + side * 58, -98 + breath * 0.4);
    c.bezierCurveTo(bodyX + side * 63, -74, bodyX + side * 59, -42, bodyX + side * 56, -22);
    c.bezierCurveTo(bodyX + side * 62, -12, bodyX + side * 59, 3, bodyX + side * 42, 4);
    c.bezierCurveTo(bodyX + side * 33, 5.5, bodyX + side * 23, 5.5, bodyX + side * 15, 3.5);
    c.bezierCurveTo(bodyX + side * 8, 1, bodyX + side * 9, -12, bodyX + side * 13, -22);
    c.bezierCurveTo(bodyX + side * 12, -46, bodyX + side * 11, -72, bodyX + side * 14, -88 + breath * 0.35);
    c.strokeStyle = ink;
    c.lineWidth = 3.2;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke();

    c.strokeStyle = ink;
    c.lineWidth = 2.5;
    for (const ox of [21, 32, 43]) {
      c.beginPath();
      c.moveTo(bodyX + side * ox, -7.5);
      c.quadraticCurveTo(bodyX + side * (ox + 1.2), -1.5, bodyX + side * ox, 3.6);
      c.stroke();
    }
  }

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
  // CHARACTER 1 (图1): 🕶️ 墨镜金毛 (Sunny)
  // =========================================================================
  function drawSunnyTail(c, bodyX, wagAngle, breath) {
    const ink = '#181411';
    c.save();
    c.translate(bodyX - 66, -54 + breath * 0.3);
    c.rotate(-0.18 + wagAngle);

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

  function drawSunnyCollar(c, bodyX, breath) {
    const ink = '#181411';
    const y = -124 + breath * 0.55;
    c.save();
    c.translate(bodyX, 0);
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
    c.rotate(side * (0.1 + kick * 0.12));

    const earPath = () => {
      c.beginPath();
      c.moveTo(side * -18, -26);
      c.bezierCurveTo(side * 12, -28, side * 34, -4, side * 38, 28);
      c.bezierCurveTo(side * 42, 58, side * 22, 76, side * 2, 70);
      c.bezierCurveTo(side * -16, 64, side * -20, 36, side * -15, 6);
      c.closePath();
    };

    earPath();
    const eg = c.createLinearGradient(0, -26, side * 14, 72);
    eg.addColorStop(0, '#F9DF86');
    eg.addColorStop(0.36, '#F6CE72');
    eg.addColorStop(0.74, '#ED9F4E');
    eg.addColorStop(1, '#E28B38');
    c.fillStyle = eg;
    c.fill();

    c.save();
    earPath();
    c.clip();
    c.strokeStyle = 'rgba(196, 102, 28, 0.36)';
    c.lineWidth = 2.2;
    c.lineCap = 'round';
    for (const oy of [20, 34, 48]) {
      c.beginPath();
      c.moveTo(0, oy);
      c.quadraticCurveTo(side * 15, oy + 6, side * 26, oy + 14);
      c.stroke();
    }
    c.restore();

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

  function drawSunnySquatPuppy(c, st, bodyX, breath) {
    const ink = '#181411';
    const lineW = 3.8;
    const wag = Math.sin(st.tailPhase) * (0.14 + st.excitement * 0.25);

    drawSunnyTail(c, bodyX, wag, breath);

    for (const side of [-1, 1]) {
      defineSquatHindThighPath(c, bodyX, side, breath);
      c.fillStyle = '#EBC462';
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = lineW;
      c.lineJoin = 'round';
      c.stroke();

      defineTuckedHindPawPath(c, bodyX, side);
      c.fillStyle = '#F7DC82';
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = 3.4;
      c.stroke();
      drawHindPawToeCreases(c, bodyX, side, ink, 2.4);
    }

    c.save();
    defineSquatTorsoPath(c, bodyX, breath);
    const bodyGrad = c.createRadialGradient(bodyX, -96, 14, bodyX, -64, 90);
    bodyGrad.addColorStop(0, '#FBE69B');
    bodyGrad.addColorStop(0.6, '#F7DC80');
    bodyGrad.addColorStop(1, '#EBC362');
    c.fillStyle = bodyGrad;
    c.fill();

    c.save();
    defineSquatTorsoPath(c, bodyX, breath);
    c.clip();
    const bellyGrad = c.createLinearGradient(bodyX, -112, bodyX, -16);
    bellyGrad.addColorStop(0, '#F8B4C8');
    bellyGrad.addColorStop(1, '#F29AB4');
    c.fillStyle = bellyGrad;
    c.beginPath();
    c.ellipse(bodyX, -56 + breath * 0.25, 36, 52, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 2.8;
    c.stroke();
    c.restore();

    defineSquatTorsoPath(c, bodyX, breath);
    c.strokeStyle = ink;
    c.lineWidth = lineW;
    c.lineJoin = 'round';
    c.stroke();
    c.restore();
  }

  function drawSunnyCollarAndHead(c, st, bodyX, breath) {
    const ink = '#181411';
    const lineW = 3.8;

    drawSunnyCollar(c, bodyX, breath);

    // Head
    const headX = bodyX + st.lookX * 4;
    const headY = -204 + breath * 0.85 + st.bounce * 4.5;
    const headTilt = st.baseTilt + st.leanX * 0.002 + st.lookX * 0.04;

    c.save();
    c.translate(headX, headY);
    c.rotate(headTilt);

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

    drawSunnyFloppyEar(c, -1, st.leftEarKick);
    drawSunnyFloppyEar(c, 1, st.rightEarKick);

    const fx = st.lookX * 5;
    const fy = st.lookY * 3.5;
    c.save();
    c.translate(fx, fy);

    c.fillStyle = '#FFF3BF';
    c.beginPath();
    c.ellipse(0, 26, 46, 31, 0, 0, Math.PI * 2);
    c.fill();

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

    c.save();
    const sgY = -12 - st.bounce * 1.5;
    c.strokeStyle = '#141518';
    c.lineWidth = 6.0;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-79, sgY - 5);
    c.lineTo(-56, sgY - 2);
    c.moveTo(56, sgY - 2);
    c.lineTo(79, sgY - 5);
    c.moveTo(-16, sgY - 3);
    c.quadraticCurveTo(0, sgY - 7, 16, sgY - 3);
    c.stroke();

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

    const boneWiggle = Math.sin(inputState.time * 4.2) * 0.06 + st.excitement * 0.14;
    c.save();
    c.translate(-11, 34);
    c.rotate(-0.48 + boneWiggle);

    c.beginPath();
    c.moveTo(2, -3.4);
    c.lineTo(-22, -3.4);
    c.bezierCurveTo(-24, -10.5, -33, -9.5, -31.5, -2.2);
    c.quadraticCurveTo(-29.5, 0, -31.5, 2.2);
    c.bezierCurveTo(-33, 9.5, -24, 10.5, -22, 3.4);
    c.lineTo(2, 3.4);
    c.quadraticCurveTo(4.5, 0, 2, -3.4);
    c.closePath();
    c.fillStyle = '#FFFFFF';
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 3.0;
    c.lineJoin = 'round';
    c.stroke();

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

    c.beginPath();
    c.ellipse(0, 16, 15.5, 10.5, 0, 0, Math.PI * 2);
    c.fillStyle = '#141210';
    c.fill();

    c.fillStyle = 'rgba(255, 255, 255, 0.72)';
    c.beginPath();
    c.ellipse(-4.5, 12.5, 4.2, 2.1, -0.25, 0, Math.PI * 2);
    c.fill();

    c.restore();
    c.restore();
  }

  // =========================================================================
  // CHARACTER 2 (图2): 🌼 蓝巾笑柴 (Daisy)
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

  function drawDaisyTail(c, bodyX, wagAngle, breath) {
    const outline = '#7A5134';
    c.save();
    c.translate(bodyX - 68, -56 + breath * 0.3);
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

  function drawDaisyBandana(c, st, bodyX, breath) {
    const outline = '#5B4A5E';
    const y = -124 + breath * 0.55;
    const flutter = Math.sin(inputState.time * 3.1) * 0.05 + st.excitement * 0.12 * Math.sin(inputState.time * 12);

    c.save();
    c.translate(bodyX, y);

    c.fillStyle = 'rgba(120, 78, 36, 0.14)';
    c.beginPath();
    c.ellipse(0, 18, 66, 14, 0, 0, Math.PI * 2);
    c.fill();

    c.save();
    c.translate(56, 6);
    c.rotate(flutter);

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

    const lowerLeaf = () => {
      c.beginPath();
      c.moveTo(-4, 2);
      c.bezierCurveTo(18, 12, 34, 34, 26, 54);
      c.bezierCurveTo(6, 48, -6, 28, -8, 8);
      c.closePath();
    };
    lowerLeaf();
    c.fillStyle = '#6B99DF';
    c.fill();
    c.save();
    c.clip();
    drawMiniWhiteFlower(c, 12, 31, 8.0);
    c.restore();
    lowerLeaf();
    c.strokeStyle = outline;
    c.lineWidth = 2.4;
    c.lineJoin = 'round';
    c.stroke();

    c.restore();

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

    c.strokeStyle = 'rgba(48, 84, 146, 0.32)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-50, 6);
    c.quadraticCurveTo(0, 24, 46, 6);
    c.stroke();

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
    c.rotate(side * (0.22 + kick * 0.14));

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

    c.beginPath();
    c.moveTo(side * -14, 16);
    c.bezierCurveTo(side * -8, -22, side * 6, -48, side * 19, -43);
    c.bezierCurveTo(side * 32, -36, side * 32, 4, side * 20, 24);
    c.closePath();
    c.fillStyle = '#FFFDF9';
    c.fill();

    c.beginPath();
    c.moveTo(side * -7, 14);
    c.bezierCurveTo(side * -3, -14, side * 8, -34, side * 17, -30);
    c.bezierCurveTo(side * 26, -24, side * 26, 4, side * 16, 20);
    c.closePath();
    c.fillStyle = '#E8A5AC';
    c.fill();

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

  function drawDaisySquatPuppy(c, st, bodyX, breath) {
    const outline = '#7A5134';
    const lineW = 2.8;
    const wag = Math.sin(st.tailPhase) * (0.14 + st.excitement * 0.25);

    drawDaisyTail(c, bodyX, wag, breath);

    for (const side of [-1, 1]) {
      defineSquatHindThighPath(c, bodyX, side, breath);
      c.fillStyle = '#E69140';
      c.fill();
      c.strokeStyle = outline;
      c.lineWidth = lineW;
      c.stroke();

      defineTuckedHindPawPath(c, bodyX, side);
      c.fillStyle = '#FFFDF9';
      c.fill();
      c.strokeStyle = outline;
      c.lineWidth = 2.5;
      c.stroke();
      drawHindPawToeCreases(c, bodyX, side, outline, 2.0);
    }

    c.save();
    defineSquatTorsoPath(c, bodyX, breath);
    const bodyGrad = c.createRadialGradient(bodyX, -92, 16, bodyX, -64, 88);
    bodyGrad.addColorStop(0, '#F8BE6E');
    bodyGrad.addColorStop(0.6, '#EC9846');
    bodyGrad.addColorStop(1, '#DC8332');
    c.fillStyle = bodyGrad;
    c.fill();

    c.save();
    defineSquatTorsoPath(c, bodyX, breath);
    c.clip();
    const bellyGrad = c.createLinearGradient(bodyX, -116, bodyX, -16);
    bellyGrad.addColorStop(0, '#FFFFFF');
    bellyGrad.addColorStop(0.8, '#FFFDF9');
    bellyGrad.addColorStop(1, '#F5ECE0');
    c.fillStyle = bellyGrad;
    c.beginPath();
    c.ellipse(bodyX, -56 + breath * 0.25, 44, 58, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    defineSquatTorsoPath(c, bodyX, breath);
    c.strokeStyle = outline;
    c.lineWidth = lineW;
    c.stroke();
    c.restore();
  }

  function drawDaisyBandanaAndHead(c, st, bodyX, breath) {
    const outline = '#7A5134';
    const lineW = 2.8;

    drawDaisyBandana(c, st, bodyX, breath);

    const headX = bodyX + st.lookX * 4;
    const headY = -204 + breath * 0.85 + st.bounce * 4.5;
    const headTilt = st.baseTilt + st.leanX * 0.002 + st.lookX * 0.04;

    c.save();
    c.translate(headX, headY);
    c.rotate(headTilt);

    drawDaisyEar(c, -1, st.leftEarKick, 'stroke');
    drawDaisyEar(c, 1, st.rightEarKick, 'stroke');
    definePlumpPuppyHeadPath(c);
    c.strokeStyle = outline;
    c.lineWidth = lineW * 2;
    c.lineJoin = 'round';
    c.stroke();

    drawDaisyEar(c, -1, st.leftEarKick, 'fill');
    drawDaisyEar(c, 1, st.rightEarKick, 'fill');

    definePlumpPuppyHeadPath(c);
    const hg = c.createRadialGradient(-16, -48, 16, 0, 4, 130);
    hg.addColorStop(0, '#F9C478');
    hg.addColorStop(0.55, '#EE9C4B');
    hg.addColorStop(1, '#DF8636');
    c.fillStyle = hg;
    c.fill();

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

    c.fillStyle = 'rgba(255, 253, 248, 0.92)';
    c.beginPath();
    c.ellipse(-34, -40, 12, 7.5, -0.22, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(34, -40, 12, 7.5, 0.22, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = 'rgba(255, 238, 198, 0.55)';
    c.lineWidth = 4.5;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, -10, 74, -Math.PI * 0.66, -Math.PI * 0.34);
    c.stroke();
    c.restore();

    const fx = st.lookX * 4.5;
    const fy = st.lookY * 3.0;
    c.save();
    c.translate(fx, fy);

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

    for (const side of [-1, 1]) {
      c.save();
      c.translate(side * 42, -8 - st.bounce * 1.5);
      c.strokeStyle = '#322018';
      c.lineWidth = 4.8;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0, 9, 17, Math.PI * 1.14, Math.PI * 1.86);
      c.stroke();

      c.lineWidth = 3.0;
      c.beginPath();
      c.moveTo(side * 14, 2);
      c.lineTo(side * 19, 4.5);
      c.stroke();
      c.restore();
    }

    const pant = Math.sin(inputState.time * 4.8) * 1.6 + st.excitement * 4.8;
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

    c.restore();
    c.restore();
  }

  // =========================================================================
  // CHARACTER 3 (图3): 🖤 歪头黑柴 (Kuro)
  // =========================================================================
  function drawKuroTail(c, bodyX, wagAngle, breath) {
    const ink = '#0B0C0E';
    c.save();
    c.translate(bodyX - 66, -54 + breath * 0.3);
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
    c.rotate(side * (0.24 + kick * 0.14));

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

  function defineKuroFluffyHeadPath(c) {
    c.beginPath();
    c.moveTo(0, -92);
    c.bezierCurveTo(56, -92, 100, -52, 106, -6);
    c.lineTo(115, 4);
    c.lineTo(109, 10);
    c.lineTo(117, 22);
    c.lineTo(108, 27);
    c.lineTo(112, 39);
    c.bezierCurveTo(96, 68, 56, 84, 0, 84);
    c.bezierCurveTo(-56, 84, -96, 68, -112, 39);
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

    c.fillStyle = '#FFFFFF';
    c.beginPath();
    c.ellipse(gx + side * 1.8, gy + 1.5, 15.8, 16.8, 0, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = '#0F0E11';
    c.beginPath();
    c.ellipse(gx, gy, 14.8, 16.0, 0, 0, Math.PI * 2);
    c.fill();

    const ig = c.createRadialGradient(gx, gy + 6, 1, gx, gy + 6, 10);
    ig.addColorStop(0, 'rgba(92, 58, 38, 0.55)');
    ig.addColorStop(1, 'rgba(15, 14, 17, 0)');
    c.fillStyle = ig;
    c.beginPath();
    c.ellipse(gx, gy + 6, 10, 6.5, 0, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = '#FFFFFF';
    c.beginPath();
    c.ellipse(gx - 4.5, gy - 5.5, 4.8, 4.2, -0.25, 0, Math.PI * 2);
    c.fill();

    c.beginPath();
    c.arc(gx + 4.8, gy + 5.2, 2.0, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  function drawKuroSquatPuppy(c, st, bodyX, breath) {
    const ink = '#0B0C0E';
    const lineW = 3.2;
    const wag = Math.sin(st.tailPhase) * (0.14 + st.excitement * 0.25);

    drawKuroTail(c, bodyX, wag, breath);

    for (const side of [-1, 1]) {
      defineSquatHindThighPath(c, bodyX, side, breath);
      c.fillStyle = '#181A1F';
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = lineW;
      c.stroke();

      defineTuckedHindPawPath(c, bodyX, side);
      const hpg = c.createLinearGradient(bodyX + side * 56, -24, bodyX + side * 84, -10);
      hpg.addColorStop(0, '#E8A86E');
      hpg.addColorStop(0.55, '#FCF3E6');
      hpg.addColorStop(1, '#FFFFFF');
      c.fillStyle = hpg;
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = 2.8;
      c.stroke();
      drawHindPawToeCreases(c, bodyX, side, ink, 2.2);
    }

    c.save();
    defineSquatTorsoPath(c, bodyX, breath);
    const bodyGrad = c.createRadialGradient(bodyX, -96, 12, bodyX, -64, 92);
    bodyGrad.addColorStop(0, '#292C34');
    bodyGrad.addColorStop(0.65, '#191B20');
    bodyGrad.addColorStop(1, '#111317');
    c.fillStyle = bodyGrad;
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = lineW;
    c.stroke();
    c.restore();
  }

  function drawKuroRuffAndHead(c, st, bodyX, breath) {
    const ink = '#0B0C0E';
    const lineW = 3.2;

    // Fluffy Black Neck Ruff + Wide Fluffy White Winged V-Chest Tuft (overlapping upper shoulder roots naturally!)
    const ruffY = -124 + breath * 0.55;
    c.save();
    c.translate(bodyX, 0);

    const vY = ruffY + 21;
    c.fillStyle = '#FCF3E6';
    c.beginPath();
    c.moveTo(0, vY + 2);
    c.quadraticCurveTo(22, vY - 3, 44, vY + 2);
    c.lineTo(37, vY + 10);
    c.lineTo(42, vY + 15);
    c.lineTo(25, vY + 21);
    c.lineTo(13, vY + 25);
    c.lineTo(0, vY + 36);
    c.lineTo(-13, vY + 25);
    c.lineTo(-25, vY + 21);
    c.lineTo(-42, vY + 15);
    c.lineTo(-37, vY + 10);
    c.lineTo(-44, vY + 2);
    c.quadraticCurveTo(-22, vY - 3, 0, vY + 2);
    c.closePath();
    c.fill();

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
    c.restore();

    // Head
    const headX = bodyX + st.lookX * 4;
    const headY = -204 + breath * 0.85 + st.bounce * 4.5;
    const headTilt = st.baseTilt + st.leanX * 0.002 + st.lookX * 0.04;

    c.save();
    c.translate(headX, headY);
    c.rotate(headTilt);

    drawKuroEar(c, -1, st.leftEarKick, 'stroke');
    drawKuroEar(c, 1, st.rightEarKick, 'stroke');
    defineKuroFluffyHeadPath(c);
    c.strokeStyle = ink;
    c.lineWidth = lineW * 2;
    c.lineJoin = 'round';
    c.stroke();

    drawKuroEar(c, -1, st.leftEarKick, 'fill');
    drawKuroEar(c, 1, st.rightEarKick, 'fill');

    defineKuroFluffyHeadPath(c);
    const hg = c.createRadialGradient(-18, -46, 12, 0, 4, 130);
    hg.addColorStop(0, '#2D313A');
    hg.addColorStop(0.55, '#1A1C21');
    hg.addColorStop(1, '#111216');
    c.fillStyle = hg;
    c.fill();

    c.save();
    defineKuroFluffyHeadPath(c);
    c.clip();

    c.fillStyle = '#E6A56A';
    c.beginPath();
    c.ellipse(-58, 12, 34, 18, -0.22, 0, Math.PI * 2);
    c.ellipse(58, 12, 34, 18, 0.22, 0, Math.PI * 2);
    c.fill();

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

    c.fillStyle = 'rgba(206, 186, 166, 0.45)';
    c.beginPath();
    c.ellipse(0, 76, 36, 12, 0, 0, Math.PI * 2);
    c.fill();

    c.restore();

    const fx = st.lookX * 4.5;
    const fy = st.lookY * 3.0;
    c.save();
    c.translate(fx, fy);

    c.fillStyle = '#EEB67E';
    c.beginPath();
    c.ellipse(-28, -28, 11.5, 7.2, 0.28, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(28, -28, 11.5, 7.2, -0.28, 0, Math.PI * 2);
    c.fill();

    const blinkAmount = st.blinkProgress > 0 ? Math.sin(st.blinkProgress) : 0;
    drawKuroEye(c, -40, -3, -1, blinkAmount, st.lookX, st.lookY);
    drawKuroEye(c, 40, -3, 1, blinkAmount, st.lookX, st.lookY);

    c.fillStyle = 'rgba(218, 198, 176, 0.35)';
    c.beginPath();
    c.ellipse(0, 26, 20, 14, 0, 0, Math.PI * 2);
    c.fill();

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

    c.restore();
    c.restore();
  }

  // =========================================================================
  // Unobstructed Front Keyboard & Mouse (Placed Cleanly Below Squatting Paws!)
  // =========================================================================
  function getDeskTheme(dogId) {
    if (dogId === 'sunny') {
      return {
        kbBase: '#5A4A36',
        kbTop1: '#F2DDA8',
        kbTop2: '#DEC07C',
        kbStroke: '#181411',
        kbStrokeW: 2.8,
        kbWell: '#483B2B',
        capSide: '#D8C8A8',
        capTop: '#FFFDF5',
        capText: '#2E2418',
        accentTop1: '#FFB94E',
        accentTop2: '#F08E26',
        padFill: isDarkTheme ? 'rgba(248, 212, 128, 0.14)' : 'rgba(242, 206, 122, 0.35)',
        padStroke: isDarkTheme ? 'rgba(248, 212, 128, 0.3)' : 'rgba(168, 124, 48, 0.32)',
        mouseStroke: '#181411',
      };
    }
    if (dogId === 'daisy') {
      return {
        kbBase: '#55657F',
        kbTop1: '#8AA8D8',
        kbTop2: '#6F8FC4',
        kbStroke: '#5C483B',
        kbStrokeW: 2.4,
        kbWell: '#4E5D77',
        capSide: '#CFD9E8',
        capTop: '#FFFDF9',
        capText: '#493D36',
        accentTop1: '#FFC266',
        accentTop2: '#F59E36',
        padFill: isDarkTheme ? 'rgba(116, 166, 236, 0.16)' : 'rgba(134, 182, 242, 0.34)',
        padStroke: isDarkTheme ? 'rgba(140, 186, 248, 0.3)' : 'rgba(92, 138, 202, 0.38)',
        mouseStroke: '#6A4E3B',
      };
    }
    return {
      kbBase: '#12141A',
      kbTop1: '#2D313C',
      kbTop2: '#1E2129',
      kbStroke: '#0B0C0E',
      kbStrokeW: 2.6,
      kbWell: '#13151B',
      capSide: '#CFD5DF',
      capTop: '#F8F9FB',
      capText: '#262A34',
      accentTop1: '#F2B476',
      accentTop2: '#DE9248',
      padFill: isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(42, 46, 56, 0.1)',
      padStroke: isDarkTheme ? 'rgba(255, 255, 255, 0.18)' : 'rgba(42, 46, 56, 0.22)',
      mouseStroke: '#1A1D24',
    };
  }

  function drawPuppyKeyboard(c, dogId) {
    const dt = getDeskTheme(dogId);
    const hw = KB_LOCAL.w * 0.5;
    const hh = KB_LOCAL.h * 0.5;

    c.save();
    c.translate(KB_LOCAL.cx, KB_LOCAL.cy);
    c.rotate(KB_LOCAL.angle);

    c.fillStyle = isDarkTheme ? 'rgba(0, 0, 0, 0.44)' : 'rgba(56, 78, 112, 0.2)';
    roundRectPath(c, -hw + 2, -hh + 6, KB_LOCAL.w, KB_LOCAL.h, 12);
    c.fill();

    roundRectPath(c, -hw, -hh + 3.5, KB_LOCAL.w, KB_LOCAL.h, 11);
    c.fillStyle = dt.kbBase;
    c.fill();

    roundRectPath(c, -hw, -hh, KB_LOCAL.w, KB_LOCAL.h - 1.5, 11);
    const fg = c.createLinearGradient(0, -hh, 0, hh);
    fg.addColorStop(0, dt.kbTop1);
    fg.addColorStop(1, dt.kbTop2);
    c.fillStyle = fg;
    c.fill();
    c.strokeStyle = dt.kbStroke;
    c.lineWidth = dt.kbStrokeW;
    c.stroke();

    roundRectPath(c, -hw + 5.5, -hh + 5.5, KB_LOCAL.w - 11, KB_LOCAL.h - 12.5, 7);
    c.fillStyle = dt.kbWell;
    c.fill();

    for (const k of keysList) {
      drawKeycapLocal(c, k, dt);
    }

    c.restore();
  }

  function drawKeycapLocal(c, k, dt) {
    const pressOffset = k.press * 2.0;
    const glow = k.glow;

    c.save();
    if (glow > 0.04) {
      c.save();
      c.shadowColor = 'rgba(255, 162, 42, 0.92)';
      c.shadowBlur = 10 * glow;
      roundRectPath(c, k.lx - 0.4, k.ly + pressOffset - 0.4, k.w + 0.8, k.h, 4.0);
      c.fillStyle = `rgba(255, 174, 58, ${(0.58 * glow).toFixed(3)})`;
      c.fill();
      c.restore();
    }

    roundRectPath(c, k.lx, k.ly + 1.2, k.w, k.h - 0.4, 3.4);
    c.fillStyle = glow > 0.12 ? '#D97412' : k.accent ? '#D47F22' : dt.capSide;
    c.fill();

    const capH = Math.max(5.5, k.h - 2.6);
    roundRectPath(c, k.lx + 0.3, k.ly + pressOffset, k.w - 0.6, capH, 3.0);
    if (glow > 0.06) {
      const g = c.createLinearGradient(k.lx, k.ly + pressOffset, k.lx, k.ly + pressOffset + capH);
      g.addColorStop(0, '#FFD676');
      g.addColorStop(1, '#FF9220');
      c.fillStyle = g;
    } else if (k.accent) {
      const ag = c.createLinearGradient(k.lx, k.ly, k.lx, k.ly + capH);
      ag.addColorStop(0, dt.accentTop1);
      ag.addColorStop(1, dt.accentTop2);
      c.fillStyle = ag;
    } else {
      c.fillStyle = dt.capTop;
    }
    c.fill();

    if (k.label) {
      const fontSize = k.label.length >= 4 ? 5.6 : k.label.length >= 2 ? 6.2 : 7.0;
      c.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = glow > 0.25 ? '#3F1D04' : k.accent ? '#FFFFFF' : dt.capText;
      c.fillText(k.label, k.lcx, k.ly + pressOffset + capH * 0.54);
    }

    c.restore();
  }

  function defineMouseShellPath(c, hw, hh) {
    c.beginPath();
    c.moveTo(0, -hh);
    c.bezierCurveTo(hw * 0.88, -hh, hw, -hh * 0.55, hw, 0);
    c.bezierCurveTo(hw, hh * 0.62, hw * 0.86, hh, 0, hh);
    c.bezierCurveTo(-hw * 0.86, hh, -hw, hh * 0.62, -hw, 0);
    c.bezierCurveTo(-hw, -hh * 0.55, -hw * 0.88, -hh, 0, -hh);
    c.closePath();
  }

  function drawPuppyMouseAndPad(c, dogId) {
    const dt = getDeskTheme(dogId);

    c.save();
    const mpHW = MOUSE_PAD_LOCAL.w * 0.5;
    const mpHH = MOUSE_PAD_LOCAL.h * 0.5;
    roundRectPath(
      c,
      MOUSE_PAD_LOCAL.cx - mpHW,
      MOUSE_PAD_LOCAL.cy - mpHH,
      MOUSE_PAD_LOCAL.w,
      MOUSE_PAD_LOCAL.h,
      17
    );
    c.fillStyle = dt.padFill;
    c.fill();
    c.strokeStyle = dt.padStroke;
    c.lineWidth = 1.8;
    c.stroke();
    c.restore();

    const hw = MOUSE_SIZE_LOCAL.w * 0.5;
    const hh = MOUSE_SIZE_LOCAL.h * 0.5;
    const splitY = 1;

    c.save();
    c.translate(inputState.mouseLX, inputState.mouseLY);
    c.rotate(inputState.mouseTilt);

    c.fillStyle = isDarkTheme ? 'rgba(0, 0, 0, 0.42)' : 'rgba(56, 78, 112, 0.22)';
    c.beginPath();
    c.ellipse(1.5, 5, hw * 1.04, hh * 0.98, 0, 0, Math.PI * 2);
    c.fill();

    if (inputState.leftGlow > 0.04) {
      const lAura = c.createRadialGradient(-hw * 0.45, hh * 0.45, 2, -hw * 0.45, hh * 0.45, 42);
      lAura.addColorStop(0, `rgba(255, 116, 68, ${(0.78 * inputState.leftGlow).toFixed(3)})`);
      lAura.addColorStop(1, 'rgba(255, 116, 68, 0)');
      c.fillStyle = lAura;
      c.beginPath();
      c.arc(-hw * 0.45, hh * 0.45, 42, 0, Math.PI * 2);
      c.fill();
    }

    if (inputState.rightGlow > 0.04) {
      const rAura = c.createRadialGradient(hw * 0.45, hh * 0.45, 2, hw * 0.45, hh * 0.45, 42);
      rAura.addColorStop(0, `rgba(56, 189, 248, ${(0.78 * inputState.rightGlow).toFixed(3)})`);
      rAura.addColorStop(1, 'rgba(56, 189, 248, 0)');
      c.fillStyle = rAura;
      c.beginPath();
      c.arc(hw * 0.45, hh * 0.45, 42, 0, Math.PI * 2);
      c.fill();
    }

    c.save();
    defineMouseShellPath(c, hw, hh);
    c.clip();

    const bodyGrad = c.createLinearGradient(-hw, -hh, hw, hh);
    bodyGrad.addColorStop(0, '#FFFFFF');
    bodyGrad.addColorStop(0.6, '#F8FAFC');
    bodyGrad.addColorStop(1, '#E2E7F0');
    c.fillStyle = bodyGrad;
    c.fillRect(-hw - 4, -hh - 4, hw * 2 + 8, hh * 2 + 8);

    if (inputState.leftGlow > 0.02) {
      c.save();
      c.beginPath();
      c.rect(-hw - 4, splitY, hw + 4, hh - splitY + 4);
      c.clip();
      const lg = c.createLinearGradient(-hw, splitY, 0, hh);
      lg.addColorStop(0, `rgba(255, 158, 112, ${inputState.leftGlow.toFixed(3)})`);
      lg.addColorStop(0.55, `rgba(255, 112, 66, ${inputState.leftGlow.toFixed(3)})`);
      lg.addColorStop(1, `rgba(235, 74, 38, ${inputState.leftGlow.toFixed(3)})`);
      c.fillStyle = lg;
      c.fillRect(-hw - 4, splitY, hw + 4, hh - splitY + 4);
      c.restore();
    }

    if (inputState.rightGlow > 0.02) {
      c.save();
      c.beginPath();
      c.rect(0, splitY, hw + 4, hh - splitY + 4);
      c.clip();
      const rg = c.createLinearGradient(0, splitY, hw, hh);
      rg.addColorStop(0, `rgba(125, 224, 255, ${inputState.rightGlow.toFixed(3)})`);
      rg.addColorStop(0.55, `rgba(56, 189, 248, ${inputState.rightGlow.toFixed(3)})`);
      rg.addColorStop(1, `rgba(14, 146, 224, ${inputState.rightGlow.toFixed(3)})`);
      c.fillStyle = rg;
      c.fillRect(0, splitY, hw + 4, hh - splitY + 4);
      c.restore();
    }

    c.strokeStyle = 'rgba(72, 82, 98, 0.5)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-hw, splitY);
    c.quadraticCurveTo(0, splitY - 2.5, hw, splitY);
    c.moveTo(0, splitY - 1);
    c.lineTo(0, hh);
    c.stroke();

    c.font = '800 9px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = inputState.leftGlow > 0.35 ? '#FFFFFF' : 'rgba(72, 65, 62, 0.5)';
    c.fillText('L', -hw * 0.54, hh * 0.48);

    c.fillStyle = inputState.rightGlow > 0.35 ? '#FFFFFF' : 'rgba(72, 65, 62, 0.5)';
    c.fillText('R', hw * 0.54, hh * 0.48);

    c.restore();

    defineMouseShellPath(c, hw, hh);
    c.strokeStyle = dt.mouseStroke;
    c.lineWidth = 2.4;
    c.stroke();

    if (inputState.leftGlow > 0.1) {
      c.save();
      c.beginPath();
      c.rect(-hw - 5, splitY, hw + 5, hh - splitY + 5);
      c.clip();
      defineMouseShellPath(c, hw, hh);
      c.strokeStyle = `rgba(255, 108, 60, ${inputState.leftGlow.toFixed(3)})`;
      c.lineWidth = 3.2;
      c.stroke();
      c.restore();
    }
    if (inputState.rightGlow > 0.1) {
      c.save();
      c.beginPath();
      c.rect(0, splitY, hw + 5, hh - splitY + 5);
      c.clip();
      defineMouseShellPath(c, hw, hh);
      c.strokeStyle = `rgba(42, 184, 248, ${inputState.rightGlow.toFixed(3)})`;
      c.lineWidth = 3.2;
      c.stroke();
      c.restore();
    }

    const wheelW = 8.5;
    const wheelH = 17;
    const wheelX = -wheelW * 0.5;
    const wheelY = 7;

    roundRectPath(c, wheelX - 1.5, wheelY - 1.5, wheelW + 3, wheelH + 3, 4.2);
    c.fillStyle = '#D2D7E0';
    c.fill();

    roundRectPath(c, wheelX, wheelY, wheelW, wheelH, 3.8);
    c.fillStyle = inputState.middleGlow > 0.15 ? '#A78BFA' : '#586172';
    c.fill();
    c.strokeStyle = dt.mouseStroke;
    c.lineWidth = 1.2;
    c.stroke();

    c.save();
    roundRectPath(c, wheelX + 1, wheelY + 1.5, wheelW - 2, wheelH - 3, 2.2);
    c.clip();
    c.strokeStyle = 'rgba(255, 255, 255, 0.58)';
    c.lineWidth = 1.2;
    const step = 4;
    const shift = ((inputState.wheelOffset % step) + step) % step;
    for (let y = wheelY - step + shift; y < wheelY + wheelH + step; y += step) {
      c.beginPath();
      c.moveTo(wheelX + 1.5, y);
      c.lineTo(wheelX + wheelW - 1.5, y);
      c.stroke();
    }
    c.restore();

    c.restore();
  }

  // =========================================================================
  // Unified Fixed-Shoulder Front Limb (Continuous 0..1 Squat <-> Reach Rig!)
  // =========================================================================
  function drawUnifiedFrontLimb(c, dogId, { sx, sy, homeX, homeY, px, py, side, press, lift }) {
    const distFromHome = Math.hypot(px - homeX, py - homeY);
    const reachT = easeOutCubic(clamp(distFromHome / 44, 0, 1));

    const pyVis = py - lift * 15;
    const dx = px - sx;
    const dy = pyVis - sy;
    const len = Math.max(1, Math.hypot(dx, dy));

    // Upward-arching elbow (never sags downward!)
    const bendX = side * lerp(2.5, Math.min(20, len * 0.16), reachT);
    const bendY = lerp(0, -10, reachT) - lift * 9;
    const cx = (sx + px) * 0.5 + bendX;
    const cy = (sy + pyVis) * 0.5 + bendY;

    const endDx = px - cx;
    const endDy = pyVis - cy;
    const armEndAngle = Math.atan2(endDy, endDx);
    // Smoothly blend paw angle from 0 (flat ground squat) toward arm direction when reaching
    let targetPawRot = armEndAngle - Math.PI * 0.5;
    while (targetPawRot > Math.PI) targetPawRot -= Math.PI * 2;
    while (targetPawRot < -Math.PI) targetPawRot += Math.PI * 2;
    const pawRot = targetPawRot * (reachT * 0.65);

    const squashX = 1 + press * 0.1 - lift * 0.04;
    const squashY = 1 - press * 0.08 + lift * 0.07;

    const outline = dogId === 'sunny' ? '#181411' : dogId === 'daisy' ? '#7A5134' : '#0B0C0E';
    const outlineW = dogId === 'sunny' ? 3.6 : dogId === 'daisy' ? 2.8 : 3.1;

    const rShoulder = 21.5;
    const rMid = lerp(20.2, 17.6, reachT);
    const rWrist = lerp(18.5, 15.4, reachT);
    const pawRX = lerp(22.2, 18.2, reachT);
    const pawRY = lerp(12.2, 15.2, reachT);

    c.save();

    // Contact shadow under paw when reaching over keyboard / mouse
    if (reachT > 0.08) {
      c.fillStyle = `rgba(0, 0, 0, ${(0.16 * reachT).toFixed(3)})`;
      c.beginPath();
      c.ellipse(
        px,
        pyVis + 5 + lift * 8,
        19 * (1 - lift * 0.2),
        11.5 * (1 - lift * 0.2),
        0,
        0,
        Math.PI * 2
      );
      c.fill();
    }

    const sAngle = Math.atan2(cy - sy, cx - sx);
    const snx = -Math.sin(sAngle);
    const sny = Math.cos(sAngle);
    const enx = -Math.sin(armEndAngle);
    const eny = Math.cos(armEndAngle);
    const mnx = (snx + enx) * 0.5;
    const mny = (sny + eny) * 0.5;
    const mLen = Math.hypot(mnx, mny) || 1;
    const mnux = mnx / mLen;
    const mnuy = mny / mLen;

    const sLx = sx + snx * rShoulder, sLy = sy + sny * rShoulder;
    const sRx = sx - snx * rShoulder, sRy = sy - sny * rShoulder;
    const mLx = cx + mnux * rMid,     mLy = cy + mnuy * rMid;
    const mRx = cx - mnux * rMid,     mRy = cy - mnuy * rMid;
    const wLx = px + enx * rWrist,    wLy = pyVis + eny * rWrist;
    const wRx = px - enx * rWrist,    wRy = pyVis - eny * rWrist;

    // 1. Unified outer contour pass (paw outer border + arm side strokes)
    c.save();
    c.translate(px, pyVis);
    c.rotate(pawRot);
    c.scale(squashX, squashY);
    c.beginPath();
    c.ellipse(0, 2, pawRX + outlineW, pawRY + outlineW, 0, 0, Math.PI * 2);
    c.fillStyle = outline;
    c.fill();
    c.restore();

    // Determine which side of the limb is outer vs inner chest
    // For downward limb (sAngle ~ PI/2), snx ~ -1 (left), -snx ~ +1 (right)
    c.strokeStyle = outline;
    c.lineWidth = outlineW * 2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(sLx, sLy + (side === 1 ? (1 - reachT) * 14 : 0));
    c.quadraticCurveTo(mLx, mLy, wLx, wLy);
    c.moveTo(sRx, sRy + (side === -1 ? (1 - reachT) * 14 : 0));
    c.quadraticCurveTo(mRx, mRy, wRx, wRy);
    c.stroke();

    // 2. Seamless limb body fill
    const defineArmTube = () => {
      c.beginPath();
      c.moveTo(sLx, sLy);
      c.quadraticCurveTo(mLx, mLy, wLx, wLy);
      c.lineTo(wRx, wRy);
      c.quadraticCurveTo(mRx, mRy, sRx, sRy);
      c.closePath();
    };

    if (dogId === 'kuro') {
      // Tri-color Black -> Fuzzy Zigzag -> Warm Tan stocking along the limb!
      c.save();
      defineArmTube();
      c.clip();

      const kg = c.createLinearGradient(sx, sy, px, pyVis);
      kg.addColorStop(0, '#191B20');
      kg.addColorStop(0.46, '#191B20');
      kg.addColorStop(0.54, '#E8A86E');
      kg.addColorStop(1, '#EAB07A');
      c.fillStyle = kg;
      c.fill();

      // Crisp fur zigzag tufts at mid-arm transition
      const midX = (sx + px) * 0.5 + bendX * 0.6;
      const midY = (sy + pyVis) * 0.5 + bendY * 0.6;
      c.save();
      c.translate(midX, midY);
      c.rotate(armEndAngle - Math.PI * 0.5);
      c.fillStyle = '#191B20';
      c.beginPath();
      c.moveTo(-24, -10);
      c.lineTo(-14, 4);
      c.lineTo(-5, -4);
      c.lineTo(5, 5);
      c.lineTo(14, -3);
      c.lineTo(24, 4);
      c.lineTo(24, -22);
      c.lineTo(-24, -22);
      c.closePath();
      c.fill();
      c.restore();

      c.restore();
    } else {
      const ag = c.createLinearGradient(sx, sy, px, pyVis);
      if (dogId === 'sunny') {
        ag.addColorStop(0, '#F8DE84');
        ag.addColorStop(0.75, '#FCE596');
        ag.addColorStop(1, '#F6D878');
      } else {
        ag.addColorStop(0, '#EE9C4B');
        ag.addColorStop(0.42, '#F7BE72');
        ag.addColorStop(0.68, '#FFFBF4');
        ag.addColorStop(1, '#FFFDF9');
      }
      defineArmTube();
      c.fillStyle = ag;
      c.fill();
    }

    // Smooth upper-shoulder blend cap (tucked cleanly beneath collar/bandana!)
    c.fillStyle = dogId === 'sunny' ? '#F8DE84' : dogId === 'daisy' ? '#EE9C4B' : '#191B20';
    c.beginPath();
    c.ellipse(sx + side * 2, sy, rShoulder + 1, 16, 0, 0, Math.PI * 2);
    c.fill();

    // 3. Plump Puppy Paw + 3 Toe Creases (+ Paw Beans when lifted high!)
    c.save();
    c.translate(px, pyVis);
    c.rotate(pawRot);
    c.scale(squashX, squashY);

    c.beginPath();
    c.ellipse(0, 2, pawRX, pawRY, 0, 0, Math.PI * 2);
    if (dogId === 'sunny') {
      const pg = c.createRadialGradient(-3, -2, 2, 0, 2, pawRX);
      pg.addColorStop(0, '#FFF1B8');
      pg.addColorStop(0.75, '#F9DF86');
      pg.addColorStop(1, '#ECC564');
      c.fillStyle = pg;
    } else {
      const pg = c.createRadialGradient(-3, -2, 2, 0, 2, pawRX);
      pg.addColorStop(0, '#FFFFFF');
      pg.addColorStop(0.8, '#FFFDF9');
      pg.addColorStop(1, '#EFE4D6');
      c.fillStyle = pg;
    }
    c.fill();

    const toeStroke = dogId === 'daisy' ? '#8C684C' : outline;
    c.strokeStyle = toeStroke;
    c.lineWidth = lerp(2.5, 2.0, reachT);
    c.lineCap = 'round';
    const toeSpread = lerp(9.2, 5.6, reachT);
    const toeTopY = lerp(1.5, 8.2, reachT);
    const toeBotY = pawRY + 1.4;
    c.beginPath();
    c.moveTo(-toeSpread, toeTopY);
    c.lineTo(-toeSpread * 1.04, toeBotY);
    c.moveTo(0, toeTopY + 0.5);
    c.lineTo(0, toeBotY + 0.5);
    c.moveTo(toeSpread, toeTopY);
    c.lineTo(toeSpread * 1.04, toeBotY);
    c.stroke();

    if (lift > 0.28 && reachT > 0.25) {
      const ba = clamp((lift - 0.28) * 1.6, 0, 0.85) * reachT;
      c.fillStyle =
        dogId === 'kuro'
          ? `rgba(68, 52, 48, ${ba.toFixed(3)})`
          : `rgba(255, 148, 164, ${ba.toFixed(3)})`;
      c.beginPath();
      c.ellipse(0, 4.8, 4.6, 3.2, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(-5.6, 10.2, 2.0, 0, Math.PI * 2);
      c.arc(0, 11.4, 2.2, 0, Math.PI * 2);
      c.arc(5.6, 10.2, 2.0, 0, Math.PI * 2);
      c.fill();
    }

    c.restore();
    c.restore();
  }

  function drawPuppyWorkstation(c, placement, isExport = false) {
    const { dog, cx, baseY, scale } = placement;
    const st = dog.state;
    const breath = isExport ? 0 : Math.sin(st.breathPhase) * 2.8;
    const bodyX = DOG_X + st.leanX;

    c.save();
    c.translate(cx, baseY);
    c.scale(scale, scale);

    // 1. Puppy Squatting Ground Shadow
    if (!isExport) {
      c.fillStyle =
        dog.id === 'daisy' && !isDarkTheme
          ? 'rgba(116, 168, 234, 0.32)'
          : isDarkTheme
            ? 'rgba(0, 0, 0, 0.38)'
            : 'rgba(92, 74, 56, 0.14)';
      c.beginPath();
      c.ellipse(bodyX, -3, 102, 20, 0, 0, Math.PI * 2);
      c.fill();

      if (dog.id === 'kuro') {
        c.strokeStyle = isDarkTheme ? 'rgba(255,255,255,0.18)' : 'rgba(30, 32, 36, 0.26)';
        c.lineWidth = 1.8;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(bodyX - 94, 2);
        c.lineTo(bodyX - 60, 3);
        c.moveTo(bodyX + 58, 3);
        c.lineTo(bodyX + 92, 1);
        c.stroke();
      }
    }

    // 2. Squatting Torso, Hind Legs & Tail
    if (dog.id === 'sunny') {
      drawSunnySquatPuppy(c, st, bodyX, breath);
    } else if (dog.id === 'daisy') {
      drawDaisySquatPuppy(c, st, bodyX, breath);
    } else {
      drawKuroSquatPuppy(c, st, bodyX, breath);
    }

    // 3. Keyboard & Mouse placed cleanly IN FRONT OF puppy (drawn before front limbs so paws reach OVER keys!)
    drawPuppyKeyboard(c, dog.id);
    drawPuppyMouseAndPad(c, dog.id);

    // 4. Unified Fixed-Shoulder Front Limbs (Shoulder pivot stays locked at y = -94 under collar/bandana!)
    const shoulderY = SHOULDER_Y + breath * 0.45;
    const lp = st.leftPaw;
    drawUnifiedFrontLimb(c, dog.id, {
      sx: bodyX - SHOULDER_OFFSET_X,
      sy: shoulderY,
      homeX: bodyX - 35,
      homeY: LEFT_SQUAT_HOME_Y,
      px: lp.x,
      py: lp.y,
      side: -1,
      press: lp.press,
      lift: lp.lift,
    });

    const rp = st.rightPaw;
    if (rp.ghostAlpha > 0.03 && rp.isExtended) {
      c.save();
      c.globalAlpha = rp.ghostAlpha * 0.36;
      c.fillStyle = dog.id === 'sunny' ? '#FCE698' : '#FFFDF8';
      c.beginPath();
      c.ellipse(rp.prevX, rp.prevY - 6, 14, 12, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    drawUnifiedFrontLimb(c, dog.id, {
      sx: bodyX + SHOULDER_OFFSET_X,
      sy: shoulderY,
      homeX: bodyX + 35,
      homeY: RIGHT_SQUAT_HOME_Y,
      px: rp.x,
      py: rp.y,
      side: 1,
      press: rp.press,
      lift: rp.lift,
    });

    // 5. Collar / Floral Bandana / Neck Ruff + Head (naturally overlapping the top of the shoulder joints!)
    if (dog.id === 'sunny') {
      drawSunnyCollarAndHead(c, st, bodyX, breath);
    } else if (dog.id === 'daisy') {
      drawDaisyBandanaAndHead(c, st, bodyX, breath);
    } else {
      drawKuroRuffAndHead(c, st, bodyX, breath);
    }

    c.restore();
  }

  // =========================================================================
  // Stage-Space Effects & Enlarged Floating Keycap Popups (Fade-Out!)
  // =========================================================================
  function drawTrioCaptions(placements) {
    if (currentView !== 'all') return;

    ctx.save();
    for (const p of placements) {
      const y = p.baseY + 124;
      const pillW = 136;
      const pillH = 28;

      roundRectPath(ctx, p.cx - pillW * 0.5, y - pillH * 0.5, pillW, pillH, 14);
      ctx.fillStyle = isDarkTheme ? 'rgba(34, 42, 58, 0.8)' : 'rgba(255, 255, 255, 0.8)';
      ctx.fill();
      ctx.strokeStyle = isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(130, 160, 200, 0.3)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isDarkTheme ? '#E6ECF5' : '#334155';
      ctx.fillText(p.dog.name, p.cx, y + 0.5);
    }
    ctx.restore();
  }

  function drawStageEffects() {
    for (const r of inputState.ripples) {
      const t = r.life / r.maxLife;
      const radius = 6 + easeOutCubic(t) * r.maxRadius;
      ctx.save();
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - t) * 0.78;
      ctx.lineWidth = 2.6 * (1 - t * 0.55);
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const pt of inputState.particles) {
      const t = pt.life / pt.maxLife;
      const alpha = 1 - easeOutCubic(t);
      const sz = pt.size * (1 - t * 0.45);
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rad = i % 2 === 0 ? sz : sz * 0.42;
        const a = (i * Math.PI) / 4;
        if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
        else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    for (const b of inputState.mouseBadges) {
      const t = b.life / b.maxLife;
      const pop = t < 0.2 ? easeOutBack(t / 0.2) : 1;
      const fade = t > 0.42 ? 1 - easeOutCubic((t - 0.42) / 0.58) : 1;
      const drift = easeOutCubic(t) * 16;

      ctx.save();
      ctx.translate(b.x, b.y + drift);
      ctx.scale(pop, pop);
      ctx.globalAlpha = fade;

      const bw = 48;
      const bh = 22;
      roundRectPath(ctx, -bw * 0.5, -bh * 0.5, bw, bh, 11);
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.font = '700 11.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(b.text, 0, 0.5);
      ctx.restore();
    }
  }

  function drawEnlargedKeyPopups() {
    for (const p of inputState.popups) {
      const enterT = clamp(p.age / 0.16, 0, 1);
      const enterScale = 0.36 + easeOutBack(enterT) * 0.64;
      const fadeT = easeOutCubic(p.fadeProgress);

      const alpha = clamp(enterT * 2.6, 0, 1) * (1 - fadeT);
      if (alpha <= 0.005) continue;

      const floatUp = fadeT * 46;
      const scale = enterScale * (1 + p.pulse * 0.08 + fadeT * 0.06);

      if (p.age < 0.24) {
        const trailAlpha = (1 - p.age / 0.24) * 0.32;
        ctx.save();
        const tg = ctx.createLinearGradient(p.startX, p.startY, p.x, p.y - floatUp);
        tg.addColorStop(0, 'rgba(255, 186, 82, 0)');
        tg.addColorStop(1, 'rgba(255, 186, 82, 0.85)');
        ctx.strokeStyle = tg;
        ctx.globalAlpha = trailAlpha;
        ctx.lineWidth = 6 * (1 - p.age / 0.24);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.startX, p.startY);
        ctx.lineTo(p.x, p.y - floatUp);
        ctx.stroke();
        ctx.restore();
      }

      const hw = p.w * 0.5;
      const hh = p.h * 0.5;

      ctx.save();
      ctx.translate(p.x, p.y - floatUp);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;

      const glowR = Math.max(p.w, p.h) * 0.82;
      const halo = ctx.createRadialGradient(0, 0, 8, 0, 0, glowR);
      halo.addColorStop(0, p.isAccent ? 'rgba(255, 166, 54, 0.46)' : 'rgba(255, 224, 158, 0.42)');
      halo.addColorStop(1, 'rgba(255, 196, 98, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, glowR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isDarkTheme ? 'rgba(0, 0, 0, 0.36)' : 'rgba(68, 96, 138, 0.24)';
      roundRectPath(ctx, -hw + 2, -hh + 10, p.w, p.h, 16);
      ctx.fill();

      roundRectPath(ctx, -hw, -hh + 5, p.w, p.h, 15);
      ctx.fillStyle = p.isAccent ? '#D67D15' : '#CFD6E0';
      ctx.fill();
      ctx.strokeStyle = p.isAccent ? '#995308' : '#7F8A9C';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      const topH = p.h - 9;
      roundRectPath(ctx, -hw + 1.5, -hh, p.w - 3, topH, 13.5);
      const topGrad = ctx.createLinearGradient(0, -hh, 0, -hh + topH);
      if (p.isAccent) {
        topGrad.addColorStop(0, '#FFC566');
        topGrad.addColorStop(1, '#F59622');
      } else {
        topGrad.addColorStop(0, '#FFFFFF');
        topGrad.addColorStop(1, '#F4F6FA');
      }
      ctx.fillStyle = topGrad;
      ctx.fill();

      ctx.strokeStyle = p.isAccent ? 'rgba(255, 236, 198, 0.72)' : 'rgba(255, 255, 255, 0.94)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      const fontSize = p.main.length >= 5 ? 20 : p.main.length >= 3 ? 24 : 33;
      ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.isAccent ? '#FFFFFF' : '#2C2623';
      ctx.fillText(p.main, 0, -hh + topH * 0.52);

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
      drawPuppyWorkstation(ctx, p, false);
    }

    drawTrioCaptions(placements);
    drawStageEffects();
    drawEnlargedKeyPopups();

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
