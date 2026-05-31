#ifndef COMMANDPANEL_H
#define COMMANDPANEL_H

#include <QWidget>

class CommandModel;
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
class QPushButton;

class CommandDialog : public QDialog
{
    Q_OBJECT

public:
    explicit CommandDialog(QWidget *parent = nullptr);
    ~CommandDialog() override = default;

    void setDevices(const QList<QPair<QString, QString>> &devices);
    QString deviceId() const;
    QString action() const;
    int priority() const;
    QVariantMap params() const;

private slots:
    void onAddParamClicked();
    void onRemoveParamClicked();
    void onAcceptClicked();

private:
    void setupUi();
    void setupConnections();
    void applyStyle();

    QComboBox *m_deviceIdCombo;
    QLineEdit *m_actionEdit;
    QSpinBox *m_prioritySpin;
    QTableWidget *m_paramsTable;
    QPushButton *m_addParamButton;
    QPushButton *m_removeParamButton;
    QPushButton *m_sendButton;
    QPushButton *m_cancelButton;
    QVBoxLayout *m_mainLayout;
    QHBoxLayout *m_buttonLayout;
};

class CommandPanel : public QWidget
{
    Q_OBJECT

public:
    explicit CommandPanel(QWidget *parent = nullptr);
    ~CommandPanel() override = default;

    void setModel(CommandModel *model);
    void setDeviceModel(DeviceModel *deviceModel);

private slots:
    void onSendCommandClicked();
    void onRefreshClicked();

private:
    void setupUi();
    void setupConnections();
    void applyStyle();

    CommandModel *m_model;
    DeviceModel *m_deviceModel;
    QTableView *m_tableView;
    QToolBar *m_toolBar;
    QAction *m_sendAction;
    QAction *m_refreshAction;
    QVBoxLayout *m_mainLayout;
};

#endif // COMMANDPANEL_H
