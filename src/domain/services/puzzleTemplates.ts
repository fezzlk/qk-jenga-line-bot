export type PuzzleTemplate = {
  id: string;
  label: string;
  text: string;
};

// A small starter set so a group can play without preparing their own text.
// Add more freely — this is plain data, no code changes needed elsewhere.
export const PUZZLE_TEMPLATES: PuzzleTemplate[] = [
  { id: "1", label: "ことわざ1", text: "石の上にも三年" },
  { id: "2", label: "ことわざ2", text: "猿も木から落ちる" },
  { id: "3", label: "四字熟語", text: "一石二鳥" },
];

export function findTemplateById(id: string): PuzzleTemplate | undefined {
  return PUZZLE_TEMPLATES.find((t) => t.id === id);
}

export function listTemplatesText(): string {
  return PUZZLE_TEMPLATES.map((t) => `${t.id}: ${t.label}`).join("\n");
}
