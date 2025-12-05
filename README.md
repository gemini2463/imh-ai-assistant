IMH AI Assistant / LLM Chatter

AI‑powered assistant for Control Web Panel (CWP) (and similar environments) that can:

Chat about web‑server/admin tasks using OpenAI models.

Execute shell commands on the host (with a short timeout) via a controlled bridge.

Keep per‑user chat history in Redis and provide shareable links.

This repo contains both the frontend widget (llm-chatter-client) and the backend services (llm-chatter-server + CWP/PHP glue).

Features

Floating AI assistant inside the CWP admin interface.

Username/passphrase login (per‑admin credentials defined in .env).

OpenAI Responses API integration (gpt‑5.1 and related models).

Optional “reasoning” and “verbosity” controls.

Tool‑using agent that can:

Emit shell commands,

Run them via a PHP bridge with a timeout,

Consume the results and continue the task.

Streaming responses (SSE) to the frontend.

Redis‑backed chat history with shareable links.

High‑Level Architecture

Components

Frontend – llm-chatter-client

Built with React + Vite.

Main entry: src/main.jsx.

Floating widget:

FloatingAssistant.jsx – launcher + login panel.

ChatFloat.jsx – chat UI, streaming, tool integration.

ContentText.jsx – message rendering (Markdown support, collapsible).

Node Server – llm-chatter-server

Express app on port 8080 (index.js).

Uses:

redis for chat history and share tokens.

jsonwebtoken for auth tokens.

openai for Responses/Chat Completions.

express-rate-limit, helmet, cors for basic security.

Shell Bridge – PHP (ajax_imh-ai-assistant.php)

Runs on the CWP host, invoked via AJAX from the frontend.

Executes shell commands with safe_shell_exec() and returns:

stdout

stderr

exitCode

timedOut

Used only when the LLM emits shell commands.

CWP Integration / Installer

index.php – wraps the CWP admin HTML, injects:

Assistant CSS (imh-ai-assistant.css).

Assistant JS bundle (imh-ai-assistant.js).

<div id="ai-assistant-block"></div> for React to mount into.

install.sh – installs/uninstalls the plugin into a CWP environment:

Copies PHP, JS, CSS, PNG files into CWP paths.

Renames original CWP index.php → index2.php and replaces it.

Data & Control Flow

1. Login / Check‑In

Admin opens CWP; index.php injects the assistant assets.

React mounts FloatingAssistant into #ai-assistant-block.

Admin enters:

serverUsername

serverPassphrase

Frontend:

Generates or reads a sessionHash from cookies.

POST /checkin → Node server (llm-chatter-server).

POST /checkin (Node):

Validates:

serverUsername (sanitized),

serverPassphrase (non‑empty),

sessionHash.

Looks up LLM_CHATTER_PASSPHRASE in .env and verifies the bcrypt hash.

On success:

Generates a JWT for that sessionHash.

Stores an entry in activeSessions.

Reads user chat history from Redis.

Returns { token, userChatHistory }.

Frontend stores the token in cookies (fa_clientJWT) and sets checkedIn=true.

2. Chat & Streaming

When the admin sends a message:

ChatFloat builds:

A messages array (system + past turns).

prompt (last user text).

If there are pending shell commands (from the previous assistant turn), it first:

POSTs them to the PHP endpoint (Config.shellScriptPath).

Collects an array of cmdResults.

It then POSTs to Node:

POST /openai (Node, via makeAIRequest) with fields like:

model

messages

system

prompt

reasoning, verbosity

responseTools (e.g. ["shell"])

cmdResults (from PHP)

uniqueChatID, serverUsername, etc.

stream: true/false

Node:

Validates input, verifies the JWT via validateInput.

Normalizes messages for:

OpenAI Responses API (input_text, output_text, input_image), or

Chat Completions (classic messages).

If cmdResults is present, injects a shell_call_output JSON payload as user input.

Calls the appropriate OpenAI endpoint:

client.responses.create() for responsesModels.

client.chat.completions.create() otherwise.

(Optional) image generation if configured.

Streaming path:

Node writes SSE chunks: data: <json chunk>\n\n till done.

Frontend:

Parses SSE, accumulates text deltas to display streaming output.

Detects tool events (especially response.command.\*) and captures shell command text.

Once streaming ends, any collected commands are queued for execution via PHP (see next section).

Node logs each turn (user and assistant) into Redis with timestamps.

3. Shell Command Loop

When the model uses tools:

For Responses models, shell commands appear as response.command.added / response.command.delta / response.command.done events.

Frontend accumulates the full command text in shellCmd[].

Loop:

Assistant turn ends; ChatFloat sees shellCmd.length > 0.

It sends each command to the PHP AJAX endpoint:

ajax_imh-ai-assistant.php runs the command via safe_shell_exec.

Returns JSON including stdout, stderr, exitCode, timedOut.

Frontend passes these results back to /openai as cmdResults with an empty prompt.

Model sees them (via the injected shell_call_output payload) and continues the conversation or emits more commands.

Loop continues until there are no new commands.

Configuration

Frontend (llm-chatter-client/src/Config.jsx)

Key fields under floatingConfig:

serverURL – Node backend base URL (default http://localhost:8080).

chatType, model – e.g. "gpt-5.1".

systemMessage – high‑level instructions for the assistant.

systemProfile – JSON with OS, stack, and environment details embedded into the system prompt.

reasoningPick, verbosityPick – default levels.

streamingEnabled – whether to use SSE streaming.

pickedTools – e.g. ["shell"].

quickPrompts – pre‑filled buttons for common tasks.

shellScriptPath – relative URL to the PHP AJAX handler (e.g. loader_ajax.php?ajax=imh-ai-assistant).

Backend (llm-chatter-server/config.js)

clientDomains – array of allowed origins for CORS.

serverBehindCloudflare – toggles app.set("trust proxy", ...).

ollamaEnabled – future expansion (not central here).

reasoningModels – models treated specially (forced reasoning settings).

responsesModels – models using the OpenAI Responses API.

responseTools – available tools per model (currently shell only).

timeFormat – log timestamp format.

Environment (llm-chatter-server/.env)

LLM_CHATTER_PASSPHRASE – JSON of usernames and bcrypt hashes:
{"users":[{"name":"user1","value":"$2y$10$..."}, ...]}

SECRET_RANDOM – JWT signing secret.

OPENAI_API_KEY – OpenAI API key (required for Responses/Completions).

REDIS_URL (optional) – Redis connection string (defaults to redis://localhost:6379).

Other API keys are currently unused or for future providers.

Installation & Running

1. Backend (Node server)

From llm-chatter-server/:

npm install
cp .env.example .env # or create .env with LLM_CHATTER_PASSPHRASE, SECRET_RANDOM, OPENAI_API_KEY
npm run dev # or node index.js (port 8080)

Ensure Redis is running and reachable (default redis://localhost:6379).

2. Frontend (Dev mode)

From llm-chatter-client/:

npm install
npm run dev # Vite dev server (default http://localhost:5173)

Adjust Config.floatingConfig.serverURL and llm-chatter-server/config.js.clientDomains to match.

3. CWP Deployment

On the CWP host (as root):

wget https://raw.githubusercontent.com/gemini2463/imh-ai-assistant/master/install.sh -O /root/install_imh_ai_assistant.sh
bash /root/install_imh_ai_assistant.sh

The installer:

Detects CWP.

Downloads:

index.php

imh-ai-assistant.php

imh-ai-assistant.css

imh-ai-assistant.js

ajax_imh-ai-assistant.php

Installs them into the appropriate CWP paths.

Backs up and renames the original admin index.php to index2.php.

To uninstall:

bash /root/install_imh_ai_assistant.sh --uninstall

Security Considerations

Shell execution:

ajax_imh-ai-assistant.php executes commands with safe_shell_exec, using timeout when available.

There is currently no hard command allowlist/denylist; safety relies on:

The system prompt constraints.

Short timeouts.

If the AJAX endpoint is exposed beyond authenticated admins, add additional checks (e.g., CWP session validation, CSRF protection, IP allowlists).

Auth & Tokens:

Username + passphrase are checked against bcrypt hashes from .env.

JWTs are generated per sessionHash and stored in an in‑memory activeSessions map.

Server restarts invalidate all active sessions.

History / Data retention:

Chat history is stored in Redis per user with a 30‑day TTL.

Share tokens (/mkshr / /chkshr) are stored with a long expiry (365 days by default).

Development Notes

Client uses React 18 + Vite, Tailwind (via tailwind.config.cjs).

Streaming is implemented manually using fetch + SSE parsing on the frontend and responses.create({ stream: true }) on the backend.

Reasoning/verbosity levels are mapped to OpenAI Responses API fields:

reasoning.effort

text.verbosity

Shell tool integration is built on top of Responses “command” events and a custom shell_call_output payload.
