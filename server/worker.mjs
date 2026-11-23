import { randomUUID } from "node:crypto";

export function startTaskWorker({ repo, provider, intervalMs = 1500, workerId = `aurix-${randomUUID()}`, logger = console }) {
  let stopped = false;
  let busy = false;
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const task = await repo.claimTask(workerId, 90);
      if (task) {
        task.workerId = workerId;
        if (!provider?.llmConfigured) {
          const error = new Error("Server-side LLM provider is not configured");
          error.code = "llm_not_configured";
          await repo.failTask(task, error);
        } else {
          try {
            const result = await provider.completeChat({ inputText: task.inputText });
            if (typeof result !== "string" || !result.trim()) throw Object.assign(new Error("Provider returned no usable response"), { code: "empty_response", retryable: true });
            await repo.completeTask(task, result);
          } catch (error) {
            await repo.failTask(task, error);
          }
        }
      }
    } catch (error) {
      logger.error?.("AURIX worker iteration failed", { code: error?.code ?? "worker_error" });
    } finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref?.();
  void tick();
  return async () => { stopped = true; clearInterval(timer); while (busy) await new Promise((resolve) => setTimeout(resolve, 20)); };
}
