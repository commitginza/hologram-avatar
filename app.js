import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CONFIG = window.HOLOGRAM_CONFIG || {};
const SESSION_URL = CONFIG.SESSION_URL || CONFIG.REALTIME_SESSION_URL || CONFIG.API_URL || '';
const MODEL_URL = CONFIG.MODEL_URL || 'https://watchimg.s3.ap-northeast-1.amazonaws.com/glb/avatar-v1.glb';

const AVATAR_VIEW = {
  yawDeg: -90,
  x: 0,
  y: 1.0,
  z: -1.2,
  cameraZ: 7.8,
  targetHeight: 6.25,
  idleYawDeg: 1.0,
  floatAmount: 0.026
};

const LIVE_CONFIG = {
  greetingCooldownMs: 90_000,
  visionIntervalMs: 650,
  presenceHitFrames: 2,
  presenceLostFrames: 8,
  fallbackPresenceAfterMs: 2200
};

const stage = document.getElementById('stage');
const cameraVideo = document.getElementById('cameraVideo');
const visionCanvas = document.getElementById('visionCanvas');
const startButton = document.getElementById('startButton');
const permissionOverlay = document.getElementById('permissionOverlay');
const statusEl = document.getElementById('status');
const presenceStatusEl = document.getElementById('presenceStatus');
const subtitleEl = document.getElementById('subtitle');
const transcriptEl = document.getElementById('transcript');

if (!stage) throw new Error('HTMLに #stage がありません。public/index.html も最新版に差し替えてください。');

const state = {
  started: false,
  connecting: false,
  talking: false,
  talkLevel: 0,
  captionText: '',
  captionIndex: 0,
  captionTimer: 0,
  captionInterval: 26,
  sessionId: crypto.randomUUID?.() || String(Date.now()),

  pc: null,
  dc: null,
  micStream: null,
  cameraStream: null,
  remoteAudio: null,

  faceDetector: null,
  faceDetectorAvailable: false,
  lastVisionCheckAt: 0,
  visionStartedAt: 0,
  presence: false,
  presenceHits: 0,
  presenceLost: 0,
  lastGreetingAt: 0
};


function hidePermissionOverlay() {
  if (permissionOverlay) permissionOverlay.classList.add('hidden');
}

function showPermissionOverlay() {
  if (permissionOverlay) permissionOverlay.classList.remove('hidden');
}

function setStartButtonState({ disabled = false, text = '' } = {}) {
  if (!startButton) return;
  startButton.disabled = disabled;
  if (text) startButton.textContent = text;
}

function timeoutPromise(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${label} が ${Math.round(ms / 1000)}秒以内に完了しませんでした。API Gateway / Lambda / OpenAI Realtime接続を確認してください。`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020812, 0.055);

const camera = new THREE.PerspectiveCamera(32, stage.clientWidth / stage.clientHeight, 0.1, 100);
camera.position.set(0, 0.35, AVATAR_VIEW.cameraZ);

const root = new THREE.Group();
scene.add(root);

const avatarGroup = new THREE.Group();
avatarGroup.position.set(AVATAR_VIEW.x, AVATAR_VIEW.y, AVATAR_VIEW.z);
avatarGroup.rotation.y = THREE.MathUtils.degToRad(AVATAR_VIEW.yawDeg);
root.add(avatarGroup);

const clock = new THREE.Clock();
const avatarMaterials = [];
let avatarRoot = null;
let baseDisc = null;
let baseCone = null;

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(-1.2, 2.2, 3.4);
scene.add(key);
const rim = new THREE.DirectionalLight(0xd7f6ff, 1.5);
rim.position.set(0, 1.3, -2.2);
scene.add(rim);

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function setPresenceStatus(text) {
  if (presenceStatusEl) presenceStatusEl.textContent = text;
}

function setSubtitle(text) {
  if (subtitleEl) subtitleEl.textContent = text;
}

function setTranscript(text) {
  if (transcriptEl) transcriptEl.textContent = text ? `認識: ${text}` : '';
}

function startCaption(text, durationMs = 3000) {
  state.captionText = String(text || '');
  state.captionIndex = 0;
  state.captionTimer = 0;
  state.captionInterval = Math.max(16, durationMs / Math.max(state.captionText.length, 1));
  setSubtitle('');
}

function updateCaption(deltaMs) {
  if (!state.captionText || state.captionIndex >= state.captionText.length) return;
  state.captionTimer += deltaMs;
  while (state.captionTimer >= state.captionInterval && state.captionIndex < state.captionText.length) {
    state.captionTimer -= state.captionInterval;
    state.captionIndex += 1;
    setSubtitle(state.captionText.slice(0, state.captionIndex));
  }
}

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener('resize', resize);

function buildHologramMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xeef6fb,
    roughness: 0.42,
    metalness: 0.0,
    transparent: true,
    opacity: 0.58,
    emissive: 0xeaf8ff,
    emissiveIntensity: 0.018,
    depthWrite: false,
    side: THREE.FrontSide
  });
}

function applyHologramMaterial(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    const mat = buildHologramMaterial();
    child.material = mat;
    child.frustumCulled = false;
    child.renderOrder = 1;
    avatarMaterials.push(mat);
  });
}

function fitModel(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = AVATAR_VIEW.targetHeight / Math.max(size.y, 0.0001);
  object.scale.setScalar(scale);
  object.position.set(-center.x * scale, -center.y * scale - 0.35, -center.z * scale);
}

async function loadAvatar() {
  setStatus('loading');
  const loader = new GLTFLoader();
  loader.setCrossOrigin('anonymous');
  const gltf = await loader.loadAsync(MODEL_URL);
  avatarRoot = gltf.scene;
  console.group('[GLB structure]');
  avatarRoot.traverse((child) => {
    if (!child.isMesh) return;
    console.log({
      name: child.name,
      vertexCount: child.geometry?.attributes?.position?.count,
      morphTargetDictionary: child.morphTargetDictionary || null,
      material: child.material?.name || null
    });
  });
  console.groupEnd();
  applyHologramMaterial(avatarRoot);
  fitModel(avatarRoot);
  avatarGroup.add(avatarRoot);
  setStatus('standby');
}

function createBackgroundParticles(count = 180) {
  const positions = [];
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    positions.push((Math.random() - 0.5) * 9.5, (Math.random() - 0.5) * 6.0, -2.0 - Math.random() * 6.0);
    sizes.push(0.4 + Math.random() * 0.8);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aSize;
      uniform float uTime;
      varying float vFade;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.24 + position.x * 1.4) * 0.024;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (16.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vFade = 0.30 + 0.30 * sin(uTime + position.x * 3.7 + position.y * 4.2);
      }
    `,
    fragmentShader: `
      varying float vFade;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float alpha = smoothstep(0.5, 0.0, d) * vFade;
        gl_FragColor = vec4(0.82, 0.94, 1.0, alpha * 0.7);
      }
    `
  });
  const points = new THREE.Points(geometry, material);
  points.userData.material = material;
  scene.add(points);
  return points;
}
const particles = createBackgroundParticles();

function createProjectionBase() {
  const group = new THREE.Group();
  group.position.set(0, -2.55, 0);
  root.add(group);
  baseDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.018, 96, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false })
  );
  baseCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.36, 0.82, 64, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide })
  );
  baseCone.position.y = 0.40;
  group.add(baseDisc, baseCone);
}
createProjectionBase();

async function setupFaceDetector() {
  if ('FaceDetector' in window) {
    try {
      state.faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      state.faceDetectorAvailable = true;
      console.log('[presence] FaceDetector enabled');
      return;
    } catch (error) {
      console.warn('[presence] FaceDetector init failed', error);
    }
  }
  state.faceDetectorAvailable = false;
  console.warn('[presence] FaceDetector unavailable. Fallback presence will be used.');
}

async function detectPresence() {
  if (!cameraVideo || !cameraVideo.videoWidth || !cameraVideo.videoHeight) return false;

  if (state.faceDetectorAvailable && state.faceDetector) {
    try {
      const faces = await state.faceDetector.detect(cameraVideo);
      return faces.length > 0;
    } catch (error) {
      console.warn('[presence] FaceDetector failed', error);
      state.faceDetectorAvailable = false;
    }
  }

  // Fallback: FaceDetector非対応ブラウザでは、開始後しばらくしたら「人がいる」とみなす。
  return performance.now() - state.visionStartedAt > LIVE_CONFIG.fallbackPresenceAfterMs;
}

async function updatePresence() {
  if (!state.started) return;
  const now = performance.now();
  if (now - state.lastVisionCheckAt < LIVE_CONFIG.visionIntervalMs) return;
  state.lastVisionCheckAt = now;

  const hit = await detectPresence();
  if (hit) {
    state.presenceHits += 1;
    state.presenceLost = 0;
  } else {
    state.presenceLost += 1;
    state.presenceHits = 0;
  }

  if (!state.presence && state.presenceHits >= LIVE_CONFIG.presenceHitFrames) {
    state.presence = true;
    setPresenceStatus('detected');
    maybeSendGreeting();
  }

  if (state.presence && state.presenceLost >= LIVE_CONFIG.presenceLostFrames) {
    state.presence = false;
    setPresenceStatus('standby');
  }
}

function sendRealtimeEvent(event) {
  if (!state.dc || state.dc.readyState !== 'open') {
    console.warn('[realtime] data channel not open', event);
    return;
  }
  state.dc.send(JSON.stringify(event));
}

function sendUserText(text) {
  sendRealtimeEvent({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text }]
    }
  });
  sendRealtimeEvent({ type: 'response.create' });
}

function maybeSendGreeting() {
  const now = Date.now();
  if (now - state.lastGreetingAt < LIVE_CONFIG.greetingCooldownMs) return;
  if (!state.dc || state.dc.readyState !== 'open') return;
  state.lastGreetingAt = now;
  sendUserText('お客様が視界に入りました。コミット銀座のAIコンシェルジュとして、短く上品に挨拶してください。');
}

function appendSubtitleDelta(delta) {
  state.captionText += delta;
  setSubtitle(state.captionText);
}

function handleRealtimeEvent(event) {
  console.debug('[realtime event]', event);
  const type = event.type || '';

  if (type === 'error') {
    setStatus('error');
    setSubtitle(`Realtime API error: ${event.error?.message || JSON.stringify(event.error || event)}`);
    return;
  }

  if (type.includes('input_audio') && type.includes('speech_started')) {
    setStatus('listening');
    setTranscript('聞き取り中…');
    return;
  }

  if (type.includes('input_audio') && type.includes('speech_stopped')) {
    setStatus('thinking');
    return;
  }

  if (type.includes('input_audio') && type.includes('transcription') && type.includes('completed')) {
    const text = event.transcript || event.text || event.item?.content?.[0]?.transcript || '';
    if (text) setTranscript(text);
    return;
  }

  // GA / preview系のイベント名差異を広めに拾う
  if (type.includes('response') && type.includes('transcript') && type.endsWith('.delta')) {
    const delta = event.delta || event.text || '';
    if (delta) {
      state.talking = true;
      setStatus('speaking');
      appendSubtitleDelta(delta);
    }
    return;
  }

  if (type.includes('response') && type.includes('output_text') && type.endsWith('.delta')) {
    const delta = event.delta || event.text || '';
    if (delta) appendSubtitleDelta(delta);
    return;
  }

  if (type === 'response.created' || type === 'response.output_item.added') {
    state.captionText = '';
    setSubtitle('');
    state.talking = true;
    setStatus('speaking');
    return;
  }

  if (type === 'response.done' || type === 'response.completed') {
    state.talking = false;
    setStatus('watching');
    return;
  }
}

async function startRealtimeSession(micStream) {
  if (!SESSION_URL || SESSION_URL.includes('YOUR_API_ID')) {
    throw new Error('public/config.js の SESSION_URL に API Gateway の /session URL を設定してください。');
  }

  const pc = new RTCPeerConnection();
  state.pc = pc;

  const remoteAudio = document.createElement('audio');
  remoteAudio.autoplay = true;
  remoteAudio.playsInline = true;
  remoteAudio.controls = false;
  state.remoteAudio = remoteAudio;

  pc.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play().catch((error) => {
      console.warn('[remote audio play blocked]', error);
      setSubtitle('音声再生がブロックされました。画面を一度タップしてください。');
    });
  };

  for (const track of micStream.getAudioTracks()) {
    pc.addTrack(track, micStream);
  }

  const dc = pc.createDataChannel('oai-events');
  state.dc = dc;

  dc.addEventListener('open', () => {
    console.log('[realtime] data channel open');
    setStatus('watching');
    setSubtitle('人を検知すると自動で話しかけます。話しかけても会話できます。');
    maybeSendGreeting();
  });

  dc.addEventListener('message', (message) => {
    try {
      handleRealtimeEvent(JSON.parse(message.data));
    } catch (error) {
      console.warn('[realtime] failed to parse event', message.data, error);
    }
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // ICE候補収集を少し待つ。環境により即時でも動くが、待った方が安定します。
  await new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const timer = setTimeout(resolve, 1600);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  const sdp = pc.localDescription?.sdp;
  if (!sdp) throw new Error('WebRTC offer SDPを作成できませんでした。');

  const response = await fetch(SESSION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: sdp
  });

  const answerSdp = await response.text();
  if (!response.ok) {
    throw new Error(answerSdp || `Realtime session API error: ${response.status}`);
  }

  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
}

async function unlockAudioForMobile() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') await ctx.resume();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    window.setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch (error) {
    console.warn('[audio unlock failed]', error);
  }
}

async function startLiveMode() {
  if (state.connecting || state.started) return;

  state.connecting = true;
  setStartButtonState({ disabled: true, text: '起動中…' });
  setStatus('starting');
  setSubtitle('カメラとマイクを開始しています…');

  try {
    await unlockAudioForMobile();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    if (!audioTracks.length) {
      throw new Error('マイクの音声トラックを取得できませんでした。ブラウザのマイク許可を確認してください。');
    }

    if (!videoTracks.length) {
      throw new Error('カメラの映像トラックを取得できませんでした。ブラウザのカメラ許可を確認してください。');
    }

    state.cameraStream = new MediaStream(videoTracks);
    state.micStream = new MediaStream(audioTracks);

    if (cameraVideo) {
      cameraVideo.srcObject = state.cameraStream;
      cameraVideo.muted = true;
      cameraVideo.playsInline = true;
      await cameraVideo.play();
    }

    // ここでカメラ・マイク許可は完了しているので、先にモーダルを閉じます。
    // Realtime API接続に失敗しても、画面上にエラーを表示して切り分けできるようにします。
    state.started = true;
    state.connecting = false;
    state.visionStartedAt = performance.now();
    hidePermissionOverlay();
    setStartButtonState({ disabled: false, text: 'カメラ・マイクを許可して開始' });
    setStatus('connecting');
    setPresenceStatus('checking');
    setSubtitle('カメラとマイクを開始しました。Realtime APIへ接続しています…');

    await setupFaceDetector();
    await timeoutPromise(startRealtimeSession(state.micStream), 25000, 'Realtime API接続');

    setStatus('watching');
    setPresenceStatus('watching');
    setSubtitle('人を検知すると自動で話しかけます。話しかけても会話できます。');
  } catch (error) {
    console.error('[start live failed]', error);

    state.connecting = false;
    setStartButtonState({ disabled: false, text: 'もう一度開始する' });
    setStatus('error');

    const message = error?.message || String(error);
    setSubtitle(`ライブ会話を開始できません: ${message}`);

    // カメラ・マイク取得前の失敗なら、許可用モーダルを残して再試行できるようにします。
    // 取得後のRealtime接続失敗なら、モーダルは閉じたままエラーを表示します。
    if (!state.micStream && !state.cameraStream) {
      state.started = false;
      showPermissionOverlay();
    }
  }
}

if (startButton) {
  startButton.addEventListener('click', startLiveMode);
} else {
  console.error('HTMLに #startButton がありません。public/index.html も最新版に差し替えてください。');
  setSubtitle('HTMLに開始ボタンがありません。index.htmlを最新版に差し替えてください。');
}

stage.addEventListener('pointerdown', () => {
  if (state.remoteAudio) {
    state.remoteAudio.play().catch(() => {});
  }
});

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  particles.userData.material.uniforms.uTime.value = elapsed;
  updateCaption(delta * 1000);
  updatePresence();

  const targetTalk = state.talking ? 1 : 0;
  state.talkLevel += (targetTalk - state.talkLevel) * Math.min(1, delta * 4.5);

  if (avatarRoot) {
    avatarGroup.position.set(
      AVATAR_VIEW.x,
      AVATAR_VIEW.y + Math.sin(elapsed * 0.72) * AVATAR_VIEW.floatAmount,
      AVATAR_VIEW.z
    );
    avatarGroup.rotation.y =
      THREE.MathUtils.degToRad(AVATAR_VIEW.yawDeg) +
      Math.sin(elapsed * 0.18) * THREE.MathUtils.degToRad(AVATAR_VIEW.idleYawDeg);
  }

  for (const mat of avatarMaterials) {
    mat.opacity = 0.56 + state.talkLevel * 0.14 + Math.sin(elapsed * 5.5) * state.talkLevel * 0.02;
    mat.emissiveIntensity = 0.016 + state.talkLevel * 0.08;
  }

  if (baseDisc && baseCone) {
    baseDisc.scale.setScalar(1 + Math.sin(elapsed * 1.7) * 0.035 + state.talkLevel * 0.08);
    baseCone.material.opacity = 0.045 + state.talkLevel * 0.065;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

setStatus('loading');
setPresenceStatus('standby');
loadAvatar().catch((error) => {
  console.error(error);
  setStatus('error');
  setSubtitle(`GLB読み込み失敗: ${error.message}`);
});
animate();
