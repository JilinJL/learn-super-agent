<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { blob, commit } from './upstream'

// kind="original": a copied English page; kind="translation": its Chinese translation.
const props = defineProps<{ kind: 'original' | 'translation' }>()
const { frontmatter, page } = useData()

const file = computed<string>(() => frontmatter.value.upstream)
const other = computed(() => {
  const path = '/' + page.value.relativePath.replace(/\.md$/, '')
  return props.kind === 'original'
    ? path.replace(/^\/upstream\//, '/translation/')
    : path.replace(/^\/translation\//, '/upstream/')
})
</script>

<template>
  <div class="upstream-banner">
    <template v-if="kind === 'original'">
      英文原文，未经改动，摘自 <a :href="`${blob}/${file}`" target="_blank" rel="noreferrer"><code>{{ file }}</code></a>
      @ <code>{{ commit.slice(0, 7) }}</code>，MIT 许可。
      <a :href="withBase(other)">读中文译文 →</a>
    </template>
    <template v-else>
      译文，对应上游 <a :href="`${blob}/${file}`" target="_blank" rel="noreferrer"><code>{{ file }}</code></a>
      @ <code>{{ commit.slice(0, 7) }}</code>。术语保留英文，以原文为准。
      <a :href="withBase(other)">对照英文原文 →</a>
    </template>
  </div>
</template>
