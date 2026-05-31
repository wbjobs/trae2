#ifndef DEVICEMODEL_H
#define DEVICEMODEL_H

#include <QObject>
#include <QAbstractTableModel>
#include <QList>
#include <QJsonObject>
#include <QJsonDocument>

class ApiClient;

struct Device
{
    QString id;
    QString name;
    QString type;
    QString status;
    QString address;
    int port;
    QString protocol;
    QVariantMap params;
    QString templateId;
    QString lastSeen;
    QString createdAt;
    QString updatedAt;
};

class DeviceModel : public QAbstractTableModel
{
    Q_OBJECT

public:
    enum Columns {
        IdCol = 0,
        NameCol,
        TypeCol,
        StatusCol,
        AddressCol,
        PortCol,
        ProtocolCol,
        ColumnCount
    };

    explicit DeviceModel(ApiClient *api, QObject *parent = nullptr);
    ~DeviceModel() override;

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    int columnCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;
    QVariant headerData(int section, Qt::Orientation orientation, int role = Qt::DisplayRole) const override;

    QList<Device> devices() const { return m_devices; }
    Device deviceAt(int row) const;

public slots:
    void refresh();
    void addDevice(const Device &device);
    void updateDevice(const Device &device);
    void removeDevice(const QString &id);

signals:
    void refreshed();
    void error(const QString &message);

private slots:
    void onDevicesReceived(const QJsonDocument &doc);

private:
    ApiClient *m_api;
    QList<Device> m_devices;
};

#endif // DEVICEMODEL_H
