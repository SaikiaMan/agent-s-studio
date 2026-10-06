# Agent Studio

A multi-agent workspace that turns a goal into a Markdown report and emails it to a recipient. A live Phaser pixel-art office visualizes the Researcher, Writer, and Courier as they work and physically hand off the report.

```text
Goal → Researcher → Writer → Courier → Email
        notes       report.md
```

## Features

- Researcher prepares concise notes using an OpenRouter-hosted model.
- Writer creates a polished Markdown report and saves `backend/outputs/report.md`.
- Courier emails the report as the message body with subject `Agent Studio Report`.
- FastAPI runs the workflow in the background and broadcasts lifecycle events over WebSocket.
- Phaser animates walking, sitting, tool activity, document handoffs, and delivery in a shared pixel-art office.
- A dark, mint-green CRT-inspired interface surrounds the simulation.

The current Researcher does **not** perform live web search. It uses model knowledge and preserves supplied references rather than claiming Google Search grounding.

## Local setup

Use Python 3.11 or later and Node.js 24 LTS. You need an OpenRouter API key and Gmail credentials for delivery. These commands use Windows PowerShell, starting from the repository root.

### Install backend dependencies

```powershell
python -m venv backend/.venv
backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt langchain-openai
```

The active LLM client requires `langchain-openai`, which is not yet listed in `backend/requirements.txt`; the command installs it explicitly.

### Configure the root `.env`

Create `.env` beside this README with your own values:

```dotenv
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_MODEL=google/gemini-2.5-flash
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=4096
GMAIL_ADDRESS=you@gmail.com
GMAIL_APP_PASSWORD=your-gmail-app-password
```

Use a Gmail app password for delivery. The active workflow uses OpenRouter and does not require Vertex AI credentials. `.env` is ignored by Git; never commit credentials.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Yes | OpenRouter authentication |
| `OPENROUTER_MODEL` | Yes | Researcher and Writer model |
| `LLM_TEMPERATURE` | No | Defaults to `0.2` |
| `LLM_MAX_TOKENS` | No | Defaults to `4096` |
| `GMAIL_ADDRESS` | For delivery | Sender address |
| `GMAIL_APP_PASSWORD` | For delivery | Gmail SMTP authentication |

Restart the backend after changing the LLM configuration.

### Start the backend

```powershell
backend\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Check [the health endpoint](http://127.0.0.1:8000/health); it should return `{"status":"ok"}`. Interactive API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### Start the frontend

In a second terminal:

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), enter a goal and recipient email, and select **Run Workflow**. This makes real model calls and sends a real email.

The frontend connects the WebSocket before submitting the workflow. Events drive a visual queue that never delays Python execution. The button prevents overlapping submissions from the same page and is released on Courier completion or an error.

## API and events

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Returns `{"status":"ok"}` |
| `POST /run` | Accepts `goal` and `recipient`; immediately returns `{"status":"started"}` |
| `WebSocket /ws` | Broadcasts JSON lifecycle events |

Example request body:

```json
{
  "goal": "Explain the benefits and limitations of multi-agent workflows",
  "recipient": "you@example.com"
}
```

The frontend posts to `http://127.0.0.1:8000/run` and connects to `ws://127.0.0.1:8000/ws`.

Canonical event types are `spawn`, `working`, `tool_start`, `tool_end`, `handoff`, `done`, and `error`. Agent IDs are `researcher`, `writer`, and `courier`. Events contain `agent`, `type`, and `message`; tool events also include `tool`.

```json
{
  "agent": "researcher",
  "type": "tool_start",
  "message": "Generating research notes.",
  "tool": "research"
}
```

Events are printed by the backend and logged in the browser console. The WebSocket reconnects after disconnection, but missed events are not replayed.

## Project structure

```text
agent-studio/
├── frontend/   # User interface and client application
└── backend/    # Server application and API
```

Key files:

| File | Purpose |
| --- | --- |
| `backend/main.py` | FastAPI endpoints and background tasks |
| `backend/orchestrator.py` | Sequential Researcher → Writer → Courier workflow |
| `backend/events.py` | Event printing and WebSocket broadcasting |
| `backend/llm.py` | Shared OpenRouter configuration |
| `backend/agents/` | Three workflow agents |
| `backend/tools/` | Tracked file-saving and email tools |
| `frontend/source/main.js` | Active page and Phaser entry point |
| `frontend/source/style.css` | Surrounding DOM UI styles |
| `frontend/source/scenes/StudioScene.js` | Office and workflow animations |
| `frontend/src/ws.js` | WebSocket connection management |
| `frontend/public/assets/` | Character and office spritesheets |
| `frontend/tests/` | Animation regression tests |

## Checks

From `frontend/`:

```powershell
npm run build
node --test --test-isolation=none tests/studio-animation.test.js
```

Animation tests use mocked Phaser objects to check event sequencing, reset cancellation, seated tool states, handoffs, and resizing without calling the backend.

For a one-event WebSocket smoke test, run this from the repository root before starting a workflow in the browser:

```powershell
backend\.venv\Scripts\python.exe backend/test_ws.py
```

It waits for one JSON event, prints it, and exits. The standalone email and researcher scripts make real external calls; they are not an offline test suite.

## Troubleshooting

- **`Failed to fetch`:** confirm the health endpoint responds and the backend is on port `8000`. Keep the frontend on port `5173`; CORS permits both `http://localhost:5173` and `http://127.0.0.1:5173`. Inspect the browser console for the actual network or HTTP error.
- **Missing `langchain_openai`:** use the backend installation command above with the same virtual environment that starts Uvicorn.
- **Configuration or delivery errors:** check the root `.env`, restart the backend, and inspect backend logs. Gmail delivery requires the sender address and app password.
- **Missing events after reconnect:** start a new workflow with the socket connected; disconnected events are not replayed.

## Demo scope and assets

This local MVP has in-memory clients and tasks, with no authentication, database, workflow IDs, or event replay. All connected clients receive the same event stream. Each report save replaces `backend/outputs/report.md`; generated output is ignored by Git.

Office artwork uses the supplied Post Apoc Office assets by [0-mem0ry](https://0-mem0ry.itch.io/). See the included [asset information and terms](frontend/public/assets/office/Info.txt). Supplied artwork retains its own usage terms.
