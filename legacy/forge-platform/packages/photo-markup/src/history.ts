import type { PhotoAnnotation } from "./types.js";

const MAX_HISTORY = 50;

export type HistorySnapshot = PhotoAnnotation[];

export class HistoryManager {
  private past: HistorySnapshot[] = [];
  private future: HistorySnapshot[] = [];

  push(current: HistorySnapshot): void {
    this.past.push(cloneAnnotations(current));
    if (this.past.length > MAX_HISTORY) {
      this.past.shift();
    }
    this.future = [];
  }

  undo(current: HistorySnapshot): HistorySnapshot | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(cloneAnnotations(current));
    return previous;
  }

  redo(current: HistorySnapshot): HistorySnapshot | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(cloneAnnotations(current));
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}

function cloneAnnotations(annotations: HistorySnapshot): HistorySnapshot {
  return annotations.map((a) => {
    const copy: PhotoAnnotation = { ...a };
    if (a.points) copy.points = [...a.points];
    return copy;
  });
}
