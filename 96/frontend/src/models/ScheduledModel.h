#ifndef SCHEDULEDMODEL_H
#define SCHEDULEDMODEL_H

#include <QObject>
#include <QAbstractTableModel>
#include <QList>
#include <QJsonObject>
#include <QJsonDocument>
#include <QVariantMap>
#include <QDateTime>

class ApiClient;

struct ScheduledCommand
{
    QString id;
    QString name;
    QString deviceId;
    QString action;
    QVariantMap params;
    qint64 intervalSeconds;
    bool enabled;
    QDateTime lastRunAt;
    QDateTime nextRunAt;
    QString createdAt;
    QString updatedAt;
};

class ScheduledModel : public QAbstractTableModel
{
    Q_OBJECT

public:
    enum Columns {
        IdCol = 0,
        NameCol,
        DeviceCol,
        ActionCol,
        IntervalCol,
        NextRunCol,
        StatusCol,
        ColumnCount
    };

    explicit ScheduledModel(ApiClient *api, QObject *parent = nullptr);
    ~ScheduledModel() override;

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    int columnCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;
    QVariant headerData(int section, Qt::Orientation orientation, int role = Qt::DisplayRole) const override;

    QList<ScheduledCommand> commands() const { return m_commands; }
    ScheduledCommand commandAt(int row) const;

signals:
    void refreshed();
    void error(const QString &message);

public slots:
    void refresh();
    void addCommand(const ScheduledCommand &cmd);
    void updateCommand(const ScheduledCommand &cmd);
    void removeCommand(const QString &id);
    void triggerCommand(const QString &id);

private slots:
    void onCommandsReceived(const QJsonDocument &doc);
    void onCommandCreated(const QJsonDocument &doc);
    void onSimpleResult(const QJsonDocument &doc);

private:
    ApiClient *m_api;
    QList<ScheduledCommand> m_commands;
};

#endif // SCHEDULEDMODEL_H