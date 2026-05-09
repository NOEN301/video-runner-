"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  defaultBaseURL,
  loadAppSettings,
  loadProviderGroups,
  Provider,
  ProviderGroup,
  saveAppSettings,
  saveProviderGroups
} from "../components/modelStore";

type ViewMode = "list" | "detail";

function formatContext(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}

type CustomProviderForm = {
  name: string;
  provider: Provider;
  baseURL: string;
};

type ModelForm = {
  model: string;
};

const emptyCustomProviderForm: CustomProviderForm = {
  name: "",
  provider: "openai-compatible",
  baseURL: defaultBaseURL("openai-compatible")
};

const emptyModelForm: ModelForm = {
  model: ""
};

export default function SettingsPage() {
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [customProviderForm, setCustomProviderForm] = useState(emptyCustomProviderForm);
  const [modelForm, setModelForm] = useState(emptyModelForm);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [settings, setSettings] = useState(loadAppSettings());

  useEffect(() => {
    const groups = loadProviderGroups();
    const appSettings = loadAppSettings();
    setProviderGroups(groups);
    setActiveProviderId(groups[0]?.id ?? null);
    setSettings(appSettings);
  }, []);

  const activeProvider = useMemo(
    () => providerGroups.find((group) => group.id === activeProviderId) ?? null,
    [providerGroups, activeProviderId]
  );

  function persist(nextGroups: ProviderGroup[]) {
    setProviderGroups(nextGroups);
    saveProviderGroups(nextGroups);
  }

  function updateSetting<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      saveAppSettings(next);
      return next;
    });
  }

  function openProvider(id: string) {
    setActiveProviderId(id);
    setViewMode("detail");
    setMessage("");
    setShowApiKey(false);
    setEditingModelId(null);
    setModelForm(emptyModelForm);
  }

  function updateActiveProvider(patch: Partial<ProviderGroup>) {
    if (!activeProvider) return;
    persist(providerGroups.map((group) => (group.id === activeProvider.id ? { ...group, ...patch } : group)));
  }

  function addCustomProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = {
      ...customProviderForm,
      name: customProviderForm.name.trim(),
      baseURL: customProviderForm.baseURL.trim().replace(/\/$/, "")
    };

    if (!trimmed.name || !trimmed.baseURL) {
      setMessage("请填写模型提供方名称和 API 主机链接。");
      return;
    }

    const newProvider: ProviderGroup = {
      id: crypto.randomUUID(),
      name: trimmed.name,
      provider: trimmed.provider,
      apiKey: "",
      baseURL: trimmed.baseURL,
      models: []
    };

    persist([...providerGroups, newProvider]);
    setCustomProviderForm(emptyCustomProviderForm);
    setMessage("已添加自定义模型提供方。");
  }

  function deleteProvider(id: string) {
    const nextGroups = providerGroups.filter((group) => group.id !== id);
    persist(nextGroups);
    if (activeProviderId === id) {
      setActiveProviderId(nextGroups[0]?.id ?? null);
      setViewMode("list");
    }
    setMessage("已删除模型提供方。");
  }

  async function testConnection() {
    if (!activeProvider) return;
    const model = activeProvider.models[0];
    if (!activeProvider.apiKey.trim()) {
      setMessage("请先填写 API 秘钥。");
      return;
    }
    if (!activeProvider.baseURL.trim()) {
      setMessage("请先填写 API 主机链接。");
      return;
    }
    if (!model) {
      setMessage("请先添加至少一个模型再检测连通性。");
      return;
    }

    setTesting(true);
    setMessage("正在检测连通性...");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelConfig: {
            id: model.id,
            name: model.name,
            providerName: activeProvider.name,
            provider: activeProvider.provider,
            apiKey: activeProvider.apiKey,
            baseURL: activeProvider.baseURL,
            model: model.model
          },
          test: true
        })
      });

      const text = await response.text();
      let data: { error?: string; text?: string } = {};
      try {
        data = JSON.parse(text) as { error?: string; text?: string };
      } catch {
        throw new Error("接口返回了非 JSON 内容，请检查网站服务是否正常。");
      }

      if (!response.ok) throw new Error(data.error || "连通性检测失败");
      setMessage(`连通性正常：${data.text || "模型已响应"}`);
    } catch (caughtError) {
      setMessage(`连通性失败：${caughtError instanceof Error ? caughtError.message : "未知错误"}`);
    } finally {
      setTesting(false);
    }
  }

  async function fetchProviderModels() {
    if (!activeProvider) return;
    if (!activeProvider.apiKey.trim()) {
      setMessage("请先填写 API 秘钥再获取模型。");
      return;
    }

    setFetchingModels(true);
    setMessage("正在获取模型列表...");

    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerGroup: activeProvider })
      });

      const text = await response.text();
      let data: { error?: string; models?: Array<{ name: string; model: string }> } = {};
      try {
        data = JSON.parse(text) as { error?: string; models?: Array<{ name: string; model: string }> };
      } catch {
        throw new Error("接口返回了非 JSON 内容，请检查网站服务是否正常。");
      }

      if (!response.ok) throw new Error(data.error || "获取模型失败");

      const fetchedModels = data.models ?? [];
      updateActiveProvider({
        models: [
          ...activeProvider.models,
          ...fetchedModels
            .filter((model) => !activeProvider.models.some((existing) => existing.model === model.model))
            .map((model) => ({ id: crypto.randomUUID(), ...model }))
        ]
      });
      setMessage(fetchedModels.length ? `已获取 ${fetchedModels.length} 个模型。` : "没有获取到模型。 ");
    } catch (caughtError) {
      setMessage(`获取失败：${caughtError instanceof Error ? caughtError.message : "未知错误"}`);
    } finally {
      setFetchingModels(false);
    }
  }

  function saveModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProvider) return;

    const modelId = modelForm.model.trim();
    if (!modelId) {
      setMessage("请填写模型 ID。");
      return;
    }
    const trimmed = { name: modelId, model: modelId };

    if (editingModelId) {
      updateActiveProvider({
        models: activeProvider.models.map((model) => (model.id === editingModelId ? { id: editingModelId, ...trimmed } : model))
      });
      setMessage("已更新模型。");
    } else {
      updateActiveProvider({ models: [...activeProvider.models, { id: crypto.randomUUID(), ...trimmed }] });
      setMessage("已新建模型。");
    }

    setEditingModelId(null);
    setModelForm(emptyModelForm);
  }

  function editModel(id: string) {
    const model = activeProvider?.models.find((item) => item.id === id);
    if (!model) return;
    setEditingModelId(id);
    setModelForm({ model: model.model });
  }

  function deleteModel(id: string) {
    if (!activeProvider) return;
    updateActiveProvider({ models: activeProvider.models.filter((model) => model.id !== id) });
    setMessage("已删除模型。");
  }

  if (viewMode === "detail" && activeProvider) {
    return (
      <main className="settings-detail">
        <section className="card settings-card-full">
          <button className="secondary" type="button" onClick={() => setViewMode("list")}>返回模型提供方</button>
          <div className="provider-detail-head">
            <div>
              <h2>{activeProvider.name}</h2>
              <p className="muted">{activeProvider.provider === "anthropic" ? "Claude API" : "OpenAI 兼容接口"}</p>
            </div>
            {!activeProvider.builtIn ? <button className="danger" type="button" onClick={() => deleteProvider(activeProvider.id)}>删除提供方</button> : null}
          </div>
        </section>

        <section className="card settings-card-full">
          <h2>API 配置</h2>
          <div className="form">
            <div className="field">
              <label>API 主机链接</label>
              <input value={activeProvider.baseURL} onChange={(event) => updateActiveProvider({ baseURL: event.target.value })} placeholder="https://api.deepseek.com/v1" />
            </div>
            <div className="field">
              <label>API 秘钥</label>
              <div className="secret-input">
                <input
                  autoComplete="off"
                  inputMode="text"
                  type={showApiKey ? "text" : "password"}
                  value={activeProvider.apiKey}
                  onChange={(event) => updateActiveProvider({ apiKey: event.target.value })}
                  placeholder="粘贴 API Key"
                />
                <button className="secondary" type="button" onClick={() => setShowApiKey(!showApiKey)}>{showApiKey ? "隐藏" : "查看"}</button>
              </div>
            </div>
            <div className="actions">
              <button disabled={testing} type="button" onClick={testConnection}>{testing ? "检测中..." : "连通性检测"}</button>
              <button className="secondary" disabled={fetchingModels} type="button" onClick={fetchProviderModels}>{fetchingModels ? "获取中..." : "获取模型"}</button>
            </div>
            {message ? <p className="muted">{message}</p> : null}
          </div>
        </section>

        <section className="card">
          <h2>{editingModelId ? "编辑模型" : "新建模型"}</h2>
          <form className="form" onSubmit={saveModel}>
            <div className="field">
              <label>模型 ID</label>
              <input value={modelForm.model} onChange={(event) => setModelForm({ model: event.target.value })} placeholder="例如：deepseek-chat" />
            </div>
            <div className="actions">
              <button type="submit">{editingModelId ? "保存模型" : "新建模型"}</button>
              {editingModelId ? <button className="secondary" type="button" onClick={() => { setEditingModelId(null); setModelForm(emptyModelForm); }}>取消编辑</button> : null}
            </div>
          </form>
        </section>

        <section className="card">
          <h2>模型列表</h2>
          {activeProvider.models.length === 0 ? (
            <p className="muted">还没有模型，可以点击“获取模型”或手动新建。</p>
          ) : (
            <div className="model-list">
              {activeProvider.models.map((model) => (
                <div className="model-item" key={model.id}>
                  <div className="model-item-head">
                    <h3>{model.name}</h3>
                  </div>
                  <p className="muted">{model.model}</p>
                  {model.capabilities?.tags && model.capabilities.tags.length > 0 ? (
                    <div className="model-tags">
                      {model.capabilities.tags.map((tag) => <span className="model-tag" key={tag}>{tag}</span>)}
                    </div>
                  ) : null}
                  {model.capabilities?.contextWindow || model.capabilities?.maxOutput ? (
                    <div className="model-caps">
                      {model.capabilities.contextWindow ? <span>📐 {formatContext(model.capabilities.contextWindow)}</span> : null}
                      {model.capabilities.maxOutput ? <span>📤 {formatContext(model.capabilities.maxOutput)}</span> : null}
                    </div>
                  ) : null}
                  <div className="actions">
                    <button className="secondary" type="button" onClick={() => editModel(model.id)}>编辑</button>
                    <button className="danger" type="button" onClick={() => deleteModel(model.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="settings-layout">
      <section className="card settings-card-full">
        <h2>对话设置</h2>

        <h3 className="settings-section-title">输入与输出</h3>
        <label className="settings-toggle">
          <span><strong>流式输出</strong><small>模型回复逐字显示。</small></span>
          <input checked={settings.streamEnabled} type="checkbox" onChange={(event) => updateSetting("streamEnabled", event.target.checked)} />
        </label>
        <label className="settings-toggle">
          <span><strong>代码预览</strong><small>自动渲染 HTML/SVG/Mermaid 代码块。</small></span>
          <input checked={settings.artifactsEnabled} type="checkbox" onChange={(event) => updateSetting("artifactsEnabled", event.target.checked)} />
        </label>
        <label className="settings-toggle">
          <span><strong>自动跟随</strong><small>模型流式回复时页面自动滚动到最新内容。</small></span>
          <input checked={settings.autoScroll} type="checkbox" onChange={(event) => updateSetting("autoScroll", event.target.checked)} />
        </label>
        <label className="settings-toggle">
          <span><strong>拼写检查</strong><small>输入框启用浏览器拼写检查。</small></span>
          <input checked={settings.spellCheck} type="checkbox" onChange={(event) => updateSetting("spellCheck", event.target.checked)} />
        </label>

        <h3 className="settings-section-title">对话显示</h3>
        <div className="settings-toggle">
          <span><strong>布局风格</strong><small>气泡或经典平铺布局。</small></span>
          <select value={settings.chatLayout} onChange={(event) => updateSetting("chatLayout", event.target.value as "bubble" | "classic")}>
            <option value="bubble">气泡</option>
            <option value="classic">经典</option>
          </select>
        </div>
        <label className="settings-toggle">
          <span><strong>头像</strong><small>显示消息来源头像。</small></span>
          <input checked={settings.showAvatar} type="checkbox" onChange={(event) => updateSetting("showAvatar", event.target.checked)} />
        </label>
        <label className="settings-toggle">
          <span><strong>时间戳</strong><small>每条消息显示发送时间。</small></span>
          <input checked={settings.showTimestamp} type="checkbox" onChange={(event) => updateSetting("showTimestamp", event.target.checked)} />
        </label>
        <label className="settings-toggle">
          <span><strong>模型名称</strong><small>在回复旁显示模型标识。</small></span>
          <input checked={settings.showModelName} type="checkbox" onChange={(event) => updateSetting("showModelName", event.target.checked)} />
        </label>
        <label className="settings-toggle">
          <span><strong>字数统计</strong><small>消息旁显示字数。</small></span>
          <input checked={settings.showWordCount} type="checkbox" onChange={(event) => updateSetting("showWordCount", event.target.checked)} />
        </label>

        <h3 className="settings-section-title">智能辅助</h3>
        <label className="settings-toggle">
          <span><strong>自动标题</strong><small>根据首条消息自动生成对话标题。</small></span>
          <input checked={settings.autoTitle} type="checkbox" onChange={(event) => updateSetting("autoTitle", event.target.checked)} />
        </label>
      </section>

      <section className="card settings-card-full">
        <h2>模型提供方</h2>
        <div className="provider-card-grid">
          {providerGroups.map((group) => (
            <button className="provider-card" key={group.id} type="button" onClick={() => openProvider(group.id)}>
              <strong>{group.name}</strong>
              <span>{group.models.length} 个模型 · {group.apiKey ? "已配置 Key" : "未配置 Key"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card settings-card-full">
        <h2>自定义添加模型提供方</h2>
        <form className="form" onSubmit={addCustomProvider}>
          <div className="field">
            <label>提供方名称</label>
            <input value={customProviderForm.name} onChange={(event) => setCustomProviderForm({ ...customProviderForm, name: event.target.value })} placeholder="例如：我的中转站" />
          </div>
          <div className="field">
            <label>接口类型</label>
            <select value={customProviderForm.provider} onChange={(event) => setCustomProviderForm({ ...customProviderForm, provider: event.target.value as Provider, baseURL: defaultBaseURL(event.target.value as Provider) })}>
              <option value="openai-compatible">OpenAI 兼容接口</option>
              <option value="anthropic">Claude API</option>
            </select>
          </div>
          <div className="field">
            <label>API 主机链接</label>
            <input value={customProviderForm.baseURL} onChange={(event) => setCustomProviderForm({ ...customProviderForm, baseURL: event.target.value })} placeholder="https://example.com/v1" />
          </div>
          <button type="submit">添加提供方</button>
        </form>
        {message ? <p className="muted">{message}</p> : null}
      </section>
    </main>
  );
}
