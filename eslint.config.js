// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    rules: {
      // Full-width spaces are used deliberately: as a display separator in
      // Japanese bot replies (template literals) and to normalize
      // full-width user input in command parsing (regex literals).
      "no-irregular-whitespace": ["error", { skipTemplates: true, skipRegExps: true }],
    },
  },
);
