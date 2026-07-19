const { contextBridge, ipcRenderer } = require('electron');

const allowedChannels = new Set([
  'save-settings',
  'load-settings',
  'save-media-device-preferences',
  'load-media-device-preferences',
  'get-recordings-path',
  'toggle-fullscreen',
  'save-recording',
  'check-whisper-ready',
  'tts-speak',
  'tts-set-config',
  'tts-get-config',
  'tts-get-voices',
  'play-pregenerated-audio',
  'generate-dynamic-audio',
  'generate-question-audio',
  'delete-question-audio',
  'generate-question',
  'transcribe-audio'
]);

contextBridge.exposeInMainWorld('electronAPI', {
  invoke(channel, ...args) {
    if (!allowedChannels.has(channel)) {
      return Promise.reject(new Error(`IPC channel is not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  onFullscreenChanged(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Fullscreen callback must be a function');
    }
    const listener = (event, fullscreen) => callback(fullscreen);
    ipcRenderer.on('fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('fullscreen-changed', listener);
  }
});
