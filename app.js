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

  // =========================================================================
  // Declarative Character Registry (Add New Characters Here With Zero Boilerplate!)
  // =========================================================================
  const CHARACTER_DEFS = [
    {
      id: 'sunny',
      name: '墨镜金毛',
      baseTilt: -0.032,
      phaseOffset: 0.0,
      outline: '#181411',
      outlineW: 3.6,
      backdrop: { c0: '#FFFEFA', c1: '#FFF7E4', c2: '#F8E9C8', crayon: false },
      groundShadow: { light: 'rgba(92, 74, 56, 0.14)', sketchLines: false },
      tail: {
        type: 'feathered',
        colors: ['#ECC564', '#F9DF86', '#FCEAA4'],
        wagLines: true,
      },
      torso: {
        grad: ['#FBE69B', '#F7DC80', '#EBC362'],
        hindThigh: '#EBC462',
        hindPaw: ['#F7DC82'],
        bellyType: 'oval',
        bellyGrad: ['#F8B4C8', '#F29AB4'],
        bellyRx: 36,
        bellyRy: 52,
        strokeBelly: true,
      },
      limb: {
        style: 'solid',
        armGrad: ['#F8DE84', '#FCE596', '#F6D878'],
        shoulderCap: '#F8DE84',
        pawGrad: ['#FFF1B8', '#F9DF86', '#ECC564'],
        toeStroke: '#181411',
        beanColor: '255, 148, 164',
      },
      neck: {
        type: 'collar',
        grad: ['#F8B2C6', '#F398B2', '#E67F9D'],
      },
      head: {
        shape: 'plump',
        crownFluff: true,
        crownFill: '#FBE69A',
        grad: ['#FDF0B4', '#F9DF85', '#ECC666'],
        earType: 'floppy',
        earGrad: ['#F9DF86', '#F6CE72', '#ED9F4E', '#E28B38'],
        maskType: 'muzzle-oval',
        muzzleFill: '#FFF3BF',
        browDots: null,
      },
      face: {
        sunglasses: true,
        mouthBone: true,
        eyeSocketRim: false,
        noseColor: '#141210',
        lipStroke: '#181411',
        whiskers: 'none',
      },
      desk: {
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
        padLight: 'rgba(242, 206, 122, 0.35)',
        padDark: 'rgba(248, 212, 128, 0.14)',
        padStrokeLight: 'rgba(168, 124, 48, 0.32)',
        padStrokeDark: 'rgba(248, 212, 128, 0.3)',
        mouseStroke: '#181411',
      },
    },
    {
      id: 'daisy',
      name: '蓝巾小柴',
      baseTilt: 0.042,
      phaseOffset: 2.1,
      outline: '#7A5134',
      outlineW: 2.8,
      backdrop: { c0: '#F3F9FF', c1: '#DCEEFF', c2: '#C1E1FE', crayon: true },
      groundShadow: { light: 'rgba(116, 168, 234, 0.32)', sketchLines: false },
      tail: {
        type: 'curled-shiba',
        colors: ['#F7BD6B', '#EC9846', '#DC8232'],
      },
      torso: {
        grad: ['#F8BE6E', '#EC9846', '#DC8332'],
        hindThigh: '#E69140',
        hindPaw: ['#FFFDF9'],
        bellyType: 'oval',
        bellyGrad: ['#FFFFFF', '#FFFDF9', '#F5ECE0'],
        bellyRx: 44,
        bellyRy: 58,
        strokeBelly: false,
      },
      limb: {
        style: 'urajiro',
        armGrad: ['#EE9C4B', '#F7BE72', '#FFFBF4', '#FFFDF9'],
        shoulderCap: '#EE9C4B',
        pawGrad: ['#FFFFFF', '#FFFDF9', '#EFE4D6'],
        toeStroke: '#8C684C',
        beanColor: '255, 148, 164',
      },
      neck: {
        type: 'floral-bandana',
        scarfGrad: ['#89B5F0', '#72A0E4', '#5D8CD4'],
        leafColors: ['#7DA9EA', '#6B99DF', '#7BA8E8'],
        outline: '#5B4A5E',
      },
      head: {
        shape: 'plump',
        crownFluff: false,
        grad: ['#F9C478', '#EE9C4B', '#DF8636'],
        earType: 'upright-shiba',
        earGrad: ['#F7BD6C', '#EC9846', '#DF8635'],
        earWhiteRim: true,
        earInner: '#E8A5AC',
        earTuftStyle: 'white-lines',
        maskType: 'urajiro-shiba',
        browDots: { color: 'rgba(255, 253, 248, 0.94)', x: 32, y: -34, rx: 11.5, ry: 7.2, tilt: -0.22 },
      },
      face: {
        sunglasses: false,
        mouthBone: false,
        eyeSocketRim: false,
        noseColor: '#2B201D',
        lipStroke: '#3B231A',
        whiskers: 'curved',
      },
      desk: {
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
        padLight: 'rgba(134, 182, 242, 0.34)',
        padDark: 'rgba(116, 166, 236, 0.16)',
        padStrokeLight: 'rgba(92, 138, 202, 0.38)',
        padStrokeDark: 'rgba(140, 186, 248, 0.3)',
        mouseStroke: '#6A4E3B',
      },
    },
    {
      id: 'kuro',
      name: '歪头黑柴',
      baseTilt: 0.088,
      phaseOffset: 4.2,
      outline: '#0B0C0E',
      outlineW: 3.1,
      backdrop: { c0: '#FFFFFF', c1: '#FAF8F4', c2: '#EFECE4', crayon: false },
      groundShadow: { light: 'rgba(92, 74, 56, 0.14)', sketchLines: true },
      tail: {
        type: 'spiky-shiba',
        colors: ['#2B2E36', '#191B20', '#101215'],
      },
      torso: {
        grad: ['#292C34', '#191B20', '#111317'],
        hindThigh: '#181A1F',
        hindPaw: ['#E8A86E', '#FCF3E6', '#FFFFFF'],
        bellyType: 'none',
      },
      limb: {
        style: 'tricolor',
        upperColor: '#191B20',
        tanColor: '#E8A86E',
        tanLight: '#EAB07A',
        shoulderCap: '#191B20',
        pawGrad: ['#FFFFFF', '#FFFDF9', '#EFE4D6'],
        toeStroke: '#0B0C0E',
        beanColor: '68, 52, 48',
      },
      neck: {
        type: 'fur-ruff-vchest',
        ruffColor: '#191B20',
        vChestColor: '#FCF3E6',
      },
      head: {
        shape: 'fluffy-cheek',
        crownFluff: false,
        grad: ['#2D313A', '#1A1C21', '#111216'],
        earType: 'upright-shiba',
        earGrad: ['#191B20', '#191B20', '#191B20'],
        earWhiteRim: false,
        earInner: ['#EAC0A8', '#D89F84'],
        earTuftStyle: 'dark-spikes',
        maskType: 'black-tan-shiba',
        browDots: { color: '#EEB67E', x: 28, y: -28, rx: 11.5, ry: 7.2, tilt: 0.28 },
      },
      face: {
        sunglasses: false,
        mouthBone: false,
        eyeSocketRim: true,
        noseColor: '#0E0D10',
        lipStroke: '#0B0C0E',
        whiskers: 'short',
      },
      desk: {
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
        padLight: 'rgba(42, 46, 56, 0.1)',
        padDark: 'rgba(255, 255, 255, 0.08)',
        padStrokeLight: 'rgba(42, 46, 56, 0.22)',
        padStrokeDark: 'rgba(255, 255, 255, 0.18)',
        mouseStroke: '#1A1D24',
      },
    },
  ];

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
  // Web Audio Synthesizer
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
  // Shared Workstation & Squatting Rig Constants
  // =========================================================================
  const DOG_X = -12;

  const KB_LOCAL = {
    cx: -43,
    cy: 52,
    w: 248,
    h: 86,
    angle: -0.015,
    padX: 6.8,
    padY: 6.8,
    gap: 2.2,
  };

  const MOUSE_PAD_LOCAL = {
    cx: 126,
    cy: 54,
    w: 76,
    h: 78,
  };

  const MOUSE_BOUNDS_LOCAL = {
    minX: 114,
    maxX: 138,
    minY: 44,
    maxY: 64,
  };

  const MOUSE_SIZE_LOCAL = { w: 46, h: 64 };
  const INIT_MOUSE_LX = 126;
  const INIT_MOUSE_LY = 54;

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
  // Live Character Instances & Input State
  // =========================================================================
  function createDogInstance(def) {
    return {
      def,
      id: def.id,
      name: def.name,
      state: {
        breathPhase: def.phaseOffset,
        tailPhase: def.phaseOffset * 1.6,
        bounce: 0,
        leftEarKick: 0,
        rightEarKick: 0,
        excitement: 0,
        blinkTimer: 2.0 + def.phaseOffset * 0.8,
        blinkProgress: 0,
        glintProgress: 0,
        leanX: 0,
        targetLeanX: 0,
        lookX: 0,
        lookY: 0,
        targetLookX: 0,
        targetLookY: 0,
        keyGlanceUntil: -1,
        // Petting / Happy Expression blend (0 = Kuro default calm/round-eyed, 1 = Daisy laughing + blush!)
        happyBlend: 0,
        petHoldUntil: -1,
        lastHeartAt: 0,
        leftPaw: {
          x: LEFT_SQUAT_HOME_X,
          y: LEFT_SQUAT_HOME_Y,
          targetX: LEFT_SQUAT_HOME_X,
          targetY: LEFT_SQUAT_HOME_Y,
          prevX: LEFT_SQUAT_HOME_X,
          prevY: LEFT_SQUAT_HOME_Y,
          ghostAlpha: 0,
          mode: 'squat',
          activeKeyCode: null,
          holdUntil: 0,
          lift: 0,
          press: 0,
          isExtended: false,
        },
        rightPaw: {
          x: RIGHT_SQUAT_HOME_X,
          y: RIGHT_SQUAT_HOME_Y,
          targetX: RIGHT_SQUAT_HOME_X,
          targetY: RIGHT_SQUAT_HOME_Y,
          prevX: RIGHT_SQUAT_HOME_X,
          prevY: RIGHT_SQUAT_HOME_Y,
          ghostAlpha: 0,
          mode: 'squat',
          activeKeyCode: null,
          holdUntil: 0,
          clickShiftX: 0,
          clickShiftY: 0,
          lift: 0,
          press: 0,
          isExtended: false,
        },
      },
    };
  }

  const dogsList = CHARACTER_DEFS.map(createDogInstance);
  const dogsById = new Map(dogsList.map((d) => [d.id, d]));

  const inputState = {
    time: 0,
    actionCount: 0,
    shiftDown: false,
    metaDown: false,
    activeCodes: new Set(),
    metaPressedCodes: new Set(),

    mouseNormX: 0.5,
    mouseNormY: 0.5,
    pointerStageX: STAGE_W * 0.5,
    pointerStageY: STAGE_H * 0.4,
    prevPointerStageX: STAGE_W * 0.5,
    prevPointerStageY: STAGE_H * 0.4,
    pointerInWindow: false,
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
    hearts: [],
    mouseBadges: [],
  };

  // =========================================================================
  // Math & Layout Helpers
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
      const count = dogsList.length;
      const spacing = 425;
      const startX = STAGE_W * 0.5 - ((count - 1) * spacing) * 0.5;
      return dogsList.map((dog, idx) => ({
        dog,
        cx: startX + idx * spacing,
        baseY: 446,
        scale: 0.94,
      }));
    }
    const target = dogsById.get(currentView) || dogsList[0];
    return [{ dog: target, cx: STAGE_W * 0.5, baseY: 446, scale: 1.16 }];
  }

  function unitToStage(placement, ux, uy) {
    return {
      sx: placement.cx + ux * placement.scale,
      sy: placement.baseY + uy * placement.scale,
    };
  }

  // Hit-test if stage coordinates (sx, sy) are over a puppy's head (for 摸摸头!)
  function findHoveredHeadPlacement(sx, sy) {
    for (const p of getActivePlacements()) {
      const st = p.dog.state;
      const hx = p.cx + (DOG_X + st.leanX + st.lookX * 11) * p.scale;
      const hy = p.baseY + (-204 + st.lookY * 6.5) * p.scale;
      const rx = 114 * p.scale;
      const ry = 100 * p.scale;
      const normDistSq = Math.pow((sx - hx) / rx, 2) + Math.pow((sy - hy) / ry, 2);
      if (normDistSq <= 1.05) {
        return { placement: p, hx, hy };
      }
    }
    return null;
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

  function spawnFloatingHeart(x, y, size = 13) {
    inputState.hearts.push({
      x: x + (Math.random() - 0.5) * 64,
      y: y + (Math.random() - 0.5) * 18,
      vx: (Math.random() - 0.5) * 28,
      vy: -48 - Math.random() * 34,
      size: size + Math.random() * 4,
      rot: (Math.random() - 0.5) * 0.4,
      life: 0,
      maxLife: 0.85 + Math.random() * 0.25,
    });
  }

  function spawnMouseBadge(x, y, text, color) {
    inputState.mouseBadges.push({ x, y, text, color, life: 0, maxLife: 0.72 });
  }

  // =========================================================================
  // Enlarged Floating Keycap Popups
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
    const anchorPlacement = placements[Math.floor(placements.length * 0.5)];
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
  // HUD Controls & Global Listeners (Keyboard + Mouse + Head Petting!)
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
      if (dog.def.face.sunglasses) dog.state.glintProgress = 0.01;
    }

    const activeDog = dogsById.get(viewId);
    statusHintEl.textContent = activeDog
      ? `已切换：${activeDog.name} · 鼠标摸摸头变笑柴表情，敲键/点鼠标伸爪联动`
      : '默认乖巧表情 · 鼠标移到小狗头上摸摸头解锁开心大笑表情 💕';
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

    let useRight = keyObj.hand === 'right';
    if (useRight && mouseBusy) useRight = false;

    if (!useRight) {
      const lp = st.leftPaw;
      lp.prevX = lp.x;
      lp.prevY = lp.y;
      lp.ghostAlpha = lp.isExtended ? 0.34 : 0.16;
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
      rp.ghostAlpha = rp.isExtended ? 0.34 : 0.16;
      rp.mode = 'keyboard';
      rp.isExtended = true;
      rp.activeKeyCode = keyObj.code;
      rp.targetX = keyObj.code === 'Space' ? keyObj.ux + 14 : keyObj.ux;
      rp.targetY = keyObj.uy - 3;
      rp.holdUntil = inputState.time + 0.36;
      st.rightEarKick = 1;
    }

    st.targetLeanX = clamp((keyObj.ux - DOG_X) * 0.14, -18, 18);
    st.targetLookX = clamp((keyObj.ux - DOG_X) / 150, -0.85, 0.9);
    st.targetLookY = 0.62;
    st.keyGlanceUntil = inputState.time + 0.32;
    st.bounce = 0.9;
    st.excitement = Math.min(1, st.excitement + 0.25);
    if (dogObj.def.face.sunglasses && st.glintProgress === 0 && Math.random() < 0.35) {
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

    for (const dogObj of dogsList) {
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

  function updatePointerStagePos(clientX, clientY) {
    inputState.prevPointerStageX = inputState.pointerStageX;
    inputState.prevPointerStageY = inputState.pointerStageY;
    inputState.pointerStageX = (clientX - viewport.offsetX) / viewport.scale;
    inputState.pointerStageY = (clientY - viewport.offsetY) / viewport.scale;
    inputState.pointerInWindow = true;
  }

  function activateMouseReach(clientX, clientY, holdSeconds = 0.65) {
    const nx = clamp(clientX / Math.max(1, window.innerWidth), 0, 1);
    const ny = clamp(clientY / Math.max(1, window.innerHeight), 0, 1);

    inputState.mouseNormX = nx;
    inputState.mouseNormY = ny;
    inputState.mouseTargetLX = lerp(MOUSE_BOUNDS_LOCAL.minX, MOUSE_BOUNDS_LOCAL.maxX, nx);
    inputState.mouseTargetLY = lerp(MOUSE_BOUNDS_LOCAL.minY, MOUSE_BOUNDS_LOCAL.maxY, ny);
    inputState.mouseActiveUntil = Math.max(inputState.mouseActiveUntil, inputState.time + holdSeconds);

    for (const dogObj of dogsList) {
      const st = dogObj.state;
      st.rightPaw.mode = 'mouse';
      st.rightPaw.isExtended = true;
      st.rightPaw.activeKeyCode = null;
      st.targetLeanX = 14 + (nx - 0.5) * 8;
    }
  }

  function syncMouseButtonsBitmask(buttons) {
    if (typeof buttons !== 'number') return;
    inputState.leftDown = (buttons & 1) !== 0;
    inputState.rightDown = (buttons & 2) !== 0;
    inputState.middleDown = (buttons & 4) !== 0;
  }

  window.addEventListener('mousemove', (e) => {
    updatePointerStagePos(e.clientX, e.clientY);
    syncMouseButtonsBitmask(e.buttons);

    if (e.target && e.target.closest && e.target.closest('.hud-top')) {
      canvas.style.cursor = 'default';
      return;
    }

    // Check if user is petting/hovering a puppy's head!
    const headHit = findHoveredHeadPlacement(inputState.pointerStageX, inputState.pointerStageY);
    if (headHit) {
      canvas.style.cursor = 'grab';
      const { dog } = headHit.placement;
      const st = dog.state;
      st.petHoldUntil = Math.max(st.petHoldUntil, inputState.time + 0.42);
      st.excitement = Math.min(1, st.excitement + 0.08);

      const moveStep = Math.hypot(
        inputState.pointerStageX - inputState.prevPointerStageX,
        inputState.pointerStageY - inputState.prevPointerStageY
      );
      if (moveStep > 4 && inputState.time - st.lastHeartAt > 0.18) {
        st.lastHeartAt = inputState.time;
        st.leftEarKick = Math.max(st.leftEarKick, 0.55);
        st.rightEarKick = Math.max(st.rightEarKick, 0.55);
        spawnFloatingHeart(headHit.hx, headHit.hy - 78 * headHit.placement.scale);
        statusHintEl.textContent = `正在摸摸「${dog.name}」的头 💕`;
      }
      return; // Stay in cute squatting pose enjoying head-pet instead of reaching for desk mouse!
    }

    canvas.style.cursor = 'default';
    activateMouseReach(e.clientX, e.clientY, 0.62);
  });

  window.addEventListener('mousedown', (e) => {
    if (e.target && e.target.closest && e.target.closest('.hud-top')) return;
    updatePointerStagePos(e.clientX, e.clientY);

    // Clicking on a puppy's head gives an extra joyful pet bounce + hearts!
    const headHit = findHoveredHeadPlacement(inputState.pointerStageX, inputState.pointerStageY);
    if (headHit && e.button === 0) {
      const { dog, scale } = headHit.placement;
      const st = dog.state;
      st.petHoldUntil = Math.max(st.petHoldUntil, inputState.time + 1.15);
      st.bounce = 1.0;
      st.leftEarKick = 1.0;
      st.rightEarKick = 1.0;
      st.excitement = 1.0;
      if (dog.def.face.sunglasses) st.glintProgress = 0.01;
      for (let i = 0; i < 3; i++) {
        spawnFloatingHeart(headHit.hx, headHit.hy - 78 * scale, 15);
      }
      playMouseClickSound(false);
      incrementAction(`摸了摸「${dog.name}」的脑袋 💕`);
      return;
    }

    activateMouseReach(e.clientX, e.clientY, 0.78);
    const placements = getActivePlacements();

    for (const p of placements) {
      const st = p.dog.state;
      st.rightEarKick = 0.95;
      st.bounce = 0.72;
      st.excitement = Math.min(1, st.excitement + 0.24);
    }

    if (e.button === 0) {
      inputState.leftDown = true;
      inputState.leftGlow = 1;
      for (const p of placements) {
        const mPos = unitToStage(p, inputState.mouseLX - 11, inputState.mouseLY - 14);
        spawnRipple(mPos.sx, mPos.sy, '#FF7849', 34 * p.scale);
        spawnSparkles(mPos.sx, mPos.sy, '#FF7849', placements.length > 1 ? 3 : 5);
        spawnMouseBadge(mPos.sx - 8, mPos.sy + 58 * p.scale, '左键', '#FF6B42');
      }
      playMouseClickSound(false);
      incrementAction('点击鼠标左键');
    } else if (e.button === 2) {
      inputState.rightDown = true;
      inputState.rightGlow = 1;
      for (const p of placements) {
        const mPos = unitToStage(p, inputState.mouseLX + 11, inputState.mouseLY - 14);
        spawnRipple(mPos.sx, mPos.sy, '#38BDF8', 34 * p.scale);
        spawnSparkles(mPos.sx, mPos.sy, '#38BDF8', placements.length > 1 ? 3 : 5);
        spawnMouseBadge(mPos.sx + 8, mPos.sy + 58 * p.scale, '右键', '#0EA5E9');
      }
      playMouseClickSound(true);
      incrementAction('点击鼠标右键');
    } else if (e.button === 1) {
      e.preventDefault();
      inputState.middleDown = true;
      inputState.middleGlow = 1;
      for (const p of placements) {
        const mPos = unitToStage(p, inputState.mouseLX, inputState.mouseLY - 14);
        spawnRipple(mPos.sx, mPos.sy, '#A78BFA', 30 * p.scale);
        spawnMouseBadge(mPos.sx, mPos.sy + 58 * p.scale, '中键', '#8B5CF6');
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
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  document.addEventListener('mouseleave', () => {
    inputState.pointerInWindow = false;
    canvas.style.cursor = 'default';
  });

  window.addEventListener(
    'wheel',
    (e) => {
      inputState.wheelVel += clamp(e.deltaY, -120, 120) * 0.28;
      inputState.middleGlow = Math.max(inputState.middleGlow, 0.85);
      inputState.mouseActiveUntil = Math.max(inputState.mouseActiveUntil, inputState.time + 0.65);
      for (const dogObj of dogsList) {
        const st = dogObj.state;
        st.rightPaw.mode = 'mouse';
        st.rightPaw.isExtended = true;
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
    link.download = `peng-dogs-${currentView}.png`;
    link.href = offCanvas.toDataURL('image/png');
    link.click();
    statusHintEl.textContent = `已导出透明 PNG：peng-dogs-${currentView}.png`;
  }

  // =========================================================================
  // Simulation Update
  // =========================================================================
  function update(dt) {
    inputState.time += dt;

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

    inputState.leftGlow = inputState.leftDown ? 1 : Math.max(0, inputState.leftGlow - dt * 3.0);
    inputState.rightGlow = inputState.rightDown ? 1 : Math.max(0, inputState.rightGlow - dt * 3.0);
    inputState.middleGlow = inputState.middleDown ? 1 : Math.max(0, inputState.middleGlow - dt * 3.2);

    const anyMouseHeld = inputState.leftDown || inputState.rightDown || inputState.middleDown;
    if (anyMouseHeld) {
      inputState.mouseActiveUntil = Math.max(inputState.mouseActiveUntil, inputState.time + 0.55);
    }
    const mouseWanted = inputState.time < inputState.mouseActiveUntil;

    for (const k of keysList) {
      k.press = lerp(k.press, k.isDown ? 1 : 0, 1 - Math.exp(-dt * 30));
      k.glow = k.isDown ? 1 : Math.max(0, k.glow - dt * 3.4);
    }

    const activePlacements = getActivePlacements();
    const placementById = new Map(activePlacements.map((p) => [p.dog.id, p]));
    const hoveredHead = inputState.pointerInWindow
      ? findHoveredHeadPlacement(inputState.pointerStageX, inputState.pointerStageY)
      : null;

    const pawFollow = 1 - Math.exp(-dt * 24);

    for (const dogObj of dogsList) {
      const st = dogObj.state;
      const placement = placementById.get(dogObj.id);

      // Check if this specific puppy's head is currently being petted!
      const isHeadHovered = Boolean(hoveredHead && hoveredHead.placement.dog.id === dogObj.id);
      if (isHeadHovered) {
        st.petHoldUntil = Math.max(st.petHoldUntil, inputState.time + 0.28);
      }
      const isPetted = inputState.time < st.petHoldUntil;
      st.happyBlend = lerp(st.happyBlend, isPetted ? 1 : 0, 1 - Math.exp(-dt * (isPetted ? 14 : 8)));

      st.breathPhase += dt * 2.5;
      if (isPetted) st.excitement = Math.max(st.excitement, 0.55);
      st.excitement = Math.max(0, st.excitement - dt * 0.45);
      st.tailPhase += dt * (4.5 + st.excitement * 11.0);

      st.leanX = lerp(st.leanX, st.targetLeanX, 1 - Math.exp(-dt * 9));
      st.targetLeanX *= Math.exp(-dt * 2.0);

      // Continuous per-puppy 2.5D head & eye gaze tracking toward cursor!
      if (inputState.time >= st.keyGlanceUntil) {
        if (inputState.pointerInWindow && placement) {
          const headStageX = placement.cx + (DOG_X + st.leanX) * placement.scale;
          const headStageY = placement.baseY - 204 * placement.scale;
          st.targetLookX = clamp((inputState.pointerStageX - headStageX) / 290, -1, 1);
          st.targetLookY = clamp((inputState.pointerStageY - headStageY) / 220, -1, 1);
        } else {
          st.targetLookX = 0;
          st.targetLookY = 0;
        }
      }
      st.lookX = lerp(st.lookX, st.targetLookX, 1 - Math.exp(-dt * 12));
      st.lookY = lerp(st.lookY, st.targetLookY, 1 - Math.exp(-dt * 12));
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
      } else if (dogObj.def.face.sunglasses && Math.random() < dt * 0.18) {
        st.glintProgress = 0.01;
      }

      const bodyX = DOG_X + st.leanX;
      const leftHomeX = bodyX - 35;
      const leftHomeY = LEFT_SQUAT_HOME_Y;
      const rightHomeX = bodyX + 35;
      const rightHomeY = RIGHT_SQUAT_HOME_Y;

      // Left Paw ('squat' <-> 'keyboard')
      const lp = st.leftPaw;
      const leftKeyWanted = lp.activeKeyCode !== null || inputState.time < lp.holdUntil;
      if (leftKeyWanted) {
        lp.mode = 'keyboard';
        lp.isExtended = true;
      } else {
        lp.mode = 'squat';
        lp.targetX = leftHomeX;
        lp.targetY = leftHomeY;
      }

      const lpDist = Math.hypot(lp.targetX - lp.x, lp.targetY - lp.y);
      lp.x = lerp(lp.x, lp.targetX, pawFollow);
      lp.y = lerp(lp.y, lp.targetY, pawFollow);
      lp.ghostAlpha = Math.max(0, lp.ghostAlpha - dt * 3.8);

      if (lp.mode === 'squat' && lpDist < 0.6) {
        lp.x = leftHomeX;
        lp.y = leftHomeY;
        lp.isExtended = false;
      } else if (Math.hypot(lp.x - leftHomeX, lp.y - leftHomeY) > 0.8) {
        lp.isExtended = true;
      }

      lp.lift = lerp(lp.lift, clamp(lpDist / 55, 0, 0.85), 1 - Math.exp(-dt * 24));
      lp.press = lerp(lp.press, leftKeyWanted && lpDist < 16 ? 1 : 0, 1 - Math.exp(-dt * 30));

      // Right Paw ('squat' <-> 'mouse' / 'keyboard')
      const rp = st.rightPaw;
      const rightKeyWanted =
        rp.mode === 'keyboard' && (rp.activeKeyCode !== null || inputState.time < rp.holdUntil);

      if (rightKeyWanted) {
        rp.isExtended = true;
      } else if (mouseWanted && !hoveredHead) {
        rp.mode = 'mouse';
        rp.isExtended = true;
        let cShiftX = 0;
        let cShiftY = 0;
        if (inputState.leftDown || inputState.leftGlow > 0.3) {
          const s = Math.max(inputState.leftDown ? 1 : 0, inputState.leftGlow);
          cShiftX = -10.5 * s;
          cShiftY = 3.5 * s;
        } else if (inputState.rightDown || inputState.rightGlow > 0.3) {
          const s = Math.max(inputState.rightDown ? 1 : 0, inputState.rightGlow);
          cShiftX = 10.5 * s;
          cShiftY = 3.5 * s;
        }
        rp.clickShiftX = lerp(rp.clickShiftX, cShiftX, 1 - Math.exp(-dt * 26));
        rp.clickShiftY = lerp(rp.clickShiftY, cShiftY, 1 - Math.exp(-dt * 26));
        rp.targetX = inputState.mouseLX + rp.clickShiftX;
        rp.targetY = inputState.mouseLY - 33 + rp.clickShiftY;
      } else {
        rp.mode = 'squat';
        rp.targetX = rightHomeX;
        rp.targetY = rightHomeY;
      }

      const rpDist = Math.hypot(rp.targetX - rp.x, rp.targetY - rp.y);
      rp.x = lerp(rp.x, rp.targetX, pawFollow);
      rp.y = lerp(rp.y, rp.targetY, pawFollow);
      rp.ghostAlpha = Math.max(0, rp.ghostAlpha - dt * 3.8);

      if (rp.mode === 'squat' && rpDist < 0.6) {
        rp.x = rightHomeX;
        rp.y = rightHomeY;
        rp.isExtended = false;
      } else if (Math.hypot(rp.x - rightHomeX, rp.y - rightHomeY) > 0.8) {
        rp.isExtended = true;
      }

      const rpClicking =
        rp.mode === 'mouse'
          ? anyMouseHeld
          : rp.mode === 'keyboard' && rp.activeKeyCode !== null && rpDist < 16;
      rp.lift = lerp(rp.lift, clamp(rpDist / 58, 0, 0.85), 1 - Math.exp(-dt * 22));
      rp.press = lerp(rp.press, rpClicking ? 1 : 0, 1 - Math.exp(-dt * 28));
    }

    // Popups & Particles
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

    for (let i = inputState.hearts.length - 1; i >= 0; i--) {
      const h = inputState.hearts[i];
      h.life += dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.vy += 38 * dt;
      if (h.life >= h.maxLife) inputState.hearts.splice(i, 1);
    }

    for (let i = inputState.mouseBadges.length - 1; i >= 0; i--) {
      inputState.mouseBadges[i].life += dt;
      if (inputState.mouseBadges[i].life >= inputState.mouseBadges[i].maxLife) {
        inputState.mouseBadges.splice(i, 1);
      }
    }
  }

  // =========================================================================
  // Shared Backdrop & Ambient Decorations
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

    const activeDog = dogsById.get(currentView);
    const bd = activeDog
      ? activeDog.def.backdrop
      : { c0: '#FCFDFE', c1: '#EDF4FC', c2: '#DCE9F8', crayon: true };

    const grad = ctx.createRadialGradient(w * 0.5, h * 0.44, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.82);
    grad.addColorStop(0, bd.c0);
    grad.addColorStop(0.6, bd.c1);
    grad.addColorStop(1, bd.c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (crayonLightPattern && bd.crayon) {
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
      c.fillStyle = '#B8D8FA';
      c.fill();
      c.strokeStyle = stroke;
      c.lineWidth = 2.2;
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
  // SHARED COMPONENT 1: Tail, Squatting Hind Legs & Torso
  // =========================================================================
  function drawSharedTail(c, def, bodyX, wagAngle, breath) {
    const tSpec = def.tail;
    const outline = def.outline;
    c.save();
    c.translate(bodyX - 66, -54 + breath * 0.3);
    c.rotate(-0.12 + wagAngle);

    if (tSpec.type === 'feathered') {
      c.beginPath();
      c.moveTo(6, 12);
      c.bezierCurveTo(-18, 16, -46, 2, -58, -22);
      c.bezierCurveTo(-64, -34, -54, -44, -42, -36);
      c.bezierCurveTo(-46, -44, -36, -50, -26, -40);
      c.bezierCurveTo(-16, -28, -4, -10, 10, -6);
      c.closePath();

      const tg = c.createLinearGradient(0, 10, -56, -38);
      tg.addColorStop(0, tSpec.colors[0]);
      tg.addColorStop(0.6, tSpec.colors[1]);
      tg.addColorStop(1, tSpec.colors[2]);
      c.fillStyle = tg;
      c.fill();
      c.strokeStyle = outline;
      c.lineWidth = def.outlineW;
      c.lineJoin = 'round';
      c.stroke();

      if (tSpec.wagLines) {
        c.lineWidth = 2.4;
        c.lineCap = 'round';
        c.beginPath();
        c.arc(-48, -32, 16, Math.PI * 0.88, Math.PI * 1.24);
        c.stroke();
        c.beginPath();
        c.arc(-52, -34, 22, Math.PI * 0.92, Math.PI * 1.2);
        c.stroke();
      }
    } else if (tSpec.type === 'curled-shiba') {
      const path = () => {
        c.beginPath();
        c.moveTo(8, 18);
        c.bezierCurveTo(-18, 22, -44, 0, -42, -32);
        c.bezierCurveTo(-40, -56, -18, -66, 0, -52);
        c.bezierCurveTo(12, -42, 16, -16, 8, 18);
        c.closePath();
      };
      path();
      const tg = c.createLinearGradient(-38, -52, 8, 14);
      tg.addColorStop(0, tSpec.colors[0]);
      tg.addColorStop(0.55, tSpec.colors[1]);
      tg.addColorStop(1, tSpec.colors[2]);
      c.fillStyle = tg;
      c.fill();

      c.save();
      path();
      c.clip();
      c.fillStyle = 'rgba(255, 250, 240, 0.55)';
      c.beginPath();
      c.ellipse(-22, -44, 18, 14, -0.3, 0, Math.PI * 2);
      c.fill();
      c.restore();

      path();
      c.strokeStyle = outline;
      c.lineWidth = def.outlineW;
      c.lineJoin = 'round';
      c.stroke();
    } else if (tSpec.type === 'spiky-shiba') {
      const path = () => {
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
      path();
      const tg = c.createRadialGradient(-18, -32, 6, -18, -28, 48);
      tg.addColorStop(0, tSpec.colors[0]);
      tg.addColorStop(0.65, tSpec.colors[1]);
      tg.addColorStop(1, tSpec.colors[2]);
      c.fillStyle = tg;
      c.fill();

      c.strokeStyle = 'rgba(248, 238, 224, 0.55)';
      c.lineWidth = 2.2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-26, 4);
      c.quadraticCurveTo(-34, -8, -30, -20);
      c.stroke();

      path();
      c.strokeStyle = outline;
      c.lineWidth = def.outlineW;
      c.lineJoin = 'round';
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

  function drawSharedTorsoAndHindLegs(c, def, st, bodyX, breath) {
    const outline = def.outline;
    const lineW = def.outlineW;
    const tSpec = def.torso;
    const wag = Math.sin(st.tailPhase) * (0.14 + st.excitement * 0.25);

    drawSharedTail(c, def, bodyX, wag, breath);

    // Squatting hind thighs & tucked hind paws
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(bodyX + side * 46, -98 + breath * 0.3);
      c.bezierCurveTo(bodyX + side * 86, -92 + breath * 0.2, bodyX + side * 94, -50, bodyX + side * 80, -22);
      c.bezierCurveTo(bodyX + side * 70, -12, bodyX + side * 52, -14, bodyX + side * 44, -26);
      c.closePath();
      c.fillStyle = tSpec.hindThigh;
      c.fill();
      c.strokeStyle = outline;
      c.lineWidth = lineW;
      c.lineJoin = 'round';
      c.stroke();

      c.beginPath();
      c.ellipse(bodyX + side * 71, -17, 18, 10.5, side * 0.12, 0, Math.PI * 2);
      if (tSpec.hindPaw.length === 1) {
        c.fillStyle = tSpec.hindPaw[0];
      } else {
        const hpg = c.createLinearGradient(bodyX + side * 56, -24, bodyX + side * 84, -10);
        hpg.addColorStop(0, tSpec.hindPaw[0]);
        hpg.addColorStop(0.55, tSpec.hindPaw[1]);
        hpg.addColorStop(1, tSpec.hindPaw[2]);
        c.fillStyle = hpg;
      }
      c.fill();
      c.strokeStyle = outline;
      c.lineWidth = lineW * 0.88;
      c.stroke();

      c.lineCap = 'round';
      c.lineWidth = lineW * 0.68;
      for (const ox of [66, 75]) {
        c.beginPath();
        c.moveTo(bodyX + side * ox, -21);
        c.lineTo(bodyX + side * (ox + 1), -12);
        c.stroke();
      }
    }

    // Squatting Torso + Optional Belly Patch
    c.save();
    defineSquatTorsoPath(c, bodyX, breath);
    const bodyGrad = c.createRadialGradient(bodyX, -94, 14, bodyX, -64, 90);
    bodyGrad.addColorStop(0, tSpec.grad[0]);
    bodyGrad.addColorStop(0.6, tSpec.grad[1]);
    bodyGrad.addColorStop(1, tSpec.grad[2]);
    c.fillStyle = bodyGrad;
    c.fill();

    if (tSpec.bellyType === 'oval') {
      c.save();
      defineSquatTorsoPath(c, bodyX, breath);
      c.clip();
      const bg = c.createLinearGradient(bodyX, -114, bodyX, -16);
      bg.addColorStop(0, tSpec.bellyGrad[0]);
      if (tSpec.bellyGrad.length === 3) {
        bg.addColorStop(0.8, tSpec.bellyGrad[1]);
        bg.addColorStop(1, tSpec.bellyGrad[2]);
      } else {
        bg.addColorStop(1, tSpec.bellyGrad[1]);
      }
      c.fillStyle = bg;
      c.beginPath();
      c.ellipse(bodyX, -56 + breath * 0.25, tSpec.bellyRx, tSpec.bellyRy, 0, 0, Math.PI * 2);
      c.fill();
      if (tSpec.strokeBelly) {
        c.strokeStyle = outline;
        c.lineWidth = 2.8;
        c.stroke();
      }
      c.restore();
    }

    defineSquatTorsoPath(c, bodyX, breath);
    c.strokeStyle = outline;
    c.lineWidth = lineW;
    c.lineJoin = 'round';
    c.stroke();
    c.restore();
  }

  // =========================================================================
  // SHARED COMPONENT 2: Unified Fixed-Shoulder Front Limb (0..1 Squat <-> Reach)
  // =========================================================================
  function drawUnifiedFrontLimb(c, def, { sx, sy, homeX, homeY, px, py, side, press, lift }) {
    const lSpec = def.limb;
    const outline = def.outline;
    const outlineW = def.outlineW;

    const distFromHome = Math.hypot(px - homeX, py - homeY);
    const reachT = easeOutCubic(clamp(distFromHome / 44, 0, 1));

    const pyVis = py - lift * 15;
    const dx = px - sx;
    const dy = pyVis - sy;
    const len = Math.max(1, Math.hypot(dx, dy));

    const bendX = side * lerp(2.5, Math.min(20, len * 0.16), reachT);
    const bendY = lerp(0, -10, reachT) - lift * 9;
    const cx = (sx + px) * 0.5 + bendX;
    const cy = (sy + pyVis) * 0.5 + bendY;

    const armEndAngle = Math.atan2(pyVis - cy, px - cx);
    let targetPawRot = armEndAngle - Math.PI * 0.5;
    while (targetPawRot > Math.PI) targetPawRot -= Math.PI * 2;
    while (targetPawRot < -Math.PI) targetPawRot += Math.PI * 2;
    const pawRot = targetPawRot * (reachT * 0.65);

    const squashX = 1 + press * 0.1 - lift * 0.04;
    const squashY = 1 - press * 0.08 + lift * 0.07;

    const rShoulder = 21.5;
    const rMid = lerp(20.2, 17.6, reachT);
    const rWrist = lerp(18.5, 15.4, reachT);
    const pawRX = lerp(22.2, 18.2, reachT);
    const pawRY = lerp(12.2, 15.2, reachT);

    c.save();

    if (reachT > 0.08) {
      c.fillStyle = `rgba(0, 0, 0, ${(0.16 * reachT).toFixed(3)})`;
      c.beginPath();
      c.ellipse(px, pyVis + 5 + lift * 8, 19 * (1 - lift * 0.2), 11.5 * (1 - lift * 0.2), 0, 0, Math.PI * 2);
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

    c.save();
    c.translate(px, pyVis);
    c.rotate(pawRot);
    c.scale(squashX, squashY);
    c.beginPath();
    c.ellipse(0, 2, pawRX + outlineW, pawRY + outlineW, 0, 0, Math.PI * 2);
    c.fillStyle = outline;
    c.fill();
    c.restore();

    c.strokeStyle = outline;
    c.lineWidth = outlineW * 2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(sLx, sLy + (side === 1 ? (1 - reachT) * 14 : 0));
    c.quadraticCurveTo(mLx, mLy, wLx, wLy);
    c.moveTo(sRx, sRy + (side === -1 ? (1 - reachT) * 14 : 0));
    c.quadraticCurveTo(mRx, mRy, wRx, wRy);
    c.stroke();

    const defineArmTube = () => {
      c.beginPath();
      c.moveTo(sLx, sLy);
      c.quadraticCurveTo(mLx, mLy, wLx, wLy);
      c.lineTo(wRx, wRy);
      c.quadraticCurveTo(mRx, mRy, sRx, sRy);
      c.closePath();
    };

    if (lSpec.style === 'tricolor') {
      c.save();
      defineArmTube();
      c.clip();

      const kg = c.createLinearGradient(sx, sy, px, pyVis);
      kg.addColorStop(0, lSpec.upperColor);
      kg.addColorStop(0.46, lSpec.upperColor);
      kg.addColorStop(0.54, lSpec.tanColor);
      kg.addColorStop(1, lSpec.tanLight);
      c.fillStyle = kg;
      c.fill();

      const midX = (sx + px) * 0.5 + bendX * 0.6;
      const midY = (sy + pyVis) * 0.5 + bendY * 0.6;
      c.save();
      c.translate(midX, midY);
      c.rotate(armEndAngle - Math.PI * 0.5);
      c.fillStyle = lSpec.upperColor;
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
      if (lSpec.style === 'solid') {
        ag.addColorStop(0, lSpec.armGrad[0]);
        ag.addColorStop(0.75, lSpec.armGrad[1]);
        ag.addColorStop(1, lSpec.armGrad[2]);
      } else {
        ag.addColorStop(0, lSpec.armGrad[0]);
        ag.addColorStop(0.42, lSpec.armGrad[1]);
        ag.addColorStop(0.68, lSpec.armGrad[2]);
        ag.addColorStop(1, lSpec.armGrad[3]);
      }
      defineArmTube();
      c.fillStyle = ag;
      c.fill();
    }

    c.fillStyle = lSpec.shoulderCap;
    c.beginPath();
    c.ellipse(sx + side * 2, sy, rShoulder + 1, 16, 0, 0, Math.PI * 2);
    c.fill();

    c.save();
    c.translate(px, pyVis);
    c.rotate(pawRot);
    c.scale(squashX, squashY);

    c.beginPath();
    c.ellipse(0, 2, pawRX, pawRY, 0, 0, Math.PI * 2);
    const pg = c.createRadialGradient(-3, -2, 2, 0, 2, pawRX);
    pg.addColorStop(0, lSpec.pawGrad[0]);
    pg.addColorStop(0.78, lSpec.pawGrad[1]);
    pg.addColorStop(1, lSpec.pawGrad[2]);
    c.fillStyle = pg;
    c.fill();

    c.strokeStyle = lSpec.toeStroke;
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
      c.fillStyle = `rgba(${lSpec.beanColor}, ${ba.toFixed(3)})`;
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

  // =========================================================================
  // SHARED COMPONENT 3: Neck Accessory (Collar / Bandana / Fur Ruff)
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

  function drawSharedNeckAccessory(c, def, st, bodyX, breath) {
    const nSpec = def.neck;
    const y = -124 + breath * 0.55;

    if (nSpec.type === 'collar') {
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
      cg.addColorStop(0, nSpec.grad[0]);
      cg.addColorStop(0.5, nSpec.grad[1]);
      cg.addColorStop(1, nSpec.grad[2]);
      c.fillStyle = cg;
      c.fill();
      c.strokeStyle = def.outline;
      c.lineWidth = def.outlineW;
      c.lineJoin = 'round';
      c.stroke();
      c.restore();
      return;
    }

    if (nSpec.type === 'floral-bandana') {
      const outline = nSpec.outline;
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
      c.fillStyle = nSpec.leafColors[0];
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
      c.fillStyle = nSpec.leafColors[1];
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
      bg.addColorStop(0, nSpec.scarfGrad[0]);
      bg.addColorStop(0.55, nSpec.scarfGrad[1]);
      bg.addColorStop(1, nSpec.scarfGrad[2]);
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
      c.fillStyle = nSpec.leafColors[2];
      c.fill();
      c.strokeStyle = outline;
      c.lineWidth = 2.4;
      c.stroke();
      c.restore();

      c.restore();
      return;
    }

    if (nSpec.type === 'fur-ruff-vchest') {
      c.save();
      c.translate(bodyX, 0);

      const vY = y + 21;
      c.fillStyle = nSpec.vChestColor;
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
      c.moveTo(-54, y - 2);
      c.lineTo(-58, y + 8);
      c.lineTo(-46, y + 12);
      c.lineTo(-48, y + 20);
      c.lineTo(-30, y + 18);
      c.lineTo(-22, y + 25);
      c.lineTo(-8, y + 20);
      c.lineTo(0, y + 27);
      c.lineTo(8, y + 20);
      c.lineTo(22, y + 25);
      c.lineTo(30, y + 18);
      c.lineTo(48, y + 20);
      c.lineTo(46, y + 12);
      c.lineTo(58, y + 8);
      c.lineTo(54, y - 2);
      c.closePath();
      c.fillStyle = nSpec.ruffColor;
      c.fill();
      c.restore();
    }
  }

  // =========================================================================
  // SHARED COMPONENT 4: Head Shell, Ears, Markings & Unified Expression Engine!
  // =========================================================================
  function defineSharedHeadSilhouette(c, shape) {
    c.beginPath();
    if (shape === 'fluffy-cheek') {
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
    } else {
      c.moveTo(0, -92);
      c.bezierCurveTo(60, -92, 108, -46, 112, 14);
      c.bezierCurveTo(115, 58, 66, 84, 0, 84);
      c.bezierCurveTo(-66, 84, -115, 58, -112, 14);
      c.bezierCurveTo(-108, -46, -60, -92, 0, -92);
    }
    c.closePath();
  }

  function drawSharedUprightEar(c, def, side, kick, pass) {
    const hSpec = def.head;
    c.save();
    c.translate(side * 64, -51);
    c.rotate(side * (0.23 + kick * 0.14));

    const earPath = () => {
      c.beginPath();
      c.moveTo(side * -30, 22);
      c.bezierCurveTo(side * -24, -31, side * 3, -74, side * 23, -66);
      c.bezierCurveTo(side * 44, -56, side * 46, 4, side * 28, 38);
      c.closePath();
    };

    if (pass === 'stroke') {
      earPath();
      c.strokeStyle = def.outline;
      c.lineWidth = def.outlineW * 2;
      c.lineJoin = 'round';
      c.stroke();
      c.restore();
      return;
    }

    earPath();
    const eg = c.createLinearGradient(0, -68, 0, 34);
    eg.addColorStop(0, hSpec.earGrad[0]);
    eg.addColorStop(0.55, hSpec.earGrad[1]);
    eg.addColorStop(1, hSpec.earGrad[2]);
    c.fillStyle = eg;
    c.fill();

    if (hSpec.earWhiteRim) {
      c.beginPath();
      c.moveTo(side * -14, 16);
      c.bezierCurveTo(side * -8, -22, side * 6, -48, side * 19, -43);
      c.bezierCurveTo(side * 32, -36, side * 32, 4, side * 20, 24);
      c.closePath();
      c.fillStyle = '#FFFDF9';
      c.fill();
    }

    c.beginPath();
    c.moveTo(side * -10, 15);
    c.bezierCurveTo(side * -5, -18, side * 7, -40, side * 18, -36);
    c.bezierCurveTo(side * 28, -30, side * 28, 4, side * 18, 21);
    c.closePath();
    if (Array.isArray(hSpec.earInner)) {
      const ig = c.createLinearGradient(0, -40, 0, 20);
      ig.addColorStop(0, hSpec.earInner[0]);
      ig.addColorStop(1, hSpec.earInner[1]);
      c.fillStyle = ig;
    } else {
      c.fillStyle = hSpec.earInner;
    }
    c.fill();

    if (hSpec.earTuftStyle === 'white-lines') {
      c.strokeStyle = '#FFFDF9';
      c.lineWidth = 3.2;
      c.lineCap = 'round';
      for (const ox of [-4, 4, 11]) {
        c.beginPath();
        c.moveTo(side * ox, 18);
        c.lineTo(side * (ox + 3), 6);
        c.stroke();
      }
    } else if (hSpec.earTuftStyle === 'dark-spikes') {
      c.fillStyle = hSpec.earGrad[0];
      c.beginPath();
      c.moveTo(side * -14, 18);
      c.lineTo(side * -5, 6);
      c.lineTo(side * 1, 14);
      c.lineTo(side * 9, 5);
      c.lineTo(side * 20, 22);
      c.closePath();
      c.fill();
    }

    c.restore();
  }

  function drawSharedFloppyEar(c, def, side, kick) {
    const hSpec = def.head;
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
    eg.addColorStop(0, hSpec.earGrad[0]);
    eg.addColorStop(0.36, hSpec.earGrad[1]);
    eg.addColorStop(0.74, hSpec.earGrad[2]);
    eg.addColorStop(1, hSpec.earGrad[3]);
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
    c.strokeStyle = def.outline;
    c.lineWidth = def.outlineW;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke();

    c.restore();
  }

  // Shared Round Glossy Eye (Default Kuro-style eye for all non-sunglasses dogs!)
  function drawSharedRoundGlossyEye(c, def, x, y, side, blinkAmount, lookX, lookY, squintClose) {
    c.save();
    c.translate(x, y);

    const totalClose = Math.max(blinkAmount, squintClose);
    if (totalClose > 0.78) {
      c.strokeStyle = def.face.eyeSocketRim ? '#FAF2E6' : '#322018';
      c.lineWidth = 3.6;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-13, 2);
      c.quadraticCurveTo(0, 8, 13, 2);
      c.stroke();
      c.restore();
      return;
    }

    const sy = Math.max(0.15, 1 - totalClose * 0.92);
    c.scale(1, sy);

    // Sclera socket (with crisp white outer rim on dark fur, or soft warm socket on light fur)
    if (def.face.eyeSocketRim) {
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      c.ellipse(side * 1.4, 1.0, 16.4, 17.4, 0, 0, Math.PI * 2);
      c.fill();
    } else {
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      c.ellipse(0, 0.5, 16.0, 17.0, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(92, 58, 36, 0.42)';
      c.lineWidth = 2.0;
      c.stroke();
    }

    c.save();
    c.beginPath();
    if (def.face.eyeSocketRim) {
      c.ellipse(side * 1.0, 0.8, 16.4, 17.4, 0, 0, Math.PI * 2);
    } else {
      c.ellipse(0, 0.5, 15.8, 16.8, 0, 0, Math.PI * 2);
    }
    c.clip();

    const gx = lookX * 5.6;
    const gy = lookY * 4.5;

    c.fillStyle = '#120F12';
    c.beginPath();
    c.ellipse(gx, gy, 14.6, 15.8, 0, 0, Math.PI * 2);
    c.fill();

    const ig = c.createRadialGradient(gx, gy + 6, 1, gx, gy + 6, 10);
    ig.addColorStop(0, 'rgba(116, 72, 44, 0.65)');
    ig.addColorStop(1, 'rgba(18, 15, 18, 0)');
    c.fillStyle = ig;
    c.beginPath();
    c.ellipse(gx, gy + 6, 10, 6.5, 0, 0, Math.PI * 2);
    c.fill();

    const hlX = lookX * 6.8;
    const hlY = lookY * 5.4;
    c.fillStyle = '#FFFFFF';
    c.beginPath();
    c.ellipse(hlX - 4.5, hlY - 5.5, 4.8, 4.2, -0.25, 0, Math.PI * 2);
    c.fill();

    c.beginPath();
    c.arc(hlX + 4.8, hlY + 5.2, 2.0, 0, Math.PI * 2);
    c.fill();

    c.restore();
    c.restore();
  }

  // Shared Happy Smiling Crescent Eye (◠ ◠ — unlocked when petting head!)
  function drawSharedHappyCrescentEye(c, def, x, y, side, lookX, lookY, bounce) {
    c.save();
    c.translate(x + lookX * 2.5, y + lookY * 1.8 - bounce * 1.5);
    c.rotate(lookX * 0.06);
    c.lineCap = 'round';

    if (def.face.eyeSocketRim) {
      // On dark fur (e.g. Kuro), a single crisp warm-ivory crescent arc pops cleanly without double-ring artifacts
      c.strokeStyle = def.outline;
      c.lineWidth = 6.8;
      c.beginPath();
      c.arc(0, 10, 16.5, Math.PI * 1.14, Math.PI * 1.86);
      c.stroke();

      c.strokeStyle = '#FFF8EE';
      c.lineWidth = 4.2;
      c.beginPath();
      c.arc(0, 10, 16.5, Math.PI * 1.14, Math.PI * 1.86);
      c.stroke();

      c.lineWidth = 2.6;
      c.beginPath();
      c.moveTo(side * 13.5, 3);
      c.lineTo(side * 18.2, 5.4);
      c.stroke();
    } else {
      c.strokeStyle = '#2B1D17';
      c.lineWidth = 4.6;
      c.beginPath();
      c.arc(0, 10, 16.5, Math.PI * 1.14, Math.PI * 1.86);
      c.stroke();

      c.lineWidth = 2.8;
      c.beginPath();
      c.moveTo(side * 13.5, 3);
      c.lineTo(side * 18.5, 5.5);
      c.stroke();
    }
    c.restore();
  }

  function drawSharedSunglasses(c, st) {
    c.save();
    c.translate(st.lookX * 3.0, st.lookY * 1.8);
    const sgY = -12 - st.bounce * 1.5;
    c.strokeStyle = '#141518';
    c.lineWidth = 6.0;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-76 - st.lookX * 19, sgY - 5 - st.lookY * 3);
    c.lineTo(-54, sgY - 2);
    c.moveTo(54, sgY - 2);
    c.lineTo(76 - st.lookX * 19, sgY - 5 - st.lookY * 3);
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
      const glintShift =
        (st.glintProgress > 0 ? (st.glintProgress - 0.3) * 56 : 0) + st.lookX * 8;
      c.strokeStyle = 'rgba(255, 255, 255, 0.38)';
      c.lineWidth = 4.5;
      c.beginPath();
      c.moveTo(-18 + glintShift, 14);
      c.lineTo(-4 + glintShift, -12);
      c.stroke();

      c.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-8 + glintShift, 14);
      c.lineTo(5 + glintShift, -12);
      c.stroke();
      c.restore();

      c.restore();
    }
    c.restore();
  }

  // Unified Expression Renderer:
  //   happyBlend = 0 -> Default Kuro calm/sweet expression (round glossy eyes + closed ω smile)
  //   happyBlend = 1 -> Petted Daisy happy expression (crescent eyes + rosy blush + open tongue laugh!)
  //   (Sunny keeps sunglasses + mouth bone at all times, while still getting happy blush + open tongue laugh!)
  function drawSharedFaceExpression(c, def, st) {
    const fSpec = def.face;
    const hb = st.happyBlend;
    const fx = st.lookX * 13.0;
    const fy = st.lookY * 8.8;

    c.save();
    c.translate(fx, fy);

    // 1. Eyebrow Dots (豆眉 for Kuro & Daisy)
    if (def.head.browDots) {
      const bd = def.head.browDots;
      const liftY = -hb * 3.5;
      c.fillStyle = bd.color;
      c.beginPath();
      c.ellipse(-bd.x + st.lookX * 1.5, bd.y + st.lookY * 1.2 + liftY, bd.rx, bd.ry, bd.tilt, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(bd.x + st.lookX * 1.5, bd.y + st.lookY * 1.2 + liftY, bd.rx, bd.ry, -bd.tilt, 0, Math.PI * 2);
      c.fill();
    }

    // 2. Cheek Blush (blooms rosy Daisy blush & /// strokes when petted on head for ALL characters!)
    if (hb > 0.03) {
      c.save();
      c.globalAlpha = hb;
      for (const side of [-1, 1]) {
        const bx = side * 63;
        const by = 19;
        const bg = c.createRadialGradient(bx, by, 2, bx, by, 26);
        bg.addColorStop(0, 'rgba(252, 142, 166, 0.8)');
        bg.addColorStop(1, 'rgba(252, 142, 166, 0)');
        c.fillStyle = bg;
        c.beginPath();
        c.ellipse(bx, by, 26, 16, side * 0.08, 0, Math.PI * 2);
        c.fill();

        c.strokeStyle = 'rgba(228, 104, 130, 0.65)';
        c.lineWidth = 2.1;
        c.lineCap = 'round';
        for (const ox of [-6, 0, 6]) {
          c.beginPath();
          c.moveTo(bx + ox - 2, by + 3.5);
          c.lineTo(bx + ox + 2.5, by - 3.5);
          c.stroke();
        }
      }
      c.restore();
    }

    // 3. Eyes (Sunglasses for Sunny; Round Glossy <-> Happy Crescent for Daisy & Kuro!)
    if (fSpec.sunglasses) {
      drawSharedSunglasses(c, st);
    } else {
      const blinkAmount = st.blinkProgress > 0 ? Math.sin(st.blinkProgress) : 0;
      if (hb < 0.5) {
        const squint = hb * 1.65;
        drawSharedRoundGlossyEye(c, def, -40, -3, -1, blinkAmount, st.lookX, st.lookY, squint);
        drawSharedRoundGlossyEye(c, def, 40, -3, 1, blinkAmount, st.lookX, st.lookY, squint);
      } else {
        drawSharedHappyCrescentEye(c, def, -41, -7, -1, st.lookX, st.lookY, st.bounce);
        drawSharedHappyCrescentEye(c, def, 41, -7, 1, st.lookX, st.lookY, st.bounce);
      }
    }

    // 4. Subtle Muzzle Mound
    if (!fSpec.sunglasses) {
      c.fillStyle = 'rgba(218, 198, 176, 0.28)';
      c.beginPath();
      c.ellipse(0, 25, 20, 13, 0, 0, Math.PI * 2);
      c.fill();
    }

    // 5. Mouth Morph: Sweet Closed ω Smile (hb = 0) <-> Daisy's Open Laugh + Bouncy Pink Tongue (hb = 1)!
    const pant = Math.sin(inputState.time * 5.0) * 1.8 + st.excitement * 4.2;
    const lipW = lerp(20, 29, hb);
    const lipCornerY = lerp(29.5, 20, hb);
    const lipCenterY = lerp(26, 22, hb);

    if (hb > 0.08) {
      const openDepth = hb * (40 + pant);
      const mouthPath = () => {
        c.beginPath();
        c.moveTo(-lipW, lipCornerY + 2);
        c.quadraticCurveTo(0, lipCenterY + 8 * hb, lipW, lipCornerY + 2);
        c.bezierCurveTo(
          lipW * 0.9,
          lipCenterY + openDepth * 0.72,
          lipW * 0.48,
          lipCenterY + openDepth,
          0,
          lipCenterY + openDepth
        );
        c.bezierCurveTo(
          -lipW * 0.48,
          lipCenterY + openDepth,
          -lipW * 0.9,
          lipCenterY + openDepth * 0.72,
          -lipW,
          lipCornerY + 2
        );
        c.closePath();
      };

      c.save();
      mouthPath();
      c.fillStyle = '#4B2424';
      c.fill();

      // Bouncing rosy-pink puppy tongue inside open laugh!
      c.save();
      c.clip();
      const tongueBottom = lipCenterY + openDepth;
      const tg = c.createLinearGradient(0, lipCenterY + 6, 0, tongueBottom + 4);
      tg.addColorStop(0, '#E87A8A');
      tg.addColorStop(0.35, '#F797A6');
      tg.addColorStop(1, '#FBAAB7');
      c.fillStyle = tg;
      c.beginPath();
      c.ellipse(0, lipCenterY + openDepth * 0.62, 18 * hb, 21 * hb, 0, 0, Math.PI * 2);
      c.fill();

      c.strokeStyle = '#D96D7D';
      c.lineWidth = 2.0;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(0, lipCenterY + 8 * hb);
      c.lineTo(0, lipCenterY + openDepth * 0.68);
      c.stroke();
      c.restore();

      mouthPath();
      c.strokeStyle = fSpec.lipStroke;
      c.lineWidth = 3.0;
      c.lineJoin = 'round';
      c.stroke();
      c.restore();
    }

    // Upper ω lip line (shared seamlessly across calm & laughing states!)
    c.strokeStyle = fSpec.lipStroke;
    c.lineWidth = 3.1;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(0, 19);
    c.lineTo(0, lipCenterY);
    c.moveTo(-lipW - 1, lipCornerY);
    c.bezierCurveTo(-lipW * 0.68, lipCenterY + 8, -5, lipCenterY + 6, 0, lipCenterY);
    c.bezierCurveTo(5, lipCenterY + 6, lipW * 0.68, lipCenterY + 8, lipW + 1, lipCornerY - 0.5);
    c.stroke();

    // 6. Sunny's Signature Mini White Bone (stays clenched at left mouth corner even while laughing!)
    if (fSpec.mouthBone) {
      const boneWiggle = Math.sin(inputState.time * 4.2) * 0.06 + st.excitement * 0.14;
      const boneX = lerp(-12, -23, hb);
      const boneY = lerp(31, 24, hb);
      c.save();
      c.translate(boneX, boneY);
      c.rotate(-0.46 + hb * 0.1 + boneWiggle);

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
      c.strokeStyle = def.outline;
      c.lineWidth = 3.0;
      c.lineJoin = 'round';
      c.stroke();

      c.lineWidth = 2.0;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(-28, 1, 11, Math.PI * 0.72, Math.PI * 1.18);
      c.stroke();
      c.beginPath();
      c.arc(-30, 2, 15, Math.PI * 0.78, Math.PI * 1.12);
      c.stroke();
      c.restore();
    }

    // 7. Whiskers
    if (fSpec.whiskers === 'short') {
      c.strokeStyle = 'rgba(42, 34, 28, 0.52)';
      c.lineWidth = 1.5;
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(side * 24, 18);
        c.lineTo(side * 34, 16);
        c.moveTo(side * 26, 24);
        c.lineTo(side * 37, 24);
        c.stroke();
      }
    } else if (fSpec.whiskers === 'curved') {
      c.strokeStyle = 'rgba(110, 82, 66, 0.38)';
      c.lineWidth = 1.4;
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(side * 23, 16);
        c.quadraticCurveTo(side * 38, 14, side * 50, 18);
        c.moveTo(side * 25, 22);
        c.quadraticCurveTo(side * 40, 22, side * 52, 26);
        c.stroke();
      }
    }

    // 8. Glossy Puppy Nose
    c.beginPath();
    if (fSpec.sunglasses) {
      c.ellipse(0, 14, 15.0, 10.0, 0, 0, Math.PI * 2);
    } else {
      c.moveTo(0, 6.5);
      c.bezierCurveTo(11.5, 6, 14.5, 12.5, 8.2, 18);
      c.quadraticCurveTo(0, 21.5, -8.2, 18);
      c.bezierCurveTo(-14.5, 12.5, -11.5, 6, 0, 6.5);
      c.closePath();
    }
    c.fillStyle = fSpec.noseColor;
    c.fill();

    c.fillStyle = 'rgba(255, 255, 255, 0.75)';
    c.beginPath();
    c.ellipse(-3.6, 10.5, 3.8, 1.9, -0.28, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  function drawSharedHeadAndFace(c, def, st, bodyX, breath) {
    const hSpec = def.head;
    const headX = bodyX + st.lookX * 11;
    const headY = -204 + breath * 0.85 + st.lookY * 6.5 + st.bounce * 4.5;
    const headTilt = def.baseTilt + st.leanX * 0.002 + st.lookX * 0.11;

    c.save();
    c.translate(headX, headY);
    c.rotate(headTilt);

    const crownShiftX = -st.lookX * 3.5;
    const defineCrownFluff = () => {
      c.beginPath();
      c.moveTo(-46 + crownShiftX, -72);
      c.lineTo(-44 + crownShiftX, -84);
      c.quadraticCurveTo(-33 + crownShiftX, -101, -18 + crownShiftX, -90);
      c.quadraticCurveTo(-6 + crownShiftX, -105, 10 + crownShiftX, -91);
      c.quadraticCurveTo(26 + crownShiftX, -101, 40 + crownShiftX, -84);
      c.lineTo(42 + crownShiftX, -72);
      c.closePath();
    };

    // Upright ear outer strokes behind head silhouette
    if (hSpec.earType === 'upright-shiba') {
      c.save();
      c.translate(-st.lookX * 5.5, -st.lookY * 3.2);
      drawSharedUprightEar(c, def, -1, st.leftEarKick, 'stroke');
      drawSharedUprightEar(c, def, 1, st.rightEarKick, 'stroke');
      c.restore();
    }

    if (hSpec.crownFluff) {
      defineCrownFluff();
      c.strokeStyle = def.outline;
      c.lineWidth = def.outlineW * 2;
      c.lineJoin = 'round';
      c.stroke();
    }

    defineSharedHeadSilhouette(c, hSpec.shape);
    c.strokeStyle = def.outline;
    c.lineWidth = def.outlineW * 2;
    c.lineJoin = 'round';
    c.stroke();

    if (hSpec.earType === 'upright-shiba') {
      c.save();
      c.translate(-st.lookX * 5.5, -st.lookY * 3.2);
      drawSharedUprightEar(c, def, -1, st.leftEarKick, 'fill');
      drawSharedUprightEar(c, def, 1, st.rightEarKick, 'fill');
      c.restore();
    }

    defineSharedHeadSilhouette(c, hSpec.shape);
    const hg = c.createRadialGradient(-18 + st.lookX * 10, -45 + st.lookY * 8, 14, 0, 5, 130);
    hg.addColorStop(0, hSpec.grad[0]);
    hg.addColorStop(0.55, hSpec.grad[1]);
    hg.addColorStop(1, hSpec.grad[2]);
    c.fillStyle = hg;
    c.fill();

    if (hSpec.crownFluff) {
      defineCrownFluff();
      c.fillStyle = hSpec.crownFill;
      c.fill();
    }

    // Cheek & Muzzle Markings clipped inside head silhouette
    const mx = st.lookX * 8.5;
    const my = st.lookY * 5.5;

    if (hSpec.maskType === 'urajiro-shiba') {
      c.save();
      defineSharedHeadSilhouette(c, hSpec.shape);
      c.clip();

      c.beginPath();
      c.moveTo(mx, -2 + my);
      c.bezierCurveTo(18 + mx, -22 + my, 72 + mx, -20 + my, 124, 16 + my * 0.5);
      c.lineTo(126, 102);
      c.lineTo(-126, 102);
      c.lineTo(-124, 16 + my * 0.5);
      c.bezierCurveTo(-72 + mx, -20 + my, -18 + mx, -22 + my, mx, -2 + my);
      c.closePath();

      const fg = c.createLinearGradient(0, -22 + my, 0, 88);
      fg.addColorStop(0, '#FFFFFF');
      fg.addColorStop(0.82, '#FFFDF9');
      fg.addColorStop(1, '#F6EEE3');
      c.fillStyle = fg;
      c.fill();

      c.strokeStyle = 'rgba(255, 238, 198, 0.55)';
      c.lineWidth = 4.5;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(mx * 0.5, -10 + my * 0.5, 74, -Math.PI * 0.66, -Math.PI * 0.34);
      c.stroke();
      c.restore();
    } else if (hSpec.maskType === 'black-tan-shiba') {
      c.save();
      defineSharedHeadSilhouette(c, hSpec.shape);
      c.clip();

      c.fillStyle = '#E6A56A';
      c.beginPath();
      c.ellipse(-58 + mx, 12 + my, 34, 18, -0.22, 0, Math.PI * 2);
      c.ellipse(58 + mx, 12 + my, 34, 18, 0.22, 0, Math.PI * 2);
      c.fill();

      c.beginPath();
      c.moveTo(-114, 20 + my * 0.6);
      c.bezierCurveTo(-76 + mx, 6 + my, -48 + mx, 14 + my, -26 + mx, 16 + my);
      c.bezierCurveTo(-14 + mx, 16 + my, -10 + mx, 0 + my, mx, 0 + my);
      c.bezierCurveTo(10 + mx, 0 + my, 14 + mx, 16 + my, 26 + mx, 16 + my);
      c.bezierCurveTo(48 + mx, 14 + my, 76 + mx, 6 + my, 114, 20 + my * 0.6);
      c.lineTo(120, 100);
      c.lineTo(-120, 100);
      c.closePath();

      const cg = c.createLinearGradient(0, my, 0, 88);
      cg.addColorStop(0, '#FDF6EA');
      cg.addColorStop(0.75, '#FAF0E1');
      cg.addColorStop(1, '#EFE2CE');
      c.fillStyle = cg;
      c.fill();

      c.fillStyle = 'rgba(206, 186, 166, 0.45)';
      c.beginPath();
      c.ellipse(mx * 0.6, 76 + my * 0.4, 36, 12, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    } else if (hSpec.maskType === 'muzzle-oval') {
      c.fillStyle = hSpec.muzzleFill;
      c.beginPath();
      c.ellipse(st.lookX * 13.0, 26 + st.lookY * 8.8, 46, 31, 0, 0, Math.PI * 2);
      c.fill();
    }

    // Floppy ears hang over the side edges of the head
    if (hSpec.earType === 'floppy') {
      c.save();
      c.translate(-st.lookX * 5.5, -st.lookY * 3.2);
      drawSharedFloppyEar(c, def, -1, st.leftEarKick);
      drawSharedFloppyEar(c, def, 1, st.rightEarKick);
      c.restore();
    }

    // Unified Face Expression (Default Kuro calm <-> Petted Daisy happy laugh!)
    drawSharedFaceExpression(c, def, st);

    c.restore();
  }

  // =========================================================================
  // SHARED COMPONENT 5: Desk Workstation (Keyboard + Right-Side User Mouse)
  // =========================================================================
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

  function drawWorkstationDesk(c, def) {
    const dt = def.desk;
    const kbHW = KB_LOCAL.w * 0.5;
    const kbHH = KB_LOCAL.h * 0.5;

    // 1. Mechanical Keyboard
    c.save();
    c.translate(KB_LOCAL.cx, KB_LOCAL.cy);
    c.rotate(KB_LOCAL.angle);

    c.fillStyle = isDarkTheme ? 'rgba(0, 0, 0, 0.44)' : 'rgba(56, 78, 112, 0.2)';
    roundRectPath(c, -kbHW + 2, -kbHH + 6, KB_LOCAL.w, KB_LOCAL.h, 12);
    c.fill();

    roundRectPath(c, -kbHW, -kbHH + 3.5, KB_LOCAL.w, KB_LOCAL.h, 11);
    c.fillStyle = dt.kbBase;
    c.fill();

    roundRectPath(c, -kbHW, -kbHH, KB_LOCAL.w, KB_LOCAL.h - 1.5, 11);
    const fg = c.createLinearGradient(0, -kbHH, 0, kbHH);
    fg.addColorStop(0, dt.kbTop1);
    fg.addColorStop(1, dt.kbTop2);
    c.fillStyle = fg;
    c.fill();
    c.strokeStyle = dt.kbStroke;
    c.lineWidth = dt.kbStrokeW;
    c.stroke();

    roundRectPath(c, -kbHW + 5.5, -kbHH + 5.5, KB_LOCAL.w - 11, KB_LOCAL.h - 12.5, 7);
    c.fillStyle = dt.kbWell;
    c.fill();

    for (const k of keysList) {
      drawKeycapLocal(c, k, dt);
    }
    c.restore();

    // 2. Right-Side Mouse Pad & User-Perspective Mouse
    c.save();
    roundRectPath(
      c,
      MOUSE_PAD_LOCAL.cx - MOUSE_PAD_LOCAL.w * 0.5,
      MOUSE_PAD_LOCAL.cy - MOUSE_PAD_LOCAL.h * 0.5,
      MOUSE_PAD_LOCAL.w,
      MOUSE_PAD_LOCAL.h,
      17
    );
    c.fillStyle = isDarkTheme ? dt.padDark : dt.padLight;
    c.fill();
    c.strokeStyle = isDarkTheme ? dt.padStrokeDark : dt.padStrokeLight;
    c.lineWidth = 1.8;
    c.stroke();
    c.restore();

    const hw = MOUSE_SIZE_LOCAL.w * 0.5;
    const hh = MOUSE_SIZE_LOCAL.h * 0.5;
    const splitY = 2;

    c.save();
    c.translate(inputState.mouseLX, inputState.mouseLY);
    c.rotate(inputState.mouseTilt);

    c.fillStyle = isDarkTheme ? 'rgba(0, 0, 0, 0.42)' : 'rgba(56, 78, 112, 0.22)';
    c.beginPath();
    c.ellipse(1.5, 5, hw * 1.04, hh * 0.98, 0, 0, Math.PI * 2);
    c.fill();

    if (inputState.leftGlow > 0.04) {
      const lAura = c.createRadialGradient(-hw * 0.45, -hh * 0.45, 2, -hw * 0.45, -hh * 0.45, 42);
      lAura.addColorStop(0, `rgba(255, 116, 68, ${(0.78 * inputState.leftGlow).toFixed(3)})`);
      lAura.addColorStop(1, 'rgba(255, 116, 68, 0)');
      c.fillStyle = lAura;
      c.beginPath();
      c.arc(-hw * 0.45, -hh * 0.45, 42, 0, Math.PI * 2);
      c.fill();
    }

    if (inputState.rightGlow > 0.04) {
      const rAura = c.createRadialGradient(hw * 0.45, -hh * 0.45, 2, hw * 0.45, -hh * 0.45, 42);
      rAura.addColorStop(0, `rgba(56, 189, 248, ${(0.78 * inputState.rightGlow).toFixed(3)})`);
      rAura.addColorStop(1, 'rgba(56, 189, 248, 0)');
      c.fillStyle = rAura;
      c.beginPath();
      c.arc(hw * 0.45, -hh * 0.45, 42, 0, Math.PI * 2);
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
      c.rect(-hw - 4, -hh - 4, hw + 4, hh + splitY + 4);
      c.clip();
      const lg = c.createLinearGradient(-hw, -hh, 0, splitY);
      lg.addColorStop(0, `rgba(255, 162, 116, ${inputState.leftGlow.toFixed(3)})`);
      lg.addColorStop(0.55, `rgba(255, 112, 66, ${inputState.leftGlow.toFixed(3)})`);
      lg.addColorStop(1, `rgba(235, 74, 38, ${inputState.leftGlow.toFixed(3)})`);
      c.fillStyle = lg;
      c.fillRect(-hw - 4, -hh - 4, hw + 4, hh + splitY + 4);
      c.restore();
    }

    if (inputState.rightGlow > 0.02) {
      c.save();
      c.beginPath();
      c.rect(0, -hh - 4, hw + 4, hh + splitY + 4);
      c.clip();
      const rg = c.createLinearGradient(0, -hh, hw, splitY);
      rg.addColorStop(0, `rgba(130, 226, 255, ${inputState.rightGlow.toFixed(3)})`);
      rg.addColorStop(0.55, `rgba(56, 189, 248, ${inputState.rightGlow.toFixed(3)})`);
      rg.addColorStop(1, `rgba(14, 146, 224, ${inputState.rightGlow.toFixed(3)})`);
      c.fillStyle = rg;
      c.fillRect(0, -hh - 4, hw + 4, hh + splitY + 4);
      c.restore();
    }

    c.strokeStyle = 'rgba(72, 82, 98, 0.5)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-hw, splitY);
    c.quadraticCurveTo(0, splitY + 2.5, hw, splitY);
    c.moveTo(0, -hh);
    c.lineTo(0, splitY + 1);
    c.stroke();

    c.font = '800 9px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = inputState.leftGlow > 0.35 ? '#FFFFFF' : 'rgba(72, 65, 62, 0.52)';
    c.fillText('L', -hw * 0.54, -hh * 0.38);

    c.fillStyle = inputState.rightGlow > 0.35 ? '#FFFFFF' : 'rgba(72, 65, 62, 0.52)';
    c.fillText('R', hw * 0.54, -hh * 0.38);

    c.fillStyle = 'rgba(255, 255, 255, 0.52)';
    c.beginPath();
    c.ellipse(-4, hh * 0.48, 8, 4.2, -0.2, 0, Math.PI * 2);
    c.fill();
    c.restore();

    defineMouseShellPath(c, hw, hh);
    c.strokeStyle = dt.mouseStroke;
    c.lineWidth = 2.4;
    c.stroke();

    if (inputState.leftGlow > 0.1) {
      c.save();
      c.beginPath();
      c.rect(-hw - 5, -hh - 5, hw + 5, hh + splitY + 5);
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
      c.rect(0, -hh - 5, hw + 5, hh + splitY + 5);
      c.clip();
      defineMouseShellPath(c, hw, hh);
      c.strokeStyle = `rgba(42, 184, 248, ${inputState.rightGlow.toFixed(3)})`;
      c.lineWidth = 3.2;
      c.stroke();
      c.restore();
    }

    const wheelW = 8.5;
    const wheelH = 16.5;
    const wheelX = -wheelW * 0.5;
    const wheelY = -21;

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
  // Master Puppy Workstation Assembler (100% Shared Across All Characters!)
  // =========================================================================
  function drawPuppyWorkstation(c, placement, isExport = false) {
    const { dog, cx, baseY, scale } = placement;
    const def = dog.def;
    const st = dog.state;
    const breath = isExport ? 0 : Math.sin(st.breathPhase) * 2.8;
    const bodyX = DOG_X + st.leanX;

    c.save();
    c.translate(cx, baseY);
    c.scale(scale, scale);

    // 1. Ground Shadow
    if (!isExport) {
      c.fillStyle = isDarkTheme ? 'rgba(0, 0, 0, 0.38)' : def.groundShadow.light;
      c.beginPath();
      c.ellipse(bodyX, -3, 102, 20, 0, 0, Math.PI * 2);
      c.fill();

      if (def.groundShadow.sketchLines) {
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
    drawSharedTorsoAndHindLegs(c, def, st, bodyX, breath);

    // 3. Unobstructed Front Keyboard & Right-Side Mouse
    drawWorkstationDesk(c, def);

    // 4. Unified Fixed-Shoulder Front Limbs
    const shoulderY = SHOULDER_Y + breath * 0.45;
    const lp = st.leftPaw;
    if (lp.ghostAlpha > 0.03 && lp.isExtended) {
      c.save();
      c.globalAlpha = lp.ghostAlpha * 0.36;
      c.fillStyle = def.limb.pawGrad[1];
      c.beginPath();
      c.ellipse(lp.prevX, lp.prevY - 6, 14, 12, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    drawUnifiedFrontLimb(c, def, {
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
      c.fillStyle = def.limb.pawGrad[1];
      c.beginPath();
      c.ellipse(rp.prevX, rp.prevY - 6, 14, 12, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    drawUnifiedFrontLimb(c, def, {
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

    // 5. Neck Accessory + Head & Unified Expression
    drawSharedNeckAccessory(c, def, st, bodyX, breath);
    drawSharedHeadAndFace(c, def, st, bodyX, breath);

    c.restore();
  }

  // =========================================================================
  // Stage-Space Captions, Effects & Enlarged Keycap Popups
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

    for (const h of inputState.hearts) {
      const t = h.life / h.maxLife;
      const alpha = t < 0.2 ? t / 0.2 : 1 - easeOutCubic((t - 0.2) / 0.8);
      const s = h.size * (0.72 + 0.32 * Math.sin(Math.min(1, t * 3) * Math.PI * 0.5));
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FF7E9D';
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

  window.addEventListener('resize', () => {
    resizeCanvas();
    drawScene();
  });
  resizeCanvas();
  syncThemeUI();
  drawScene();
  requestAnimationFrame(renderFrame);
})();
