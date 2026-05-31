import Cookies from 'js-cookie'

const state = {
  sidebar: {
    opened: Cookies.get('sidebarStatus') ? !!+Cookies.get('sidebarStatus')! : true,
    withoutAnimation: false,
  },
  language: Cookies.get('language') || 'zh',
}

const mutations = {
  TOGGLE_SIDEBAR: (state: any) => {
    state.sidebar.opened = !state.sidebar.opened
    state.sidebar.withoutAnimation = false
    if (state.sidebar.opened) {
      Cookies.set('sidebarStatus', '1')
    } else {
      Cookies.set('sidebarStatus', '0')
    }
  },
  CLOSE_SIDEBAR: (state: any, withoutAnimation: boolean) => {
    Cookies.set('sidebarStatus', '0')
    state.sidebar.opened = false
    state.sidebar.withoutAnimation = withoutAnimation
  },
  SET_LANGUAGE: (state: any, language: string) => {
    state.language = language
    Cookies.set('language', language)
  },
}

const actions = {
  toggleSideBar({ commit }: any) {
    commit('TOGGLE_SIDEBAR')
  },
  closeSideBar({ commit }: any, { withoutAnimation }: any) {
    commit('CLOSE_SIDEBAR', withoutAnimation)
  },
  setLanguage({ commit }: any, language: string) {
    commit('SET_LANGUAGE', language)
  },
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
}
