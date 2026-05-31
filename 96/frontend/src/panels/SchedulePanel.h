#ifndef SCHEDULEPANEL_H
#define SCHEDULEPANEL_H

#include <QWidget>
#include <QDialog>

class ScheduledModel;
class DeviceModel;
class QTableView;
class QToolBar;
class QAction;
class QLineEdit;
class QComboBox;
class QSpinBox;
class QCheckBox;
class QTableWidget;
class QPushButton;
class QVBoxLayout;
class QHBoxLayout;
class QFormLayout;
class QLabel;

class ScheduledDialog : public QDialog
{
    Q_OBJECT

public:
    explicit ScheduledDialog(QWidget *parent = nullptr);
    ~ScheduledDialog() override = default;

    void setCommandData(const QString &name, const QString &deviceId,
                        const QString &action, qint64 intervalSeconds,
                        bool enabled, const QVariantMap &params);
    QString name() const;
    QString deviceId() const;
    QString action() const;
    qint64 intervalSeconds() const;
    bool enabled() const;
    QVariantMap params() const;

    void setDevices(const QList<QPair<QString, QString>> &devices);

private slots:
    void onAddParamClicked();
    void onRemoveParamClicked();
    void onAcceptClicked();

private:
    void setupUi();
    void setupConnections();
    void applyStyle();

    QLineEdit *m_nameEdit;
    QComboBox *m_deviceCombo;
    QComboBox *m_actionCombo;
    QSpinBox *m_intervalSpin;
    QComboBox *m_intervalUnitCombo;
    QCheckBox *m_enabledCheck;
    QTableWidget *m_paramsTable;
    QPushButton *m_addParamButton;
    QPushButton *m_removeParamButton;
    QPushButton *m_okButton;
    QPushButton *m_cancelButton;
    QVBoxLayout *m_mainLayout;
    QHBoxLayout *m_buttonLayout;
    QHBoxLayout *m_paramBtnLayout;
    QHBoxLayout *m_intervalLayout;
};

class SchedulePanel : public QWidget
{
    Q_OBJECT

public:
    explicit SchedulePanel(QWidget *parent = nullptr);
    ~SchedulePanel() override = default;

    void setModel(ScheduledModel *model);
    void setDeviceModel(DeviceModel *model);

private slots:
    void onAddClicked();
    void onEditClicked();
    void onDeleteClicked();
    void onTriggerClicked();
    void onToggleClicked();
    void onRefreshClicked();

private:
    void setupUi();
    void setupConnections();
    void applyStyle();

    ScheduledModel *m_model;
    DeviceModel *m_deviceModel;
    QTableView *m_tableView;
    QToolBar *m_toolBar;
    QAction *m_addAction;
    QAction *m_editAction;
    QAction *m_deleteAction;
    QAction *m_triggerAction;
    QAction *m_toggleAction;
    QAction *m_refreshAction;
    QVBoxLayout *m_mainLayout;
};

#endif // SCHEDULEPANEL_H