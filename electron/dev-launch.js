"use strict";
process.env.VITE_DEV_SERVER_URL = "http://127.0.0.1:5173";
const { spawn } = require("child_process");
const path = require("path");
const electron = require("electron");
spawn(electron, [path.join(__dirname, "..")], {
  stdio: "inherit",
  env: process.env,
  windowsHide: false,
});
