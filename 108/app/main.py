import os
import json
from sanic import Sanic, Request, json
from sanic.response import HTTPResponse
from sanic_cors import CORS
from app.core import (
    settings,
    log,
    init_db,
    close_db,
    init_es,
    close_es,
    AppException,
    error_response,
    success,
    async_session
)
from app.api import auth_bp, document_bp, search_bp, ai_bp, task_bp, export_bp
from app.modules.tasks import task_queue
from app.modules.auth import PermissionService, UserService
from app.modules.ai import AIService


def create_app() -> Sanic:
    app = Sanic(
        settings.APP_NAME,
        config={
            "DEBUG": settings.DEBUG,
            "KEEP_ALIVE": True,
            "REQUEST_TIMEOUT": 120,
            "RESPONSE_TIMEOUT": 120,
            "CORS_SUPPORTS_CREDENTIALS": True,
            "CORS_ORIGINS": "*",
        }
    )

    CORS(app)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.EXPORT_DIR, exist_ok=True)
    os.makedirs("./data", exist_ok=True)
    os.makedirs("./logs", exist_ok=True)

    app.blueprint(auth_bp)
    app.blueprint(document_bp)
    app.blueprint(search_bp)
    app.blueprint(ai_bp)
    app.blueprint(task_bp)
    app.blueprint(export_bp)

    @app.middleware("request")
    async def log_request(request: Request):
        if settings.DEBUG:
            log.debug(f"[{request.method}] {request.path} - IP: {request.ip}")

    @app.middleware("response")
    async def add_security_headers(request: Request, response: HTTPResponse):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response

    @app.exception(AppException)
    async def handle_app_exception(request: Request, exception: AppException):
        log.warning(f"业务异常: {exception.code} - {exception.message}")
        return error_response(exception)

    @app.exception(Exception)
    async def handle_general_exception(request: Request, exception: Exception):
        log.exception(f"未处理的异常: {str(exception)}")
        from app.core import InternalErrorException
        return error_response(InternalErrorException(str(exception)))

    @app.get("/")
    async def health_check(request: Request):
        return success({
            "app": settings.APP_NAME,
            "version": "1.0.0",
            "status": "running",
            "debug": settings.DEBUG,
            "queue_status": task_queue.get_queue_status()
        }, "系统运行正常")

    @app.get("/api/health")
    async def api_health(request: Request):
        queue_status = task_queue.get_queue_status()
        return success({
            "app": settings.APP_NAME,
            "env": settings.APP_ENV,
            "status": "healthy",
            "timestamp": request.headers.get("x-request-start"),
            "queue": queue_status
        })

    @app.before_server_start
    async def on_startup(app, loop):
        log.info("=" * 60)
        log.info(f"启动 {settings.APP_NAME}...")
        log.info(f"环境: {settings.APP_ENV} | 端口: {settings.APP_PORT} | Debug: {settings.DEBUG}")
        log.info("=" * 60)

        try:
            await init_db()
            async with async_session() as db:
                await PermissionService.init_default_permissions(db)

                admin = await UserService.get_user_by_username(db, "admin")
                if not admin:
                    await UserService.create_user(
                        db,
                        username="admin",
                        email="admin@legal-ai.com",
                        password="admin123",
                        full_name="系统管理员",
                        role_names=["admin"]
                    )
                    admin = await UserService.get_user_by_username(db, "admin")
                    if admin:
                        admin.is_superuser = True
                        await db.commit()
                    log.info("创建默认管理员账号: admin/admin123")

        except Exception as e:
            log.error(f"数据库初始化失败: {str(e)}")

        try:
            await init_es()
        except Exception as e:
            log.warning(f"Elasticsearch 连接失败: {str(e)}")
            log.warning("请确保 Elasticsearch 服务已启动并正确配置")

        await task_queue.start()
        log.info(">>> 系统启动完成 <<<")

    @app.after_server_stop
    async def on_shutdown(app, loop):
        log.info("正在关闭系统...")

        await task_queue.stop()
        await AIService.close()
        await close_es()
        await close_db()

        log.info(">>> 系统已关闭 <<<")

    return app


app = create_app()


def main():
    try:
        app.run(
            host=settings.APP_HOST,
            port=settings.APP_PORT,
            dev=settings.DEBUG,
            auto_reload=settings.DEBUG,
            workers=1 if settings.DEBUG else 2,
            access_log=settings.DEBUG
        )
    except KeyboardInterrupt:
        log.info("用户中断，正在退出...")
    except Exception as e:
        log.exception(f"系统启动失败: {str(e)}")
        raise


if __name__ == "__main__":
    main()
