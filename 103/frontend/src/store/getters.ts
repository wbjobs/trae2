const getters = {
  token: (state: any) => state.user.token,
  userInfo: (state: any) => state.user.userInfo,
  roles: (state: any) => state.user.roles,
  permissions: (state: any) => state.user.permissions,
  sidebar: (state: any) => state.app.sidebar,
  language: (state: any) => state.app.language,
}

export default getters
