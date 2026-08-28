const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

const listen = (channel) => (handler) => {
  const wrapped = (_e, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld('utune', {
  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:maximize'),
    close: () => invoke('window:close'),
    isMaximized: () => invoke('window:isMaximized'),
    setFullScreen: (on) => invoke('window:setFullScreen', on),
    onState: listen('window:state'),
  },

  app: {
    mediaBase: () => invoke('app:mediaBase'),
    recoveredFrom: () => invoke('app:recoveredFrom'),
    dataDir: () => invoke('app:dataDir'),
    openDataDir: () => invoke('app:openDataDir'),
    openExternal: (url) => invoke('app:openExternal', url),
    version: () => invoke('app:version'),
    createDesktopShortcut: (name) => invoke('app:createDesktopShortcut', name),
    pinInfo: () => invoke('app:pinInfo'),
  },

  library: {
    get: () => invoke('lib:get'),
    pickAndImport: () => invoke('lib:pickAndImport'),
    pickFolderAndImport: () => invoke('lib:pickFolderAndImport'),
    importPaths: (paths) => invoke('lib:importPaths', paths),
    remove: (id, deleteFile) => invoke('lib:remove', id, deleteFile),
    update: (id, patch) => invoke('lib:update', id, patch),
    reveal: (id) => invoke('lib:revealTrack', id),
    pickCover: (id) => invoke('lib:pickCover', id),
    onImportProgress: listen('lib:importProgress'),
  },

  playlists: {
    create: (name) => invoke('pl:create', name),
    update: (id, patch) => invoke('pl:update', id, patch),
    remove: (id) => invoke('pl:delete', id),
    add: (id, trackIds) => invoke('pl:add', id, trackIds),
    pickImage: (id) => invoke('pl:pickImage', id),
  },

  cove: {
    pickSounds: () => invoke('cove:pickSounds'),
    listSounds: () => invoke('cove:listSounds'),
    deleteSound: (name) => invoke('cove:deleteSound', name),
    getTheme: () => invoke('cove:getTheme'),
    saveTheme: (v) => invoke('cove:saveTheme', v),
  },

  youtube: {
    download: (url, opts) => invoke('yt:download', url, opts),
    cancel: (jobId) => invoke('yt:cancel', jobId),
    pickCookies: () => invoke('yt:pickCookies'),
    onProgress: listen('yt:progress'),
  },

  profile: {
    get: () => invoke('profile:get'),
    save: (patch) => invoke('profile:save', patch),
    pickAvatar: () => invoke('profile:pickAvatar'),
    pickSound: () => invoke('profile:pickSound'),
    listSounds: () => invoke('profile:listSounds'),
    deleteSound: (name) => invoke('profile:deleteSound', name),
  },

  theme: {
    get: () => invoke('theme:get'),
    save: (theme) => invoke('theme:save', theme),
    exportFile: (payload, name) => invoke('theme:export', payload, name),
    importFile: () => invoke('theme:import'),
  },

  assets: {
    pickBackground: () => invoke('asset:pickBackground'),
    listBackgrounds: () => invoke('asset:listBackgrounds'),
    deleteBackground: (name) => invoke('asset:deleteBackground', name),
    pickFont: () => invoke('font:pick'),
    listFonts: () => invoke('font:list'),
    deleteFont: (name) => invoke('font:delete', name),
  },

  // Electron removed File.path; this is the supported replacement for drag & drop.
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (err) {
      return null;
    }
  },
});
