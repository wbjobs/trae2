#include "MainWindow.h"

#include <QApplication>
#include <QDateTime>
#include <QLabel>
#include <QLayout>
#include <QListWidget>
#include <QMessageBox>
#include <QStatusBar>
#include <QTimer>
#include <QToolBar>
#include <QAction>

#include "DashboardPanel.h"
#include "DevicePanel.h"
#include "CommandPanel.h"
#include "StatusPanel.h"
#include "TemplatePanel.h"
#include "SchedulePanel.h"
#include "AlertDialog.h"
#include "ApiClient.h"
#include "WebSocketClient.h"
#include "DeviceModel.h"
#include "StatusModel.h"
#include "CommandModel.h"
#include "TemplateModel.h"
#include "ScheduledModel.h"
#include "PlatformAdapter.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , m_stackWidget(nullptr)
    , m_dashboardPanel(nullptr)
    , m_devicePanel(nullptr)
    , m_commandPanel(nullptr)
    , m_statusPanel(nullptr)
    , m_templatePanel(nullptr)
    , m_schedulePanel(nullptr)
    , m_alertDialog(nullptr)
    , m_apiClient(nullptr)
    , m_wsClient(nullptr)
    , m_deviceModel(nullptr)
    , m_statusModel(nullptr)
    , m_commandModel(nullptr)
    , m_templateModel(nullptr)
    , m_scheduledModel(nullptr)
    , m_reconnectTimer(nullptr)
    , m_statusTimer(nullptr)
    , m_topToolBar(nullptr)
    , m_alertAction(nullptr)
    , m_alertBadgeLabel(nullptr)
    , m_connectionLabel(nullptr)
    , m_platformLabel(nullptr)
    , m_timeLabel(nullptr)
    , m_isConnected(false)
{
    setWindowTitle(tr("工控外设统一管控平台 v1.0.0"));
    setMinimumSize(1200, 800);

    setupUi();
    setupMenu();
    setupModels();
    setupConnections();

    m_reconnectTimer = new QTimer(this);
    m_reconnectTimer->setInterval(5000);

    m_statusTimer = new QTimer(this);
    m_statusTimer->setInterval(1000);
    connect(m_statusTimer, &QTimer::timeout, this, [this]() {
        if (m_timeLabel) {
            m_timeLabel->setText(QDateTime::currentDateTime().toString("yyyy-MM-dd HH:mm:ss"));
        }
        updateConnectionStatus();
    });
    m_statusTimer->start();

    onServerConnected();
    updateConnectionStatus();

    m_platformLabel->setText(QString("平台: %1 | 架构: %2")
                                 .arg(PlatformAdapter::instance()->osName())
                                 .arg(PlatformAdapter::instance()->architecture()));

    resize(1400, 900);
}

MainWindow::~MainWindow() = default;

void MainWindow::closeEvent(QCloseEvent *event)
{
    if (m_wsClient) {
        m_wsClient->disconnectFromServer();
    }
    if (m_reconnectTimer) {
        m_reconnectTimer->stop();
    }
    if (m_statusTimer) {
        m_statusTimer->stop();
    }
    QMainWindow::closeEvent(event);
}

void MainWindow::setupUi()
{
    auto *centralWidget = new QWidget(this);
    auto *mainLayout = new QVBoxLayout(centralWidget);
    mainLayout->setContentsMargins(0, 0, 0, 0);
    mainLayout->setSpacing(0);

    m_topToolBar = new QToolBar(this);
    m_topToolBar->setMovable(false);
    m_topToolBar->setIconSize(QSize(20, 20));
    m_topToolBar->setStyleSheet(R"(
        QToolBar {
            background-color: #16213e;
            border-bottom: 1px solid #0f3460;
            padding: 4px 10px;
            spacing: 10px;
        }
        QToolBar QToolButton {
            background-color: transparent;
            color: #ffffff;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 14px;
        }
        QToolBar QToolButton:hover {
            background-color: #0f3460;
        }
        QToolBar QToolButton:pressed {
            background-color: #2196F3;
        }
        #alertBadge {
            background-color: #e74c3c;
            color: white;
            border-radius: 10px;
            font-weight: bold;
            font-size: 11px;
            padding: 2px 6px;
            min-width: 20px;
            qproperty-alignment: AlignCenter;
        }
    )");

    auto *spacer = new QWidget(m_topToolBar);
    spacer->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);
    m_topToolBar->addWidget(spacer);

    m_alertAction = m_topToolBar->addAction("🔔 告警");
    m_alertAction->setToolTip(tr("查看告警中心"));

    m_alertBadgeLabel = new QLabel(m_topToolBar);
    m_alertBadgeLabel->setObjectName("alertBadge");
    m_alertBadgeLabel->setVisible(false);

    auto *alertWidget = new QWidget(m_topToolBar);
    auto *alertLayout = new QHBoxLayout(alertWidget);
    alertLayout->setContentsMargins(0, 0, 0, 0);
    alertLayout->setSpacing(2);
    alertLayout->addWidget(m_alertBadgeLabel);

    m_topToolBar->addWidget(alertWidget);
    mainLayout->addWidget(m_topToolBar);

    auto *contentLayout = new QHBoxLayout();
    contentLayout->setContentsMargins(0, 0, 0, 0);
    contentLayout->setSpacing(0);

    auto *navWidget = new QListWidget(this);
    navWidget->setFixedWidth(180);
    navWidget->addItem(tr("📊 总览面板"));
    navWidget->addItem(tr("🔧 设备管理"));
    navWidget->addItem(tr("📡 指令下发"));
    navWidget->addItem(tr("⏰ 定时任务"));
    navWidget->addItem(tr("📈 状态监控"));
    navWidget->addItem(tr("📋 配置模板"));

    navWidget->setStyleSheet(R"(
        QListWidget {
            background-color: #2c3e50;
            color: #ecf0f1;
            border: none;
            font-size: 14px;
        }
        QListWidget::item {
            padding: 16px 12px;
            border-bottom: 1px solid #34495e;
        }
        QListWidget::item:selected {
            background-color: #3498db;
            color: white;
        }
        QListWidget::item:hover {
            background-color: #34495e;
        }
    )");

    m_stackWidget = new QStackedWidget(this);

    m_dashboardPanel = new DashboardPanel(this);
    m_devicePanel = new DevicePanel(this);
    m_commandPanel = new CommandPanel(this);
    m_schedulePanel = new SchedulePanel(this);
    m_statusPanel = new StatusPanel(this);
    m_templatePanel = new TemplatePanel(this);

    m_stackWidget->addWidget(m_dashboardPanel);
    m_stackWidget->addWidget(m_devicePanel);
    m_stackWidget->addWidget(m_commandPanel);
    m_stackWidget->addWidget(m_schedulePanel);
    m_stackWidget->addWidget(m_statusPanel);
    m_stackWidget->addWidget(m_templatePanel);

    contentLayout->addWidget(navWidget);
    contentLayout->addWidget(m_stackWidget, 1);

    mainLayout->addLayout(contentLayout, 1);

    setCentralWidget(centralWidget);

    m_connectionLabel = new QLabel(this);
    m_platformLabel = new QLabel(this);
    m_timeLabel = new QLabel(this);

    statusBar()->addPermanentWidget(m_connectionLabel);
    statusBar()->addPermanentWidget(new QLabel(" | ", this));
    statusBar()->addPermanentWidget(m_platformLabel);
    statusBar()->addPermanentWidget(new QLabel(" | ", this));
    statusBar()->addPermanentWidget(m_timeLabel);

    connect(navWidget, QOverload<int>::of(&QListWidget::currentRowChanged),
            this, &MainWindow::onNavigate);

    navWidget->setCurrentRow(0);

    m_alertDialog = new AlertDialog(this);
}

void MainWindow::setupMenu()
{
    auto *menuBar = this->menuBar();

    auto *fileMenu = menuBar->addMenu(tr("文件(&F)"));
    auto *exportAction = fileMenu->addAction(tr("导出配置"));
    auto *importAction = fileMenu->addAction(tr("导入配置"));
    fileMenu->addSeparator();
    auto *exitAction = fileMenu->addAction(tr("退出"));
    connect(exitAction, &QAction::triggered, this, &QMainWindow::close);

    auto *viewMenu = menuBar->addMenu(tr("视图(&V)"));
    viewMenu->addAction(tr("刷新"), this, [this]() {
        if (m_deviceModel) m_deviceModel->refresh();
        if (m_statusModel) m_statusModel->refresh();
    });

    auto *helpMenu = menuBar->addMenu(tr("帮助(&H)"));
    helpMenu->addAction(tr("关于"), this, [this]() {
        QMessageBox::information(this, tr("关于"),
                                 tr("<h3>工控外设统一管控平台</h3>"
                                    "<p>版本: 1.0.0</p>"
                                    "<p>基于 Qt 6 + Go 后端开发</p>"
                                    "<p>支持 Windows / Linux / 国产操作系统</p>"));
    });
}

void MainWindow::setupModels()
{
    m_apiClient = new ApiClient(this);
    m_apiClient->setBaseUrl("http://127.0.0.1:8080");

    m_wsClient = new WebSocketClient(this);

    m_deviceModel = new DeviceModel(m_apiClient, this);
    m_statusModel = new StatusModel(m_apiClient, m_wsClient, this);
    m_commandModel = new CommandModel(m_apiClient, this);
    m_templateModel = new TemplateModel(m_apiClient, this);
    m_scheduledModel = new ScheduledModel(m_apiClient, this);

    m_dashboardPanel->setModels(m_deviceModel, m_statusModel);
    m_devicePanel->setModel(m_deviceModel);
    m_commandPanel->setModel(m_commandModel);
    m_commandPanel->setDeviceModel(m_deviceModel);
    m_schedulePanel->setModel(m_scheduledModel);
    m_schedulePanel->setDeviceModel(m_deviceModel);
    m_statusPanel->setModel(m_statusModel);
    m_templatePanel->setModel(m_templateModel);
    m_templatePanel->setDeviceModel(m_deviceModel);
}

void MainWindow::setupConnections()
{
    connect(m_wsClient, &WebSocketClient::connected, this, &MainWindow::onServerConnected);
    connect(m_wsClient, &WebSocketClient::disconnected, this, &MainWindow::onServerDisconnected);
    connect(m_wsClient, &WebSocketClient::errorOccurred, this, &MainWindow::onServerError);
    connect(m_wsClient, &WebSocketClient::alertReceived, this, &MainWindow::onAlertReceived);

    connect(m_alertAction, &QAction::triggered, this, &MainWindow::showAlertCenter);

    connect(m_reconnectTimer, &QTimer::timeout, this, [this]() {
        if (!m_isConnected) {
            m_wsClient->connectToServer("ws://127.0.0.1:8080/ws");
        }
    });

    QTimer::singleShot(1000, this, [this]() {
        m_wsClient->connectToServer("ws://127.0.0.1:8080/ws");
    });
}

void MainWindow::onNavigate(int index)
{
    if (m_stackWidget) {
        m_stackWidget->setCurrentIndex(index);
    }
}

void MainWindow::updateConnectionStatus()
{
    if (m_connectionLabel) {
        if (m_isConnected) {
            m_connectionLabel->setText("● 服务连接正常");
            m_connectionLabel->setStyleSheet("color: #27ae60; font-weight: bold;");
        } else {
            m_connectionLabel->setText("● 服务连接断开");
            m_connectionLabel->setStyleSheet("color: #e74c3c; font-weight: bold;");
        }
    }
}

void MainWindow::onServerConnected()
{
    m_isConnected = true;
    updateConnectionStatus();
    if (m_reconnectTimer) m_reconnectTimer->stop();

    if (m_deviceModel) m_deviceModel->refresh();
    if (m_statusModel) m_statusModel->refresh();
    if (m_templateModel) m_templateModel->refresh();
    if (m_scheduledModel) m_scheduledModel->refresh();
}

void MainWindow::onServerDisconnected()
{
    m_isConnected = false;
    updateConnectionStatus();
    if (m_reconnectTimer) m_reconnectTimer->start();
}

void MainWindow::onServerError(const QString &error)
{
    qWarning() << "Server error:" << error;
    m_isConnected = false;
    updateConnectionStatus();
    if (m_reconnectTimer) m_reconnectTimer->start();
}

void MainWindow::onAlertReceived(const Alert &alert)
{
    if (m_alertDialog) {
        m_alertDialog->addAlert(alert);
        updateAlertBadge();

        if (alert.level == "critical" && !isActiveWindow()) {
            QApplication::alert(this, 3000);
        }
    }
}

void MainWindow::showAlertCenter()
{
    if (m_alertDialog) {
        m_alertDialog->exec();
        updateAlertBadge();
    }
}

void MainWindow::updateAlertBadge()
{
    if (!m_alertBadgeLabel || !m_alertDialog) return;

    int count = m_alertDialog->unreadCount();
    if (count > 0) {
        m_alertBadgeLabel->setText(count > 99 ? "99+" : QString::number(count));
        m_alertBadgeLabel->setVisible(true);
    } else {
        m_alertBadgeLabel->setVisible(false);
    }
}
