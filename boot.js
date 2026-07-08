const BOOT_VERSION = '20260708-15';
const bootStatus = document.getElementById('bootStatus');
const stage = document.getElementById('stage');
console.info('[boot] version', BOOT_VERSION);

function writeBootStatus(message, mode = 'info') {
  if (!bootStatus) return;
  bootStatus.hidden = false;
  bootStatus.dataset.mode = mode;
  bootStatus.innerHTML = message;
}

function hideBootStatus() {
  if (bootStatus) bootStatus.hidden = true;
}

function formatError(error) {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function verifyStage() {
  if (!stage) throw new Error('#stage が見つかりません。index.htmlのIDを確認してください。');
  const rect = stage.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) {
    throw new Error(`#stage のサイズが小さすぎます: ${Math.round(rect.width)} x ${Math.round(rect.height)}`);
  }
}

function getWebGlAvailability() {
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (gl2) return { ok: true, type: 'webgl2' };
    const gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: false });
    if (gl) return { ok: true, type: 'webgl1' };
    return { ok: false, type: 'none', reason: 'canvas.getContext("webgl") returned null' };
  } catch (error) {
    return { ok: false, type: 'error', reason: formatError(error) };
  }
}

async function startCanvasFallback(reason) {
  console.warn('[boot] starting Canvas2D fallback', reason);
  writeBootStatus(
    `<strong>WebGLまたは3Dモデル読み込みに問題があるため、Canvas 2Dフォールバックで起動します。</strong><br>` +
    `<small>${formatError(reason).replace(/\n/g, '<br>')}</small>`,
    'warning'
  );
  const fallback = await import(`./fallback.js?v=${BOOT_VERSION}`);
  fallback.initCanvasFallback({ reason: formatError(reason) });
  window.setTimeout(hideBootStatus, 1200);
}

window.addEventListener('error', (event) => {
  writeBootStatus(
    `<strong>JavaScript error</strong><br>${formatError(event.error || event.message)}<br><small>DevTools Consoleも確認してください。</small>`,
    'error'
  );
});

window.addEventListener('unhandledrejection', (event) => {
  writeBootStatus(
    `<strong>Unhandled promise rejection</strong><br>${formatError(event.reason)}<br><small>DevTools Consoleも確認してください。</small>`,
    'error'
  );
});

(async function boot() {
  try {
    verifyStage();
    const webgl = getWebGlAvailability();
    if (!webgl.ok) {
      await startCanvasFallback(new Error(`WebGL unavailable: ${webgl.reason}`));
      return;
    }

    let THREE;
    let GLTFLoader;
    let KTX2Loader;
    let MeshoptDecoder;

    try {
      writeBootStatus('Three.js / FaceCap用ローダーを読み込み中...');
      const [threeModule, gltfModule, ktx2Module, meshoptModule] = await Promise.all([
        import('three'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/loaders/KTX2Loader.js'),
        import('three/addons/libs/meshopt_decoder.module.js')
      ]);
      THREE = threeModule;
      GLTFLoader = gltfModule.GLTFLoader;
      KTX2Loader = ktx2Module.KTX2Loader;
      MeshoptDecoder = meshoptModule.MeshoptDecoder || meshoptModule.default;
    } catch (error) {
      await startCanvasFallback(error);
      return;
    }

    try {
      writeBootStatus('FaceCap morph targetモデルを読み込み中...');
      const app = await import(`./app.js?v=${BOOT_VERSION}`);
      await app.initHologram(THREE, GLTFLoader, {
        KTX2Loader,
        MeshoptDecoder,
        version: BOOT_VERSION,
        onStatus: (message, mode = 'info') => writeBootStatus(message, mode),
        hideStatus: hideBootStatus
      });
      hideBootStatus();
    } catch (error) {
      console.error('[boot] Hologram app failed', error);
      writeBootStatus(
        `<strong>ホログラム初期化に失敗しました。</strong><br>` +
        `<small>${formatError(error).replace(/\n/g, '<br>')}</small><br><br>` +
        `<small>主な原因: facecap.glbの読み込み失敗、KTX2/Meshoptローダー失敗、CDNブロック、app.jsの未アップロード、ブラウザキャッシュ。</small>`,
        'error'
      );
    }
  } catch (error) {
    console.error('[boot] Hologram boot failed', error);
    writeBootStatus(
      `<strong>ホログラム初期化に失敗しました。</strong><br>` +
      `<small>${formatError(error).replace(/\n/g, '<br>')}</small><br><br>` +
      `<small>主な原因: JavaScript構文エラー、ブラウザキャッシュ、WebGL無効。</small>`,
      'error'
    );
  }
})();
