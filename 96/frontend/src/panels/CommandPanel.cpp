#include "CommandPanel.h"

#include <QToolBar>
#include <QAction>
#include <QTableView>
#include <QHeaderView>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QLineEdit>
#include <QComboBox>
#include <QSpinBox>
#include <QTableWidget>
#include <QPushButton>
#include <QLabel>
#include <QMessageBox>
#include <QHeaderView>
#include <QFont>

#include "../models/CommandModel.h"
#include "../models/DeviceModel.h"

CommandDialog::CommandDialog(QWidget *parent)
    : QDialog(parent)
    , m_deviceIdCombo(nullptr)
    , m_actionEdit(nullptr)
    , m_prioritySpin(nullptr)
    , m_paramsTable(nullptr)
    , m_addParamButton(nullptr)
    , m_removeParamButton(nullptr)
    , m_sendButton(nullptr)
    , m_cancelButton(nullptr)
    , m_mainLayout(nullptr)
    , m_buttonLayout(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
}

void CommandDialog::setDevices(const QList<QPair<QString, QString>> &devices)
{
    if (!m_deviceIdCombo) return;
    m_deviceIdCombo->clear();
    for (const auto &dev : devices) {
        m_deviceIdCombo->addItem(dev.second, dev.first);
    }
}

QString CommandDialog::deviceId() const
{
    return m_deviceIdCombo ? m_deviceIdCombo->currentData().toString() : QString();
}

QString CommandDialog::action() const
{
    return m_actionEdit ? m_actionEdit->text().trimmed() : QString();
}

int CommandDialog::priority() const
{
    return m_prioritySpin ? m_prioritySpin->value() : 0;
}

QVariantMap CommandDialog::params() const
{
    QVariantMap map;
    if (!m_paramsTable) return map;
    for (int row = 0; row < m_paramsTable->rowCount(); ++row) {
        auto *keyItem = m_paramsTable->item(row, 0);
        auto *valItem = m_paramsTable->item(row, 1);
        if (keyItem && valItem) {
            QString key = keyItem->text().trimmed();
            if (!key.isEmpty()) {
                map[key] = valItem->text();
            }
        }
    }
    return map;
}

void CommandDialog::onAddParamClicked()
{
    if (!m_paramsTable) return;
    int row = m_paramsTable->rowCount();
    m_paramsTable->insertRow(row);
    m_paramsTable->setItem(row, 0, new QTableWidgetItem());
    m_paramsTable->setItem(row, 1, new QTableWidgetItem());
    m_paramsTable->editItem(m_paramsTable->item(row, 0));
}

void CommandDialog::onRemoveParamClicked()
{
    if (!m_paramsTable) return;
    auto items = m_paramsTable->selectedItems();
    if (items.isEmpty()) return;
    int row = items.first()->row();
    m_paramsTable->removeRow(row);
}

void CommandDialog::onAcceptClicked()
{
    if (deviceId().isEmpty()) {
        QMessageBox::warning(this, tr("警告"), tr("请选择目标设备"));
        return;
    }
    if (action().isEmpty()) {
        QMessageBox::warning(this, tr("警告"), tr("命令动作不能为空"));
        return;
    }
    accept();
}

void CommandDialog::setupUi()
{
    setWindowTitle(tr("发送命令"));
    setMinimumWidth(450);

    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(15);

    auto *deviceLabel = new QLabel(tr("目标设备:"), this);
    m_deviceIdCombo = new QComboBox(this);

    auto *actionLabel = new QLabel(tr("命令动作:"), this);
    m_actionEdit = new QLineEdit(this);
    m_actionEdit->setPlaceholderText(tr("例如: write_register, start, stop"));

    auto *priorityLabel = new QLabel(tr("优先级:"), this);
    m_prioritySpin = new QSpinBox(this);
    m_prioritySpin->setRange(0, 10);
    m_prioritySpin->setValue(0);

    auto *paramsLabel = new QLabel(tr("命令参数:"), this);
    m_paramsTable = new QTableWidget(0, 2, this);
    m_paramsTable->setHorizontalHeaderLabels({tr("键"), tr("值")});
    m_paramsTable->horizontalHeader()->setStretchLastSection(true);
    m_paramsTable->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    m_paramsTable->verticalHeader()->setVisible(false);
    m_paramsTable->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_paramsTable->setSelectionMode(QAbstractItemView::SingleSelection);

    auto *paramBtnLayout = new QHBoxLayout();
    m_addParamButton = new QPushButton(tr("添加"), this);
    m_removeParamButton = new QPushButton(tr("删除"), this);
    paramBtnLayout->addWidget(m_addParamButton);
    paramBtnLayout->addWidget(m_removeParamButton);
    paramBtnLayout->addStretch();

    m_buttonLayout = new QHBoxLayout();
    m_sendButton = new QPushButton(tr("发送"), this);
    m_cancelButton = new QPushButton(tr("取消"), this);
    m_buttonLayout->addStretch();
    m_buttonLayout->addWidget(m_sendButton);
    m_buttonLayout->addWidget(m_cancelButton);

    m_mainLayout->addWidget(deviceLabel);
    m_mainLayout->addWidget(m_deviceIdCombo);
    m_mainLayout->addWidget(actionLabel);
    m_mainLayout->addWidget(m_actionEdit);
    m_mainLayout->addWidget(priorityLabel);
    m_mainLayout->addWidget(m_prioritySpin);
    m_mainLayout->addWidget(paramsLabel);
    m_mainLayout->addWidget(m_paramsTable);
    m_mainLayout->addLayout(paramBtnLayout);
    m_mainLayout->addLayout(m_buttonLayout);

    setLayout(m_mainLayout);
}

void CommandDialog::setupConnections()
{
    connect(m_addParamButton, &QPushButton::clicked, this, &CommandDialog::onAddParamClicked);
    connect(m_removeParamButton, &QPushButton::clicked, this, &CommandDialog::onRemoveParamClicked);
    connect(m_sendButton, &QPushButton::clicked, this, &CommandDialog::onAcceptClicked);
    connect(m_cancelButton, &QPushButton::clicked, this, &QDialog::reject);
}

void CommandDialog::applyStyle()
{
    setStyleSheet(R"(
        CommandDialog {
            background-color: #1a1a2e;
        }

        QLabel {
            color: #ffffff;
            font-size: 14px;
        }

        QLineEdit, QComboBox, QSpinBox {
            background-color: #16213e;
            color: #ffffff;
            border: 1px solid #0f3460;
            border-radius: 4px;
            padding: 8px;
            font-size: 14px;
        }

        QLineEdit:focus, QComboBox:focus, QSpinBox:focus {
            border: 1px solid #2196F3;
        }

        QComboBox::drop-down {
            border: none;
        }

        QComboBox QAbstractItemView {
            background-color: #16213e;
            color: #ffffff;
            selection-background-color: #0f3460;
        }

        QTableWidget {
            background-color: #16213e;
            color: #ffffff;
            border: 1px solid #0f3460;
            border-radius: 4px;
            gridline-color: #0f3460;
        }

        QTableWidget::item {
            padding: 6px;
            border: none;
        }

        QTableWidget::item:selected {
            background-color: #0f3460;
            color: #2196F3;
        }

        QTableWidget QHeaderView::section {
            background-color: #0f3460;
            color: #ffffff;
            padding: 8px;
            border: none;
            font-weight: bold;
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

        QPushButton#m_removeParamButton {
            background-color: #F44336;
        }

        QPushButton#m_removeParamButton:hover {
            background-color: #D32F2F;
        }

        QPushButton#m_cancelButton {
            background-color: #757575;
        }

        QPushButton#m_cancelButton:hover {
            background-color: #616161;
        }
    )");

    m_removeParamButton->setObjectName("m_removeParamButton");
    m_cancelButton->setObjectName("m_cancelButton");
}

CommandPanel::CommandPanel(QWidget *parent)
    : QWidget(parent)
    , m_model(nullptr)
    , m_deviceModel(nullptr)
    , m_tableView(nullptr)
    , m_toolBar(nullptr)
    , m_sendAction(nullptr)
    , m_refreshAction(nullptr)
    , m_mainLayout(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
}

void CommandPanel::setModel(CommandModel *model)
{
    m_model = model;
    if (m_tableView && m_model) {
        m_tableView->setModel(m_model);
        m_tableView->setColumnHidden(CommandModel::IdCol, true);
    }
}

void CommandPanel::setDeviceModel(DeviceModel *deviceModel)
{
    m_deviceModel = deviceModel;
}

void CommandPanel::onSendCommandClicked()
{
    if (!m_model) return;
    QList<QPair<QString, QString>> devices;
    if (m_deviceModel) {
        for (const auto &dev : m_deviceModel->devices()) {
            devices.append(qMakePair(dev.id, dev.name));
        }
    }
    CommandDialog dialog(this);
    dialog.setDevices(devices);
    if (dialog.exec() == QDialog::Accepted) {
        Command cmd;
        cmd.deviceId = dialog.deviceId();
        cmd.action = dialog.action();
        cmd.priority = dialog.priority();
        cmd.params = dialog.params();
        m_model->sendCommand(cmd);
    }
}

void CommandPanel::onRefreshClicked()
{
    if (m_model) {
        m_model->refresh();
    }
}

void CommandPanel::setupUi()
{
    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(15);

    auto *titleLabel = new QLabel(tr("命令管理"), this);
    QFont titleFont = titleLabel->font();
    titleFont.setPointSize(20);
    titleFont.setBold(true);
    titleLabel->setFont(titleFont);
    titleLabel->setObjectName("panelTitle");

    m_toolBar = new QToolBar(this);
    m_toolBar->setMovable(false);
    m_toolBar->setIconSize(QSize(18, 18));

    m_sendAction = m_toolBar->addAction(tr("发送命令"));
    m_toolBar->addSeparator();
    m_refreshAction = m_toolBar->addAction(tr("刷新"));

    m_tableView = new QTableView(this);
    m_tableView->setObjectName("commandTable");
    m_tableView->setAlternatingRowColors(true);
    m_tableView->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_tableView->setSelectionMode(QAbstractItemView::SingleSelection);
    m_tableView->horizontalHeader()->setStretchLastSection(true);
    m_tableView->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    m_tableView->verticalHeader()->setVisible(false);
    m_tableView->setEditTriggers(QAbstractItemView::NoEditTriggers);

    m_mainLayout->addWidget(titleLabel);
    m_mainLayout->addWidget(m_toolBar);
    m_mainLayout->addWidget(m_tableView, 1);

    setLayout(m_mainLayout);
}

void CommandPanel::setupConnections()
{
    connect(m_sendAction, &QAction::triggered, this, &CommandPanel::onSendCommandClicked);
    connect(m_refreshAction, &QAction::triggered, this, &CommandPanel::onRefreshClicked);
}

void CommandPanel::applyStyle()
{
    setStyleSheet(R"(
        CommandPanel {
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
            background-color: #4CAF50;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            margin-right: 4px;
        }

        QToolBar QToolButton:hover {
            background-color: #388E3C;
        }

        QToolBar QToolButton:pressed {
            background-color: #2E7D32;
        }

        QToolBar::separator {
            background-color: #0f3460;
            width: 1px;
            margin: 4px 8px;
        }

        #commandTable {
            background-color: #16213e;
            color: #ffffff;
            border: 1px solid #0f3460;
            border-radius: 8px;
            gridline-color: #0f3460;
        }

        #commandTable::item {
            padding: 8px;
            border: none;
        }

        #commandTable::item:selected {
            background-color: #0f3460;
            color: #4CAF50;
        }

        #commandTable QHeaderView::section {
            background-color: #0f3460;
            color: #ffffff;
            padding: 10px;
            border: none;
            font-weight: bold;
        }

        #commandTable QHeaderView::section:horizontal {
            border-bottom: 2px solid #4CAF50;
        }
    )");
}
