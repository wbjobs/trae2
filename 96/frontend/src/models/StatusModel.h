#ifndef STATUSMODEL_H
#define STATUSMODEL_H

#include <QObject>
#include <QAbstractTableModel>
#include <QList>
#include <QJsonObject>
#include <QJsonDocument>
#include <QMap>
#include <QTimer>
#include <QMutex>

class ApiClient;
class WebSocketClient;

struct StatusReport
{
    QString deviceId;
    QString status;
    QMap<QString, double> metrics;
    QString timestamp;
};

class StatusModel : public QAbstractTableModel
{
    Q_OBJECT

public:
    enum Columns {
        DeviceIdCol = 0,
        StatusCol,
        MetricCountCol,
        TimestampCol,
        ColumnCount
    };

    explicit StatusModel(ApiClient *api, WebSocketClient *ws, QObject *parent = nullptr);
    ~StatusModel() override;

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    int columnCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;
    QVariant headerData(int section, Qt::Orientation orientation, int role = Qt::DisplayRole) const override;

    QList<StatusReport> reports() const { return m_reports; }
    StatusReport reportAt(int row) const;

    int totalDevices() const { return m_reports.size(); }
    int onlineCount() const { return m_onlineCount; }
    int offlineCount() const { return m_offlineCount; }
    int errorCount() const { return m_errorCount; }

signals:
    void refreshed();
    void statsChanged();
    void error(const QString &message);

public slots:
    void refresh();

private slots:
    void onStatusReceived(const QJsonDocument &doc);
    void onWebSocketMessage(const QJsonObject &message);
    void processPendingUpdates();

private:
    void updateStats();
    void updateReportFromJson(const QJsonObject &obj);
    void applyPendingUpdates();

    ApiClient *m_api;
    WebSocketClient *m_ws;
    QList<StatusReport> m_reports;
    QMap<QString, StatusReport> m_reportMap;

    QMap<QString, StatusReport> m_pendingUpdates;
    QTimer *m_throttleTimer;
    QMutex m_pendingMutex;

    int m_onlineCount;
    int m_offlineCount;
    int m_errorCount;

    bool m_loading;
};

#endif // STATUSMODEL_H
