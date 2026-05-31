<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
      <div class="logo">
        <i class="el-icon-microphone"></i>
        <h1>实验室仪器预约追溯系统</h1>
      </div>
      <p class="subtitle">科学仪器 · 智能预约 · 全程追溯</p>
    </div>
    <el-form
      ref="loginForm"
      :model="loginForm"
      :rules="loginRules"
      class="login-form"
      @keyup.enter.native="handleLogin"
    >
      <el-form-item prop="username">
        <el-input
          v-model="loginForm.username"
          placeholder="请输入用户名"
          prefix-icon="el-icon-user"
          size="large"
        ></el-input>
      </el-form-item>
      <el-form-item prop="password">
        <el-input
          v-model="loginForm.password"
          type="password"
          placeholder="请输入密码"
          prefix-icon="el-icon-lock"
          size="large"
          show-password
          @keyup.enter.native="handleLogin"
        ></el-input>
      </el-form-item>
      <el-form-item>
        <el-checkbox v-model="loginForm.remember">记住密码</el-checkbox>
      </el-form-item>
      <el-button
        type="primary"
        size="large"
        class="login-btn"
        :loading="loading"
        @click.native.prevent="handleLogin"
      >
        登 录
      </el-button>
    </el-form>
    <div class="login-footer">
      <p>默认账号：admin / admin123</p>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, reactive, ref } from 'vue'

export default defineComponent({
  name: 'Login',
  setup() {
    const loginForm = reactive({
      username: '',
      password: '',
      remember: false,
    })

    const validateUsername = (rule: any, value: string, callback: any) => {
      if (!value) {
        return callback(new Error('请输入用户名'))
      }
      callback()
    }

    const validatePassword = (rule: any, value: string, callback: any) => {
      if (!value) {
        return callback(new Error('请输入密码'))
      }
      callback()
    }

    const loginRules = {
      username: [{ validator: validateUsername, trigger: 'blur' }],
      password: [{ validator: validatePassword, trigger: 'blur' }],
    }

    return {
      loginForm,
      loginRules,
    }
  },
  data() {
    return {
      loading: false,
      loginFormRef: null as any,
    }
  },
  methods: {
    async handleLogin() {
      try {
        await (this.$refs.loginForm as any).validate()
        this.loading = true
        await this.$store.dispatch('user/login', this.loginForm)
        this.$message.success('登录成功')
        this.$router.push({ path: '/dashboard' })
      } catch (error) {
        console.error(error)
      } finally {
        this.loading = false
      }
    },
  },
})
</script>

<style lang="scss" scoped>
.login-container {
  min-height: 100vh;
  width: 100%;
  background: linear-gradient(135deg, #165dff 0%, #0033a0 100%);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;

  &::before {
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%);
    pointer-events: none;
  }

  .login-box {
    position: relative;
    width: 420px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    padding: 40px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.6s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .login-header {
    text-align: center;
    margin-bottom: 30px;

    .logo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;

      i {
        font-size: 48px;
        color: $primary-color;
      }

      h1 {
        font-size: 24px;
        font-weight: 600;
        color: $text-primary;
        margin: 0;
      }
    }

    .subtitle {
      margin-top: 12px;
      color: $text-secondary;
      font-size: 14px;
    }
  }

  .login-form {
    .login-btn {
      width: 100%;
      height: 44px;
      font-size: 16px;
      border-radius: 8px;
      background: linear-gradient(135deg, $primary-color 0%, #4080ff 100%);
      border: none;
      transition: all 0.3s;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(22, 93, 255, 0.4);
      }
    }
  }

  .login-footer {
    margin-top: 20px;
    text-align: center;

    p {
      color: $text-secondary;
      font-size: 12px;
    }
  }
}
</style>
