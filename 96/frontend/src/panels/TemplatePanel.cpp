#include "TemplatePanel.h"

#include <QToolBar>
#include <QAction>
#include <QTableView>
#include <QHeaderView>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QLineEdit>
#include <QComboBox>
#include <QTextEdit>
#include <QTableWidget>
#include <QPushButton>
#include <QLabel>
#include <QListWidget>
#include <QListWidgetItem>
#include <QMessageBox>
#include <QFont>
#include <QVariantMap>
#include <QFileDialog>
#include <QFrame>

#include "../models/TemplateModel.h"
#include "../models/DeviceModel.h"

TemplateDialog::TemplateDialog(QWidget *parent)
    : QDialog(parent)
    , m_nameEdit(nullptr)
    , m_deviceTypeCombo(nullptr)
    , m_protocolCombo(nullptr)
    , m_descriptionEdit(nullptr)
    , m_paramsTable(nullptr)
    , m_addParamButton(nullptr)
    , m_removeParamButton(nullptr)
    , m_okButton(nullptr)
    , m_cancelButton(nullptr)
    , m_mainLayout(nullptr)
    , m_buttonLayout(nullptr)
    , m_paramBtnLayout(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
}

void TemplateDialog::setTemplateData(const QString &name, const QString &deviceType,
                                     const QString &protocol, const QString &description,
                                     const QVariantMap &params)
{
    if (m_nameEdit) m_nameEdit->setText(name);
    if (m_deviceTypeCombo) {
        int idx = m_deviceTypeCombo->findText(deviceType);
        if (idx >= 0) m_deviceTypeCombo->setCurrentIndex(idx);
    }
    if (m_protocolCombo) {
        int idx = m_protocolCombo->findText(protocol);
        if (idx >= 0) m_protocolCombo->setCurrentIndex(idx);
    }
    if (m_descriptionEdit) m_descriptionEdit->setPlainText(description);
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

QString TemplateDialog::name() const
{
    return m_nameEdit ? m_nameEdit->text().trimmed() : QString();
}

QString TemplateDialog::deviceType() const
{
    return m_deviceTypeCombo ? m_deviceTypeCombo->currentText() : QString();
}

QString TemplateDialog::protocol() const
{
    return m_protocolCombo ? m_protocolCombo->currentText() : QString();
}

QString TemplateDialog::description() const
{
    return m_descriptionEdit ? m_descriptionEdit->toPlainText().trimmed() : QString();
}

QVariantMap TemplateDialog::params() const
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

void TemplateDialog::onAddParamClicked()
{
    if (!m_paramsTable) return;
    int row = m_paramsTable->rowCount();
    m_paramsTable->insertRow(row);
    m_paramsTable->setItem(row, 0, new QTableWidgetItem());
    m_paramsTable->setItem(row, 1, new QTableWidgetItem());
    m_paramsTable->editItem(m_paramsTable->item(row, 0));
}

void TemplateDialog::onRemoveParamClicked()
{
    if (!m_paramsTable) return;
    auto items = m_paramsTable->selectedItems();
    if (items.isEmpty()) return;
    int row = items.first()->row();
    m_paramsTable->removeRow(row);
}

void TemplateDialog::onAcceptClicked()
{
    if (name().isEmpty()) {
        QMessageBox::warning(this, tr("警告"), tr("模板名称不能为空"));
        return;
    }
    accept();
}

void TemplateDialog::setupUi()
{
    setWindowTitle(tr("模板信息"));
    setMinimumWidth(500);
    setMinimumHeight(600);
    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(15);
    auto *nameLabel = new QLabel(tr("模板名称:"), this);
    m_nameEdit = new QLineEdit(this);
    m_nameEdit->setPlaceholderText(tr("请输入模板名称"));
    auto *deviceTypeLabel = new QLabel(tr("设备类型:"), this);
    m_deviceTypeCombo = new QComboBox(this);
    m_deviceTypeCombo->addItems({"plc", "sensor", "instrument"});
    auto *protocolLabel = new QLabel(tr("通信协议:"), this);
    m_protocolCombo = new QComboBox(this);
    m_protocolCombo->addItems({"modbus-tcp", "modbus-rtu", "mqtt", "opc-ua"});
    auto *descriptionLabel = new QLabel(tr("描述:"), this);
    m_descriptionEdit = new QTextEdit(this);
    m_descriptionEdit->setPlaceholderText(tr("请输入模板描述"));
    m_descriptionEdit->setMaximumHeight(100);
    auto *paramsLabel = new QLabel(tr("参数配置:"), this);
    m_paramsTable = new QTableWidget(0, 2, this);
    m_paramsTable->setHorizontalHeaderLabels({tr("键"), tr("值")});
    m_paramsTable->horizontalHeader()->setStretchLastSection(true);
    m_paramsTable->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    m_paramsTable->verticalHeader()->setVisible(false);
    m_paramsTable->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_paramsTable->setSelectionMode(QAbstractItemView::SingleSelection);
    m_paramBtnLayout = new QHBoxLayout();
    m_addParamButton = new QPushButton(tr("添加"), this);
    m_removeParamButton = new QPushButton(tr("删除"), this);
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
    m_mainLayout->addWidget(deviceTypeLabel);
    m_mainLayout->addWidget(m_deviceTypeCombo);
    m_mainLayout->addWidget(protocolLabel);
    m_mainLayout->addWidget(m_protocolCombo);
    m_mainLayout->addWidget(descriptionLabel);
    m_mainLayout->addWidget(m_descriptionEdit);
    m_mainLayout->addWidget(paramsLabel);
    m_mainLayout->addWidget(m_paramsTable, 1);
    m_mainLayout->addLayout(m_paramBtnLayout);
    m_mainLayout->addLayout(m_buttonLayout);
    setLayout(m_mainLayout);
}

void TemplateDialog::setupConnections()
{
    connect(m_addParamButton, &QPushButton::clicked, this, &TemplateDialog::onAddParamClicked);
    connect(m_removeParamButton, &QPushButton::clicked, this, &TemplateDialog::onRemoveParamClicked);
    connect(m_okButton, &QPushButton::clicked, this, &TemplateDialog::onAcceptClicked);
    connect(m_cancelButton, &QPushButton::clicked, this, &QDialog::reject);
}

void TemplateDialog::applyStyle()
{
    setStyleSheet(R"(
        TemplateDialog {
            background-color: #1a1a2e;
        }
        QLabel {
            color: #ffffff;
            font-size: 14px;
        }
        QLineEdit, QComboBox, QTextEdit {
            background-color: #16213e;
            color: #ffffff;
            border: 1px solid #0f3460;
            border-radius: 4px;
            padding: 8px;
            font-size: 14px;
        }
        QLineEdit:focus, QComboBox:focus, QTextEdit:focus {
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

ApplyTemplateDialog::ApplyTemplateDialog(QWidget *parent)
    : QDialog(parent)
    , m_templateNameLabel(nullptr)
    , m_templateTypeLabel(nullptr)
    , m_templateProtocolLabel(nullptr)
    , m_templateDescLabel(nullptr)
    , m_deviceList(nullptr)
    , m_applyButton(nullptr)
    , m_cancelButton(nullptr)
    , m_mainLayout(nullptr)
    , m_buttonLayout(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
}

void ApplyTemplateDialog::setTemplateInfo(const QString &name, const QString &deviceType,
                                          const QString &protocol, const QString &description)
{
    if (m_templateNameLabel) m_templateNameLabel->setText(name);
    if (m_templateTypeLabel) m_templateTypeLabel->setText(deviceType);
    if (m_templateProtocolLabel) m_templateProtocolLabel->setText(protocol);
    if (m_templateDescLabel) m_templateDescLabel->setText(description);
}

void ApplyTemplateDialog::setDevices(const QList<QPair<QString, QString>> &devices)
{
    if (!m_deviceList) return;
    m_deviceList->clear();
    for (const auto &device : devices) {
        auto *item = new QListWidgetItem(device.second, m_deviceList);
        item->setData(Qt::UserRole, device.first);
        item->setFlags(item->flags() | Qt::ItemIsUserCheckable);
        item->setCheckState(Qt::Unchecked);
        m_deviceList->addItem(item);
    }
}

QStringList ApplyTemplateDialog::selectedDeviceIds() const
{
    QStringList ids;
    if (!m_deviceList) return ids;
    for (int i = 0; i < m_deviceList->count(); ++i) {
        auto *item = m_deviceList->item(i);
        if (item->checkState() == Qt::Checked) {
            ids.append(item->data(Qt::UserRole).toString());
        }
    }
    return ids;
}

void ApplyTemplateDialog::onApplyClicked()
{
    if (selectedDeviceIds().isEmpty()) {
        QMessageBox::warning(this, tr("警告"), tr("请至少选择一个设备"));
        return;
    }
    accept();
}

void ApplyTemplateDialog::setupUi()
{
    setWindowTitle(tr("应用模板"));
    setMinimumWidth(450);
    setMinimumHeight(500);
    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(15);
    auto *titleLabel = new QLabel(tr("模板信息"), this);
    QFont titleFont = titleLabel->font();
    titleFont.setPointSize(16);
    titleFont.setBold(true);
    titleLabel->setFont(titleFont);
    auto *infoGroup = new QWidget(this);
    auto *infoLayout = new QFormLayout(infoGroup);
    infoLayout->setContentsMargins(0, 0, 0, 0);
    infoLayout->setSpacing(10);
    auto *nameLabel = new QLabel(tr("模板名称:"), this);
    m_templateNameLabel = new QLabel(this);
    m_templateNameLabel->setStyleSheet("font-weight: bold; color: #2196F3;");
    auto *typeLabel = new QLabel(tr("设备类型:"), this);
    m_templateTypeLabel = new QLabel(this);
    auto *protocolLabel = new QLabel(tr("通信协议:"), this);
    m_templateProtocolLabel = new QLabel(this);
    auto *descLabel = new QLabel(tr("描述:"), this);
    m_templateDescLabel = new QLabel(this);
    m_templateDescLabel->setWordWrap(true);
    infoLayout->addRow(nameLabel, m_templateNameLabel);
    infoLayout->addRow(typeLabel, m_templateTypeLabel);
    infoLayout->addRow(protocolLabel, m_templateProtocolLabel);
    infoLayout->addRow(descLabel, m_templateDescLabel);
    infoGroup->setLayout(infoLayout);
    auto *separator = new QFrame(this);
    separator->setFrameShape(QFrame::HLine);
    separator->setFrameShadow(QFrame::Sunken);
    separator->setStyleSheet("background-color: #0f3460; border: none; height: 1px;");
    auto *devicesLabel = new QLabel(tr("选择设备:"), this);
    QFont devicesFont = devicesLabel->font();
    devicesFont.setPointSize(16);
    devicesFont.setBold(true);
    devicesLabel->setFont(devicesFont);
    m_deviceList = new QListWidget(this);
    m_deviceList->setSelectionMode(QAbstractItemView::NoSelection);
    m_buttonLayout = new QHBoxLayout();
    m_applyButton = new QPushButton(tr("应用"), this);
    m_cancelButton = new QPushButton(tr("取消"), this);
    m_buttonLayout->addStretch();
    m_buttonLayout->addWidget(m_applyButton);
    m_buttonLayout->addWidget(m_cancelButton);
    m_mainLayout->addWidget(titleLabel);
    m_mainLayout->addWidget(infoGroup);
    m_mainLayout->addWidget(separator);
    m_mainLayout->addWidget(devicesLabel);
    m_mainLayout->addWidget(m_deviceList, 1);
    m_mainLayout->addLayout(m_buttonLayout);
    setLayout(m_mainLayout);
}

void ApplyTemplateDialog::setupConnections()
{
    connect(m_applyButton, &QPushButton::clicked, this, &ApplyTemplateDialog::onApplyClicked);
    connect(m_cancelButton, &QPushButton::clicked, this, &QDialog::reject);
}

void ApplyTemplateDialog::applyStyle()
{
    setStyleSheet(R"(
        ApplyTemplateDialog {
            background-color: #1a1a2e;
        }
        QLabel {
            color: #ffffff;
            font-size: 14px;
        }
        QListWidget {
            background-color: #16213e;
            color: #ffffff;
            border: 1px solid #0f3460;
            border-radius: 4px;
            padding: 5px;
        }
        QListWidget::item {
            padding: 8px;
            border-radius: 4px;
        }
        QListWidget::item:hover {
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
        QPushButton#m_cancelButton {
            background-color: #757575;
        }
        QPushButton#m_cancelButton:hover {
            background-color: #616161;
        }
    )");
    m_cancelButton->setObjectName("m_cancelButton");
}

TemplatePanel::TemplatePanel(QWidget *parent)
    : QWidget(parent)
    , m_model(nullptr)
    , m_deviceModel(nullptr)
    , m_tableView(nullptr)
    , m_toolBar(nullptr)
    , m_addAction(nullptr)
    , m_editAction(nullptr)
    , m_deleteAction(nullptr)
    , m_applyAction(nullptr)
    , m_refreshAction(nullptr)
    , m_importBatchAction(nullptr)
    , m_backupAction(nullptr)
    , m_restoreAction(nullptr)
    , m_mainLayout(nullptr)
{
    setupUi();
    setupConnections();
    applyStyle();
}

void TemplatePanel::setDeviceModel(DeviceModel *model)
{
    m_deviceModel = model;
}

void TemplatePanel::onAddClicked()
{
    if (!m_model) return;
    TemplateDialog dialog(this);
    dialog.setWindowTitle(tr("添加模板"));
    if (dialog.exec() == QDialog::Accepted) {
        Template tpl;
        tpl.name = dialog.name();
        tpl.deviceType = dialog.deviceType();
        tpl.protocol = dialog.protocol();
        tpl.description = dialog.description();
        tpl.params = dialog.params();
        m_model->addTemplate(tpl);
    }
}

void TemplatePanel::onEditClicked()
{
    if (!m_model || !m_tableView) return;
    auto index = m_tableView->currentIndex();
    if (!index.isValid()) {
        QMessageBox::information(this, tr("提示"), tr("请先选择要编辑的模板"));
        return;
    }
    int row = index.row();
    Template tpl = m_model->templateAt(row);
    TemplateDialog dialog(this);
    dialog.setWindowTitle(tr("编辑模板"));
    dialog.setTemplateData(tpl.name, tpl.deviceType, tpl.protocol,
                           tpl.description, tpl.params);
    if (dialog.exec() == QDialog::Accepted) {
        tpl.name = dialog.name();
        tpl.deviceType = dialog.deviceType();
        tpl.protocol = dialog.protocol();
        tpl.description = dialog.description();
        tpl.params = dialog.params();
        m_model->updateTemplate(tpl);
    }
}

void TemplatePanel::onDeleteClicked()
{
    if (!m_model || !m_tableView) return;
    auto index = m_tableView->currentIndex();
    if (!index.isValid()) {
        QMessageBox::information(this, tr("提示"), tr("请先选择要删除的模板"));
        return;
    }
    int row = index.row();
    Template tpl = m_model->templateAt(row);
    auto ret = QMessageBox::question(this, tr("确认删除"),
                                     tr("确定要删除模板 \"%1\" 吗？").arg(tpl.name));
    if (ret == QMessageBox::Yes) {
        m_model->removeTemplate(tpl.id);
    }
}

void TemplatePanel::onApplyClicked()
{
    if (!m_model || !m_deviceModel || !m_tableView) return;
    auto index = m_tableView->currentIndex();
    if (!index.isValid()) {
        QMessageBox::information(this, tr("提示"), tr("请先选择要应用的模板"));
        return;
    }
    int row = index.row();
    Template tpl = m_model->templateAt(row);
    m_deviceModel->refresh();
    ApplyTemplateDialog dialog(this);
    dialog.setTemplateInfo(tpl.name, tpl.deviceType, tpl.protocol, tpl.description);
    QList<QPair<QString, QString>> devices;
    for (const auto &device : m_deviceModel->devices()) {
        devices.append(qMakePair(device.id, device.name));
    }
    dialog.setDevices(devices);
    if (dialog.exec() == QDialog::Accepted) {
        QStringList deviceIds = dialog.selectedDeviceIds();
        m_model->applyToDevices(tpl.id, deviceIds);
    }
}

void TemplatePanel::onRefreshClicked()
{
    if (m_model) {
        m_model->refresh();
    }
}

void TemplatePanel::onImportBatchClicked()
{
    if (!m_model) return;

    QStringList filePaths = QFileDialog::getOpenFileNames(
        this,
        tr("批量导入模板"),
        QString(),
        tr("JSON Files (*.json);;All Files (*)")
    );

    if (filePaths.isEmpty()) return;

    QMessageBox::StandardButton ret = QMessageBox::question(
        this,
        tr("确认导入"),
        tr("确定要导入 %1 个模板文件吗？\n部分失败不会阻止其他文件导入。")
            .arg(filePaths.size())
    );

    if (ret != QMessageBox::Yes) return;

    m_model->importBatchFiles(filePaths);
}

void TemplatePanel::onBackupClicked()
{
    if (!m_model) return;

    QMessageBox::StandardButton ret = QMessageBox::question(
        this,
        tr("确认备份"),
        tr("确定要备份所有配置模板吗？")
    );

    if (ret != QMessageBox::Yes) return;

    m_model->exportAll();
}

void TemplatePanel::onRestoreClicked()
{
    if (!m_model) return;

    QString filePath = QFileDialog::getOpenFileName(
        this,
        tr("选择备份文件"),
        QString(),
        tr("JSON Files (*.json);;All Files (*)")
    );

    if (filePath.isEmpty()) return;

    QMessageBox::StandardButton ret = QMessageBox::question(
        this,
        tr("确认恢复"),
        tr("确定要从备份文件恢复模板吗？\n\n注意：已存在的模板ID会自动生成新ID。")
    );

    if (ret != QMessageBox::Yes) return;

    m_model->restore(filePath);
}

void TemplatePanel::setupUi()
{
    m_mainLayout = new QVBoxLayout(this);
    m_mainLayout->setContentsMargins(20, 20, 20, 20);
    m_mainLayout->setSpacing(15);
    auto *titleLabel = new QLabel(tr("模板管理"), this);
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
    m_applyAction = m_toolBar->addAction(tr("应用"));
    m_toolBar->addSeparator();
    m_importBatchAction = m_toolBar->addAction(tr("批量导入"));
    m_toolBar->addSeparator();
    m_backupAction = m_toolBar->addAction(tr("💾 备份"));
    m_restoreAction = m_toolBar->addAction(tr("📂 恢复"));
    m_toolBar->addSeparator();
    m_refreshAction = m_toolBar->addAction(tr("刷新"));
    m_tableView = new QTableView(this);
    m_tableView->setObjectName("templateTable");
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

void TemplatePanel::setupConnections()
{
    connect(m_addAction, &QAction::triggered, this, &TemplatePanel::onAddClicked);
    connect(m_editAction, &QAction::triggered, this, &TemplatePanel::onEditClicked);
    connect(m_deleteAction, &QAction::triggered, this, &TemplatePanel::onDeleteClicked);
    connect(m_applyAction, &QAction::triggered, this, &TemplatePanel::onApplyClicked);
    connect(m_refreshAction, &QAction::triggered, this, &TemplatePanel::onRefreshClicked);
    connect(m_importBatchAction, &QAction::triggered, this, &TemplatePanel::onImportBatchClicked);
    connect(m_backupAction, &QAction::triggered, this, &TemplatePanel::onBackupClicked);
    connect(m_restoreAction, &QAction::triggered, this, &TemplatePanel::onRestoreClicked);
    if (m_tableView) {
        connect(m_tableView, &QTableView::doubleClicked, this, &TemplatePanel::onEditClicked);
    }
}

void TemplatePanel::setModel(TemplateModel *model)
{
    if (m_model) {
        disconnect(m_model, &TemplateModel::batchImported, this, nullptr);
        disconnect(m_model, &TemplateModel::error, this, nullptr);
        disconnect(m_model, &TemplateModel::success, this, nullptr);
    }

    m_model = model;
    if (m_tableView && m_model) {
        m_tableView->setModel(m_model);
        m_tableView->setColumnHidden(TemplateModel::IdCol, true);
    }

    if (m_model) {
        connect(m_model, &TemplateModel::batchImported, this, [this](const QString &summary) {
            QMessageBox::information(this, tr("导入完成"), summary);
        });
        connect(m_model, &TemplateModel::error, this, [this](const QString &message) {
            QMessageBox::critical(this, tr("错误"), message);
        });
        connect(m_model, &TemplateModel::success, this, [this](const QString &message) {
            QMessageBox::information(this, tr("成功"), message);
        });
    }
}

void TemplatePanel::applyStyle()
{
    setStyleSheet(R"(
        TemplatePanel {
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
        #templateTable {
            background-color: #16213e;
            color: #ffffff;
            border: 1px solid #0f3460;
            border-radius: 8px;
            gridline-color: #0f3460;
        }
        #templateTable::item {
            padding: 8px;
            border: none;
        }
        #templateTable::item:selected {
            background-color: #0f3460;
            color: #2196F3;
        }
        #templateTable QHeaderView::section {
            background-color: #0f3460;
            color: #ffffff;
            padding: 10px;
            border: none;
            font-weight: bold;
        }
        #templateTable QHeaderView::section:horizontal {
            border-bottom: 2px solid #2196F3;
        }
    )");
}
