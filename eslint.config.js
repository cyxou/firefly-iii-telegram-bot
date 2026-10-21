import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['legacy/**', 'dist/**', 'src/lib/firefly/generated/**', 'data/**'],
})
