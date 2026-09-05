---
name: "claude-api-in-prototypes"
description: "Claude API in prototypes\nCall Claude from your HTML artifacts via window.claude.complete"
---
The following helper is supplied by the hosted Claude Design environment only. Ordinary localhost HTML in Codex, Cursor, or Claude Code does not have `window.claude`. Check the target runtime before using this example. For local prototypes, use an explicitly labeled demo response or an existing user-authorized backend; never embed an API key in browser HTML. A real API integration is separate work with its own backend requirements.

In the hosted environment, HTML artifacts can call Claude via the built-in helper without adding an SDK or API key to the page.

```html
<script>
(async () => {
  const text = await window.claude.complete("Summarize this: ...");
  // or with a messages array:
  const text2 = await window.claude.complete({
    messages: [{ role: 'user', content: '...' }],
  });
})();
</script>
```

Calls default to `claude-haiku-4-5` with a 1024-token output cap. The body may also set `model` (haiku/sonnet families only), `max_tokens` (up to 32000), `system`, `tool_choice`, and client `tools` — standard Messages API shapes, except each tool also carries `run: async (input) => string` and the helper executes tool calls in-page and loops (max 8 model calls), resolving with the final text. Handler throws become is_error tool_results. Server tools (web search etc.) are rejected; no streaming; rate-limited 15 calls/minute per user, loop iterations included. Shared artifacts run under the viewer's quota.
