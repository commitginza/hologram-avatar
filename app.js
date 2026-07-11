import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CONFIG = window.HOLOGRAM_CONFIG || {};
const API_URL = CONFIG.API_URL || '';
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

const VAD = {
  startThreshold: 0.040,
  stopThreshold: 0.022,
  silenceMs: 1050,
  minRecordMs: 450,
  maxRecordMs: 9000
};

const PERSON = {
  checkIntervalMs: 420,
  stableMs: 900,
  absentResetMs: 8000,
  greetCooldownMs: 60000
};

const stage = document.getElementById('stage');
const startOverlay = document.getElementById('startOverlay');
const startButton = document.getElementById('startButton');
const statusEl = document.getElementById('status');
const subtitleEl = document.getElementById('subtitle');
const transcriptEl = document.getElementById('transcript');
const videoEl = document.getElementById('cameraVideo');
const probeCanvas = document.getElementById('cameraProbe');
const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });

const state = {
  liveStarted: false,
  mediaReady: false,
  videoStream: null,
  micStream: null,
  recorder: null,
  chunks: [],
  recording: false,
  busy: false,
  talking: false,
  talkLevel: 0,
  captionText: '',
  captionIndex: 0,
  captionTimer: 0,
  captionInterval: 30,
  audioContext: null,
  audioUnlocked: false,
  audioSource: null,
  analyser: null,
  analyserData: null,
  rms: 0,
  lastVoiceAt: 0,
  recordStartedAt: 0,
  personPresent: false,
  personStableSince: 0,
  lastPersonSeenAt: 0,
  lastGreetingAt: 0,
  greetedThisPresence: false,
  lastProbeAt: 0,
  previousFrame: null,
  faceDetector: null,
  sessionId: crypto.randomUUID?.() || String(Date.now())
};

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

function setStatus(text) { statusEl.textContent = text; }
function setSubtitle(text) { subtitleEl.textContent = text; }
function setTranscript(text) { transcriptEl.textContent = text ? `認識: ${text}` : ''; }

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

async function unlockAudioForMobile() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  if (!state.audioContext) state.audioContext = new AudioContextClass();
  if (state.audioContext.state === 'suspended') await state.audioContext.resume();
  const buffer = state.audioContext.createBuffer(1, 1, 22050);
  const source = state.audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(state.audioContext.destination);
  source.start(0);
  state.audioUnlocked = true;
  return true;
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function playTts(audioBase64, text) {
  if (!audioBase64) {
    setSubtitle(text);
    return;
  }
  await unlockAudioForMobile();
  const arrayBuffer = base64ToArrayBuffer(audioBase64);
  const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer.slice(0));
  if (state.audioSource) {
    try { state.audioSource.stop(); } catch (_) {}
    state.audioSource = null;
  }
  const source = state.audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(state.audioContext.destination);
  state.audioSource = source;
  state.talking = true;
  setStatus('speaking');
  startCaption(text, Math.max(2200, audioBuffer.duration * 1000));
  source.onended = () => {
    if (state.audioSource === source) state.audioSource = null;
    state.talking = false;
    state.talkLevel = 0;
    setStatus('watching');
    setSubtitle(text);
  };
  source.start(0);
}

function getRecorderMimeType() {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

function setupMicAnalyser(stream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!state.audioContext) state.audioContext = new AudioContextClass();
  const source = state.audioContext.createMediaStreamSource(stream);
  const analyser = state.audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  state.analyser = analyser;
  state.analyserData = new Uint8Array(analyser.fftSize);
}

function updateRms() {
  if (!state.analyser || !state.analyserData) return 0;
  state.analyser.getByteTimeDomainData(state.analyserData);
  let sum = 0;
  for (const v of state.analyserData) {
    const n = (v - 128) / 128;
    sum += n * n;
  }
  state.rms = Math.sqrt(sum / state.analyserData.length);
  return state.rms;
}

function startSpeechSegment() {
  if (state.recording || state.busy || state.talking || !state.micStream) return;
  const mimeType = getRecorderMimeType();
  const recorder = new MediaRecorder(state.micStream, mimeType ? { mimeType } : undefined);
  state.chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) state.chunks.push(event.data);
  };
  recorder.onstop = async () => {
    const blob = new Blob(state.chunks, { type: recorder.mimeType || 'audio/webm' });
    if (blob.size < 900) {
      state.recording = false;
      return;
    }
    state.recording = false;
    await sendAudio(blob);
  };
  state.recorder = recorder;
  state.recording = true;
  state.recordStartedAt = performance.now();
  state.lastVoiceAt = performance.now();
  setStatus('listening');
  setSubtitle('お話を聞いています…');
  recorder.start(250);
}

function stopSpeechSegment() {
  if (!state.recorder || !state.recording || state.recorder.state === 'inactive') return;
  setStatus('thinking');
  setSubtitle('少々お待ちください。');
  state.recorder.stop();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function postToTalk(payload) {
  if (!API_URL || API_URL.includes('YOUR_API_ID')) {
    throw new Error('public/config.js の API_URL に API Gateway の /talk URL を設定してください。');
  }
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: state.sessionId, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || `API error: ${response.status}`);
  return data;
}

async function sendAudio(blob) {
  try {
    state.busy = true;
    const audioBase64 = await blobToBase64(blob);
    const data = await postToTalk({
      event_type: 'audio',
      audio_base64: audioBase64,
      audio_mime_type: blob.type || 'audio/webm'
    });
    setTranscript(data.transcript || '');
    await playTts(data.audio_base64, data.display_text || data.speak_text || '回答を生成しました。');
  } catch (error) {
    console.error(error);
    setStatus('error');
    setSubtitle(`エラー: ${error.message}`);
  } finally {
    state.busy = false;
  }
}

async function sendPersonDetectedGreeting() {
  if (state.busy || state.talking) return;
  try {
    state.busy = true;
    setStatus('greeting');
    const data = await postToTalk({ event_type: 'person_detected' });
    setTranscript('');
    await playTts(data.audio_base64, data.display_text || data.speak_text || 'いらっしゃいませ。');
  } catch (error) {
    console.error(error);
    setSubtitle(`挨拶生成に失敗しました: ${error.message}`);
    setStatus('watching');
  } finally {
    state.busy = false;
  }
}

function startCaption(text, durationMs = 3000) {
  state.captionText = String(text || '');
  state.captionIndex = 0;
  state.captionTimer = 0;
  state.captionInterval = Math.max(18, durationMs / Math.max(state.captionText.length, 1));
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

async function detectPerson(now) {
  if (!videoEl.videoWidth || now - state.lastProbeAt < PERSON.checkIntervalMs) return state.personPresent;
  state.lastProbeAt = now;

  let detected = false;
  if (state.faceDetector) {
    try {
      const faces = await state.faceDetector.detect(videoEl);
      detected = faces.length > 0;
    } catch (_) {
      state.faceDetector = null;
    }
  }

  if (!detected) {
    probeCtx.drawImage(videoEl, 0, 0, probeCanvas.width, probeCanvas.height);
    const frame = probeCtx.getImageData(0, 0, probeCanvas.width, probeCanvas.height).data;
    let avg = 0;
    let variance = 0;
    let motion = 0;
    const samples = probeCanvas.width * probeCanvas.height;
    for (let i = 0; i < frame.length; i += 4) {
      const lum = frame[i] * 0.299 + frame[i + 1] * 0.587 + frame[i + 2] * 0.114;
      avg += lum;
      if (state.previousFrame) motion += Math.abs(lum - state.previousFrame[i / 4]);
    }
    avg /= samples;
    const compact = new Float32Array(samples);
    for (let i = 0; i < frame.length; i += 4) {
      const lum = frame[i] * 0.299 + frame[i + 1] * 0.587 + frame[i + 2] * 0.114;
      compact[i / 4] = lum;
      variance += Math.pow(lum - avg, 2);
    }
    variance = Math.sqrt(variance / samples);
    motion = state.previousFrame ? motion / samples : 0;
    state.previousFrame = compact;

    // FaceDetector非対応環境用の簡易検知。人専用ではなく「被写体がある」検知です。
    detected = avg > 22 && (variance > 20 || motion > 4.2);
  }

  if (detected) {
    if (!state.personPresent) state.personStableSince = now;
    state.personPresent = true;
    state.lastPersonSeenAt = now;
  } else if (state.personPresent && now - state.lastPersonSeenAt > PERSON.absentResetMs) {
    state.personPresent = false;
    state.greetedThisPresence = false;
  }

  return state.personPresent;
}

async function startLiveMode() {
  startButton.disabled = true;
  startButton.textContent = '起動中…';
  setStatus('starting');
  setSubtitle('カメラとマイクの許可を確認しています。');

  try {
    await unlockAudioForMobile();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    state.videoStream = new MediaStream(stream.getVideoTracks());
    state.micStream = new MediaStream(stream.getAudioTracks());
    videoEl.srcObject = state.videoStream;
    await videoEl.play();
    setupMicAnalyser(state.micStream);

    if ('FaceDetector' in window) {
      try { state.faceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 }); } catch (_) { state.faceDetector = null; }
    }

    state.liveStarted = true;
    state.mediaReady = true;
    startOverlay.classList.add('hidden');
    setStatus('watching');
    setSubtitle('人物を検知すると自動で話しかけます。');
  } catch (error) {
    console.error('[start live failed]', error);
    startButton.disabled = false;
    startButton.textContent = 'カメラ・マイクを許可して開始';
    setStatus('error');
    setSubtitle(`カメラまたはマイクを開始できません: ${error.message}`);
  }
}

if (startButton) startButton.addEventListener('click', startLiveMode);

async function liveLoop(now) {
  if (!state.liveStarted || !state.mediaReady) return;

  const personPresent = await detectPerson(now);
  const stable = personPresent && now - state.personStableSince > PERSON.stableMs;
  const canGreet = stable && !state.greetedThisPresence && now - state.lastGreetingAt > PERSON.greetCooldownMs;
  if (canGreet && !state.busy && !state.talking && !state.recording) {
    state.greetedThisPresence = true;
    state.lastGreetingAt = now;
    sendPersonDetectedGreeting();
    return;
  }

  if (!stable || state.busy || state.talking) return;

  const rms = updateRms();
  if (!state.recording && rms > VAD.startThreshold) {
    startSpeechSegment();
    return;
  }

  if (state.recording) {
    if (rms > VAD.stopThreshold) state.lastVoiceAt = now;
    const elapsed = now - state.recordStartedAt;
    const silent = now - state.lastVoiceAt;
    if ((elapsed > VAD.minRecordMs && silent > VAD.silenceMs) || elapsed > VAD.maxRecordMs) {
      stopSpeechSegment();
    }
  }
}

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  const now = performance.now();
  particles.userData.material.uniforms.uTime.value = elapsed;
  updateCaption(delta * 1000);
  liveLoop(now);

  const targetTalk = state.talking ? 1 : state.recording ? 0.35 : 0;
  state.talkLevel += (targetTalk - state.talkLevel) * Math.min(1, delta * 4.5);

  if (avatarRoot) {
    avatarGroup.position.set(AVATAR_VIEW.x, AVATAR_VIEW.y + Math.sin(elapsed * 0.72) * AVATAR_VIEW.floatAmount, AVATAR_VIEW.z);
    avatarGroup.rotation.y = THREE.MathUtils.degToRad(AVATAR_VIEW.yawDeg) + Math.sin(elapsed * 0.18) * THREE.MathUtils.degToRad(AVATAR_VIEW.idleYawDeg);
  }

  for (const mat of avatarMaterials) {
    mat.opacity = 0.56 + state.talkLevel * 0.12 + Math.sin(elapsed * 5.5) * state.talkLevel * 0.02;
    mat.emissiveIntensity = 0.016 + state.talkLevel * 0.065;
  }

  if (baseDisc && baseCone) {
    baseDisc.scale.setScalar(1 + Math.sin(elapsed * 1.7) * 0.035 + state.talkLevel * 0.08);
    baseCone.material.opacity = 0.045 + state.talkLevel * 0.065;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

setStatus('loading');
loadAvatar().catch((error) => {
  console.error(error);
  setStatus('error');
  setSubtitle(`GLB読み込み失敗: ${error.message}`);
});
animate();
