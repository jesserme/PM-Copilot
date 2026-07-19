import { createHash } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { z } from "zod";

import { CHECK_IDS } from "@/lib/checks";
import { MODEL_ID, OUTPUT_SCHEMA, TEMPERATURE, buildPrompt } from "@/lib/prompt";
import {
  GenerationPayloadSchema,
  GenerationResultSchema,
  IntakeFormSchema,
  type GenerationPayload,
  type GenerationResult,
} from "@/lib/schema";

// Spec §3 request body: the IntakeForm JSON plus the array of fired check ids.
const GenerateRequestSchema = z.object({
  form: IntakeFormSchema,
  fired_check_ids: z.array(z.enum(CHECK_IDS)),
});

// ---------------------------------------------------------------------------
// Rate limiting — 5 generations/hour/IP (spec §3, BUILD_PROMPT rule 3).
//
// Primary: @upstash/ratelimit sliding window over Upstash Redis, shared by
// every serverless instance, when UPSTASH_REDIS_REST_URL/TOKEN are set.
//
// ⚠️ Fallback (no Upstash env vars): an in-memory Map — a WEAK limiter on
// serverless: every instance gets its own Map, so the effective limit is
// 5/hour/IP *per instance*, and instance recycling resets it entirely. Fine
// for local dev and honest-user friction; not abuse-resistant in production.
// ---------------------------------------------------------------------------
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const upstash =
  upstashUrl && upstashToken
    ? new Ratelimit({
        redis: new Redis({ url: upstashUrl, token: upstashToken }),
        limiter: Ratelimit.slidingWindow(RATE_LIMIT, "1 h"),
        prefix: "pm-copilot:generate",
      })
    : null;

const hitsByIp = new Map<string, number[]>();

async function rateLimit(
  ip: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (upstash) {
    try {
      const { success, reset } = await upstash.limit(ip);
      return {
        allowed: success,
        retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      };
    } catch (error) {
      // Fail open into the per-instance fallback: a Redis outage or a
      // misconfigured token must degrade limiting, never break generation.
      console.error(
        "Upstash rate limit failed; using in-memory fallback:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  const now = Date.now();
  const recent = (hitsByIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hitsByIp.set(ip, recent);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((recent[0] + WINDOW_MS - now) / 1000),
    };
  }
  recent.push(now);
  hitsByIp.set(ip, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// ---------------------------------------------------------------------------
// Model call — raw fetch, no SDK (no new dependencies without asking).
// ---------------------------------------------------------------------------
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 4096;

interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

type ModelCall = { ok: true; text: string } | { ok: false };

async function callModel(
  apiKey: string,
  system: string,
  messages: ModelMessage[],
): Promise<ModelCall> {
  let response: Response;
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system,
        messages,
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      }),
    });
  } catch {
    return { ok: false };
  }
  if (!response.ok) return { ok: false };

  const data = (await response.json()) as {
    stop_reason?: string;
    content?: Array<{ type: string; text?: string }>;
  };
  // Anything other than a clean finish (refusal, max_tokens, …) is a failure:
  // never render unvalidated or truncated model output.
  if (data.stop_reason !== "end_turn") return { ok: false };
  const text = data.content?.find((block) => block.type === "text")?.text;
  return text ? { ok: true, text } : { ok: false };
}

type PayloadResult = { ok: true; payload: GenerationPayload } | { ok: false; error: string };

function parsePayload(text: string): PayloadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Response was not valid JSON." };
  }
  const result = GenerationPayloadSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: issues };
  }
  return { ok: true, payload: result.data };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsedBody = GenerateRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        issues: parsedBody.error.issues.map(
          (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
        ),
      },
      { status: 400 },
    );
  }

  const limit = await rateLimit(clientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — 5 generations per hour. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // The API key stays server-side (BUILD_PROMPT rule 1): read only here,
  // never sent to or bundled into client code.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "The server is missing its ANTHROPIC_API_KEY configuration." },
      { status: 500 },
    );
  }

  const { form, fired_check_ids } = parsedBody.data;
  const prompt = buildPrompt(form, fired_check_ids);
  const firstMessages: ModelMessage[] = [{ role: "user", content: prompt.user }];

  const firstCall = await callModel(apiKey, prompt.system, firstMessages);
  if (!firstCall.ok) {
    return NextResponse.json({ error: "Generation failed — try again." }, { status: 502 });
  }

  let parsed = parsePayload(firstCall.text);

  // Parse-failure handling (spec §3): retry exactly once with the validation
  // error appended; on second failure return the friendly error state.
  if (!parsed.ok) {
    const retryCall = await callModel(apiKey, prompt.system, [
      ...firstMessages,
      { role: "assistant", content: firstCall.text },
      {
        role: "user",
        content:
          `Your previous response failed schema validation: ${parsed.error}\n` +
          "Return the corrected GenerationResult JSON object and nothing else.",
      },
    ]);
    parsed = retryCall.ok
      ? parsePayload(retryCall.text)
      : { ok: false, error: "Retry call failed." };
  }

  if (!parsed.ok) {
    return NextResponse.json(
      { error: "The model returned something malformed — try again" },
      { status: 502 },
    );
  }

  const result: GenerationResult = {
    prd: parsed.payload.prd,
    critique: parsed.payload.critique,
    meta: {
      generated_at: new Date().toISOString(),
      model: MODEL_ID,
      input_hash: createHash("sha256").update(JSON.stringify(form)).digest("hex"),
      // Drift guard (erratum 5): record which rule checks fired at generation
      // time, so stored results are auditable against the rule layer later.
      fired_check_ids,
    },
  };

  // Final guarantee before anything reaches a client: the full object —
  // including server-assembled meta — validates against the spec §4 schema.
  const validated = GenerationResultSchema.safeParse(result);
  if (!validated.success) {
    return NextResponse.json(
      { error: "The model returned something malformed — try again" },
      { status: 502 },
    );
  }

  return NextResponse.json(validated.data);
}
