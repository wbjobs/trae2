import { login, logout, getInfo } from '@/api/user'
import { getToken, setToken, removeToken } from '@/utils/auth'
import { resetRouter } from '@/router'

const state = {
  token: getToken() || '',
  userInfo: null as any,
  roles: [] as string[],
  permissions: [] as string[],
}

const mutations = {
  SET_TOKEN: (state: any, token: string) => {
    state.token = token
  },
  SET_USER_INFO: (state: any, userInfo: any) => {
    state.userInfo = userInfo
  },
  SET_ROLES: (state: any, roles: string[]) => {
    state.roles = roles
  },
  SET_PERMISSIONS: (state: any, permissions: string[]) => {
    state.permissions = permissions
  },
}

const actions = {
  login({ commit }: any, userInfo: any) {
    const { username, password } = userInfo
    return new Promise((resolve, reject) => {
      login({ username: username.trim(), password })
        .then((response: any) => {
          const { access } = response.data
          commit('SET_TOKEN', access)
          setToken(access)
          resolve(response)
        })
        .catch((error) => {
          reject(error)
        })
    })
  },

  getInfo({ commit, state }: any) {
    return new Promise((resolve, reject) => {
      getInfo()
        .then((response: any) => {
          const { data } = response
          if (!data) {
            reject('Verification failed, please Login again.')
            return
          }
          const { role, permissions } = data
          commit('SET_USER_INFO', data)
          commit('SET_ROLES', [role])
          commit('SET_PERMISSIONS', permissions || [])
          resolve(data)
        })
        .catch((error) => {
          reject(error)
        })
    })
  },

  logout({ commit, state }: any) {
    return new Promise((resolve, reject) => {
      logout()
        .then(() => {
          commit('SET_TOKEN', '')
          commit('SET_ROLES', [])
          commit('SET_PERMISSIONS', [])
          commit('SET_USER_INFO', null)
          removeToken()
          resetRouter()
          resolve(null)
        })
        .catch((error) => {
          reject(error)
        })
    })
  },

  resetToken({ commit }: any) {
    return new Promise((resolve) => {
      commit('SET_TOKEN', '')
      commit('SET_ROLES', [])
      commit('SET_PERMISSIONS', [])
      commit('SET_USER_INFO', null)
      removeToken()
      resolve(null)
    })
  },
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
}
