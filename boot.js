const BOOT_VERSION = '20260708-2';
const bootStatus = document.getElementById('bootStatus');
const stage = document.getElementById('stage');

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

async function importFromCandidates(candidates) {
  const errors = [];

  for (const candidate of candidates) {
    try {
      writeBootStatus(`Three.jsを読み込み中: <strong>${candidate.name}</strong>`);
      return await import(candidate.url);
    } catch (error) {
      errors.push(`${candidate.name}: ${formatError(error)}`);
      console.warn(`[boot] Failed to import ${candidate.name}`, error);
    }
  }

  throw new Error(errors.join('\n'));
}

function verifyStage() {
  if (!stage) throw new Error('#stage が見つかりません。index.htmlのIDを確認してください。');
  const rect = stage.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) {
    throw new Error(`#stage のサイズが小さすぎます: ${Math.round(rect.width)} x ${Math.round(rect.height)}`);
  }
}

(async function boot() {
  try {
    verifyStage();

    const THREE = await importFromCandidates([
      {
        name: 'jsDelivr CDN',
        url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js'
      },
      {
        name: 'unpkg CDN',
        url: 'https://unpkg.com/three@0.180.0/build/three.module.min.js'
      },
      {
        name: 'esm.sh CDN',
        url: 'https://esm.sh/three@0.180.0'
      }
    ]);

    writeBootStatus('アプリ本体を読み込み中...');
    const app = await import(`./app.js?v=${BOOT_VERSION}`);
    app.initHologram(THREE);
    hideBootStatus();
  } catch (error) {
    console.error('[boot] Hologram boot failed', error);
    writeBootStatus(
      `<strong>ホログラム初期化に失敗しました。</strong><br>` +
      `<small>${formatError(error).replace(/\n/g, '<br>')}</small><br><br>` +
      `<small>主な原因: CDNブロック、app.jsの未アップロード、WebGL無効、ブラウザキャッシュ。</small>`,
      'error'
    );
  }
})();
