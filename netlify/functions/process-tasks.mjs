import { createNetlifyRuntime } from "../../server/netlify-runtime.mjs";
import { processTaskBatch } from "../../server/worker.mjs";

export default async function processWorldexTasks() {
  let runtime;
  try {
    runtime = createNetlifyRuntime();
  } catch (error) {
    console.warn("WORLDEX task worker skipped because the backend is not configured", {
      code: error?.code || "backend_unavailable",
    });
    return new Response(null, { status: 204 });
  }

  try {
    const result = await processTaskBatch({
      repo: runtime.repo,
      provider: runtime.provider,
      maxTasks: 10,
      maxDurationMs: 22_000,
    });
    if (result.processed > 0) {
      console.info("WORLDEX scheduled task batch completed", result);
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("WORLDEX scheduled task batch failed", {
      code: error?.code || "worker_error",
    });
    return Response.json({ ok: false }, { status: 500 });
  } finally {
    await runtime.pool.end().catch(() => undefined);
  }
}

export const config = {
  schedule: "* * * * *",
};
