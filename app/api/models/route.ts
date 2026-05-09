import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { ModelCapabilities, ProviderGroup } from "../../components/modelStore";

type ModelsRequest = {
  providerGroup?: ProviderGroup;
};

function cleanBaseURL(baseURL: string) {
  return baseURL.trim().replace(/\/$/, "");
}

function isProviderGroup(value: unknown): value is ProviderGroup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    (candidate.provider === "anthropic" || candidate.provider === "openai-compatible") &&
    typeof candidate.apiKey === "string" &&
    typeof candidate.baseURL === "string"
  );
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  try {
    return { data: JSON.parse(text), text };
  } catch {
    return { data: null, text };
  }
}

function errorMessage(data: unknown, text: string) {
  if (data && typeof data === "object") {
    const candidate = data as { error?: { message?: string } | string; message?: string };
    if (typeof candidate.error === "object" && typeof candidate.error.message === "string") return candidate.error.message;
    if (typeof candidate.error === "string") return candidate.error;
    if (typeof candidate.message === "string") return candidate.message;
  }

  const trimmed = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 200) : "获取模型失败";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ModelsRequest;
    if (!isProviderGroup(body.providerGroup)) {
      return NextResponse.json({ error: "模型提供方配置不完整" }, { status: 400 });
    }

    const providerGroup = body.providerGroup;

    if (providerGroup.provider === "anthropic") {
      const client = new Anthropic({ apiKey: providerGroup.apiKey, baseURL: cleanBaseURL(providerGroup.baseURL) });
      const models: Array<{ name: string; model: string; capabilities: ModelCapabilities }> = [];
      for await (const model of client.models.list()) {
        const caps = model.capabilities as unknown as Record<string, unknown> | undefined;
        const tags: string[] = ["对话"];
        if ((caps?.image_input as { supported?: boolean } | undefined)?.supported) tags.push("视觉");
        if (
          (caps?.thinking as { supported?: boolean } | undefined)?.supported ||
          (caps?.thinking as { types?: { adaptive?: { supported?: boolean } } } | undefined)?.types?.adaptive?.supported
        ) tags.push("思考");
        models.push({
          name: model.display_name || model.id,
          model: model.id,
          capabilities: {
            contextWindow: model.max_input_tokens ?? undefined,
            maxOutput: model.max_tokens ?? undefined,
            tags
          }
        });
      }
      return NextResponse.json({ models });
    }

    const response = await fetch(`${cleanBaseURL(providerGroup.baseURL)}/models`, {
      headers: { Authorization: `Bearer ${providerGroup.apiKey}` }
    });
    const { data, text } = await readResponseBody(response);

    if (!response.ok) {
      return NextResponse.json({ error: errorMessage(data, text) }, { status: response.status });
    }

    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "上游接口没有返回 JSON，请检查 API 主机链接。" }, { status: 502 });
    }

    const modelData = data as { data?: Array<{ id?: string; name?: string }> };
    const models = (modelData.data ?? [])
      .filter((model) => typeof model.id === "string")
      .map((model) => ({ name: model.name || model.id!, model: model.id! }));

    return NextResponse.json({ models });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "获取模型失败" }, { status: 500 });
  }
}
