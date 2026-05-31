#include "AlertDialog.h"

#include <QListWidget>
#include <QListWidgetItem>
#include <QPushButton>
#include <QLabel>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFont>
#include <QDateTime>
#include <QMessageBox>

AlertDialog::AlertDialog(QWidget *parent)
    : QDialog(parent)
    , m_alertList(nullptr)
    , m_ackAllButton(nullptr)
    , m_clearAllButton(nullptr)
    , m_closeButton(nullptr)
    , m_titleLabel(nullptr)
    , m_badgeLabel(nullptr)
    , m_mainLayout(nullptr)
    , m_headerLayout(nullptr)
    , m_buttonLayout(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
    setWindowTitle(tr("告警中心"));
    resize(600, 500);
}

void AlertDialog::addAlert(const Alert &alert)
{
    m_alerts.prepend(alert);

    auto *item = new QListWidgetItem(m_alertList);
    QString levelColor = "#f39c12";
    QString levelIcon = "⚠";
    if (alert.level == "critical") {
        levelColor = "#e74c3c";
        levelIcon = "🛑";
    } else if (alert.level == "info") {
        levelColor = "#3498db";
        levelIcon = "ℹ";
    }

    QString displayText = QString(
        "<div style='padding: 8px;'>"
        "<div style='font-weight: bold; color: %1;'>%2 %3</div>"
        "<div style='color: #ffffff; font-size: 13px; margin-top: 4px;'>%4</div>"
        "<div style='color: #757575; font-size: 11px; margin-top: 4px;'>"
        "设备: %5 | %6"
        "</div>"
        "</div>"
    ).arg(levelColor, levelIcon, alert.title, alert.message,
          alert.deviceName,
          alert.timestamp.toString("yyyy-MM-dd HH:mm:ss"));

    item->setData(Qt::UserRole, QVariant::fromValue(alert));
    item->setData(Qt::DisplayRole, displayText);

    if (!alert.acknowledged) {
        QFont font = item->font();
        font.setBold(true);
        item->setFont(font);
    }

    m_alertList->insertItem(0, item);
    updateBadge();
}

int AlertDialog::unreadCount() const
{
    int count = 0;
    for (const auto &alert : m_alerts) {
        if (!alert.acknowledged) {
            count++;
        }
    }
    return count;
}

void AlertDialog::onItemClicked(QListWidgetItem *item)
{
    if (!item) return;

    Alert alert = item->data(Qt::UserRole).value<Alert>();
    if (!alert.acknowledged) {
        for (auto &a : m_alerts) {
            if (a.id == alert.id) {
                a.acknowledged = true;
                break;
            }
        }

        QFont font = item->font();
        font.setBold(false);
        item->setFont(font);
        updateBadge();
    }
}

void AlertDialog::onAcknowledgeAll()
{
    for (auto &alert : m_alerts) {
        alert.acknowledged = true;
    }
    for (int i = 0; i < m_alertList->count(); ++i) {
        QListWidgetItem *item = m_alertList->item(i);
        QFont font = item->font();
        font.setBold(false);
        item->setFont(font);
    }
    updateBadge();
    emit allAcknowledged();
}

void AlertDialog::onClearAll()
{
    auto ret = QMessageBox::question(this, tr("确认清除"),
                                     tr("确定要清除所有告警记录吗？"));
    if (ret == QMessageBox::Yes) {
        m_alerts.clear();
        m_alertList->clear();
        updateBadge();
    }
}

void AlertDialog::updateBadge()
{
    int count = unreadCount();
    if (count > 0) {
        m_badgeLabel->setText(QString::number(count));
        m_badgeLabel->setVisible(true);
    } else {
        m_badgeLabel->setVisible(false);
    }
}

void AlertDialog::setupUi()
{
    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(15);

    m_headerLayout = new QHBoxLayout();
    m_titleLabel = new QLabel(tr("告警中心"), this);
    QFont titleFont = m_titleLabel->font();
    titleFont.setPointSize(18);
    titleFont.setBold(true);
    m_titleLabel->setFont(titleFont);

    m_badgeLabel = new QLabel(this);
    m_badgeLabel->setObjectName("alertBadge");
    m_badgeLabel->setAlignment(Qt::AlignCenter);
    m_badgeLabel->setFixedSize(24, 24);
    m_badgeLabel->setVisible(false);

    m_headerLayout->addWidget(m_titleLabel);
    m_headerLayout->addWidget(m_badgeLabel);
    m_headerLayout->addStretch();

    m_alertList = new QListWidget(this);
    m_alertList->setSelectionMode(QAbstractItemView::SingleSelection);
    m_alertList->setAlternatingRowColors(true);

    m_buttonLayout = new QHBoxLayout();
    m_ackAllButton = new QPushButton(tr("全部确认"), this);
    m_clearAllButton = new QPushButton(tr("清除全部"), this);
    m_closeButton = new QPushButton(tr("关闭"), this);

    m_buttonLayout->addWidget(m_ackAllButton);
    m_buttonLayout->addWidget(m_clearAllButton);
    m_buttonLayout->addStretch();
    m_buttonLayout->addWidget(m_closeButton);

    m_mainLayout->addLayout(m_headerLayout);
    m_mainLayout->addWidget(m_alertList, 1);
    m_mainLayout->addLayout(m_buttonLayout);

    setLayout(m_mainLayout);
}

void AlertDialog::setupConnections()
{
    connect(m_alertList, &QListWidget::itemClicked, this, &AlertDialog::onItemClicked);
    connect(m_ackAllButton, &QPushButton::clicked, this, &AlertDialog::onAcknowledgeAll);
    connect(m_clearAllButton, &QPushButton::clicked, this, &AlertDialog::onClearAll);
    connect(m_closeButton, &QPushButton::clicked, this, &QDialog::accept);
}

void AlertDialog::applyStyle()
{
    setStyleSheet(R"(
        AlertDialog {
            background-color: #1a1a2e;
        }
        QLabel {
            color: #ffffff;
        }
        #alertBadge {
            background-color: #e74c3c;
            color: white;
            border-radius: 12px;
            font-weight: bold;
            font-size: 12px;
            padding: 2px;
        }
        QListWidget {
            background-color: #16213e;
            color: #ffffff;
            border: 1px solid #0f3460;
            border-radius: 8px;
            padding: 5px;
        }
        QListWidget::item {
            padding: 5px;
            border-radius: 4px;
        }
        QListWidget::item:selected {
            background-color: #0f3460;
        }
        QPushButton {
            background-color: #2196F3;
            color: white;
            border: none;
            padding: 8px 20px;
            border-radius: 4px;
            font-size: 14px;
        }
        QPushButton:hover {
            background-color: #1976D2;
        }
        QPushButton:pressed {
            background-color: #1565C0;
        }
        QPushButton#m_clearAllButton {
            background-color: #F44336;
        }
        QPushButton#m_clearAllButton:hover {
            background-color: #D32F2F;
        }
        QPushButton#m_closeButton {
            background-color: #757575;
        }
        QPushButton#m_closeButton:hover {
            background-color: #616161;
        }
    )");

    m_clearAllButton->setObjectName("m_clearAllButton");
    m_closeButton->setObjectName("m_closeButton");
}
