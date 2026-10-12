// Apply the saved theme before first paint so there is no light/dark flash.
try {
  var s = JSON.parse(localStorage.getItem('fahm.state.v1') || '{}');
  var t = s.settings && s.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
