import axios from 'axios';
import { message } from 'antd';

const api = axios.create({
  baseURL: '/api',
  timeout: 300000,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const uploadApi = axios.create({
  baseURL: '/api',
  timeout: 600000,
  headers: {}
});

const requestInterceptor = (config: any) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

const responseInterceptor = (response: any) => response;

const errorInterceptor = (error: any) => {
  if (error.response) {
    const { status, data } = error.response;
    
    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      message.error('登录已过期，请重新登录');
    } else if (status === 403) {
      message.error('权限不足，无法执行此操作');
    } else if (status === 404) {
      message.error('请求的资源不存在');
    } else if (status >= 500) {
      message.error('服务器错误，请稍后重试');
    } else if (data?.error) {
      message.error(data.error);
    }
  } else if (error.request) {
    message.error('网络错误，请检查连接');
  } else {
    message.error('请求失败');
  }
  
  return Promise.reject(error);
};

api.interceptors.request.use(requestInterceptor, (error) => Promise.reject(error));
api.interceptors.response.use(responseInterceptor, errorInterceptor);

uploadApi.interceptors.request.use(requestInterceptor, (error) => Promise.reject(error));
uploadApi.interceptors.response.use(responseInterceptor, errorInterceptor);

export default api;
