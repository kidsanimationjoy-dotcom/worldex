# AURIX Groq API setup

AURIX uses Groq's OpenAI-compatible Responses API through the WORLDEX server. The browser never receives the API key.

## Configure Netlify

An account holder who manages the Groq API account should:

1. Open the WORLDEX site in Netlify.
2. Go to **Site configuration → Environment variables** (or the site's **Keys and secrets** page).
3. Add `GROQ_API_KEY` and paste the Groq API key into its secret value.
4. Optionally add `GROQ_MODEL` to choose a model enabled for the Groq project. If omitted, WORLDEX uses `openai/gpt-oss-20b`.
5. Save the variable and trigger a new deploy so the function receives it.

If Netlify's plan does not let you choose variable scopes, leave its available/default scope settings unchanged. Keep the key marked as a secret. Do not enter it in the browser or source code.

Never paste the key into the website, a browser console, source code, GitHub, screenshots, or a chat message. Do not commit a real key to the repository. If a key is exposed, revoke it and create a replacement.

## How it works

- The signed-in AURIX chat sends recent messages to `POST /api/aurix/chat`.
- The server checks the signed-in account, CSRF token, workspace ownership, request size and rate limit.
- The server calls `https://api.groq.com/openai/v1/responses` using the server-side `GROQ_API_KEY`.
- The browser never receives the API key.
- AURIX is a general-purpose assistant for questions about business, learning, research, writing, coding, technology, and everyday topics.
- AURIX does not have live browsing or external action tools in this integration. It must not claim to have searched the web, connected an account, or performed an external action.
- The current chat transcript is kept in the browser session; this endpoint does not save it in the WORLDEX database.

## Verification

After redeploying, sign in to WORLDEX and open **AURIX / Chat**. The status should show **AI CONFIGURED** when the environment variable is present. Send a short test message, then try a business or coding question.

A configured key does not guarantee model access, remaining quota, or billing availability. Check Groq's current model list, rate limits and account usage. Availability and pricing can vary by model and account; do not assume every model is free.

## References

- [Groq OpenAI compatibility](https://console.groq.com/docs/openai)
- [Groq Responses API](https://console.groq.com/docs/responses-api)
- [Groq supported models](https://console.groq.com/docs/models)
