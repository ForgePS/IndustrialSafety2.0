"use client";

import type { ReactNode } from "react";
import { FxRequiredIndicator } from "./FxRequiredIndicator";
import { FxHelpText } from "./FxHelpText";
import { FxFieldHint } from "./FxFieldHint";
import { FxInlineError } from "./FxInlineError";

export type FxFieldTone = "default" | "warning" | "success" | "error";

export type FxFieldChromeProps = {
  id: string;
  label: string;
  description?: string;
  helpText?: string;
  hint?: string;
  required?: boolean;
  error?: string;
  warning?: string;
  success?: string;
  disabled?: boolean;
  readOnly?: boolean;
  children: ReactNode;
};

export function FxField(props: FxFieldChromeProps) {
  const { id, label, description, helpText, hint, required, error, warning, success, children } =
    props;

  const hintId = hint || description || helpText ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const warningId = !error && warning ? `${id}-warning` : undefined;
  const successId = !error && !warning && success ? `${id}-success` : undefined;
  const describedBy =
    [hintId, errorId, warningId, successId].filter(Boolean).join(" ") || undefined;

  return (
    <div
      className={[
        "rms-fx-field",
        error ? "rms-fx-field--error" : "",
        !error && warning ? "rms-fx-field--warning" : "",
        !error && !warning && success ? "rms-fx-field--success" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-disabled={props.disabled ? "true" : undefined}
      data-readonly={props.readOnly ? "true" : undefined}
    >
      <label className="rms-fx-field__label" htmlFor={id}>
        {label}
        {required ? <FxRequiredIndicator /> : null}
      </label>
      {description ? <FxHelpText id={`${id}-desc`}>{description}</FxHelpText> : null}
      <div className="rms-fx-field__control" data-describedby={describedBy}>
        {children}
      </div>
      {hint && !error ? <FxFieldHint id={hintId!}>{hint}</FxFieldHint> : null}
      {helpText && !hint && !error ? <FxHelpText id={hintId!}>{helpText}</FxHelpText> : null}
      {error ? <FxInlineError id={errorId!}>{error}</FxInlineError> : null}
      {!error && warning ? (
        <span id={warningId} className="rms-fx-field__warning" role="status">
          {warning}
        </span>
      ) : null}
      {!error && !warning && success ? (
        <span id={successId} className="rms-fx-field__success" role="status">
          {success}
        </span>
      ) : null}
    </div>
  );
}

export function fieldAriaProps(props: {
  id: string;
  error?: string;
  hint?: string;
  description?: string;
  helpText?: string;
  warning?: string;
  success?: string;
}) {
  const hintId = props.hint || props.description || props.helpText ? `${props.id}-hint` : undefined;
  const errorId = props.error ? `${props.id}-error` : undefined;
  const warningId = !props.error && props.warning ? `${props.id}-warning` : undefined;
  const successId =
    !props.error && !props.warning && props.success ? `${props.id}-success` : undefined;
  return {
    "aria-invalid": Boolean(props.error) || undefined,
    "aria-describedby":
      [hintId, errorId, warningId, successId].filter(Boolean).join(" ") || undefined,
  } as const;
}
