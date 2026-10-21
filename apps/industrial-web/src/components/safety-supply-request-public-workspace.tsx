"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, usePathname } from "next/navigation";

type StationConfig = {
  allowAnonymous: boolean;
  requireEmployeeId: boolean;
  allowContractors: boolean;
  allowCustomItems: boolean;
  allowUrgent: boolean;
  allowNotes: boolean;
  inventoryVisibility: "HIDDEN" | "AVAILABILITY" | "EXACT";
  allowOutOfStockRequests: boolean;
};

type StationContext = {
  qrName: string;
  description?: string | null;
  siteName?: string | null;
  locationName?: string | null;
  workArea?: string | null;
  config: StationConfig;
};

type CatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  itemNumber?: string | null;
  categoryId?: string | null;
  unitOfMeasure?: string | null;
  maxQuantityPerRequest?: string | number | null;
  availability?: "AVAILABLE" | "LOW" | "OUT" | null;
  quantityAvailable?: number | null;
  variants: Array<{ id: string; name: string; sizeLabel?: string | null }>;
};

type CartLine = {
  key: string;
  itemId?: string;
  variantId?: string | null;
  name: string;
  sizeLabel?: string | null;
  quantity: number;
  customItem?: boolean;
  customItemDescription?: string;
};

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
}

async function publicJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { message?: string };
    message?: string;
  };
  if (!res.ok) {
    throw new Error(json.error?.message || json.message || "Request failed");
  }
  return (json.data ?? json) as T;
}

function resolveSupplyRequestToken(input: {
  pathname?: string | null;
  routeToken?: string | null;
}): string {
  const path = String(input.pathname ?? "");
  const pathMatch = path.match(/\/safety-supplies\/request\/q\/([^/]+)/i);
  const fromPathname = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]).trim() : "";
  if (fromPathname && fromPathname !== "placeholder") return fromPathname;

  const fromRoute = String(input.routeToken ?? "").trim();
  if (fromRoute && fromRoute !== "placeholder") return fromRoute;
  return "";
}

export function SafetySupplyRequestPublicWorkspace() {
  const params = useParams();
  const pathname = usePathname();
  const token = resolveSupplyRequestToken({
    pathname,
    routeToken: typeof params?.token === "string" ? params.token : null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [station, setStation] = useState<StationContext | null>(null);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [lastName, setLastName] = useState("");
  const [personnelToken, setPersonnelToken] = useState<string | null>(null);
  const [employeeLabel, setEmployeeLabel] = useState("");
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [requestorType, setRequestorType] = useState("EMPLOYEE");
  const [contractorName, setContractorName] = useState("");
  const [contractorCompany, setContractorCompany] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [priority, setPriority] = useState("ROUTINE");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    requestNumber: string;
    statusToken: string;
    items: Array<{ name: string; quantity: number }>;
  } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [customDesc, setCustomDesc] = useState("");

  const identified = identityConfirmed;

  const loadStation = useCallback(async () => {
    if (!token || token === "placeholder") {
      setError("This QR code is no longer active.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await publicJson<StationContext>(
        `/api/v1/public/safety-supplies/request/${encodeURIComponent(token)}`,
      );
      setStation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This QR code is no longer active.");
      setStation(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadItems = useCallback(async () => {
    if (!token || !station) return;
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set("q", search.trim());
      if (categoryId) qs.set("categoryId", categoryId);
      const data = await publicJson<{
        items: CatalogItem[];
        categories: Array<{ id: string; name: string }>;
      }>(
        `/api/v1/public/safety-supplies/request/${encodeURIComponent(token)}/items?${qs.toString()}`,
      );
      setItems(data.items ?? []);
      setCategories(data.categories ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load supplies");
    }
  }, [token, station, search, categoryId]);

  useEffect(() => {
    void loadStation();
  }, [loadStation]);

  useEffect(() => {
    if (identified) void loadItems();
  }, [identified, loadItems]);

  async function confirmEmployee(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = await publicJson<{
        matched: boolean;
        employee?: { displayName: string; personnelToken: string; employeeNumber?: string };
      }>(`/api/v1/public/safety-supplies/request/${encodeURIComponent(token)}/employee`, {
        method: "POST",
        body: JSON.stringify({ employeeNumber, lastName: lastName || undefined }),
      });
      if (!data.matched || !data.employee) {
        setError("Employee not found. Check the employee number and try again.");
        return;
      }
      setPersonnelToken(data.employee.personnelToken);
      setIdentityConfirmed(true);
      setRequestorType("EMPLOYEE");
      setEmployeeLabel(
        `${data.employee.displayName}${data.employee.employeeNumber ? ` · ${data.employee.employeeNumber}` : ""}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Employee lookup failed");
    }
  }

  function addToCart(item: CatalogItem, variantId?: string) {
    if (item.availability === "OUT" && !station?.config.allowOutOfStockRequests) {
      setError("That item is out of stock.");
      return;
    }
    const variant = item.variants.find((v) => v.id === variantId);
    const key = `${item.id}:${variantId ?? ""}`;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key,
          itemId: item.id,
          variantId: variantId ?? null,
          name: item.name,
          sizeLabel: variant?.sizeLabel || variant?.name || null,
          quantity: 1,
        },
      ];
    });
  }

  async function submitRequest(e: FormEvent) {
    e.preventDefault();
    if (cart.length === 0) {
      setError("Add at least one item to your request.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const data = await publicJson<{
        requestNumber: string;
        statusToken: string;
        items: Array<{ name: string; quantity: number }>;
      }>(`/api/v1/public/safety-supplies/request/${encodeURIComponent(token)}/requests`, {
        method: "POST",
        body: JSON.stringify({
          requestorType,
          personnelToken:
            requestorType === "EMPLOYEE" && personnelToken ? personnelToken : undefined,
          contractorName: contractorName || undefined,
          contractorCompany: contractorCompany || undefined,
          priority,
          notes: notes || undefined,
          items: cart.map((line) =>
            line.customItem
              ? {
                  customItem: true,
                  customItemName: line.name,
                  customItemDescription: line.customItemDescription,
                  quantity: line.quantity,
                }
              : {
                  itemId: line.itemId,
                  variantId: line.variantId,
                  quantity: line.quantity,
                },
          ),
        }),
      });
      setConfirmation(data);
      setCart([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't submit your request.");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredItems = useMemo(() => items, [items]);

  if (loading) {
    return (
      <main className="container py-5">
        <p className="text-muted">Loading safety supply request…</p>
      </main>
    );
  }

  if (!station) {
    return (
      <main className="container py-5" style={{ maxWidth: 520 }}>
        <h1 className="h4">Safety Supply Request</h1>
        <p className="mt-3">
          {error ||
            "This Safety Supply Request QR code is currently unavailable. Please contact the Safety Department."}
        </p>
      </main>
    );
  }

  if (confirmation) {
    return (
      <main className="container py-4" style={{ maxWidth: 560 }}>
        <div className="text-center mb-4">
          <div className="display-6 text-success mb-2">✓</div>
          <h1 className="h3">Safety Supply Request Submitted</h1>
          <p className="mb-1">
            Request: <strong>{confirmation.requestNumber}</strong>
          </p>
          {station.siteName ? <p className="text-muted">{station.siteName}</p> : null}
        </div>
        <ul className="list-group mb-3">
          {confirmation.items.map((line, idx) => (
            <li key={`${line.name}-${idx}`} className="list-group-item d-flex justify-content-between">
              <span>{line.name}</span>
              <span>× {line.quantity}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted">Status: Submitted</p>
        <p>Your request has been sent to the Safety/EHS team.</p>
        <div className="d-grid gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setConfirmation(null);
              setPersonnelToken(null);
              setEmployeeLabel("");
              setIdentityConfirmed(false);
              setRequestorType("EMPLOYEE");
            }}
          >
            Submit another request
          </button>
          <a
            className="btn btn-outline-secondary"
            href={`/safety-supplies/request/status/${encodeURIComponent(confirmation.statusToken)}`}
          >
            View request status
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="container py-3" style={{ maxWidth: 720 }}>
      <header className="mb-3">
        <p className="text-uppercase small text-muted mb-1">Safety Supply Request</p>
        <h1 className="h3 mb-1">{station.qrName}</h1>
        {station.siteName ? <div className="fw-semibold">{station.siteName}</div> : null}
        {station.locationName || station.workArea ? (
          <div className="text-muted small">
            {[station.locationName, station.workArea].filter(Boolean).join(" · ")}
          </div>
        ) : null}
      </header>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      {!identified ? (
        <section className="card">
          <div className="card-body">
            {station.config.allowContractors ? (
              <div className="mb-3">
                <label className="form-label">I am a</label>
                <select
                  className="form-select form-select-lg"
                  value={requestorType}
                  onChange={(e) => setRequestorType(e.target.value)}
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="CONTRACTOR">Contractor</option>
                  <option value="TEMPORARY">Temporary Worker</option>
                  <option value="VISITOR">Visitor</option>
                  {station.config.allowAnonymous ? (
                    <option value="ANONYMOUS">Anonymous</option>
                  ) : null}
                </select>
              </div>
            ) : null}

            {requestorType === "EMPLOYEE" ? (
              <form onSubmit={(e) => void confirmEmployee(e)}>
                <div className="mb-3">
                  <label className="form-label" htmlFor="emp-no">
                    Employee Number
                  </label>
                  <input
                    id="emp-no"
                    className="form-control form-control-lg"
                    value={employeeNumber}
                    onChange={(e) => setEmployeeNumber(e.target.value)}
                    required={station.config.requireEmployeeId}
                    autoComplete="off"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="emp-last">
                    Last Name (optional)
                  </label>
                  <input
                    id="emp-last"
                    className="form-control form-control-lg"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-lg w-100">
                  Continue
                </button>
                {station.config.allowAnonymous ? (
                  <button
                    type="button"
                    className="btn btn-link w-100 mt-2"
                    onClick={() => {
                      setRequestorType("ANONYMOUS");
                      setPersonnelToken(null);
                      setIdentityConfirmed(true);
                    }}
                  >
                    Continue without identifying
                  </button>
                ) : null}
                {station.config.allowContractors ? (
                  <button
                    type="button"
                    className="btn btn-link w-100 mt-1"
                    onClick={() => {
                      setRequestorType("CONTRACTOR");
                      setPersonnelToken(null);
                      setIdentityConfirmed(false);
                    }}
                  >
                    I am a contractor / visitor
                  </button>
                ) : null}
              </form>
            ) : requestorType === "ANONYMOUS" ? (
              <button
                type="button"
                className="btn btn-primary btn-lg w-100"
                onClick={() => {
                  setPersonnelToken(null);
                  setIdentityConfirmed(true);
                }}
              >
                Continue
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!contractorName.trim()) {
                    setError("Name is required");
                    return;
                  }
                  setPersonnelToken(null);
                  setIdentityConfirmed(true);
                }}
              >
                <div className="mb-3">
                  <label className="form-label">Name *</label>
                  <input
                    className="form-control form-control-lg"
                    value={contractorName}
                    onChange={(e) => setContractorName(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Company</label>
                  <input
                    className="form-control form-control-lg"
                    value={contractorCompany}
                    onChange={(e) => setContractorCompany(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-lg w-100">
                  Continue
                </button>
              </form>
            )}
          </div>
        </section>
      ) : (
        <>
          {employeeLabel ? (
            <div className="alert alert-light border">{employeeLabel}</div>
          ) : null}

          <div className="mb-3">
            <input
              className="form-control form-control-lg"
              placeholder="Search safety supplies…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {categories.length > 0 ? (
            <div className="d-flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                className={`btn btn-sm ${categoryId === "" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setCategoryId("")}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`btn btn-sm ${categoryId === cat.id ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setCategoryId(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="vstack gap-3 mb-4">
            {filteredItems.map((item) => (
              <div key={item.id} className="card">
                <div className="card-body">
                  <div className="d-flex justify-content-between gap-2">
                    <div>
                      <h2 className="h5 mb-1">{item.name}</h2>
                      {item.description ? (
                        <p className="small text-muted mb-2">{item.description}</p>
                      ) : null}
                      {item.availability ? (
                        <span className="badge text-bg-secondary">
                          {item.availability === "OUT"
                            ? "Out of Stock"
                            : item.availability === "LOW"
                              ? "Low Stock"
                              : "Available"}
                          {item.quantityAvailable != null
                            ? ` · ${item.quantityAvailable}`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {item.variants.length > 0 ? (
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      {item.variants.map((variant) => (
                        <button
                          key={variant.id}
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={() => addToCart(item, variant.id)}
                        >
                          Add {variant.sizeLabel || variant.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary mt-3"
                      onClick={() => addToCart(item)}
                    >
                      Add to Request
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filteredItems.length === 0 ? (
              <p className="text-muted">
                No safety supplies are currently available for online request at this location.
              </p>
            ) : null}
          </div>

          {station.config.allowCustomItems ? (
            <div className="mb-3">
              {!customOpen ? (
                <button
                  type="button"
                  className="btn btn-outline-secondary w-100"
                  onClick={() => setCustomOpen(true)}
                >
                  Request an item not listed
                </button>
              ) : (
                <div className="card card-body">
                  <div className="mb-2">
                    <label className="form-label">Item name</label>
                    <input
                      className="form-control"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                    />
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Quantity</label>
                    <input
                      className="form-control"
                      type="number"
                      min={1}
                      value={customQty}
                      onChange={(e) => setCustomQty(e.target.value)}
                    />
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={customDesc}
                      onChange={(e) => setCustomDesc(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      if (!customName.trim()) return;
                      const description = customDesc.trim();
                      setCart((prev) => [
                        ...prev,
                        {
                          key: `custom:${customName}:${Date.now()}`,
                          name: customName.trim(),
                          quantity: Math.max(1, Number(customQty) || 1),
                          customItem: true,
                          ...(description ? { customItemDescription: description } : {}),
                        },
                      ]);
                      setCustomName("");
                      setCustomQty("1");
                      setCustomDesc("");
                      setCustomOpen(false);
                    }}
                  >
                    Add custom item
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <form onSubmit={(e) => void submitRequest(e)} className="card">
            <div className="card-header">
              <strong>Your Request</strong>
            </div>
            <ul className="list-group list-group-flush">
              {cart.map((line) => (
                <li
                  key={line.key}
                  className="list-group-item d-flex justify-content-between align-items-center gap-2"
                >
                  <div>
                    <div>{line.name}</div>
                    {line.sizeLabel ? (
                      <div className="small text-muted">Size: {line.sizeLabel}</div>
                    ) : null}
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() =>
                        setCart((prev) =>
                          prev
                            .map((l) =>
                              l.key === line.key
                                ? { ...l, quantity: Math.max(1, l.quantity - 1) }
                                : l,
                            )
                            .filter((l) => l.quantity > 0),
                        )
                      }
                    >
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() =>
                        setCart((prev) =>
                          prev.map((l) =>
                            l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l,
                          ),
                        )
                      }
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => setCart((prev) => prev.filter((l) => l.key !== line.key))}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
              {cart.length === 0 ? (
                <li className="list-group-item text-muted">No items yet</li>
              ) : null}
            </ul>
            <div className="card-body">
              {station.config.allowUrgent ? (
                <div className="mb-3">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-select"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="ROUTINE">Routine</option>
                    <option value="NEEDED_SOON">Needed Soon</option>
                    <option value="URGENT">Urgent / Required for Safe Work</option>
                  </select>
                  {priority === "URGENT" ? (
                    <div className="form-text">
                      Urgent requests should be used when the requested safety supply is required
                      to safely perform assigned work.
                    </div>
                  ) : null}
                </div>
              ) : null}
              {station.config.allowNotes ? (
                <div className="mb-3">
                  <label className="form-label">Reason / Additional Information</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              ) : null}
              <button
                type="submit"
                className="btn btn-primary btn-lg w-100"
                disabled={submitting || cart.length === 0}
              >
                {submitting ? "Submitting…" : "Submit Safety Supply Request"}
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
