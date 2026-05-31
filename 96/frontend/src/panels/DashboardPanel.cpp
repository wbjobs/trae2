#include "DashboardPanel.h"

#include <QFrame>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QPushButton>
#include <QTableView>
#include <QVBoxLayout>
#include <QHeaderView>
#include <QBrush>
#include <QColor>
#include <QFont>

#include <QtCharts/QChartView>
#include <QtCharts/QPieSeries>
#include <QtCharts/QPieSlice>
#include <QtCharts/QChart>

#include "../models/DeviceModel.h"
#include "../models/StatusModel.h"

DashboardPanel::DashboardPanel(QWidget *parent)
    : QWidget(parent)
    , m_deviceModel(nullptr)
    , m_statusModel(nullptr)
    , m_totalDevicesLabel(nullptr)
    , m_onlineLabel(nullptr)
    , m_offlineLabel(nullptr)
    , m_errorLabel(nullptr)
    , m_refreshButton(nullptr)
    , m_statusTable(nullptr)
    , m_chartView(nullptr)
    , m_pieSeries(nullptr)
    , m_chart(nullptr)
    , m_mainLayout(nullptr)
    , m_headerLayout(nullptr)
    , m_cardsLayout(nullptr)
    , m_contentLayout(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
}

DashboardPanel::~DashboardPanel() = default;

void DashboardPanel::setModels(DeviceModel *deviceModel, StatusModel *statusModel)
{
    m_deviceModel = deviceModel;
    m_statusModel = statusModel;

    if (m_statusTable && m_statusModel) {
        m_statusTable->setModel(m_statusModel);
    }

    if (m_deviceModel) {
        connect(m_deviceModel, &DeviceModel::refreshed, this, &DashboardPanel::updateStats);
    }
    if (m_statusModel) {
        connect(m_statusModel, &StatusModel::refreshed, this, &DashboardPanel::updateStats);
        connect(m_statusModel, &StatusModel::statsChanged, this, &DashboardPanel::updateStats);
        connect(m_statusModel, &StatusModel::refreshed, this, &DashboardPanel::updateChart);
        connect(m_statusModel, &StatusModel::statsChanged, this, &DashboardPanel::updateChart);
    }

    updateStats();
    updateChart();
}

void DashboardPanel::onRefreshClicked()
{
    if (m_deviceModel) {
        m_deviceModel->refresh();
    }
    if (m_statusModel) {
        m_statusModel->refresh();
    }
}

void DashboardPanel::updateStats()
{
    if (!m_statusModel) {
        return;
    }

    m_totalDevicesLabel->setText(QString::number(m_statusModel->totalDevices()));
    m_onlineLabel->setText(QString::number(m_statusModel->onlineCount()));
    m_offlineLabel->setText(QString::number(m_statusModel->offlineCount()));
    m_errorLabel->setText(QString::number(m_statusModel->errorCount()));
}

void DashboardPanel::updateChart()
{
    if (!m_pieSeries || !m_statusModel) {
        return;
    }

    m_pieSeries->clear();

    int online = m_statusModel->onlineCount();
    int offline = m_statusModel->offlineCount();
    int error = m_statusModel->errorCount();

    if (online > 0) {
        auto *slice = m_pieSeries->append(tr("在线"), online);
        slice->setColor(QColor("#4CAF50"));
        slice->setLabelVisible(true);
        slice->setLabel(QString("%1: %2").arg(slice->label()).arg(slice->value()));
    }
    if (offline > 0) {
        auto *slice = m_pieSeries->append(tr("离线"), offline);
        slice->setColor(QColor("#9E9E9E"));
        slice->setLabelVisible(true);
        slice->setLabel(QString("%1: %2").arg(slice->label()).arg(slice->value()));
    }
    if (error > 0) {
        auto *slice = m_pieSeries->append(tr("错误"), error);
        slice->setColor(QColor("#F44336"));
        slice->setLabelVisible(true);
        slice->setLabel(QString("%1: %2").arg(slice->label()).arg(slice->value()));
    }

    for (auto *slice : m_pieSeries->slices()) {
        QObject::connect(slice, &QtCharts::QPieSlice::hovered, slice, [slice](bool hovered) {
            slice->setExploded(hovered);
            slice->setLabelVisible(hovered);
        });
    }
}

void DashboardPanel::setupUi()
{
    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(20);

    m_headerLayout = new QHBoxLayout();
    m_headerLayout->setSpacing(10);

    auto *titleLabel = new QLabel(tr("仪表盘"), this);
    QFont titleFont = titleLabel->font();
    titleFont.setPointSize(20);
    titleFont.setBold(true);
    titleLabel->setFont(titleFont);
    titleLabel->setObjectName("dashboardTitle");

    m_refreshButton = new QPushButton(tr("刷新"), this);
    m_refreshButton->setObjectName("refreshButton");
    m_refreshButton->setCursor(Qt::PointingHandCursor);

    m_headerLayout->addWidget(titleLabel);
    m_headerLayout->addStretch();
    m_headerLayout->addWidget(m_refreshButton);

    m_mainLayout->addLayout(m_headerLayout);

    m_cardsLayout = new QGridLayout();
    m_cardsLayout->setSpacing(15);

    auto *totalCard = createStatCard(tr("设备总数"), "0", "#2196F3");
    auto *onlineCard = createStatCard(tr("在线设备"), "0", "#4CAF50");
    auto *offlineCard = createStatCard(tr("离线设备"), "0", "#9E9E9E");
    auto *errorCard = createStatCard(tr("错误设备"), "0", "#F44336");

    m_totalDevicesLabel = totalCard->findChild<QLabel*>("cardValue");
    m_onlineLabel = onlineCard->findChild<QLabel*>("cardValue");
    m_offlineLabel = offlineCard->findChild<QLabel*>("cardValue");
    m_errorLabel = errorCard->findChild<QLabel*>("cardValue");

    m_cardsLayout->addWidget(totalCard, 0, 0);
    m_cardsLayout->addWidget(onlineCard, 0, 1);
    m_cardsLayout->addWidget(offlineCard, 0, 2);
    m_cardsLayout->addWidget(errorCard, 0, 3);

    m_mainLayout->addLayout(m_cardsLayout);

    m_contentLayout = new QHBoxLayout();
    m_contentLayout->setSpacing(20);

    m_statusTable = new QTableView(this);
    m_statusTable->setObjectName("statusTable");
    m_statusTable->setAlternatingRowColors(true);
    m_statusTable->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_statusTable->setSelectionMode(QAbstractItemView::SingleSelection);
    m_statusTable->horizontalHeader()->setStretchLastSection(true);
    m_statusTable->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    m_statusTable->verticalHeader()->setVisible(false);

    m_pieSeries = new QtCharts::QPieSeries();
    m_chart = new QtCharts::QChart();
    m_chart->addSeries(m_pieSeries);
    m_chart->setTitle(tr("设备状态分布"));
    m_chart->legend()->setAlignment(Qt::AlignBottom);
    m_chart->setAnimationOptions(QtCharts::QChart::AllAnimations);

    m_chartView = new QtCharts::QChartView(m_chart, this);
    m_chartView->setRenderHint(QPainter::Antialiasing);
    m_chartView->setObjectName("chartView");

    m_contentLayout->addWidget(m_statusTable, 2);
    m_contentLayout->addWidget(m_chartView, 1);

    m_mainLayout->addLayout(m_contentLayout, 1);

    setLayout(m_mainLayout);
}

void DashboardPanel::setupConnections()
{
    connect(m_refreshButton, &QPushButton::clicked, this, &DashboardPanel::onRefreshClicked);
}

void DashboardPanel::applyStyle()
{
    setStyleSheet(R"(
        DashboardPanel {
            background-color: #1a1a2e;
        }

        #dashboardTitle {
            color: #ffffff;
        }

        #refreshButton {
            background-color: #2196F3;
            color: white;
            border: none;
            padding: 8px 20px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: bold;
        }

        #refreshButton:hover {
            background-color: #1976D2;
        }

        #refreshButton:pressed {
            background-color: #1565C0;
        }

        QFrame#statCard {
            background-color: #16213e;
            border-radius: 8px;
            border: 1px solid #0f3460;
        }

        QLabel#cardTitle {
            color: #a0a0a0;
            font-size: 14px;
        }

        QLabel#cardValue {
            color: #ffffff;
            font-size: 32px;
            font-weight: bold;
        }

        QFrame#cardIndicator {
            border-radius: 3px;
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

        #chartView {
            background-color: #16213e;
            border: 1px solid #0f3460;
            border-radius: 8px;
        }
    )");

    if (m_chart) {
        m_chart->setBackgroundBrush(QColor("#16213e"));
        m_chart->setTitleBrush(QColor("#ffffff"));
        m_chart->legend()->setLabelColor(QColor("#ffffff"));
    }
}

QFrame *DashboardPanel::createStatCard(const QString &title, const QString &value, const QString &color)
{
    auto *card = new QFrame(this);
    card->setObjectName("statCard");

    auto *cardLayout = new QVBoxLayout(card);
    cardLayout->setContentsMargins(15, 15, 15, 15);
    cardLayout->setSpacing(10);

    auto *indicator = new QFrame(card);
    indicator->setObjectName("cardIndicator");
    indicator->setFixedHeight(6);
    indicator->setStyleSheet(QString("background-color: %1;").arg(color));

    auto *titleLabel = new QLabel(title, card);
    titleLabel->setObjectName("cardTitle");

    auto *valueLabel = new QLabel(value, card);
    valueLabel->setObjectName("cardValue");

    cardLayout->addWidget(indicator);
    cardLayout->addWidget(titleLabel);
    cardLayout->addWidget(valueLabel);
    cardLayout->addStretch();

    card->setLayout(cardLayout);

    return card;
}
