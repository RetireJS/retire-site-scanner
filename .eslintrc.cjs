/* eslint-env node */
require("@rushstack/eslint-patch/modern-module-resolution");

module.exports = {
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 12,
    "sourceType": "module"
  },
  "plugins": [
    "@typescript-eslint", 
    "prettier"
  ],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"  
  ],
  "rules": {
    "@typescript-eslint/no-var-requires" : "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "prettier/prettier" : 2,
  },
  "env": {
    "browser": false,
    "es2022": true
  },
  "ignorePatterns": ["dist/*"],
};
