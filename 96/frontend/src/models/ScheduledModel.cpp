#include "ScheduledModel.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QJsonValue>
#include <QDateTime>
#include <QDebug>

#include "ApiClient.h"

ScheduledModel::ScheduledModel(ApiClient *api, QObject *parent)
    : QAbstractTableModel(parent)
    , m_api(api)
{
}

ScheduledModel::~ScheduledModel() = default;

int ScheduledModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : m_commands.size();
}

int ScheduledModel::columnCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : ColumnCount;
}

QVariant ScheduledModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() >= m_commands.size()) {
        return QVariant();
    }

    const ScheduledCommand &cmd = m_commands[index.row()];

    if (role == Qt::DisplayRole) {
        switch (index.column()) {
        case IdCol: return cmd.id;
        case NameCol: return cmd.name;
        case DeviceCol: return cmd.deviceId;
        case ActionCol: return cmd.action;
        case IntervalCol: {
            if (cmd.intervalSeconds < 60) {
                return QString("%1 秒").arg(cmd.intervalSeconds);
            } else if (cmd.intervalSeconds < 3600) {
                return QString("%1 分钟").arg(cmd.intervalSeconds / 60);
            } else {
                return QString("%1 小时").arg(cmd.intervalSeconds / 3600);
            }
        }
        case NextRunCol: return cmd.nextRunAt.toString("yyyy-MM-dd HH:mm:ss");
        case StatusCol: return cmd.enabled ? tr("启用") : tr("禁用");
        }
    } else if (role == Qt::ForegroundRole) {
        switch (index.column()) {
        case StatusCol:
            return cmd.enabled ? QColor("#27ae60") : QColor("#95a5a6");
        }
    }

    return QVariant();
}

QVariant ScheduledModel::headerData(int section, Qt::Orientation orientation, int role) const
{
    if (orientation != Qt::Horizontal || role != Qt::DisplayRole) {
        return QVariant();
    }

    switch (section) {
    case IdCol: return tr("任务ID");
    case NameCol: return tr("任务名称");
    case DeviceCol: return tr("设备");
    case ActionCol: return tr("指令");
    case IntervalCol: return tr("间隔");
    case NextRunCol: return tr("下次执行");
    case StatusCol: return tr("状态");
    }

    return QVariant();
}

ScheduledCommand ScheduledModel::commandAt(int row) const
{
    if (row >= 0 && row < m_commands.size()) {
        return m_commands[row];
    }
    return ScheduledCommand();
}

void ScheduledModel::refresh()
{
    if (m_api) {
        m_api->get("api/v1/scheduled", this, SLOT(onCommandsReceived(QJsonDocument)));
    }
}

void ScheduledModel::addCommand(const ScheduledCommand &cmd)
{
    QJsonObject obj;
    obj["name"] = cmd.name;
    obj["device_id"] = cmd.deviceId;
    obj["action"] = cmd.action;
    obj["interval"] = static_cast<qint64>(cmd.intervalSeconds * 1000000000);
    obj["enabled"] = cmd.enabled;

    QJsonObject paramsObj;
    for (auto it = cmd.params.begin(); it != cmd.params.end(); ++it) {
        paramsObj[it.key()] = QJsonValue::fromVariant(it.value());
    }
    obj["params"] = paramsObj;

    m_api->post("api/v1/scheduled", obj, this, SLOT(onCommandCreated(QJsonDocument)));
}

void ScheduledModel::updateCommand(const ScheduledCommand &cmd)
{
    QJsonObject obj;
    obj["id"] = cmd.id;
    obj["name"] = cmd.name;
    obj["device_id"] = cmd.deviceId;
    obj["action"] = cmd.action;
    obj["interval"] = static_cast<qint64>(cmd.intervalSeconds * 1000000000);
    obj["enabled"] = cmd.enabled;

    QJsonObject paramsObj;
    for (auto it = cmd.params.begin(); it != cmd.params.end(); ++it) {
        paramsObj[it.key()] = QJsonValue::fromVariant(it.value());
    }
    obj["params"] = paramsObj;

    m_api->put(QString("api/v1/scheduled/%1").arg(cmd.id), obj, this, SLOT(onSimpleResult(QJsonDocument)));
}

void ScheduledModel::removeCommand(const QString &id)
{
    if (m_api) {
        m_api->del(QString("api/v1/scheduled/%1").arg(id), this, SLOT(onSimpleResult(QJsonDocument)));
    }
}

void ScheduledModel::triggerCommand(const QString &id)
{
    if (m_api) {
        QJsonObject empty;
        m_api->post(QString("api/v1/scheduled/trigger/%1").arg(id), empty,
                    this, SLOT(onSimpleResult(QJsonDocument)));
    }
}

void ScheduledModel::onCommandsReceived(const QJsonDocument &doc)
{
    if (!doc.isObject()) {
        emit error(tr("无效的响应数据"));
        return;
    }

    QJsonObject root = doc.object();
    if (root["code"].toInt() != 0) {
        emit error(root["message"].toString());
        return;
    }

    QJsonArray arr;
    if (root["data"].isArray()) {
        arr = root["data"].toArray();
    }

    beginResetModel();
    m_commands.clear();

    for (const auto &item : arr) {
        QJsonObject obj = item.toObject();
        ScheduledCommand cmd;
        cmd.id = obj["id"].toString();
        cmd.name = obj["name"].toString();
        cmd.deviceId = obj["device_id"].toString();
        cmd.action = obj["action"].toString();
        cmd.intervalSeconds = static_cast<qint64>(obj["interval"].toDouble()) / 1000000000;
        cmd.enabled = obj["enabled"].toBool();
        cmd.createdAt = obj["created_at"].toString();
        cmd.updatedAt = obj["updated_at"].toString();

        if (obj.contains("last_run_at") && !obj["last_run_at"].isNull()) {
            cmd.lastRunAt = QDateTime::fromString(obj["last_run_at"].toString(), Qt::ISODate);
        }
        cmd.nextRunAt = QDateTime::fromString(obj["next_run_at"].toString(), Qt::ISODate);

        if (obj["params"].isObject()) {
            QJsonObject params = obj["params"].toObject();
            for (auto it = params.begin(); it != params.end(); ++it) {
                cmd.params[it.key()] = it.value().toVariant();
            }
        }

        m_commands.append(cmd);
    }

    endResetModel();
    emit refreshed();
}

void ScheduledModel::onCommandCreated(const QJsonDocument &doc)
{
    if (!doc.isObject()) {
        emit error(tr("无效的响应数据"));
        return;
    }

    QJsonObject root = doc.object();
    if (root["code"].toInt() != 0) {
        emit error(root["message"].toString());
        return;
    }

    refresh();
}

void ScheduledModel::onSimpleResult(const QJsonDocument &doc)
{
    if (!doc.isObject()) {
        emit error(tr("无效的响应数据"));
        return;
    }

    QJsonObject root = doc.object();
    if (root["code"].toInt() != 0) {
        emit error(root["message"].toString());
        return;
    }

    refresh();
}
