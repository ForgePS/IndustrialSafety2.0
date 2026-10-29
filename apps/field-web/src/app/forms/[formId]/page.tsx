import { FormDetailClient } from "./form-detail-client";

export function generateStaticParams() {
  return [{ formId: "placeholder" }];
}

export default function FormDetailPage() {
  return <FormDetailClient />;
}
