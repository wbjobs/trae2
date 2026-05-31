#ifndef STATUSPANEL_H
#define STATUSPANEL_H

#include <QWidget>
#include <QMap>

class StatusModel;
class QTableView;
class QToolBar;
class QAction;
class QGroupBox;
class QFormLayout;
class QTimer;
class QVBoxLayout;
class QHBoxLayout;
class QLabel;

class StatusPanel : public QWidget
{
    Q_OBJECT

public:
    explicit StatusPanel(QWidget *parent = nullptr);
    ~StatusPanel() override = default;

    void setModel(StatusModel *model);

private slots:
    void onRefreshClicked();
    void onSelectionChanged(const QModelIndex &current, const QModelIndex &previous);
    void onAutoRefresh();

private:
    void setupUi();
    void setupConnections();
    void applyStyle();
    void updateMetrics(const QModelIndex &index);
    void clearMetrics();
    QString formatMetricValue(const QString &key, double value) const;
    int detectMetricPrecision(const QString &key) const;

    StatusModel *m_model;
    QTableView *m_tableView;
    QToolBar *m_toolBar;
    QAction *m_refreshAction;
    QGroupBox *m_metricsGroup;
    QFormLayout *m_metricsLayout;
    QTimer *m_refreshTimer;
    QVBoxLayout *m_mainLayout;
    QHBoxLayout *m_contentLayout;

    QMap<QString, QLabel *> m_metricLabels;
    QLabel *m_deviceIdLabel;
    QLabel *m_statusLabel;
    QLabel *m_timestampLabel;
    QLabel *m_hintLabel;
};

#endif // STATUSPANEL_H
