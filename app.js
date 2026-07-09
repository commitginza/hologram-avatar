import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const VERSION = 'webcam-hologram-1';
console.info('[webcam-hologram]', VERSION);

const stage = document.getElementById('stage');
const statusText = document.getElementById('statusText');
const captionText = document.getElementById('captionText');
const debugBox = document.getElementById('debugBox');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const mockBtn = document.getElementById('mockBtn');
const snapshotBtn = document.getElementById('snapshotBtn');

const alphaRange = document.getElementById('alphaRange');
const glowRange = document.getElementById('glowRange');
const shadowRange = document.getElementById('shadowRange');
const scanRange = document.getElementById('scanRange');
const noiseRange = document.getElementById('noiseRange');
const cutRange = document.getElementById('cutRange');
const scaleRange = document.getElementById('scaleRange');
const mirrorCheck = document.getElementById('mirrorCheck');

const state = {
  stream: null,
  videoReady: false,
  talking: false,
  talkPulse: 0,
  glitch: 0,
  status: 'standby'
};

const video = document.createElement('video');
video.autoplay = true;
video.muted = true;
video.playsInline = true;
video.setAttribute('playsinline', '');
video.style.display = 'none';
document.body.appendChild(video);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070c, 0.05);

const camera = new THREE.PerspectiveCamera(38, stage.clientWidth / stage.clientHeight, 0.1, 100);
camera.position.set(0, 0.18, 5.2);

const root = new THREE.Group();
scene.add(root);

const videoTexture = new THREE.VideoTexture(video);
videoTexture.colorSpace = THREE.SRGBColorSpace;
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
videoTexture.generateMipmaps = false;

const uniforms = {
  uVideo: { value: videoTexture },
  uTime: { value: 0 },
  uAlpha: { value: Number(alphaRange.value) },
  uGlow: { value: Number(glowRange.value) },
  uShadow: { value: Number(shadowRange.value) },
  uScan: { value: Number(scanRange.value) },
  uNoise: { value: Number(noiseRange.value) },
  uCut: { value: Number(cutRange.value) },
  uTalk: { value: 0 },
  uGlitch: { value: 0 },
  uMirror: { value: mirrorCheck.checked ? 1 : 0 }
};

const hologramMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  side: THREE.DoubleSide,
  uniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 p = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uVideo;
    uniform float uTime;
    uniform float uAlpha;
    uniform float uGlow;
    uniform float uShadow;
    uniform float uScan;
    uniform float uNoise;
    uniform float uCut;
    uniform float uTalk;
    uniform float uGlitch;
    uniform int uMirror;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    vec3 sampleVideo(vec2 uv) {
      if (uMirror == 1) uv.x = 1.0 - uv.x;
      float lineShift = sin((uv.y * 75.0) + uTime * 5.0) * 0.0025 * uGlitch;
      uv.x += lineShift;
      return texture2D(uVideo, uv).rgb;
    }

    void main() {
      vec2 uv = vUv;
      vec3 src = sampleVideo(uv);
      float lum = dot(src, vec3(0.299, 0.587, 0.114));

      // 簡易エッジ検出。輪郭だけ少し白く出してホログラムらしくする。
      vec2 px = vec2(1.0 / 900.0, 1.0 / 600.0);
      float l1 = dot(sampleVideo(uv + vec2(px.x, 0.0)), vec3(0.299, 0.587, 0.114));
      float l2 = dot(sampleVideo(uv - vec2(px.x, 0.0)), vec3(0.299, 0.587, 0.114));
      float l3 = dot(sampleVideo(uv + vec2(0.0, px.y)), vec3(0.299, 0.587, 0.114));
      float l4 = dot(sampleVideo(uv - vec2(0.0, px.y)), vec3(0.299, 0.587, 0.114));
      float edge = clamp(abs(l1 - l2) + abs(l3 - l4), 0.0, 1.0);
      edge = smoothstep(0.06, 0.26, edge);

      // 背景フェード。値を上げると暗い背景が消えやすい。
      // 完全な人物切り抜きではないため、背景が暗いほど綺麗に抜けます。
      float bgMask = smoothstep(uCut, uCut + 0.22, lum + edge * 0.28);

      float scan = sin((uv.y * 920.0) - uTime * 9.0);
      float scanLine = 0.72 + smoothstep(0.42, 1.0, scan) * 0.28 * uScan;

      float noise = rand(uv * vec2(720.0, 420.0) + uTime * 0.55) * uNoise;
      float vignette = smoothstep(0.88, 0.24, distance(uv, vec2(0.5, 0.52)));

      // 白基調：映像の色はほぼ捨て、輝度と影だけで立体感を出す。
      vec3 whiteBase = vec3(0.96, 0.975, 1.0);
      vec3 shadow = vec3(0.06, 0.07, 0.085);
      vec3 tone = mix(shadow, whiteBase, smoothstep(0.10, 0.95, lum));
      tone += edge * vec3(0.80, 0.86, 0.95);
      tone += vec3(noise * 0.08);
      tone *= scanLine;
      tone += vec3(uTalk * 0.08 + uGlitch * 0.12) * uGlow;

      float alpha = uAlpha * bgMask * vignette;
      alpha *= 0.46 + lum * 0.50 + edge * 0.55;
      alpha *= 1.0 + uTalk * 0.12;
      alpha = clamp(alpha, 0.0, 0.92);

      // 影の濃さ。値を上げると暗部が残り、立体感が増える。
      tone = mix(tone, vec3(lum), 0.06);
      tone = mix(tone, tone * (0.72 + lum * 0.42), uShadow);

      gl_FragColor = vec4(tone * uGlow, alpha);
    }
  `
});

const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.20, 2.40, 1, 1), hologramMaterial);
screen.position.set(0, 0.16, 0);
root.add(screen);

const rimMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.018, 128, 1, true), rimMaterial.clone());
baseDisc.position.set(0, -1.50, 0.02);
root.add(baseDisc);

const baseCone = new THREE.Mesh(
  new THREE.ConeGeometry(0.46, 1.15, 96, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.055, depthWrite: false, side: THREE.DoubleSide })
);
baseCone.position.set(0, -0.95, 0.02);
root.add(baseCone);

function makeParticles(count = 170) {
  const positions = [];
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    positions.push((Math.random() - 0.5) * 7.5, (Math.random() - 0.5) * 5.0, -1.5 - Math.random() * 4.5);
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
        p.y += sin(uTime * 0.25 + position.x * 1.4) * 0.025;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (20.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vFade = 0.32 + 0.22 * sin(uTime + position.x * 3.0 + position.y * 2.0);
      }
    `,
    fragmentShader: `
      varying float vFade;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float a = smoothstep(0.5, 0.0, length(d)) * vFade;
        gl_FragColor = vec4(0.90, 0.94, 1.0, a * 0.58);
      }
    `
  });
  const points = new THREE.Points(geometry, material);
  points.userData.material = material;
  return points;
}
const particles = makeParticles();
scene.add(particles);

function setStatus(text) {
  state.status = text;
  statusText.textContent = text;
  debugBox.textContent = [
    `status: ${text}`,
    `video: ${state.videoReady ? `${video.videoWidth}x${video.videoHeight}` : 'not ready'}`,
    `mirror: ${mirrorCheck.checked}`,
    `local: ${location.origin}`
  ].join('\n');
}

function updatePlaneAspect() {
  if (!video.videoWidth || !video.videoHeight) return;
  const videoAspect = video.videoWidth / video.videoHeight;
  const targetHeight = 2.8;
  const targetWidth = targetHeight * videoAspect;
  screen.geometry.dispose();
  screen.geometry = new THREE.PlaneGeometry(targetWidth, targetHeight, 1, 1);
}

async function startCamera() {
  try {
    setStatus('カメラ許可待ち...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    });
    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve) => {
      if (video.videoWidth) resolve();
      else video.onloadedmetadata = resolve;
    });
    state.videoReady = true;
    updatePlaneAspect();
    captionText.textContent = 'Webカメラ映像をホログラム化しています。背景フェードは、暗い背景ほど綺麗に効きます。';
    setStatus('カメラ起動中');
  } catch (error) {
    console.error(error);
    setStatus('カメラ起動失敗');
    captionText.textContent = 'カメラを起動できませんでした。localhost または HTTPS で開いているか、ブラウザのカメラ許可を確認してください。';
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }
  state.stream = null;
  state.videoReady = false;
  video.srcObject = null;
  setStatus('停止中');
}

function speakMock() {
  state.talking = true;
  captionText.textContent = 'こんにちは。リアルタイムWebカメラ映像を、白基調のホログラムとして投影しています。';
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(captionText.textContent);
    u.lang = 'ja-JP';
    u.rate = 0.92;
    u.pitch = 0.82;
    u.onend = () => { state.talking = false; };
    u.onerror = () => { state.talking = false; };
    window.speechSynthesis.speak(u);
  } else {
    window.setTimeout(() => { state.talking = false; }, 4500);
  }
}

function triggerGlitch() {
  state.glitch = 1;
  window.setTimeout(() => { state.glitch = 0; }, 360);
}

function syncUniforms() {
  uniforms.uAlpha.value = Number(alphaRange.value);
  uniforms.uGlow.value = Number(glowRange.value);
  uniforms.uShadow.value = Number(shadowRange.value);
  uniforms.uScan.value = Number(scanRange.value);
  uniforms.uNoise.value = Number(noiseRange.value);
  uniforms.uCut.value = Number(cutRange.value);
  uniforms.uMirror.value = mirrorCheck.checked ? 1 : 0;
  screen.scale.setScalar(Number(scaleRange.value));
}

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

const clock = new THREE.Clock();
function animate() {
  const elapsed = clock.elapsedTime;
  const delta = clock.getDelta();
  syncUniforms();

  const targetTalk = state.talking ? (0.55 + Math.sin(elapsed * 14.0) * 0.35) : 0;
  state.talkPulse += (targetTalk - state.talkPulse) * Math.min(1, delta * 8);
  state.glitch += (0 - state.glitch) * Math.min(1, delta * 6);

  uniforms.uTime.value = elapsed;
  uniforms.uTalk.value = Math.max(0, state.talkPulse);
  uniforms.uGlitch.value = Math.max(0, state.glitch);
  particles.userData.material.uniforms.uTime.value = elapsed;

  root.position.y = Math.sin(elapsed * 0.6) * 0.025;
  root.rotation.y = Math.sin(elapsed * 0.22) * 0.035;
  baseDisc.scale.setScalar(1 + Math.sin(elapsed * 1.5) * 0.035 + state.talkPulse * 0.07);
  baseCone.material.opacity = 0.040 + state.talkPulse * 0.05;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
mockBtn.addEventListener('click', speakMock);
snapshotBtn.addEventListener('click', triggerGlitch);
window.addEventListener('resize', resize);
video.addEventListener('loadedmetadata', updatePlaneAspect);

resize();
setStatus('standby');
animate();
