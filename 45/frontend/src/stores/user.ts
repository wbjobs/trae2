import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { User, UserRole } from '@/types';
import { login as apiLogin, getCurrentUser } from '@/api/auth';

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(localStorage.getItem('token') || '');
  const user = ref<User | null>(null);
  const loaded = ref(false);

  const isLoggedIn = computed(() => !!token.value);
  const userRole = computed(() => user.value?.role || 'viewer');
  const userName = computed(() => user.value?.realName || user.value?.username || '');

  const hasPermission = (...roles: UserRole[]) => {
    if (!user.value) return false;
    return roles.includes(user.value.role);
  };

  const login = async (username: string, password: string) => {
    const res = await apiLogin({ username, password });
    if (res.token && res.data?.user) {
      token.value = res.token;
      user.value = res.data.user;
      localStorage.setItem('token', res.token);
    }
    return res;
  };

  const fetchUserInfo = async () => {
    try {
      const res = await getCurrentUser();
      if (res.data?.user) {
        user.value = res.data.user;
      }
      loaded.value = true;
    } catch (err) {
      logout();
      loaded.value = true;
    }
  };

  const logout = () => {
    token.value = '';
    user.value = null;
    localStorage.removeItem('token');
  };

  return {
    token,
    user,
    loaded,
    isLoggedIn,
    userRole,
    userName,
    hasPermission,
    login,
    fetchUserInfo,
    logout
  };
});
