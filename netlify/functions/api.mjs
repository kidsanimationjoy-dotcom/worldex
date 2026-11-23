import serverless from "serverless-http";
import { createNetlifyRuntime } from "../../server/netlify-runtime.mjs";

let apiHandler;

export async function handler(event, context) {
  try {
    if (!apiHandler) {
      const runtime = createNetlifyRuntime();
      apiHandler = serverless(runtime.app);
    }

    if (context && "callbackWaitsForEmptyEventLoop" in context) {
      context.callbackWaitsForEmptyEventLoop = false;
    }
    return await apiHandler(event, context);
  } catch (error) {
    console.error("WORLDEX Netlify API could not start", {
      code: error?.code || "backend_unavailable",
    });
    return {
      statusCode: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: {
          code: error?.code || "backend_unavailable",
          message: "WORLDEX backend is not configured or temporarily unavailable.",
        },
      }),
    };
  }
}
