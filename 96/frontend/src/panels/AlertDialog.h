#ifndef ALERTDIALOG_H
#define ALERTDIALOG_H

#include <QDialog>
#include <QList>

#include "../services/WebSocketClient.h"

class QListWidget;
class QListWidgetItem;
class QPushButton;
class QLabel;
class QVBoxLayout;
class QHBoxLayout;

class AlertDialog : public QDialog
{
    Q_OBJECT

public:
    explicit AlertDialog(QWidget *parent = nullptr);
    ~AlertDialog() override = default;

    void addAlert(const Alert &alert);
    int unreadCount() const;

signals:
    void allAcknowledged();

private slots:
    void onItemClicked(QListWidgetItem *item);
    void onAcknowledgeAll();
    void onClearAll();

private:
    void setupUi();
    void setupConnections();
    void applyStyle();
    void updateBadge();

    QList<Alert> m_alerts;
    QListWidget *m_alertList;
    QPushButton *m_ackAllButton;
    QPushButton *m_clearAllButton;
    QPushButton *m_closeButton;
    QLabel *m_titleLabel;
    QLabel *m_badgeLabel;
    QVBoxLayout *m_mainLayout;
    QHBoxLayout *m_headerLayout;
    QHBoxLayout *m_buttonLayout;
};

#endif // ALERTDIALOG_H