"use client";

type Props = {
  stepIndex: number;
  total: number;
  title: string;
};

export function WalkthroughProgress({ stepIndex, total, title }: Props) {
  const pct = total > 0 ? Math.round(((stepIndex + 1) / total) * 100) : 0;
  return (
    <div className="exec-walkthrough-progress" aria-label="Presentation progress">
      <div className="exec-walkthrough-progress-meta">
        <span>
          Scene {stepIndex + 1} of {total}
        </span>
        <strong>{title}</strong>
      </div>
      <div className="progress" style={{ height: 6 }}>
        <div className="progress-bar" role="progressbar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
