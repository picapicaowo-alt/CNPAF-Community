"use client";

import { useEffect, useState } from "react";
import {
  parseFormVisibilityConditions,
  type FormControlKind,
  type FormVisibilityCondition,
  type RuntimeFormField,
  type RuntimeFormOption,
  type RuntimeFormSection,
} from "@cnpaf/shared";
import { VisibilityRulesEditor } from "./VisibilityRulesEditor";

type Props = {
  availableFields: RuntimeFormField[];
  busy: boolean;
  controls: Map<string, FormControlKind>;
  fieldCount: number;
  index: number;
  locale: "zh" | "en";
  onClose: () => void;
  onDelete: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onMove: (direction: -1 | 1) => Promise<void>;
  onPreviewChange: (body: Partial<RuntimeFormSection>) => void;
  onSave: (body: Partial<RuntimeFormSection>) => Promise<void>;
  options: RuntimeFormOption[];
  section: RuntimeFormSection;
  total: number;
};

export function SectionSettingsPanel({
  availableFields,
  busy,
  controls,
  fieldCount,
  index,
  locale,
  onClose,
  onDelete,
  onDuplicate,
  onMove,
  onPreviewChange,
  onSave,
  options,
  section,
  total,
}: Props) {
  const [labelZh, setLabelZh] = useState(section.labelZh);
  const [labelEn, setLabelEn] = useState(section.labelEn);
  const [helpTextZh, setHelpTextZh] = useState(section.helpTextZh ?? "");
  const [helpTextEn, setHelpTextEn] = useState(section.helpTextEn ?? "");
  const [step, setStep] = useState(section.configuration?.step !== false);
  const [visibilityConditions, setVisibilityConditions] = useState<
    FormVisibilityCondition[]
  >(
    parseFormVisibilityConditions(
      section.configuration?.visibilityConditions,
    ),
  );

  useEffect(() => {
    onPreviewChange({
      labelZh,
      labelEn,
      helpTextZh: helpTextZh || null,
      helpTextEn: helpTextEn || null,
      configuration: {
        ...section.configuration,
        step,
        visibilityConditions,
      },
    });
  }, [
    helpTextEn,
    helpTextZh,
    labelEn,
    labelZh,
    onPreviewChange,
    section.id,
    step,
    visibilityConditions,
  ]);

  return (
    <div className="card builder-settings-panel">
      <div className="builder-settings-header">
        <div>
          <div className="eyebrow">{section.key}</div>
          <h2>{locale === "zh" ? "章节设置" : "Section settings"}</h2>
          <p className="caption">
            {locale === "zh"
              ? "修改会即时显示在左侧预览中"
              : "Changes appear in the live preview"}
          </p>
        </div>
        <button
          aria-label={locale === "zh" ? "收起章节设置" : "Close section settings"}
          className="builder-settings-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <div className="builder-settings-scroll stack-sm">
        <div className="form-grid">
          <label>
            中文标题
            <input
              value={labelZh}
              onChange={(event) => setLabelZh(event.target.value)}
            />
          </label>
          <label>
            English title
            <input
              value={labelEn}
              onChange={(event) => setLabelEn(event.target.value)}
            />
          </label>
        </div>
        <details className="settings-accordion">
          <summary>
            <span>{locale === "zh" ? "说明与呈现" : "Help and presentation"}</span>
            <span className="caption">
              {locale === "zh" ? "帮助文字、分步显示" : "Help text and step display"}
            </span>
          </summary>
          <div className="settings-accordion-body stack-sm">
            <div className="form-grid">
              <label>
                中文说明
                <textarea
                  value={helpTextZh}
                  onChange={(event) => setHelpTextZh(event.target.value)}
                />
              </label>
              <label>
                English help
                <textarea
                  value={helpTextEn}
                  onChange={(event) => setHelpTextEn(event.target.value)}
                />
              </label>
            </div>
            <label className="choice">
              <input
                checked={step}
                onChange={(event) => setStep(event.target.checked)}
                type="checkbox"
              />
              <span>
                {locale === "zh"
                  ? "采集时单独显示为一步"
                  : "Show as a separate collection step"}
              </span>
            </label>
          </div>
        </details>
        <details className="settings-accordion">
          <summary>
            <span>{locale === "zh" ? "何时显示本章节" : "When this section appears"}</span>
            <span className="caption">
              {visibilityConditions.length
                ? locale === "zh"
                  ? `${visibilityConditions.length} 条规则`
                  : `${visibilityConditions.length} rule(s)`
                : locale === "zh"
                  ? "始终显示"
                  : "Always visible"}
            </span>
          </summary>
          <div className="settings-accordion-body stack-sm">
            <div className="builder-logic-explainer">
              <strong>{locale === "zh" ? "进入章节前判断" : "Checked before entering"}</strong>
              <span>
                {locale === "zh"
                  ? "只能使用更早章节中的答案；所有条件满足时，本章节才显示。"
                  : "Uses answers from earlier sections; every condition must pass."}
              </span>
            </div>
            <VisibilityRulesEditor
              availableFields={availableFields}
              conditions={visibilityConditions}
              controls={controls}
              locale={locale}
              onChange={setVisibilityConditions}
              options={options}
              showIntro={false}
            />
          </div>
        </details>
        <div className="builder-order-controls">
          <span className="caption">
            {locale === "zh"
              ? `第 ${index + 1} / ${total} 章`
              : `Section ${index + 1} of ${total}`}
          </span>
          <div className="row">
            <button
              className="button button-secondary button-small"
              disabled={busy || index === 0}
              onClick={() => void onMove(-1)}
              type="button"
            >
              ↑ {locale === "zh" ? "上移" : "Up"}
            </button>
            <button
              className="button button-secondary button-small"
              disabled={busy || index === total - 1}
              onClick={() => void onMove(1)}
              type="button"
            >
              ↓ {locale === "zh" ? "下移" : "Down"}
            </button>
          </div>
        </div>
      </div>
      <div className="builder-settings-actions">
        <button
          className="button button-wide"
          disabled={busy || !labelZh.trim() || !labelEn.trim()}
          onClick={() =>
            void onSave({
              labelZh: labelZh.trim(),
              labelEn: labelEn.trim(),
              helpTextZh: helpTextZh.trim() || null,
              helpTextEn: helpTextEn.trim() || null,
              configuration: {
                ...section.configuration,
                step,
                visibilityConditions,
              },
            })
          }
          type="button"
        >
          {locale === "zh" ? "保存章节" : "Save section"}
        </button>
        <div className="row builder-secondary-actions">
          <button
            className="button button-secondary button-small"
            disabled={busy}
            onClick={() => void onDuplicate()}
            type="button"
          >
            {locale === "zh" ? "复制" : "Duplicate"}
          </button>
          <button
            className="button button-danger button-small"
            disabled={busy}
            onClick={() => {
              const message =
                locale === "zh"
                  ? `删除此章节？其中 ${fieldCount} 道题也会删除。`
                  : `Delete this section and its ${fieldCount} fields?`;
              if (confirm(message)) void onDelete();
            }}
            type="button"
          >
            {locale === "zh" ? "删除" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
