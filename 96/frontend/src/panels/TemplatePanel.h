#ifndef TEMPLATEPANEL_H
#define TEMPLATEPANEL_H

#include <QWidget>
#include <QDialog>

class TemplateModel;
class DeviceModel;
class QTableView;
class QToolBar;
class QAction;
class QLineEdit;
class QComboBox;
class QTextEdit;
class QTableWidget;
class QPushButton;
class QVBoxLayout;
class QHBoxLayout;
class QLabel;
class QListWidget;
class QListWidgetItem;
class QFormLayout;

class TemplateDialog : public QDialog
{
    Q_OBJECT

public:
    explicit TemplateDialog(QWidget *parent = nullptr);
    ~TemplateDialog() override = default;

    void setTemplateData(const QString &name, const QString &deviceType,
                         const QString &protocol, const QString &description,
                         const QVariantMap &params);
    QString name() const;
    QString deviceType() const;
    QString protocol() const;
    QString description() const;
    QVariantMap params() const;

private slots:
    void onAddParamClicked();
    void onRemoveParamClicked();
    void onAcceptClicked();

private:
    void setupUi();
    void setupConnections();
    void applyStyle();

    QLineEdit *m_nameEdit;
    QComboBox *m_deviceTypeCombo;
    QComboBox *m_protocolCombo;
    QTextEdit *m_descriptionEdit;
    QTableWidget *m_paramsTable;
    QPushButton *m_addParamButton;
    QPushButton *m_removeParamButton;
    QPushButton *m_okButton;
    QPushButton *m_cancelButton;
    QVBoxLayout *m_mainLayout;
    QHBoxLayout *m_buttonLayout;
    QHBoxLayout *m_paramBtnLayout;
};

class ApplyTemplateDialog : public QDialog
{
    Q_OBJECT

public:
    explicit ApplyTemplateDialog(QWidget *parent = nullptr);
    ~ApplyTemplateDialog() override = default;

    void setTemplateInfo(const QString &name, const QString &deviceType,
                         const QString &protocol, const QString &description);
    void setDevices(const QList<QPair<QString, QString>> &devices);
    QStringList selectedDeviceIds() const;

private slots:
    void onApplyClicked();

private:
    void setupUi();
    void setupConnections();
    void applyStyle();

    QLabel *m_templateNameLabel;
    QLabel *m_templateTypeLabel;
    QLabel *m_templateProtocolLabel;
    QLabel *m_templateDescLabel;
    QListWidget *m_deviceList;
    QPushButton *m_applyButton;
    QPushButton *m_cancelButton;
    QVBoxLayout *m_mainLayout;
    QHBoxLayout *m_buttonLayout;
};

class TemplatePanel : public QWidget
{
    Q_OBJECT

public:
    explicit TemplatePanel(QWidget *parent = nullptr);
    ~TemplatePanel() override = default;

    void setModel(TemplateModel *model);
    void setDeviceModel(DeviceModel *model);

private slots:
    void onAddClicked();
    void onEditClicked();
    void onDeleteClicked();
    void onApplyClicked();
    void onRefreshClicked();
    void onImportBatchClicked();
    void onBackupClicked();
    void onRestoreClicked();

private:
    void setupUi();
    void setupConnections();
    void applyStyle();

    TemplateModel *m_model;
    DeviceModel *m_deviceModel;
    QTableView *m_tableView;
    QToolBar *m_toolBar;
    QAction *m_addAction;
    QAction *m_editAction;
    QAction *m_deleteAction;
    QAction *m_applyAction;
    QAction *m_refreshAction;
    QAction *m_importBatchAction;
    QAction *m_backupAction;
    QAction *m_restoreAction;
    QVBoxLayout *m_mainLayout;
};

#endif // TEMPLATEPANEL_H
