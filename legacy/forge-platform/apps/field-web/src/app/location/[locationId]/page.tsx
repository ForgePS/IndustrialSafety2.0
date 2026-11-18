import { LocationClient } from "./location-client";

export function generateStaticParams() {
  return [{ locationId: "placeholder" }];
}

export default function LocationPage() {
  return <LocationClient />;
}
