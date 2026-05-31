#include "DevicePanel.h"

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
#include <QDialogButtonBox>
#include <QMessageBox>
#include <QHeaderView>

#include "../models/DeviceModel.h"

DeviceDialog::DeviceDialog(QWidget *parent)
    : QDialog(parent)
    , m_nameEdit(nullptr)
    , m_typeCombo(nullptr)
    , m_addressEdit(nullptr)
    , m_portSpin(nullptr)
    , m_protocolCombo(nullptr)
    , m_paramsTable(nullptr)
    , m_addParamButton(nullptr)
    , m_removeParamButton(nullptr)
    , m_okButton(nullptr)
    , m_cancelButton(nullptr)
    , m_mainLayout(nullptr)
    , m_buttonLayout(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
}

void DeviceDialog::setDeviceData(const QString &name, const QString &type, const QString &address,
                                 int port, const QString &protocol, const QVariantMap &params)
{
    if (m_nameEdit) m_nameEdit->setText(name);
    if (m_typeCombo) {
        int idx = m_typeCombo->findText(type);
        if (idx >= 0) m_typeCombo->setCurrentIndex(idx);
    }
    if (m_addressEdit) m_addressEdit->setText(address);
    if (m_portSpin) m_portSpin->setValue(port);
    if (m_protocolCombo) {
        int idx = m_protocolCombo->findText(protocol);
        if (idx >= 0) m_protocolCombo->setCurrentIndex(idx);
    }
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

QString DeviceDialog::name() const
{
    return m_nameEdit ? m_nameEdit->text().trimmed() : QString();
}

QString DeviceDialog::type() const
{
    return m_typeCombo ? m_typeCombo->currentText() : QString();
}

QString DeviceDialog::address() const
{
    return m_addressEdit ? m_addressEdit->text().trimmed() : QString();
}

int DeviceDialog::port() const
{
    return m_portSpin ? m_portSpin->value() : 0;
}

QString DeviceDialog::protocol() const
{
    return m_protocolCombo ? m_protocolCombo->currentText() : QString();
}

QVariantMap DeviceDialog::params() const
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

void DeviceDialog::onAddParamClicked()
{
    if (!m_paramsTable) return;
    int row = m_paramsTable->rowCount();
    m_paramsTable->insertRow(row);
    m_paramsTable->setItem(row, 0, new QTableWidgetItem());
    m_paramsTable->setItem(row, 1, new QTableWidgetItem());
    m_paramsTable->editItem(m_paramsTable->item(row, 0));
}

void DeviceDialog::onRemoveParamClicked()
{
    if (!m_paramsTable) return;
    auto items = m_paramsTable->selectedItems();
    if (items.isEmpty()) return;
    int row = items.first()->row();
    m_paramsTable->removeRow(row);
}

void DeviceDialog::onAcceptClicked()
{
    if (name().isEmpty()) {
        QMessageBox::warning(this, tr("警告"), tr("设备名称不能为空"));
        return;
    }
    if (address().isEmpty()) {
        QMessageBox::warning(this, tr("警告"), tr("设备地址不能为空"));
        return;
    }
    accept();
}

void DeviceDialog::setupUi()
{
    setWindowTitle(tr("设备信息"));
    setMinimumWidth(450);

    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(15);

    auto *nameLabel = new QLabel(tr("设备名称:"), this);
    m_nameEdit = new QLineEdit(this);
    m_nameEdit->setPlaceholderText(tr("请输入设备名称"));

    auto *typeLabel = new QLabel(tr("设备类型:"), this);
    m_typeCombo = new QComboBox(this);
    m_typeCombo->addItems({"plc", "sensor", "instrument"});

    auto *addressLabel = new QLabel(tr("设备地址:"), this);
    m_addressEdit = new QLineEdit(this);
    m_addressEdit->setPlaceholderText(tr("例如: 192.168.1.100"));

    auto *portLabel = new QLabel(tr("端口:"), this);
    m_portSpin = new QSpinBox(this);
    m_portSpin->setRange(1, 65535);
    m_portSpin->setValue(502);

    auto *protocolLabel = new QLabel(tr("通信协议:"), this);
    m_protocolCombo = new QComboBox(this);
    m_protocolCombo->addItems({"modbus-tcp", "modbus-rtu", "mqtt", "opc-ua"});

    auto *paramsLabel = new QLabel(tr("参数配置:"), this);
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
    m_okButton = new QPushButton(tr("确定"), this);
    m_cancelButton = new QPushButton(tr("取消"), this);
    m_buttonLayout->addStretch();
    m_buttonLayout->addWidget(m_okButton);
    m_buttonLayout->addWidget(m_cancelButton);

    m_mainLayout->addWidget(nameLabel);
    m_mainLayout->addWidget(m_nameEdit);
    m_mainLayout->addWidget(typeLabel);
    m_mainLayout->addWidget(m_typeCombo);
    m_mainLayout->addWidget(addressLabel);
    m_mainLayout->addWidget(m_addressEdit);
    m_mainLayout->addWidget(portLabel);
    m_mainLayout->addWidget(m_portSpin);
    m_mainLayout->addWidget(protocolLabel);
    m_mainLayout->addWidget(m_protocolCombo);
    m_mainLayout->addWidget(paramsLabel);
    m_mainLayout->addWidget(m_paramsTable);
    m_mainLayout->addLayout(paramBtnLayout);
    m_mainLayout->addLayout(m_buttonLayout);

    setLayout(m_mainLayout);
}

void DeviceDialog::setupConnections()
{
    connect(m_addParamButton, &QPushButton::clicked, this, &DeviceDialog::onAddParamClicked);
    connect(m_removeParamButton, &QPushButton::clicked, this, &DeviceDialog::onRemoveParamClicked);
    connect(m_okButton, &QPushButton::clicked, this, &DeviceDialog::onAcceptClicked);
    connect(m_cancelButton, &QPushButton::clicked, this, &QDialog::reject);
}

void DeviceDialog::applyStyle()
{
    setStyleSheet(R"(
        DeviceDialog {
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

DevicePanel::DevicePanel(QWidget *parent)
    : QWidget(parent)
    , m_model(nullptr)
    , m_tableView(nullptr)
    , m_toolBar(nullptr)
    , m_addAction(nullptr)
    , m_editAction(nullptr)
    , m_deleteAction(nullptr)
    , m_refreshAction(nullptr)
    , m_mainLayout(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
}

void DevicePanel::setModel(DeviceModel *model)
{
    m_model = model;
    if (m_tableView && m_model) {
        m_tableView->setModel(m_model);
        m_tableView->setColumnHidden(DeviceModel::IdCol, true);
    }
}

void DevicePanel::onAddClicked()
{
    if (!m_model) return;
    DeviceDialog dialog(this);
    dialog.setWindowTitle(tr("添加设备"));
    if (dialog.exec() == QDialog::Accepted) {
        Device device;
        device.name = dialog.name();
        device.type = dialog.type();
        device.address = dialog.address();
        device.port = dialog.port();
        device.protocol = dialog.protocol();
        device.params = dialog.params();
        m_model->addDevice(device);
    }
}

void DevicePanel::onEditClicked()
{
    if (!m_model || !m_tableView) return;
    auto index = m_tableView->currentIndex();
    if (!index.isValid()) {
        QMessageBox::information(this, tr("提示"), tr("请先选择要编辑的设备"));
        return;
    }
    int row = index.row();
    Device device = m_model->deviceAt(row);
    DeviceDialog dialog(this);
    dialog.setWindowTitle(tr("编辑设备"));
    dialog.setDeviceData(device.name, device.type, device.address,
                         device.port, device.protocol, device.params);
    if (dialog.exec() == QDialog::Accepted) {
        device.name = dialog.name();
        device.type = dialog.type();
        device.address = dialog.address();
        device.port = dialog.port();
        device.protocol = dialog.protocol();
        device.params = dialog.params();
        m_model->updateDevice(device);
    }
}

void DevicePanel::onDeleteClicked()
{
    if (!m_model || !m_tableView) return;
    auto index = m_tableView->currentIndex();
    if (!index.isValid()) {
        QMessageBox::information(this, tr("提示"), tr("请先选择要删除的设备"));
        return;
    }
    int row = index.row();
    Device device = m_model->deviceAt(row);
    auto ret = QMessageBox::question(this, tr("确认删除"),
                                     tr("确定要删除设备 \"%1\" 吗？").arg(device.name));
    if (ret == QMessageBox::Yes) {
        m_model->removeDevice(device.id);
    }
}

void DevicePanel::onRefreshClicked()
{
    if (m_model) {
        m_model->refresh();
    }
}

void DevicePanel::setupUi()
{
    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(15);

    auto *titleLabel = new QLabel(tr("设备管理"), this);
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
    m_refreshAction = m_toolBar->addAction(tr("刷新"));

    m_tableView = new QTableView(this);
    m_tableView->setObjectName("deviceTable");
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

void DevicePanel::setupConnections()
{
    connect(m_addAction, &QAction::triggered, this, &DevicePanel::onAddClicked);
    connect(m_editAction, &QAction::triggered, this, &DevicePanel::onEditClicked);
    connect(m_deleteAction, &QAction::triggered, this, &DevicePanel::onDeleteClicked);
    connect(m_refreshAction, &QAction::triggered, this, &DevicePanel::onRefreshClicked);
    if (m_tableView) {
        connect(m_tableView, &QTableView::doubleClicked, this, &DevicePanel::onEditClicked);
    }
}

void DevicePanel::applyStyle()
{
    setStyleSheet(R"(
        DevicePanel {
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

        #deviceTable {
            background-color: #16213e;
            color: #ffffff;
            border: 1px solid #0f3460;
            border-radius: 8px;
            gridline-color: #0f3460;
        }

        #deviceTable::item {
            padding: 8px;
            border: none;
        }

        #deviceTable::item:selected {
            background-color: #0f3460;
            color: #2196F3;
        }

        #deviceTable QHeaderView::section {
            background-color: #0f3460;
            color: #ffffff;
            padding: 10px;
            border: none;
            font-weight: bold;
        }

        #deviceTable QHeaderView::section:horizontal {
            border-bottom: 2px solid #2196F3;
        }
    )");
}
