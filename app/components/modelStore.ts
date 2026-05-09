export type Provider = "openai-compatible" | "anthropic";

export type ModelCapabilities = {
  contextWindow?: number;
  maxOutput?: number;
  tags?: string[];
};

export type ProviderModel = {
  id: string;
  name: string;
  model: string;
  capabilities?: ModelCapabilities;
};

export type ProviderGroup = {
  id: string;
  name: string;
  provider: Provider;
  apiKey: string;
  baseURL: string;
  models: ProviderModel[];
  builtIn?: boolean;
};

export type ModelConfig = {
  id: string;
  name: string;
  providerName: string;
  provider: Provider;
  apiKey: string;
  baseURL: string;
  model: string;
  tags?: string[];
};

export type AppSettings = {
  streamEnabled: boolean;
  artifactsEnabled: boolean;
  autoScroll: boolean;
  chatLayout: "bubble" | "classic";
  showAvatar: boolean;
  showTimestamp: boolean;
  showModelName: boolean;
  showWordCount: boolean;
  spellCheck: boolean;
  autoTitle: boolean;
};

const defaultSettings: AppSettings = {
  streamEnabled: true,
  artifactsEnabled: true,
  autoScroll: true,
  chatLayout: "bubble",
  showAvatar: true,
  showTimestamp: true,
  showModelName: true,
  showWordCount: false,
  spellCheck: true,
  autoTitle: true
};

export type ProviderPreset = {
  name: string;
  provider: Provider;
  baseURL: string;
  models: Array<{ name: string; model: string }>;
};

const storageKey = "local-provider-groups";
const legacyStorageKey = "local-model-configs";
const settingsKey = "local-app-settings";

export const providerPresets: ProviderPreset[] = [
  {
    name: "DeepSeek",
    provider: "openai-compatible",
    baseURL: "https://api.deepseek.com/v1",
    models: [
      { name: "DeepSeek Chat", model: "deepseek-chat" },
      { name: "DeepSeek Reasoner", model: "deepseek-reasoner" }
    ]
  },
  {
    name: "Claude",
    provider: "anthropic",
    baseURL: "https://api.anthropic.com",
    models: [
      { name: "Claude Opus 4.7", model: "claude-opus-4-7" },
      { name: "Claude Sonnet 4.6", model: "claude-sonnet-4-6" }
    ]
  },
  {
    name: "Gemini",
    provider: "openai-compatible",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: [
      { name: "Gemini 2.5 Pro", model: "gemini-2.5-pro" },
      { name: "Gemini 2.5 Flash", model: "gemini-2.5-flash" }
    ]
  },
  {
    name: "OpenAI",
    provider: "openai-compatible",
    baseURL: "https://api.openai.com/v1",
    models: [
      { name: "GPT-4.1", model: "gpt-4.1" },
      { name: "GPT-4.1 Mini", model: "gpt-4.1-mini" }
    ]
  },
  {
    name: "Qwen",
    provider: "openai-compatible",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      { name: "Qwen Plus", model: "qwen-plus" },
      { name: "Qwen Max", model: "qwen-max" }
    ]
  },
  {
    name: "硅基流动",
    provider: "openai-compatible",
    baseURL: "https://api.siliconflow.cn/v1",
    models: [
      { name: "DeepSeek V3", model: "deepseek-ai/DeepSeek-V3" },
      { name: "DeepSeek R1", model: "deepseek-ai/DeepSeek-R1" }
    ]
  }
];

const presetCapabilities: Record<string, ModelCapabilities> = {
  "deepseek-chat": { contextWindow: 128_000, maxOutput: 8_000, tags: ["对话", "MOE"] },
  "deepseek-reasoner": { contextWindow: 128_000, maxOutput: 8_000, tags: ["对话", "推理", "MOE"] },
  "claude-opus-4-7": { contextWindow: 1_000_000, maxOutput: 128_000, tags: ["对话", "视觉", "思考"] },
  "claude-sonnet-4-6": { contextWindow: 1_000_000, maxOutput: 64_000, tags: ["对话", "视觉", "思考"] },
  "gemini-2.5-pro": { contextWindow: 1_048_576, maxOutput: 65_536, tags: ["对话", "视觉", "思考"] },
  "gemini-2.5-flash": { contextWindow: 1_048_576, maxOutput: 65_536, tags: ["对话", "视觉"] },
  "gpt-4.1": { contextWindow: 1_000_000, maxOutput: 32_768, tags: ["对话", "视觉"] },
  "gpt-4.1-mini": { contextWindow: 1_000_000, maxOutput: 16_384, tags: ["对话", "视觉"] },
  "qwen-plus": { contextWindow: 131_072, maxOutput: 8_192, tags: ["对话"] },
  "qwen-max": { contextWindow: 32_768, maxOutput: 8_192, tags: ["对话"] },
  "deepseek-ai/DeepSeek-V3": { contextWindow: 128_000, maxOutput: 8_000, tags: ["对话", "MOE"] },
  "deepseek-ai/DeepSeek-R1": { contextWindow: 128_000, maxOutput: 8_000, tags: ["对话", "推理", "MOE"] }
};

export function createPresetGroup(preset: ProviderPreset): ProviderGroup {
  return {
    id: crypto.randomUUID(),
    name: preset.name,
    provider: preset.provider,
    apiKey: "",
    baseURL: preset.baseURL,
    builtIn: true,
    models: preset.models.map((model) => ({
      id: crypto.randomUUID(),
      ...model,
      capabilities: presetCapabilities[model.model]
    }))
  };
}

export function defaultProviderName(provider: Provider) {
  if (provider === "anthropic") return "Claude";
  return "OpenAI 兼容";
}

export function defaultBaseURL(provider: Provider) {
  if (provider === "anthropic") return "https://api.anthropic.com";
  return "https://api.openai.com/v1";
}

function mergePresetGroups(groups: ProviderGroup[]) {
  const nextGroups = [...groups];
  for (const preset of providerPresets) {
    const existing = nextGroups.find((group) => group.name === preset.name);
    if (existing) {
      existing.models = existing.models.map((model) => ({
        ...model,
        capabilities: model.capabilities ?? presetCapabilities[model.model]
      }));
    } else {
      nextGroups.push(createPresetGroup(preset));
    }
  }
  return nextGroups;
}

function migrateLegacyModels(models: Array<ModelConfig | Omit<ModelConfig, "providerName">>): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>();

  for (const model of models) {
    const providerName = "providerName" in model && model.providerName ? model.providerName : defaultProviderName(model.provider);
    const key = `${providerName}|${model.provider}|${model.baseURL}|${model.apiKey}`;
    const existing = groups.get(key);
    const childModel = { id: model.id, name: model.name, model: model.model };

    if (existing) {
      existing.models.push(childModel);
    } else {
      groups.set(key, {
        id: crypto.randomUUID(),
        name: providerName,
        provider: model.provider,
        apiKey: model.apiKey,
        baseURL: model.baseURL,
        models: [childModel]
      });
    }
  }

  return [...groups.values()];
}

export function loadProviderGroups(): ProviderGroup[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(storageKey);
  if (raw) {
    try {
      const merged = mergePresetGroups(JSON.parse(raw) as ProviderGroup[]);
      saveProviderGroups(merged);
      return merged;
    } catch {
      return providerPresets.map(createPresetGroup);
    }
  }

  const legacyRaw = window.localStorage.getItem(legacyStorageKey);
  if (!legacyRaw) return providerPresets.map(createPresetGroup);

  try {
    const migrated = mergePresetGroups(migrateLegacyModels(JSON.parse(legacyRaw) as Array<ModelConfig | Omit<ModelConfig, "providerName">>));
    saveProviderGroups(migrated);
    return migrated;
  } catch {
    return providerPresets.map(createPresetGroup);
  }
}

export function saveProviderGroups(groups: ProviderGroup[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(groups));
}

export function flattenProviderGroups(groups: ProviderGroup[]): ModelConfig[] {
  return groups.flatMap((group) =>
    group.models.map((model) => ({
      id: model.id,
      name: model.name,
      providerName: group.name,
      provider: group.provider,
      apiKey: group.apiKey,
      baseURL: group.baseURL,
      model: model.model,
      tags: model.capabilities?.tags
    }))
  );
}

export function loadModels(): ModelConfig[] {
  return flattenProviderGroups(loadProviderGroups()).filter((model) => model.apiKey.trim());
}

export function saveModels(models: ModelConfig[]) {
  saveProviderGroups(mergePresetGroups(migrateLegacyModels(models)));
}

export function loadAppSettings(): AppSettings {
  if (typeof window === "undefined") return { ...defaultSettings };

  const raw = window.localStorage.getItem(settingsKey);
  if (!raw) return { ...defaultSettings };

  try {
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveAppSettings(settings: AppSettings) {
  window.localStorage.setItem(settingsKey, JSON.stringify(settings));
}
