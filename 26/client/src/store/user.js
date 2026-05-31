import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login as loginApi, logout as logoutApi, getUserInfo } from '@/api/auth'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  const userInfo = ref(JSON.parse(localStorage.getItem('userInfo') || 'null'))

  const login = async (credentials) => {
    const res = await loginApi(credentials)
    if (res.code === 200) {
      token.value = res.data.token
      userInfo.value = res.data.user
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('userInfo', JSON.stringify(res.data.user))
    }
    return res
  }

  const logout = async () => {
    try {
      await logoutApi()
    } finally {
      token.value = ''
      userInfo.value = null
      localStorage.removeItem('token')
      localStorage.removeItem('userInfo')
    }
  }

  const fetchUserInfo = async () => {
    const res = await getUserInfo()
    if (res.code === 200) {
      userInfo.value = res.data
      localStorage.setItem('userInfo', JSON.stringify(res.data))
    }
    return res
  }

  const updateUserInfo = (info) => {
    userInfo.value = { ...userInfo.value, ...info }
    localStorage.setItem('userInfo', JSON.stringify(userInfo.value))
  }

  const hasRole = (...roles) => {
    if (!userInfo.value) return false
    return roles.includes(userInfo.value.role)
  }

  return {
    token,
    userInfo,
    login,
    logout,
    fetchUserInfo,
    updateUserInfo,
    hasRole
  }
})
