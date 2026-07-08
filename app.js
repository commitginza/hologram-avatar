export async function initHologram(THREE, GLTFLoader, boot = {}) {
  const APP_VERSION = '20260708-15';
  console.info('[app] version', APP_VERSION);

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

  const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/models/gltf/facecap.glb';
  const KTX2_TRANSCODER_PATH = 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/basis/';

  // FaceCapには眼球・歯・口内などの内部パーツがあるため、基本は頭部メッシュだけ表示します。
  const FACE_ONLY_MODE = true;

  // 口は「大きな肌色パッチ」や「たらこ唇」を使わず、目と同じような黒い穴だけで表現します。
  // 位置がずれる場合は x / y / z / width / closedHeight / openHeight を調整してください。
  const MOUTH_HOLE = {
    x: 0.0,
    y: -0.405,
    z: 0.84,
    width: 0.48,
    closedHeight: 0.020,
    openHeight: 0.170,
    rimOpacity: 0.46
  };

  // 歯が見えていた頃と同じように、FaceCap本体のjawOpen/mouthOpenを使って口を開きます。
  // 歯は非表示/黒い穴で隠しつつ、口周辺の自然な開閉モーフだけ復活させます。
  const MOUTH_MOTION = {
    jawOpenStrength: 0.86,
    mouthFunnelStrength: 0.10,
    mouthPuckerStrength: 0.035,
    smileDuringSpeech: 0.08,
    overlayOpenScale: 1.0
  };

  // 歯が見えていた時のような「本来の口が開く動き」に戻すための係数です。
  // 歯・口内メッシュは非表示のまま、jawOpen / mouthOpen だけ強く動かします。
  const MOUTH_MORPH = {
    jawOpenScale: 0.88,
    funnelScale: 0.14,
    puckerScale: 0.06,
    lowerDownScale: 0.18,
    upperUpScale: 0.05,
    overlayScale: 1.00
  };

  // FaceCapモデル自体はほぼ頭部のみなので、胸上部はホログラム用の簡易バスト形状を追加します。
  // 位置・サイズを変える場合はここを調整してください。
  const BUST_CONFIG = {
    enabled: true,
    y: -1.24,
    z: -0.02,
    height: 1.05,
    neckWidth: 0.20,
    shoulderWidth: 1.28,
    neckDepth: 0.13,
    shoulderDepth: 0.36,
    opacity: 0.30
  };

  const mockLines = [
    {
      display_text: 'こんにちは。私は高級腕時計のご相談をサポートするホログラムAIです。',
      speak_text: 'こんにちは。私は高級腕時計のご相談をサポートするホログラムAIです。',
      intent: 'greeting',
      expression: 'soft_smile',
      risk_level: 'low'
    },
    {
      display_text: 'この版では、FaceCapモデルのmorph targetを使って、本来の口を開閉しています。',
      speak_text: 'この版では、フェイスキャップモデルのモーフターゲットを使って、本来の口を開閉しています。',
      intent: 'morph_target_demo',
      expression: 'neutral',
      risk_level: 'low'
    },
    {
      display_text: 'ワイヤーは使わず、白を基調に、影と透明感で立体を見せています。',
      speak_text: 'ワイヤーは使わず、白を基調に、影と透明感で立体を見せています。',
      intent: 'visual_style',
      expression: 'thinking',
      risk_level: 'low'
    },
    {
      display_text: '将来的には、音声の音素タイミングに合わせてjawOpenやmouthFunnelを制御できます。',
      speak_text: '将来的には、音声の音素タイミングに合わせて、ジョーオープンやマウスファネルを制御できます。',
      intent: 'lip_sync_plan',
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
    depthScale: Number(depthRange?.value || 0.55),
    glowScale: Number(glowRange?.value || 0.85),
    noiseScale: Number(noiseRange?.value || 0.25),
    blinkTimer: 0,
    nextBlink: 1.6,
    blink: 0,
    targetBlink: 0,
    manualMorphs: {}
  };

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
  scene.fog = new THREE.FogExp2(0x05080c, 0.055);

  const camera = new THREE.PerspectiveCamera(36, stage.clientWidth / stage.clientHeight, 0.1, 100);
  camera.position.set(0, 0.08, 5.55);

  const root = new THREE.Group();
  root.position.set(0, -0.05, 0);
  scene.add(root);

  const faceGroup = new THREE.Group();
  faceGroup.position.y = 0.42;
  root.add(faceGroup);

  const clock = new THREE.Clock();

  const ambient = new THREE.AmbientLight(0xffffff, 0.95);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
  keyLight.position.set(-1.5, 2.2, 3.2);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xdce3ea, 0.95);
  fillLight.position.set(1.6, 1.0, 1.4);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 1.4);
  rimLight.position.set(0, 1.2, -2.0);
  scene.add(rimLight);

  const faceMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf8fbff,
    roughness: 0.34,
    metalness: 0.0,
    transmission: 0.0,
    thickness: 0.10,
    transparent: true,
    opacity: 0.50,
    emissive: 0xffffff,
    emissiveIntensity: 0.035,
    side: THREE.FrontSide,
    depthWrite: false
  });

  const eyeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.18,
    metalness: 0.0,
    transparent: true,
    opacity: 0.74,
    emissive: 0xffffff,
    emissiveIntensity: 0.06,
    depthWrite: false
  });

  const shadowMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd9dde2,
    roughness: 0.55,
    transparent: true,
    opacity: 0.42,
    emissive: 0x222222,
    emissiveIntensity: 0.0,
    depthWrite: false
  });

  const bustMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf4f7fb,
    roughness: 0.48,
    metalness: 0.0,
    transparent: true,
    opacity: BUST_CONFIG.opacity,
    emissive: 0xffffff,
    emissiveIntensity: 0.014,
    depthWrite: false,
    side: THREE.FrontSide
  });

  let modelRoot = null;
  let headMesh = null;
  let morphDict = {};
  let morphInfluences = [];
  let mouthOverlay = null;
  let bustGroup = null;
  let mouthHole = null;
  let mouthRim = null;
  const morphIndexCache = new Map();

  function createBackgroundParticles(count = 150) {
    const positions = [];
    const sizes = [];
    for (let i = 0; i < count; i += 1) {
      positions.push(
        (Math.random() - 0.5) * 9.5,
        (Math.random() - 0.5) * 6.5,
        -2.5 - Math.random() * 5.5
      );
      sizes.push(0.35 + Math.random() * 0.65);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aSize;
        uniform float uTime;
        varying float vFade;
        void main() {
          vec3 p = position;
          p.y += sin(uTime * 0.24 + position.x * 1.2) * 0.018;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * (16.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          vFade = 0.30 + 0.30 * sin(uTime + position.x * 4.0 + position.y * 3.0);
        }
      `,
      fragmentShader: `
        varying float vFade;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          float alpha = smoothstep(0.5, 0.0, d) * vFade;
          gl_FragColor = vec4(0.88, 0.93, 1.0, alpha * 0.55);
        }
      `
    });
    const points = new THREE.Points(geometry, material);
    points.userData.material = material;
    return points;
  }

  const backgroundParticles = createBackgroundParticles();
  scene.add(backgroundParticles);

  const baseGroup = new THREE.Group();
  baseGroup.position.set(0, -2.18, 0);
  root.add(baseGroup);
  const baseDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.46, 0.018, 96, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.11, depthWrite: false })
  );
  const baseCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.30, 0.64, 64, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide })
  );
  baseCone.position.y = 0.32;
  baseGroup.add(baseDisc, baseCone);

  function loadGltf(url) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.setCrossOrigin('anonymous');

      if (boot.KTX2Loader) {
        const ktx2 = new boot.KTX2Loader()
          .setTranscoderPath(KTX2_TRANSCODER_PATH)
          .detectSupport(renderer);
        loader.setKTX2Loader(ktx2);
      }

      if (boot.MeshoptDecoder) {
        loader.setMeshoptDecoder(boot.MeshoptDecoder);
      }

      loader.load(url, resolve, undefined, reject);
    });
  }

  function fitModelToStage(object) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const targetHeight = 2.75;
    const scale = targetHeight / Math.max(size.y, 0.0001);
    object.scale.setScalar(scale);
    object.position.set(-center.x * scale, -center.y * scale + 0.03, -center.z * scale);
  }

  function getStrippedMorphName(name) {
    return String(name).replace(/^blendShape1\./, '').replace(/^blendShape\./, '');
  }

  function findHeadMesh(rootObject) {
    const candidates = [];
    rootObject.traverse((child) => {
      if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
        candidates.push(child);
      }
    });

    const named = candidates.find((mesh) => mesh.name === 'mesh_2');
    if (named) return named;

    const withJaw = candidates.find((mesh) => {
      const names = Object.keys(mesh.morphTargetDictionary).map(getStrippedMorphName);
      return names.includes('jawOpen') || names.includes('mouthOpen');
    });
    if (withJaw) return withJaw;

    return candidates[0] || null;
  }

  function findMorphIndex(nameOrNames) {
    const names = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
    const cacheKey = names.join('|');
    if (morphIndexCache.has(cacheKey)) return morphIndexCache.get(cacheKey);

    for (const wanted of names) {
      for (const [key, value] of Object.entries(morphDict)) {
        const stripped = getStrippedMorphName(key);
        if (stripped === wanted || key === wanted || key.endsWith(`.${wanted}`)) {
          morphIndexCache.set(cacheKey, value);
          return value;
        }
      }
    }

    morphIndexCache.set(cacheKey, -1);
    return -1;
  }

  function setMorph(nameOrNames, value) {
    if (!morphInfluences) return;
    const index = findMorphIndex(nameOrNames);
    if (index < 0) return;
    morphInfluences[index] = THREE.MathUtils.clamp(value, 0, 1);
  }

  function addMorph(nameOrNames, value) {
    if (!morphInfluences) return;
    const index = findMorphIndex(nameOrNames);
    if (index < 0) return;
    morphInfluences[index] = THREE.MathUtils.clamp((morphInfluences[index] || 0) + value, 0, 1);
  }

  function clearMorphTargets() {
    if (!morphInfluences) return;
    for (let i = 0; i < morphInfluences.length; i += 1) morphInfluences[i] = 0;
  }

  function applyWhiteHologramMaterials(object) {
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.material = faceMaterial.clone();
      child.material.transparent = true;
      child.material.depthWrite = false;
      child.frustumCulled = false;
    });
  }

  function applyFaceOnlyMode(object, visibleHeadMesh) {
    if (!FACE_ONLY_MODE || !visibleHeadMesh) return;

    object.traverse((child) => {
      if (!child.isMesh) return;

      // 眼球・歯・舌・口内などの別メッシュは非表示。
      // 目は穴として見え、口は後述の mouthOverlay で穴＋唇として描画します。
      if (child !== visibleHeadMesh) {
        child.visible = false;
        return;
      }

      child.visible = true;
      child.material = faceMaterial.clone();
      child.material.transparent = true;
      child.material.depthWrite = false;
      child.frustumCulled = false;
    });
  }

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

  function createMouthOverlay() {
    const group = new THREE.Group();
    group.name = 'mouth-hole-overlay';
    group.position.set(MOUTH_HOLE.x, MOUTH_HOLE.y, MOUTH_HOLE.z);
    group.renderOrder = 90;

    const holeMaterial = new THREE.MeshBasicMaterial({
      color: 0x010203,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const rimMaterial = new THREE.LineBasicMaterial({
      color: 0xf7f9fb,
      transparent: true,
      opacity: MOUTH_HOLE.rimOpacity,
      depthTest: false,
      depthWrite: false
    });

    // 歯や口内を前面から黒い楕円で隠す。肌色パッチ・唇メッシュは使わない。
    mouthHole = new THREE.Mesh(createEllipseGeometry(96), holeMaterial);
    mouthHole.name = 'mouth-hole';
    mouthHole.scale.set(MOUTH_HOLE.width, MOUTH_HOLE.closedHeight, 1);
    mouthHole.renderOrder = 90;

    // 唇は太い面ではなく、穴の縁を示す細いラインだけにする。
    mouthRim = new THREE.LineLoop(
      createEllipseLineGeometry(MOUTH_HOLE.width * 0.5, MOUTH_HOLE.closedHeight * 0.5, 128),
      rimMaterial
    );
    mouthRim.name = 'mouth-hole-rim';
    mouthRim.position.z = 0.004;
    mouthRim.renderOrder = 91;

    group.add(mouthHole, mouthRim);
    return group;
  }

  function updateMouthOverlay(open) {
    if (!mouthOverlay || !mouthHole || !mouthRim) return;
    const amount = THREE.MathUtils.clamp(open, 0, 1);
    const holeHeight = MOUTH_HOLE.closedHeight + MOUTH_HOLE.openHeight * amount;
    const width = MOUTH_HOLE.width * (1 + amount * 0.07);

    mouthHole.scale.set(width, holeHeight, 1);
    mouthHole.material.opacity = 0.96 + amount * 0.04;

    mouthRim.geometry.dispose();
    mouthRim.geometry = createEllipseLineGeometry(width * 0.5, holeHeight * 0.5, 128);
    mouthRim.material.opacity = MOUTH_HOLE.rimOpacity + amount * 0.12;
  }

  function smooth01(t) {
    const v = THREE.MathUtils.clamp(t, 0, 1);
    return v * v * (3 - 2 * v);
  }

  function createBustGeometry(radialSegments = 96, heightSegments = 34) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let iy = 0; iy <= heightSegments; iy += 1) {
      const t = iy / heightSegments;
      const shoulder = smooth01((t - 0.18) / 0.72);
      const lowerTaper = 1.0 - Math.max(0, (t - 0.78) / 0.22) * 0.10;
      const width = (BUST_CONFIG.neckWidth * (1 - shoulder) + BUST_CONFIG.shoulderWidth * shoulder) * lowerTaper;
      const depth = BUST_CONFIG.neckDepth * (1 - shoulder) + BUST_CONFIG.shoulderDepth * shoulder;
      const y = -t * BUST_CONFIG.height;

      for (let ix = 0; ix <= radialSegments; ix += 1) {
        const a = (ix / radialSegments) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const frontLift = Math.max(0, sa) * shoulder * 0.035;
        positions.push(ca * width, y, sa * depth + frontLift);
        normals.push(ca, 0.15, sa);
        uvs.push(ix / radialSegments, t);
      }
    }

    const row = radialSegments + 1;
    for (let iy = 0; iy < heightSegments; iy += 1) {
      for (let ix = 0; ix < radialSegments; ix += 1) {
        const a = iy * row + ix;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createBust() {
    const group = new THREE.Group();
    group.name = 'procedural-upper-bust';
    group.position.set(0, BUST_CONFIG.y, BUST_CONFIG.z);

    const bust = new THREE.Mesh(createBustGeometry(), bustMaterial.clone());
    bust.name = 'upper-bust-shell';
    bust.renderOrder = 0;
    group.add(bust);

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.006, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.10, depthWrite: false })
    );
    collar.name = 'soft-collar-hint';
    collar.position.set(0, -0.24, 0.17);
    collar.scale.set(1.25, 0.34, 1);
    collar.rotation.x = Math.PI / 2;
    group.add(collar);

    return group;
  }

  async function loadFaceCapModel() {
    boot.onStatus?.('FaceCap morph targetモデルを取得中...');
    const gltf = await loadGltf(MODEL_URL);
    modelRoot = gltf.scene;
    applyWhiteHologramMaterials(modelRoot);

    headMesh = findHeadMesh(modelRoot);
    if (!headMesh) {
      throw new Error('morphTargetDictionaryを持つ顔メッシュが見つかりません。');
    }

    applyFaceOnlyMode(modelRoot, headMesh);
    fitModelToStage(modelRoot);
    faceGroup.add(modelRoot);

    if (BUST_CONFIG.enabled) {
      bustGroup = createBust();
      faceGroup.add(bustGroup);
    }

    mouthOverlay = createMouthOverlay();
    faceGroup.add(mouthOverlay);

    morphDict = headMesh.morphTargetDictionary || {};
    morphInfluences = headMesh.morphTargetInfluences || [];
    console.info('[hologram] morph target head:', headMesh.name, Object.keys(morphDict));
    console.info('[hologram] face only mode:', FACE_ONLY_MODE);

    // 初期表情を少し柔らかくする
    clearMorphTargets();
    setMorph(['eyeWide_L', 'eyeWideLeft'], 0.03);
    setMorph(['eyeWide_R', 'eyeWideRight'], 0.03);
  }

  function updatePreview(line) {
    const payload = {
      display_text: line.display_text,
      speak_text: line.speak_text,
      intent: line.intent,
      expression: line.expression,
      visual_effect: 'white_hologram_hollow_mouth',
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
  }

  function kanaToMouthSeed(char) {
    if ('あかさたなはまやらわがざだばぱぁゃゎアカサタナハマヤラワガザダバパァャヮAa'.includes(char)) return 0.92;
    if ('いきしちにひみりぎじぢびぴぃイキシチニヒミリギジヂビピィIi'.includes(char)) return 0.38;
    if ('うくすつぬふむゆるぐずづぶぷぅゅウクスツヌフムユルグズヅブプゥュUu'.includes(char)) return 0.62;
    if ('えけせてねへめれげぜでべぺぇエケセテネヘメレゼデベペェEe'.includes(char)) return 0.54;
    if ('おこそとのほもよろをごぞどぼぽぉょオコソトノホモヨロヲゴゾドボポォョOo'.includes(char)) return 0.76;
    if ('。、，,.！？!? 　\n'.includes(char)) return 0.02;
    return 0.26 + Math.random() * 0.45;
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
    const interval = Math.max(28, Math.floor((duration * 1000) / Math.max(chars.length, 1)));
    clearInterval(state.mouthInterval);
    state.mouthInterval = setInterval(() => {
      if (!state.active) {
        clearInterval(state.mouthInterval);
        return;
      }
      const char = chars[i % chars.length] || ' ';
      const seed = kanaToMouthSeed(char);
      state.targetMouth = seed * (0.82 + Math.random() * 0.28);
      i += 1;
    }, interval);
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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
    state.targetMouth = 0.55;
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
    updateMouthOverlay(0);
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
    updateMouthOverlay(0);
    stopSpeech();
    setStatus('standby', 'idle');
    captionText.textContent = '停止しました。';
  }

  function updateMorphTargets(delta, elapsed) {
    if (!headMesh || !morphInfluences) return;

    state.mouth += (state.targetMouth - state.mouth) * Math.min(1, delta * 13);
    state.talkIntensity += ((state.active ? 1 : 0) - state.talkIntensity) * Math.min(1, delta * 5);

    state.blinkTimer += delta;
    if (state.blinkTimer > state.nextBlink) {
      state.targetBlink = 1;
      if (state.blinkTimer > state.nextBlink + 0.10) state.targetBlink = 0;
      if (state.blinkTimer > state.nextBlink + 0.22) {
        state.blinkTimer = 0;
        state.nextBlink = 2.0 + Math.random() * 3.2;
      }
    }
    state.blink += (state.targetBlink - state.blink) * Math.min(1, delta * 24);

    const open = Math.min(1, state.mouth * state.talkIntensity * 1.25);
    const smile = state.expression === 'soft_smile' ? 0.28 : 0.04;
    const serious = state.expression === 'serious' ? 0.18 : 0.0;
    const thinking = state.expression === 'thinking' ? 0.24 : 0.0;

    clearMorphTargets();

    // v5.5: 歯が見えていた版と同じ方向で、本来のmorph targetを使って口を開閉する。
    // 歯・口内メッシュは非表示のままなので、見た目は黒い口穴として残ります。
    setMorph(['jawOpen', 'mouthOpen'], open * MOUTH_MORPH.jawOpenScale);
    setMorph(['mouthFunnel'], open * MOUTH_MORPH.funnelScale);
    setMorph(['mouthPucker'], open * MOUTH_MORPH.puckerScale);
    setMorph(['mouthLowerDown_L', 'mouthLowerDownLeft'], open * MOUTH_MORPH.lowerDownScale);
    setMorph(['mouthLowerDown_R', 'mouthLowerDownRight'], open * MOUTH_MORPH.lowerDownScale);
    setMorph(['mouthUpperUp_L', 'mouthUpperUpLeft'], open * MOUTH_MORPH.upperUpScale);
    setMorph(['mouthUpperUp_R', 'mouthUpperUpRight'], open * MOUTH_MORPH.upperUpScale);
    setMorph(['mouthClose'], 0.0);
    setMorph(['mouthSmile_L', 'mouthSmileLeft'], smile * 0.18);
    setMorph(['mouthSmile_R', 'mouthSmileRight'], smile * 0.18);
    setMorph(['mouthDimple_L', 'mouthDimpleLeft'], smile * 0.06);
    setMorph(['mouthDimple_R', 'mouthDimpleRight'], smile * 0.06);
    updateMouthOverlay(Math.min(1, open * MOUTH_MORPH.overlayScale));

    // 表情
    setMorph(['browInnerUp'], thinking * 0.45 + serious * 0.12);
    setMorph(['browDown_L', 'browDownLeft'], serious * 0.25);
    setMorph(['browDown_R', 'browDownRight'], serious * 0.25);
    setMorph(['eyeBlink_L', 'eyeBlinkLeft'], state.blink);
    setMorph(['eyeBlink_R', 'eyeBlinkRight'], state.blink);
    setMorph(['eyeSquint_L', 'eyeSquintLeft'], smile * 0.18 + serious * 0.10);
    setMorph(['eyeSquint_R', 'eyeSquintRight'], smile * 0.18 + serious * 0.10);
    setMorph(['eyeWide_L', 'eyeWideLeft'], thinking * 0.12);
    setMorph(['eyeWide_R', 'eyeWideRight'], thinking * 0.12);

    // 発話中の微細な揺らぎ
    addMorph(['cheekPuff'], open * 0.04 * Math.max(0, Math.sin(elapsed * 16)));
  }

  function updateMaterials(delta) {
    const glow = state.glowScale;
    const talking = state.talkIntensity;
    faceGroup.traverse((child) => {
      if (!child.isMesh || !child.material || child.visible === false) return;
      if (mouthOverlay && mouthOverlay.children.includes(child)) return;
      const targetOpacity = 0.50 + talking * 0.08;
      child.material.opacity += (targetOpacity - child.material.opacity) * Math.min(1, delta * 4);
      if ('emissiveIntensity' in child.material) child.material.emissiveIntensity = (0.012 + talking * 0.026) * glow;
    });
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
    updateMorphTargets(delta, elapsed);
    updateMaterials(delta);

    backgroundParticles.userData.material.uniforms.uTime.value = elapsed;

    const floatY = Math.sin(elapsed * 0.72) * 0.026;
    const yaw = Math.sin(elapsed * 0.22) * 0.028;
    faceGroup.position.y = 0.42 + floatY;
    faceGroup.rotation.y = yaw;

    if (modelRoot) {
      modelRoot.scale.z = state.depthScale;
    }
    if (bustGroup) {
      bustGroup.scale.z = state.depthScale;
    }

    baseDisc.scale.setScalar(1 + Math.sin(elapsed * 1.7) * 0.035 + state.talkIntensity * 0.06);
    baseCone.material.opacity = 0.035 + state.talkIntensity * 0.035;

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
      if (backgroundParticles.userData.material) {
        backgroundParticles.userData.material.opacity = 0.35 + state.noiseScale * 0.2;
      }
    });
    window.addEventListener('resize', resize);
  }

  initEvents();
  updatePreview(mockLines[0]);
  setExpression('neutral');
  resize();
  animate();

  await loadFaceCapModel();
  setExpression('neutral');
  boot.hideStatus?.();
}
