import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

import path from "path";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ESLint 10 compatibility shim for legacy plugins (e.g., eslint-plugin-react)
try {
  const fileContextPath = path.resolve(__dirname, "node_modules/eslint/lib/linter/file-context.js");
  const { FileContext } = require(fileContextPath);
  if (FileContext && !FileContext.prototype.getFilename) {
    FileContext.prototype.getFilename = function () {
      return this.filename;
    };
    FileContext.prototype.getPhysicalFilename = function () {
      return this.physicalFilename;
    };
    FileContext.prototype.getSourceCode = function () {
      return this.sourceCode;
    };
    FileContext.prototype.getCwd = function () {
      return this.cwd;
    };
  }
} catch {
  // Ignore if FileContext is internal or cannot be resolved
}

// Ensure eslint-plugin-react doesn't attempt dynamic version detection via legacy APIs
for (const config of nextCoreWebVitals) {
  if (config.settings?.react) {
    config.settings.react.version = "19.0.0";
  }
}

const eslintConfig = [
  {
    settings: {
      react: {
        version: "19.0.0",
      },
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".kilo/**",
      "out/**",
      "build/**",
      "dist/**",
      "android/**",
      ".agents/**",
      "public/**",
      "next-env.d.ts",
      "examples/**",
      "skills/**",
      ".system_generated/**",
      "tests-examples/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // TypeScript rules (MP-36: stabilization profile — warn first, then error)
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/prefer-as-const": "off",
      
      // React rules
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
      "react/prop-types": "off",
      "react-compiler/react-compiler": "off",
      
      // Next.js rules
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-location-assign-relative-destination": "off",
      
      // General JavaScript rules (MP-36: real bugs must not be silenced).
      // NOTE: no-undef stays off — with jsx:react-jsx + TypeScript, `React`
      // UMD references are false positives; tsc already covers undefined names.
      "prefer-const": "off",
      "no-unused-vars": "off",
      "no-console": "off",
      "no-debugger": "error",
      "no-empty": "off",
      "no-irregular-whitespace": "off",
      "no-case-declarations": "off",
      "no-fallthrough": "error",
      "no-mixed-spaces-and-tabs": "off",
      "no-redeclare": "off",
      "no-undef": "off",
      "no-unreachable": "error",
      "no-useless-escape": "off",
    },
  },
];

export default eslintConfig;
