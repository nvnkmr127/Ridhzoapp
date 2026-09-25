// Shared by the server (service, actions) and the client (settings UI) — no server imports here.
export const CUSTOM_FIELD_TYPES = ["text", "textarea", "number", "currency", "date", "datetime", "select", "multiselect", "checkbox", "url"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  currency: "Amount",
  date: "Date",
  datetime: "Date & time",
  select: "Dropdown (one choice)",
  multiselect: "Multiple choice",
  checkbox: "Yes / No",
  url: "Link",
};

export const hasOptions = (t: string) => t === "select" || t === "multiselect";
// Types that take a default value (a checkbox defaults to unchecked; multiple choice to none).
export const hasDefault = (t: string) => t !== "checkbox" && t !== "multiselect";
