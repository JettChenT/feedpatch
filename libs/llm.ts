import { gateway, createGateway } from "@ai-sdk/gateway";
export const CHEAP_MODEL = "google/gemini-2.0-flash";
export const EFFICIENCY_MODEL = "google/gemini-2.5-flash";
export const AGENTIC_MODEL = "openai/gpt-4.1";
export const PIPE_AGENT_MODEL = "anthropic/claude-4-sonnet";
export const AUTO_MODEL = "AUTO";

export const getModel = (model: string) => {
  console.log(`Getting model ${model}`);
  let gateway = createGateway({
    apiKey: import.meta.env.WXT_AI_GATEWAY_API_KEY,
    baseURL: import.meta.env.WXT_AI_GATEWAY_BASE_URL,
  });
  console.log(import.meta.env);
  return gateway(model);
};
