"use client";

import { useRef, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { trainingApi } from "@/features/training/api";
import {
  TRAINING_MATERIAL_ACCEPT,
  uploadTrainingMaterialFile,
} from "@/features/training/materials";
import type { TrainingGroup, TrainingMaterial, TrainingSource, TrainingSourceFolder } from "@/features/training/types";
import {
  downloadQuestionImportCsvTemplate,
  downloadQuestionImportTemplate,
  importTrainingQuizFile,
} from "@/lib/training-question-import";
import { TrainingQuestionImportPanel } from "@/components/training-question-import-panel";
import { TrainingSourceMaterials } from "@/components/training-source-materials";

export type CourseBuilderForm = {
  title: string;
  edition: string;
  description: string;
  groupIds: string[];
};

type SharedProps = {
  canManage: boolean;
  busy: boolean;
  groups: TrainingGroup[];
  materials: TrainingMaterial[];
  folders: TrainingSourceFolder[];
  unlinkedMaterials: TrainingMaterial[];
  onRefreshMaterials: () => Promise<void>;
  onRefreshFolders: () => Promise<void>;
  onRefreshSources?: () => Promise<void>;
  onError: (message: string | null) => void;
  onClose: () => void;
};

type CreateProps = SharedProps & {
  mode: "create";
  form: CourseBuilderForm;
  onFormChange: (form: CourseBuilderForm) => void;
  onCreated: (source: TrainingSource) => void | Promise<void>;
};

type EditProps = SharedProps & {
  mode: "edit";
  source: TrainingSource;
  form: CourseBuilderForm;
  onFormChange: (form: CourseBuilderForm) => void;
  onSaved: () => void | Promise<void>;
  onOpenAuthor?: () => void;
  onPublish?: () => void | Promise<void>;
  onUnpublish?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
};

type Props = CreateProps | EditProps;

function MaterialsUploadZone({
  disabled,
  uploading,
  onFiles,
}: {
  disabled: boolean;
  uploading: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`border rounded p-4 text-center bg-light-subtle${dragOver ? " border-primary" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled && !uploading) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (disabled || uploading) return;
        onFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="d-none"
        multiple
        accept={TRAINING_MATERIAL_ACCEPT}
        disabled={disabled || uploading}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <i className="bx bx-cloud-upload bx-lg text-muted mb-2 d-block" aria-hidden />
      <p className="mb-2 fw-semibold">Upload study materials</p>
      <p className="text-muted small mb-3">
        PDF, PowerPoint, Word, Excel, video, or images. Drag files here or browse.
      </p>
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Uploading…" : "Choose files"}
      </button>
    </div>
  );
}

export function TrainingCourseBuilder(props: Props) {
  const {
    canManage,
    busy,
    groups,
    materials,
    folders,
    unlinkedMaterials,
    onRefreshMaterials,
    onRefreshFolders,
    onRefreshSources,
    onError,
    onClose,
  } = props;

  const [createQuizFile, setCreateQuizFile] = useState<File | null>(null);
  const [createMaterialFiles, setCreateMaterialFiles] = useState<File[]>([]);
  const [uploadingMaterials, setUploadingMaterials] = useState(false);
  const [saving, setSaving] = useState(false);

  const isCreate = props.mode === "create";
  const source = props.mode === "edit" ? props.source : null;
  const title = isCreate ? "New course" : `Build course · ${source?.title ?? "Course"}`;

  async function uploadMaterialFiles(sourceId: string, files: File[]) {
    for (const file of files) {
      await uploadTrainingMaterialFile({
        file,
        sourceId,
        folderId: null,
      });
    }
  }

  async function handleCreateSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (props.mode !== "create" || !canManage || !props.form.title.trim()) return;
    setSaving(true);
    onError(null);
    try {
      const row = await trainingApi.createSource({
        title: props.form.title.trim(),
        ...(props.form.edition.trim() ? { edition: props.form.edition.trim() } : {}),
        ...(props.form.description.trim() ? { description: props.form.description.trim() } : {}),
        groupIds: props.form.groupIds,
      });
      if (createMaterialFiles.length) {
        setUploadingMaterials(true);
        await uploadMaterialFiles(row.id, createMaterialFiles);
      }
      if (createQuizFile) {
        await importTrainingQuizFile(row.id, createQuizFile, "PUBLISHED");
      }
      await onRefreshSources?.();
      await onRefreshMaterials();
      await props.onCreated(row);
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "Could not create course");
    } finally {
      setUploadingMaterials(false);
      setSaving(false);
    }
  }

  async function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (props.mode !== "edit" || !canManage || !props.form.title.trim()) return;
    setSaving(true);
    onError(null);
    try {
      await trainingApi.updateSource(props.source.id, {
        title: props.form.title.trim(),
        edition: props.form.edition.trim(),
        description: props.form.description.trim(),
        groupIds: props.form.groupIds,
      });
      await props.onSaved();
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "Could not save course");
    } finally {
      setSaving(false);
    }
  }

  async function handleEditMaterialUpload(files: FileList | null) {
    if (props.mode !== "edit" || !files?.length || !canManage) return;
    setUploadingMaterials(true);
    onError(null);
    try {
      await uploadMaterialFiles(props.source.id, [...files]);
      await onRefreshMaterials();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploadingMaterials(false);
    }
  }

  const disabled = busy || saving || uploadingMaterials;

  return (
    <form
      className="card border mb-4"
      onSubmit={(event) => void (isCreate ? handleCreateSubmit(event) : handleEditSubmit(event))}
    >
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <h6 className="mb-0">{title}</h6>
        <button type="button" className="btn-close" aria-label="Close course builder" onClick={onClose} />
      </div>
      <div className="card-body d-flex flex-column gap-4">
        <section aria-labelledby="course-builder-details-heading">
          <h6 id="course-builder-details-heading" className="mb-3">
            Course details
          </h6>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label" htmlFor="course-builder-title">
                Title
              </label>
              <input
                id="course-builder-title"
                className="form-control"
                required
                value={props.form.title}
                disabled={disabled}
                onChange={(event) =>
                  props.onFormChange({ ...props.form, title: event.target.value })
                }
                placeholder="e.g. LOTO annual refresher"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="course-builder-edition">
                Edition
              </label>
              <input
                id="course-builder-edition"
                className="form-control"
                value={props.form.edition}
                disabled={disabled}
                onChange={(event) =>
                  props.onFormChange({ ...props.form, edition: event.target.value })
                }
                placeholder="Optional version label"
              />
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="course-builder-description">
                Description
              </label>
              <textarea
                id="course-builder-description"
                className="form-control"
                rows={2}
                value={props.form.description}
                disabled={disabled}
                onChange={(event) =>
                  props.onFormChange({ ...props.form, description: event.target.value })
                }
                placeholder="What learners should know before taking the quiz"
              />
            </div>
            <div className="col-12">
              <div className="form-label">Groups / departments</div>
              <p className="text-muted small mb-2">
                Tag this course so it can be filtered by department or training cohort.
              </p>
              <div className="training-checkbox-panel">
                {groups.map((group) => {
                  const checked = props.form.groupIds.includes(group.id);
                  return (
                    <div key={group.id} className="form-check">
                      <input
                        id={`course-group-${group.id}`}
                        type="checkbox"
                        className="form-check-input"
                        checked={checked}
                        disabled={disabled || !canManage}
                        onChange={() =>
                          props.onFormChange({
                            ...props.form,
                            groupIds: checked
                              ? props.form.groupIds.filter((id) => id !== group.id)
                              : [...props.form.groupIds, group.id],
                          })
                        }
                      />
                      <label className="form-check-label" htmlFor={`course-group-${group.id}`}>
                        {group.name}
                      </label>
                    </div>
                  );
                })}
                {!groups.length ? (
                  <p className="text-muted small mb-0">
                    Create training groups first to organize courses by department.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="course-builder-materials-heading">
          <h6 id="course-builder-materials-heading" className="mb-2">
            Study materials
          </h6>
          <p className="text-muted small mb-3">
            Upload presentations, PDFs, videos, and other reference files learners review before the quiz.
          </p>
          {isCreate ? (
            <>
              <MaterialsUploadZone
                disabled={!canManage || disabled}
                uploading={uploadingMaterials}
                onFiles={(files) => {
                  if (!files?.length) return;
                  setCreateMaterialFiles((current) => [...current, ...files]);
                }}
              />
              {createMaterialFiles.length ? (
                <ul className="list-group list-group-flush mt-2">
                  {createMaterialFiles.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${index}`}
                      className="list-group-item d-flex justify-content-between align-items-center py-2"
                    >
                      <span className="small">{file.name}</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={disabled}
                        onClick={() =>
                          setCreateMaterialFiles((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : source ? (
            <>
              <MaterialsUploadZone
                disabled={!canManage || disabled}
                uploading={uploadingMaterials}
                onFiles={(files) => void handleEditMaterialUpload(files)}
              />
              <TrainingSourceMaterials
                source={source}
                materials={materials}
                folders={folders}
                canManage={canManage}
                busy={disabled}
                unlinkedMaterials={unlinkedMaterials}
                onRefreshMaterials={onRefreshMaterials}
                onRefreshFolders={onRefreshFolders}
                {...(onRefreshSources ? { onRefreshSources } : {})}
                onError={onError}
                layout="builder"
                showQuizImport={false}
                showUploadButtons={false}
              />
            </>
          ) : null}
        </section>

        <section aria-labelledby="course-builder-quiz-heading">
          <h6 id="course-builder-quiz-heading" className="mb-2">
            Quiz / test
          </h6>
          {isCreate ? (
            <div className="border rounded p-3 bg-light-subtle">
              <label className="form-label" htmlFor="course-builder-quiz-file">
                Quiz / test file
              </label>
              <input
                id="course-builder-quiz-file"
                type="file"
                className="form-control"
                disabled={disabled}
                accept=".csv,.xlsx,.xls,.pdf,.json,application/json,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={(event) => setCreateQuizFile(event.target.files?.[0] ?? null)}
              />
              {createQuizFile ? (
                <p className="small text-muted mt-2 mb-0">Selected: {createQuizFile.name}</p>
              ) : null}
              <div className="form-text mt-2">
                Excel, CSV, JSON, or PDF question banks import when the course is created.{" "}
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 align-baseline"
                  onClick={downloadQuestionImportCsvTemplate}
                >
                  CSV template
                </button>
                {" · "}
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 align-baseline"
                  onClick={downloadQuestionImportTemplate}
                >
                  JSON template
                </button>
              </div>
            </div>
          ) : source ? (
            <TrainingQuestionImportPanel
              sourceId={source.id}
              sourceTitle={source.title}
              disabled={disabled}
              onImported={async () => {
                await onRefreshSources?.();
              }}
              onError={onError}
            />
          ) : null}
        </section>

        <div className="d-flex flex-wrap gap-2 pt-2 border-top">
          {isCreate ? (
            <button type="submit" className="btn btn-primary" disabled={disabled}>
              {saving || uploadingMaterials ? "Creating…" : "Create course"}
            </button>
          ) : (
            <>
              <button type="submit" className="btn btn-primary" disabled={disabled}>
                {saving ? "Saving…" : "Save details"}
              </button>
              {props.mode === "edit" && props.onOpenAuthor ? (
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  disabled={disabled}
                  onClick={props.onOpenAuthor}
                >
                  Author questions
                </button>
              ) : null}
              {props.mode === "edit" && source?.status === "PUBLISHED" && props.onUnpublish ? (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={disabled}
                  onClick={() => void props.onUnpublish?.()}
                >
                  Unpublish
                </button>
              ) : null}
              {props.mode === "edit" && source?.status !== "PUBLISHED" && props.onPublish ? (
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={disabled}
                  onClick={() => void props.onPublish?.()}
                >
                  Publish
                </button>
              ) : null}
              {props.mode === "edit" && props.onDelete ? (
                <button
                  type="button"
                  className="btn btn-outline-danger ms-auto"
                  disabled={disabled}
                  onClick={() => void props.onDelete?.()}
                >
                  Archive course
                </button>
              ) : null}
            </>
          )}
          <button type="button" className="btn btn-outline-secondary" disabled={disabled} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </form>
  );
}
