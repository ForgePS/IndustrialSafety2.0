"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ForgeCommandPalette,
  ForgeSearchTrigger,
  flattenNavItems,
  type ForgeCommandItem,
} from "@forge/ui";
import { filterNavigationForSession, useAuth } from "@forge/web-kit";
import { CREATOR_NAV_GROUPS } from "@/lib/navigation";
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

export function ConnectedCommandPalette() {
  const router = useRouter();
  const { me, chooseTenant, hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [remote, setRemote] = useState<PaletteItem[]>([]);

  const navItems = useMemo(() => {
    const groups = filterNavigationForSession(CREATOR_NAV_GROUPS, me);
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
        href: nav.route.endsWith("/") ? nav.route : `${nav.route}/`,
      });
    }

    for (const tenant of me?.tenants ?? []) {
      if (tenant.selectable === false) continue;
      items.push({
        id: `tenant:${tenant.tenantId}`,
        group: "Switch tenant",
        label: tenant.displayName,
        subtitle: tenant.tenantId === me?.tenantId ? "Current" : tenant.slug,
        tenantSwitchId: tenant.tenantId,
      });
    }

    if (hasPermission("platform.tenant.create")) {
      items.push({
        id: "create:tenant",
        group: "Create",
        label: "Create tenant",
        subtitle: "/tenants",
        href: "/tenants/",
      });
    }
    if (hasPermission("platform.user.invite")) {
      items.push({
        id: "create:invite",
        group: "Create",
        label: "Invite user",
        subtitle: "/users",
        href: "/users/",
      });
    }

    items.push({
      id: "settings",
      group: "Settings",
      label: "Open settings",
      subtitle: "/studio/tenant-profile",
      href: "/studio/tenant-profile/",
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
  }, [navItems, me, hasPermission, query]);

  useEffect(() => {
    if (!open || !me?.tenantId) {
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
      void apiGet<SearchResponse>(`/api/v1/tenants/${me.tenantId}/search`, {
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
                href: hit.href,
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
  }, [open, query, me?.tenantId]);

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
