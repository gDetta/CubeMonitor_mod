import jsdoc from "eslint-plugin-jsdoc";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["nodes/lib/*", "nodes/icons/*","test/acquisitionMockFunc.js"],
}, ...compat.extends("eslint:recommended", "eslint-config-prettier"), {
    plugins: {
        jsdoc,
    },

    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.node,
            ...globals.mocha,
        },

        ecmaVersion: 2015,
        sourceType: "commonjs",
    },

    rules: {
        "jsdoc/check-param-names": 1,
        "jsdoc/check-tag-names": 1,
        "jsdoc/check-types": 1,
        "jsdoc/no-undefined-types": 1,
        "jsdoc/require-description-complete-sentence": 1,
        "jsdoc/require-example": 0,
        "jsdoc/require-hyphen-before-param-description": 1,
        "jsdoc/require-param": 1,
        "jsdoc/require-param-description": 1,
        "jsdoc/require-param-name": 1,
        "jsdoc/require-param-type": 1,
        "jsdoc/require-returns-description": 1,
        "jsdoc/require-returns-type": 1,
        "jsdoc/valid-types": 1,
        "no-console": "warn",
        "no-unused-expressions": "warn",
        "no-inline-comments": "off",
        "jsdoc/require-jsdoc": ["warn", {
            require: {
                ArrowFunctionExpression: true,
                ClassDeclaration: true,
                FunctionDeclaration: true,
                FunctionExpression: true,
                MethodDefinition: true,
            },
        
            "minLineCount":4
        }],
        "no-unused-vars": [
                "error",
                {
                    caughtErrors: "none"
                }
            ]
    },
}];