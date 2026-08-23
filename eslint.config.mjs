import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    /*
     * The app renders inside <LazyMotion strict>, which loads only the
     * domAnimation feature set to keep the Motion bundle small (GUIDE §15
     * rule 17). Importing `motion` rather than `m` pulls the full bundle back
     * in, and strict mode responds by throwing at runtime — on the client
     * only, so it survives a build, a typecheck, and any server-rendered
     * smoke test, and first appears in front of whoever opens the page.
     *
     * Catching it here turns a class of runtime crash into a lint error.
     */
    files: ["components/**/*.tsx", "app/**/*.tsx"],
    ignores: ["components/motion/motion-provider.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "motion/react",
              importNames: ["motion"],
              message:
                "Use `m` instead of `motion`. LazyMotion runs in strict mode; importing `motion` breaks tree shaking and throws at runtime.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
