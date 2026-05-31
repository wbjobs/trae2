import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import ElementUI from 'element-ui'
import 'element-ui/lib/theme-chalk/index.css'
import locale from 'element-ui/lib/locale/lang/zh-CN'
import './styles/index.scss'
import './permission'
import * as filters from './filters'

Vue.use(ElementUI, { locale, size: 'small' })

Object.keys(filters).forEach((key) => {
  Vue.filter(key, (filters as any)[key])
})

Vue.config.productionTip = false

new Vue({
  router,
  store,
  render: (h) => h(App),
}).$mount('#app')
