export function initCanvasFallback(options = {}) {
  const stage = document.getElementById('stage');
  const captionText = document.getElementById('captionText');
  const statusText = document.getElementById('statusText');
  const intentText = document.getElementById('intentText');
  const expressionText = document.getElementById('expressionText');
  const jsonPreview = document.getElementById('jsonPreview');
  const playBtn = document.getElementById('playBtn');
  const oneBtn = document.getElementById('oneBtn');
  const stopBtn = document.getElementById('stopBtn');
  const customBtn = document.getElementById('customBtn');
  const customText = document.getElementById('customText');
  const depthRange = document.getElementById('depthRange');
  const glowRange = document.getElementById('glowRange');
  const noiseRange = document.getElementById('noiseRange');

  const mockLines = [
    {
      display_text: 'こんにちは。私は高級腕時計のご相談をサポートするホログラムAIです。',
      speak_text: 'こんにちは。私は高級腕時計のご相談をサポートするホログラムAIです。',
      intent: 'greeting',
      expression: 'soft_smile',
      risk_level: 'low'
    },
    {
      display_text: 'ロレックス、パテック フィリップ、オーデマ ピゲなど、ブランドや型番の特徴をご案内できます。',
      speak_text: 'ロレックス、パテック フィリップ、オーデマ ピゲなど、ブランドや型番の特徴をご案内できます。',
      intent: 'watch_guidance',
      expression: 'neutral',
      risk_level: 'low'
    },
    {
      display_text: '型番や専門用語は辞書に登録しておくことで、音声認識やAI回答の精度を上げられます。',
      speak_text: '型番や専門用語は辞書に登録しておくことで、音声認識やAI回答の精度を上げられます。',
      intent: 'dictionary_demo',
      expression: 'thinking',
      risk_level: 'low'
    },
    {
      display_text: '在庫や買取価格は状態、付属品、市況によって変わります。最終確認はスタッフへ引き継ぎます。',
      speak_text: '在庫や買取価格は状態、付属品、市況によって変わります。最終確認はスタッフへ引き継ぎます。',
      intent: 'safe_handoff',
      expression: 'serious',
      risk_level: 'medium'
    }
  ];

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Canvas 2D hologram fallback');
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const state = {
    active: false,
    sequenceRunning: false,
    lineIndex: 0,
    mouth: 0,
    targetMouth: 0,
    talkIntensity: 0,
    expression: 'neutral',
    intent: 'idle',
    currentText: '',
    depthScale: 1,
    glowScale: 1,
    noiseScale: 0.7,
    token: 0,
    timers: [],
    particles: createParticles(150)
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let startTime = performance.now();

  function createParticles(count) {
    return Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 0.6 + Math.random() * 2.2,
      speed: 0.02 + Math.random() * 0.07,
      alpha: 0.15 + Math.random() * 0.55
    }));
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setStatus(status, intent = state.intent, expression = state.expression) {
    state.intent = intent;
    state.expression = expression;
    if (statusText) statusText.textContent = status;
    if (intentText) intentText.textContent = intent;
    if (expressionText) expressionText.textContent = expression;
  }

  function setJsonPreview(line) {
    if (!jsonPreview) return;
    jsonPreview.textContent = JSON.stringify({
      display_text: line.display_text,
      speak_text: line.speak_text,
      intent: line.intent,
      expression: line.expression,
      visual_effect: 'canvas2d_hologram_fallback',
      risk_level: line.risk_level || 'low',
      need_human_check: line.risk_level === 'medium'
    }, null, 2);
  }

  function clearTimers() {
    for (const timer of state.timers) window.clearTimeout(timer);
    state.timers = [];
  }

  function wait(ms) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, ms);
      state.timers.push(timer);
    });
  }

  function typeCaption(text, token) {
    if (!captionText) return;
    captionText.textContent = '';
    const chars = Array.from(text);
    chars.forEach((_, index) => {
      const timer = window.setTimeout(() => {
        if (token !== state.token) return;
        captionText.textContent = chars.slice(0, index + 1).join('');
      }, index * 24);
      state.timers.push(timer);
    });
  }

  function speakNative(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.96;
    utterance.pitch = 1.02;
    utterance.volume = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  async function playLine(line) {
    const token = ++state.token;
    clearTimers();
    state.active = true;
    state.currentText = line.speak_text;
    state.targetMouth = 0.55;
    state.talkIntensity = 1;
    setStatus('speaking', line.intent, line.expression || 'neutral');
    setJsonPreview(line);
    typeCaption(line.display_text, token);
    speakNative(line.speak_text);

    const chars = Math.max(22, Array.from(line.speak_text).length);
    const duration = clamp(chars * 95, 1800, 7600);
    const mouthTimer = window.setInterval(() => {
      if (token !== state.token) {
        window.clearInterval(mouthTimer);
        return;
      }
      state.targetMouth = 0.20 + Math.random() * 0.72;
    }, 90);
    state.timers.push(mouthTimer);

    await wait(duration);
    if (token !== state.token) return;
    window.clearInterval(mouthTimer);
    state.targetMouth = 0;
    state.talkIntensity = 0;
    state.active = false;
    setStatus('standby', 'idle', 'neutral');
  }

  async function playSequence() {
    if (state.sequenceRunning) return;
    state.sequenceRunning = true;
    for (let i = 0; i < mockLines.length; i += 1) {
      state.lineIndex = i;
      await playLine(mockLines[i]);
      await wait(360);
      if (!state.sequenceRunning) break;
    }
    state.sequenceRunning = false;
  }

  function playOne() {
    state.sequenceRunning = false;
    const line = mockLines[state.lineIndex % mockLines.length];
    state.lineIndex += 1;
    playLine(line);
  }

  function playCustom() {
    state.sequenceRunning = false;
    const text = customText?.value?.trim() || 'こんにちは。ホログラムAIです。';
    playLine({
      display_text: text,
      speak_text: text,
      intent: 'custom_demo',
      expression: 'soft_smile',
      risk_level: 'low'
    });
  }

  function stopAll() {
    state.sequenceRunning = false;
    state.active = false;
    state.token += 1;
    state.targetMouth = 0;
    state.talkIntensity = 0;
    clearTimers();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (captionText) captionText.textContent = '停止しました。';
    setStatus('standby', 'idle', 'neutral');
  }

  function facePath(cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 1.54 * s);
    ctx.bezierCurveTo(cx + 0.43 * s, cy - 1.45 * s, cx + 0.66 * s, cy - 1.08 * s, cx + 0.71 * s, cy - 0.64 * s);
    ctx.bezierCurveTo(cx + 0.81 * s, cy - 0.08 * s, cx + 0.61 * s, cy + 0.53 * s, cx + 0.39 * s, cy + 0.98 * s);
    ctx.bezierCurveTo(cx + 0.23 * s, cy + 1.30 * s, cx + 0.10 * s, cy + 1.50 * s, cx, cy + 1.59 * s);
    ctx.bezierCurveTo(cx - 0.10 * s, cy + 1.50 * s, cx - 0.23 * s, cy + 1.30 * s, cx - 0.39 * s, cy + 0.98 * s);
    ctx.bezierCurveTo(cx - 0.61 * s, cy + 0.53 * s, cx - 0.81 * s, cy - 0.08 * s, cx - 0.71 * s, cy - 0.64 * s);
    ctx.bezierCurveTo(cx - 0.66 * s, cy - 1.08 * s, cx - 0.43 * s, cy - 1.45 * s, cx, cy - 1.54 * s);
    ctx.closePath();
  }

  function drawParticles(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const p of state.particles) {
      p.y -= p.speed * 0.0018;
      if (p.y < -0.03) {
        p.y = 1.03;
        p.x = Math.random();
      }
      const twinkle = 0.45 + 0.55 * Math.sin(t * 0.0017 + p.x * 23.1 + p.y * 17.9);
      ctx.globalAlpha = p.alpha * twinkle;
      ctx.fillStyle = '#8ff6ff';
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBase(cx, cy, s, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const pulse = 0.65 + state.talkIntensity * 0.35 + Math.sin(t * 0.003) * 0.05;
    ctx.shadowBlur = 34 * state.glowScale;
    ctx.shadowColor = 'rgba(143,246,255,0.8)';
    ctx.strokeStyle = `rgba(143,246,255,${0.28 * pulse})`;
    ctx.fillStyle = `rgba(143,246,255,${0.08 * pulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1.98 * s, 0.58 * s, 0.075 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const gradient = ctx.createLinearGradient(cx, cy + 1.82 * s, cx, cy + 2.30 * s);
    gradient.addColorStop(0, `rgba(143,246,255,${0.18 * pulse})`);
    gradient.addColorStop(1, 'rgba(143,246,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(cx - 0.20 * s, cy + 2.00 * s);
    ctx.lineTo(cx + 0.20 * s, cy + 2.00 * s);
    ctx.lineTo(cx + 0.34 * s, cy + 2.34 * s);
    ctx.lineTo(cx - 0.34 * s, cy + 2.34 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFaceGrid(cx, cy, s, t) {
    ctx.save();
    facePath(cx, cy, s);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = 0.75;

    for (let i = -52; i <= 52; i += 1) {
      const y = cy + (i / 52) * 1.52 * s;
      const alpha = 0.035 + (i % 4 === 0 ? 0.045 : 0.0);
      ctx.strokeStyle = `rgba(159,248,255,${alpha * state.glowScale})`;
      ctx.beginPath();
      ctx.moveTo(cx - 0.86 * s, y + Math.sin(t * 0.002 + i) * 0.8);
      ctx.lineTo(cx + 0.86 * s, y + Math.cos(t * 0.002 + i) * 0.8);
      ctx.stroke();
    }

    for (let i = -4; i <= 4; i += 1) {
      const x = cx + i * 0.17 * s;
      ctx.strokeStyle = `rgba(159,248,255,${0.035 * state.glowScale})`;
      ctx.beginPath();
      ctx.ellipse(x, cy + 0.05 * s, (0.16 + Math.abs(i) * 0.055) * s, 1.52 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const scanY = cy - 1.6 * s + ((t * 0.07) % (3.2 * s));
    const g = ctx.createLinearGradient(cx, scanY - 22, cx, scanY + 22);
    g.addColorStop(0, 'rgba(143,246,255,0)');
    g.addColorStop(0.5, `rgba(143,246,255,${0.15 * state.glowScale})`);
    g.addColorStop(1, 'rgba(143,246,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 0.9 * s, scanY - 22, 1.8 * s, 44);
    ctx.restore();
  }

  function drawFacialFeatures(cx, cy, s, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 20 * state.glowScale;
    ctx.shadowColor = 'rgba(143,246,255,0.95)';
    ctx.strokeStyle = `rgba(220,255,255,${0.54 * state.glowScale})`;
    ctx.fillStyle = `rgba(215,255,255,${0.30 * state.glowScale})`;

    const browLift = state.expression === 'thinking' ? 0.07 : 0;
    const serious = state.expression === 'serious' ? 1 : 0;
    const smile = state.expression === 'soft_smile' ? 1 : 0;

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 0.43 * s, cy - (0.51 + browLift) * s);
    ctx.lineTo(cx - 0.13 * s, cy - (0.58 - serious * 0.05) * s);
    ctx.moveTo(cx + 0.13 * s, cy - (0.58 - serious * 0.05) * s);
    ctx.lineTo(cx + 0.43 * s, cy - (0.51 + browLift) * s);
    ctx.stroke();

    ctx.lineWidth = 1.4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * 0.29 * s, cy - 0.30 * s, 0.16 * s, 0.047 * s, 0, Math.PI * 0.04, Math.PI * 0.96);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + side * 0.29 * s, cy - 0.30 * s, 0.018 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    const nosePulse = 0.55 + Math.sin(t * 0.003) * 0.04;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(220,255,255,${nosePulse * state.glowScale})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.29 * s);
    ctx.bezierCurveTo(cx + 0.04 * s, cy - 0.12 * s, cx + 0.09 * s, cy + 0.03 * s, cx + 0.02 * s, cy + 0.18 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 0.20 * s, 0.17 * s, 0.055 * s, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(220,255,255,${0.42 * state.glowScale})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx - 0.46 * s, cy - 0.03 * s);
    ctx.quadraticCurveTo(cx - 0.31 * s, cy + 0.03 * s, cx - 0.19 * s, cy + 0.12 * s);
    ctx.moveTo(cx + 0.46 * s, cy - 0.03 * s);
    ctx.quadraticCurveTo(cx + 0.31 * s, cy + 0.03 * s, cx + 0.19 * s, cy + 0.12 * s);
    ctx.stroke();

    const mouth = state.mouth;
    const mouthW = (0.29 + smile * 0.05) * s;
    const mouthY = cy + 0.58 * s;
    const mouthH = (0.018 + mouth * 0.13) * s;
    ctx.strokeStyle = `rgba(235,255,255,${0.70 * state.glowScale})`;
    ctx.fillStyle = `rgba(143,246,255,${(0.14 + mouth * 0.14) * state.glowScale})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (mouth > 0.12) {
      ctx.ellipse(cx, mouthY, mouthW, mouthH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.moveTo(cx - mouthW, mouthY);
      ctx.quadraticCurveTo(cx, mouthY + smile * 0.055 * s, cx + mouthW, mouthY);
      ctx.stroke();
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(220,255,255,${0.30 * state.glowScale})`;
    ctx.beginPath();
    ctx.moveTo(cx - 0.22 * s, cy + 0.80 * s);
    ctx.quadraticCurveTo(cx, cy + 0.88 * s, cx + 0.22 * s, cy + 0.80 * s);
    ctx.stroke();

    ctx.restore();
  }

  function drawFace(cx, cy, s, t) {
    const pulse = 0.72 + state.talkIntensity * 0.26 + Math.sin(t * 0.0025) * 0.035;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 5; i >= 1; i -= 1) {
      ctx.save();
      ctx.shadowBlur = (22 + i * 20) * state.glowScale;
      ctx.shadowColor = `rgba(100,225,255,${0.12 * pulse})`;
      facePath(cx, cy, s * (1 + i * 0.006));
      ctx.fillStyle = `rgba(95,218,255,${0.020 * i * pulse})`;
      ctx.fill();
      ctx.restore();
    }

    facePath(cx, cy, s);
    const grad = ctx.createRadialGradient(cx - 0.05 * s, cy - 0.38 * s, 0.04 * s, cx, cy, 1.35 * s);
    grad.addColorStop(0, `rgba(214,255,255,${0.30 * pulse})`);
    grad.addColorStop(0.36, `rgba(120,232,255,${0.16 * pulse})`);
    grad.addColorStop(1, `rgba(80,190,235,${0.045 * pulse})`);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `rgba(178,251,255,${0.26 * state.glowScale})`;
    ctx.stroke();

    drawFaceGrid(cx, cy, s, t);
    drawFacialFeatures(cx, cy, s, t);
    ctx.restore();
  }

  function render(now) {
    const t = now - startTime;
    ctx.clearRect(0, 0, width, height);

    state.mouth += (state.targetMouth - state.mouth) * 0.22;
    state.talkIntensity += ((state.active ? 1 : 0) - state.talkIntensity) * 0.08;

    const bg = ctx.createRadialGradient(width * 0.5, height * 0.37, 10, width * 0.5, height * 0.5, Math.max(width, height) * 0.65);
    bg.addColorStop(0, `rgba(31,124,155,${0.12 * state.glowScale})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    drawParticles(t);

    const cx = width * 0.5 + Math.sin(t * 0.0012) * 5 * state.noiseScale;
    const cy = height * 0.39 + Math.cos(t * 0.0015) * 3 * state.noiseScale;
    const s = Math.min(width, height) * 0.185 * state.depthScale;

    drawBase(cx, cy, s, t);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(143,246,255,${0.065 * state.glowScale})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 0.10 * s, 1.15 * s, 0.18 * s, Math.sin(t * 0.0006) * 0.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 0.42 * s, 1.05 * s, 0.20 * s, -Math.sin(t * 0.0007) * 0.10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawFace(cx, cy, s, t);

    requestAnimationFrame(render);
  }

  playBtn?.addEventListener('click', playSequence);
  oneBtn?.addEventListener('click', playOne);
  customBtn?.addEventListener('click', playCustom);
  stopBtn?.addEventListener('click', stopAll);
  depthRange?.addEventListener('input', () => { state.depthScale = Number(depthRange.value); });
  glowRange?.addEventListener('input', () => { state.glowScale = Number(glowRange.value); });
  noiseRange?.addEventListener('input', () => { state.noiseScale = Number(noiseRange.value); });

  resize();
  window.addEventListener('resize', resize);
  setStatus('standby', 'idle', 'canvas2d_fallback');
  if (captionText) {
    captionText.textContent = 'WebGLが使えないため、Canvas 2Dフォールバックで起動しています。会話ボタンはこのまま動きます。';
  }
  if (jsonPreview) {
    jsonPreview.textContent = JSON.stringify({
      mode: 'canvas2d_fallback',
      reason: options.reason || 'WebGL unavailable',
      note: '本格的なThree.js表示にはブラウザ側でWebGLを有効化してください。'
    }, null, 2);
  }
  requestAnimationFrame(render);
}
