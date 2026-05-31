import request from '@/utils/request'

export function login(data: { username: string; password: string }) {
  return request({
    url: '/auth/login/',
    method: 'post',
    data,
  })
}

export function refreshToken(refresh: string) {
  return request({
    url: '/auth/refresh/',
    method: 'post',
    data: { refresh },
  })
}

export function getInfo() {
  return request({
    url: '/auth/profile/',
    method: 'get',
  })
}

export function logout() {
  return request({
    url: '/auth/logout/',
    method: 'post',
  })
}

export function getUserList(params?: any) {
  return request({
    url: '/auth/users/',
    method: 'get',
    params,
  })
}

export function createUser(data: any) {
  return request({
    url: '/auth/users/',
    method: 'post',
    data,
  })
}

export function updateUser(id: string, data: any) {
  return request({
    url: `/auth/users/${id}/`,
    method: 'put',
    data,
  })
}

export function deleteUser(id: string) {
  return request({
    url: `/auth/users/${id}/`,
    method: 'delete',
  })
}

export function getRoleList(params?: any) {
  return request({
    url: '/auth/roles/',
    method: 'get',
    params,
  })
}
