import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CONFIG = window.HOLOGRAM_CONFIG || {};
const API_URL = CONFIG.API_URL || '';
const MODEL_URL = CONFIG.MODEL_URL || 'https://watchimg.s3.ap-northeast-1.amazonaws.com/glb/avatar-v1.glb';

const APP_BUILD = 'human-avatar-pose-skeleton-mouth-v4-lower-hands-20260712';
window.APP_BUILD = APP_BUILD;
console.info(`[app.js loaded] ${APP_BUILD}`, import.meta.url);

// ===== Avatar / camera preset =====
// 人型GLBに合わせて、Consoleから位置・角度・カメラ・再フィットを調整できます。
// 例: window.setAvatarView({ yawDeg: 0, y: -0.6, z: -1.6, cameraZ: 9.5, targetHeight: 4.8 })
const AVATAR_VIEW = {
  // モデルの向き。人型で正面が合わない場合は yawDeg を 0 / 90 / -90 / 180 で試してください。
  yawDeg: -90,
  pitchDeg: 0,
  rollDeg: 0,

  // モデル全体の表示位置
  x: 0,
  y: -0.4,
  z: -1.35,

  // カメラ位置
  cameraX: 0,
  cameraY: 0.35,
  cameraZ: 4.8,

  // カメラの注視点
  lookAtX: 0,
  lookAtY: 0.15,
  lookAtZ: 0,

  // GLBをこの高さに自動フィットします。人型なら 4.3〜5.8 くらいが調整しやすいです。
  targetHeight: 4.9,

  // フィット後のモデル内部オフセット
  fitOffsetX: 0,
  fitOffsetY: -0.55,
  fitOffsetZ: 0,

  idleYawDeg: 0.35,
  floatAmount: 0.01
};

// ===== Mouth overlay preset =====
// GLB側で口が開いている前提で、口内に黒いホログラム穴を重ねます。
// Consoleで window.setMouthOverlay({ y: 2.1, z: -0.4 }) のように微調整できます。
const MOUTH_OVERLAY = {
  enabled: true,
  visible: true,
  alwaysVisible: true,
  hideWhenMouthBoneWorks: true,

  // root: 画面上の固定位置として重ねる / avatar: アバターグループに追従させる
  // まずは root 推奨。モデルの回転に合わせたい時だけ avatar を試してください。
  attachTo: 'root',

  // 口位置。x=左右, y=上下, z=手前/奥。
  x: 0,
  y: 0.84,
  z: -0.7,

  // 口穴サイズ
  width: 0.18,
  closedHeight: 0.008,
  openHeight: 0.07,

  // 縁取り・動き
  rimOpacity: 0.34,
  openPower: 1.15,
  moveDownWhileOpen: 0.012,
  widenWhileOpen: 0.1,

  // 音声波形が取得できない時の疑似口パク
  fallbackWaveSpeedA: 11,
  fallbackWaveSpeedB: 17.7,
  smooth: 16
};

// ===== Hologram effect preset =====
// Consoleで window.setHologram(false) / window.setHologram(true) / window.setHologram({ materialOpacity: 0.4 }) が使えます。
const HOLOGRAM = {
  enabled: false,
  useMaterial: true,
  useParticles: true,
  useBase: true,
  useFog: true,
  useFlicker: true,
  materialOpacity: 0.05,
  materialTalkOpacityBoost: 0.12,
  materialFlickerAmount: 0.02,
  emissiveIntensity: 0.018,
  emissiveTalkBoost: 0.065
};

// ===== Skeleton / animation preset =====
// GLBにSkeleton/Bone/Animationが含まれている場合だけ有効です。
// Consoleで window.inspectSkeleton(), window.playSkeletonAnimation(0), window.showSkeletonHelper(true) などが使えます。
const SKELETON = {
  enabled: true,
  autoPlay: false,
  animationIndex: 0,
  animationName: '',
  timeScale: 1.0,
  loop: 'repeat', // repeat / once / pingpong
  clampWhenFinished: false,
  showHelper: false,
  helperColor: 0x88eeff,
  logOnLoad: true,

  // mouthBoneEnabled=true にすると、jaw/mouth/head系Boneを口パクに連動させます。
  // Bone名がモデルによって違うため、まず window.listBones() で確認してください。
  mouthBoneEnabled: false,
  mouthBoneName: '',
  mouthBoneAxis: 'x',
  mouthBoneOpenDeg: 8
};

// ===== Bone pose preset =====
// 現在のGLBがT-poseの場合、腕を前へ下ろすための簡易Boneポーズです。
// Boneのローカル軸はモデルごとに違うため、Consoleの window.setBoneRotation() で微調整してください。
const BONE_POSE = {
  enabled: true,
  activePreset: 'handsFrontLower',
  autoApplyOnLoad: true,
  stopAnimationOnApply: true,

  presets: {
    // まずの初期値。合わない場合はConsoleで各Boneのx/y/zを調整してください。
    handsFront: {
      // 肩を少し内側・下へ。T-poseの腕を下ろす目的。
      L_Clavicle: { x: 0, y: 0, z: 5 },
      R_Clavicle: { x: 0, y: 0, z: -5 },

      // 上腕: T-poseから腕を下げ、少し前へ寄せる。
      L_Upperarm: { x: 4, y: 0, z: 72 },
      R_Upperarm: { x: 4, y: 0, z: -72 },

      // 前腕: 肘を曲げて手を腹部〜股前へ寄せる。
      L_Forearm: { x: 0, y: 26, z: 38 },
      R_Forearm: { x: 0, y: -26, z: -38 },

      // 手首: 手のひらを前・内側へ寄せる。
      L_Hand: { x: 0, y: 0, z: 12 },
      R_Hand: { x: 0, y: 0, z: -12 }
    },

    // 失敗時の代替。軸が合わないモデル向け。
    handsFrontAlt: {
      L_Clavicle: { x: 0, y: 6, z: 0 },
      R_Clavicle: { x: 0, y: -6, z: 0 },
      L_Upperarm: { x: 68, y: 0, z: 0 },
      R_Upperarm: { x: 68, y: 0, z: 0 },
      L_Forearm: { x: 40, y: 0, z: 0 },
      R_Forearm: { x: 40, y: 0, z: 0 },
      L_Hand: { x: 10, y: 0, z: 0 },
      R_Hand: { x: 10, y: 0, z: 0 }
    },

    // handsFrontAltよりも腕・手を下げるプリセット。
    // 現在のモデルでは主にUpperarm.xを増やすと肘が下がり、Forearm.xを増やすと手首側が下がります。
    handsFrontLower: {
      L_Clavicle: { x: 0, y: 6, z: 0 },
      R_Clavicle: { x: 0, y: -6, z: 0 },
      L_Upperarm: { x: 84, y: 0, z: 0 },
      R_Upperarm: { x: 84, y: 0, z: 0 },
      L_Forearm: { x: 58, y: 0, z: 0 },
      R_Forearm: { x: 58, y: 0, z: 0 },
      L_Hand: { x: 14, y: 0, z: 0 },
      R_Hand: { x: 14, y: 0, z: 0 }
    },

    // さらに下げたい場合の強めプリセット。
    handsFrontVeryLower: {
      L_Clavicle: { x: 0, y: 6, z: 0 },
      R_Clavicle: { x: 0, y: -6, z: 0 },
      L_Upperarm: { x: 94, y: 0, z: 0 },
      R_Upperarm: { x: 94, y: 0, z: 0 },
      L_Forearm: { x: 70, y: 0, z: 0 },
      R_Forearm: { x: 70, y: 0, z: 0 },
      L_Hand: { x: 18, y: 0, z: 0 },
      R_Hand: { x: 18, y: 0, z: 0 }
    }
  }
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

  // マイク入力用Analyser。VADに使います。
  analyser: null,
  analyserData: null,

  // TTS再生音声用Analyser。口パクに使います。
  ttsAnalyser: null,
  ttsAnalyserData: null,
  mouthOpen: 0,
  mouthTarget: 0,

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
  sessionId: crypto.randomUUID?.() || String(Date.now()),

  skeletonPaused: false
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const HOLOGRAM_FOG = new THREE.FogExp2(0x020812, 0.055);
scene.fog = HOLOGRAM.useFog ? HOLOGRAM_FOG : null;

const camera = new THREE.PerspectiveCamera(32, stage.clientWidth / stage.clientHeight, 0.1, 100);
camera.position.set(AVATAR_VIEW.cameraX, AVATAR_VIEW.cameraY, AVATAR_VIEW.cameraZ);
camera.lookAt(AVATAR_VIEW.lookAtX, AVATAR_VIEW.lookAtY, AVATAR_VIEW.lookAtZ);

const root = new THREE.Group();
scene.add(root);

const avatarGroup = new THREE.Group();
avatarGroup.position.set(AVATAR_VIEW.x, AVATAR_VIEW.y, AVATAR_VIEW.z);
avatarGroup.rotation.y = THREE.MathUtils.degToRad(AVATAR_VIEW.yawDeg);
root.add(avatarGroup);

const clock = new THREE.Clock();
const avatarMaterials = [];
const originalAvatarMaterials = new Map();
let avatarRoot = null;
let baseDisc = null;
let baseCone = null;
let projectionBaseGroup = null;

let mouthOverlay = null;
let mouthHole = null;
let mouthRim = null;

// 将来、morph target付きGLBに差し替えた時用。
// 今のGLBにjawOpen等が無い場合は、口オーバーレイだけで動きます。
let mouthMorphMesh = null;
let mouthMorphDict = null;
let mouthMorphInfluences = null;

let animationMixer = null;
let animationActions = [];
let activeAnimationAction = null;
let skeletonHelpers = [];
let bones = [];
let bonesByName = new Map();
let originalBoneTransforms = new Map();
let loadedAnimations = [];

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
    opacity: HOLOGRAM.materialOpacity,
    emissive: 0xeaf8ff,
    emissiveIntensity: HOLOGRAM.emissiveIntensity,
    depthWrite: false,
    side: THREE.FrontSide
  });
}

function prepareAvatarMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (!originalAvatarMaterials.has(child)) {
      originalAvatarMaterials.set(child, child.material);
    }
    child.frustumCulled = false;
  });
  setHologramEnabled(HOLOGRAM.enabled, false);
}

function setHologramEnabled(enabled = true, shouldLog = true) {
  HOLOGRAM.enabled = !!enabled;
  avatarMaterials.length = 0;

  if (avatarRoot) {
    avatarRoot.traverse((child) => {
      if (!child.isMesh) return;

      if (HOLOGRAM.enabled && HOLOGRAM.useMaterial) {
        if (!child.userData.hologramMaterial) {
          child.userData.hologramMaterial = buildHologramMaterial();
        }
        child.material = child.userData.hologramMaterial;
        child.renderOrder = 1;
        avatarMaterials.push(child.material);
      } else {
        child.material = originalAvatarMaterials.get(child) || child.material;
        child.renderOrder = 0;
      }
    });
  }

  scene.fog = HOLOGRAM.enabled && HOLOGRAM.useFog ? HOLOGRAM_FOG : null;
  if (particles) particles.visible = HOLOGRAM.enabled && HOLOGRAM.useParticles;
  if (projectionBaseGroup) projectionBaseGroup.visible = HOLOGRAM.enabled && HOLOGRAM.useBase;

  if (shouldLog) {
    console.log('[hologram]', {
      ...HOLOGRAM,
      avatarMaterialCount: avatarMaterials.length
    });
  }
}

function updateHologramMaterials(elapsed = 0) {
  if (!HOLOGRAM.enabled || !HOLOGRAM.useMaterial) return;

  for (const mat of avatarMaterials) {
    mat.transparent = true;
    mat.depthWrite = false;
    mat.opacity =
      HOLOGRAM.materialOpacity +
      state.talkLevel * HOLOGRAM.materialTalkOpacityBoost +
      (HOLOGRAM.useFlicker ? Math.sin(elapsed * 5.5) * state.talkLevel * HOLOGRAM.materialFlickerAmount : 0);
    mat.emissiveIntensity = HOLOGRAM.emissiveIntensity + state.talkLevel * HOLOGRAM.emissiveTalkBoost;
    mat.needsUpdate = true;
  }
}

function updateCameraView() {
  camera.position.set(AVATAR_VIEW.cameraX, AVATAR_VIEW.cameraY, AVATAR_VIEW.cameraZ);
  camera.lookAt(AVATAR_VIEW.lookAtX, AVATAR_VIEW.lookAtY, AVATAR_VIEW.lookAtZ);
  camera.updateProjectionMatrix();
}

function applyAvatarTransform(elapsed = 0) {
  const floatY = Math.sin(elapsed * 0.72) * AVATAR_VIEW.floatAmount;
  const idleYaw = Math.sin(elapsed * 0.18) * THREE.MathUtils.degToRad(AVATAR_VIEW.idleYawDeg);

  avatarGroup.position.set(AVATAR_VIEW.x, AVATAR_VIEW.y + floatY, AVATAR_VIEW.z);
  avatarGroup.rotation.set(
    THREE.MathUtils.degToRad(AVATAR_VIEW.pitchDeg || 0),
    THREE.MathUtils.degToRad(AVATAR_VIEW.yawDeg || 0) + idleYaw,
    THREE.MathUtils.degToRad(AVATAR_VIEW.rollDeg || 0)
  );
}

function fitModel(object) {
  if (!object) return;

  // 何度でも再フィットできるよう、元のスケール・位置に戻してからBoxを測ります。
  object.scale.setScalar(1);
  object.position.set(0, 0, 0);
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = AVATAR_VIEW.targetHeight / Math.max(size.y, 0.0001);

  object.scale.setScalar(scale);
  object.position.set(
    -center.x * scale + (AVATAR_VIEW.fitOffsetX || 0),
    -center.y * scale + (AVATAR_VIEW.fitOffsetY || 0),
    -center.z * scale + (AVATAR_VIEW.fitOffsetZ || 0)
  );

  object.updateMatrixWorld(true);
}

function getAvatarBounds() {
  if (!avatarRoot) return null;
  avatarRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(avatarRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return {
    size: { x: size.x, y: size.y, z: size.z },
    center: { x: center.x, y: center.y, z: center.z },
    avatarGroup: {
      x: avatarGroup.position.x,
      y: avatarGroup.position.y,
      z: avatarGroup.position.z,
      yawDeg: THREE.MathUtils.radToDeg(avatarGroup.rotation.y)
    }
  };
}

window.setAvatarView = (patch = {}) => {
  Object.assign(AVATAR_VIEW, patch);

  const needsRefit = [
    'targetHeight',
    'fitOffsetX',
    'fitOffsetY',
    'fitOffsetZ'
  ].some((key) => Object.prototype.hasOwnProperty.call(patch, key));

  if (needsRefit && avatarRoot) fitModel(avatarRoot);

  updateCameraView();
  applyAvatarTransform(clock.elapsedTime || 0);
  updateMouthOverlay(state.mouthOpen || 0, clock.elapsedTime || 0);

  console.log('[avatar view]', AVATAR_VIEW);
  console.log('[avatar bounds]', getAvatarBounds());
};

window.refitAvatar = (patch = {}) => {
  Object.assign(AVATAR_VIEW, patch);
  if (avatarRoot) fitModel(avatarRoot);
  updateCameraView();
  applyAvatarTransform(clock.elapsedTime || 0);
  console.log('[avatar refit]', AVATAR_VIEW);
  console.log('[avatar bounds]', getAvatarBounds());
};

window.setHologram = (enabledOrPatch = true, patch = {}) => {
  if (typeof enabledOrPatch === 'object') {
    Object.assign(HOLOGRAM, enabledOrPatch);
  } else {
    HOLOGRAM.enabled = !!enabledOrPatch;
    Object.assign(HOLOGRAM, patch);
  }

  setHologramEnabled(HOLOGRAM.enabled, true);
};

window.toggleHologram = () => {
  window.setHologram(!HOLOGRAM.enabled);
};

window.getAvatarDebug = () => {
  const debug = {
    AVATAR_VIEW: { ...AVATAR_VIEW },
    MOUTH_OVERLAY: { ...MOUTH_OVERLAY },
    HOLOGRAM: { ...HOLOGRAM },
    SKELETON: { ...SKELETON },
    BONE_POSE: JSON.parse(JSON.stringify(BONE_POSE)),
    skeleton: { boneCount: bones.length, animationCount: loadedAnimations.length, activeAnimation: activeAnimationAction?._clip?.name || null },
    bounds: getAvatarBounds()
  };
  console.log('[avatar debug]', debug);
  return debug;
};

window.copyAvatarSettings = async () => {
  const settings = {
    AVATAR_VIEW,
    MOUTH_OVERLAY,
    HOLOGRAM,
    SKELETON
  };
  const text = JSON.stringify(settings, null, 2);
  console.log(text);

  try {
    await navigator.clipboard.writeText(text);
    console.log('[avatar settings copied]');
  } catch (_) {
    console.log('[avatar settings copy failed. copy from console output.]');
  }

  return settings;
};

window.applyHumanPreset = () => {
  window.setAvatarView({
    yawDeg: -90,
    pitchDeg: 0,
    rollDeg: 0,
    x: 0,
    y: -0.4,
    z: -1.35,
    cameraX: 0,
    cameraY: 0.35,
    cameraZ: 4.8,
    lookAtX: 0,
    lookAtY: 0.15,
    lookAtZ: 0,
    targetHeight: 4.9,
    fitOffsetX: 0,
    fitOffsetY: -0.55,
    fitOffsetZ: 0,
    idleYawDeg: 0.35,
    floatAmount: 0.01
  });

  window.setMouthOverlay({
    attachTo: 'root',
    enabled: true,
    visible: true,
    alwaysVisible: true,
    x: 0,
    y: 0.84,
    z: -0.7,
    width: 0.18,
    closedHeight: 0.008,
    openHeight: 0.07,
    rimOpacity: 0.34,
    openPower: 1.15,
    moveDownWhileOpen: 0.012,
    widenWhileOpen: 0.1,
    fallbackWaveSpeedA: 11,
    fallbackWaveSpeedB: 17.7,
    smooth: 16
  });

  window.setHologram({
    enabled: false,
    useMaterial: true,
    useParticles: true,
    useBase: true,
    useFog: true,
    useFlicker: true,
    materialOpacity: 0.05,
    materialTalkOpacityBoost: 0.12,
    materialFlickerAmount: 0.02,
    emissiveIntensity: 0.018,
    emissiveTalkBoost: 0.065
  });

  window.setSkeleton({
    enabled: true,
    autoPlay: false,
    animationIndex: 0,
    animationName: '',
    timeScale: 1,
    loop: 'repeat',
    clampWhenFinished: false,
    showHelper: false
  });
};

window.applyFacePreset = () => {
  window.setAvatarView({
    yawDeg: -90,
    pitchDeg: 0,
    rollDeg: 0,
    x: 0,
    y: 1.0,
    z: -1.2,
    cameraX: 0,
    cameraY: 0.35,
    cameraZ: 7.8,
    lookAtX: 0,
    lookAtY: 0,
    lookAtZ: 0,
    targetHeight: 6.25,
    fitOffsetX: 0,
    fitOffsetY: -0.35,
    fitOffsetZ: 0,
    idleYawDeg: 1.0,
    floatAmount: 0.026
  });

  window.setMouthOverlay({
    attachTo: 'root',
    enabled: true,
    visible: true,
    x: 0.0,
    y: -0.15,
    z: -0.55,
    width: 0.68,
    closedHeight: 0.010,
    openHeight: 0.150,
    moveDownWhileOpen: 0.025
  });
};


function getLoopMode(loopName) {
  const value = String(loopName || '').toLowerCase();
  if (value === 'once') return THREE.LoopOnce;
  if (value === 'pingpong' || value === 'ping_pong') return THREE.LoopPingPong;
  return THREE.LoopRepeat;
}

function collectSkeletonData(rootObject, animations = []) {
  bones = [];
  bonesByName = new Map();
  originalBoneTransforms = new Map();
  skeletonHelpers.forEach((helper) => {
    if (helper.parent) helper.parent.remove(helper);
    helper.dispose?.();
  });
  skeletonHelpers = [];

  rootObject.traverse((child) => {
    if (child.isBone) {
      bones.push(child);
      if (child.name) bonesByName.set(child.name, child);
      originalBoneTransforms.set(child.uuid, {
        position: child.position.clone(),
        rotation: child.rotation.clone(),
        scale: child.scale.clone()
      });
    }
  });

  loadedAnimations = animations || [];

  if (loadedAnimations.length > 0) {
    animationMixer = new THREE.AnimationMixer(rootObject);
    animationActions = loadedAnimations.map((clip) => {
      const action = animationMixer.clipAction(clip);
      action.enabled = true;
      action.clampWhenFinished = !!SKELETON.clampWhenFinished;
      action.setLoop(getLoopMode(SKELETON.loop), Infinity);
      return action;
    });
  } else {
    animationMixer = null;
    animationActions = [];
    activeAnimationAction = null;
  }

  if (SKELETON.showHelper) showSkeletonHelper(true);

  if (SKELETON.logOnLoad) {
    console.group('[skeleton]');
    console.log({
      boneCount: bones.length,
      animationCount: loadedAnimations.length,
      animations: loadedAnimations.map((clip, index) => ({
        index,
        name: clip.name,
        duration: clip.duration,
        tracks: clip.tracks?.length || 0
      })),
      bones: bones.map((bone, index) => ({
        index,
        name: bone.name,
        parent: bone.parent?.name || null,
        children: bone.children?.map((c) => c.name).filter(Boolean) || []
      }))
    });
    console.groupEnd();
  }

  if (SKELETON.autoPlay && loadedAnimations.length > 0) {
    const target = SKELETON.animationName || SKELETON.animationIndex || 0;
    playSkeletonAnimation(target);
  }

  if (BONE_POSE.enabled && BONE_POSE.autoApplyOnLoad) {
    window.setTimeout(() => {
      window.applyBonePose?.(BONE_POSE.activePreset, { resetFirst: true });
    }, 0);
  }
}

function findBone(query) {
  if (!query && query !== 0) return null;
  if (typeof query === 'number') return bones[query] || null;

  const q = String(query).toLowerCase();
  if (bonesByName.has(query)) return bonesByName.get(query);

  return bones.find((bone) => String(bone.name || '').toLowerCase() === q)
    || bones.find((bone) => String(bone.name || '').toLowerCase().includes(q))
    || null;
}

function findAnimation(target) {
  if (!loadedAnimations.length) return { clip: null, index: -1 };

  if (typeof target === 'number') {
    const index = Math.max(0, Math.min(loadedAnimations.length - 1, Math.floor(target)));
    return { clip: loadedAnimations[index], index };
  }

  const q = String(target || '').toLowerCase();
  const index = loadedAnimations.findIndex((clip) => String(clip.name || '').toLowerCase() === q);
  if (index >= 0) return { clip: loadedAnimations[index], index };

  const partial = loadedAnimations.findIndex((clip) => String(clip.name || '').toLowerCase().includes(q));
  if (partial >= 0) return { clip: loadedAnimations[partial], index: partial };

  return { clip: loadedAnimations[0], index: 0 };
}

window.inspectSkeleton = () => {
  const summary = {
    skeletonEnabled: SKELETON.enabled,
    boneCount: bones.length,
    animationCount: loadedAnimations.length,
    activeAnimation: activeAnimationAction?._clip?.name || null,
    animations: loadedAnimations.map((clip, index) => ({
      index,
      name: clip.name,
      duration: clip.duration,
      tracks: clip.tracks?.length || 0
    })),
    bones: bones.map((bone, index) => ({
      index,
      name: bone.name,
      parent: bone.parent?.name || null,
      position: { x: bone.position.x, y: bone.position.y, z: bone.position.z },
      rotationDeg: {
        x: THREE.MathUtils.radToDeg(bone.rotation.x),
        y: THREE.MathUtils.radToDeg(bone.rotation.y),
        z: THREE.MathUtils.radToDeg(bone.rotation.z)
      }
    }))
  };
  console.log('[skeleton inspect]', summary);
  return summary;
};

window.listBones = () => {
  const list = bones.map((bone, index) => ({
    index,
    name: bone.name,
    parent: bone.parent?.name || null,
    children: bone.children?.map((c) => c.name).filter(Boolean) || []
  }));
  console.table(list);
  return list;
};

window.listAnimations = () => {
  const list = loadedAnimations.map((clip, index) => ({
    index,
    name: clip.name,
    duration: clip.duration,
    tracks: clip.tracks?.length || 0
  }));
  console.table(list);
  return list;
};

window.setSkeleton = (patch = {}) => {
  Object.assign(SKELETON, patch || {});
  if (activeAnimationAction) {
    activeAnimationAction.timeScale = SKELETON.timeScale;
    activeAnimationAction.clampWhenFinished = !!SKELETON.clampWhenFinished;
    activeAnimationAction.setLoop(getLoopMode(SKELETON.loop), Infinity);
  }
  showSkeletonHelper(!!SKELETON.showHelper);
  console.log('[skeleton settings]', SKELETON);
};

window.playSkeletonAnimation = (target = 0, options = {}) => {
  if (!animationMixer || !animationActions.length) {
    console.warn('[skeleton animation] no animations found in this GLB. Re-export with animation, or check animation count in the exporter.');
    return null;
  }

  Object.assign(SKELETON, options || {});
  const { clip, index } = findAnimation(target);
  if (!clip || index < 0) {
    console.warn('[skeleton animation] animation not found:', target);
    return null;
  }

  if (activeAnimationAction) activeAnimationAction.fadeOut(0.18);

  const action = animationActions[index];
  action.reset();
  action.enabled = true;
  action.timeScale = Number(SKELETON.timeScale) || 1;
  action.clampWhenFinished = !!SKELETON.clampWhenFinished;
  action.setLoop(getLoopMode(SKELETON.loop), Infinity);
  action.fadeIn(0.18).play();

  activeAnimationAction = action;
  state.skeletonPaused = false;
  SKELETON.enabled = true;

  console.log('[skeleton animation play]', { index, name: clip.name, duration: clip.duration, settings: SKELETON });
  return action;
};

window.stopSkeletonAnimation = () => {
  if (activeAnimationAction) {
    activeAnimationAction.stop();
    activeAnimationAction = null;
  }
  if (animationMixer) animationMixer.stopAllAction();
  console.log('[skeleton animation stop]');
};

window.pauseSkeletonAnimation = (paused = true) => {
  state.skeletonPaused = !!paused;
  console.log('[skeleton animation paused]', state.skeletonPaused);
};

window.setAnimationTimeScale = (timeScale = 1) => {
  SKELETON.timeScale = Number(timeScale) || 1;
  if (activeAnimationAction) activeAnimationAction.timeScale = SKELETON.timeScale;
  console.log('[skeleton animation timeScale]', SKELETON.timeScale);
};

window.showSkeletonHelper = function showSkeletonHelper(visible = true) {
  SKELETON.showHelper = !!visible;

  if (!avatarRoot) {
    console.warn('[skeleton helper] avatar not loaded yet.');
    return;
  }

  if (SKELETON.showHelper && skeletonHelpers.length === 0) {
    avatarRoot.traverse((child) => {
      if (!child.isSkinnedMesh) return;
      const helper = new THREE.SkeletonHelper(child);
      helper.material.depthTest = false;
      helper.material.transparent = true;
      helper.material.opacity = 0.85;
      helper.material.color.setHex(SKELETON.helperColor);
      helper.renderOrder = 999;
      skeletonHelpers.push(helper);
      scene.add(helper);
    });
  }

  skeletonHelpers.forEach((helper) => { helper.visible = SKELETON.showHelper; });
  console.log('[skeleton helper visible]', SKELETON.showHelper, 'helpers:', skeletonHelpers.length);
};

window.setBoneRotation = (boneQuery, rotationDeg = {}, additive = false) => {
  const bone = findBone(boneQuery);
  if (!bone) {
    console.warn('[bone not found]', boneQuery);
    return null;
  }

  const rx = THREE.MathUtils.degToRad(Number(rotationDeg.x || 0));
  const ry = THREE.MathUtils.degToRad(Number(rotationDeg.y || 0));
  const rz = THREE.MathUtils.degToRad(Number(rotationDeg.z || 0));

  if (additive) {
    bone.rotation.x += rx;
    bone.rotation.y += ry;
    bone.rotation.z += rz;
  } else {
    const original = originalBoneTransforms.get(bone.uuid);
    if (original) bone.rotation.copy(original.rotation);
    bone.rotation.x += rx;
    bone.rotation.y += ry;
    bone.rotation.z += rz;
  }

  bone.updateMatrixWorld(true);
  console.log('[bone rotation]', bone.name, {
    x: THREE.MathUtils.radToDeg(bone.rotation.x),
    y: THREE.MathUtils.radToDeg(bone.rotation.y),
    z: THREE.MathUtils.radToDeg(bone.rotation.z)
  });
  return bone;
};

window.setBonePosition = (boneQuery, position = {}, additive = false) => {
  const bone = findBone(boneQuery);
  if (!bone) {
    console.warn('[bone not found]', boneQuery);
    return null;
  }

  if (!additive) {
    const original = originalBoneTransforms.get(bone.uuid);
    if (original) bone.position.copy(original.position);
  }

  bone.position.x += Number(position.x || 0);
  bone.position.y += Number(position.y || 0);
  bone.position.z += Number(position.z || 0);
  bone.updateMatrixWorld(true);
  console.log('[bone position]', bone.name, bone.position);
  return bone;
};

window.resetBone = (boneQuery) => {
  const bone = findBone(boneQuery);
  if (!bone) {
    console.warn('[bone not found]', boneQuery);
    return null;
  }
  const original = originalBoneTransforms.get(bone.uuid);
  if (!original) return bone;
  bone.position.copy(original.position);
  bone.rotation.copy(original.rotation);
  bone.scale.copy(original.scale);
  bone.updateMatrixWorld(true);
  console.log('[bone reset]', bone.name);
  return bone;
};

window.resetAllBones = () => {
  bones.forEach((bone) => {
    const original = originalBoneTransforms.get(bone.uuid);
    if (!original) return;
    bone.position.copy(original.position);
    bone.rotation.copy(original.rotation);
    bone.scale.copy(original.scale);
    bone.updateMatrixWorld(true);
  });
  console.log('[bones reset all]', bones.length);
};


function applyBoneRotations(rotationMap = {}, options = {}) {
  const resetFirst = options.resetFirst !== false;
  const additive = !!options.additive;
  const applied = [];
  const missing = [];

  if (resetFirst) {
    for (const boneName of Object.keys(rotationMap)) {
      const bone = findBone(boneName);
      if (!bone) continue;
      const original = originalBoneTransforms.get(bone.uuid);
      if (original) {
        bone.position.copy(original.position);
        bone.rotation.copy(original.rotation);
        bone.scale.copy(original.scale);
      }
    }
  }

  for (const [boneName, rotationDeg] of Object.entries(rotationMap)) {
    const bone = findBone(boneName);
    if (!bone) {
      missing.push(boneName);
      continue;
    }

    const rx = THREE.MathUtils.degToRad(Number(rotationDeg.x || 0));
    const ry = THREE.MathUtils.degToRad(Number(rotationDeg.y || 0));
    const rz = THREE.MathUtils.degToRad(Number(rotationDeg.z || 0));

    if (!additive && !resetFirst) {
      const original = originalBoneTransforms.get(bone.uuid);
      if (original) bone.rotation.copy(original.rotation);
    }

    bone.rotation.x += rx;
    bone.rotation.y += ry;
    bone.rotation.z += rz;
    bone.updateMatrixWorld(true);

    applied.push({
      name: bone.name,
      rotationDeg: {
        x: THREE.MathUtils.radToDeg(bone.rotation.x),
        y: THREE.MathUtils.radToDeg(bone.rotation.y),
        z: THREE.MathUtils.radToDeg(bone.rotation.z)
      }
    });
  }

  if (applied.length) console.table(applied);
  if (missing.length) console.warn('[pose missing bones]', missing);
  return { applied, missing };
}

window.applyBonePose = (presetName = BONE_POSE.activePreset, options = {}) => {
  const preset = typeof presetName === 'string' ? BONE_POSE.presets[presetName] : presetName;
  if (!preset) {
    console.warn('[bone pose] preset not found:', presetName, Object.keys(BONE_POSE.presets));
    return null;
  }

  if (options.stopAnimation !== false && BONE_POSE.stopAnimationOnApply) {
    window.stopSkeletonAnimation?.();
  }

  const result = applyBoneRotations(preset, {
    resetFirst: options.resetFirst !== false,
    additive: !!options.additive
  });

  BONE_POSE.activePreset = typeof presetName === 'string' ? presetName : 'custom';
  console.log('[bone pose applied]', BONE_POSE.activePreset, result);
  return result;
};

window.applyHandsFrontPose = (options = {}) => window.applyBonePose('handsFront', options);
window.applyHandsFrontAltPose = (options = {}) => window.applyBonePose('handsFrontAlt', options);
window.applyHandsFrontLowerPose = (options = {}) => window.applyBonePose('handsFrontLower', options);
window.applyHandsFrontVeryLowerPose = (options = {}) => window.applyBonePose('handsFrontVeryLower', options);

window.setBonePosePreset = (name, preset) => {
  if (!name || !preset || typeof preset !== 'object') {
    console.warn('Usage: window.setBonePosePreset("myPose", { L_Upperarm:{x:0,y:0,z:70}, ... })');
    return;
  }
  BONE_POSE.presets[name] = preset;
  console.log('[bone pose preset saved]', name, preset);
};

window.getCurrentBoneRotations = (names = []) => {
  const targetNames = names.length ? names : [
    'L_Clavicle', 'L_Upperarm', 'L_Forearm', 'L_Hand',
    'R_Clavicle', 'R_Upperarm', 'R_Forearm', 'R_Hand'
  ];

  const result = {};
  for (const name of targetNames) {
    const bone = findBone(name);
    if (!bone) continue;
    const original = originalBoneTransforms.get(bone.uuid);
    const rx = original ? bone.rotation.x - original.rotation.x : bone.rotation.x;
    const ry = original ? bone.rotation.y - original.rotation.y : bone.rotation.y;
    const rz = original ? bone.rotation.z - original.rotation.z : bone.rotation.z;
    result[bone.name] = {
      x: Number(THREE.MathUtils.radToDeg(rx).toFixed(3)),
      y: Number(THREE.MathUtils.radToDeg(ry).toFixed(3)),
      z: Number(THREE.MathUtils.radToDeg(rz).toFixed(3))
    };
  }
  console.log('[current bone rotations relative to original]', result);
  return result;
};

window.setMouthBone = (config = {}) => {
  Object.assign(SKELETON, {
    mouthBoneEnabled: true,
    ...config
  });

  const bone = findMouthBone();
  if (!bone) {
    console.warn('[mouth bone] jaw/mouth系Boneが見つかりません。現在の骨一覧ではBone口パクは使えない可能性が高いです。overlayを使います。', SKELETON);
    return null;
  }

  console.log('[mouth bone enabled]', bone.name, SKELETON);
  return bone;
};

window.disableMouthBone = () => {
  SKELETON.mouthBoneEnabled = false;
  console.log('[mouth bone disabled] overlay fallback only.');
};

window.inspectMouthCapability = () => {
  const candidates = bones.filter((bone) => /jaw|mouth|chin|lip|mandible|口|顎|あご/i.test(bone.name || ''))
    .map((bone) => ({ name: bone.name, parent: bone.parent?.name || null }));
  const morphs = [];
  if (avatarRoot) {
    avatarRoot.traverse((child) => {
      if (!child.isMesh || !child.morphTargetDictionary) return;
      morphs.push({ name: child.name, morphTargetDictionary: child.morphTargetDictionary });
    });
  }
  const result = { mouthBoneCandidates: candidates, morphTargets: morphs, overlayEnabled: MOUTH_OVERLAY.enabled };
  console.log('[mouth capability]', result);
  return result;
};

function findMouthBone() {
  // Headは口ではないので自動候補から除外します。
  // 口パク用Boneが無い場合はoverlayへフォールバックします。
  if (SKELETON.mouthBoneName) return findBone(SKELETON.mouthBoneName);

  const candidates = [
    'jaw', 'mouth', 'chin', 'lowerjaw', 'lower_jaw', 'mandible',
    'lip', 'lowerlip', 'lower_lip', '口', '顎', 'あご'
  ];

  for (const name of candidates) {
    const bone = findBone(name);
    if (bone) return bone;
  }

  return null;
}

function applySkeletonMouth(open) {
  if (!SKELETON.mouthBoneEnabled) return;
  const bone = findMouthBone();
  if (!bone) return;
  const original = originalBoneTransforms.get(bone.uuid);
  if (original) bone.rotation.copy(original.rotation);

  const axis = ['x', 'y', 'z'].includes(SKELETON.mouthBoneAxis) ? SKELETON.mouthBoneAxis : 'x';
  bone.rotation[axis] += THREE.MathUtils.degToRad((Number(SKELETON.mouthBoneOpenDeg) || 0) * open);
  bone.updateMatrixWorld(true);
}

function findMouthMorphMesh(rootObject) {
  let found = null;

  rootObject.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.morphTargetDictionary || !child.morphTargetInfluences) return;

    const names = Object.keys(child.morphTargetDictionary).map((name) => String(name).toLowerCase());
    const hasMouth =
      names.some((name) => name.includes('jawopen')) ||
      names.some((name) => name.includes('mouthopen')) ||
      names.some((name) => name.includes('mouth_a')) ||
      names.some((name) => name === 'aa') ||
      names.some((name) => name === 'a');

    if (hasMouth) found = child;
  });

  return found;
}

function setMorph(nameCandidates, value) {
  if (!mouthMorphMesh || !mouthMorphDict || !mouthMorphInfluences) return;

  const names = Array.isArray(nameCandidates) ? nameCandidates : [nameCandidates];

  for (const candidate of names) {
    const lowerCandidate = String(candidate).toLowerCase();

    for (const [key, index] of Object.entries(mouthMorphDict)) {
      const lowerKey = String(key).toLowerCase();

      if (
        lowerKey === lowerCandidate ||
        lowerKey.endsWith(`.${lowerCandidate}`) ||
        lowerKey.includes(lowerCandidate)
      ) {
        mouthMorphInfluences[index] = THREE.MathUtils.clamp(value, 0, 1);
        return;
      }
    }
  }
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
  console.log('[GLB animations]', gltf.animations?.map((clip, index) => ({ index, name: clip.name, duration: clip.duration, tracks: clip.tracks?.length || 0 })) || []);
  console.groupEnd();
  collectSkeletonData(avatarRoot, gltf.animations || []);
  prepareAvatarMaterials(avatarRoot);
  fitModel(avatarRoot);
  updateCameraView();
  applyAvatarTransform(clock.elapsedTime || 0);

  mouthMorphMesh = findMouthMorphMesh(avatarRoot);
  if (mouthMorphMesh) {
    mouthMorphDict = mouthMorphMesh.morphTargetDictionary;
    mouthMorphInfluences = mouthMorphMesh.morphTargetInfluences;
    console.log('[mouth morph detected]', mouthMorphMesh.name, mouthMorphDict);
  } else {
    console.log('[mouth morph] none. using mouth overlay fallback.');
  }

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
  points.visible = HOLOGRAM.enabled && HOLOGRAM.useParticles;
  scene.add(points);
  return points;
}
const particles = createBackgroundParticles();

function createProjectionBase() {
  const group = new THREE.Group();
  projectionBaseGroup = group;
  group.visible = HOLOGRAM.enabled && HOLOGRAM.useBase;
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

function createEllipseGeometry(segments = 72) {
  const shape = new THREE.Shape();

  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * 0.5;
    const y = Math.sin(a) * 0.5;

    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }

  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function createEllipseLineGeometry(rx = 0.5, ry = 0.5, segments = 96) {
  const points = [];

  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, 0));
  }

  return new THREE.BufferGeometry().setFromPoints(points);
}

function getMouthParent() {
  return MOUTH_OVERLAY.attachTo === 'avatar' ? avatarGroup : root;
}

function attachMouthOverlay() {
  if (!mouthOverlay) return;
  const parent = getMouthParent();
  if (mouthOverlay.parent !== parent) {
    parent.add(mouthOverlay);
  }
}

function createMouthOverlay() {
  if (!MOUTH_OVERLAY.enabled) return;

  mouthOverlay = new THREE.Group();
  mouthOverlay.name = 'hologram-mouth-overlay';
  mouthOverlay.position.set(MOUTH_OVERLAY.x, MOUTH_OVERLAY.y, MOUTH_OVERLAY.z);
  mouthOverlay.renderOrder = 100;

  const holeMaterial = new THREE.MeshBasicMaterial({
    color: 0x020407,
    transparent: true,
    opacity: MOUTH_OVERLAY.alwaysVisible ? 0.86 : 0.0,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const rimMaterial = new THREE.LineBasicMaterial({
    color: 0xf3fbff,
    transparent: true,
    opacity: MOUTH_OVERLAY.alwaysVisible ? MOUTH_OVERLAY.rimOpacity : 0.0,
    depthTest: false,
    depthWrite: false
  });

  mouthHole = new THREE.Mesh(createEllipseGeometry(96), holeMaterial);
  mouthHole.name = 'mouth-hole';
  mouthHole.scale.set(MOUTH_OVERLAY.width, MOUTH_OVERLAY.closedHeight, 1);
  mouthHole.renderOrder = 100;

  mouthRim = new THREE.LineLoop(
    createEllipseLineGeometry(MOUTH_OVERLAY.width * 0.5, MOUTH_OVERLAY.closedHeight * 0.5, 128),
    rimMaterial
  );
  mouthRim.name = 'mouth-rim';
  mouthRim.position.z = 0.004;
  mouthRim.renderOrder = 101;

  mouthOverlay.add(mouthHole, mouthRim);

  attachMouthOverlay();
  updateMouthOverlay(0, 0);
}

function updateMouthOverlay(open, elapsed = 0) {
  if (!mouthOverlay || !mouthHole || !mouthRim) return;

  attachMouthOverlay();
  mouthOverlay.visible = !!MOUTH_OVERLAY.enabled && !!MOUTH_OVERLAY.visible;

  const amount = THREE.MathUtils.clamp(open * MOUTH_OVERLAY.openPower, 0, 1);
  const holeHeight = MOUTH_OVERLAY.closedHeight + MOUTH_OVERLAY.openHeight * amount;
  const width = MOUTH_OVERLAY.width * (1 + amount * MOUTH_OVERLAY.widenWhileOpen);

  mouthOverlay.position.set(
    MOUTH_OVERLAY.x,
    MOUTH_OVERLAY.y - amount * MOUTH_OVERLAY.moveDownWhileOpen,
    MOUTH_OVERLAY.z
  );

  mouthHole.scale.set(width, holeHeight, 1);
  mouthHole.material.opacity = (MOUTH_OVERLAY.alwaysVisible ? 0.82 : 0.0) + amount * 0.16;

  mouthRim.geometry.dispose();
  mouthRim.geometry = createEllipseLineGeometry(width * 0.5, holeHeight * 0.5, 128);
  mouthRim.material.opacity = (MOUTH_OVERLAY.alwaysVisible ? MOUTH_OVERLAY.rimOpacity : 0.0) + amount * 0.18;
}

window.setMouthOverlay = (patch = {}) => {
  Object.assign(MOUTH_OVERLAY, patch);
  attachMouthOverlay();
  updateMouthOverlay(state.mouthOpen || 0, clock.elapsedTime || 0);
  console.log('[mouth overlay]', MOUTH_OVERLAY);
};

window.showMouthOverlay = (visible = true) => {
  MOUTH_OVERLAY.visible = !!visible;
  updateMouthOverlay(state.mouthOpen || 0, clock.elapsedTime || 0);
  console.log('[mouth overlay visible]', MOUTH_OVERLAY.visible);
};

window.previewMouth = (open = 1) => {
  state.mouthOpen = THREE.MathUtils.clamp(Number(open) || 0, 0, 1);
  updateMouthOverlay(state.mouthOpen, clock.elapsedTime || 0);
};

createMouthOverlay();

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

  const analyser = state.audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.62;

  source.connect(analyser);
  analyser.connect(state.audioContext.destination);

  state.ttsAnalyser = analyser;
  state.ttsAnalyserData = new Uint8Array(analyser.fftSize);
  state.audioSource = source;
  state.talking = true;
  setStatus('speaking');
  startCaption(text, Math.max(2200, audioBuffer.duration * 1000));
  source.onended = () => {
    if (state.audioSource === source) state.audioSource = null;
    state.talking = false;
    state.talkLevel = 0;
    state.mouthTarget = 0;
    state.mouthOpen = 0;
    state.ttsAnalyser = null;
    state.ttsAnalyserData = null;
    updateMouthOverlay(0, clock.elapsedTime || 0);
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

function getTtsDrivenMouthOpen(elapsed) {
  if (state.ttsAnalyser && state.ttsAnalyserData) {
    state.ttsAnalyser.getByteTimeDomainData(state.ttsAnalyserData);

    let sum = 0;
    for (let i = 0; i < state.ttsAnalyserData.length; i += 1) {
      const v = (state.ttsAnalyserData[i] - 128) / 128;
      sum += v * v;
    }

    const rms = Math.sqrt(sum / state.ttsAnalyserData.length);
    return THREE.MathUtils.clamp(rms * 5.4, 0, 1);
  }

  if (state.talking) {
    const a = Math.sin(elapsed * MOUTH_OVERLAY.fallbackWaveSpeedA);
    const b = Math.sin(elapsed * MOUTH_OVERLAY.fallbackWaveSpeedB);
    return THREE.MathUtils.clamp(0.42 + a * 0.24 + b * 0.16, 0.10, 0.90);
  }

  return 0;
}

function updateMouth(delta, elapsed) {
  const target = getTtsDrivenMouthOpen(elapsed);

  state.mouthTarget = target;
  state.mouthOpen +=
    (state.mouthTarget - state.mouthOpen) *
    Math.min(1, delta * MOUTH_OVERLAY.smooth);

  const open = state.talking ? state.mouthOpen : 0;

  if (mouthMorphMesh) {
    setMorph(['jawOpen', 'mouthOpen'], open * 0.90);
    setMorph(['mouthA', 'mouth_a', 'aa', 'A'], open * 0.75);
    setMorph(['mouthFunnel', 'mouthPucker'], open * 0.18);
  }

  const beforeBone = findMouthBone();
  applySkeletonMouth(open);

  // Bone口パクが有効で実際のmouth/jaw系Boneが見つかっている場合は、オーバーレイを閉じる/非表示にできます。
  // ただし現在のGLBにjaw/mouth系Boneが無い場合は、オーバーレイにフォールバックします。
  if (SKELETON.mouthBoneEnabled && beforeBone && MOUTH_OVERLAY.hideWhenMouthBoneWorks !== false) {
    updateMouthOverlay(0, elapsed);
    if (mouthOverlay) mouthOverlay.visible = false;
  } else {
    if (mouthOverlay) mouthOverlay.visible = !!MOUTH_OVERLAY.enabled && !!MOUTH_OVERLAY.visible;
    updateMouthOverlay(open, elapsed);
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

  if (animationMixer && SKELETON.enabled && !state.skeletonPaused) {
    animationMixer.update(delta * (Number(SKELETON.timeScale) || 1));
  }

  const targetTalk = state.talking ? 1 : state.recording ? 0.35 : 0;
  state.talkLevel += (targetTalk - state.talkLevel) * Math.min(1, delta * 4.5);
  updateMouth(delta, elapsed);

  if (avatarRoot) {
    applyAvatarTransform(elapsed);
  }

  updateHologramMaterials(elapsed);

  if (baseDisc && baseCone && HOLOGRAM.enabled && HOLOGRAM.useBase) {
    baseDisc.scale.setScalar(1 + Math.sin(elapsed * 1.7) * 0.035 + state.talkLevel * 0.08);
    baseCone.material.opacity = 0.045 + state.talkLevel * 0.065;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}


window.checkAvatarConsoleFunctions = () => {
  const names = [
    'APP_BUILD',
    'setAvatarView',
    'getAvatarDebug',
    'copyAvatarSettings',
    'setMouthOverlay',
    'previewMouth',
    'showMouthOverlay',
    'setHologram',
    'toggleHologram',
    'inspectSkeleton',
    'listBones',
    'listAnimations',
    'showSkeletonHelper',
    'applyHandsFrontPose',
    'applyHandsFrontAltPose',
    'applyHandsFrontLowerPose',
    'applyHandsFrontVeryLowerPose',
    'setBonePosePreset',
    'getCurrentBoneRotations',
    'setMouthBone',
    'disableMouthBone',
    'inspectMouthCapability',
    'playSkeletonAnimation',
    'stopSkeletonAnimation',
    'pauseSkeletonAnimation',
    'setAnimationTimeScale',
    'setBoneRotation',
    'resetBone',
    'resetAllBones'
  ];
  const result = Object.fromEntries(names.map((name) => [name, typeof window[name]]));
  console.table(result);
  console.log('[app build]', window.APP_BUILD);
  return result;
};

console.info('[avatar console ready]', {
  build: window.APP_BUILD,
  inspectSkeleton: typeof window.inspectSkeleton,
  listBones: typeof window.listBones,
  listAnimations: typeof window.listAnimations,
  showSkeletonHelper: typeof window.showSkeletonHelper
});

setStatus('loading');
loadAvatar().catch((error) => {
  console.error(error);
  setStatus('error');
  setSubtitle(`GLB読み込み失敗: ${error.message}`);
});
animate();
