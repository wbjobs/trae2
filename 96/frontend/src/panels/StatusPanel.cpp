#include "StatusPanel.h"

#include <QToolBar>
#include <QAction>
#include <QTableView>
#include <QHeaderView>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGroupBox>
#include <QFormLayout>
#include <QLabel>
#include <QTimer>
#include <QItemSelectionModel>
#include <QFont>
#include <QFrame>
#include <QRegularExpression>

#include "../models/StatusModel.h"

StatusPanel::StatusPanel(QWidget *parent)
    : QWidget(parent)
    , m_model(nullptr)
    , m_tableView(nullptr)
    , m_toolBar(nullptr)
    , m_refreshAction(nullptr)
    , m_metricsGroup(nullptr)
    , m_metricsLayout(nullptr)
    , m_refreshTimer(nullptr)
    , m_mainLayout(nullptr)
    , m_contentLayout(nullptr)
    , m_deviceIdLabel(nullptr)
    , m_statusLabel(nullptr)
    , m_timestampLabel(nullptr)
    , m_hintLabel(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
    m_refreshTimer->start(5000);
}

void StatusPanel::setModel(StatusModel *model)
{
    m_model = model;
    if (m_tableView && m_model) {
        m_tableView->setModel(m_model);
    }
}

void StatusPanel::onRefreshClicked()
{
    if (m_model) {
        m_model->refresh();
    }
}

void StatusPanel::onSelectionChanged(const QModelIndex &current, const QModelIndex &previous)
{
    Q_UNUSED(previous)
    updateMetrics(current);
}

void StatusPanel::onAutoRefresh()
{
    if (m_model && m_tableView && m_tableView->currentIndex().isValid()) {
        updateMetrics(m_tableView->currentIndex());
    }
}

void StatusPanel::updateMetrics(const QModelIndex &index)
{
    if (!m_model || !index.isValid()) {
        clearMetrics();
        m_hintLabel->setVisible(true);
        m_deviceIdLabel->setVisible(false);
        m_statusLabel->setVisible(false);
        m_timestampLabel->setVisible(false);
        for (auto *label : m_metricLabels) {
            label->setVisible(false);
        }
        return;
    }

    m_hintLabel->setVisible(false);
    m_deviceIdLabel->setVisible(true);
    m_statusLabel->setVisible(true);
    m_timestampLabel->setVisible(true);

    int row = index.row();
    StatusReport report = m_model->reportAt(row);

    m_deviceIdLabel->setText(report.deviceId);
    m_statusLabel->setText(report.status);
    m_timestampLabel->setText(report.timestamp);

    if (report.status == "online") {
        m_statusLabel->setStyleSheet("font-weight: bold; color: #27ae60;");
    } else if (report.status == "offline") {
        m_statusLabel->setStyleSheet("font-weight: bold; color: #95a5a6;");
    } else if (report.status == "error") {
        m_statusLabel->setStyleSheet("font-weight: bold; color: #e74c3c;");
    } else if (report.status == "busy") {
        m_statusLabel->setStyleSheet("font-weight: bold; color: #f39c12;");
    }

    QSet<QString> updatedKeys;
    for (auto it = report.metrics.begin(); it != report.metrics.end(); ++it) {
        const QString &key = it.key();
        double value = it.value();
        updatedKeys.insert(key);

        QLabel *valueLabel;
        if (m_metricLabels.contains(key)) {
            valueLabel = m_metricLabels[key];
            valueLabel->setVisible(true);
        } else {
            auto *keyLabel = new QLabel(key + ":", this);
            keyLabel->setStyleSheet("font-weight: bold; color: #2196F3;");
            valueLabel = new QLabel(this);
            valueLabel->setStyleSheet("color: #ffffff;");
            m_metricsLayout->addRow(keyLabel, valueLabel);
            m_metricLabels[key] = valueLabel;
        }

        valueLabel->setText(formatMetricValue(key, value));
    }

    for (auto it = m_metricLabels.begin(); it != m_metricLabels.end(); ++it) {
        if (!updatedKeys.contains(it.key())) {
            it.value()->setVisible(false);
            QLayoutItem *item = m_metricsLayout->labelForField(it.value());
            if (item) {
                item->widget()->setVisible(false);
            }
        } else {
            QLayoutItem *item = m_metricsLayout->labelForField(it.value());
            if (item) {
                item->widget()->setVisible(true);
            }
        }
    }
}

void StatusPanel::clearMetrics()
{
    if (!m_metricsLayout) {
        return;
    }

    if (m_hintLabel) {
        m_hintLabel->setVisible(true);
    }
    if (m_deviceIdLabel) {
        m_deviceIdLabel->setVisible(false);
    }
    if (m_statusLabel) {
        m_statusLabel->setVisible(false);
    }
    if (m_timestampLabel) {
        m_timestampLabel->setVisible(false);
    }

    for (auto *label : m_metricLabels) {
        label->setVisible(false);
        QLayoutItem *item = m_metricsLayout->labelForField(label);
        if (item) {
            item->widget()->setVisible(false);
        }
    }
}

QString StatusPanel::formatMetricValue(const QString &key, double value) const
{
    int precision = detectMetricPrecision(key);
    QString lowerKey = key.toLower();

    if (qAbs(value) < 0.001 && value != 0.0) {
        return QString::number(value, 'e', precision);
    }

    if (lowerKey.contains("temperature") || lowerKey.contains("temp")) {
        return QString::number(value, 'f', precision) + " °C";
    }
    if (lowerKey.contains("humidity") || lowerKey.contains("hum")) {
        return QString::number(value, 'f', precision) + " %";
    }
    if (lowerKey.contains("pressure")) {
        return QString::number(value, 'f', precision) + " kPa";
    }
    if (lowerKey.contains("voltage") || lowerKey.contains("v")) {
        return QString::number(value, 'f', precision) + " V";
    }
    if (lowerKey.contains("current") || lowerKey.contains("i")) {
        return QString::number(value, 'f', precision) + " A";
    }
    if (lowerKey.contains("power") || lowerKey.contains("w")) {
        return QString::number(value, 'f', precision) + " W";
    }
    if (lowerKey.contains("frequency") || lowerKey.contains("hz")) {
        return QString::number(value, 'f', precision) + " Hz";
    }
    if (lowerKey.contains("count") || lowerKey.contains("cnt")) {
        return QString::number(static_cast<qint64>(value));
    }
    if (lowerKey.contains("uptime") || lowerKey.contains("time") || lowerKey.contains("seconds")) {
        return QString::number(value, 'f', precision) + " s";
    }
    if (lowerKey.contains("percent") || lowerKey.contains("usage")) {
        return QString::number(value, 'f', precision) + " %";
    }

    return QString::number(value, 'f', precision);
}

int StatusPanel::detectMetricPrecision(const QString &key) const
{
    QString lowerKey = key.toLower();

    if (lowerKey.contains("temperature") || lowerKey.contains("temp")) {
        return 1;
    }
    if (lowerKey.contains("humidity")) {
        return 1;
    }
    if (lowerKey.contains("voltage") || lowerKey.contains("current") || lowerKey.contains("power")) {
        return 2;
    }
    if (lowerKey.contains("frequency")) {
        return 2;
    }
    if (lowerKey.contains("pressure")) {
        return 2;
    }
    if (lowerKey.contains("count") || lowerKey.contains("uptime")) {
        return 0;
    }
    if (lowerKey.contains("percent") || lowerKey.contains("usage")) {
        return 1;
    }

    return 2;
}

void StatusPanel::setupUi()
{
    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(15);

    auto *titleLabel = new QLabel(tr("状态监控"), this);
    QFont titleFont = titleLabel->font();
    titleFont.setPointSize(20);
    titleFont.setBold(true);
    titleLabel->setFont(titleFont);
    titleLabel->setObjectName("panelTitle");

    m_toolBar = new QToolBar(this);
    m_toolBar->setMovable(false);
    m_toolBar->setIconSize(QSize(18, 18));
    m_refreshAction = m_toolBar->addAction(tr("刷新"));

    m_contentLayout = new QHBoxLayout();
    m_contentLayout->setSpacing(15);

    m_tableView = new QTableView(this);
    m_tableView->setObjectName("statusTable");
    m_tableView->setAlternatingRowColors(true);
    m_tableView->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_tableView->setSelectionMode(QAbstractItemView::SingleSelection);
    m_tableView->horizontalHeader()->setStretchLastSection(true);
    m_tableView->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    m_tableView->verticalHeader()->setVisible(false);
    m_tableView->setEditTriggers(QAbstractItemView::NoEditTriggers);

    m_metricsGroup = new QGroupBox(tr("详细指标"), this);
    m_metricsGroup->setObjectName("metricsGroup");
    m_metricsGroup->setMinimumWidth(300);
    m_metricsGroup->setMaximumWidth(400);

    m_metricsLayout = new QFormLayout(m_metricsGroup);
    m_metricsLayout->setContentsMargins(15, 15, 15, 15);
    m_metricsLayout->setSpacing(10);
    m_metricsGroup->setLayout(m_metricsLayout);

    m_deviceIdLabel = new QLabel(this);
    m_statusLabel = new QLabel(this);
    m_timestampLabel = new QLabel(this);
    m_hintLabel = new QLabel(tr("选择一行查看详细指标"), this);
    m_hintLabel->setAlignment(Qt::AlignCenter);
    m_hintLabel->setStyleSheet("color: #757575; font-style: italic;");

    m_metricsLayout->addRow(tr("设备ID:"), m_deviceIdLabel);
    m_metricsLayout->addRow(tr("状态:"), m_statusLabel);
    m_metricsLayout->addRow(tr("时间:"), m_timestampLabel);

    auto *separator = new QFrame(this);
    separator->setFrameShape(QFrame::HLine);
    separator->setFrameShadow(QFrame::Sunken);
    m_metricsLayout->addRow(separator);

    m_metricsLayout->addRow(m_hintLabel);

    m_deviceIdLabel->setVisible(false);
    m_statusLabel->setVisible(false);
    m_timestampLabel->setVisible(false);

    m_contentLayout->addWidget(m_tableView, 1);
    m_contentLayout->addWidget(m_metricsGroup);

    m_refreshTimer = new QTimer(this);

    m_mainLayout->addWidget(titleLabel);
    m_mainLayout->addWidget(m_toolBar);
    m_mainLayout->addLayout(m_contentLayout, 1);
    setLayout(m_mainLayout);
}

void StatusPanel::setupConnections()
{
    connect(m_refreshAction, &QAction::triggered, this, &StatusPanel::onRefreshClicked);
    connect(m_refreshTimer, &QTimer::timeout, this, &StatusPanel::onAutoRefresh);
    if (m_tableView && m_tableView->selectionModel()) {
        connect(m_tableView->selectionModel(), &QItemSelectionModel::currentRowChanged,
                this, &StatusPanel::onSelectionChanged);
    }
}

void StatusPanel::applyStyle()
{
    setStyleSheet(R"(
        StatusPanel {
            background-color: #1a1a2e;
        }

        #panelTitle {
            color: #ffffff;
        }

        QToolBar {
            background-color: #16213e;
            border: 1px solid #0f3460;
            border-radius: 4px;
            padding: 4px;
            spacing: 8px;
        }

        QToolBar QToolButton {
            background-color: #2196F3;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            margin-right: 4px;
        }

        QToolBar QToolButton:hover {
            background-color: #1976D2;
        }

        QToolBar QToolButton:pressed {
            background-color: #1565C0;
        }

        #statusTable {
            background-color: #16213e;
            color: #ffffff;
            border: 1px solid #0f3460;
            border-radius: 8px;
            gridline-color: #0f3460;
        }

        #statusTable::item {
            padding: 8px;
            border: none;
        }

        #statusTable::item:selected {
            background-color: #0f3460;
            color: #2196F3;
        }

        #statusTable QHeaderView::section {
            background-color: #0f3460;
            color: #ffffff;
            padding: 10px;
            border: none;
            font-weight: bold;
        }

        #statusTable QHeaderView::section:horizontal {
            border-bottom: 2px solid #2196F3;
        }

        #metricsGroup {
            background-color: #16213e;
            border: 1px solid #0f3460;
            border-radius: 8px;
            margin-top: 10px;
        }

        #metricsGroup > QLabel {
            color: #ffffff;
            font-size: 14px;
        }

        #metricsGroup QGroupBox::title {
            color: #ffffff;
            font-size: 16px;
            font-weight: bold;
            padding: 5px 10px;
            left: 10px;
        }

        QFormLayout {
            spacing: 10px;
        }

        QFrame[frameShape="1"] {
            background-color: #0f3460;
            border: none;
            height: 1px;
            margin: 10px 0;
        }
    )");
}
