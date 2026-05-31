#include "SchedulePanel.h"

#include <QToolBar>
#include <QAction>
#include <QTableView>
#include <QHeaderView>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QLineEdit>
#include <QComboBox>
#include <QSpinBox>
#include <QCheckBox>
#include <QTableWidget>
#include <QTableWidgetItem>
#include <QPushButton>
#include <QLabel>
#include <QMessageBox>
#include <QFont>
#include <QVariantMap>

#include "../models/ScheduledModel.h"
#include "../models/DeviceModel.h"

ScheduledDialog::ScheduledDialog(QWidget *parent)
    : QDialog(parent)
    , m_nameEdit(nullptr)
    , m_deviceCombo(nullptr)
    , m_actionCombo(nullptr)
    , m_intervalSpin(nullptr)
    , m_intervalUnitCombo(nullptr)
    , m_enabledCheck(nullptr)
    , m_paramsTable(nullptr)
    , m_addParamButton(nullptr)
    , m_removeParamButton(nullptr)
    , m_okButton(nullptr)
    , m_cancelButton(nullptr)
    , m_mainLayout(nullptr)
    , m_buttonLayout(nullptr)
    , m_paramBtnLayout(nullptr)
    , m_intervalLayout(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
}

void ScheduledDialog::setCommandData(const QString &name, const QString &deviceId,
                                     const QString &action, qint64 intervalSeconds,
                                     bool enabled, const QVariantMap &params)
{
    if (m_nameEdit) m_nameEdit->setText(name);
    if (m_deviceCombo) {
        int idx = m_deviceCombo->findData(deviceId);
        if (idx >= 0) m_deviceCombo->setCurrentIndex(idx);
    }
    if (m_actionCombo) {
        int idx = m_actionCombo->findText(action);
        if (idx >= 0) m_actionCombo->setCurrentIndex(idx);
    }
    if (m_intervalSpin && m_intervalUnitCombo) {
        if (intervalSeconds >= 3600) {
            m_intervalSpin->setValue(static_cast<int>(intervalSeconds / 3600));
            m_intervalUnitCombo->setCurrentIndex(2);
        } else if (intervalSeconds >= 60) {
            m_intervalSpin->setValue(static_cast<int>(intervalSeconds / 60));
            m_intervalUnitCombo->setCurrentIndex(1);
        } else {
            m_intervalSpin->setValue(static_cast<int>(intervalSeconds));
            m_intervalUnitCombo->setCurrentIndex(0);
        }
    }
    if (m_enabledCheck) m_enabledCheck->setChecked(enabled);
    if (m_paramsTable) {
        m_paramsTable->setRowCount(0);
        for (auto it = params.begin(); it != params.end(); ++it) {
            int row = m_paramsTable->rowCount();
            m_paramsTable->insertRow(row);
            m_paramsTable->setItem(row, 0, new QTableWidgetItem(it.key()));
            m_paramsTable->setItem(row, 1, new QTableWidgetItem(it.value().toString()));
        }
    }
}

QString ScheduledDialog::name() const
{
    return m_nameEdit ? m_nameEdit->text().trimmed() : QString();
}

QString ScheduledDialog::deviceId() const
{
    return m_deviceCombo ? m_deviceCombo->currentData().toString() : QString();
}

QString ScheduledDialog::action() const
{
    return m_actionCombo ? m_actionCombo->currentText() : QString();
}

qint64 ScheduledDialog::intervalSeconds() const
{
    if (!m_intervalSpin || !m_intervalUnitCombo) return 60;
    int value = m_intervalSpin->value();
    int unit = m_intervalUnitCombo->currentIndex();
    switch (unit) {
    case 0: return value;
    case 1: return value * 60LL;
    case 2: return value * 3600LL;
    default: return 60;
    }
}

bool ScheduledDialog::enabled() const
{
    return m_enabledCheck ? m_enabledCheck->isChecked() : true;
}

QVariantMap ScheduledDialog::params() const
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

void ScheduledDialog::setDevices(const QList<QPair<QString, QString>> &devices)
{
    if (!m_deviceCombo) return;
    m_deviceCombo->clear();
    for (const auto &device : devices) {
        m_deviceCombo->addItem(device.second, device.first);
    }
}

void ScheduledDialog::onAddParamClicked()
{
    if (!m_paramsTable) return;
    int row = m_paramsTable->rowCount();
    m_paramsTable->insertRow(row);
    m_paramsTable->setItem(row, 0, new QTableWidgetItem());
    m_paramsTable->setItem(row, 1, new QTableWidgetItem());
    m_paramsTable->editItem(m_paramsTable->item(row, 0));
}

void ScheduledDialog::onRemoveParamClicked()
{
    if (!m_paramsTable) return;
    auto items = m_paramsTable->selectedItems();
    if (items.isEmpty()) return;
    int row = items.first()->row();
    m_paramsTable->removeRow(row);
}

void ScheduledDialog::onAcceptClicked()
{
    if (name().isEmpty()) {
        QMessageBox::warning(this, tr("警告"), tr("任务名称不能为空"));
        return;
    }
    if (deviceId().isEmpty()) {
        QMessageBox::warning(this, tr("警告"), tr("请选择目标设备"));
        return;
    }
    if (intervalSeconds() < 10) {
        QMessageBox::warning(this, tr("警告"), tr("执行间隔不能小于10秒"));
        return;
    }
    accept();
}

void ScheduledDialog::setupUi()
{
    setWindowTitle(tr("定时任务"));
    setMinimumWidth(550);
    setMinimumHeight(650);
    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(15);

    auto *nameLabel = new QLabel(tr("任务名称:"), this);
    m_nameEdit = new QLineEdit(this);
    m_nameEdit->setPlaceholderText(tr("请输入任务名称"));

    auto *deviceLabel = new QLabel(tr("目标设备:"), this);
    m_deviceCombo = new QComboBox(this);

    auto *actionLabel = new QLabel(tr("执行指令:"), this);
    m_actionCombo = new QComboBox(this);
    m_actionCombo->addItems({"read", "write", "start", "stop", "reset", "reboot"});

    auto *intervalLabel = new QLabel(tr("执行间隔:"), this);
    m_intervalLayout = new QHBoxLayout();
    m_intervalSpin = new QSpinBox(this);
    m_intervalSpin->setRange(1, 9999);
    m_intervalSpin->setValue(1);
    m_intervalUnitCombo = new QComboBox(this);
    m_intervalUnitCombo->addItems({tr("秒"), tr("分钟"), tr("小时")});
    m_intervalUnitCombo->setCurrentIndex(1);
    m_intervalLayout->addWidget(m_intervalSpin, 1);
    m_intervalLayout->addWidget(m_intervalUnitCombo);

    auto *enabledLabel = new QLabel(tr("启用状态:"), this);
    m_enabledCheck = new QCheckBox(tr("立即启用"), this);
    m_enabledCheck->setChecked(true);

    auto *paramsLabel = new QLabel(tr("指令参数:"), this);
    m_paramsTable = new QTableWidget(0, 2, this);
    m_paramsTable->setHorizontalHeaderLabels({tr("键"), tr("值")});
    m_paramsTable->horizontalHeader()->setStretchLastSection(true);
    m_paramsTable->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    m_paramsTable->verticalHeader()->setVisible(false);
    m_paramsTable->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_paramsTable->setSelectionMode(QAbstractItemView::SingleSelection);

    m_paramBtnLayout = new QHBoxLayout();
    m_addParamButton = new QPushButton(tr("添加参数"), this);
    m_removeParamButton = new QPushButton(tr("删除参数"), this);
    m_paramBtnLayout->addWidget(m_addParamButton);
    m_paramBtnLayout->addWidget(m_removeParamButton);
    m_paramBtnLayout->addStretch();

    m_buttonLayout = new QHBoxLayout();
    m_okButton = new QPushButton(tr("确定"), this);
    m_cancelButton = new QPushButton(tr("取消"), this);
    m_buttonLayout->addStretch();
    m_buttonLayout->addWidget(m_okButton);
    m_buttonLayout->addWidget(m_cancelButton);

    m_mainLayout->addWidget(nameLabel);
    m_mainLayout->addWidget(m_nameEdit);
    m_mainLayout->addWidget(deviceLabel);
    m_mainLayout->addWidget(m_deviceCombo);
    m_mainLayout->addWidget(actionLabel);
    m_mainLayout->addWidget(m_actionCombo);
    m_mainLayout->addWidget(intervalLabel);
    m_mainLayout->addLayout(m_intervalLayout);
    m_mainLayout->addWidget(enabledLabel);
    m_mainLayout->addWidget(m_enabledCheck);
    m_mainLayout->addWidget(paramsLabel);
    m_mainLayout->addWidget(m_paramsTable, 1);
    m_mainLayout->addLayout(m_paramBtnLayout);
    m_mainLayout->addLayout(m_buttonLayout);
    setLayout(m_mainLayout);
}

void ScheduledDialog::setupConnections()
{
    connect(m_addParamButton, &QPushButton::clicked, this, &ScheduledDialog::onAddParamClicked);
    connect(m_removeParamButton, &QPushButton::clicked, this, &ScheduledDialog::onRemoveParamClicked);
    connect(m_okButton, &QPushButton::clicked, this, &ScheduledDialog::onAcceptClicked);
    connect(m_cancelButton, &QPushButton::clicked, this, &QDialog::reject);
}

void ScheduledDialog::applyStyle()
{
    setStyleSheet(R"(
        ScheduledDialog {
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
        QCheckBox {
            color: #ffffff;
            font-size: 14px;
            spacing: 8px;
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

SchedulePanel::SchedulePanel(QWidget *parent)
    : QWidget(parent)
    , m_model(nullptr)
    , m_deviceModel(nullptr)
    , m_tableView(nullptr)
    , m_toolBar(nullptr)
    , m_addAction(nullptr)
    , m_editAction(nullptr)
    , m_deleteAction(nullptr)
    , m_triggerAction(nullptr)
    , m_toggleAction(nullptr)
    , m_refreshAction(nullptr)
    , m_mainLayout(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
}

void SchedulePanel::setModel(ScheduledModel *model)
{
    if (m_model) {
        disconnect(m_model, &ScheduledModel::error, this, nullptr);
    }
    m_model = model;
    if (m_tableView && m_model) {
        m_tableView->setModel(m_model);
        m_tableView->setColumnHidden(ScheduledModel::IdCol, true);
    }
    if (m_model) {
        connect(m_model, &ScheduledModel::error, this, [this](const QString &msg) {
            QMessageBox::critical(this, tr("错误"), msg);
        });
    }
}

void SchedulePanel::setDeviceModel(DeviceModel *model)
{
    m_deviceModel = model;
}

void SchedulePanel::onAddClicked()
{
    if (!m_model || !m_deviceModel) return;
    m_deviceModel->refresh();
    ScheduledDialog dialog(this);
    dialog.setWindowTitle(tr("添加定时任务"));

    QList<QPair<QString, QString>> devices;
    for (const auto &device : m_deviceModel->devices()) {
        devices.append(qMakePair(device.id, device.name));
    }
    dialog.setDevices(devices);

    if (dialog.exec() == QDialog::Accepted) {
        ScheduledCommand cmd;
        cmd.name = dialog.name();
        cmd.deviceId = dialog.deviceId();
        cmd.action = dialog.action();
        cmd.intervalSeconds = dialog.intervalSeconds();
        cmd.enabled = dialog.enabled();
        cmd.params = dialog.params();
        m_model->addCommand(cmd);
    }
}

void SchedulePanel::onEditClicked()
{
    if (!m_model || !m_deviceModel || !m_tableView) return;
    auto index = m_tableView->currentIndex();
    if (!index.isValid()) {
        QMessageBox::information(this, tr("提示"), tr("请先选择要编辑的任务"));
        return;
    }
    int row = index.row();
    ScheduledCommand cmd = m_model->commandAt(row);
    m_deviceModel->refresh();

    ScheduledDialog dialog(this);
    dialog.setWindowTitle(tr("编辑定时任务"));

    QList<QPair<QString, QString>> devices;
    for (const auto &device : m_deviceModel->devices()) {
        devices.append(qMakePair(device.id, device.name));
    }
    dialog.setDevices(devices);
    dialog.setCommandData(cmd.name, cmd.deviceId, cmd.action,
                          cmd.intervalSeconds, cmd.enabled, cmd.params);

    if (dialog.exec() == QDialog::Accepted) {
        cmd.name = dialog.name();
        cmd.deviceId = dialog.deviceId();
        cmd.action = dialog.action();
        cmd.intervalSeconds = dialog.intervalSeconds();
        cmd.enabled = dialog.enabled();
        cmd.params = dialog.params();
        m_model->updateCommand(cmd);
    }
}

void SchedulePanel::onDeleteClicked()
{
    if (!m_model || !m_tableView) return;
    auto index = m_tableView->currentIndex();
    if (!index.isValid()) {
        QMessageBox::information(this, tr("提示"), tr("请先选择要删除的任务"));
        return;
    }
    int row = index.row();
    ScheduledCommand cmd = m_model->commandAt(row);
    auto ret = QMessageBox::question(this, tr("确认删除"),
                                     tr("确定要删除任务 \"%1\" 吗？").arg(cmd.name));
    if (ret == QMessageBox::Yes) {
        m_model->removeCommand(cmd.id);
    }
}

void SchedulePanel::onTriggerClicked()
{
    if (!m_model || !m_tableView) return;
    auto index = m_tableView->currentIndex();
    if (!index.isValid()) {
        QMessageBox::information(this, tr("提示"), tr("请先选择要执行的任务"));
        return;
    }
    int row = index.row();
    ScheduledCommand cmd = m_model->commandAt(row);
    auto ret = QMessageBox::question(this, tr("立即执行"),
                                     tr("确定要立即执行任务 \"%1\" 吗？").arg(cmd.name));
    if (ret == QMessageBox::Yes) {
        m_model->triggerCommand(cmd.id);
        QMessageBox::information(this, tr("执行成功"),
                                 tr("任务 \"%1\" 已加入执行队列").arg(cmd.name));
    }
}

void SchedulePanel::onToggleClicked()
{
    if (!m_model || !m_tableView) return;
    auto index = m_tableView->currentIndex();
    if (!index.isValid()) {
        QMessageBox::information(this, tr("提示"), tr("请先选择任务"));
        return;
    }
    int row = index.row();
    ScheduledCommand cmd = m_model->commandAt(row);
    cmd.enabled = !cmd.enabled;
    m_model->updateCommand(cmd);
}

void SchedulePanel::onRefreshClicked()
{
    if (m_model) {
        m_model->refresh();
    }
}

void SchedulePanel::setupUi()
{
    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(15);

    auto *titleLabel = new QLabel(tr("定时任务"), this);
    QFont titleFont = titleLabel->font();
    titleFont.setPointSize(20);
    titleFont.setBold(true);
    titleLabel->setFont(titleFont);
    titleLabel->setObjectName("panelTitle");

    m_toolBar = new QToolBar(this);
    m_toolBar->setMovable(false);
    m_toolBar->setIconSize(QSize(18, 18));
    m_addAction = m_toolBar->addAction(tr("添加"));
    m_editAction = m_toolBar->addAction(tr("编辑"));
    m_deleteAction = m_toolBar->addAction(tr("删除"));
    m_toolBar->addSeparator();
    m_triggerAction = m_toolBar->addAction(tr("立即执行"));
    m_toggleAction = m_toolBar->addAction(tr("启用/禁用"));
    m_toolBar->addSeparator();
    m_refreshAction = m_toolBar->addAction(tr("刷新"));

    m_tableView = new QTableView(this);
    m_tableView->setObjectName("scheduleTable");
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

void SchedulePanel::setupConnections()
{
    connect(m_addAction, &QAction::triggered, this, &SchedulePanel::onAddClicked);
    connect(m_editAction, &QAction::triggered, this, &SchedulePanel::onEditClicked);
    connect(m_deleteAction, &QAction::triggered, this, &SchedulePanel::onDeleteClicked);
    connect(m_triggerAction, &QAction::triggered, this, &SchedulePanel::onTriggerClicked);
    connect(m_toggleAction, &QAction::triggered, this, &SchedulePanel::onToggleClicked);
    connect(m_refreshAction, &QAction::triggered, this, &SchedulePanel::onRefreshClicked);
    if (m_tableView) {
        connect(m_tableView, &QTableView::doubleClicked, this, &SchedulePanel::onEditClicked);
    }
}

void SchedulePanel::applyStyle()
{
    setStyleSheet(R"(
        SchedulePanel {
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

        QToolBar::separator {
            background-color: #0f3460;
            width: 1px;
            margin: 4px 8px;
        }

        #scheduleTable {
            background-color: #16213e;
            color: #ffffff;
            border: 1px solid #0f3460;
            border-radius: 8px;
            gridline-color: #0f3460;
        }

        #scheduleTable::item {
            padding: 8px;
            border: none;
        }

        #scheduleTable::item:selected {
            background-color: #0f3460;
            color: #2196F3;
        }

        #scheduleTable QHeaderView::section {
            background-color: #0f3460;
            color: #ffffff;
            padding: 10px;
            border: none;
            font-weight: bold;
        }

        #scheduleTable QHeaderView::section:horizontal {
            border-bottom: 2px solid #2196F3;
        }
    )");
}
