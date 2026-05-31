#include "DeviceModel.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QVariant>
#include <QDateTime>

#include "ApiClient.h"

DeviceModel::DeviceModel(ApiClient *api, QObject *parent)
    : QAbstractTableModel(parent)
    , m_api(api)
{
}

DeviceModel::~DeviceModel() = default;

int DeviceModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : m_devices.size();
}

int DeviceModel::columnCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : ColumnCount;
}

QVariant DeviceModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() >= m_devices.size()) {
        return QVariant();
    }

    const Device &dev = m_devices[index.row()];

    if (role == Qt::DisplayRole) {
        switch (index.column()) {
        case IdCol: return dev.id;
        case NameCol: return dev.name;
        case TypeCol: return dev.type;
        case StatusCol: return dev.status;
        case AddressCol: return dev.address;
        case PortCol: return dev.port;
        case ProtocolCol: return dev.protocol;
        }
    } else if (role == Qt::DecorationRole && index.column() == StatusCol) {
        if (dev.status == "online") return QColor("#27ae60");
        if (dev.status == "offline") return QColor("#95a5a6");
        if (dev.status == "error") return QColor("#e74c3c");
        if (dev.status == "busy") return QColor("#f39c12");
    }

    return QVariant();
}

QVariant DeviceModel::headerData(int section, Qt::Orientation orientation, int role) const
{
    if (orientation != Qt::Horizontal || role != Qt::DisplayRole) {
        return QVariant();
    }

    switch (section) {
    case IdCol: return tr("设备ID");
    case NameCol: return tr("设备名称");
    case TypeCol: return tr("设备类型");
    case StatusCol: return tr("状态");
    case AddressCol: return tr("地址");
    case PortCol: return tr("端口");
    case ProtocolCol: return tr("协议");
    }

    return QVariant();
}

Device DeviceModel::deviceAt(int row) const
{
    if (row >= 0 && row < m_devices.size()) {
        return m_devices[row];
    }
    return Device();
}

void DeviceModel::refresh()
{
    if (m_api) {
        m_api->get("api/v1/devices", this, SLOT(onDevicesReceived(QJsonDocument)));
    }
}

void DeviceModel::addDevice(const Device &device)
{
    QJsonObject obj;
    obj["name"] = device.name;
    obj["type"] = device.type;
    obj["address"] = device.address;
    obj["port"] = device.port;
    obj["protocol"] = device.protocol;

    QJsonObject paramsObj;
    for (auto it = device.params.begin(); it != device.params.end(); ++it) {
        paramsObj[it.key()] = it.value().toString();
    }
    obj["params"] = paramsObj;

    connect(m_api, &ApiClient::requestFinished, this, [this](const QJsonDocument &) {
        refresh();
    });
    m_api->post("api/v1/devices", obj, this, SLOT(onDevicesReceived(QJsonDocument)));
}

void DeviceModel::updateDevice(const Device &device)
{
    QJsonObject obj;
    obj["id"] = device.id;
    obj["name"] = device.name;
    obj["type"] = device.type;
    obj["status"] = device.status;
    obj["address"] = device.address;
    obj["port"] = device.port;
    obj["protocol"] = device.protocol;

    QJsonObject paramsObj;
    for (auto it = device.params.begin(); it != device.params.end(); ++it) {
        paramsObj[it.key()] = it.value().toString();
    }
    obj["params"] = paramsObj;

    m_api->put(QString("api/v1/devices/%1").arg(device.id), obj, this, SLOT(onDevicesReceived(QJsonDocument)));
}

void DeviceModel::removeDevice(const QString &id)
{
    m_api->del(QString("api/v1/devices/%1").arg(id), this, SLOT(onDevicesReceived(QJsonDocument)));
}

void DeviceModel::onDevicesReceived(const QJsonDocument &doc)
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
    m_devices.clear();

    for (const auto &item : arr) {
        QJsonObject obj = item.toObject();
        Device dev;
        dev.id = obj["id"].toString();
        dev.name = obj["name"].toString();
        dev.type = obj["type"].toString();
        dev.status = obj["status"].toString();
        dev.address = obj["address"].toString();
        dev.port = obj["port"].toInt();
        dev.protocol = obj["protocol"].toString();
        dev.templateId = obj["template_id"].toString();
        dev.lastSeen = obj["last_seen"].toString();
        dev.createdAt = obj["created_at"].toString();
        dev.updatedAt = obj["updated_at"].toString();

        if (obj["params"].isObject()) {
            QJsonObject params = obj["params"].toObject();
            for (auto it = params.begin(); it != params.end(); ++it) {
                dev.params[it.key()] = it.value().toString();
            }
        }

        m_devices.append(dev);
    }

    endResetModel();
    emit refreshed();
}
