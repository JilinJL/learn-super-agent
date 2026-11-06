import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import UpstreamBanner from './UpstreamBanner.vue'
import Src from './Src.vue'
import Doc from './Doc.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('UpstreamBanner', UpstreamBanner)
    app.component('Src', Src)
    app.component('Doc', Doc)
  },
} satisfies Theme
