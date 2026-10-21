"use client";

type Props = {
  playing: boolean;
  muted: boolean;
  captions: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRestart: () => void;
  onToggleMute: () => void;
  onToggleCaptions: () => void;
  onDownloadMp4: () => void;
  onExit: () => void;
  onFullscreen: () => void;
};

export function WalkthroughControls(props: Props) {
  return (
    <div className="exec-walkthrough-controls" role="toolbar" aria-label="Presentation controls">
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={props.onPrevious}>
        Prev
      </button>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={props.playing ? props.onPause : props.onPlay}
      >
        {props.playing ? "Pause" : "Play"}
      </button>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={props.onNext}>
        Next
      </button>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={props.onToggleMute}>
        {props.muted ? "Unmute" : "Mute"}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={props.onToggleCaptions}
      >
        CC
      </button>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={props.onFullscreen}>
        Full
      </button>
      <button type="button" className="btn btn-sm btn-outline-danger" onClick={props.onExit}>
        Exit
      </button>
    </div>
  );
}
