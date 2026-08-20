@echo off
setlocal
set LUDA_ROOT=%~dp0..
set ELECTRON_RUN_AS_NODE=
set VSCODE_DEV=
node "%LUDA_ROOT%\electron\cli.js" %*
endlocal
