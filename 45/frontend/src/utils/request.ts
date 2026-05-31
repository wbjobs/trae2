import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';

const service: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const uploadService: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 600000,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  headers: {
    'Content-Type': 'multipart/form-data'
  }
});

uploadService.interceptors.request.use(
  (config) => {
    const userStore = useUserStore();
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

uploadService.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data;
    if (res.status === 'success') {
      return res;
    } else {
      ElMessage.error(res.message || '上传失败');
      return Promise.reject(new Error(res.message || '上传失败'));
    }
  },
  (error) => {
    if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
      ElMessage.error('上传超时，请检查网络连接或尝试上传较小的文件');
    } else if (error.response) {
      const { status, data } = error.response;
      if (status === 401) {
        ElMessageBox.confirm('登录已过期，请重新登录', '提示', {
          confirmButtonText: '重新登录',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          const userStore = useUserStore();
          userStore.logout();
          window.location.href = '/login';
        });
      } else if (status === 413) {
        ElMessage.error('文件过大，请上传小于500MB的文件');
      } else {
        ElMessage.error(data?.message || error.message || '上传失败');
      }
    } else {
      ElMessage.error('网络错误，请检查网络连接');
    }
    return Promise.reject(error);
  }
);

service.interceptors.request.use(
  (config) => {
    const userStore = useUserStore();
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

service.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data;
    if (res.status === 'success') {
      return res;
    } else {
      ElMessage.error(res.message || '请求失败');
      return Promise.reject(new Error(res.message || '请求失败'));
    }
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      if (status === 401) {
        ElMessageBox.confirm('登录已过期，请重新登录', '提示', {
          confirmButtonText: '重新登录',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          const userStore = useUserStore();
          userStore.logout();
          window.location.href = '/login';
        });
      } else if (status === 403) {
        ElMessage.error(data?.message || '没有权限执行此操作');
      } else if (status === 404) {
        ElMessage.error(data?.message || '请求的资源不存在');
      } else if (status >= 500) {
        ElMessage.error(data?.message || '服务器错误，请稍后重试');
      } else {
        ElMessage.error(data?.message || error.message);
      }
    } else {
      ElMessage.error('网络错误，请检查网络连接');
    }
    return Promise.reject(error);
  }
);

export default service;
