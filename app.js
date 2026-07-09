import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const APP_VERSION = 'custom-glb-20260709-1';
console.info('[app] version', APP_VERSION);

const MODEL_URL = './models/avatar.glb';

const stage = document.getElementById('stage');
const loading = document.getElementById('loading');
const captionText = document.getElementById('captionText');
const statusText = document.getElementById('statusText');
const mouthStatus = document.getElementById('mouthStatus');
const meshCountEl = document.getElementById('meshCount');
const morphCountEl = document.getElementById('morphCount');
const debugInfo = document.getElementById('debugInfo');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const bustPresetBtn = document.getElementById('bustPresetBtn');
const fullPresetBtn = document.getElementById('fullPresetBtn');
const useOriginalMaterialEl = document.getElementById('useOriginalMaterial');
const showWireEl = document.getElementById('showWire');
const scaleRange = document.getElementById('scaleRange');
const yRange = document.getElementById('yRange');
const rotRange = document.getElementById('rotRange');
const depthRange = document.getElementById('depthRange');
const opacityRange = document.getElementById('opacityRange');
const glowRange = document.getElementById('glowRange');
const scanRange = document.getElementById('scanRange');
const noiseRange = document.getElementById('noiseRange');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'default',
  failIfMajorPerformanceCaveat: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x03060a, 0.045);

const camera = new THREE.PerspectiveCamera(35, stage.clientWidth / stage.clientHeight, 0.05, 100);
camera.position.set(0, 0.1, 6.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.target.set(0, 0.28, 0);

const root = new THREE.Group();
scene.add(root);

const modelHolder = new THREE.Group();
root.add(modelHolder);

const clock = new THREE.Clock();

const state = {
  loaded: false,
  speaking: false,
  mouth: 0,
  targetMouth: 0,
  talkIntensity: 0,
  captionTimer: 0,
  captionCursor: 0,
  currentCaption: '',
  originalMaterials: new Map(),
  meshes: [],
  wireObjects: [],
  morphMeshes: [],
  morphDictNames: new Set(),
  baseScale: 1,
  fitHeight: 3.2
};

scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-2.3, 2.6, 3.2);
scene.add(key);
const fill = new THREE.DirectionalLight(0xdce7ee, 0.9);
fill.position.set(2.0, 1.3, 1.5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.35);
rim.position.set(0, 1.7, -2.2);
scene.add(rim);

const holoUniforms = {
  uTime: { value: 0 },
  uOpacity: { value: Number(opacityRange.value) },
  uGlow: { value: Number(glowRange.value) },
  uScan: { value: Number(scanRange.value) },
  uNoise: { value: Number(noiseRange.value) },
  uTalk: { value: 0 }
};

const hologramMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  side: THREE.FrontSide,
  blending: THREE.NormalBlending,
  uniforms: holoUniforms,
  vertexShader: `
    uniform float uTime;
    uniform float uTalk;
    uniform float uNoise;
    varying vec3 vNormalV;
    varying vec3 vViewPos;
    varying float vWorldY;
    varying float vNoise;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.39));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    void main() {
      vec3 displaced = position;
      float n = hash(position + uTime * 0.035) - 0.5;
      float scanWave = sin(position.y * 18.0 + uTime * 3.2) * 0.0035;
      displaced += normal * (n * 0.012 * uNoise + scanWave + uTalk * 0.0025);

      vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
      vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
      vWorldY = worldPosition.y;
      vViewPos = -mvPosition.xyz;
      vNormalV = normalize(normalMatrix * normal);
      vNoise = n;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uOpacity;
    uniform float uGlow;
    uniform float uScan;
    uniform float uTalk;
    varying vec3 vNormalV;
    varying vec3 vViewPos;
    varying float vWorldY;
    varying float vNoise;

    void main() {
      vec3 N = normalize(vNormalV);
      vec3 V = normalize(vViewPos);
      float facing = clamp(dot(N, V), 0.0, 1.0);
      float fresnel = pow(1.0 - facing, 2.05);
      float shadow = pow(1.0 - facing, 0.65);
      float scanRaw = sin(vWorldY * 95.0 - uTime * 11.0);
      float scan = smoothstep(0.82, 1.0, scanRaw) * uScan;
      float band = smoothstep(0.04, 0.18, abs(fract(vWorldY * 1.08 - uTime * 0.10) - 0.5));

      vec3 whiteBase = vec3(0.96, 0.98, 1.0);
      vec3 shadowTone = vec3(0.17, 0.19, 0.21);
      vec3 color = mix(whiteBase, shadowTone, shadow * 0.42);
      color += vec3(1.0) * (fresnel * 0.55 + scan * 0.28 + uTalk * 0.10 + uGlow * 0.12);
      color += vec3(vNoise * 0.04);

      float alpha = uOpacity * (0.58 + fresnel * 0.36 + scan * 0.10 + band * 0.08 + uTalk * 0.06);
      alpha = clamp(alpha, 0.0, 0.94);
      gl_FragColor = vec4(color, alpha);
    }
  `
});

const wireMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.12,
  depthWrite: false
});

function createBackgroundParticles(count = 170) {
  const positions = [];
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    positions.push(
      (Math.random() - 0.5) * 9,
      (Math.random() - 0.5) * 6,
      -2.3 - Math.random() * 5.2
    );
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
        p.y += sin(uTime * 0.25 + position.x * 1.7) * 0.018;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (16.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vFade = 0.35 + 0.28 * sin(uTime + position.x * 2.2 + position.y * 3.3);
      }
    `,
    fragmentShader: `
      varying float vFade;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float a = smoothstep(0.5, 0.0, d) * vFade;
        gl_FragColor = vec4(0.92, 0.97, 1.0, a * 0.45);
      }
    `
  });
  const points = new THREE.Points(geometry, material);
  points.userData.material = material;
  return points;
}

const particles = createBackgroundParticles();
scene.add(particles);

const baseDisc = new THREE.Mesh(
  new THREE.CylinderGeometry(0.55, 0.55, 0.018, 128, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.10, depthWrite: false })
);
baseDisc.position.y = -2.18;
root.add(baseDisc);

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(url, resolve, undefined, reject);
  });
}

function recordOriginalMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    state.originalMaterials.set(child.uuid, child.material);
  });
}

function applyMaterialMode() {
  const useOriginal = useOriginalMaterialEl.checked;
  for (const mesh of state.meshes) {
    mesh.material = useOriginal ? state.originalMaterials.get(mesh.uuid) : hologramMaterial;
    mesh.frustumCulled = false;
    if (!useOriginal) {
      mesh.material.transparent = true;
      mesh.material.depthWrite = false;
    }
  }
}

function rebuildWireframes() {
  for (const wire of state.wireObjects) {
    wire.parent?.remove(wire);
    wire.geometry?.dispose?.();
  }
  state.wireObjects = [];

  if (!showWireEl.checked) return;

  for (const mesh of state.meshes) {
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry), wireMaterial);
    wire.renderOrder = 10;
    wire.scale.setScalar(1.001);
    mesh.add(wire);
    state.wireObjects.push(wire);
  }
}

function fitModelToStage(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  state.fitHeight = Math.max(size.y, 0.0001);
  const targetHeight = 3.2;
  state.baseScale = targetHeight / state.fitHeight;

  object.scale.setScalar(state.baseScale);
  object.position.set(-center.x * state.baseScale, -center.y * state.baseScale, -center.z * state.baseScale);
}

function collectModelInfo(rootObject) {
  const meshes = [];
  const morphNames = new Set();
  let vertexTotal = 0;
  let materialCount = 0;

  rootObject.traverse((child) => {
    if (!child.isMesh) return;
    meshes.push(child);
    vertexTotal += child.geometry?.attributes?.position?.count || 0;
    materialCount += Array.isArray(child.material) ? child.material.length : 1;
    if (child.morphTargetDictionary && child.morphTargetInfluences) {
      state.morphMeshes.push(child);
      Object.keys(child.morphTargetDictionary).forEach((name) => morphNames.add(name));
    }
  });

  state.meshes = meshes;
  state.morphDictNames = morphNames;

  return {
    file: MODEL_URL,
    meshCount: meshes.length,
    vertexTotal,
    materialCount,
    morphMeshCount: state.morphMeshes.length,
    morphTargetCount: morphNames.size,
    morphTargets: Array.from(morphNames),
    meshNames: meshes.map((mesh) => mesh.name || '(unnamed)')
  };
}

function setMorph(mesh, candidates, value) {
  const dict = mesh.morphTargetDictionary;
  const influences = mesh.morphTargetInfluences;
  if (!dict || !influences) return false;
  for (const name of candidates) {
    const index = dict[name];
    if (index !== undefined) {
      influences[index] = THREE.MathUtils.clamp(value, 0, 1);
      return true;
    }
  }
  return false;
}

function resetMorphs() {
  for (const mesh of state.morphMeshes) {
    if (!mesh.morphTargetInfluences) continue;
    mesh.morphTargetInfluences.fill(0);
  }
}

function updateMouthMorphs(open) {
  let applied = false;
  const jawCandidates = ['jawOpen', 'mouthOpen', 'Mouth_Open', 'mouth_open', 'JawOpen', 'viseme_aa', 'aa', 'A'];
  const puckerCandidates = ['mouthFunnel', 'mouthPucker', 'Mouth_Pucker', 'mouth_pucker'];
  for (const mesh of state.morphMeshes) {
    applied = setMorph(mesh, jawCandidates, open) || applied;
    setMorph(mesh, puckerCandidates, open * 0.10);
  }
  return applied;
}

function updateTransformFromControls() {
  const userScale = Number(scaleRange.value);
  const y = Number(yRange.value);
  const rot = THREE.MathUtils.degToRad(Number(rotRange.value));
  const depth = Number(depthRange.value);

  modelHolder.scale.set(userScale, userScale, userScale * depth);
  modelHolder.position.y = y;
  modelHolder.rotation.y = rot;
}

async function loadAvatar() {
  statusText.textContent = 'loading';
  const gltf = await loadGltf(MODEL_URL);
  const avatar = gltf.scene;

  recordOriginalMaterials(avatar);
  const info = collectModelInfo(avatar);
  console.group('[GLB structure]');
  console.log(info);
  for (const mesh of state.meshes) {
    console.log({
      name: mesh.name,
      vertexCount: mesh.geometry?.attributes?.position?.count,
      material: Array.isArray(mesh.material) ? mesh.material.map((m) => m?.name) : mesh.material?.name,
      morphTargetDictionary: mesh.morphTargetDictionary || null
    });
  }
  console.groupEnd();

  fitModelToStage(avatar);
  modelHolder.add(avatar);

  applyMaterialMode();
  rebuildWireframes();
  updateTransformFromControls();

  meshCountEl.textContent = String(info.meshCount);
  morphCountEl.textContent = String(info.morphTargetCount);
  mouthStatus.textContent = info.morphTargetCount > 0 ? 'morph targetあり' : 'morph targetなし';
  debugInfo.textContent = JSON.stringify(info, null, 2);

  if (info.morphTargetCount === 0) {
    debugInfo.textContent += '\n\n注意: このGLBにはmorph target / animation / skinが見つかっていません。自然な口パクはできません。発話時は発光演出のみになります。';
  }

  loading.style.display = 'none';
  statusText.textContent = 'standby';
  state.loaded = true;
}

function startCaption(text) {
  state.currentCaption = text;
  state.captionCursor = 0;
  state.captionTimer = 0;
  captionText.textContent = '';
}

function updateCaption(delta) {
  if (!state.currentCaption) return;
  state.captionTimer += delta;
  const interval = 0.024;
  while (state.captionTimer > interval && state.captionCursor < state.currentCaption.length) {
    state.captionTimer -= interval;
    state.captionCursor += 1;
    captionText.textContent = state.currentCaption.slice(0, state.captionCursor);
  }
}

function kanaToMouthSeed(char) {
  if ('あかさたなはまやらわがざだばぱぁゃゎアカサタナハマヤラワガザダバパァャヮAa'.includes(char)) return 0.92;
  if ('いきしちにひみりぎじぢびぴぃイキシチニヒミリギジヂビピィIi'.includes(char)) return 0.36;
  if ('うくすつぬふむゆるぐずづぶぷぅゅウクスツヌフムユルグズヅブプゥュUu'.includes(char)) return 0.58;
  if ('えけせてねへめれげぜでべぺぇエケセテネヘメレゼデベペェEe'.includes(char)) return 0.50;
  if ('おこそとのほもよろをごぞどぼぽぉょオコソトノホモヨロヲゴゾドボポォョOo'.includes(char)) return 0.72;
  if ('。、，,.！？!? 　\n'.includes(char)) return 0.02;
  return 0.25 + Math.random() * 0.38;
}

function startMockMouth(text, estimatedSeconds) {
  clearInterval(state.mouthInterval);
  const chars = [...text];
  let i = 0;
  const interval = Math.max(32, Math.floor((estimatedSeconds * 1000) / Math.max(chars.length, 1)));
  state.mouthInterval = setInterval(() => {
    if (!state.speaking) {
      clearInterval(state.mouthInterval);
      return;
    }
    const c = chars[i % chars.length] || ' ';
    state.targetMouth = kanaToMouthSeed(c);
    i += 1;
  }, interval);
}

function speakWithBrowser(text, onEnd) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    const seconds = Math.max(2.2, text.length * 0.075);
    window.setTimeout(onEnd, seconds * 1000);
    return seconds;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.92;
  utterance.pitch = 0.78;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
  return Math.max(2.2, text.length * 0.08);
}

function playMock() {
  const text = 'このGLBをホログラム表示しています。モデルにモーフターゲットがあれば口パクも接続します。なければ発話中の発光演出だけになります。';
  state.speaking = true;
  state.targetMouth = 0.65;
  statusText.textContent = 'speaking';
  startCaption(text);
  const seconds = speakWithBrowser(text, stopMock);
  startMockMouth(text, seconds);
}

function stopMock() {
  state.speaking = false;
  state.targetMouth = 0;
  clearInterval(state.mouthInterval);
  window.speechSynthesis?.cancel?.();
  statusText.textContent = 'standby';
}

function updateMouth(delta) {
  state.mouth += (state.targetMouth - state.mouth) * Math.min(1, delta * 13);
  state.talkIntensity += ((state.speaking ? 1 : 0) - state.talkIntensity) * Math.min(1, delta * 5);
  const open = Math.min(1, state.mouth * state.talkIntensity);
  const applied = updateMouthMorphs(open);
  holoUniforms.uTalk.value = applied ? open * 0.55 : state.talkIntensity * 0.55;
}

function updateUniforms() {
  holoUniforms.uOpacity.value = Number(opacityRange.value);
  holoUniforms.uGlow.value = Number(glowRange.value);
  holoUniforms.uScan.value = Number(scanRange.value);
  holoUniforms.uNoise.value = Number(noiseRange.value);
}

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  updateCaption(delta);
  resetMorphs();
  updateMouth(delta);
  updateUniforms();
  updateTransformFromControls();
  controls.update();

  holoUniforms.uTime.value = elapsed;
  particles.userData.material.uniforms.uTime.value = elapsed;

  root.position.y = Math.sin(elapsed * 0.72) * 0.018;
  baseDisc.scale.setScalar(1 + Math.sin(elapsed * 1.7) * 0.035 + state.talkIntensity * 0.04);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function applyPreset(kind) {
  if (kind === 'bust') {
    scaleRange.value = '1.85';
    yRange.value = '-1.05';
    depthRange.value = '0.62';
  } else {
    scaleRange.value = '1.00';
    yRange.value = '0.00';
    depthRange.value = '0.74';
  }
  updateTransformFromControls();
}

playBtn.addEventListener('click', playMock);
stopBtn.addEventListener('click', stopMock);
bustPresetBtn.addEventListener('click', () => applyPreset('bust'));
fullPresetBtn.addEventListener('click', () => applyPreset('full'));
useOriginalMaterialEl.addEventListener('change', applyMaterialMode);
showWireEl.addEventListener('change', rebuildWireframes);
window.addEventListener('resize', resize);

resize();
animate();
loadAvatar().catch((error) => {
  console.error(error);
  loading.textContent = `GLB読み込み失敗: ${error.message || error}`;
  statusText.textContent = 'error';
});
