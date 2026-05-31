#include "StatusModel.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QColor>
#include <QMutexLocker>

#include "ApiClient.h"
#include "WebSocketClient.h"

StatusModel::StatusModel(ApiClient *api, WebSocketClient *ws, QObject *parent)
    : QAbstractTableModel(parent)
    , m_api(api)
    , m_ws(ws)
    , m_throttleTimer(new QTimer(this))
    , m_onlineCount(0)
    , m_offlineCount(0)
    , m_errorCount(0)
    , m_loading(false)
{
    m_throttleTimer->setInterval(500);
    m_throttleTimer->setSingleShot(true);
    connect(m_throttleTimer, &QTimer::timeout, this, &StatusModel::processPendingUpdates);

    if (m_ws) {
        connect(m_ws, &WebSocketClient::messageReceived, this, &StatusModel::onWebSocketMessage);
    }
}

StatusModel::~StatusModel() = default;

int StatusModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : m_reports.size();
}

int StatusModel::columnCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : ColumnCount;
}

QVariant StatusModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() >= m_reports.size()) {
        return QVariant();
    }

    const StatusReport &report = m_reports[index.row()];

    if (role == Qt::DisplayRole) {
        switch (index.column()) {
        case DeviceIdCol: return report.deviceId;
        case StatusCol: return report.status;
        case MetricCountCol: return static_cast<int>(report.metrics.size());
        case TimestampCol: return report.timestamp;
        }
    } else if (role == Qt::DecorationRole && index.column() == StatusCol) {
        if (report.status == "online") return QColor("#27ae60");
        if (report.status == "offline") return QColor("#95a5a6");
        if (report.status == "error") return QColor("#e74c3c");
    }

    return QVariant();
}

QVariant StatusModel::headerData(int section, Qt::Orientation orientation, int role) const
{
    if (orientation != Qt::Horizontal || role != Qt::DisplayRole) {
        return QVariant();
    }

    switch (section) {
    case DeviceIdCol: return tr("设备ID");
    case StatusCol: return tr("状态");
    case MetricCountCol: return tr("指标数");
    case TimestampCol: return tr("更新时间");
    }

    return QVariant();
}

StatusReport StatusModel::reportAt(int row) const
{
    if (row >= 0 && row < m_reports.size()) {
        return m_reports[row];
    }
    return StatusReport();
}

void StatusModel::refresh()
{
    if (m_api && !m_loading) {
        m_loading = true;
        m_api->get("api/v1/status", this, SLOT(onStatusReceived(QJsonDocument)));
    }
}

void StatusModel::onStatusReceived(const QJsonDocument &doc)
{
    m_loading = false;

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

    QMap<QString, int> existingIds;
    for (int i = 0; i < m_reports.size(); ++i) {
        existingIds[m_reports[i].deviceId] = i;
    }

    QList<int> rowsToUpdate;
    for (const auto &item : arr) {
        QJsonObject obj = item.toObject();
        QString deviceId = obj["device_id"].toString();
        StatusReport report;
        report.deviceId = deviceId;
        report.status = obj["status"].toString();
        report.timestamp = obj["timestamp"].toString();

        if (obj["metrics"].isObject()) {
            QJsonObject metrics = obj["metrics"].toObject();
            for (auto it = metrics.begin(); it != metrics.end(); ++it) {
                report.metrics[it.key()] = it.value().toDouble();
            }
        }

        if (existingIds.contains(deviceId)) {
            int row = existingIds[deviceId];
            m_reports[row] = report;
            m_reportMap[deviceId] = report;
            rowsToUpdate.append(row);
        } else {
            beginInsertRows(QModelIndex(), m_reports.size(), m_reports.size());
            m_reports.append(report);
            m_reportMap[deviceId] = report;
            endInsertRows();
        }
    }

    for (int row : rowsToUpdate) {
        emit dataChanged(index(row, 0), index(row, ColumnCount - 1));
    }

    updateStats();
    emit refreshed();
}

void StatusModel::onWebSocketMessage(const QJsonObject &message)
{
    if (message.contains("type") && message["type"].toString() == "batch_status") {
        QJsonArray reports = message["reports"].toArray();
        QMutexLocker lock(&m_pendingMutex);
        for (const auto &item : reports) {
            QJsonObject obj = item.toObject();
            QString deviceId = obj["device_id"].toString();
            if (deviceId.isEmpty()) continue;

            StatusReport report;
            report.deviceId = deviceId;
            report.status = obj["status"].toString();
            report.timestamp = obj["timestamp"].toString();

            if (obj["metrics"].isObject()) {
                QJsonObject metrics = obj["metrics"].toObject();
                for (auto it = metrics.begin(); it != metrics.end(); ++it) {
                    report.metrics[it.key()] = it.value().toDouble();
                }
            }

            m_pendingUpdates[deviceId] = report;
        }
    } else {
        QMutexLocker lock(&m_pendingMutex);
        QString deviceId = message["device_id"].toString();
        if (deviceId.isEmpty()) return;

        StatusReport report;
        report.deviceId = deviceId;
        report.status = message["status"].toString();
        report.timestamp = message["timestamp"].toString();

        if (message["metrics"].isObject()) {
            QJsonObject metrics = message["metrics"].toObject();
            for (auto it = metrics.begin(); it != metrics.end(); ++it) {
                report.metrics[it.key()] = it.value().toDouble();
            }
        }

        m_pendingUpdates[deviceId] = report;
    }

    if (!m_throttleTimer->isActive()) {
        m_throttleTimer->start();
    }
}

void StatusModel::processPendingUpdates()
{
    QMutexLocker lock(&m_pendingMutex);
    if (m_pendingUpdates.isEmpty()) return;

    QMap<QString, StatusReport> pending = m_pendingUpdates;
    m_pendingUpdates.clear();
    lock.unlock();

    QList<int> rowsToUpdate;
    QList<int> rowsToInsert;

    for (auto it = pending.begin(); it != pending.end(); ++it) {
        const StatusReport &report = it.value();
        if (m_reportMap.contains(report.deviceId)) {
            int idx = -1;
            for (int i = 0; i < m_reports.size(); ++i) {
                if (m_reports[i].deviceId == report.deviceId) {
                    idx = i;
                    break;
                }
            }
            if (idx >= 0) {
                m_reports[idx] = report;
                m_reportMap[report.deviceId] = report;
                rowsToUpdate.append(idx);
            }
        } else {
            rowsToInsert.append(m_reports.size());
            m_reports.append(report);
            m_reportMap[report.deviceId] = report;
        }
    }

    if (!rowsToInsert.isEmpty()) {
        int first = rowsToInsert.first();
        int last = rowsToInsert.last();
        beginInsertRows(QModelIndex(), first, last);
        endInsertRows();
    }

    if (!rowsToUpdate.isEmpty()) {
        int minRow = rowsToUpdate.first();
        int maxRow = rowsToUpdate.first();
        for (int r : rowsToUpdate) {
            minRow = qMin(minRow, r);
            maxRow = qMax(maxRow, r);
        }
        emit dataChanged(index(minRow, 0), index(maxRow, ColumnCount - 1));
    }

    if (!rowsToUpdate.isEmpty() || !rowsToInsert.isEmpty()) {
        updateStats();
    }
}

void StatusModel::updateStats()
{
    m_onlineCount = 0;
    m_offlineCount = 0;
    m_errorCount = 0;

    for (const auto &r : m_reports) {
        if (r.status == "online") m_onlineCount++;
        else if (r.status == "offline") m_offlineCount++;
        else if (r.status == "error") m_errorCount++;
    }

    emit statsChanged();
}

void StatusModel::updateReportFromJson(const QJsonObject &obj)
{
    Q_UNUSED(obj);
}

void StatusModel::applyPendingUpdates()
{
}
