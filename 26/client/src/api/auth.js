import request from '@/utils/request'

export const login = (data) => request.post('/auth/login', data)
export const register = (data) => request.post('/auth/register', data)
export const logout = () => request.post('/auth/logout')
export const getUserInfo = () => request.get('/auth/profile')
export const updateProfile = (data) => request.put('/auth/profile', data)
export const updatePassword = (data) => request.put('/auth/password', data)
