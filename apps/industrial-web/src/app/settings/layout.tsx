import { SettingsAdminLayout } from "@/components/settings-admin-layout";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsAdminLayout>{children}</SettingsAdminLayout>;
}
