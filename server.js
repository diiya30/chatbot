// Simple Express server that serves the frontend and proxies chat to Groq
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use(express.static('public'));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Default to a supported, fast model; allow override via .env and sanitize known deprecated IDs
let GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
if (/gemma/i.test(GROQ_MODEL) || /^llama3-8b-8192$/i.test(GROQ_MODEL) || /^llama3-70b-8192$/i.test(GROQ_MODEL)) {
  console.warn(`Configured GROQ_MODEL='${GROQ_MODEL}' appears deprecated; using 'llama-3.1-8b-instant'`);
  GROQ_MODEL = 'llama-3.1-8b-instant';
}

if (!GROQ_API_KEY) {
  console.warn('Warning: GROQ_API_KEY is not set. Set it in .env');
}

// List available models for the current Groq API key
app.get('/api/models', async (req, res) => {
  try {
    if (!GROQ_API_KEY) return res.status(500).json({ error: 'Server missing GROQ_API_KEY.' });
    const resp = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: `Groq API error ${resp.status}: ${text}` });
    }
    const data = await resp.json();
    const models = (data?.data || []).map((m) => m.id).sort();
    res.json({ models, raw: data });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to fetch models' });
  }
});

function formatHistory(history = []) {
  return history
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n');
}

function isDecommissionedErrorPayload(payloadText) {
  try {
    const obj = JSON.parse(payloadText);
    const code = obj?.error?.code || '';
    const msg = obj?.error?.message || '';
    return (
      /model_decommissioned/i.test(code) ||
      /decommissioned/i.test(msg)
    );
  } catch {
    return /decommissioned/i.test(String(payloadText || ''));
  }
}

async function tryChatWithModel(modelId, messages, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 25000);
  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.7,
        max_tokens: 512,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text();
      const err = new Error(`Groq API error ${resp.status}: ${text}`);
      err._rawText = text;
      err._status = resp.status;
      throw err;
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('No content returned from Groq');
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGroqChat(messages, options = {}) {
  const fallbacks = [
    GROQ_MODEL,
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'qwen/qwen3-32b',
    'moonshotai/kimi-k2-instruct',
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  let lastError;
  for (const modelId of fallbacks) {
    try {
      return await tryChatWithModel(modelId, messages, options);
    } catch (err) {
      const text = err?._rawText || String(err?.message || '');
      const isDecom = isDecommissionedErrorPayload(text);
      if (isDecom) {
        console.warn(`Model '${modelId}' is decommissioned. Trying next fallback...`);
        lastError = err;
        continue;
      }
      // If not a decommissioned error, surface immediately
      throw err;
    }
  }
  // If we exhausted fallbacks with decommissioned errors
  if (lastError) throw lastError;
  throw new Error('No valid model available to complete the request.');
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { topic, history, userInput } = req.body || {};
    if (!topic) return res.status(400).json({ error: 'Please select a topic before chatting.' });
    if (!userInput || !String(userInput).trim()) return res.status(400).json({ error: 'Message cannot be empty.' });
    if (!GROQ_API_KEY) return res.status(500).json({ error: 'Server missing GROQ_API_KEY.' });

    const formatted = formatHistory(history);
    const messages = [
      { role: 'system', content: `You are a helpful assistant specialized in ${topic}.` },
      {
        role: 'user',
        content:
          `Here is the conversation so far:\n${formatted}\n\n` +
          `Respond helpfully to the latest user message: ${userInput}`,
      },
    ];

    const reply = await callGroqChat(messages);
    res.json({ reply });
  } catch (err) {
    const msg = err?.message || 'Unknown error';
    res.status(500).json({ error: `Failed to get response: ${msg}` });
  }
});

// Optional: summarize endpoint
app.post('/api/summarize', async (req, res) => {
  try {
    const { topic, history } = req.body || {};
    if (!GROQ_API_KEY) return res.status(500).json({ error: 'Server missing GROQ_API_KEY.' });
    const formatted = formatHistory(history);
    const messages = [
      { role: 'system', content: `You are a helpful assistant specialized in ${topic || 'general topics'}.` },
      {
        role: 'user',
        content:
          `Summarize the following conversation briefly and clearly so a newcomer can catch up:\n` +
          `${formatted}`,
      },
    ];
    const reply = await callGroqChat(messages, { timeoutMs: 25000 });
    res.json({ summary: reply });
  } catch (err) {
    res.status(500).json({ error: `Failed to summarize: ${err?.message || 'Unknown error'}` });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
