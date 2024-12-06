/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: [require.resolve('@repo/config-eslint/react')],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json'
  }
}
