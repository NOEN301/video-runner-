"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { loadAppSettings, loadModels, ModelConfig, AppSettings } from "../components/modelStore";
import MarkdownContent from "../components/MarkdownContent";
import ModelSelector from "../components/ModelSelector";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  modelUsed?: string;
  tokenUsage?: { input: number; output: number };
  images?: Array<{ preview: string; name: string }>;
  files?: Array<{ name: string }>;
};

type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
};

const historyKey = "local-chat-sessions";

function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(historyKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ChatSession[];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]) {
  window.localStorage.setItem(historyKey, JSON.stringify(sessions));
}

function createSession(firstMessage: string): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: firstMessage.slice(0, 28) || "新对话",
    messages: [],
    updatedAt: Date.now()
  };
}

function groupModelsByProvider(models: ModelConfig[]) {
  return models.reduce<Record<string, ModelConfig[]>>((groups, model) => {
    groups[model.providerName] = [...(groups[model.providerName] ?? []), model];
    return groups;
  }, {});
}

function formatTime(ts: number) {
  const date = new Date(ts);
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function wordCount(text: string) {
  return text.replace(/\s+/g, "").length;
}

function autoTitle(text: string) {
  return text.replace(/[\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "新对话";
}

let katexLoaded = false;
let mermaidLoaded = false;

function loadKatex() {
  if (katexLoaded || typeof window === "undefined") return;
  katexLoaded = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
  document.head.appendChild(link);
}

function loadMermaid() {
  if (mermaidLoaded || typeof window === "undefined") return;
  mermaidLoaded = true;
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
  script.onload = () => { try { (window as unknown as { mermaid?: { initialize?: (o: object) => void } }).mermaid?.initialize?.({ startOnLoad: false, theme: "neutral" }); } catch { /* mermaid init error */ } };
  document.head.appendChild(script);
}

export default function ChatPage() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<AppSettings>(loadAppSettings());
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});
  const [pasteFiles, setPasteFiles] = useState<Record<string, string>>({});
  const [attachedImages, setAttachedImages] = useState<Array<{ data: string; mediaType: string; name: string; preview: string }>>([]);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; content: string; id: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const stoppedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const sessionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const savedModels = loadModels();
    const savedSessions = loadSessions();
    const appSettings = loadAppSettings();
    setModels(savedModels);
    setSessions(savedSessions);
    setSelectedId(savedModels[0]?.id ?? "");
    setActiveSessionId(savedSessions[0]?.id ?? null);
    setSettings(appSettings);
    loadKatex();
    if (appSettings.artifactsEnabled) loadMermaid();
  }, []);

  function scrollToBottom(force = false) {
    if (!settings.autoScroll && !force) return;
    if (userScrolledUpRef.current && !force) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleMessagesScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    userScrolledUpRef.current = !atBottom;
  }

  useEffect(() => {
    if (loading && settings.streamEnabled) {
      userScrolledUpRef.current = false;
    }
  }, [loading, settings.streamEnabled]);

  const selectedModel = useMemo(() => models.find((model) => model.id === selectedId), [models, selectedId]);
  const modelSupportsVision = selectedModel?.tags?.includes("视觉") ?? false;
  const activeSession = useMemo(() => sessions.find((session) => session.id === activeSessionId) ?? null, [sessions, activeSessionId]);
  const messages = activeSession?.messages ?? [];

  const tokenStats = useMemo(() => {
    let sessionTotal = 0;
    for (const message of activeSession?.messages ?? []) {
      if (message.role === "assistant" && message.tokenUsage) {
        sessionTotal += message.tokenUsage.input + message.tokenUsage.output;
      }
    }
    return { sessionTotal };
  }, [activeSession?.messages]);

  useEffect(() => {
    if (loading) scrollToBottom();
  }, [messages]);

  function persistSessions(nextSessions: ChatSession[]) {
    const sortedSessions = [...nextSessions].sort((a, b) => b.updatedAt - a.updatedAt);
    setSessions(sortedSessions);
    saveSessions(sortedSessions);
  }

  function startNewChat() {
    stoppedRef.current = true;
    abortRef.current?.abort();
    streamReaderRef.current?.cancel().catch(() => {});
    streamReaderRef.current = null;
    setActiveSessionId(null);
    setPrompt("");
    setError("");
    setPasteFiles({});
    setAttachedImages([]);
    setAttachedFiles([]);
    setLoading(false);
  }

  function stopGeneration() {
    stoppedRef.current = true;
    abortRef.current?.abort();
    streamReaderRef.current?.cancel().catch(() => {});
    streamReaderRef.current = null;
    setLoading(false);
  }

  function deleteSession(id: string) {
    const nextSessions = sessions.filter((session) => session.id !== id);
    persistSessions(nextSessions);
    if (activeSessionId === id) {
      setActiveSessionId(nextSessions[0]?.id ?? null);
      setError("");
    }
  }

  const upsertSession = useCallback((session: ChatSession) => {
    setSessions((currentSessions) => {
      const nextSessions = [session, ...currentSessions.filter((item) => item.id !== session.id)]
        .sort((a, b) => b.updatedAt - a.updatedAt);
      if (sessionSaveTimerRef.current) clearTimeout(sessionSaveTimerRef.current);
      sessionSaveTimerRef.current = setTimeout(() => saveSessions(nextSessions), 300);
      return nextSessions;
    });
    setActiveSessionId(session.id);
  }, []);

  function editMessage(messageText: string) {
    setPrompt(messageText);
    const textarea = document.querySelector<HTMLTextAreaElement>(".chat-input-row textarea");
    textarea?.focus();
  }

  async function retryMessage(messageIndex: number) {
    if (!activeSession || !selectedModel) return;
    setError("");
    const userMessage = activeSession.messages[messageIndex];
    if (!userMessage || userMessage.role !== "user") return;
    const trimmedMessages = activeSession.messages.slice(0, messageIndex);
    const updatedSession: ChatSession = { ...activeSession, messages: trimmedMessages, updatedAt: Date.now() };
    upsertSession(updatedSession);
    setPrompt(userMessage.content);
    await sendMessage(userMessage.content, updatedSession);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = event.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) addImageFile(file);
        event.preventDefault();
        return;
      }
    }
    const pastedText = event.clipboardData.getData("text");
    if (pastedText.length > 600) {
      const fileId = crypto.randomUUID();
      setPasteFiles((current) => ({ ...current, [fileId]: pastedText }));
      setPrompt((current) => current + `\n[附件: paste-${fileId.slice(0, 6)}]`);
    }
  }

  function addImageFile(file: File) {
    const img = new Image();
    img.onload = () => {
      const maxW = 1568;
      let { width, height } = img;
      if (width > maxW) { height = Math.round(height * maxW / width); width = maxW; }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL(file.type || "image/png");
      const commaIdx = dataUrl.indexOf(",");
      const base64 = dataUrl.slice(commaIdx + 1);
      const mediaType = dataUrl.slice(5, commaIdx).replace(";base64", "");
      setAttachedImages((current) => [...current, { data: base64, mediaType, name: file.name, preview: dataUrl }]);
    };
    img.src = URL.createObjectURL(file);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files) return;
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        addImageFile(file);
      } else {
        const reader = new FileReader();
        const id = crypto.randomUUID();
        reader.onload = () => {
          setAttachedFiles((current) => [...current, { id, name: file.name, content: reader.result as string }]);
        };
        reader.readAsText(file);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function sendMessage(overridePrompt?: string, overrideSession?: ChatSession) {
    if (attachedImages.length > 0 && !modelSupportsVision) {
      setError("当前模型不支持视觉（图片输入），请切换到有视觉标签的模型，或移除图片后重试。");
      return;
    }

    const hasAttachments = attachedImages.length > 0 || attachedFiles.length > 0;
    const userPrompt = (overridePrompt || prompt.trim() || (hasAttachments ? "" : ""));
    if ((!userPrompt && !hasAttachments) || !selectedModel) {
      if (!selectedModel) setError("请先添加模型配置。");
      else setError("请输入要发送的内容或上传附件。");
      return;
    }

    setError("");
    if (!overridePrompt) { setPrompt(""); setAttachedImages([]); setAttachedFiles([]); setPasteFiles({}); }

    const baseSession = overrideSession || (activeSession ?? createSession(userPrompt));
    const isFirstMessage = baseSession.messages.length === 0;
    const modelName = selectedModel?.name;
    const currentImages = attachedImages.map(({ preview, name }) => ({ preview, name }));
    const currentFiles = attachedFiles.map(({ name }) => ({ name }));
    const userMessages: ChatMessage[] = [...baseSession.messages, {
      role: "user", content: userPrompt, timestamp: Date.now(),
      images: currentImages.length > 0 ? currentImages : undefined,
      files: currentFiles.length > 0 ? currentFiles : undefined
    }];
    const pendingSession: ChatSession = {
      ...baseSession,
      title: isFirstMessage && settings.autoTitle ? autoTitle(userPrompt) : baseSession.title,
      messages: userMessages,
      updatedAt: Date.now()
    };

    setLoading(true);
    stoppedRef.current = false;
    upsertSession(pendingSession);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const systemPrompt = settings.showModelName && selectedModel
        ? `[模型: ${selectedModel.name} | 日期: ${new Date().toLocaleDateString("zh-CN")}]`
        : undefined;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelConfig: selectedModel,
          prompt: userPrompt,
          stream: settings.streamEnabled,
          system: systemPrompt,
          images: attachedImages.length > 0 ? attachedImages.map(({ data, mediaType }) => ({ data, mediaType })) : undefined,
          files: attachedFiles.length > 0 ? attachedFiles.map(({ name, content }) => ({ name, content })) : undefined
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        let data: { error?: string } = {};
        try { data = JSON.parse(text) as { error?: string }; } catch {
          throw new Error("接口返回了非 JSON 错误内容，请检查开发服务是否正常运行。");
        }
        throw new Error(data.error || "模型调用失败");
      }

      if (settings.streamEnabled) {
        if (!response.body) throw new Error("当前浏览器不支持流式读取。");
        const reader = response.body.getReader();
        streamReaderRef.current = reader;
        const decoder = new TextDecoder();
        let assistantText = "";
        let lastUpdate = 0;
        let tokenUsage: { input: number; output: number } | undefined;
        const streamSession = { ...pendingSession };

        try {
          while (!stoppedRef.current) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });

            const separatorIndex = chunk.indexOf("\n USAGE \n");
            if (separatorIndex !== -1) {
              assistantText += chunk.slice(0, separatorIndex);
              try {
                tokenUsage = JSON.parse(chunk.slice(separatorIndex + 9).trim()) as { input: number; output: number };
              } catch { /* ignore */ }
            } else {
              assistantText += chunk;
            }

            const now = Date.now();
            if (now - lastUpdate > 16) {
              lastUpdate = now;
              upsertSession({
                ...streamSession,
                messages: [...userMessages, { role: "assistant", content: assistantText, timestamp: Date.now(), modelUsed: modelName, tokenUsage }],
                updatedAt: Date.now()
              });
            }
          }
        } finally {
          reader.cancel().catch(() => {});
        }

        if (assistantText || stoppedRef.current) {
          upsertSession({
            ...streamSession,
            messages: [...userMessages, { role: "assistant", content: assistantText || "", timestamp: Date.now(), modelUsed: modelName, tokenUsage }],
            updatedAt: Date.now()
          });
        } else if (!assistantText && !stoppedRef.current) {
          upsertSession({
            ...streamSession,
            messages: [...userMessages, { role: "assistant", content: "模型没有返回文本内容。", timestamp: Date.now(), modelUsed: modelName }],
            updatedAt: Date.now()
          });
        }
      } else {
        const text = await response.text();
        let data: { error?: string; text?: string; usage?: { input: number; output: number } } = {};
        try { data = JSON.parse(text) as { error?: string; text?: string; usage?: { input: number; output: number } }; } catch {
          throw new Error("接口返回了非 JSON 内容，请检查开发服务是否正常运行。");
        }
        upsertSession({
          ...pendingSession,
          messages: [...userMessages, { role: "assistant", content: data.text || "模型没有返回文本内容。", timestamp: Date.now(), modelUsed: modelName, tokenUsage: data.usage }],
          updatedAt: Date.now()
        });
      }
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return;
      if (stoppedRef.current) return;
      setError(caughtError instanceof Error ? caughtError.message : "模型调用失败");
    } finally {
      setLoading(false);
      abortRef.current = null;
      streamReaderRef.current = null;
      stoppedRef.current = false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage();
  }

  function toggleMessage(key: string) {
    setExpandedMessages((current) => ({ ...current, [key]: !current[key] }));
  }

  function renderMessage(message: ChatMessage, key: string, index: number) {
    const isUserMessage = message.role === "user";
    const shouldCollapse = isUserMessage && (message.content.length > 180 || message.content.split("\n").length > 6);
    const expanded = expandedMessages[key] || !shouldCollapse;
    const isClassic = settings.chatLayout === "classic";

    return (
      <div className={`message-row ${message.role} ${isClassic ? "classic" : ""}`}>
        {settings.showAvatar ? (
          <div className={`message-avatar ${message.role}`}>
            {message.role === "user" ? "U" : selectedModel?.name.charAt(0) ?? "M"}
          </div>
        ) : null}
        <div className="message-content-wrap">
          <div className="message-meta">
            {settings.showModelName && message.role === "assistant" ? (
              <span className="message-model">{message.modelUsed || selectedModel?.name}</span>
            ) : null}
            {settings.showTimestamp ? (
              <span className="message-time">{formatTime(message.timestamp)}</span>
            ) : null}
          </div>
          <div className={`message-bubble ${isUserMessage ? "user-bubble" : ""}`}>
            {message.images && message.images.length > 0 ? (
              <div className="msg-images">
                {message.images.map((img, i) => (
                  <img key={i} src={img.preview} alt={img.name} className="msg-image" />
                ))}
              </div>
            ) : null}
            {message.files && message.files.length > 0 ? (
              <div className="msg-files">
                {message.files.map((f, i) => (
                  <span key={i} className="msg-file">{f.name}</span>
                ))}
              </div>
            ) : null}
            {message.content ? <MarkdownContent content={message.content} collapsed={!expanded} previewEnabled={settings.artifactsEnabled} /> : null}
          </div>
          {message.tokenUsage ? (
            <span className="message-word-count">{message.tokenUsage.input}↑ {message.tokenUsage.output}↓ Token</span>
          ) : settings.showWordCount ? (
            <span className="message-word-count">{wordCount(message.content)} 字</span>
          ) : null}
          {shouldCollapse ? (
            <button className="message-toggle" type="button" onClick={() => toggleMessage(key)}>
              {expanded ? "收起" : "展开"}
            </button>
          ) : null}
          {isUserMessage ? (
            <div className="message-actions">
              <button className="icon-btn" type="button" onClick={() => editMessage(message.content)} title="编辑">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              </button>
              <button className="icon-btn" type="button" onClick={() => retryMessage(index)} title="重试">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main className="chat-layout">
      <aside className="history-sidebar">
        <button className="new-chat-button" type="button" onClick={startNewChat}>新对话</button>
        {tokenStats.sessionTotal > 0 ? <div className="token-stats">{tokenStats.sessionTotal} Token</div> : null}
        <div className="history-title">历史记录</div>
        {sessions.length === 0 ? (
          <p className="history-empty">暂无历史</p>
        ) : (
          <div className="history-list">
            {sessions.map((session) => (
              <div className={`history-item ${session.id === activeSessionId ? "active" : ""}`} key={session.id}>
                <button className="history-open" type="button" onClick={() => { abortRef.current?.abort(); setLoading(false); setActiveSessionId(session.id); setError(""); }}>
                  <span>{session.title}</span>
                </button>
                <button className="history-delete" type="button" onClick={() => deleteSession(session.id)} aria-label="删除历史">×</button>
              </div>
            ))}
          </div>
        )}
      </aside>

      <section className="chat-shell">
        {models.length === 0 ? (
          <section className="chat-empty">
            <h2>开始之前，先添加一个模型</h2>
            <p>在 <Link href="/settings">设置</Link> 中配置模型提供方后，就可以在这里直接对话。</p>
          </section>
        ) : messages.length === 0 && !loading ? (
          <section className="chat-empty">
            <h2>今天想聊点什么？</h2>
            <p>选择一个模型，输入问题，然后开始调用。</p>
          </section>
        ) : (
          <section className={`chat-messages ${settings.chatLayout === "classic" ? "classic-layout" : ""}`} aria-live="polite" onScroll={handleMessagesScroll}>
            {messages.map((message, index) => {
              const messageKey = `${activeSessionId ?? "draft"}-${index}`;
              return (
                <div key={messageKey}>
                  {renderMessage(message, messageKey, index)}
                </div>
              );
            })}
            {loading && !messages.some((message) => message.role === "assistant" && message.content) ? (
              <div className="thinking-line">正在思考...</div>
            ) : null}
            <div ref={messagesEndRef} />

          </section>
        )}

        {Object.keys(pasteFiles).length > 0 ? (
          <div className="paste-files-bar">
            {Object.entries(pasteFiles).map(([id, content]) => (
              <div className="paste-file-card" key={id}>
                <span>{id.slice(0, 8)} ({wordCount(content)} 字)</span>
                <button type="button" onClick={() => setPasteFiles((current) => { const next = { ...current }; delete next[id]; return next; })}>×</button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="chat-composer-wrap">
          <form className="chat-composer" onSubmit={handleSubmit}>
            <div className="chat-model-select">
              <ModelSelector models={models} selectedId={selectedId} onSelect={setSelectedId} disabled={loading} />
              {(activeSessionId || messages.length > 0) ? <button className="secondary" type="button" onClick={startNewChat}>新对话</button> : null}
            </div>

            {attachedImages.length > 0 || attachedFiles.length > 0 ? (
              <div className="image-previews">
                {attachedImages.map((img, i) => (
                  <div className="image-preview" key={`img-${i}`}>
                    <img src={img.preview} alt={img.name} />
                    <button className="image-remove" type="button" onClick={() => setAttachedImages((current) => current.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                {attachedFiles.map((file) => (
                  <div className="file-attachment" key={file.id}>
                    <span>{file.name}</span>
                    <button className="image-remove" type="button" onClick={() => setAttachedFiles((current) => current.filter((f) => f.id !== file.id))}>×</button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="chat-input-row">
              <input
                ref={fileInputRef}
                type="file"
                accept={modelSupportsVision ? "image/*,.txt,.pdf,.csv,.json,.md,.js,.ts,.py,.html,.css" : ".txt,.pdf,.csv,.json,.md,.js,.ts,.py,.html,.css"}
                multiple
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <button
                className="attach-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || (attachedImages.length > 0 && !modelSupportsVision)}
                title={modelSupportsVision ? "上传图片或文件" : "该模型不支持视觉，仅可上传文件"}
              >+</button>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!loading && prompt.trim()) void sendMessage();
                  }
                }}
                onPaste={handlePaste}
                placeholder="给模型发送消息"
                spellCheck={settings.spellCheck}
                disabled={models.length === 0 || loading}
              />
              {loading ? (
                <button className="stop-button" type="button" onClick={stopGeneration} title="停止生成">■</button>
              ) : (
                <button className="send-button" disabled={models.length === 0 || (!prompt.trim() && attachedImages.length === 0 && attachedFiles.length === 0)} type="submit">↑</button>
              )}
            </div>

            {error ? <p className="chat-error">{error}</p> : null}
          </form>
          <p className="chat-hint">Enter 发送，Shift + Enter 换行 · 粘贴超过 600 字自动转为附件</p>
        </div>
      </section>
    </main>
  );
}
