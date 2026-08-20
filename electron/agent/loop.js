"use strict";

const acp = require("../grok-acp");
const { setModel, setEffort, modelName, effortName } = require("../grok-cli");

async function runAgent(opts) {
  const { threadId, workspace, prompt, model, effort, grokSessionId, emit, isCancelled } = opts;
  return acp.runPrompt({
    threadId,
    prompt,
    cwd: workspace || undefined,
    model: model || modelName(),
    effort: effort || effortName(),
    grokSessionId,
    emit,
    isCancelled,
  });
}

function resetSession(threadId) {
  return acp.newChat(threadId);
}

function killCurrent(threadId) {
  acp.stop(threadId);
}

function cancelRun(threadId) {
  return acp.cancel(threadId);
}

module.exports = {
  runAgent,
  modelName,
  setModel,
  setEffort,
  effortName,
  resetSession,
  killCurrent,
  cancelRun,
  isBusy: acp.isBusy,
  busyIds: acp.busyIds,
};
