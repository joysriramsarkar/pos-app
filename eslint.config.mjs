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
      ".open-next/**",
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
      // TypeScript rules
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/prefer-as-const": "off",
      "@typescript-eslint/no-unused-disable-directive": "off",
      
      // React rules
      "react-hooks/exhaustive-deps": "off",
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
      
      // General JavaScript rules
      "prefer-const": "off",
      "no-unused-vars": "off",
      "no-console": "off",
      "no-debugger": "off",
      "no-empty": "off",
      "no-irregular-whitespace": "off",
      "no-case-declarations": "off",
      "no-fallthrough": "off",
      "no-mixed-spaces-and-tabs": "off",
      "no-redeclare": "off",
      "no-undef": "off",
      "no-unreachable": "off",
      "no-useless-escape": "off",
    },
  },
];

export default eslintConfig;
