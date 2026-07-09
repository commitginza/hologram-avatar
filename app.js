import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CONFIG = window.HOLOGRAM_CONFIG || {};
const API_URL = CONFIG.API_URL || '';
const MODEL_URL = CONFIG.MODEL_URL || 'https://watchimg.s3.ap-northeast-1.amazonaws.com/glb/avatar-v1.glb';

// ===== Avatar view preset =====
// 今回のGLBが横向きで表示される場合に、正面を合わせて少し奥へ配置するための推奨値です。
// 向きが逆の場合は yawDeg を -90 または 180 に変更してください。
const AVATAR_VIEW = {
  // 正面向き調整。横向きなら 90 / -90 / 180 を試す。
  yawDeg: -90,

  // アバター全体の位置。zをマイナスにすると奥へ移動します。
  x: 0,
  y: 0.08,
  z: -1.2,

  // カメラ距離。大きいほど引きで表示されます。
  cameraZ: 7.8,

  // 画面内でのモデル高さ。大きいほどアバターが大きくなります。
  targetHeight: 4.25,

  // 待機中の微揺れ。完全固定したい場合は 0 にしてください。
  idleYawDeg: 1.0,
  floatAmount: 0.026
};

const stage = document.getElementById('stage');
const micButton = document.getElementById('micButton');
const statusEl = document.getElementById('status');
const subtitleEl = document.getElementById('subtitle');
const transcriptEl = document.getElementById('transcript');

const state = {
  mediaRecorder: null,
  chunks: [],
  recording: false,
  busy: false,
  talking: false,
  talkLevel: 0,
  captionText: '',
  captionIndex: 0,
  captionTimer: 0,
  audio: null,
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

const ambient = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambient);

const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(-1.2, 2.2, 3.4);
scene.add(key);

const rim = new THREE.DirectionalLight(0xd7f6ff, 1.5);
rim.position.set(0, 1.3, -2.2);
scene.add(rim);

function setStatus(text) {
  statusEl.textContent = text;
}

function setSubtitle(text) {
  subtitleEl.textContent = text;
}

function setTranscript(text) {
  transcriptEl.textContent = text ? `認識: ${text}` : '';
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

  // 全身プリセット固定。画面内に全身が入るように高さ基準でフィット。
  const targetHeight = AVATAR_VIEW.targetHeight;
  const scale = targetHeight / Math.max(size.y, 0.0001);

  object.scale.setScalar(scale);
  object.position.set(
    -center.x * scale,
    -center.y * scale - 0.35,
    -center.z * scale
  );
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
    positions.push(
      (Math.random() - 0.5) * 9.5,
      (Math.random() - 0.5) * 6.0,
      -2.0 - Math.random() * 6.0
    );
    sizes.push(0.4 + Math.random() * 0.8);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 }
    },
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
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false
    })
  );

  baseCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.36, 0.82, 64, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xeaf8ff,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );

  baseCone.position.y = 0.40;

  group.add(baseDisc, baseCone);
}

createProjectionBase();

function setMicUi() {
  micButton.classList.toggle('recording', state.recording);
  micButton.classList.toggle('busy', state.busy);
  micButton.disabled = state.busy && !state.recording;
  micButton.setAttribute('aria-label', state.recording ? '録音停止' : 'マイク開始');
}

function getRecorderMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4'
  ];

  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

async function startRecording() {
  if (!API_URL || API_URL.includes('YOUR_API_ID')) {
    setSubtitle('public/config.js の API_URL に API Gateway の /talk URL を設定してください。');
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false
  });

  const mimeType = getRecorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  state.chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      state.chunks.push(event.data);
    }
  };

  recorder.onstop = async () => {
    stream.getTracks().forEach((track) => track.stop());

    const blob = new Blob(state.chunks, {
      type: recorder.mimeType || 'audio/webm'
    });

    await sendAudio(blob);
  };

  state.mediaRecorder = recorder;
  state.recording = true;
  state.busy = false;

  setMicUi();
  setStatus('recording');
  setSubtitle('録音中です。もう一度マイクボタンを押すと送信します。');
  setTranscript('');

  recorder.start();

  // Lambda同期payload制限を避けるため、MVPでは録音を短めに制限。
  window.setTimeout(() => {
    if (state.recording) {
      stopRecording();
    }
  }, 18000);
}

function stopRecording() {
  if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') return;

  state.recording = false;
  state.busy = true;

  setMicUi();
  setStatus('thinking');
  setSubtitle('音声を解析しています…');

  state.mediaRecorder.stop();
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

async function sendAudio(blob) {
  try {
    const audioBase64 = await blobToBase64(blob);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_id: state.sessionId,
        audio_base64: audioBase64,
        audio_mime_type: blob.type || 'audio/webm'
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.detail || data.error || `API error: ${response.status}`);
    }

    setTranscript(data.transcript || '');
    await speakResponse(data);
  } catch (error) {
    console.error(error);
    setSubtitle(`エラー: ${error.message}`);
    setStatus('error');
  } finally {
    state.busy = false;
    setMicUi();
  }
}

function startCaption(text, durationMs = 3000) {
  state.captionText = String(text || '');
  state.captionIndex = 0;
  state.captionTimer = 0;

  setSubtitle('');

  state.captionInterval = Math.max(
    18,
    durationMs / Math.max(state.captionText.length, 1)
  );
}

function updateCaption(deltaMs) {
  if (!state.captionText) return;
  if (state.captionIndex >= state.captionText.length) return;

  state.captionTimer += deltaMs;

  while (
    state.captionTimer >= state.captionInterval &&
    state.captionIndex < state.captionText.length
  ) {
    state.captionTimer -= state.captionInterval;
    state.captionIndex += 1;
    setSubtitle(state.captionText.slice(0, state.captionIndex));
  }
}

async function speakResponse(data) {
  const text = data.display_text || data.speak_text || '回答を生成しました。';
  const audioBase64 = data.audio_base64;
  const mime = data.audio_mime_type || 'audio/mpeg';

  if (!audioBase64) {
    setSubtitle(text);
    return;
  }

  if (state.audio) {
    state.audio.pause();
    state.audio.src = '';
  }

  const audio = new Audio(`data:${mime};base64,${audioBase64}`);
  state.audio = audio;

  audio.addEventListener('play', () => {
    state.talking = true;
    setStatus('speaking');
    startCaption(text, Math.max(2200, (audio.duration || 4) * 1000));
  });

  audio.addEventListener('ended', () => {
    state.talking = false;
    state.talkLevel = 0;
    setStatus('standby');
    setSubtitle(text);
  });

  audio.addEventListener('error', () => {
    state.talking = false;
    setStatus('standby');
    setSubtitle(text);
  });

  await audio.play();
}

micButton.addEventListener('click', async () => {
  try {
    if (state.recording) {
      stopRecording();
    } else {
      await startRecording();
    }
  } catch (error) {
    console.error(error);

    state.recording = false;
    state.busy = false;

    setMicUi();
    setStatus('error');
    setSubtitle(`マイクを開始できません: ${error.message}`);
  }
});

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  particles.userData.material.uniforms.uTime.value = elapsed;
  updateCaption(delta * 1000);

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
    mat.opacity =
      0.56 +
      state.talkLevel * 0.12 +
      Math.sin(elapsed * 5.5) * state.talkLevel * 0.02;

    mat.emissiveIntensity = 0.016 + state.talkLevel * 0.065;
  }

  if (baseDisc && baseCone) {
    baseDisc.scale.setScalar(
      1 + Math.sin(elapsed * 1.7) * 0.035 + state.talkLevel * 0.08
    );

    baseCone.material.opacity = 0.045 + state.talkLevel * 0.065;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

setMicUi();
setStatus('loading');

loadAvatar().catch((error) => {
  console.error(error);
  setStatus('error');
  setSubtitle(`GLB読み込み失敗: ${error.message}`);
});

animate();
