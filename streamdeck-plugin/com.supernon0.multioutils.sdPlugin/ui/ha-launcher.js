/* Le panneau Stream Deck ne sert plus que de point d’entrée vers la fenêtre unique. */
(function () {
  let ws, context, action;
  const button = document.getElementById('open-editor');
  const error = document.getElementById('open-error');
  function fail(message) { button.disabled = false; error.textContent = message; error.hidden = false; }
  button.onclick = () => {
    if (!ws || ws.readyState !== 1) return fail('Le plugin Stream Deck ne répond pas.');
    button.disabled = true; error.hidden = true;
    ws.send(JSON.stringify({ event: 'sendToPlugin', context, action, payload: { cmd: 'editor' } }));
  };
  window.connectElgatoStreamDeckSocket = function (port, uuid, registerEvent, _info, actionInfo) {
    context = uuid;
    try { action = JSON.parse(actionInfo).action; } catch { return fail('Touche introuvable.'); }
    ws = new WebSocket('ws://127.0.0.1:' + port);
    ws.onopen = () => { ws.send(JSON.stringify({ event: registerEvent, uuid })); button.disabled = false; };
    ws.onmessage = ({ data }) => {
      let message; try { message = JSON.parse(data); } catch { return; }
      if (message.event === 'sendToPropertyInspector' && message.payload?.cmd === 'editor') {
        if (message.payload.error) fail(message.payload.error);
        else { button.disabled = false; error.hidden = true; }
      }
    };
    ws.onerror = () => fail('Impossible de joindre le plugin Stream Deck.');
    ws.onclose = () => { fail('Le plugin Stream Deck est déconnecté.'); button.disabled = true; };
  };
})();
