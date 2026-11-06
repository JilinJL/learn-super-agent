<script setup lang="ts">
import { computed } from 'vue'
import { blob } from './upstream'

// A permalink to an upstream file at the pinned commit: <Src path="src/core/engine.ts" lines="10-20" />
const props = defineProps<{ path: string; lines?: string; label?: string }>()

const href = computed(() => {
  if (!props.lines) return `${blob}/${props.path}`
  const [from, to] = props.lines.split('-')
  return `${blob}/${props.path}#L${from}` + (to ? `-L${to}` : '')
})
const text = computed(() => props.label ?? props.path + (props.lines ? `:${props.lines}` : ''))
</script>

<template>
  <a class="src-link" :href="href" target="_blank" rel="noreferrer"><code>{{ text }}</code></a>
</template>
