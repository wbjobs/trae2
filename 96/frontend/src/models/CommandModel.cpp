#include "CommandModel.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QJsonValue>
#include <QColor>
#include <QTimer>

#include "ApiClient.h"

CommandModel::CommandModel(ApiClient *api, QObject *parent)
    : QAbstractTableModel(parent)
    , m_api(api)
{
}

CommandModel::~CommandModel() = default;

int CommandModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : m_commands.size();
}

int CommandModel::columnCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : ColumnCount;
}

QVariant CommandModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() >= m_commands.size()) {
        return QVariant();
    }

    const Command &cmd = m_commands[index.row()];

    if (role == Qt::DisplayRole) {
        switch (index.column()) {
        case IdCol: return cmd.id;
        case DeviceIdCol: return cmd.deviceId;
        case ActionCol: return cmd.action;
        case PriorityCol: return cmd.priority;
        case StatusCol: return cmd.status;
        case CreatedAtCol: return cmd.createdAt;
        }
    } else if (role == Qt::DecorationRole && index.column() == StatusCol) {
        if (cmd.status == "completed") return QColor("#27ae60");
        if (cmd.status == "failed") return QColor("#e74c3c");
        if (cmd.status == "running") return QColor("#3498db");
        if (cmd.status == "pending") return QColor("#f39c12");
    }

    return QVariant();
}

QVariant CommandModel::headerData(int section, Qt::Orientation orientation, int role) const
{
    if (orientation != Qt::Horizontal || role != Qt::DisplayRole) {
        return QVariant();
    }

    switch (section) {
    case IdCol: return tr("指令ID");
    case DeviceIdCol: return tr("设备ID");
    case ActionCol: return tr("操作");
    case PriorityCol: return tr("优先级");
    case StatusCol: return tr("状态");
    case CreatedAtCol: return tr("创建时间");
    }

    return QVariant();
}

Command CommandModel::commandAt(int row) const
{
    if (row >= 0 && row < m_commands.size()) {
        return m_commands[row];
    }
    return Command();
}

void CommandModel::refresh()
{
    if (m_api) {
        m_api->get("api/v1/commands", this, SLOT(onCommandsReceived(QJsonDocument)));
    }
}

void CommandModel::sendCommand(const Command &cmd)
{
    QJsonObject obj;
    obj["device_id"] = cmd.deviceId;
    obj["action"] = cmd.action;
    obj["priority"] = cmd.priority;

    QJsonObject paramsObj;
    for (auto it = cmd.params.begin(); it != cmd.params.end(); ++it) {
        const QVariant &val = it.value();
        if (val.type() == QVariant::Int || val.type() == QVariant::Double) {
            paramsObj[it.key()] = val.toDouble();
        } else {
            paramsObj[it.key()] = val.toString();
        }
    }
    obj["params"] = paramsObj;

    connect(m_api, &ApiClient::requestFinished, this, [this](const QJsonDocument &) {
        QTimer::singleShot(1000, this, &CommandModel::refresh);
    });
    m_api->post("api/v1/commands", obj, this, SLOT(onCommandsReceived(QJsonDocument)));
}

void CommandModel::onCommandsReceived(const QJsonDocument &doc)
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
    } else if (root["data"].isObject()) {
        arr.append(root["data"].toObject());
    }

    beginResetModel();
    m_commands.clear();

    for (const auto &item : arr) {
        QJsonObject obj = item.toObject();
        Command cmd;
        cmd.id = obj["id"].toString();
        cmd.deviceId = obj["device_id"].toString();
        cmd.action = obj["action"].toString();
        cmd.priority = obj["priority"].toInt();
        cmd.status = obj["status"].toString();
        cmd.error = obj["error"].toString();
        cmd.createdAt = obj["created_at"].toString();

        if (obj.contains("executed_at") && !obj["executed_at"].isNull()) {
            cmd.executedAt = obj["executed_at"].toString();
        }
        if (obj.contains("result") && !obj["result"].isNull()) {
            cmd.result = obj["result"].toVariant();
        }

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
