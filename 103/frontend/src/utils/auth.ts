import Cookies from 'js-cookie'

const TokenKey = 'lab_reservation_token'

export function getToken() {
  return Cookies.get(TokenKey)
}

export function setToken(token: string) {
  return Cookies.set(TokenKey, token, { expires: 7 })
}

export function removeToken() {
  return Cookies.remove(TokenKey)
}
