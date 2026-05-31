#ifndef DEVICEPANEL_H
#define DEVICEPANEL_H

#include <QWidget>

class DeviceModel;
class QTableView;
class QToolBar;
class QAction;
class QDialog;
class QLineEdit;
class QComboBox;
class QSpinBox;
class QTableWidget;
class QVBoxLayout;
class QHBoxLayout;
class QLabel;

class DeviceDialog : public QDialog
{
    Q_OBJECT

public:
    explicit DeviceDialog(QWidget *parent = nullptr);
    ~DeviceDialog() override = default;

    void setDeviceData(const QString &name, const QString &type, const QString &address,
                       int port, const QString &protocol, const QVariantMap &params);
    QString name() const;
    QString type() const;
    QString address() const;
    int port() const;
    QString protocol() const;
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
    QComboBox *m_typeCombo;
    QLineEdit *m_addressEdit;
    QSpinBox *m_portSpin;
    QComboBox *m_protocolCombo;
    QTableWidget *m_paramsTable;
    QPushButton *m_addParamButton;
    QPushButton *m_removeParamButton;
    QPushButton *m_okButton;
    QPushButton *m_cancelButton;
    QVBoxLayout *m_mainLayout;
    QHBoxLayout *m_buttonLayout;
};

class DevicePanel : public QWidget
{
    Q_OBJECT

public:
    explicit DevicePanel(QWidget *parent = nullptr);
    ~DevicePanel() override = default;

    void setModel(DeviceModel *model);

private slots:
    void onAddClicked();
    void onEditClicked();
    void onDeleteClicked();
    void onRefreshClicked();

private:
    void setupUi();
    void setupConnections();
    void applyStyle();

    DeviceModel *m_model;
    QTableView *m_tableView;
    QToolBar *m_toolBar;
    QAction *m_addAction;
    QAction *m_editAction;
    QAction *m_deleteAction;
    QAction *m_refreshAction;
    QVBoxLayout *m_mainLayout;
};

#endif // DEVICEPANEL_H
