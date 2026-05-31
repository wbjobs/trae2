# 非遗手工艺作品溯源档案全栈Web管理平台

## 项目简介

基于区块链思想的非遗手工艺作品溯源档案管理平台，实现作品从原料到成品的全生命周期追溯。

## 功能模块

- 📦 **档案管理** - 作品基础信息、图片、介绍管理
- 🔗 **溯源链查询** - 可视化展示作品完整生命周期
- 📋 **物料台账** - 原料采购、使用、库存管理
- 🚚 **流转记录** - 作品流转轨迹跟踪
- ✍️ **电子签章** - 数字签名、签章验证
- 🔐 **身份核验** - 对接第三方身份认证服务

## 技术栈

- **前端**: Vue 3 + Vite + Element Plus + ECharts
- **后端**: Node.js + Express.js + MySQL
- **认证**: JWT + 第三方身份核验
- **可视化**: ECharts 溯源链图

## 快速开始

```bash
# 安装所有依赖
npm run install:all

# 配置数据库
编辑 server/config/database.js

# 启动开发服务
npm run dev
```

## 项目结构

```
├── client/          # 前端Vue3应用
│   ├── src/
│   │   ├── api/     # API接口封装
│   │   ├── views/   # 页面组件
│   │   ├── components/  # 公共组件
│   │   ├── router/  # 路由配置
│   │   └── store/   # 状态管理
│   └── ...
├── server/          # 后端Express服务
│   ├── config/      # 配置文件
│   ├── models/      # 数据模型
│   ├── routes/      # 路由接口
│   ├── controllers/ # 业务逻辑
│   ├── middleware/  # 中间件
│   └── ...
└── package.json
```
