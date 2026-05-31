import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Message, MessageBox } from 'element-ui'
import store from '@/store'
import { getToken } from '@/utils/auth'

const service: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

service.interceptors.request.use(
  (config: AxiosRequestConfig) => {
    if (store.getters.token) {
      config.headers['Authorization'] = `Bearer ${getToken()}`
    }
    config.headers['Content-Type'] = 'application/json'
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

service.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data
    if (res.code && res.code !== 200) {
      Message({
        message: res.message || 'Error',
        type: 'error',
        duration: 5 * 1000,
      })

      if (res.code === 401 || res.code === 403) {
        MessageBox.confirm('您已被登出，请重新登录', '确认登出', {
          confirmButtonText: '重新登录',
          cancelButtonText: '取消',
          type: 'warning',
        }).then(() => {
          store.dispatch('user/resetToken').then(() => {
            location.reload()
          })
        })
      }
      return Promise.reject(new Error(res.message || 'Error'))
    }
    return res
  },
  (error) => {
    console.error('Request Error:', error)
    Message({
      message: error.response?.data?.message || error.message || '网络错误',
      type: 'error',
      duration: 5 * 1000,
    })
    return Promise.reject(error)
  }
)

export default service
