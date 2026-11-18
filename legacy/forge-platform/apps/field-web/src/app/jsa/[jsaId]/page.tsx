import { JsaClient } from "./jsa-client";

export function generateStaticParams() {
  return [{ jsaId: "placeholder" }];
}

export default function JsaPage() {
  return <JsaClient />;
}
