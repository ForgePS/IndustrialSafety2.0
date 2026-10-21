"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@forge/web-kit";
import type { FieldPermission } from "@forge/contracts";
import {
  canAuthorFieldLoto,
  canExecuteFieldLoto,
  canViewFieldLoto,
  fieldAuthOpts,
  hasFieldAccess,
  hasFieldPermission,
  type FieldAuthOpts,
} from "@/lib/field-permissions";
import { isFieldFeatureModuleEnabled, isFieldModuleEnabled } from "@/lib/field-modules";

type FieldPermissionsContextValue = {
  permissions: readonly string[];
  activeModules: readonly string[];
  opts: FieldAuthOpts;
  hasAccess: boolean;
  can: (permission: FieldPermission) => boolean;
  moduleEnabled: (moduleCode: string) => boolean;
  featureEnabled: (featureId: string) => boolean;
  canViewLoto: boolean;
  canExecuteLoto: boolean;
  canAuthorLoto: boolean;
};

const FieldPermissionsContext = createContext<FieldPermissionsContextValue | null>(null);

export function FieldPermissionsProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const value = useMemo<FieldPermissionsContextValue>(() => {
    const permissions = me?.permissions ?? [];
    const activeModules = me?.activeModules ?? [];
    const opts = fieldAuthOpts(me);
    return {
      permissions,
      activeModules,
      opts,
      hasAccess: hasFieldAccess(permissions, opts),
      can: (permission) => hasFieldPermission(permissions, permission, opts),
      moduleEnabled: (moduleCode) =>
        isFieldModuleEnabled(activeModules, moduleCode, {
          isPlatformAdmin: Boolean(opts.isPlatformAdmin),
        }),
      featureEnabled: (featureId) =>
        isFieldFeatureModuleEnabled(activeModules, featureId, {
          isPlatformAdmin: Boolean(opts.isPlatformAdmin),
        }),
      canViewLoto: canViewFieldLoto(permissions, opts),
      canExecuteLoto: canExecuteFieldLoto(permissions, opts),
      canAuthorLoto: canAuthorFieldLoto(permissions, opts),
    };
  }, [me]);

  return (
    <FieldPermissionsContext.Provider value={value}>{children}</FieldPermissionsContext.Provider>
  );
}

export function useFieldPermissions(): FieldPermissionsContextValue {
  const ctx = useContext(FieldPermissionsContext);
  if (!ctx) {
    throw new Error("useFieldPermissions must be used within FieldPermissionsProvider");
  }
  return ctx;
}
