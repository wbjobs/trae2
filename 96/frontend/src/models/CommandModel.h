#ifndef COMMANDMODEL_H
#define COMMANDMODEL_H

#include <QObject>
#include <QAbstractTableModel>
#include <QList>
#include <QJsonObject>
#include <QJsonDocument>
#include <QVariantMap>

class ApiClient;

struct Command
{
    QString id;
    QString deviceId;
    QString action;
    QVariantMap params;
    int priority;
    QString status;
    QVariant result;
    QString error;
    QString createdAt;
    QString executedAt;
};

class CommandModel : public QAbstractTableModel
{
    Q_OBJECT

public:
    enum Columns {
        IdCol = 0,
        DeviceIdCol,
        ActionCol,
        PriorityCol,
        StatusCol,
        CreatedAtCol,
        ColumnCount
    };

    explicit CommandModel(ApiClient *api, QObject *parent = nullptr);
    ~CommandModel() override;

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    int columnCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;
    QVariant headerData(int section, Qt::Orientation orientation, int role = Qt::DisplayRole) const override;

    QList<Command> commands() const { return m_commands; }
    Command commandAt(int row) const;

signals:
    void refreshed();
    void error(const QString &message);

public slots:
    void refresh();
    void sendCommand(const Command &cmd);

private slots:
    void onCommandsReceived(const QJsonDocument &doc);

private:
    ApiClient *m_api;
    QList<Command> m_commands;
};

#endif // COMMANDMODEL_H
