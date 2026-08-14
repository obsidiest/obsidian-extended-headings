import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  ...obsidianmd.configs.recommended,
  {
    ignores: ["dist/**", "release/**", "coverage/**"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", { acronyms: ["H1", "H12"] }],
    },
  },
  {
    files: ["tests/**/*.mjs"],
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/no-test-function": "off",
    },
  },
  {
    files: ["esbuild.config.mjs"],
    rules: {
      "obsidianmd/no-global-this": "off",
      "obsidianmd/no-nodejs-modules": "off",
    },
  },
];
