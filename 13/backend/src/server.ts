import { server } from './app';
import { config } from './config';

const PORT = config.port;

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     科研标本档案管理平台 - 后端服务                        ║
╠══════════════════════════════════════════════════════════╣
║  HTTP Server:     http://localhost:${PORT}                    ║
║  Socket.IO:       ws://localhost:${PORT}                      ║
║  Health Check:    http://localhost:${PORT}/api/health            ║
╠══════════════════════════════════════════════════════════╣
║  API Routes:                                              ║
║    /api/auth         认证模块                              ║
║    /api/users        用户模块                              ║
║    /api/departments  部门模块                              ║
║    /api/specimens    标本模块                              ║
║    /api/annotations  批注模块                              ║
║    /api/versions     版本模块                              ║
║    /api/files        文件模块                              ║
╚══════════════════════════════════════════════════════════╝
  `);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
