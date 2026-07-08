export async function initHologram(THREE, GLTFLoader, boot = {}) {
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
  const FACE_MAP_URL = `${ASSET_BASE}Map-COL.jpg`;

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
    depthScale: Number(depthRange?.value || 1),
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
  camera.position.set(0, 0.03, 6.6);

  const root = new THREE.Group();
  root.position.y = 0.02;
  scene.add(root);

  const faceGroup = new THREE.Group();
  faceGroup.position.y = 0.32;
  root.add(faceGroup);

  const clock = new THREE.Clock();

  function createFallbackTexture() {
    const data = new Uint8Array([185, 245, 255, 255]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
  }

  function loadTexture(url) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

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
    uGlow: { value: 1 },
    uNoise: { value: 0.7 },
    uMap: { value: createFallbackTexture() }
  };

  const hologramMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    uniforms: materialUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uTalk;
      uniform float uNoise;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec2 vUv;
      varying float vWorldY;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.39));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      void main() {
        vUv = uv;
        vec3 displaced = position;
        float scanWave = sin((position.y * 16.0) + (uTime * 3.4)) * 0.004;
        float microNoise = (hash(position + uTime * 0.035) - 0.5) * 0.018 * uNoise;
        displaced += normal * (scanWave + microNoise + uTalk * 0.006);

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
      uniform float uGlow;
      uniform sampler2D uMap;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec2 vUv;
      varying float vWorldY;

      void main() {
        vec3 N = normalize(vNormalV);
        vec3 V = normalize(vViewPos);
        vec3 tex = texture2D(uMap, vUv).rgb;
        float lum = dot(tex, vec3(0.299, 0.587, 0.114));
        float darkDetail = 1.0 - smoothstep(0.18, 0.82, lum);
        float fresnel = pow(1.0 - abs(dot(N, V)), 2.0);
        float scanRaw = sin((vWorldY * 82.0) - (uTime * 10.0));
        float scan = smoothstep(0.78, 1.0, scanRaw);
        float slowBand = smoothstep(0.02, 0.18, abs(fract(vWorldY * 1.2 - uTime * 0.12) - 0.5));

        float alpha = 0.055 + fresnel * 0.34 + darkDetail * 0.18 + scan * 0.045 + uTalk * 0.070;
        alpha *= 0.80 + slowBand * 0.20;
        alpha = clamp(alpha, 0.035, 0.78);

        vec3 base = vec3(0.42, 0.92, 1.0);
        vec3 color = base * (0.62 + fresnel * 2.05 + darkDetail * 0.78 + scan * 0.34 + uTalk * 0.28) * uGlow;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });

  const wireMaterial = new THREE.LineBasicMaterial({
    color: 0x91f6ff,
    transparent: true,
    opacity: 0.145,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const pointsMaterial = new THREE.PointsMaterial({
    color: 0xb5fbff,
    size: 0.012,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const glowFeatureMaterial = new THREE.MeshBasicMaterial({
    color: 0xd9ffff,
    transparent: true,
    opacity: 0.60,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const dimFeatureMaterial = new THREE.MeshBasicMaterial({
    color: 0x83eaff,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const faceModelRoot = new THREE.Group();
  faceGroup.add(faceModelRoot);

  let modelContent = null;
  const modelBaseScale = new THREE.Vector3(1, 1, 1);
  let mouthGroup = null;
  let mouthInner = null;
  let mouthUpper = null;
  let mouthLower = null;
  let mouthInnerMaterial = null;
  let expressionTiltGroup = new THREE.Group();

  function fitModelToStage(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const targetHeight = 3.55;
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

  function createCurveTube(points, radius = 0.006, material = glowFeatureMaterial, tubularSegments = 36) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, 8, false);
    return new THREE.Mesh(geometry, material);
  }

  function createMouthOverlay() {
    const group = new THREE.Group();
    group.position.set(0, -0.51, 0.86);
    group.rotation.x = 0.02;

    const upperPoints = [];
    const lowerPoints = [];
    for (let i = 0; i <= 42; i += 1) {
      const t = i / 42;
      const x = (t - 0.5) * 0.56;
      const arch = Math.sin(t * Math.PI);
      upperPoints.push(new THREE.Vector3(x, 0.018 + arch * 0.032, 0));
      lowerPoints.push(new THREE.Vector3(x, -0.018 - arch * 0.030, 0));
    }

    mouthUpper = createCurveTube(upperPoints, 0.0065, glowFeatureMaterial, 42);
    mouthLower = createCurveTube(lowerPoints, 0.0065, glowFeatureMaterial, 42);

    const shape = new THREE.Shape();
    for (let i = 0; i <= 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      const x = Math.cos(a) * 0.22;
      const y = Math.sin(a) * 0.026;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }

    mouthInnerMaterial = new THREE.MeshBasicMaterial({
      color: 0x7ff3ff,
      transparent: true,
      opacity: 0.20,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    mouthInner = new THREE.Mesh(new THREE.ShapeGeometry(shape), mouthInnerMaterial);
    mouthInner.position.z = 0.004;
    mouthInner.scale.set(1, 0.42, 1);

    group.add(mouthInner, mouthUpper, mouthLower);
    return group;
  }

  function createEyeGlow(x) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      const px = Math.cos(a) * 0.055;
      const py = Math.sin(a) * 0.012;
      if (i === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    }
    const eye = new THREE.Mesh(new THREE.ShapeGeometry(shape), dimFeatureMaterial.clone());
    eye.position.set(x, 0.31, 0.84);
    eye.rotation.x = 0.02;
    return eye;
  }

  async function loadHumanHead() {
    boot.onStatus?.('人型GLB顔モデルを取得中...');
    const [gltf, faceMap] = await Promise.all([
      loadGltf(MODEL_URL),
      loadTexture(FACE_MAP_URL).catch((error) => {
        console.warn('[hologram] face texture failed, using flat hologram texture', error);
        return createFallbackTexture();
      })
    ]);

    materialUniforms.uMap.value = faceMap;

    modelContent = gltf.scene;
    modelContent.traverse((child) => {
      if (child.isMesh) {
        child.geometry.computeVertexNormals();
        decorateMesh(child);
      }
    });

    fitModelToStage(modelContent);
    modelBaseScale.copy(modelContent.scale);
    faceModelRoot.add(modelContent);

    expressionTiltGroup = new THREE.Group();
    expressionTiltGroup.position.set(0, 0, 0);
    faceGroup.add(expressionTiltGroup);

    mouthGroup = createMouthOverlay();
    expressionTiltGroup.add(mouthGroup);

    const eyeLeft = createEyeGlow(-0.23);
    const eyeRight = createEyeGlow(0.23);
    expressionTiltGroup.add(eyeLeft, eyeRight);
  }

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

  const halo1 = createEllipseRing(1.45, 0.52, 0.48, -0.06, Math.PI / 2);
  const halo2 = createEllipseRing(1.20, 0.42, -0.22, -0.05, Math.PI / 2);
  const halo3 = createEllipseRing(0.94, 0.30, -0.96, -0.02, Math.PI / 2);
  root.add(halo1, halo2, halo3);

  const baseGroup = new THREE.Group();
  baseGroup.position.set(0, -1.86, 0);
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

  function createBackgroundParticles(count = 240) {
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

  const pointLight = new THREE.PointLight(0x8ff6ff, 2.8, 8.0);
  pointLight.position.set(0, 0.3, 2.5);
  scene.add(pointLight);
  const rearLight = new THREE.PointLight(0x2dbdff, 1.0, 7.0);
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

    if (mouthUpper && mouthLower && mouthInnerMaterial) {
      mouthUpper.scale.y = smile ? 0.75 : serious ? 0.60 : 1.0;
      mouthLower.scale.y = smile ? 1.25 : serious ? 0.72 : 1.0;
      mouthInnerMaterial.opacity = serious ? 0.16 : smile ? 0.26 : 0.20;
    }

    if (expressionTiltGroup) {
      expressionTiltGroup.rotation.z = THREE.MathUtils.degToRad(thinking ? -1.5 : serious ? 1.0 : 0);
      expressionTiltGroup.position.y = smile ? 0.012 : serious ? -0.010 : 0;
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
    if (mouthInner && mouthUpper && mouthLower && mouthInnerMaterial) {
      mouthInner.scale.y = 0.42 + open * 4.4;
      mouthInner.scale.x = 0.88 + open * 0.16;
      mouthInnerMaterial.opacity = 0.14 + open * 0.36;
      mouthLower.position.y = -open * 0.070;
      mouthUpper.position.y = open * 0.012;
    }

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

    const floatY = Math.sin(elapsed * 0.72) * 0.040;
    const yaw = Math.sin(elapsed * 0.28) * 0.040;
    const roll = Math.sin(elapsed * 0.20) * 0.006;
    faceGroup.position.y = 0.32 + floatY;
    faceGroup.rotation.y = yaw;
    faceGroup.rotation.z = roll;

    if (modelContent) {
      modelContent.scale.z = modelBaseScale.z * state.depthScale;
    }
    if (expressionTiltGroup) {
      expressionTiltGroup.scale.z = state.depthScale;
    }

    const pulse = 1 + Math.sin(elapsed * 2.1) * 0.035 + state.talkIntensity * 0.045;
    halo1.rotation.z = elapsed * 0.08;
    halo2.rotation.z = -elapsed * 0.07;
    halo3.rotation.z = elapsed * 0.05;
    halo1.scale.setScalar(pulse);
    halo2.scale.setScalar(1 + Math.sin(elapsed * 1.55) * 0.025);
    halo3.scale.setScalar(1 + Math.sin(elapsed * 1.20) * 0.020);

    pointLight.intensity = (2.45 + state.talkIntensity * 1.3 + Math.sin(elapsed * 2.8) * 0.18) * state.glowScale;
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
