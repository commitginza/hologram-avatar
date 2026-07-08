import * as THREE from 'three';

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
  captionTimer: 0,
  captionCursor: 0,
  depthScale: 1,
  glowScale: 1,
  noiseScale: 0.7
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020812, 0.075);

const camera = new THREE.PerspectiveCamera(35, stage.clientWidth / stage.clientHeight, 0.1, 100);
camera.position.set(0, 0.08, 6.4);

const root = new THREE.Group();
root.position.y = 0.12;
scene.add(root);

const faceGroup = new THREE.Group();
faceGroup.position.y = 0.46;
root.add(faceGroup);

const clock = new THREE.Clock();

const materialUniforms = {
  uTime: { value: 0 },
  uTalk: { value: 0 },
  uGlow: { value: 1 },
  uNoise: { value: 0.7 }
};

const faceMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  uniforms: materialUniforms,
  vertexShader: `
    uniform float uTime;
    uniform float uTalk;
    uniform float uNoise;
    varying vec3 vNormalW;
    varying vec3 vViewPos;
    varying vec2 vUv;
    varying float vPulse;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    void main() {
      vUv = uv;
      vec3 displaced = position;
      float wave = sin((position.y * 11.0) + (uTime * 2.8)) * 0.006;
      float micro = (hash(position + uTime * 0.025) - 0.5) * 0.018 * uNoise;
      displaced += normal * (wave + micro + uTalk * 0.010);
      vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
      vViewPos = -mvPosition.xyz;
      vNormalW = normalize(normalMatrix * normal);
      vPulse = wave;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uTalk;
    uniform float uGlow;
    varying vec3 vNormalW;
    varying vec3 vViewPos;
    varying vec2 vUv;
    varying float vPulse;

    void main() {
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(vViewPos);
      float fresnel = pow(1.0 - abs(dot(N, V)), 2.2);
      float scanRaw = sin((vUv.y * 255.0) - (uTime * 8.2));
      float scan = smoothstep(0.84, 1.0, scanRaw);
      float verticalBand = smoothstep(0.12, 0.5, vUv.x) * (1.0 - smoothstep(0.5, 0.88, vUv.x));
      float alpha = 0.07 + fresnel * 0.44 + scan * 0.055 + verticalBand * 0.035 + uTalk * 0.075;
      vec3 color = vec3(0.43, 0.92, 1.0) * (0.66 + fresnel * 2.2 + scan * 0.40 + uTalk * 0.25) * uGlow;
      gl_FragColor = vec4(color, alpha);
    }
  `
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function gaussian(x, center, width) {
  const d = (x - center) / width;
  return Math.exp(-d * d);
}

function widthAt(yN) {
  const base = 0.74 * (1.0 - 0.36 * Math.pow(Math.abs(yN), 2.2));
  const temple = -0.06 * gaussian(yN, 0.82, 0.20);
  const cheek = 0.11 * gaussian(yN, -0.10, 0.26);
  const jaw = -0.16 * gaussian(yN, -0.62, 0.22);
  const chin = -0.38 * gaussian(yN, -0.98, 0.15);
  const forehead = -0.08 * gaussian(yN, 0.98, 0.12);
  return Math.max(0.10, base + temple + cheek + jaw + chin + forehead);
}

function surfaceAtUV(u, yN, offset = 0) {
  const width = widthAt(yN);
  const x = u * width;
  const y = yN * 1.55;
  const front = Math.sqrt(Math.max(0, 1 - u * u));
  const faceCurve = 0.16 * front * (1 - 0.18 * Math.abs(yN));
  const brow = 0.04 * gaussian(yN, 0.30, 0.16) * gaussian(Math.abs(u), 0.26, 0.26);
  const noseRidge = 0.18 * gaussian(u, 0, 0.105) * gaussian(yN, 0.06, 0.38);
  const noseTip = 0.30 * gaussian(u, 0, 0.17) * gaussian(yN, -0.18, 0.16);
  const lips = 0.06 * gaussian(u, 0, 0.26) * gaussian(yN, -0.47, 0.10);
  const chin = 0.06 * gaussian(u, 0, 0.24) * gaussian(yN, -0.78, 0.13);
  const cheeks = 0.08 * gaussian(Math.abs(u), 0.36, 0.18) * gaussian(yN, -0.18, 0.24);
  const eyeCavity = -0.035 * gaussian(Math.abs(u), 0.28, 0.17) * gaussian(yN, 0.24, 0.12);
  const z = (faceCurve + brow + noseRidge + noseTip + lips + chin + cheeks + eyeCavity) + offset;
  return new THREE.Vector3(x, y, z);
}

function surfaceAtXY(x, yN, offset = 0) {
  const u = clamp(x / widthAt(yN), -0.96, 0.96);
  return surfaceAtUV(u, yN, offset);
}

function createFaceGeometry(cols = 70, rows = 112) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    const yN = 1 - t * 2;
    for (let col = 0; col <= cols; col += 1) {
      const s = col / cols;
      const u = -1 + s * 2;
      const p = surfaceAtUV(u, yN, 0);
      positions.push(p.x, p.y, p.z);
      uvs.push(s, t);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * (cols + 1) + col;
      const b = a + 1;
      const c = a + (cols + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const faceMesh = new THREE.Mesh(createFaceGeometry(), faceMaterial);
faceMesh.scale.set(1.0, 1.0, 1.0);
faceGroup.add(faceMesh);

const wireMaterial = new THREE.LineBasicMaterial({
  color: 0x9af7ff,
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});

function createWireLines() {
  const group = new THREE.Group();
  const geometryPositions = [];

  const addLine = (points) => {
    for (let i = 0; i < points.length - 1; i += 1) {
      geometryPositions.push(points[i].x, points[i].y, points[i].z);
      geometryPositions.push(points[i + 1].x, points[i + 1].y, points[i + 1].z);
    }
  };

  for (let i = 0; i <= 34; i += 1) {
    const yN = 0.95 - i * (1.9 / 34);
    const points = [];
    for (let j = 0; j <= 72; j += 1) {
      const u = -0.98 + j * (1.96 / 72);
      points.push(surfaceAtUV(u, yN, 0.012));
    }
    addLine(points);
  }

  for (let i = 0; i <= 18; i += 1) {
    const u = -0.90 + i * (1.8 / 18);
    const points = [];
    for (let j = 0; j <= 64; j += 1) {
      const yN = 0.96 - j * (1.92 / 64);
      points.push(surfaceAtUV(u, yN, 0.011));
    }
    addLine(points);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(geometryPositions, 3));
  const lines = new THREE.LineSegments(geometry, wireMaterial);
  group.add(lines);
  return group;
}

const wireLines = createWireLines();
faceGroup.add(wireLines);

const dotMaterial = new THREE.PointsMaterial({
  color: 0xaefaff,
  size: 0.015,
  transparent: true,
  opacity: 0.45,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});

function createFaceDots(count = 720) {
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    const yN = 0.96 - Math.random() * 1.92;
    const u = -0.94 + Math.random() * 1.88;
    const p = surfaceAtUV(u, yN, 0.025 + Math.random() * 0.015);
    positions.push(p.x, p.y, p.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, dotMaterial);
}

const faceDots = createFaceDots();
faceGroup.add(faceDots);

const featureMaterial = new THREE.MeshBasicMaterial({
  color: 0xd8ffff,
  transparent: true,
  opacity: 0.78,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});

const dimFeatureMaterial = new THREE.MeshBasicMaterial({
  color: 0x90f0ff,
  transparent: true,
  opacity: 0.34,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});

function tubeFromPoints(points, radius = 0.006, material = featureMaterial, tubularSegments = 36) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, 8, false);
  return new THREE.Mesh(geometry, material);
}

function arcPoints(centerX, centerYN, width, height, start, end, steps, offset = 0.055) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = start + (end - start) * t;
    const x = centerX + Math.cos(angle) * width;
    const yN = centerYN + Math.sin(angle) * height;
    points.push(surfaceAtXY(x, yN, offset));
  }
  return points;
}

function linePoints(coords, offset = 0.055) {
  return coords.map(([x, yN]) => surfaceAtXY(x, yN, offset));
}

const features = new THREE.Group();
faceGroup.add(features);

const leftEyeUpper = tubeFromPoints(arcPoints(-0.27, 0.23, 0.19, 0.055, Math.PI * 0.05, Math.PI * 0.95, 28), 0.0065);
const leftEyeLower = tubeFromPoints(arcPoints(-0.27, 0.22, 0.17, 0.030, Math.PI * 1.04, Math.PI * 1.96, 26), 0.0038, dimFeatureMaterial);
const rightEyeUpper = tubeFromPoints(arcPoints(0.27, 0.23, 0.19, 0.055, Math.PI * 0.05, Math.PI * 0.95, 28), 0.0065);
const rightEyeLower = tubeFromPoints(arcPoints(0.27, 0.22, 0.17, 0.030, Math.PI * 1.04, Math.PI * 1.96, 26), 0.0038, dimFeatureMaterial);

const leftBrow = tubeFromPoints(linePoints([[-0.48, 0.48], [-0.36, 0.52], [-0.18, 0.56]], 0.06), 0.0065);
const rightBrow = tubeFromPoints(linePoints([[0.18, 0.56], [0.36, 0.52], [0.48, 0.48]], 0.06), 0.0065);

const noseRidge = tubeFromPoints(linePoints([[0.00, 0.34], [-0.018, 0.16], [0.00, -0.05], [0.015, -0.23]], 0.07), 0.0042, dimFeatureMaterial);
const nostrilLeft = tubeFromPoints(arcPoints(-0.07, -0.27, 0.055, 0.020, Math.PI * 0.0, Math.PI * 0.75, 16, 0.072), 0.0038, dimFeatureMaterial);
const nostrilRight = tubeFromPoints(arcPoints(0.07, -0.27, 0.055, 0.020, Math.PI * 0.25, Math.PI * 1.0, 16, 0.072), 0.0038, dimFeatureMaterial);

const mouthGroup = new THREE.Group();
const mouthUpper = tubeFromPoints(arcPoints(0.00, -0.49, 0.205, 0.045, Math.PI * 0.08, Math.PI * 0.92, 34, 0.072), 0.0058);
const mouthLower = tubeFromPoints(arcPoints(0.00, -0.49, 0.205, 0.045, Math.PI * 1.08, Math.PI * 1.92, 34, 0.072), 0.0058);

const mouthShape = new THREE.Shape();
for (let i = 0; i <= 40; i += 1) {
  const a = (i / 40) * Math.PI * 2;
  const x = Math.cos(a) * 0.20;
  const y = Math.sin(a) * 0.025;
  if (i === 0) mouthShape.moveTo(x, y);
  else mouthShape.lineTo(x, y);
}
const mouthInnerGeometry = new THREE.ShapeGeometry(mouthShape);
const mouthInnerMaterial = new THREE.MeshBasicMaterial({
  color: 0x73ecff,
  transparent: true,
  opacity: 0.30,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
});
const mouthInner = new THREE.Mesh(mouthInnerGeometry, mouthInnerMaterial);
const mouthAnchor = surfaceAtXY(0.0, -0.50, 0.075);
mouthInner.position.copy(mouthAnchor);
mouthInner.rotation.x = 0.02;
mouthInner.scale.set(1, 0.55, 1);
mouthGroup.add(mouthInner, mouthUpper, mouthLower);

const irisMaterial = new THREE.MeshBasicMaterial({
  color: 0xe8ffff,
  transparent: true,
  opacity: 0.78,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
});

function createIris(x, yN) {
  const geometry = new THREE.CircleGeometry(0.018, 32);
  const mesh = new THREE.Mesh(geometry, irisMaterial);
  mesh.position.copy(surfaceAtXY(x, yN, 0.076));
  return mesh;
}

const leftIris = createIris(-0.27, 0.22);
const rightIris = createIris(0.27, 0.22);

features.add(
  leftEyeUpper,
  leftEyeLower,
  rightEyeUpper,
  rightEyeLower,
  leftBrow,
  rightBrow,
  noseRidge,
  nostrilLeft,
  nostrilRight,
  mouthGroup,
  leftIris,
  rightIris
);

const haloMaterial = new THREE.MeshBasicMaterial({
  color: 0x79eaff,
  transparent: true,
  opacity: 0.13,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
});

function createEllipseRing(radiusX, radiusY, y, z, rotationX = Math.PI / 2) {
  const curve = new THREE.EllipseCurve(0, 0, radiusX, radiusY, 0, Math.PI * 2, false, 0);
  const points = curve.getPoints(180).map((p) => new THREE.Vector3(p.x, 0, p.y));
  const curve3 = new THREE.CatmullRomCurve3(points, true);
  const ring = new THREE.Mesh(new THREE.TubeGeometry(curve3, 180, 0.004, 6, true), haloMaterial);
  ring.position.set(0, y, z);
  ring.rotation.x = rotationX;
  return ring;
}

const halo1 = createEllipseRing(1.45, 0.52, 0.52, -0.04, Math.PI / 2);
const halo2 = createEllipseRing(1.28, 0.43, -0.25, -0.02, Math.PI / 2);
const halo3 = createEllipseRing(1.02, 0.34, -0.90, -0.01, Math.PI / 2);
root.add(halo1, halo2, halo3);

const baseGroup = new THREE.Group();
baseGroup.position.set(0, -1.78, 0);
root.add(baseGroup);
const baseDisc = new THREE.Mesh(
  new THREE.CylinderGeometry(0.44, 0.44, 0.022, 96, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x9af7ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
);
const baseCone = new THREE.Mesh(
  new THREE.ConeGeometry(0.32, 0.74, 64, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x65e7ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
);
baseCone.position.y = 0.36;
baseGroup.add(baseDisc, baseCone);

function createBackgroundParticles(count = 220) {
  const positions = [];
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    positions.push(
      (Math.random() - 0.5) * 9.5,
      (Math.random() - 0.5) * 6.5,
      -1.8 - Math.random() * 5.5
    );
    sizes.push(0.5 + Math.random() * 1.0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }
    },
    vertexShader: `
      attribute float aSize;
      uniform float uTime;
      varying float vFade;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.25 + position.x * 1.2) * 0.025;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (18.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vFade = 0.45 + 0.35 * sin(uTime + position.x * 4.0 + position.y * 3.0);
      }
    `,
    fragmentShader: `
      varying float vFade;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float alpha = smoothstep(0.5, 0.0, d) * vFade;
        gl_FragColor = vec4(0.55, 0.95, 1.0, alpha);
      }
    `
  });
  const points = new THREE.Points(geometry, material);
  points.userData.material = material;
  return points;
}

const backgroundParticles = createBackgroundParticles();
scene.add(backgroundParticles);

const pointLight = new THREE.PointLight(0x8ff6ff, 3.2, 8.0);
pointLight.position.set(0, 0.2, 2.4);
scene.add(pointLight);
const rearLight = new THREE.PointLight(0x2dbdff, 1.2, 7.0);
rearLight.position.set(0, 0.0, -1.8);
scene.add(rearLight);

function updatePreview(line) {
  const payload = {
    display_text: line.display_text,
    speak_text: line.speak_text,
    intent: line.intent,
    expression: line.expression,
    visual_effect: line.risk_level === 'medium' ? 'soft_warning_hologram' : 'normal_hologram',
    risk_level: line.risk_level,
    need_human_check: line.risk_level !== 'low'
  };
  jsonPreview.textContent = JSON.stringify(payload, null, 2);
}

function setStatus(status, intent = state.intent) {
  state.intent = intent;
  statusText.textContent = status;
  intentText.textContent = intent;
}

function setExpression(expression) {
  state.expression = expression;
  expressionText.textContent = expression;

  const serious = expression === 'serious';
  const thinking = expression === 'thinking';
  const smile = expression === 'soft_smile';

  leftBrow.rotation.z = THREE.MathUtils.degToRad(serious ? 7 : thinking ? -9 : smile ? -3 : 0);
  rightBrow.rotation.z = THREE.MathUtils.degToRad(serious ? -7 : thinking ? 8 : smile ? 3 : 0);
  leftBrow.position.y = serious ? -0.02 : smile ? 0.018 : 0;
  rightBrow.position.y = serious ? -0.02 : smile ? 0.018 : 0;
  mouthUpper.scale.y = smile ? 0.72 : serious ? 0.45 : 1;
  mouthLower.scale.y = smile ? 1.25 : serious ? 0.55 : 1;
  mouthInnerMaterial.opacity = serious ? 0.22 : 0.30;
}

function kanaToMouthSeed(char) {
  if ('あかさたなはまやらわがざだばぱぁゃゎアカサタナハマヤラワガザダバパァャヮAＯa'.includes(char)) return 0.95;
  if ('いきしちにひみりぎじぢびぴぃイキシチニヒミリギジヂビピィIい'.includes(char)) return 0.38;
  if ('うくすつぬふむゆるぐずづぶぷぅゅウクスツヌフムユルグズヅブプゥュU'.includes(char)) return 0.60;
  if ('えけせてねへめれげぜでべぺぇエケセテネヘメレゲゼデベペェE'.includes(char)) return 0.52;
  if ('おこそとのほもよろをごぞどぼぽぉょオコソトノホモヨロヲゴゾドボポォョO'.includes(char)) return 0.76;
  if ('。、，,.！？!? 　\n'.includes(char)) return 0.03;
  return 0.28 + Math.random() * 0.50;
}

function startCaption(text) {
  state.currentText = text;
  state.captionCursor = 0;
  state.captionTimer = 0;
  captionText.textContent = '';
}

function updateCaption(delta) {
  if (!state.currentText) return;
  state.captionTimer += delta;
  const interval = 0.024;
  while (state.captionTimer >= interval && state.captionCursor < state.currentText.length) {
    state.captionTimer -= interval;
    state.captionCursor += 1;
    captionText.textContent = state.currentText.slice(0, state.captionCursor);
  }
}

function startMockMouthFromText(text, estimatedSeconds) {
  let i = 0;
  const chars = [...text];
  const duration = Math.max(estimatedSeconds, chars.length * 0.045);
  const interval = Math.max(35, Math.floor((duration * 1000) / Math.max(chars.length, 1)));
  clearInterval(state.mouthInterval);
  state.mouthInterval = setInterval(() => {
    if (!state.active) {
      clearInterval(state.mouthInterval);
      return;
    }
    const char = chars[i % chars.length] || ' ';
    const seed = kanaToMouthSeed(char);
    state.targetMouth = seed * (0.75 + Math.random() * 0.32);
    i += 1;
  }, interval);
}

function stopSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function speakWithBrowser(text, callbacks = {}) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    const fallbackSeconds = Math.max(2.2, text.length * 0.075);
    window.setTimeout(() => callbacks.onend?.(), fallbackSeconds * 1000);
    return fallbackSeconds;
  }

  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.92;
  utterance.pitch = 0.78;
  utterance.volume = 1;
  utterance.onend = () => callbacks.onend?.();
  utterance.onerror = () => callbacks.onerror?.();
  window.speechSynthesis.speak(utterance);
  return Math.max(2.2, text.length * 0.08);
}

async function playLine(line) {
  state.active = true;
  setStatus('speaking', line.intent);
  setExpression(line.expression);
  updatePreview(line);
  startCaption(line.display_text);
  const estimated = speakWithBrowser(line.speak_text, {
    onend: () => finishLine(),
    onerror: () => finishLine()
  });
  startMockMouthFromText(line.speak_text, estimated);
}

function finishLine() {
  clearInterval(state.mouthInterval);
  state.active = false;
  state.targetMouth = 0;
  setStatus('standby', state.intent);
}

async function playSequence() {
  if (state.sequenceRunning) return;
  state.sequenceRunning = true;
  state.lineIndex = 0;
  for (const line of mockLines) {
    if (!state.sequenceRunning) break;
    await new Promise((resolve) => {
      playLine(line);
      const check = setInterval(() => {
        if (!state.active || !state.sequenceRunning) {
          clearInterval(check);
          window.setTimeout(resolve, 420);
        }
      }, 120);
    });
  }
  state.sequenceRunning = false;
  setStatus('standby', 'idle');
}

function playOne() {
  state.sequenceRunning = false;
  const line = mockLines[state.lineIndex % mockLines.length];
  state.lineIndex += 1;
  playLine(line);
}

function playCustom() {
  const text = customText.value.trim();
  if (!text) return;
  const line = {
    display_text: text,
    speak_text: text,
    intent: 'custom_demo',
    expression: 'neutral',
    risk_level: 'low'
  };
  state.sequenceRunning = false;
  playLine(line);
}

function stopAll() {
  state.sequenceRunning = false;
  state.active = false;
  state.targetMouth = 0;
  clearInterval(state.mouthInterval);
  stopSpeech();
  setStatus('standby', 'idle');
  captionText.textContent = '停止しました。';
}

function updateMouth(delta) {
  state.mouth += (state.targetMouth - state.mouth) * Math.min(1, delta * 12);
  state.talkIntensity += ((state.active ? 1 : 0) - state.talkIntensity) * Math.min(1, delta * 5);

  const open = state.mouth * state.talkIntensity;
  mouthInner.scale.y = 0.45 + open * 3.9;
  mouthInner.scale.x = 0.88 + open * 0.14;
  mouthInnerMaterial.opacity = 0.18 + open * 0.34;
  mouthLower.position.y = -open * 0.055;
  mouthUpper.position.y = open * 0.010;

  materialUniforms.uTalk.value = open;
}

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  updateCaption(delta);
  updateMouth(delta);

  materialUniforms.uTime.value = elapsed;
  materialUniforms.uGlow.value = state.glowScale;
  materialUniforms.uNoise.value = state.noiseScale;

  backgroundParticles.userData.material.uniforms.uTime.value = elapsed;

  const floatY = Math.sin(elapsed * 0.72) * 0.055;
  const yaw = Math.sin(elapsed * 0.28) * 0.060;
  const roll = Math.sin(elapsed * 0.20) * 0.016;
  faceGroup.position.y = 0.46 + floatY;
  faceGroup.rotation.y = yaw;
  faceGroup.rotation.z = roll;
  faceMesh.scale.z = state.depthScale;
  wireLines.scale.z = state.depthScale;
  faceDots.scale.z = state.depthScale;
  features.scale.z = state.depthScale;

  const pulse = 1 + Math.sin(elapsed * 2.1) * 0.035 + state.talkIntensity * 0.045;
  halo1.rotation.z = elapsed * 0.08;
  halo2.rotation.z = -elapsed * 0.07;
  halo3.rotation.z = elapsed * 0.05;
  halo1.scale.setScalar(pulse);
  halo2.scale.setScalar(1 + Math.sin(elapsed * 1.55) * 0.025);
  halo3.scale.setScalar(1 + Math.sin(elapsed * 1.20) * 0.020);

  pointLight.intensity = (2.8 + state.talkIntensity * 1.4 + Math.sin(elapsed * 2.8) * 0.18) * state.glowScale;
  baseDisc.scale.setScalar(1 + Math.sin(elapsed * 1.7) * 0.055 + state.talkIntensity * 0.08);
  baseCone.material.opacity = 0.06 + state.talkIntensity * 0.055;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function initEvents() {
  playBtn.addEventListener('click', playSequence);
  oneBtn.addEventListener('click', playOne);
  stopBtn.addEventListener('click', stopAll);
  customBtn.addEventListener('click', playCustom);
  depthRange.addEventListener('input', () => {
    state.depthScale = Number(depthRange.value);
  });
  glowRange.addEventListener('input', () => {
    state.glowScale = Number(glowRange.value);
  });
  noiseRange.addEventListener('input', () => {
    state.noiseScale = Number(noiseRange.value);
  });
  window.addEventListener('resize', resize);
}

initEvents();
setExpression('neutral');
updatePreview(mockLines[0]);
resize();
animate();
