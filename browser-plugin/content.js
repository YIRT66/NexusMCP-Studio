if (!globalThis.__nexusContentInstalled) {
  globalThis.__nexusContentInstalled = true;
  chrome.runtime.onMessage.addListener((request, _sender, respond) => {
    if (request?.type !== 'nexus.webchat') return;
    Promise.resolve().then(() => globalThis.nexusWebchatAdapter(request.data)).then(value => respond({ ok: true, value }), error => respond({ ok: false, error: error.message }));
    return true;
  });
}
