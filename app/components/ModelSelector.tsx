"use client";

import { useEffect, useRef, useState } from "react";
import { ModelConfig } from "./modelStore";

type Props = {
  models: ModelConfig[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
};

function groupByProvider(models: ModelConfig[]) {
  return models.reduce<Record<string, ModelConfig[]>>((groups, model) => {
    groups[model.providerName] = [...(groups[model.providerName] ?? []), model];
    return groups;
  }, {});
}

export default function ModelSelector({ models, selectedId, onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);

  const grouped = groupByProvider(models);
  const selectedModel = models.find((m) => m.id === selectedId);
  const providerNames = Object.keys(grouped);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && selectedModel) {
      setExpandedProviders((current) => ({ ...current, [selectedModel.providerName]: true }));
    }
  }, [open, selectedModel]);

  return (
    <div className="model-selector" ref={ref}>
      <button
        className="model-selector-trigger"
        type="button"
        disabled={disabled || models.length === 0}
        onClick={() => setOpen(!open)}
      >
        <span>{selectedModel ? `${selectedModel.providerName} / ${selectedModel.name}` : "未配置模型"}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open ? (
        <div className="model-selector-dropdown">
          {providerNames.map((providerName) => {
            const providerModels = grouped[providerName];
            const expanded = expandedProviders[providerName] ?? false;
            return (
              <div className="model-selector-group" key={providerName}>
                <button
                  className="model-selector-provider"
                  type="button"
                  onClick={() => setExpandedProviders((current) => ({ ...current, [providerName]: !current[providerName] }))}
                >
                  <svg
                    className={`chevron ${expanded ? "open" : ""}`}
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  >
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <span>{providerName}</span>
                  <span className="count">{providerModels.length}</span>
                </button>
                {expanded ? (
                  <div className="model-selector-models">
                    {providerModels.map((model) => (
                      <button
                        className={`model-selector-model ${model.id === selectedId ? "selected" : ""}`}
                        key={model.id}
                        type="button"
                        onClick={() => { onSelect(model.id); setOpen(false); }}
                      >
                        {model.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
