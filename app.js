const talkButton = document.getElementById('talkButton');
const stopButton = document.getElementById('stopButton');
const voiceToggle = document.getElementById('voiceToggle');
const caption = document.getElementById('caption');
const statusText = document.getElementById('statusText');
const intentText = document.getElementById('intentText');
const orb = document.getElementById('orb');
const mouth = document.getElementById('mouth');
const face = document.getElementById('face');
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

const lines = [
  {
    text: 'こんにちは。私は高級腕時計のご相談をサポートするホログラムAIです。',
    intent: 'greeting',
    expression: 'expression-smile'
  },
  {
    text: 'たとえば、ロレックスのデイトナ、パテック フィリップのノーチラス、買取の流れなどをご案内できます。',
    intent: 'watch_guidance',
    expression: 'expression-neutral'
  },
  {
    text: '型番や専門用語は辞書に登録しておくことで、会話AIや音声合成の精度を上げられます。',
    intent: 'dictionary_demo',
    expression: 'expression-thinking'
  },
  {
    text: 'なお、在庫や買取価格は状態や市況によって変わるため、最終確認はスタッフへ引き継ぎます。',
    intent: 'safe_handoff',
    expression: 'expression-serious'
  }
];

let playing = false;
let mouthTimer = null;
let typeTimer = null;
let currentUtterance = null;
let activeLineIndex = 0;
let activeText = '';
let charIndex = 0;
let particles = [];

function setStatus(status, intent = 'idle') {
  statusText.textContent = status;
  intentText.textContent = intent;
}

function setExpression(expressionClass) {
  face.classList.remove('expression-neutral', 'expression-smile', 'expression-serious', 'expression-thinking');
  face.classList.add(expressionClass || 'expression-neutral');
}

function setMouth(shape) {
  mouth.classList.remove('mouth-rest', 'mouth-a', 'mouth-i', 'mouth-u', 'mouth-e', 'mouth-o');
  mouth.classList.add(shape);
}

function kanaToMouthShape(char) {
  if ('あかさたなはまやらわがざだばぱぁゃゎアカサタナハマヤラワガザダバパァャヮ'.includes(char)) return 'mouth-a';
  if ('いきしちにひみりぎじぢびぴぃイキシチニヒミリギジヂビピィ'.includes(char)) return 'mouth-i';
  if ('うくすつぬふむゆるぐずづぶぷぅゅウクスツヌフムユルグズヅブプゥュ'.includes(char)) return 'mouth-u';
  if ('えけせてねへめれげぜでべぺぇエケセテネヘメレゲゼデベペェ'.includes(char)) return 'mouth-e';
  if ('おこそとのほもよろをごぞどぼぽぉょオコソトノホモヨロヲゴゾドボポォョ'.includes(char)) return 'mouth-o';
  return ['mouth-a', 'mouth-i', 'mouth-u', 'mouth-e', 'mouth-o'][Math.floor(Math.random() * 5)];
}

function stopAll() {
  playing = false;
  clearInterval(mouthTimer);
  clearInterval(typeTimer);
  mouthTimer = null;
  typeTimer = null;
  charIndex = 0;
  activeText = '';
  orb.classList.remove('speaking');
  setMouth('mouth-rest');
  setExpression('expression-neutral');
  setStatus('standby', 'idle');

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  currentUtterance = null;
}

function typeCaption(text, onDone) {
  clearInterval(typeTimer);
  caption.textContent = '「」';
  charIndex = 0;

  typeTimer = setInterval(() => {
    if (!playing) return;

    const visible = text.slice(0, charIndex);
    caption.textContent = `「${visible}」`;

    if (charIndex >= text.length) {
      clearInterval(typeTimer);
      typeTimer = null;
      if (onDone) onDone();
    }

    charIndex += 1;
  }, 42);
}

function startMouthMock(text) {
  clearInterval(mouthTimer);
  activeText = text;
  let i = 0;

  mouthTimer = setInterval(() => {
    if (!playing) return;

    const char = activeText[i % activeText.length];
    if (/[、。,.!?！？\s]/.test(char)) {
      setMouth('mouth-rest');
    } else {
      setMouth(kanaToMouthShape(char));
    }
    i += 1;
  }, 95);
}

function speak(text, onDone) {
  if (!voiceToggle.checked || !('speechSynthesis' in window)) {
    const fallbackDuration = Math.max(2400, text.length * 110);
    setTimeout(onDone, fallbackDuration);
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.95;
  utterance.pitch = 1.03;
  utterance.volume = 1;
  utterance.onend = onDone;
  utterance.onerror = onDone;
  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function playLine() {
  if (!playing) return;

  const line = lines[activeLineIndex % lines.length];
  activeLineIndex += 1;

  setStatus('speaking', line.intent);
  setExpression(line.expression);
  orb.classList.add('speaking');
  startMouthMock(line.text);
  typeCaption(line.text);

  speak(line.text, () => {
    clearInterval(mouthTimer);
    mouthTimer = null;
    setMouth('mouth-rest');
    orb.classList.remove('speaking');
    setStatus('thinking', 'next_response');

    if (!playing) return;

    setTimeout(() => {
      if (!playing) return;
      playLine();
    }, 850);
  });
}

function startMock() {
  stopAll();
  playing = true;
  activeLineIndex = 0;
  setStatus('booting', 'system_start');
  caption.textContent = '「ホログラムシステムを起動しています。」';

  setTimeout(() => {
    if (!playing) return;
    playLine();
  }, 650);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * window.devicePixelRatio);
  canvas.height = Math.floor(rect.height * window.devicePixelRatio);
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}

function initParticles() {
  const rect = canvas.getBoundingClientRect();
  particles = Array.from({ length: 95 }, () => ({
    x: Math.random() * rect.width,
    y: Math.random() * rect.height,
    r: Math.random() * 1.8 + 0.4,
    s: Math.random() * 0.55 + 0.12,
    a: Math.random() * 0.55 + 0.1
  }));
}

function drawParticles() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  particles.forEach((p) => {
    p.y -= p.s;
    p.x += Math.sin((p.y + p.r) * 0.01) * 0.22;

    if (p.y < -10) {
      p.y = rect.height + 10;
      p.x = Math.random() * rect.width;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(160, 244, 255, ${p.a})`;
    ctx.fill();
  });

  requestAnimationFrame(drawParticles);
}

talkButton.addEventListener('click', startMock);
stopButton.addEventListener('click', () => {
  stopAll();
  caption.textContent = '「ご用件をお聞かせください。」';
});

window.addEventListener('resize', () => {
  resizeCanvas();
  initParticles();
});

resizeCanvas();
initParticles();
drawParticles();
setStatus('standby', 'idle');
