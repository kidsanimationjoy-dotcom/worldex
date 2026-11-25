# AURIX OpenAI API setup

AURIX uses the OpenAI Responses API through the WORLDEX server. The browser never receives the API key.

## Configure Netlify

An eligible adult account holder who manages the OpenAI API account and billing should:

1. Open the WORLDEX site in Netlify.
2. Go to **Site configuration → Environment variables**.
3. Add `OPENAI_API_KEY` with the secret API key. Set its scope to **Functions** (or all scopes).
4. Optionally add `OPENAI_MODEL` with a model enabled for the API project. If omitted, WORLDEX currently defaults to `gpt-6.2-astra`.
5. Trigger a new deploy so the function receives the new environment variable.

Never paste the key into the website, a browser console, source code, GitHub, screenshots, or a chat message. Do not commit a real key to the repository. If a key is exposed, revoke it and create a replacement.

## How it works

- The authenticated AURIX chat sends recent messages to `POST /api/aurix/chat`.
- The server checks the signed-in account, CSRF token, workspace ownership, request size and rate limit.
- The server calls `https://api.openai.com/v1/responses` using the server-side `OPENAI_API_KEY`.
- The API key is never returned to the frontend.
- AURIX chat responses are not persisted by this endpoint; the current chat transcript is held in the browser session.
- The route does not execute external platform actions or claim that integrations are operational.

## Verification

After redeploying, sign in to WORLDEX and open **AURIX / Chat**. The status should show **AI CONFIGURED** when the environment variable is present. Send a short test message. A configured key does not guarantee the model is enabled or billing is active; provider errors are shown as a safe generic message.

OpenAI API usage may incur charges. Review the API project's usage and limits with the adult account holder before enabling it for users.
