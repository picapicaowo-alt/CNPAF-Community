"use client";

import { useEffect, useState } from "react";
import type {
  FormBranchRule,
  FormControlKind,
  FormVisibilityCondition,
  RuntimeFormField,
  RuntimeFormOption,
  RuntimeFormSection,
  RuntimeRegistryItem,
} from "@cnpaf/shared";
import {
  formFieldValidationError,
  formRatingValues,
  parseFormBranchRules,
  parseFormVisibilityConditions,
} from "@cnpaf/shared";
import { BranchRulesEditor } from "./BranchRulesEditor";
import { VisibilityRulesEditor } from "./VisibilityRulesEditor";

type Props = {
  allFields: RuntimeFormField[];
  allOptions: RuntimeFormOption[];
  busy: boolean;
  control: FormControlKind;
  controls: Map<string, FormControlKind>;
  field: RuntimeFormField;
  fieldTypes: RuntimeRegistryItem[];
  index: number;
  locale: "zh" | "en";
  onAddOption: (body: { labelEn: string; labelZh: string }) => Promise<boolean>;
  onArchiveOption: (optionId: string) => Promise<void>;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onMove: (direction: -1 | 1) => Promise<void>;
  onMoveOption: (optionId: string, direction: -1 | 1) => Promise<void>;
  onPreviewChange: (body: Partial<RuntimeFormField>) => void;
  onSave: (
    body: Partial<RuntimeFormField> & { templateSectionId?: string },
  ) => Promise<void>;
  onSaveOption: (
    optionId: string,
    body: Partial<RuntimeFormOption>,
  ) => Promise<void>;
  options: RuntimeFormOption[];
  sections: RuntimeFormSection[];
  total: number;
};

export function FieldSettingsPanel({
  allFields,
  allOptions,
  busy,
  control,
  controls,
  field,
  fieldTypes,
  index,
  locale,
  onAddOption,
  onArchiveOption,
  onClose,
  onDelete,
  onDuplicate,
  onMove,
  onMoveOption,
  onPreviewChange,
  onSave,
  onSaveOption,
  options,
  sections,
  total,
}: Props) {
  const [labelZh, setLabelZh] = useState(field.labelZh);
  const [labelEn, setLabelEn] = useState(field.labelEn);
  const [key, setKey] = useState(field.key);
  const [fieldTypeKey, setFieldTypeKey] = useState(field.fieldTypeKey);
  const [sectionId, setSectionId] = useState(field.templateSectionId);
  const [helpTextZh, setHelpTextZh] = useState(field.helpTextZh ?? "");
  const [helpTextEn, setHelpTextEn] = useState(field.helpTextEn ?? "");
  const [placeholderZh, setPlaceholderZh] = useState(field.placeholderZh ?? "");
  const [placeholderEn, setPlaceholderEn] = useState(field.placeholderEn ?? "");
  const [required, setRequired] = useState(field.required);
  const [allowMissingReason, setAllowMissingReason] = useState(
    field.allowMissingReason,
  );
  const [allowCustomEntry, setAllowCustomEntry] = useState(
    field.allowCustomEntry,
  );
  const [min, setMin] = useState(
    validationString(field.validation.min) || (control === "rating" ? "1" : ""),
  );
  const [max, setMax] = useState(
    validationString(field.validation.max) || (control === "rating" ? "5" : ""),
  );
  const [minLength, setMinLength] = useState(
    validationString(field.validation.minLength),
  );
  const [maxLength, setMaxLength] = useState(
    validationString(field.validation.maxLength),
  );
  const [integer, setInteger] = useState(field.validation.integer === true);
  const [newOptionEn, setNewOptionEn] = useState("");
  const [newOptionZh, setNewOptionZh] = useState("");
  const [visibilityConditions, setVisibilityConditions] = useState<
    FormVisibilityCondition[]
  >(parseFormVisibilityConditions(field.visibilityConditions));
  const [branchingLogic, setBranchingLogic] = useState<FormBranchRule[]>(
    parseFormBranchRules(field.branchingLogic),
  );

  const selectedControl = controls.get(fieldTypeKey) ?? control;
  const choiceField =
    selectedControl === "single" ||
    selectedControl === "multi" ||
    selectedControl === "dropdown";
  const displayField = selectedControl === "display";
  const currentSectionIndex = sections.findIndex(
    (section) => section.id === sectionId,
  );
  const laterSections =
    currentSectionIndex >= 0 ? sections.slice(currentSectionIndex + 1) : [];
  const currentValidation = validationFor({
    control: selectedControl,
    integer,
    max,
    maxLength,
    min,
    minLength,
  });
  const validationError = formFieldValidationError(
    selectedControl,
    currentValidation,
  );
  const ratingValues =
    selectedControl === "rating" ? formRatingValues(currentValidation) : [];

  async function addOption() {
    if (!newOptionZh.trim() || !newOptionEn.trim()) return;
    const created = await onAddOption({
      labelZh: newOptionZh.trim(),
      labelEn: newOptionEn.trim(),
    });
    if (!created) return;
    setNewOptionZh("");
    setNewOptionEn("");
  }

  function changeFieldType(nextFieldTypeKey: string) {
    const nextControl = controls.get(nextFieldTypeKey) ?? "text";
    setFieldTypeKey(nextFieldTypeKey);
    if (nextControl === "rating") {
      setMin((value) => value || "1");
      setMax((value) => value || "5");
      setInteger(true);
    }
  }

  useEffect(() => {
    onPreviewChange({
      fieldTypeKey,
      labelZh,
      labelEn,
      helpTextZh: helpTextZh || null,
      helpTextEn: helpTextEn || null,
      placeholderZh: placeholderZh || null,
      placeholderEn: placeholderEn || null,
      required: !displayField && required,
      allowMissingReason: !displayField && allowMissingReason,
      allowCustomEntry: choiceField && allowCustomEntry,
      validation: validationFor({
        control: selectedControl,
        integer,
        max,
        maxLength,
        min,
        minLength,
      }),
      visibilityConditions,
      branchingLogic,
    });
  }, [
    allowCustomEntry,
    allowMissingReason,
    branchingLogic,
    choiceField,
    displayField,
    fieldTypeKey,
    helpTextEn,
    helpTextZh,
    integer,
    labelEn,
    labelZh,
    max,
    maxLength,
    min,
    minLength,
    onPreviewChange,
    placeholderEn,
    placeholderZh,
    required,
    selectedControl,
    visibilityConditions,
  ]);

  return (
    <div className="card builder-settings-panel">
      <div className="builder-settings-header">
        <div>
          <div className="eyebrow">{field.key}</div>
          <h2>{locale === "zh" ? "题目设置" : "Field settings"}</h2>
          <p className="caption">
            {locale === "zh"
              ? "输入时即可在左侧查看成品效果"
              : "See changes in the live preview as you type"}
          </p>
        </div>
        <button
          aria-label={locale === "zh" ? "收起题目设置" : "Close field settings"}
          className="builder-settings-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <div className="builder-settings-scroll stack-sm">
        <details className="settings-accordion">
          <summary>
            <span>{locale === "zh" ? "题目基本信息" : "Question details"}</span>
            <span className="caption builder-question-summary">
              {locale === "zh" ? labelZh : labelEn}
            </span>
          </summary>
          <div className="settings-accordion-body form-grid">
            <label>
              中文题目
              <input
                value={labelZh}
                onChange={(event) => setLabelZh(event.target.value)}
              />
            </label>
            <label>
              English question
              <input
                value={labelEn}
                onChange={(event) => setLabelEn(event.target.value)}
              />
            </label>
            <label>
              {locale === "zh" ? "题型" : "Field type"}
              <select
                value={fieldTypeKey}
                onChange={(event) => changeFieldType(event.target.value)}
              >
                {fieldTypes.map((item) => (
                  <option key={item.key} value={item.key}>
                    {locale === "zh" ? item.labelZh : item.labelEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {locale === "zh" ? "所在章节" : "Section"}
              <select
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {locale === "zh" ? section.labelZh : section.labelEn}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
        <details className="settings-accordion">
          <summary>
            <span>{locale === "zh" ? "说明与占位文字" : "Help and placeholder"}</span>
            <span className="caption">
              {helpTextZh || helpTextEn || placeholderZh || placeholderEn
                ? locale === "zh"
                  ? "已设置"
                  : "Configured"
                : locale === "zh"
                  ? "未设置"
                  : "Not set"}
            </span>
          </summary>
          <div className="settings-accordion-body form-grid">
            <label>
              中文帮助文字
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
            <label>
              中文占位文字
              <input
                value={placeholderZh}
                onChange={(event) => setPlaceholderZh(event.target.value)}
              />
            </label>
            <label>
              English placeholder
              <input
                value={placeholderEn}
                onChange={(event) => setPlaceholderEn(event.target.value)}
              />
            </label>
          </div>
        </details>
        {!displayField ? (
          <details className="settings-accordion">
            <summary>
              <span>{locale === "zh" ? "作答设置" : "Response settings"}</span>
              <span className="caption">
                {required
                  ? locale === "zh"
                    ? "必答"
                    : "Required"
                  : locale === "zh"
                    ? "选答"
                    : "Optional"}
              </span>
            </summary>
            <div className="settings-accordion-body stack-sm">
              <p className="caption builder-settings-disclosure-copy">
                {locale === "zh"
                  ? "设置是否必答、允许的输入范围与特殊回答。"
                  : "Set requirements, accepted values, and special responses."}
              </p>
              <div className="builder-choice-grid">
                <label className="choice">
                  <input
                    checked={required}
                    onChange={(event) => setRequired(event.target.checked)}
                    type="checkbox"
                  />
                  <span>{locale === "zh" ? "必须回答本题" : "Require an answer"}</span>
                </label>
                <label className="choice">
                  <input
                    checked={allowMissingReason}
                    onChange={(event) =>
                      setAllowMissingReason(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    {locale === "zh"
                      ? "允许选择“无法记录的原因”"
                      : "Allow a reason instead of an answer"}
                  </span>
                </label>
                {choiceField ? (
                  <label className="choice">
                    <input
                      checked={allowCustomEntry}
                      onChange={(event) =>
                        setAllowCustomEntry(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>
                      {locale === "zh"
                        ? "增加“其他（请说明）”"
                        : "Add an Other response"}
                    </span>
                  </label>
                ) : null}
              </div>
              {selectedControl === "rating" ? (
              <div className="builder-rating-settings stack-sm">
                <div className="row-between">
                  <div>
                    <h3>{locale === "zh" ? "评分范围" : "Rating scale"}</h3>
                    <p className="caption">
                      {locale === "zh"
                        ? "输入起始与结束分值，系统会自动生成完整量表。"
                        : "Enter the first and last score to generate the scale."}
                    </p>
                  </div>
                  <div className="builder-rating-presets">
                    <button
                      className="button button-secondary button-small"
                      onClick={() => {
                        setMin("1");
                        setMax("5");
                      }}
                      type="button"
                    >
                      1–5
                    </button>
                    <button
                      className="button button-secondary button-small"
                      onClick={() => {
                        setMin("1");
                        setMax("10");
                      }}
                      type="button"
                    >
                      1–10
                    </button>
                  </div>
                </div>
                <div className="builder-range-grid">
                  <label>
                    {locale === "zh" ? "起始分值" : "First score"}
                    <input
                      max={20}
                      min={0}
                      onChange={(event) => setMin(event.target.value)}
                      step={1}
                      type="number"
                      value={min}
                    />
                  </label>
                  <span aria-hidden="true" className="builder-range-arrow">
                    →
                  </span>
                  <label>
                    {locale === "zh" ? "结束分值" : "Last score"}
                    <input
                      max={20}
                      min={0}
                      onChange={(event) => setMax(event.target.value)}
                      step={1}
                      type="number"
                      value={max}
                    />
                  </label>
                </div>
                {validationError ? (
                  <p className="builder-validation-error" role="alert">
                    {localizedValidationError(validationError, locale)}
                  </p>
                ) : (
                  <div className="builder-rating-preview" aria-label={locale === "zh" ? "评分量表预览" : "Rating scale preview"}>
                    {ratingValues.map((rating) => (
                      <span key={rating}>{rating}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : selectedControl === "number" ? (
              <div className="form-grid">
                <label>
                  {locale === "zh" ? "最小值" : "Minimum"}
                  <input
                    onChange={(event) => setMin(event.target.value)}
                    type="number"
                    value={min}
                  />
                </label>
                <label>
                  {locale === "zh" ? "最大值" : "Maximum"}
                  <input
                    onChange={(event) => setMax(event.target.value)}
                    type="number"
                    value={max}
                  />
                </label>
                <label className="choice field-full">
                  <input
                    checked={integer}
                    onChange={(event) => setInteger(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    {locale === "zh" ? "只允许整数" : "Whole numbers only"}
                  </span>
                </label>
                {validationError ? (
                  <p className="builder-validation-error field-full" role="alert">
                    {localizedValidationError(validationError, locale)}
                  </p>
                ) : null}
              </div>
            ) : selectedControl === "text" || selectedControl === "textarea" ? (
              <div className="form-grid">
                <label>
                  {locale === "zh" ? "最短字数" : "Minimum length"}
                  <input
                    min={0}
                    onChange={(event) => setMinLength(event.target.value)}
                    step={1}
                    type="number"
                    value={minLength}
                  />
                </label>
                <label>
                  {locale === "zh" ? "最长字数" : "Maximum length"}
                  <input
                    min={0}
                    onChange={(event) => setMaxLength(event.target.value)}
                    step={1}
                    type="number"
                    value={maxLength}
                  />
                </label>
                {validationError ? (
                  <p className="builder-validation-error field-full" role="alert">
                    {localizedValidationError(validationError, locale)}
                  </p>
                ) : null}
              </div>
              ) : null}
            </div>
          </details>
        ) : (
          <div className="builder-info-note">
            <strong>{locale === "zh" ? "信息说明题" : "Information-only field"}</strong>
            <span>
              {locale === "zh"
                ? "该题只展示内容，不需要填写答案。"
                : "This field displays content and does not collect an answer."}
            </span>
          </div>
        )}
        {choiceField ? (
          <details className="settings-accordion builder-options-disclosure">
            <summary>
              <span>{locale === "zh" ? "答案选项" : "Answer options"}</span>
              <span className="caption">
                {locale === "zh" ? `${options.length} 项` : `${options.length} option(s)`}
              </span>
            </summary>
            <div className="settings-accordion-body stack-sm">
              <p className="caption builder-settings-disclosure-copy">
                {locale === "zh"
                  ? "这些选项会按当前顺序显示在单选、多选或下拉菜单中。点击标题可随时收起。"
                  : "These choices appear in the current order. Select the heading again to collapse this section."}
              </p>
              {options.length ? (
                <div className="stack-sm builder-options-list">
                  {options.map((option, optionIndex) => (
                    <OptionEditorRow
                      busy={busy}
                      index={optionIndex}
                      key={option.id}
                      locale={locale}
                      onArchive={() => onArchiveOption(option.id)}
                      onMove={(direction) => onMoveOption(option.id, direction)}
                      onSave={(body) => onSaveOption(option.id, body)}
                      option={option}
                      total={options.length}
                    />
                  ))}
                </div>
              ) : (
                <div className="builder-options-empty">
                  {locale === "zh"
                    ? "尚未添加选项。至少添加 1 项后才能发布表单。"
                    : "No options yet. Add at least one before publishing."}
                </div>
              )}
              <div className="builder-option-create stack-sm">
                <h4>{locale === "zh" ? "添加新选项" : "Add an option"}</h4>
                <div className="form-grid">
                  <label>
                    {locale === "zh" ? "中文选项" : "Chinese translation"}
                    <input
                      onChange={(event) => setNewOptionZh(event.target.value)}
                      value={newOptionZh}
                    />
                  </label>
                  <label>
                    {locale === "zh" ? "英文选项" : "English option"}
                    <input
                      onChange={(event) => setNewOptionEn(event.target.value)}
                      value={newOptionEn}
                    />
                  </label>
                </div>
                <button
                  className="button button-secondary button-small button-wide"
                  disabled={busy || !newOptionZh.trim() || !newOptionEn.trim()}
                  onClick={() => void addOption()}
                  type="button"
                >
                  {locale === "zh" ? "添加选项" : "Add option"}
                </button>
              </div>
            </div>
          </details>
        ) : null}
        <details className="settings-accordion">
          <summary>
            <span>{locale === "zh" ? "何时显示本题" : "When this field appears"}</span>
            <span className="caption">
              {visibilityConditions.length
                ? locale === "zh"
                  ? `${visibilityConditions.length} 条显示条件`
                  : `${visibilityConditions.length} condition(s)`
                : locale === "zh"
                  ? "始终显示"
                  : "Always visible"}
            </span>
          </summary>
          <div className="settings-accordion-body stack-sm">
            <div className="builder-logic-explainer">
              <strong>{locale === "zh" ? "作答前判断" : "Checked before answering"}</strong>
              <span>
                {locale === "zh"
                  ? "只决定本题是否出现；所有条件都满足时才显示。"
                  : "Controls whether this field appears; every condition must pass."}
              </span>
            </div>
            <VisibilityRulesEditor
              availableFields={allFields}
              conditions={visibilityConditions}
              controls={controls}
              locale={locale}
              onChange={setVisibilityConditions}
              options={allOptions}
              showIntro={false}
            />
          </div>
        </details>
        {!displayField ? (
          <details className="settings-accordion">
            <summary>
              <span>{locale === "zh" ? "回答后去哪里" : "Where to go after answering"}</span>
              <span className="caption">
                {branchingLogic.length
                  ? locale === "zh"
                    ? `${branchingLogic.length} 条跳转规则`
                    : `${branchingLogic.length} branch rule(s)`
                  : locale === "zh"
                    ? "按顺序继续"
                    : "Continue in order"}
              </span>
            </summary>
            <div className="settings-accordion-body stack-sm">
              <div className="builder-logic-explainer">
                <strong>{locale === "zh" ? "作答后判断" : "Checked after answering"}</strong>
                <span>
                  {locale === "zh"
                    ? "不决定本题是否显示；首条命中的规则会跳到后续章节或进入提交检查。"
                    : "Does not control visibility; the first match jumps forward or opens review."}
                </span>
              </div>
              <BranchRulesEditor
                control={selectedControl}
                field={field}
                laterSections={laterSections}
                locale={locale}
                onChange={setBranchingLogic}
                options={options}
                rules={branchingLogic}
                showIntro={false}
              />
            </div>
          </details>
        ) : null}
        <details className="settings-accordion">
          <summary>
            <span>{locale === "zh" ? "系统字段 ID" : "System field ID"}</span>
            <span className="caption builder-key-summary">{key}</span>
          </summary>
          <div className="settings-accordion-body stack-sm">
            <div className="builder-info-note">
              <strong>{locale === "zh" ? "通常无需修改" : "Usually leave this unchanged"}</strong>
              <span>
                {locale === "zh"
                  ? "该 ID 用于导出列名、显示条件、跳转规则和版本比较。修改后，已有规则或数据对应可能失效。"
                  : "Used in exports, conditions, branching, and version comparison. Changing it can break existing references."}
              </span>
            </div>
            <label>
              {locale === "zh" ? "唯一字段 ID" : "Unique field ID"}
              <input
                className="builder-key-input"
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
            </label>
          </div>
        </details>
        <div className="builder-order-controls">
          <span className="caption">
            {locale === "zh"
              ? `第 ${index + 1} / ${total} 题`
              : `Field ${index + 1} of ${total}`}
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
          disabled={
            busy ||
            !labelZh.trim() ||
            !labelEn.trim() ||
            !key.trim() ||
            Boolean(validationError)
          }
          onClick={() =>
            void onSave({
              key: key.trim(),
              fieldTypeKey,
              templateSectionId: sectionId,
              labelZh: labelZh.trim(),
              labelEn: labelEn.trim(),
              helpTextZh: helpTextZh.trim() || null,
              helpTextEn: helpTextEn.trim() || null,
              placeholderZh: placeholderZh.trim() || null,
              placeholderEn: placeholderEn.trim() || null,
              required: !displayField && required,
              allowMissingReason: !displayField && allowMissingReason,
              allowCustomEntry: choiceField && allowCustomEntry,
              validation: currentValidation,
              visibilityConditions,
              branchingLogic,
            })
          }
          type="button"
        >
          {locale === "zh" ? "保存题目" : "Save field"}
        </button>
        <div className="row builder-secondary-actions">
          <button className="button button-secondary button-small" disabled={busy} onClick={() => void onDuplicate()} type="button">
            {locale === "zh" ? "复制题目" : "Duplicate field"}
          </button>
          <button
            className="button button-danger button-small"
            disabled={busy}
            onClick={() => {
              if (confirm(locale === "zh" ? "删除此题及其选项？" : "Delete this field and its options?")) void onDelete();
            }}
            type="button"
          >
            {locale === "zh" ? "删除题目" : "Delete field"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OptionEditorRow({
  busy,
  index,
  locale,
  onArchive,
  onMove,
  onSave,
  option,
  total,
}: {
  busy: boolean;
  index: number;
  locale: "zh" | "en";
  onArchive: () => Promise<void>;
  onMove: (direction: -1 | 1) => Promise<void>;
  onSave: (body: Partial<RuntimeFormOption>) => Promise<void>;
  option: RuntimeFormOption;
  total: number;
}) {
  const [labelZh, setLabelZh] = useState(option.labelZh);
  const [labelEn, setLabelEn] = useState(option.labelEn);

  useEffect(() => {
    setLabelZh(option.labelZh);
    setLabelEn(option.labelEn);
  }, [option]);

  return (
    <div className="editor-option-row">
      <input aria-label="中文选项" value={labelZh} onChange={(event) => setLabelZh(event.target.value)} />
      <input aria-label="English option" value={labelEn} onChange={(event) => setLabelEn(event.target.value)} />
      <button className="button button-secondary button-small" disabled={busy || index === 0} onClick={() => void onMove(-1)} type="button">↑</button>
      <button className="button button-secondary button-small" disabled={busy || index === total - 1} onClick={() => void onMove(1)} type="button">↓</button>
      <button className="button button-secondary button-small" disabled={busy || !labelZh.trim() || !labelEn.trim()} onClick={() => void onSave({ labelZh: labelZh.trim(), labelEn: labelEn.trim() })} type="button">
        {locale === "zh" ? "保存" : "Save"}
      </button>
      <button
        className="button button-danger button-small"
        disabled={busy}
        onClick={() => {
          if (
            confirm(
              locale === "zh"
                ? "归档此选项？已发布的历史数据不会被删除。"
                : "Archive this option? Published historical data will remain.",
            )
          )
            void onArchive();
        }}
        type="button"
      >
        {locale === "zh" ? "归档" : "Archive"}
      </button>
    </div>
  );
}

function validationString(value: unknown) {
  return typeof value === "number" ? String(value) : "";
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validationFor({
  control,
  integer,
  max,
  maxLength,
  min,
  minLength,
}: {
  control: FormControlKind;
  integer: boolean;
  max: string;
  maxLength: string;
  min: string;
  minLength: string;
}) {
  if (control === "number" || control === "rating")
    return {
      min: optionalNumber(min) ?? (control === "rating" ? 1 : undefined),
      max: optionalNumber(max) ?? (control === "rating" ? 5 : undefined),
      integer: control === "rating" ? true : integer,
    };
  if (control === "text" || control === "textarea")
    return {
      minLength: optionalNumber(minLength),
      maxLength: optionalNumber(maxLength),
    };
  return {};
}

function localizedValidationError(error: string, locale: "zh" | "en") {
  if (locale === "en") return error;
  const messages: Record<string, string> = {
    "Rating limits must be finite numbers": "评分的起始值和结束值必须是有效数字。",
    "Rating limits must be whole numbers": "评分的起始值和结束值必须是整数。",
    "Rating minimum cannot be below 0": "评分起始值不能小于 0。",
    "Rating maximum cannot exceed 20": "评分结束值不能大于 20。",
    "Rating minimum cannot exceed its maximum": "评分起始值不能大于结束值。",
    "A rating scale can contain at most 20 values": "一个评分量表最多可包含 20 个分值。",
    "Number limits must be finite numbers": "最小值和最大值必须是有效数字。",
    "Minimum cannot exceed maximum": "最小值不能大于最大值。",
    "Text length limits must be finite numbers": "字数限制必须是有效数字。",
    "Text length limits must be non-negative whole numbers": "字数限制必须是大于或等于 0 的整数。",
    "Minimum text length cannot exceed maximum text length": "最短字数不能大于最长字数。",
  };
  return messages[error] ?? error;
}
