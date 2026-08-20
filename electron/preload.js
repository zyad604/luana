"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("luda", {
  platform: process.platform,
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, handler) => {
    const wrapped = (_event, data) => handler(data);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
