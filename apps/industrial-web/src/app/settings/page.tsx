"use client";

import Link from "next/link";
import { RolesPermissionsSettingsCard } from "@/components/roles-permissions-workspace";
import { UserManagementSettingsCard } from "@/components/user-management-workspace";

/**
 * Settings hub — links only to live Forge surfaces.
 * No fake save controls or "Not connected" tiles that look broken.
 */
export default function IndustrialSettingsPage() {
  return (
    <div className="ind-content">
      <h1>Settings</h1>
      <p className="text-muted mb-4">
        Forge Industrial Safety administration. Additional tenant settings will appear here when
        shared settings APIs are available.
      </p>
      <div className="row g-3">
        <UserManagementSettingsCard />
        <RolesPermissionsSettingsCard />
        <div className="col-12 col-sm-6 col-md-4">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h6">My profile</h2>
              <p className="small text-muted">Name, contact, and account preferences.</p>
              <Link href="/profile/" className="btn btn-sm btn-primary">
                Open profile
              </Link>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-md-4">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h6">Compliance</h2>
              <p className="small text-muted">User acknowledgments and legal evidence.</p>
              <Link href="/settings/compliance/" className="btn btn-sm btn-outline-primary">
                Open compliance
              </Link>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-md-4">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h6">Reporting</h2>
              <p className="small text-muted">Operational reporting workspace.</p>
              <Link href="/modules/reporting/" className="btn btn-sm btn-outline-primary">
                Open reporting
              </Link>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-md-4">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h6">Dashboard</h2>
              <p className="small text-muted">Return to the Industrial safety home.</p>
              <Link href="/" className="btn btn-sm btn-outline-secondary">
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="alert alert-secondary mt-4 mb-0" role="status">
        Organization profile, notification preferences, and other tenant-wide settings are not
        editable in this application yet. No changes are saved from this page.
      </div>
    </div>
  );
}
