// Everything that touches the Android shell lives here; in a normal browser each call degrades gracefully.

const N = typeof window !== 'undefined' ? window.Native : undefined;
const noop = () => {};

export const isNative = !!N;

export const platform = {
  isNative,
  versionName: () => (N ? N.versionName() : 'web'),
  versionCode: () => (N ? N.versionCode() : 0),

  haptic(kind) {
    try {
      if (N) N.haptic(kind);
      else if (navigator.vibrate) navigator.vibrate(kind === 'bad' ? [30, 40, 30] : kind === 'big' ? 40 : 10);
    } catch (e) { noop(); }
  },

  setTheme(dark, bg) {
    try { if (N) N.setTheme(!!dark, bg); } catch (e) { noop(); }
  },

  share(title, text) {
    try {
      if (N) N.share(title, text);
      else if (navigator.share) navigator.share({ title, text }).catch(noop);
      else this.copy(text);
    } catch (e) { noop(); }
  },

  async copy(text) {
    try {
      if (N) N.copy(text);
      else await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  },

  openUrl(url) {
    try { if (N) N.openUrl(url); else window.open(url, '_blank', 'noopener'); } catch (e) { noop(); }
  },

  notificationsGranted: () => (N ? N.notificationsGranted() : typeof Notification !== 'undefined' && Notification.permission === 'granted'),
  requestNotifications() {
    if (N) N.requestNotifications();
    else if (typeof Notification !== 'undefined') Notification.requestPermission().then((p) => window.__native.onNotificationPermission(p === 'granted'));
  },
  setReminder(cfg) {
    try { if (N) N.setReminder(JSON.stringify(cfg)); } catch (e) { noop(); }
  },
  goalDone(day, streak) {
    try { if (N) N.goalDone(day, streak | 0); } catch (e) { noop(); }
  },

  canInstallUpdates: () => (N ? N.canInstallUpdates() : false),
  openInstallSettings() { try { if (N) N.openInstallSettings(); } catch (e) { noop(); } },
  installUpdate(url) { try { if (N) N.installUpdate(url); } catch (e) { noop(); } },
  keepScreenOn(on) { try { if (N) N.keepScreenOn(!!on); } catch (e) { noop(); } },
  exit() { try { if (N) N.exit(); } catch (e) { noop(); } },
};

// Callbacks the native side invokes.
window.__native = window.__native || {};
