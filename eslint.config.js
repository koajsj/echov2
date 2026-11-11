import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**"] },
  tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    rules: {
      "no-unused-vars": "error",
      "no-unreachable": "error",
      "no-dupe-args": "error",
      "no-debugger": "error",
    },
  },
  {
    files: ["*.js", "scripts/**/*.mjs", "src/server/**/*.ts", "vite.config.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/client/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": hooks },
    rules: hooks.configs.recommended.rules,
  },
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
);
