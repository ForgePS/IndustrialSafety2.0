import type { FormField, FormFieldType } from "./forms-module";

export type FormBuilderFieldTypeOption = {
  type: FormFieldType;
  label: string;
  description: string;
  icon: string;
};

/** User-facing field types shown in the form builder. */
export const FORM_BUILDER_FIELD_TYPES: readonly FormBuilderFieldTypeOption[] = [
  {
    type: "text",
    label: "Fill in the blank",
    description: "Short text answer",
    icon: "bx-text",
  },
  {
    type: "textarea",
    label: "Long answer",
    description: "Paragraph or notes",
    icon: "bx-align-left",
  },
  {
    type: "yesno",
    label: "Yes / No / N/A",
    description: "Checklist item with optional notes when No",
    icon: "bx-check-square",
  },
  {
    type: "date",
    label: "Date",
    description: "Calendar date",
    icon: "bx-calendar",
  },
  {
    type: "signature",
    label: "Signature",
    description: "Drawn signature pad",
    icon: "bx-pen",
  },
  {
    type: "checkbox",
    label: "Checkbox",
    description: "Single agree / confirm box",
    icon: "bx-checkbox-checked",
  },
  {
    type: "select",
    label: "Dropdown",
    description: "Pick one option from a list",
    icon: "bx-chevron-down",
  },
  {
    type: "location",
    label: "Location (Dropdown)",
    description: "Company locations from Settings → Dropdowns",
    icon: "bx-map",
  },
  {
    type: "email",
    label: "Email",
    description: "Email address",
    icon: "bx-envelope",
  },
  {
    type: "tel",
    label: "Phone",
    description: "Phone number",
    icon: "bx-phone",
  },
  {
    type: "number",
    label: "Number",
    description: "Numeric value",
    icon: "bx-hash",
  },
  {
    type: "employeeNumber",
    label: "Employee #",
    description: "Links this form to a personnel file by employee number",
    icon: "bx-id-card",
  },
  {
    type: "content",
    label: "Instructions",
    description: "Policy or guidance text (not submitted)",
    icon: "bx-info-circle",
  },
  {
    type: "label",
    label: "Label",
    description: "Group heading to organize questions (not submitted)",
    icon: "bx-heading",
  },
];

const DEFAULT_LABELS: Partial<Record<FormFieldType, string>> = {
  text: "Fill in the blank",
  textarea: "Long answer",
  yesno: "Checklist item",
  date: "Date",
  signature: "Signature",
  checkbox: "I agree",
  select: "Select one",
  location: "Location",
  email: "Email",
  tel: "Phone",
  number: "Number",
  employeeNumber: "Employee #",
  content: "Instructions",
  label: "Section heading",
};

export function formBuilderFieldTypeLabel(type: FormFieldType): string {
  return FORM_BUILDER_FIELD_TYPES.find((row) => row.type === type)?.label ?? type;
}

export function slugifyFormFieldId(label: string, index: number): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base ? `${base}-${index + 1}` : `field-${index + 1}`;
}

export function createFormBuilderField(
  type: FormFieldType,
  index: number,
  label?: string,
): FormField {
  const fieldLabel = label?.trim() || DEFAULT_LABELS[type] || "Field";
  const field: FormField = {
    id:
      type === "employeeNumber"
        ? "employeeNumber"
        : slugifyFormFieldId(fieldLabel, index),
    label: fieldLabel,
    type,
  };
  if (type === "yesno") field.required = true;
  if (type === "select") field.options = ["Option 1", "Option 2"];
  if (type === "content") {
    field.content = "Enter instructions or policy text for the person filling out this form.";
  }
  if (type === "employeeNumber") {
    field.required = true;
  }
  return field;
}

/** Change an existing field's type while keeping label/id and applying type defaults. */
export function changeFormBuilderFieldType(
  field: FormField,
  newType: FormFieldType,
): FormField {
  if (field.type === newType) return field;

  const next: FormField = {
    id: field.id,
    label: field.label,
    type: newType,
  };

  if (newType === "content") {
    next.content =
      field.content ??
      "Enter instructions or policy text for the person filling out this form.";
    return next;
  }

  if (newType === "label") {
    return next;
  }

  if (newType === "location") {
    return next;
  }

  if (newType === "employeeNumber") {
    next.id = field.id === "employeeNumber" || !field.id ? "employeeNumber" : field.id;
    next.required = true;
    return next;
  }

  if (newType === "yesno") {
    next.required = true;
  } else if (field.required) {
    next.required = true;
  }

  if (newType === "select") {
    next.options = field.options?.length ? [...field.options] : ["Option 1", "Option 2"];
  }

  return next;
}

/** Clone fields for duplicate-and-edit with fresh ids. */
export function duplicateFormFieldsForCopy(fields: readonly FormField[]): FormField[] {
  return fields.map((field, index) => {
    const next: FormField = {
      id: slugifyFormFieldId(field.label, index),
      label: field.label,
      type: field.type,
    };
    if (field.required) next.required = true;
    if (field.options?.length) next.options = [...field.options];
    if (field.content) next.content = field.content;
    return next;
  });
}

export function moveFormBuilderField(
  fields: readonly FormField[],
  fromIndex: number,
  direction: -1 | 1,
): FormField[] {
  const toIndex = fromIndex + direction;
  if (toIndex < 0 || toIndex >= fields.length) return [...fields];
  const next = [...fields];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return [...fields];
  next.splice(toIndex, 0, item);
  return next;
}

export function duplicateFormTitle(title: string): string {
  const base = title.trim() || "Form";
  return base.toLowerCase().startsWith("copy of ") ? base : `Copy of ${base}`;
}
