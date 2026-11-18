import { redirect } from "next/navigation";

/** Facilities live in Configuration Studio today — keep a friendly Customers nav target. */
export default function FacilitiesPage() {
  redirect("/studio/facilities/");
}
