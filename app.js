export async function initHologram(THREE, GLTFLoader, boot = {}) {
  console.info('[app] version 20260708-9');
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

  const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/models/gltf/LeePerrySmith/';
  const MODEL_URL = `${ASSET_BASE}LeePerrySmith.glb`;

  // ===== 手動調整ポイント =====
  // 既存のLeePerrySmithモデルには口パク用BlendShapeがないため、
  // 本来の口位置に薄いホログラムの口スリットを重ね、話しているように見せています。
  // 口の位置がズレる場合は、まずここを調整してください。
  const MOUTH_OVERLAY = {
    x: 0.0,      // 左右。右へ動かすなら +、左へ動かすなら -
    y: -0.12,    // 上下。上へ動かすなら +、下へ動かすなら -
    z: 1.04,     // 手前/奥。手前へ出すなら +
    width: 0.46,
    closedHeight: 0.018,
    openHeight: 0.155,
    lineRadius: 0.006
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
    depthScale: Number(depthRange?.value || 0.50),
    glowScale: Number(glowRange?.value || 1),
    noiseScale: Number(noiseRange?.value || 0.7)
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
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020812, 0.075);

  const camera = new THREE.PerspectiveCamera(34, stage.clientWidth / stage.clientHeight, 0.1, 100);
  camera.position.set(0, 0.18, 5.6);

  const root = new THREE.Group();
  root.position.y = -0.08;
  scene.add(root);

  const faceGroup = new THREE.Group();
  faceGroup.position.y = 0.32;
  root.add(faceGroup);

  const clock = new THREE.Clock();

  function loadGltf(url) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, resolve, undefined, reject);
    });
  }

  const materialUniforms = {
    uTime: { value: 0 },
    uTalk: { value: 0 },
    uMouthOpen: { value: 0 },
    uGlow: { value: 1 },
    uNoise: { value: 0.7 }
  };

  const hologramMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.FrontSide,
    uniforms: materialUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uTalk;
      uniform float uMouthOpen;
      uniform float uNoise;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec2 vUv;
      varying float vWorldY;
      varying float vMouthMask;
      varying float vFeatureMask;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.39));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float ellipseMask(vec2 uv, vec2 center, vec2 radius) {
        vec2 d = (uv - center) / radius;
        return exp(-dot(d, d));
      }

      void main() {
        vUv = uv;
        vec3 displaced = position;
        float scanWave = sin((position.y * 16.0) + (uTime * 3.4)) * 0.004;
        float microNoise = (hash(position + uTime * 0.035) - 0.5) * 0.012 * uNoise;
        displaced += normal * (scanWave + microNoise + uTalk * 0.004);

        float mouthMask = ellipseMask(vUv, vec2(0.50, 0.33), vec2(0.16, 0.06));
        float jawMask = ellipseMask(vUv, vec2(0.50, 0.25), vec2(0.25, 0.14));
        float noseMask = ellipseMask(vUv, vec2(0.50, 0.47), vec2(0.10, 0.16));
        float eyeL = ellipseMask(vUv, vec2(0.34, 0.60), vec2(0.11, 0.08));
        float eyeR = ellipseMask(vUv, vec2(0.66, 0.60), vec2(0.11, 0.08));
        float earL = ellipseMask(vUv, vec2(0.07, 0.53), vec2(0.07, 0.18));
        float earR = ellipseMask(vUv, vec2(0.93, 0.53), vec2(0.07, 0.18));
        float featureMask = max(max(noseMask, mouthMask), max(max(eyeL, eyeR), max(earL, earR)));
        float flatten = mix(1.0, 0.14, clamp(featureMask, 0.0, 1.0));
        displaced.z *= flatten;

        float open = clamp(uMouthOpen * 1.35, 0.0, 1.0);
        displaced.y -= jawMask * open * 0.085;
        displaced.z += mouthMask * open * 0.040;
        displaced.x += sign(position.x) * mouthMask * open * 0.010;
        vMouthMask = mouthMask;
        vFeatureMask = featureMask;

        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
        vWorldY = worldPosition.y;
        vViewPos = -mvPosition.xyz;
        vNormalV = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uTalk;
      uniform float uMouthOpen;
      uniform float uGlow;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec2 vUv;
      varying float vWorldY;
      varying float vMouthMask;
      varying float vFeatureMask;

      float lineMask(vec2 uv, vec2 center, vec2 radius) {
        vec2 d = (uv - center) / radius;
        float dist2 = dot(d, d);
        return exp(-dist2);
      }

      void main() {
        vec3 N = normalize(vNormalV);
        vec3 V = normalize(vViewPos);
        vec3 L = normalize(vec3(0.20, 0.36, 0.92));
        float ndl = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
        float fresnel = pow(1.0 - abs(dot(N, V)), 2.20);
        float scanRaw = sin((vWorldY * 78.0) - (uTime * 9.0));
        float scan = smoothstep(0.84, 1.0, scanRaw);
        float slowBand = smoothstep(0.02, 0.18, abs(fract(vWorldY * 1.15 - uTime * 0.10) - 0.5));

        float eyeLeft = lineMask(vUv, vec2(0.34, 0.60), vec2(0.065, 0.010));
        float eyeRight = lineMask(vUv, vec2(0.66, 0.60), vec2(0.065, 0.010));
        float browLeft = lineMask(vUv, vec2(0.34, 0.67), vec2(0.080, 0.008));
        float browRight = lineMask(vUv, vec2(0.66, 0.67), vec2(0.080, 0.008));
        float noseLine = lineMask(vUv, vec2(0.50, 0.49), vec2(0.018, 0.070)) * 0.28;
        float faceGuide = max(max(eyeLeft, eyeRight), max(max(browLeft, browRight), noseLine));

        float shadow = 1.0 - ndl;
        vec3 whiteBase = vec3(0.93, 0.965, 1.0);
        vec3 shadowTone = vec3(0.095, 0.12, 0.15);
        vec3 color = mix(shadowTone, whiteBase, 0.55 + ndl * 0.45);
        color += vec3(1.0) * fresnel * 0.28;
        color += vec3(0.85, 0.96, 1.0) * scan * 0.10;
        color += vec3(1.0) * faceGuide * 0.34;
        color *= uGlow;

        float alpha = 0.20 + fresnel * 0.22 + scan * 0.025 + uTalk * 0.035;
        alpha += faceGuide * 0.09;
        alpha *= 0.90 + slowBand * 0.10;
        alpha = clamp(alpha, 0.08, 0.62);

        gl_FragColor = vec4(color, alpha);
      }
    `
  });

  const wireMaterial = new THREE.LineBasicMaterial({
    color: 0xf4fbff,
    transparent: true,
    opacity: 0.075,
    blending: THREE.NormalBlending,
    depthWrite: false
  });

  const pointsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.008,
    transparent: true,
    opacity: 0.095,
    blending: THREE.NormalBlending,
    depthWrite: false
  });

  const faceModelRoot = new THREE.Group();
  faceGroup.add(faceModelRoot);

  let modelContent = null;
  const modelBaseScale = new THREE.Vector3(1, 1, 1);
  let expressionTiltGroup = new THREE.Group();
  let mouthOverlay = null;
  let mouthInterior = null;
  let mouthUpperLine = null;
  let mouthLowerLine = null;

  function fitModelToStage(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const targetHeight = 3.20;
    const scale = targetHeight / Math.max(size.y, 0.0001);
    object.scale.setScalar(scale);
    object.position.set(-center.x * scale, -center.y * scale + 0.02, -center.z * scale);
  }

  function decorateMesh(mesh) {
    mesh.material = hologramMaterial;
    mesh.renderOrder = 1;

    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry), wireMaterial);
    wire.renderOrder = 2;
    wire.scale.setScalar(1.0015);
    mesh.add(wire);

    const points = new THREE.Points(mesh.geometry, pointsMaterial);
    points.renderOrder = 3;
    points.scale.setScalar(1.003);
    mesh.add(points);
  }

  function collectMeshes(object) {
    const meshes = [];
    object.traverse((child) => {
      if (child.isMesh && child.geometry) meshes.push(child);
    });
    return meshes;
  }

  function selectPrimaryHeadMesh(object) {
    const meshes = collectMeshes(object);
    if (!meshes.length) throw new Error('GLB内に表示可能なMeshが見つかりません。');

    // 眼球・歯・口内などの小さいサブメッシュまでホログラム化すると、
    // 目や口が多重に発光して見える。最大バウンディングボックスのメッシュだけを頭部として使う。
    let best = meshes[0];
    let bestScore = -Infinity;
    for (const mesh of meshes) {
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      const size = box.getSize(new THREE.Vector3());
      const volume = size.x * size.y * size.z;
      const vertexCount = mesh.geometry.attributes.position?.count || 0;
      const score = volume * 1000 + vertexCount;
      if (score > bestScore) {
        best = mesh;
        bestScore = score;
      }
    }

    console.info('[hologram] selected primary mesh:', best.name || '(unnamed)', 'from', meshes.length, 'meshes');

    const group = new THREE.Group();
    const mesh = best.clone(false);
    mesh.geometry = best.geometry.clone();
    mesh.geometry.computeVertexNormals();
    decorateMesh(mesh);
    group.add(mesh);
    return group;
  }


  function createLineFromPoints(points, radius, material) {
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.Mesh(new THREE.TubeGeometry(curve, 42, radius, 8, false), material);
  }

  function createMouthOverlay() {
    const group = new THREE.Group();
    group.position.set(MOUTH_OVERLAY.x, MOUTH_OVERLAY.y, MOUTH_OVERLAY.z);
    group.rotation.x = -0.02;
    group.renderOrder = 20;

    const lineMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const interiorMaterial = new THREE.MeshBasicMaterial({
      color: 0x03080c,
      transparent: true,
      opacity: 0.42,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const upperPoints = [];
    const lowerPoints = [];
    for (let i = 0; i <= 48; i += 1) {
      const t = i / 48;
      const x = (t - 0.5) * MOUTH_OVERLAY.width;
      const arch = Math.sin(t * Math.PI);
      upperPoints.push(new THREE.Vector3(x, MOUTH_OVERLAY.closedHeight + arch * 0.020, 0));
      lowerPoints.push(new THREE.Vector3(x, -MOUTH_OVERLAY.closedHeight - arch * 0.012, 0));
    }

    mouthUpperLine = createLineFromPoints(upperPoints, MOUTH_OVERLAY.lineRadius, lineMaterial);
    mouthLowerLine = createLineFromPoints(lowerPoints, MOUTH_OVERLAY.lineRadius, lineMaterial.clone());

    const shape = new THREE.Shape();
    const halfW = MOUTH_OVERLAY.width * 0.46;
    const h = 0.035;
    shape.moveTo(-halfW, 0);
    shape.quadraticCurveTo(0, h, halfW, 0);
    shape.quadraticCurveTo(0, -h, -halfW, 0);
    mouthInterior = new THREE.Mesh(new THREE.ShapeGeometry(shape), interiorMaterial);
    mouthInterior.scale.y = 0.12;
    mouthInterior.position.z = -0.004;

    group.add(mouthInterior, mouthUpperLine, mouthLowerLine);
    return group;
  }

  async function loadHumanHead() {
    boot.onStatus?.('人型GLB顔モデルを取得中...');
    const gltf = await loadGltf(MODEL_URL);

    // v4: GLB全体ではなく、頭部のメインメッシュだけを使用。
    // これにより眼球・歯・口内・不要なサブメッシュの多重発光を避ける。
    modelContent = selectPrimaryHeadMesh(gltf.scene);
    fitModelToStage(modelContent);
    modelBaseScale.copy(modelContent.scale);
    faceModelRoot.add(modelContent);

    expressionTiltGroup = new THREE.Group();
    expressionTiltGroup.position.set(0, 0, 0);
    faceGroup.add(expressionTiltGroup);

    mouthOverlay = createMouthOverlay();
    faceGroup.add(mouthOverlay);
  }

  const baseGroup = new THREE.Group();
  baseGroup.position.set(0, -1.72, 0);
  root.add(baseGroup);
  const baseDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.44, 0.022, 96, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf5fbff, transparent: true, opacity: 0.12, blending: THREE.NormalBlending, depthWrite: false })
  );
  const baseCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.74, 64, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.045, blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  baseCone.position.y = 0.36;
  baseGroup.add(baseDisc, baseCone);

  function createBackgroundParticles(count = 240) {
    const positions = [];
    for (let i = 0; i < count; i += 1) {
      positions.push(
        (Math.random() - 0.5) * 9.5,
        (Math.random() - 0.5) * 6.5,
        -1.8 - Math.random() * 5.5
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xf3f8ff,
      size: 0.018,
      transparent: true,
      opacity: 0.42,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geometry, material);
    points.userData.basePositions = positions.slice();
    return points;
  }

  const backgroundParticles = createBackgroundParticles();
  scene.add(backgroundParticles);

  const pointLight = new THREE.PointLight(0xffffff, 2.15, 8.0);
  pointLight.position.set(0, 0.3, 2.5);
  scene.add(pointLight);
  const rearLight = new THREE.PointLight(0xaec5d6, 0.65, 7.0);
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

    if (expressionTiltGroup) {
      expressionTiltGroup.rotation.z = THREE.MathUtils.degToRad(thinking ? -1.3 : serious ? 0.8 : 0);
      expressionTiltGroup.position.y = smile ? 0.010 : serious ? -0.008 : 0;
    }
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
      state.targetMouth = Math.min(1, 0.18 + seed * (1.05 + Math.random() * 0.30));
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
    state.targetMouth = 0.85;
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

    const open = Math.min(1, state.mouth * state.talkIntensity * 1.85);
    materialUniforms.uTalk.value = open;
    materialUniforms.uMouthOpen.value = open;

    if (mouthOverlay && mouthInterior && mouthUpperLine && mouthLowerLine) {
      const h = MOUTH_OVERLAY.closedHeight + open * MOUTH_OVERLAY.openHeight;
      mouthUpperLine.position.y = h * 0.18;
      mouthLowerLine.position.y = -h;
      mouthInterior.scale.y = 0.12 + open * 1.82;
      mouthInterior.material.opacity = 0.18 + open * 0.45;
      mouthUpperLine.material.opacity = 0.62 + open * 0.24;
      mouthLowerLine.material.opacity = 0.66 + open * 0.28;
      mouthOverlay.scale.x = 1.0 + open * 0.08;
    }
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

    if (backgroundParticles?.geometry?.attributes?.position) {
      const pos = backgroundParticles.geometry.attributes.position;
      const base = backgroundParticles.userData.basePositions;
      for (let i = 0; i < pos.count; i += 1) {
        const y = base[i * 3 + 1] + Math.sin(elapsed * 0.25 + base[i * 3] * 1.2) * 0.025;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    if (backgroundParticles.userData.material) {
      backgroundParticles.userData.material.opacity = 0.30 + Math.sin(elapsed * 0.45) * 0.04;
    }

    const floatY = Math.sin(elapsed * 0.72) * 0.040;
    const yaw = Math.sin(elapsed * 0.28) * 0.040;
    const roll = Math.sin(elapsed * 0.20) * 0.006;
    faceGroup.position.y = 0.32 + floatY;
    faceGroup.rotation.y = yaw;
    faceGroup.rotation.z = roll;

    if (modelContent) {
      modelContent.scale.z = modelBaseScale.z * state.depthScale;
    }
    pointLight.intensity = (1.85 + state.talkIntensity * 0.65 + Math.sin(elapsed * 2.8) * 0.10) * state.glowScale;
    baseDisc.scale.setScalar(1 + Math.sin(elapsed * 1.7) * 0.055 + state.talkIntensity * 0.08);
    baseCone.material.opacity = 0.055 + state.talkIntensity * 0.055;

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
  updatePreview(mockLines[0]);
  setExpression('neutral');
  resize();
  animate();

  await loadHumanHead();
  setExpression('neutral');
  boot.hideStatus?.();
}
