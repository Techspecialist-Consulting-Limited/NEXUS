import OpenAI, { AzureOpenAI } from "openai";
import {
  adjudicationResult,
  assistantAnswer,
  checkInDraft,
  extractionResult,
  digestResult,
  narrativeResult,
  toneResult,
  type AiProvider,
  type AiResult,
  type AssistantContext,
  type DigestContext,
  type ToneContext,
  type Usage,
} from "./types";
import {
  ADJUDICATION_SYSTEM,
  ASSISTANT_SYSTEM,
  DRAFT_SYSTEM,
  draftUser,
  assistantUser,
  EXTRACTION_SYSTEM,
  NARRATIVE_SYSTEM,
  DIGEST_SYSTEM,
  TONE_SYSTEM,
  digestUser,
  extractionUser,
  fence,
  narrativeUser,
  toneUser,
} from "./prompts";
import type { ZodType } from "zod";

/*
 * The real brain: GPT-5 on Azure OpenAI / Microsoft Foundry.
 *
 * Three decisions worth explaining, because each has a tempting alternative.
 *
 * 1. JSON OBJECT MODE, NOT STRICT JSON SCHEMA.
 *    Strict structured output looks like the safer choice, but it requires
 *    every property to be required with additionalProperties false — which the
 *    schemas in types.ts deliberately are not. They use .optional() and
 *    .default() because a model that omits `description` is behaving
 *    correctly, and forcing it to emit nulls to satisfy a schema teaches it to
 *    invent them. So: JSON mode, then Zod validation, which is the real guard
 *    either way. A response that does not parse is retried once with the
 *    validation error fed back, and then fails loudly.
 *
 * 2. THE MODEL NEVER SEES A FIGURE IT COULD CONTRADICT.
 *    narrate() receives metrics that SQL has already computed and is asked to
 *    write prose around them. It is never asked what the delivery rate was.
 *    Same boundary as everywhere else in this codebase.
 *
 * 3. COST IS CONFIGURED, NOT ASSUMED.
 *    Token counts come back from the API and are recorded. The money figure is
 *    only computed when a rate is supplied, because a hardcoded price silently
 *    becomes wrong and a wrong cost figure is worse than none — you would
 *    budget against it.
 */

const DEFAULT_API_VERSION = "2024-10-21";

/*
 * Two timeouts, because the two paths fail differently.
 *
 * The fast tier is interactive: somebody has pressed submit and is watching a
 * spinner, so it must give up quickly and let them carry on. The quality tier
 * is a weekly job with nobody waiting — a reasoning model working across the
 * whole organisation genuinely takes minutes, and cutting it off at 45 seconds
 * means the Chairman's briefing never generates at all.
 */
const FAST_TIMEOUT_MS = 45_000;
const QUALITY_TIMEOUT_MS = 180_000;

export type AzureConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
  /*
   * A smaller, faster deployment for the high-volume mechanical jobs.
   *
   * Extraction and adjudication run on every check-in and every reconcile, and
   * they are structural work: find the promises, match them to what exists.
   * A reasoning model spends a minute and 1,500 output tokens doing that, and
   * a person who has just pressed submit is watching a spinner for all of it.
   *
   * Narration and tone are different — they are judgement, they run once a
   * week per person, and the quality is visible. Those stay on the frontier
   * model. This is the model split the plan called for, applied where the
   * measurements actually pointed.
   */
  fastDeployment?: string;
  apiVersion: string;
  embeddingDeployment?: string;
  /** USD per 1,000 tokens. Unset means cost is not computed. */
  inputCostPer1k?: number;
  outputCostPer1k?: number;
};

/**
 * Azure exposes two different API surfaces, and they need different clients.
 *
 *   classic  https://<resource>.openai.azure.com
 *            Paths are /openai/deployments/<deployment>/... and every call
 *            carries ?api-version=. Use AzureOpenAI, which builds that.
 *
 *   v1       https://<resource>.openai.azure.com/openai/v1
 *            OpenAI-compatible. The deployment name goes in `model`, and
 *            api-version is not used at all. Use the standard client with a
 *            baseURL.
 *
 * Passing a v1 URL to AzureOpenAI produces requests to
 * .../openai/v1/openai/deployments/... which 404 — an error that looks like a
 * missing deployment rather than a wrong client. Detecting the shape here
 * means the endpoint can simply be pasted from the portal either way.
 */
export function isV1Endpoint(endpoint: string): boolean {
  return /\/openai\/v1(\/|$)/.test(endpoint.trim());
}

/**
 * Trim an endpoint back to the base the client needs.
 *
 * The portal shows you a full operation URL — ".../openai/v1/responses" or
 * ".../openai/v1/chat/completions" — and that is what gets copied. Passing it
 * straight through produces requests to ".../responses/chat/completions",
 * which 404s in a way that reads like a missing deployment.
 *
 * Both the openai.azure.com and services.ai.azure.com hosts are accepted;
 * Foundry hands out the latter.
 */
export function normaliseEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  const v1 = trimmed.match(/^(.*\/openai\/v1)(\/.*)?$/);
  if (v1) return v1[1];
  return trimmed;
}

export function azureConfigFromEnv(): AzureConfig | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) return null;

  const num = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  return {
    endpoint: normaliseEndpoint(endpoint),
    apiKey,
    deployment,
    fastDeployment: process.env.AZURE_OPENAI_FAST_DEPLOYMENT,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? DEFAULT_API_VERSION,
    embeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    inputCostPer1k: num(process.env.AZURE_OPENAI_COST_PER_1K_INPUT),
    outputCostPer1k: num(process.env.AZURE_OPENAI_COST_PER_1K_OUTPUT),
  };
}

type ChatUsage = { prompt_tokens?: number; completion_tokens?: number };

/*
 * The slice of the OpenAI client this provider actually uses.
 *
 * Narrow on purpose: it lets the retry-and-validate logic — the part most
 * likely to break, and the part that costs money when it misbehaves — be
 * tested without credentials, a network, or a deployment.
 */
export type ChatClient = {
  chat: {
    completions: {
      create(
        args: unknown,
        options?: { timeout?: number },
      ): Promise<{
        choices: { message?: { content?: string | null } }[];
        usage?: ChatUsage | null;
      }>;
    };
  };
  embeddings: {
    create(args: unknown): Promise<{
      data: { embedding: number[] }[];
      usage?: { prompt_tokens?: number } | null;
    }>;
  };
};

function buildClient(config: AzureConfig) {
  if (isV1Endpoint(config.endpoint)) {
    return new OpenAI({
      baseURL: normaliseEndpoint(config.endpoint),
      apiKey: config.apiKey,
      /*
       * Azure accepts either an api-key header or a bearer token on the v1
       * surface, and which one it wants depends on how the resource is
       * configured. Sending both costs nothing and removes a class of
       * "401 with a valid key" that is genuinely hard to diagnose.
       */
      defaultHeaders: { "api-key": config.apiKey },
      timeout: QUALITY_TIMEOUT_MS,
      maxRetries: 2,
    });
  }

  return new AzureOpenAI({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    apiVersion: config.apiVersion,
    deployment: config.deployment,
    timeout: QUALITY_TIMEOUT_MS,
    maxRetries: 2, // transport-level only; schema retries are handled below
  });
}

/** Said once, the first time a hashed vector is actually handed out. */
let warnedAboutEmbeddings = false;

export class AzureProvider implements AiProvider {
  readonly name = "azure";
  readonly model: string;

  private client: ChatClient;
  private config: AzureConfig;

  /*
   * Whether this deployment accepts a temperature at all.
   *
   * Extraction and adjudication want temperature 0, because the same check-in
   * should produce the same commitments twice — otherwise a re-parse can
   * silently change what somebody is recorded as having promised. The
   * reasoning models refuse it: GPT-5 answers
   *
   *   400 Unsupported value: 'temperature' does not support 0 with this model
   *
   * Rather than hardcode a list of model names that will be wrong within a
   * quarter, the first call finds out and the answer is remembered. One wasted
   * request per process, and it keeps working when the next model lands.
   *
   * The cost is real and worth stating: on a model that refuses temperature,
   * extraction is no longer reproducible.
   */
  private acceptsTemperature = true;

  constructor(config: AzureConfig, client?: ChatClient) {
    this.config = config;
    this.model = config.deployment;
    this.client = client ?? (buildClient(config) as unknown as ChatClient);
  }

  private usage(raw: ChatUsage | undefined, startedAt: number): Usage {
    const promptTokens = raw?.prompt_tokens;
    const completionTokens = raw?.completion_tokens;

    let costUsd: number | undefined;
    if (this.config.inputCostPer1k && this.config.outputCostPer1k) {
      costUsd =
        ((promptTokens ?? 0) / 1000) * this.config.inputCostPer1k +
        ((completionTokens ?? 0) / 1000) * this.config.outputCostPer1k;
    }

    return {
      provider: this.name,
      model: this.model,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs: Date.now() - startedAt,
    };
  }

  /**
   * One completion, parsed and validated.
   *
   * Retried exactly once on a schema failure, with the specific complaint fed
   * back. Once, not until it works: a model that cannot satisfy the schema on
   * the second attempt is not going to on the fifth, and a retry loop against
   * a paid API is a way to spend real money on a bug.
   */
  private async structured<T>(
    system: string,
    user: string,
    schema: ZodType<T>,
    label: string,
    tier: "fast" | "quality" = "quality",
    /*
     * A ceiling on how much the model may write.
     *
     * Latency here is dominated by output tokens, not by thinking — an
     * uncapped answer took eleven seconds because the model chose to write
     * two hundred words, not because the question was hard. For a job
     * somebody is waiting on out loud, that is the difference between a
     * conversation and a form submission. Left undefined for jobs where
     * nobody is waiting.
     */
    maxTokens?: number,
  ): Promise<AiResult<T>> {
    const deployment =
      tier === "fast" && this.config.fastDeployment
        ? this.config.fastDeployment
        : this.config.deployment;
    const startedAt = Date.now();
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    let lastUsage: ChatUsage | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      let response;
      try {
        response = await this.client.chat.completions.create(
          {
            model: deployment,
            messages,
            response_format: { type: "json_object" },
            ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
            ...(this.acceptsTemperature ? { temperature: 0 } : {}),
          },
          { timeout: tier === "fast" ? FAST_TIMEOUT_MS : QUALITY_TIMEOUT_MS },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (this.acceptsTemperature && /temperature/i.test(message)) {
          this.acceptsTemperature = false;
          response = await this.client.chat.completions.create(
            {
              model: deployment,
              messages,
              response_format: { type: "json_object" },
              ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
            },
            { timeout: tier === "fast" ? FAST_TIMEOUT_MS : QUALITY_TIMEOUT_MS },
          );
        } else {
          throw err;
        }
      }

      lastUsage = response.usage ?? undefined;
      const content = response.choices[0]?.message?.content ?? "";

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        if (attempt === 0) {
          messages.push(
            { role: "assistant", content },
            {
              role: "user",
              content: "That was not valid JSON. Reply with the JSON object only.",
            },
          );
          continue;
        }
        throw new Error(`${label}: model did not return JSON`);
      }

      const result = schema.safeParse(parsed);
      if (result.success) {
        return {
          data: result.data,
          usage: { ...this.usage(lastUsage, startedAt), model: deployment },
        };
      }

      if (attempt === 0) {
        messages.push(
          { role: "assistant", content },
          {
            role: "user",
            content:
              `That did not match the required shape: ${result.error.issues
                .slice(0, 5)
                .map((i) => `${i.path.join(".") || "(root)"} — ${i.message}`)
                .join("; ")}. Reply with corrected JSON only.`,
          },
        );
        continue;
      }

      /*
       * Name the field. "expected string, received undefined" with no path is
       * a message that costs someone twenty minutes with a debugger to turn
       * into "the model returned coaching as strings instead of objects" —
       * which is the only fact that actually helps.
       */
      const detail = result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new Error(`${label}: response failed validation — ${detail}`);
    }

    throw new Error(`${label}: exhausted attempts`);
  }

  async answer(input: AssistantContext) {
    /*
     * Fast tier. Somebody asked out loud and is standing there waiting, so a
     * slower, better answer is the wrong trade — and the answer is grounded in
     * facts that arrive already correct, which is most of what quality means
     * here. The model is arranging and explaining, not deducing.
     */
    return this.structured(
      ASSISTANT_SYSTEM,
      assistantUser(input),
      assistantAnswer,
      "answer",
      "fast",
      700,
    );
  }

  async draft(input: {
    text: string;
    personName: string;
    cycleLabel: string;
    openCommitments: { id: string; title: string }[];
  }) {
    /*
     * Fast tier and capped. Somebody is watching their own words be sorted, so
     * a slower better answer is the wrong trade — and the job is arranging what
     * they said, not deducing anything.
     */
    return this.structured(
      DRAFT_SYSTEM,
      draftUser(input),
      checkInDraft,
      "draft",
      "fast",
      800,
    );
  }

  async extract(input: {
    text: string;
    openCommitments: { id: string; title: string }[];
    personName: string;
    cycleLabel: string;
  }) {
    return this.structured(
      EXTRACTION_SYSTEM,
      extractionUser({ ...input, text: fence(input.text) }),
      extractionResult,
      "extract",
      "fast",
    );
  }

  async adjudicate(input: {
    report: string;
    candidates: { commitment_id: string; title: string }[];
  }) {
    const user = [
      "Report:",
      fence(input.report),
      "",
      "Candidate commitments:",
      ...input.candidates.map((c) => `- [${c.commitment_id}] ${c.title}`),
      "",
      'Reply with {"rulings": [...]}.',
    ].join("\n");

    return this.structured(
      ADJUDICATION_SYSTEM,
      user,
      adjudicationResult,
      "adjudicate",
      "fast",
    );
  }

  async narrate(input: {
    personName: string;
    cycleLabel: string;
    metrics: Record<string, unknown>;
    unmentioned: string[];
    calibration?: Record<string, unknown>;
  }) {
    return this.structured(
      NARRATIVE_SYSTEM,
      narrativeUser(input),
      narrativeResult,
      "narrate",
    );
  }

  async tone(input: ToneContext) {
    return this.structured(TONE_SYSTEM, toneUser(input), toneResult, "tone");
  }

  async digest(input: DigestContext) {
    // Quality tier: this is the one output the Chairman actually reads.
    return this.structured(DIGEST_SYSTEM, digestUser(input), digestResult, "digest");
  }

  async embed(texts: string[]): Promise<AiResult<number[][]>> {
    const startedAt = Date.now();

    /*
     * Embeddings need their own deployment, and a text model cannot stand in.
     * Rather than fail the whole reconciler when one is not configured, fall
     * back to the deterministic hashed vectors the mock uses: the cheap
     * matcher degrades to lexical similarity, which is worse but still works,
     * and the LLM adjudicator still settles anything ambiguous.
     */
    if (!this.config.embeddingDeployment) {
      const { MockProvider } = await import("./mock");
      if (!warnedAboutEmbeddings) {
        warnedAboutEmbeddings = true;
        console.warn(
          "[nexus:ai] AZURE_OPENAI_EMBEDDING_DEPLOYMENT is not set, so this " +
            "embedding is a deterministic hash rather than a semantic vector. " +
            "Similarity matching will be lexical at best. Deploy an embedding " +
            "model in Azure and set the variable to fix it.",
        );
      }
      const fallback = await new MockProvider().embed(texts);
      return {
        data: fallback.data,
        usage: { ...this.usage(undefined, startedAt), model: "hashed-fallback" },
      };
    }

    const response = await this.client.embeddings.create({
      model: this.config.embeddingDeployment,
      input: texts,
    });

    return {
      data: response.data.map((d) => d.embedding),
      usage: this.usage(
        { prompt_tokens: response.usage?.prompt_tokens, completion_tokens: 0 },
        startedAt,
      ),
    };
  }
}
