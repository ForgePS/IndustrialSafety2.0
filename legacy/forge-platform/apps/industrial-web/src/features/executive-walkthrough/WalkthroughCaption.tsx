"use client";

type Props = { text: string };

export function WalkthroughCaption({ text }: Props) {
  return (
    <div className="exec-walkthrough-caption" aria-live="polite">
      <p>{text}</p>
    </div>
  );
}
