import antfu from '@antfu/eslint-config'

export default antfu({
  rules: {
    'no-console': 0,
    'unicorn/prefer-dom-node-text-content': 0,
  },
})
