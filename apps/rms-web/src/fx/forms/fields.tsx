"use client";

import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { FxField, fieldAriaProps, type FxFieldChromeProps } from "./FxField";

type Chrome = Omit<FxFieldChromeProps, "children">;

function pickChrome(props: Chrome): Chrome {
  const out: Chrome = { id: props.id, label: props.label };
  if (props.description !== undefined) out.description = props.description;
  if (props.helpText !== undefined) out.helpText = props.helpText;
  if (props.hint !== undefined) out.hint = props.hint;
  if (props.required !== undefined) out.required = props.required;
  if (props.error !== undefined) out.error = props.error;
  if (props.warning !== undefined) out.warning = props.warning;
  if (props.success !== undefined) out.success = props.success;
  if (props.disabled !== undefined) out.disabled = props.disabled;
  if (props.readOnly !== undefined) out.readOnly = props.readOnly;
  return out;
}

function pickAria(props: {
  id: string;
  error?: string | undefined;
  hint?: string | undefined;
  description?: string | undefined;
  helpText?: string | undefined;
  warning?: string | undefined;
  success?: string | undefined;
}) {
  const args: Parameters<typeof fieldAriaProps>[0] = { id: props.id };
  if (props.error !== undefined) args.error = props.error;
  if (props.hint !== undefined) args.hint = props.hint;
  if (props.description !== undefined) args.description = props.description;
  if (props.helpText !== undefined) args.helpText = props.helpText;
  if (props.warning !== undefined) args.warning = props.warning;
  if (props.success !== undefined) args.success = props.success;
  return fieldAriaProps(args);
}

export function FxTextField(props: Chrome & InputHTMLAttributes<HTMLInputElement>) {
  const chrome = pickChrome(props);
  const {
    id,
    label: _label,
    description: _d,
    helpText: _h,
    hint: _hint,
    required,
    error,
    warning,
    success,
    disabled,
    readOnly,
    ...rest
  } = props;
  return (
    <FxField {...chrome}>
      <input
        id={id}
        className="rms-fx-field__input"
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        {...pickAria({
          id,
          error,
          hint: props.hint,
          description: props.description,
          helpText: props.helpText,
          warning,
          success,
        })}
        {...rest}
      />
    </FxField>
  );
}

export function FxTextarea(props: Chrome & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const chrome = pickChrome(props);
  const { id, required, disabled, readOnly, error, warning, success, ...rest } = props;
  return (
    <FxField {...chrome}>
      <textarea
        id={id}
        className="rms-fx-field__input"
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        {...pickAria({
          id,
          error,
          hint: props.hint,
          description: props.description,
          helpText: props.helpText,
          warning,
          success,
        })}
        {...rest}
      />
    </FxField>
  );
}

export function FxNumberField(props: Chrome & InputHTMLAttributes<HTMLInputElement>) {
  return <FxTextField type="number" inputMode="decimal" {...props} />;
}

export function FxDateField(props: Chrome & InputHTMLAttributes<HTMLInputElement>) {
  return <FxTextField type="date" {...props} />;
}

export function FxTimeField(props: Chrome & InputHTMLAttributes<HTMLInputElement>) {
  return <FxTextField type="time" {...props} />;
}

export function FxDateTimeField(props: Chrome & InputHTMLAttributes<HTMLInputElement>) {
  return <FxTextField type="datetime-local" {...props} />;
}

export function FxCheckbox(
  props: Chrome & InputHTMLAttributes<HTMLInputElement> & { checkboxLabel?: string },
) {
  const chrome = pickChrome(props);
  const {
    id,
    required,
    disabled,
    readOnly,
    error,
    warning,
    success,
    checkboxLabel,
    label,
    ...rest
  } = props;
  return (
    <FxField {...chrome}>
      <label className="rms-fx-field__check">
        <input
          id={id}
          type="checkbox"
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          {...pickAria({
            id,
            error,
            hint: props.hint,
            description: props.description,
            helpText: props.helpText,
            warning,
            success,
          })}
          {...rest}
        />
        <span>{checkboxLabel ?? label}</span>
      </label>
    </FxField>
  );
}

export function FxSwitch(props: Chrome & InputHTMLAttributes<HTMLInputElement>) {
  return <FxCheckbox {...props} role="switch" />;
}

export function FxRadioGroup({
  name,
  options,
  value,
  onChange,
  ...chrome
}: Chrome & {
  name: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <FxField {...pickChrome(chrome)}>
      <div
        role="radiogroup"
        aria-labelledby={`${chrome.id}-label`}
        className="rms-fx-field__radios"
      >
        <span id={`${chrome.id}-label`} className="rms-fx-sr-only">
          {chrome.label}
        </span>
        {options.map((opt) => (
          <label key={opt.value} className="rms-fx-field__check">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              disabled={chrome.disabled || opt.disabled}
              onChange={() => onChange?.(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </FxField>
  );
}

export function FxSelect(
  props: Chrome &
    SelectHTMLAttributes<HTMLSelectElement> & {
      options: Array<{ value: string; label: string; disabled?: boolean }>;
    },
) {
  const chrome = pickChrome(props);
  const { id, required, disabled, readOnly, error, warning, success, options, ...rest } = props;
  return (
    <FxField {...chrome}>
      <select
        id={id}
        className="rms-fx-field__input"
        disabled={disabled || readOnly}
        required={required}
        {...pickAria({
          id,
          error,
          hint: props.hint,
          description: props.description,
          helpText: props.helpText,
          warning,
          success,
        })}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </FxField>
  );
}

export function FxSearchSelect(
  props: Chrome &
    InputHTMLAttributes<HTMLInputElement> & {
      listId?: string;
      options?: Array<{ value: string; label: string }>;
    },
) {
  const { options = [], listId, ...rest } = props;
  const datalistId = listId ?? `${props.id}-options`;
  return (
    <>
      <FxTextField {...rest} list={datalistId} autoComplete="off" />
      <datalist id={datalistId}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.label} />
        ))}
      </datalist>
    </>
  );
}

export function FxMultiSelect(
  props: Chrome &
    SelectHTMLAttributes<HTMLSelectElement> & {
      options: Array<{ value: string; label: string; disabled?: boolean }>;
    },
) {
  return <FxSelect multiple {...props} />;
}

export function FxCombobox(props: Parameters<typeof FxSearchSelect>[0]) {
  return <FxSearchSelect {...props} />;
}

export function FxFileUpload(props: Chrome & InputHTMLAttributes<HTMLInputElement>) {
  return <FxTextField type="file" {...props} />;
}

export function FxImageUpload(props: Chrome & InputHTMLAttributes<HTMLInputElement>) {
  return <FxFileUpload accept="image/*" {...props} />;
}

export function FxSignature(props: Chrome & { onClear?: () => void }) {
  const { id, label, disabled, onClear: _onClear, ...rest } = props;
  const chrome = pickChrome({
    id,
    label,
    ...rest,
    ...(disabled !== undefined ? { disabled } : {}),
  });
  return (
    <FxField {...chrome}>
      <canvas
        id={id}
        className="rms-fx-signature"
        width={320}
        height={120}
        aria-label={label}
        data-disabled={disabled ? "true" : undefined}
      />
    </FxField>
  );
}

export function FxColorPicker(props: Chrome & InputHTMLAttributes<HTMLInputElement>) {
  return <FxTextField type="color" {...props} />;
}
