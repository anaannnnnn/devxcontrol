// OpenAI-compatible chat client. Works with Ollama (/v1), Groq, Gemini (openai endpoint), OpenRouter and anything alike.
export function makeLlm({ integrations }) {
  const cfg = () => integrations.llm();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Turns a provider error into plain words. Rate / size limits are NOT "you need a paid plan": we shrink and retry first.
  const explain = (status, body) => {
    const m = (() => { try { return JSON.parse(body)?.error?.message || ''; } catch { return body; } })() || String(body);
    if (status === 401 || status === 403) return `The AI key was refused (${status}). Check the key in Connections.`;
    if (status === 404) return `The AI model or address was not found (${status}). ${m.slice(0, 120)}`;
    if (status === 413 || status === 429) return `The AI provider is limiting requests right now (${status}). ${m.slice(0, 160)}`;
    return `AI endpoint ${status}: ${m.slice(0, 200)}`;
  };
  // Pull "Limit 6000, Requested 9000" style numbers out of a provider message
  const limits = (m) => { const l = /limit\s+(\d+)/i.exec(m), r = /requested\s+(\d+)/i.exec(m); return l ? { limit: +l[1], requested: r ? +r[1] : 0 } : null; };
  const approxTokens = (msgs) => Math.ceil(msgs.reduce((n, x) => n + String(x.content).length, 0) / 3.5);
  async function chat(messages, { json = false, maxTokens = 4096, temperature = 0.2, timeout = 300000 } = {}) {
    const c = cfg(); if (!c) throw Object.assign(new Error('No AI model is connected yet. Add one in Connections.'), { status: 409, code: 'no-llm' });
    let mt = maxTokens, useJson = json, last = '';
    for (let attempt = 0; attempt < 6; attempt++) {
      let res, txt;
      try {
        res = await fetch(`${c.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST', signal: AbortSignal.timeout(timeout),
          headers: { 'content-type': 'application/json', ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) },
          body: JSON.stringify({ model: c.model, messages, temperature, max_tokens: mt, stream: false, ...(useJson ? { response_format: { type: 'json_object' } } : {}) }),
        });
        txt = await res.text();
      } catch (e) { last = `Could not reach the AI endpoint: ${e.message}`; if (attempt < 2) { await sleep(1500 * (attempt + 1)); continue; } throw new Error(last); }
      if (res.ok) {
        let data; try { data = JSON.parse(txt); } catch { throw new Error('AI endpoint returned something that is not JSON.'); }
        const out = data.choices?.[0]?.message?.content;
        if (typeof out !== 'string' || !out.trim()) { last = 'AI endpoint returned no message.'; if (attempt < 2) continue; throw new Error(last); }
        return out;
      }
      let msg = ''; try { msg = JSON.parse(txt)?.error?.message || ''; } catch { msg = txt; }
      last = explain(res.status, txt);
      // model does not support response_format: retry plain, we parse JSON ourselves
      if (useJson && (res.status === 400 || res.status === 422) && /response_format|json_object|json mode/i.test(msg)) { useJson = false; continue; }
      // max_tokens too big for this model
      if (res.status === 400 && /max_tokens|max_completion_tokens|context length|maximum context/i.test(msg)) { mt = Math.max(256, Math.floor(mt / 2)); continue; }
      // per-minute token budget: ask for less output, then wait the window out
      if (res.status === 413 || res.status === 429) {
        const lim = limits(msg);
        if (lim && lim.limit) {
          const room = lim.limit - approxTokens(messages) - 200;
          if (room >= 300 && attempt < 4) { mt = room < mt ? room : Math.floor(mt / 2); if (mt >= 200) continue; }
          if (room < 300 && attempt >= 1) throw new Error(`This request is bigger than the provider's per-minute limit (${lim.limit} tokens) on the current model. Pick a model with a larger limit in Connections.`);
        }
        const ra = Number(res.headers.get('retry-after')) || (/try again in\s+([\d.]+)s/i.exec(msg)?.[1] ? Math.ceil(+/try again in\s+([\d.]+)s/i.exec(msg)[1]) + 1 : 0);
        if (attempt < 4) { await sleep(Math.min(30000, (ra || 4 * (attempt + 1)) * 1000)); continue; }
      }
      if (res.status >= 500 && attempt < 3) { await sleep(2000 * (attempt + 1)); continue; }
      throw new Error(last);
    }
    throw new Error(last || 'The AI endpoint did not answer.');
  }
  const parseJson = (text) => {
    const t = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(t); } catch { /* try to find an object */ }
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('The model did not return valid JSON.');
  };
  return {
    configured: () => !!cfg(),
    chat,
    async json(messages, opts) { const out = await chat(messages, { ...opts, json: true }); return parseJson(out); },
    async test() {
      const t0 = Date.now(); const out = await chat([{ role: 'user', content: 'Reply with the single word: ready' }], { maxTokens: 16, timeout: 60000 });
      return { ok: true, ms: Date.now() - t0, reply: out.trim().slice(0, 60), model: cfg().model };
    },
    async models() {
      const c = cfg(); if (!c) return [];
      const res = await fetch(`${c.baseUrl}/models`, { signal: AbortSignal.timeout(8000), headers: c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {} });
      if (!res.ok) return []; const d = await res.json(); return (d.data || []).map((m) => m.id).slice(0, 100);
    },
  };
}
