<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'

// A reference to an upstream document, translated and original:
// <Doc page="002-authorization" anchor="strength">Strength</Doc>
const props = defineProps<{ page: string; anchor?: string }>()

const hash = computed(() => (props.anchor ? `#${props.anchor}` : ''))
</script>

<template>
  <span class="doc-ref"><a :href="withBase(`/translation/${page}${hash}`)"><slot>{{ page }}</slot></a><a
      class="doc-ref-en" :href="withBase(`/upstream/${page}${hash}`)" title="英文原文">EN</a></span>
</template>
