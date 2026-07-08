export async function initHologram(THREE, GLTFLoader, boot = {}) {
  const APP_VERSION = '20260708-12';
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

  // 口は歯を見せず、目と同じように“穴”として見せるための前面レイヤーです。
  // 位置がずれる場合は y / z / patchWidth / width / openHeight を調整してください。
  const MOUTH_HOLE = {
    x: 0.0,
    y: -0.43,
    z: 0.74,
    patchWidth: 0.78,
    patchHeight: 0.40,
    width: 0.50,
    closedHeight: 0.026,
    openHeight: 0.185,
    lipGap: 0.018,
    lipThickness: 0.007
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
  camera.position.set(0, 0.22, 4.25);

  const root = new THREE.Group();
  root.position.set(0, -0.05, 0);
  scene.add(root);

  const faceGroup = new THREE.Group();
  faceGroup.position.y = 0.15;
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

  let modelRoot = null;
  let headMesh = null;
  let morphDict = {};
  let morphInfluences = [];
  let mouthOverlay = null;
  let mouthPatch = null;
  let mouthHole = null;
  let mouthUpperLip = null;
  let mouthLowerLip = null;
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
  baseGroup.position.set(0, -1.58, 0);
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

  function createLipGeometry(isUpper = true) {
    const shape = new THREE.Shape();
    const width = 1.0;
    const height = 0.16;
    const thickness = 0.034;
    const points = [];

    for (let i = 0; i <= 42; i += 1) {
      const t = i / 42;
      const x = (t - 0.5) * width;
      const arch = Math.sin(t * Math.PI) * height;
      const y = (isUpper ? arch : -arch);
      points.push(new THREE.Vector2(x, y));
    }
    for (let i = 42; i >= 0; i -= 1) {
      const t = i / 42;
      const x = (t - 0.5) * width;
      const arch = Math.sin(t * Math.PI) * height;
      const y = (isUpper ? arch - thickness : -arch + thickness);
      points.push(new THREE.Vector2(x, y));
    }

    points.forEach((pt, index) => {
      if (index === 0) shape.moveTo(pt.x, pt.y);
      else shape.lineTo(pt.x, pt.y);
    });
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }

  function createMouthOverlay() {
    const group = new THREE.Group();
    group.name = 'mouth-hole-overlay';
    group.position.set(MOUTH_HOLE.x, MOUTH_HOLE.y, MOUTH_HOLE.z);
    group.renderOrder = 80;

    const patchMaterial = new THREE.MeshBasicMaterial({
      color: 0xaeb3b8,
      transparent: true,
      opacity: 0.82,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const holeMaterial = new THREE.MeshBasicMaterial({
      color: 0x020407,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const lipMaterial = new THREE.MeshBasicMaterial({
      color: 0xf6f8fa,
      transparent: true,
      opacity: 0.64,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    mouthPatch = new THREE.Mesh(createEllipseGeometry(), patchMaterial);
    mouthPatch.name = 'mouth-skin-patch';
    mouthPatch.scale.set(MOUTH_HOLE.patchWidth, MOUTH_HOLE.patchHeight, 1);
    mouthPatch.renderOrder = 80;

    mouthHole = new THREE.Mesh(createEllipseGeometry(), holeMaterial);
    mouthHole.name = 'mouth-hole';
    mouthHole.scale.set(MOUTH_HOLE.width, MOUTH_HOLE.closedHeight, 1);
    mouthHole.position.z = 0.003;
    mouthHole.renderOrder = 81;

    mouthUpperLip = new THREE.Mesh(createLipGeometry(true), lipMaterial.clone());
    mouthUpperLip.name = 'upper-lip-line';
    mouthUpperLip.scale.set(MOUTH_HOLE.width, 0.17, 1);
    mouthUpperLip.position.set(0, MOUTH_HOLE.lipGap, 0.006);
    mouthUpperLip.renderOrder = 82;

    mouthLowerLip = new THREE.Mesh(createLipGeometry(false), lipMaterial.clone());
    mouthLowerLip.name = 'lower-lip-line';
    mouthLowerLip.scale.set(MOUTH_HOLE.width, 0.17, 1);
    mouthLowerLip.position.set(0, -MOUTH_HOLE.lipGap, 0.006);
    mouthLowerLip.renderOrder = 82;

    group.add(mouthPatch, mouthHole, mouthUpperLip, mouthLowerLip);
    return group;
  }

  function updateMouthOverlay(open) {
    if (!mouthOverlay || !mouthHole || !mouthUpperLip || !mouthLowerLip || !mouthPatch) return;
    const amount = THREE.MathUtils.clamp(open, 0, 1);
    const holeHeight = MOUTH_HOLE.closedHeight + MOUTH_HOLE.openHeight * amount;

    mouthHole.scale.set(MOUTH_HOLE.width * (1 + amount * 0.08), holeHeight, 1);
    mouthHole.material.opacity = 0.94 + amount * 0.06;

    mouthUpperLip.position.y = MOUTH_HOLE.lipGap + amount * 0.028;
    mouthLowerLip.position.y = -MOUTH_HOLE.lipGap - amount * 0.075;
    mouthLowerLip.scale.y = 0.17 + amount * 0.09;

    mouthPatch.material.opacity = 0.80 + amount * 0.08;
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

    // 歯を見せないため、モデル本体の口は閉じ気味にして、前面の穴＋唇で口パクを見せる
    setMorph(['jawOpen', 'mouthOpen'], open * 0.10);
    setMorph(['mouthFunnel'], open * 0.03);
    setMorph(['mouthPucker'], open * 0.02);
    setMorph(['mouthClose'], 0.86);
    setMorph(['mouthSmile_L', 'mouthSmileLeft'], smile * 0.35);
    setMorph(['mouthSmile_R', 'mouthSmileRight'], smile * 0.35);
    setMorph(['mouthDimple_L', 'mouthDimpleLeft'], smile * 0.10);
    setMorph(['mouthDimple_R', 'mouthDimpleRight'], smile * 0.10);
    updateMouthOverlay(open);

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
    faceGroup.position.y = 0.15 + floatY;
    faceGroup.rotation.y = yaw;

    if (modelRoot) {
      modelRoot.scale.z = state.depthScale;
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
