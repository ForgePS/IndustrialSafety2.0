"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ErrorState, ForgePageHeader, LoadingState } from "@forge/ui";
import { filterBySearch, ListControls, paginate, sortByField } from "@/components/list-controls";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { listPlatformProducts, patchPlatformProduct, type PlatformProduct } from "@/lib/api";
import { productDisplayName } from "@/lib/presentation";
import styles from "../page.module.css";

const PAGE_SIZE = 10;

function ProductsInner() {
  const [products, setProducts] = useState<PlatformProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("code");
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [editProduct, setEditProduct] = useState<PlatformProduct | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await listPlatformProducts({ includeArchived: showArchived }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, sort, showArchived]);

  const filtered = useMemo(() => {
    const searched = filterBySearch(products, search, [
      (row) => row.code,
      (row) => row.name,
      (row) => row.description ?? "",
    ]);
    return sortByField(searched, sort, {
      code: (row) => row.code,
      name: (row) => row.name,
      status: (row) => row.status,
    });
  }, [products, search, sort]);

  const pageItems = paginate(filtered, page, PAGE_SIZE);

  function startEdit(product: PlatformProduct) {
    setEditProduct(product);
    setEditName(product.name);
    setEditDescription(product.description ?? "");
    setEditStatus(product.status);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editProduct) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await patchPlatformProduct(editProduct.code, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        status: editStatus,
      });
      setMessage(`Product ${editProduct.code} updated.`);
      setEditProduct(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Products"
        subtitle="Forge platform products. Product codes are fixed; display names and status are editable."
        actions={
          <Link className={styles.buttonSecondary} href="/modules/">
            Module catalog
          </Link>
        }
      />

      {error ? <ErrorState title="Unable to load products" description={error} /> : null}
      {message ? <p className={styles.success}>{message}</p> : null}
      {loading ? <LoadingState label="Loading products…" /> : null}

      <div className={styles.panel}>
        <div className={styles.linkRow}>
          <h2>Product catalog</h2>
          <label className={styles.muted}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />{" "}
            Show archived
          </label>
        </div>
        <ListControls
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          sortOptions={[
            { value: "name", label: "Name" },
            { value: "code", label: "Code" },
            { value: "status", label: "Status" },
          ]}
          onSortChange={setSort}
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
        />
        {pageItems.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr key={row.id}>
                  <td className={styles.mono}>{row.code}</td>
                  <td>{row.name || productDisplayName(row.code)}</td>
                  <td>{row.description ?? "—"}</td>
                  <td>{row.status}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.buttonSecondary}
                      onClick={() => startEdit(row)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !loading && <p className={styles.muted}>No products found.</p>
        )}
      </div>

      {editProduct ? (
        <div className={styles.panel}>
          <h2>Edit product · {editProduct.code}</h2>
          <form className={styles.form} onSubmit={onSave}>
            <div className={styles.formRow}>
              <label htmlFor="product-name">Display name</label>
              <input
                id="product-name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="product-description">Description</label>
              <textarea
                id="product-description"
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="product-status">Status</label>
              <select
                id="product-status"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting}>
                Save product
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => setEditProduct(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export default function ProductsPage() {
  return (
    <PlatformPageGate title="Products" permission="platform.entitlement.manage">
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <ProductsInner />
      </Suspense>
    </PlatformPageGate>
  );
}
