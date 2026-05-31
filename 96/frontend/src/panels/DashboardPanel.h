#ifndef DASHBOARDPANEL_H
#define DASHBOARDPANEL_H

#include <QWidget>

class DeviceModel;
class StatusModel;
class QLabel;
class QPushButton;
class QTableView;
class QFrame;
class QVBoxLayout;
class QHBoxLayout;
class QGridLayout;

namespace QtCharts {
class QChartView;
class QPieSeries;
class QChart;
}

class DashboardPanel : public QWidget
{
    Q_OBJECT

public:
    explicit DashboardPanel(QWidget *parent = nullptr);
    ~DashboardPanel() override;

    void setModels(DeviceModel *deviceModel, StatusModel *statusModel);

private slots:
    void onRefreshClicked();
    void updateStats();
    void updateChart();

private:
    void setupUi();
    void setupConnections();
    void applyStyle();
    QFrame *createStatCard(const QString &title, const QString &value, const QString &color);

    DeviceModel *m_deviceModel;
    StatusModel *m_statusModel;

    QLabel *m_totalDevicesLabel;
    QLabel *m_onlineLabel;
    QLabel *m_offlineLabel;
    QLabel *m_errorLabel;

    QPushButton *m_refreshButton;
    QTableView *m_statusTable;

    QtCharts::QChartView *m_chartView;
    QtCharts::QPieSeries *m_pieSeries;
    QtCharts::QChart *m_chart;

    QVBoxLayout *m_mainLayout;
    QHBoxLayout *m_headerLayout;
    QGridLayout *m_cardsLayout;
    QHBoxLayout *m_contentLayout;
};

#endif // DASHBOARDPANEL_H
