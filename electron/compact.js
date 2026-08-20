"use strict";

function usagePercent(usage) {
  if (!usage || typeof usage !== "object") return 0;
  const u = usage.usage || usage;
  const used =
    u.input_tokens ||
    u.inputTokens ||
    u.total_tokens ||
    u.totalTokens ||
    u.contextTokensUsed ||
    u.context_tokens_used ||
    (u.prompt_tokens || 0) + (u.completion_tokens || 0) ||
    0;
  const cap =
    u.context_window ||
    u.contextWindow ||
    u.contextWindowTokens ||
    u.context_window_tokens ||
    200000;
  if (!used) {
    if (typeof u.percent === "number") return u.percent;
    if (typeof u.contextPercent === "number") return u.contextPercent;
    if (typeof u.contextWindowUsage === "number") return u.contextWindowUsage;
    return 0;
  }
  return (used / cap) * 100;
}

module.exports = { usagePercent };
