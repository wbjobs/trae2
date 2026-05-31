declare module '*.vue' {
  import Vue from 'vue'
  export default Vue
}

declare module 'vue/types/vue' {
  interface Vue {
    $http: any
    $message: any
    $confirm: any
    $notify: any
    $loading: any
  }
}

declare module 'element-ui'
declare module 'element-ui/lib/locale/lang/zh-CN'
declare module 'nprogress'
declare module 'js-cookie'
