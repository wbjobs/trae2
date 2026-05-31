import request from '@/utils/request'

export function getReservationList(params?: any) {
  return request({
    url: '/reservations/',
    method: 'get',
    params,
  })
}

export function getReservationDetail(id: string) {
  return request({
    url: `/reservations/${id}/`,
    method: 'get',
  })
}

export function createReservation(data: any) {
  return request({
    url: '/reservations/',
    method: 'post',
    data,
  })
}

export function updateReservation(id: string, data: any) {
  return request({
    url: `/reservations/${id}/`,
    method: 'patch',
    data,
  })
}

export function cancelReservation(id: string) {
  return request({
    url: `/reservations/${id}/`,
    method: 'delete',
  })
}

export function getCalendarData(params?: any) {
  return request({
    url: '/reservations/calendar/',
    method: 'get',
    params,
  })
}

export function approveReservation(id: string, data?: any) {
  return request({
    url: `/reservations/${id}/approve/`,
    method: 'post',
    data,
  })
}

export function rejectReservation(id: string, data: any) {
  return request({
    url: `/reservations/${id}/reject/`,
    method: 'post',
    data,
  })
}
