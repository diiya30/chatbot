const state = {
  topic: '',
  history: [], // { role: 'user'|'assistant', content: string, ts?: number }
  waiting: false,
};

const els = {
  topic: document.getElementById('topic'),
  chat: document.getElementById('chat'),
  input: document.getElementById('message'),
  send: document.getElementById('sendBtn'),
  clear: document.getElementById('clearBtn'),
  summarize: document.getElementById('summarizeBtn'),
  theme: document.getElementById('themeBtn'),
  scroll: document.getElementById('scrollBtn'),
  modal: document.getElementById('confirmModal'),
  modalOk: document.getElementById('confirmOk'),
  modalCancel: document.getElementById('confirmCancel'),
  modalBackdrop: null,
  modalText: document.getElementById('confirmText'),
};

els.modalBackdrop = document.querySelector('#confirmModal .modal-backdrop');

function saveToLocal() {
  const key = `chat_history_${state.topic || 'none'}`;
  try { localStorage.setItem(key, JSON.stringify(state.history)); } catch {}
}

function loadFromLocal(topic) {
  const key = `chat_history_${topic || 'none'}`;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function render() {
  els.chat.innerHTML = '';
  for (const m of state.history) {
    const row = document.createElement('div');
    row.className = 'row ' + (m.role === 'assistant' ? 'left' : 'right');

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = m.role === 'assistant' ? 'AI' : 'You';

    const bubble = document.createElement('div');
    bubble.className = 'msg ' + (m.role === 'assistant' ? 'bot' : 'user');
    bubble.textContent = m.content;

    if (m.role === 'assistant') {
      row.appendChild(avatar);
      row.appendChild(bubble);
    } else {
      row.appendChild(bubble);
      row.appendChild(avatar);
    }

    els.chat.appendChild(row);
  }
  els.chat.scrollTop = els.chat.scrollHeight;
}

function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light', t === 'light');
  try { localStorage.setItem('theme', t); } catch {}
  if (els.theme) {
    els.theme.textContent = t === 'light' ? 'Dark Mode' : 'Light Mode';
    els.theme.title = 'Toggle theme';
  }
}

function setTyping(on) {
  const existing = document.getElementById('typing');
  if (on) {
    if (existing) return;
    const wrap = document.createElement('div');
    wrap.id = 'typing';
    const row = document.createElement('div');
    row.className = 'row left';
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'AI';
    const bubble = document.createElement('div');
    bubble.className = 'msg bot';
    bubble.innerHTML = '<span class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>';
    row.appendChild(avatar);
    row.appendChild(bubble);
    wrap.appendChild(row);
    els.chat.appendChild(wrap);
    els.chat.scrollTop = els.chat.scrollHeight;
  } else if (existing) {
    existing.remove();
  }
}

async function sendMessage() {
  const userInput = els.input.value.trim();
  if (!state.topic) {
    alert('Please select a topic before sending a message.');
    return;
  }
  if (!userInput) return;

  // Push user message
  state.history.push({ role: 'user', content: userInput, ts: Date.now() });
  els.input.value = '';
  render();
  saveToLocal();

  // Call backend
  setWaiting(true);
  setTyping(true);
  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: state.topic, history: state.history, userInput }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || 'Request failed');
    state.history.push({ role: 'assistant', content: data.reply, ts: Date.now() });
  } catch (err) {
    state.history.push({ role: 'assistant', content: `Sorry, I ran into an issue: ${err.message}`, ts: Date.now() });
  } finally {
    setTyping(false);
    setWaiting(false);
    render();
    saveToLocal();
  }
}

async function summarizeChat() {
  if (!state.history.length) return;
  setTyping(true);
  setWaiting(true);
  try {
    const resp = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: state.topic, history: state.history }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || 'Request failed');
    state.history.push({ role: 'assistant', content: data.summary, ts: Date.now() });
  } catch (err) {
    state.history.push({ role: 'assistant', content: `Could not summarize: ${err.message}`, ts: Date.now() });
  } finally {
    setTyping(false);
    setWaiting(false);
    render();
    saveToLocal();
  }
}

// Events
els.send.addEventListener('click', sendMessage);
els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

els.clear.addEventListener('click', () => {
  state.history = [];
  render();
  saveToLocal();
});

els.summarize.addEventListener('click', summarizeChat);

async function confirmResetTopic(newTopic) {
  return new Promise((resolve) => {
    const onCancel = () => { cleanup(); resolve(false); };
    const onOk = () => { cleanup(); resolve(true); };
    const onKey = (e) => { if (e.key === 'Escape') { onCancel(); } }
    function cleanup() {
      document.removeEventListener('keydown', onKey);
      els.modal.hidden = true;
      els.modalOk.removeEventListener('click', onOk);
      els.modalCancel.removeEventListener('click', onCancel);
      els.modalBackdrop?.removeEventListener('click', onCancel);
    }
    // Update text with topic hint
    if (newTopic) {
      els.modalText.textContent = `Changing topic to "${newTopic}" will reset this chat. Continue?`;
    } else {
      els.modalText.textContent = 'Changing the topic will reset this chat. Continue?';
    }
    els.modal.hidden = false;
    document.addEventListener('keydown', onKey);
    els.modalOk.addEventListener('click', onOk);
    els.modalCancel.addEventListener('click', onCancel);
    els.modalBackdrop?.addEventListener('click', onCancel);
  });
}

els.topic.addEventListener('change', async () => {
  const newTopic = els.topic.value;
  if (state.topic && state.history.length) {
    const reset = await confirmResetTopic(newTopic);
    if (!reset) {
      // revert selection
      els.topic.value = state.topic;
      return;
    }
  }
  state.topic = newTopic;
  state.history = loadFromLocal(state.topic);
  render();
});

// Initial render
render();

// Theme setup
const savedTheme = (() => { try { return localStorage.getItem('theme'); } catch { return null } })();
applyTheme(savedTheme || 'dark');
els.theme?.addEventListener('click', () => {
  const current = document.body.classList.contains('light') ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
});

// Auto-resize textarea and disable controls while waiting
function autosize() {
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(180, Math.max(36, els.input.scrollHeight)) + 'px';
}
function setWaiting(flag) {
  state.waiting = !!flag;
  els.send.disabled = state.waiting;
  els.input.disabled = state.waiting;
}
els.input.addEventListener('input', autosize);
autosize();

// Scroll-to-bottom logic
function onScroll() {
  const nearBottom = (els.chat.scrollHeight - els.chat.scrollTop - els.chat.clientHeight) < 40;
  els.scroll.classList.toggle('show', !nearBottom);
}
els.chat.addEventListener('scroll', onScroll);
els.scroll?.addEventListener('click', () => {
  els.chat.scrollTo({ top: els.chat.scrollHeight, behavior: 'smooth' });
});
