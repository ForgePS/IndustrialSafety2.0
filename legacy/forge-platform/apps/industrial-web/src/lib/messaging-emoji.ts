/** Curated emoji set for the messaging composer (no third-party picker dependency). */
export const MESSAGING_EMOJI_GROUPS: ReadonlyArray<{
  label: string;
  emojis: readonly string[];
}> = [
  {
    label: "Smileys",
    emojis: [
      "😀",
      "😁",
      "😂",
      "🤣",
      "😊",
      "😍",
      "🤩",
      "😉",
      "😎",
      "🤔",
      "😐",
      "😴",
      "😮",
      "😢",
      "😭",
      "😤",
      "🤯",
      "🥳",
      "😇",
      "🤗",
    ],
  },
  {
    label: "Gestures",
    emojis: [
      "👍",
      "👎",
      "👏",
      "🙌",
      "🙏",
      "👌",
      "✌️",
      "🤞",
      "🤝",
      "💪",
      "👋",
      "🫡",
      "👀",
      "🧠",
      "❤️",
      "🔥",
      "✅",
      "❌",
      "⚠️",
      "⭐",
    ],
  },
  {
    label: "Work",
    emojis: [
      "🛠️",
      "🔧",
      "⚙️",
      "🏭",
      "🚜",
      "🚚",
      "🦺",
      "⛑️",
      "📋",
      "📌",
      "📝",
      "📅",
      "⏰",
      "📞",
      "💬",
      "📎",
      "📁",
      "📦",
      "🚨",
      "🛑",
    ],
  },
];

export function insertTextAtSelection(
  value: string,
  insert: string,
  selectionStart: number,
  selectionEnd: number,
): { next: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const next = `${value.slice(0, start)}${insert}${value.slice(end)}`;
  return { next, caret: start + insert.length };
}
