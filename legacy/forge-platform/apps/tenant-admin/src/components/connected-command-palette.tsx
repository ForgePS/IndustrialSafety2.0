"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { filterNavigationGroups } from "@forge/design-system";
import {
  ForgeCommandPalette,
  ForgeSearchTrigger,
  flattenNavItems,
  type ForgeCommandItem,
} from "@forge/ui";
import { useAuth } from "@/hooks/use-auth";
import { useTenantId } from "@/hooks/use-tenant-id";
import { TENANT_ADMIN_NAV_GROUPS } from "@/lib/navigation";
import { apiGet } from "@/lib/api";

type SearchResponse = {
  groups: Array<{
    type: string;
    label: string;
    hits: Array<{ id: string; title: string; subtitle?: string; href: string }>;
  }>;
};

type PaletteItem = ForgeCommandItem & {
  href?: string;
  tenantSwitchId?: string;
};

function withTenantQuery(path: string, tenantId: string | null): string {
  const base = path.endsWith("/") ? path : `${path}/`;
  if (!tenantId) return base;
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}tenantId=${encodeURIComponent(tenantId)}`;
}

function mapHitHref(type: string, id: string, tenantId: string | null): string {
  switch (type) {
    case "membership":
      return withTenantQuery("/members", tenantId);
    case "facility":
      return withTenantQuery(`/facilities/${id}`, tenantId);
    case "module":
      return withTenantQuery(`/modules/${id}`, tenantId);
    case "tenant":
      return withTenantQuery("/", tenantId);
    default:
      return withTenantQuery("/", tenantId);
  }
}

export function ConnectedCommandPalette() {
  const router = useRouter();
  const { me, chooseTenant, hasPermission } = useAuth();
  const tenantId = useTenantId() ?? me?.tenantId ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [remote, setRemote] = useState<PaletteItem[]>([]);

  const navItems = useMemo(() => {
    const groups = filterNavigationGroups(TENANT_ADMIN_NAV_GROUPS, {
      permissions: me?.permissions ?? [],
      products: me?.activeProducts ?? [],
      modules: me?.activeModules ?? [],
      ...(me?.isPlatformAdmin ? { isPlatformAdmin: true } : {}),
    });
    return flattenNavItems(groups);
  }, [me]);

  const localItems = useMemo(() => {
    const items: PaletteItem[] = [];

    for (const nav of navItems) {
      items.push({
        id: `nav:${nav.id}`,
        group: "Navigate",
        label: nav.label,
        subtitle: nav.route,
        href: withTenantQuery(nav.route, tenantId),
      });
    }

    for (const tenant of me?.tenants ?? []) {
      if (tenant.selectable === false) continue;
      items.push({
        id: `tenant:${tenant.tenantId}`,
        group: "Switch tenant",
        label: tenant.displayName,
        ...(tenant.tenantId === me?.tenantId ? { subtitle: "Current" } : {}),
        tenantSwitchId: tenant.tenantId,
      });
    }

    if (hasPermission("tenant.facilities.manage")) {
      items.push({
        id: "create:facility",
        group: "Create",
        label: "Create facility",
        subtitle: "/facilities",
        href: withTenantQuery("/facilities", tenantId),
      });
    }
    if (hasPermission("platform.invitation.manage") || hasPermission("platform.user.invite")) {
      items.push({
        id: "create:invitation",
        group: "Create",
        label: "Invite member",
        subtitle: "/invitations",
        href: withTenantQuery("/invitations", tenantId),
      });
    }

    items.push({
      id: "settings",
      group: "Settings",
      label: "Open settings",
      subtitle: "/studio/tenant-profile",
      href: withTenantQuery("/studio/tenant-profile", tenantId),
    });
    items.push({
      id: "security",
      group: "Settings",
      label: "Open security",
      subtitle: "/security",
      href: withTenantQuery("/security", tenantId),
    });

    const needle = query.trim().toLowerCase();
    if (!needle) return items.slice(0, 40);
    return items
      .filter(
        (item) =>
          item.label.toLowerCase().includes(needle) ||
          (item.subtitle ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [navItems, me, hasPermission, query, tenantId]);

  useEffect(() => {
    if (!open || !tenantId) {
      setRemote([]);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setRemote([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void apiGet<SearchResponse>(`/api/v1/tenants/${tenantId}/search`, {
        query: { q },
        signal: controller.signal,
      })
        .then((res) => {
          const items: PaletteItem[] = [];
          for (const group of res.groups) {
            for (const hit of group.hits) {
              items.push({
                id: `hit:${group.type}:${hit.id}`,
                group: `Search · ${group.label}`,
                label: hit.title,
                ...(hit.subtitle ? { subtitle: hit.subtitle } : {}),
                href: mapHitHref(group.type, hit.id, tenantId),
              });
            }
          }
          setRemote(items);
        })
        .catch(() => {
          if (!controller.signal.aborted) setRemote([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, tenantId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const items = useMemo(() => [...remote, ...localItems], [remote, localItems]);

  const onSelect = useCallback(
    (item: ForgeCommandItem) => {
      const paletteItem = item as PaletteItem;
      setOpen(false);
      setQuery("");
      if (paletteItem.tenantSwitchId) {
        void chooseTenant(paletteItem.tenantSwitchId);
        return;
      }
      if (paletteItem.href) {
        router.push(paletteItem.href);
      }
    },
    [chooseTenant, router],
  );

  return (
    <>
      <ForgeSearchTrigger
        disabled={!me}
        {...(me ? {} : { disabledReason: "Sign in to search" })}
        onTrigger={() => setOpen(true)}
        label="Search"
      />
      <ForgeCommandPalette
        open={open}
        onClose={() => setOpen(false)}
        query={query}
        onQueryChange={setQuery}
        items={items}
        onSelect={onSelect}
        loading={loading}
        emptyLabel={query.trim().length < 2 ? "Type to search or pick a command" : "No matches"}
      />
    </>
  );
}
