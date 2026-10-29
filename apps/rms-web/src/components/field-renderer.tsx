"use client";

import { useCallback, useMemo } from "react";
import type { FormDescriptorField } from "@/lib/rms-api";
import { lookupMasterData, lookupValueSetOptions } from "@/lib/rms-api";
import { SearchableSelect } from "@/components/searchable-select";
import styles from "../app/page.module.css";

export type FieldValueState = {
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueTimestamp?: string | null;
  valueOptionId?: string | null;
};

type FieldRendererProps = {
  tenantId: string;
  field: FormDescriptorField;
  value: FieldValueState;
  onChange: (next: FieldValueState) => void;
  disabled?: boolean;
};

function inferRenderHint(field: FormDescriptorField): string {
  const dataType = (field.dataType ?? "text").toLowerCase();
  const key = field.fieldKey.toLowerCase();
  if (key.includes("personnel") || key.includes("person")) return "personnel_lookup";
  if (key.includes("unit")) return "unit_lookup";
  if (key.includes("apparatus")) return "apparatus_lookup";
  if (key.includes("occupancy")) return "occupancy_lookup";
  if (field.valueSetLocation) return "searchable_select";
  if (dataType.includes("bool")) return "boolean";
  if (dataType.includes("number") || dataType.includes("integer") || dataType.includes("decimal")) {
    return "number";
  }
  if (
    dataType.includes("timestamp") ||
    dataType.includes("datetime") ||
    dataType.includes("date")
  ) {
    return "timestamp";
  }
  return "text";
}

function LookupField({
  tenantId,
  field,
  kind,
  valueSetLocation,
  value,
  onChange,
  disabled,
}: {
  tenantId: string;
  field: FormDescriptorField;
  kind: "personnel" | "units" | "apparatus" | "occupancies" | "value_set";
  valueSetLocation?: string | null;
  value: FieldValueState;
  onChange: (next: FieldValueState) => void;
  disabled?: boolean;
}) {
  const label = field.displayLabel || field.definition;
  const selectedId = kind === "value_set" ? value.valueOptionId : value.valueText;

  const onSearch = useCallback(
    async (query: string) => {
      if (kind === "value_set" && valueSetLocation) {
        return lookupValueSetOptions(tenantId, valueSetLocation, query);
      }
      if (kind !== "value_set") {
        return lookupMasterData(tenantId, kind, query);
      }
      return [];
    },
    [tenantId, kind, valueSetLocation],
  );

  return (
    <SearchableSelect
      id={field.fieldId}
      label={`${label}${field.required ? " *" : ""}`}
      selected={selectedId ? { id: selectedId, label: selectedId.slice(0, 8) + "…" } : null}
      onSearch={onSearch}
      onSelect={(option) => {
        if (kind === "value_set") {
          onChange({ valueOptionId: option.id });
        } else {
          onChange({ valueText: option.id });
        }
      }}
      onClear={() => {
        if (kind === "value_set") {
          onChange({ valueOptionId: null });
        } else {
          onChange({ valueText: null });
        }
      }}
      {...(disabled ? { disabled: true } : {})}
      {...(field.helpText ? { helpText: field.helpText } : {})}
      required={field.required}
    />
  );
}

export function FieldRenderer({ tenantId, field, value, onChange, disabled }: FieldRendererProps) {
  const hint = useMemo(() => inferRenderHint(field), [field]);
  const label = field.displayLabel || field.definition;

  if (hint === "boolean") {
    return (
      <div className={styles.formRow}>
        <label htmlFor={field.fieldId}>
          <input
            id={field.fieldId}
            type="checkbox"
            checked={Boolean(value.valueBoolean)}
            disabled={disabled}
            onChange={(event) => onChange({ valueBoolean: event.target.checked })}
          />{" "}
          {label}
          {field.required ? " *" : ""}
        </label>
        {field.helpText ? <p className={styles.fieldHelp}>{field.helpText}</p> : null}
      </div>
    );
  }

  if (hint === "number") {
    return (
      <div className={styles.formRow}>
        <label htmlFor={field.fieldId}>
          {label}
          {field.required ? " *" : ""}
        </label>
        <input
          id={field.fieldId}
          type="number"
          disabled={disabled}
          value={value.valueNumber ?? ""}
          onChange={(event) =>
            onChange({
              valueNumber: event.target.value === "" ? null : Number(event.target.value),
            })
          }
        />
        {field.helpText ? <p className={styles.fieldHelp}>{field.helpText}</p> : null}
      </div>
    );
  }

  if (hint === "timestamp") {
    return (
      <div className={styles.formRow}>
        <label htmlFor={field.fieldId}>
          {label}
          {field.required ? " *" : ""}
        </label>
        <input
          id={field.fieldId}
          type="datetime-local"
          disabled={disabled}
          value={value.valueTimestamp ? value.valueTimestamp.slice(0, 16) : ""}
          onChange={(event) =>
            onChange({
              valueTimestamp: event.target.value
                ? new Date(event.target.value).toISOString()
                : null,
            })
          }
        />
        {field.helpText ? <p className={styles.fieldHelp}>{field.helpText}</p> : null}
      </div>
    );
  }

  if (hint === "searchable_select") {
    return (
      <LookupField
        tenantId={tenantId}
        field={field}
        kind="value_set"
        valueSetLocation={field.valueSetLocation ?? null}
        value={value}
        onChange={onChange}
        {...(disabled ? { disabled: true } : {})}
      />
    );
  }

  if (hint === "personnel_lookup") {
    return (
      <LookupField
        tenantId={tenantId}
        field={field}
        kind="personnel"
        value={value}
        onChange={onChange}
        {...(disabled ? { disabled: true } : {})}
      />
    );
  }

  if (hint === "unit_lookup") {
    return (
      <LookupField
        tenantId={tenantId}
        field={field}
        kind="units"
        value={value}
        onChange={onChange}
        {...(disabled ? { disabled: true } : {})}
      />
    );
  }

  if (hint === "apparatus_lookup") {
    return (
      <LookupField
        tenantId={tenantId}
        field={field}
        kind="apparatus"
        value={value}
        onChange={onChange}
        {...(disabled ? { disabled: true } : {})}
      />
    );
  }

  if (hint === "occupancy_lookup") {
    return (
      <LookupField
        tenantId={tenantId}
        field={field}
        kind="occupancies"
        value={value}
        onChange={onChange}
        {...(disabled ? { disabled: true } : {})}
      />
    );
  }

  return (
    <div className={styles.formRow}>
      <label htmlFor={field.fieldId}>
        {label}
        {field.required ? " *" : ""}
      </label>
      <input
        id={field.fieldId}
        type="text"
        disabled={disabled}
        value={value.valueText ?? ""}
        onChange={(event) => onChange({ valueText: event.target.value })}
      />
      {field.helpText ? <p className={styles.fieldHelp}>{field.helpText}</p> : null}
    </div>
  );
}

export function SectionFieldGrid({
  tenantId,
  fields,
  values,
  onFieldChange,
  disabled,
}: {
  tenantId: string;
  fields: FormDescriptorField[];
  values: Record<string, FieldValueState>;
  onFieldChange: (fieldId: string, fieldKey: string, next: FieldValueState) => void;
  disabled?: boolean;
}) {
  const sorted = [...fields].sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    <div className={styles.fieldGrid}>
      {sorted.map((field) => (
        <FieldRenderer
          key={field.fieldId}
          tenantId={tenantId}
          field={field}
          disabled={Boolean(disabled)}
          value={values[field.fieldId] ?? {}}
          onChange={(next) => onFieldChange(field.fieldId, field.fieldKey, next)}
        />
      ))}
    </div>
  );
}
