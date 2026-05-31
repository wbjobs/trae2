#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>
#include <QStackedWidget>
#include <QTimer>

class DashboardPanel;
class DevicePanel;
class CommandPanel;
class StatusPanel;
class TemplatePanel;
class SchedulePanel;
class AlertDialog;
class ApiClient;
class WebSocketClient;
class DeviceModel;
class StatusModel;
class CommandModel;
class TemplateModel;
class ScheduledModel;
class QToolBar;
class QAction;
class QLabel;

struct Alert;

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    explicit MainWindow(QWidget *parent = nullptr);
    ~MainWindow() override;

protected:
    void closeEvent(QCloseEvent *event) override;

private slots:
    void onNavigate(int index);
    void updateConnectionStatus();
    void onServerConnected();
    void onServerDisconnected();
    void onServerError(const QString &error);
    void onAlertReceived(const Alert &alert);
    void showAlertCenter();

private:
    void setupUi();
    void setupMenu();
    void setupConnections();
    void setupModels();
    void updateAlertBadge();

    QStackedWidget *m_stackWidget;
    DashboardPanel *m_dashboardPanel;
    DevicePanel *m_devicePanel;
    CommandPanel *m_commandPanel;
    StatusPanel *m_statusPanel;
    TemplatePanel *m_templatePanel;
    SchedulePanel *m_schedulePanel;
    AlertDialog *m_alertDialog;

    ApiClient *m_apiClient;
    WebSocketClient *m_wsClient;

    DeviceModel *m_deviceModel;
    StatusModel *m_statusModel;
    CommandModel *m_commandModel;
    TemplateModel *m_templateModel;
    ScheduledModel *m_scheduledModel;

    QTimer *m_reconnectTimer;
    QTimer *m_statusTimer;

    QToolBar *m_topToolBar;
    QAction *m_alertAction;
    QLabel *m_alertBadgeLabel;
    QLabel *m_connectionLabel;
    QLabel *m_platformLabel;
    QLabel *m_timeLabel;

    bool m_isConnected;
};

#endif // MAINWINDOW_H
