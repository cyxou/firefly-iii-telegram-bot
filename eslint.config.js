import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['legacy/**', 'dist/**', 'docs/**', 'src/lib/firefly/generated/**', 'data/**'],
})
