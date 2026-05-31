#include <QApplication>
#include <QDateTime>
#include <QSurfaceFormat>

#include "MainWindow.h"
#include "PlatformAdapter.h"

int main(int argc, char *argv[])
{
    QSurfaceFormat format;
    format.setSamples(8);
    format.setDepthBufferSize(24);
    QSurfaceFormat::setDefaultFormat(format);

    QApplication app(argc, argv);

    app.setApplicationName("ICC-Client");
    app.setApplicationDisplayName("工控外设统一管控平台");
    app.setApplicationVersion("1.0.0");
    app.setOrganizationName("ICC");

    PlatformAdapter::instance()->init();

    qSetMessagePattern("[%{time yyyy-MM-dd hh:mm:ss.zzz}] [%{type}] %{file}:%{line} - %{message}");

    MainWindow w;
    w.show();

    return app.exec();
}
