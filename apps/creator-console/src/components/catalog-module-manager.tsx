"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FORGE_PLATFORMS } from "@forge/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  filterBySearch,
  ListControls,
  paginate,
  sortByField,
} from "@/components/list-controls";
import {
  archivePlatformModule,
  createPlatformModule,
  listPlatformModules,
  patchPlatformModule,
  type PlatformModule,
} from "@/lib/api";
import styles from "../app/page.module.css";

const PAGE_SIZE = 15;
const IMPLEMENTATION_STATUSES = [
  "READY",
  "IN_DEVELOPMENT",
  "MIGRATING",
  "COMING_SOON",
  "RETIRED",
  "UNAVAILABLE",
] as const;
const CLASSIFICATIONS = [
  "CUSTOMER_MODULE",
  "PLATFORM_CORE",
  "INTERNAL_TOOL",
  "SHARED_SERVICE",
] as const;

export function CatalogModuleManager() {
  const [modules, setModules] = useState<PlatformModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("code");
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);

  const [productCode, setProductCode] = useState(FORGE_PLATFORMS[0]?.productCode ?? "");
  const [moduleCode, setModuleCode] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [moduleCategory, setModuleCategory] = useState("General");
  const [moduleClassification, setModuleClassification] =
    useState<(typeof CLASSIFICATIONS)[number]>("CUSTOMER_MODULE");
  const [moduleStatus, setModuleStatus] =
    useState<(typeof IMPLEMENTATION_STATUSES)[number]>("READY");

  const [editRow, setEditRow] = useState<PlatformModule | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PlatformModule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setModules(await listPlatformModules({ includeArchived: showArchived }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load modules");
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
    const searched = filterBySearch(modules, search, [
      (row) => row.code,
      (row) => row.name,
      (row) => row.productCode,
      (row) => row.category,
    ]);
    return sortByField(searched, sort, {
      code: (row) => row.code,
      name: (row) => row.name,
      product: (row) => row.productCode,
      status: (row) => row.implementationStatus,
    });
  }, [modules, search, sort]);

  const pageItems = paginate(filtered, page, PAGE_SIZE);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!productCode) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await createPlatformModule(productCode, {
        code: moduleCode.trim().toUpperCase(),
        name: moduleName.trim(),
        category: moduleCategory.trim(),
        classification: moduleClassification,
        implementationStatus: moduleStatus,
      });
      setModuleCode("");
      setModuleName("");
      setMessage("Module created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create module");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editRow) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await patchPlatformModule(editRow.productCode, editRow.code, {
        name: editRow.name,
        description: editRow.description,
        category: editRow.category,
        classification: editRow.classification,
        implementationStatus: editRow.implementationStatus,
        customerAssignable: editRow.customerAssignable,
        displayOrder: editRow.displayOrder,
        status: editRow.status,
      });
      setEditRow(null);
      setMessage("Module updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update module");
    } finally {
      setSubmitting(false);
    }
  }

  async function onConfirmArchive() {
    if (!archiveTarget) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await archivePlatformModule(archiveTarget.productCode, archiveTarget.code);
      setArchiveTarget(null);
      setMessage(`Module ${archiveTarget.code} archived.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.panel}>
      <h2>Catalog management</h2>
      <p className={styles.muted}>
        Create and edit platform module records. Customer assignment still happens on Company
        Modules.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}

      <form className={styles.form} onSubmit={onCreate}>
        <div className={styles.formRow}>
          <label htmlFor="create-product">Product</label>
          <select
            id="create-product"
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
          >
            {FORGE_PLATFORMS.map((platform) => (
              <option key={platform.productCode} value={platform.productCode}>
                {platform.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formRow}>
          <label htmlFor="create-code">Module code</label>
          <input
            id="create-code"
            required
            value={moduleCode}
            onChange={(e) => setModuleCode(e.target.value)}
            placeholder="MY_MODULE"
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="create-name">Name</label>
          <input
            id="create-name"
            required
            value={moduleName}
            onChange={(e) => setModuleName(e.target.value)}
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="create-category">Category</label>
          <input
            id="create-category"
            value={moduleCategory}
            onChange={(e) => setModuleCategory(e.target.value)}
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="create-classification">Classification</label>
          <select
            id="create-classification"
            value={moduleClassification}
            onChange={(e) =>
              setModuleClassification(e.target.value as (typeof CLASSIFICATIONS)[number])
            }
          >
            {CLASSIFICATIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formRow}>
          <label htmlFor="create-implementation">Implementation status</label>
          <select
            id="create-implementation"
            value={moduleStatus}
            onChange={(e) =>
              setModuleStatus(e.target.value as (typeof IMPLEMENTATION_STATUSES)[number])
            }
          >
            {IMPLEMENTATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} type="submit" disabled={submitting}>
            Create module
          </button>
        </div>
      </form>

      {loading ? <p className={styles.muted}>Loading catalog…</p> : null}

      <div className={styles.linkRow}>
        <span />
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
          { value: "code", label: "Code" },
          { value: "name", label: "Name" },
          { value: "product", label: "Product" },
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
              <th>Product</th>
              <th>Code</th>
              <th>Name</th>
              <th>Status</th>
              <th>Catalog</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((row) => (
              <tr key={row.id}>
                <td className={styles.mono}>{row.productCode}</td>
                <td className={styles.mono}>{row.code}</td>
                <td>{row.name}</td>
                <td>{row.status}</td>
                <td>{row.implementationStatus}</td>
                <td>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.buttonSecondary}
                      onClick={() => setEditRow(row)}
                    >
                      Edit
                    </button>
                    {row.status === "ACTIVE" ? (
                      <button
                        type="button"
                        className={styles.buttonDanger}
                        onClick={() => setArchiveTarget(row)}
                      >
                        Archive
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !loading && <p className={styles.muted}>No modules in catalog.</p>
      )}

      {editRow ? (
        <form className={styles.form} onSubmit={onSaveEdit}>
          <h3>Edit · {editRow.productCode}/{editRow.code}</h3>
          <div className={styles.formRow}>
            <label htmlFor="edit-name">Name</label>
            <input
              id="edit-name"
              required
              value={editRow.name}
              onChange={(e) => setEditRow({ ...editRow, name: e.target.value })}
            />
          </div>
          <div className={styles.formRow}>
            <label htmlFor="edit-category">Category</label>
            <input
              id="edit-category"
              value={editRow.category}
              onChange={(e) => setEditRow({ ...editRow, category: e.target.value })}
            />
          </div>
          <div className={styles.formRow}>
            <label htmlFor="edit-implementation">Implementation status</label>
            <select
              id="edit-implementation"
              value={editRow.implementationStatus}
              onChange={(e) =>
                setEditRow({ ...editRow, implementationStatus: e.target.value })
              }
            >
              {IMPLEMENTATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label htmlFor="edit-record-status">Record status</label>
            <select
              id="edit-record-status"
              value={editRow.status}
              onChange={(e) => setEditRow({ ...editRow, status: e.target.value })}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>
          <div className={styles.formRow}>
            <label>
              <input
                type="checkbox"
                checked={editRow.customerAssignable}
                onChange={(e) =>
                  setEditRow({ ...editRow, customerAssignable: e.target.checked })
                }
              />{" "}
              Customer assignable
            </label>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={submitting}>
              Save module
            </button>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => setEditRow(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive module?"
        description="Archived modules stay in the database but are hidden from new customer assignments."
        confirmLabel="Archive"
        danger
        busy={submitting}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void onConfirmArchive()}
      />
    </div>
  );
}
