# chatbot
# Intelligent Chatbot — Topic Selection + Memory (Groq)

Web-based chatbot using Groq’s OpenAI-compatible chat completions API. Includes topic selection, conversation memory, typing indicator, error handling, and a “Summarize Chat” option.

**Features**
- Topic selector: AI Tools, Movies, Travel, Health, Books
- Conversation memory in the browser (per-topic), persisted via `localStorage`
- Clean chat UI with bubbles and typing indicator
- Robust error handling and model auto-fallback (avoids decommissioned models)
- Summarize Chat (optional bonus)

**Tech Stack**
- Frontend: HTML, CSS, Vanilla JS (`fetch`)
- Backend: Node.js (Express), `dotenv`, `cors`
- LLM: Groq chat completions endpoint

**Project Structure**
- `public/index.html`: main UI (topic dropdown, chat window, controls)
- `public/styles.css`: styling for chat bubbles, layout, typing indicator
- `public/app.js`: client logic (state, API calls, localStorage, UX)
- `server.js`: Express server + Groq proxy, model fallback, API routes
- `.env.example`: sample env vars
- `.env`: your real secrets (not committed)
- `package.json`: dependencies and start script

## Setup
- Prerequisite: Node.js v18+ (uses built-in `fetch` in Node)

Windows (PowerShell)
- `Copy-Item .env.example .env`
- Edit `.env` and set:
  - `GROQ_API_KEY=your_groq_api_key`
  - Optional: `GROQ_MODEL=llama-3.1-8b-instant` (default already set)
  - Optional: `PORT=3000`
- Install deps: `npm install`
- Start server: `npm start`
- Open: `http://localhost:3000`

macOS/Linux
- `cp .env.example .env`
- Edit `.env` as above
- `npm install && npm start`
- Open: `http://localhost:3000`

## Using The App
- Select a topic (required), then type a message and click Send.
- The model will reply, with context built from your per-topic history.
- “Summarize” adds a short recap of the conversation to the chat.
- “Clear Chat” resets messages for the current topic.
- Switching topics prompts to reset; histories are isolated and saved per-topic in `localStorage`.

## Prompt Design (Per Assignment)
- System: “You are a helpful assistant specialized in [selected_topic].”
- User: “Here is the conversation so far: [previous_chat_history]. Respond helpfully to the latest user message: [user_input].”

In code, the server composes messages like:
- `[{ role: 'system', content: specialization }, { role: 'user', content: composed_history_and_user_input }]`

## API Endpoints
- `POST /api/chat`
  - Body: `{ topic: string, history: {role,content}[], userInput: string }`
  - Returns: `{ reply: string }`
- `POST /api/summarize`
  - Body: `{ topic?: string, history: {role,content}[] }`
  - Returns: `{ summary: string }`
- `GET /api/models`
  - Returns: `{ models: string[], raw: <Groq response> }`

## Model Selection + Auto-Fallback
- Default model: `llama-3.1-8b-instant` (fast, currently available under your key)
- You can change `GROQ_MODEL` in `.env` to any from `/api/models` (e.g., `llama-3.3-70b-versatile`, `qwen/qwen3-32b`).
- If a configured model is decommissioned, the server automatically retries with fallbacks:
  - `llama-3.1-8b-instant` → `llama-3.3-70b-versatile` → `qwen/qwen3-32b` → `moonshotai/kimi-k2-instruct`

## Error Handling
- Blocks sending if topic is not selected.
- Friendly error message if API fails or times out (25s server timeout).
- “Model decommissioned” errors are auto-detected and retried with supported models.

## Troubleshooting
- “Server missing GROQ_API_KEY.”
  - Set `GROQ_API_KEY` in `.env`, restart (`npm start`).
- 401/403 errors
  - Key invalid/expired. Regenerate in Groq Console and update `.env`.
- “model decommissioned”
  - The backend retries with fallbacks. Also verify available models at `http://localhost:3000/api/models`.
- Port in use
  - Set another `PORT` in `.env` and restart.
- No responses or stale behavior
  - Hard refresh the browser, or clear `localStorage`.

## Submission (GitHub)
- Initialize and push:
  - `git init`
  - `git add .`
  - `git commit -m "Intelligent chatbot: topic + memory"`
  - `git branch -M main`
  - `git remote add origin <your-repo-url>`
  - `git push -u origin main`
- Include link to the repo and ensure this README has your reflection filled.

## Reflection
- What was challenging?
 I had very little knowledge about langchain so it was difficult to implement this POC in just 24 hours, however I did some reasearch about how to integrate the LLM models in this project and found this website i.e groq.com where you can use any model that that freely available.
- What did you learn about GenAI?
  I learnt about this new technology like langchain , and for the open source configuration, I also did some research and found about this ollama where you can download the open source models and run them locally.
- How would you improve with more time?
  Just like i learnt about this technology, i think i can do the same with whatever been assigned to me regarding task or tech, i can learn and grasp them quickly. 
## Notes
- Keep `.env` private (do not commit). `.env.example` shows required variables.
- Node 18+ is required.
- You can switch to OpenAI/Gemini/HF by updating `server.js` and `.env` accordingly.
