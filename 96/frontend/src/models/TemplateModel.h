#ifndef TEMPLATEMODEL_H
#define TEMPLATEMODEL_H

#include <QObject>
#include <QAbstractTableModel>
#include <QList>
#include <QJsonObject>
#include <QJsonDocument>
#include <QVariantMap>

class ApiClient;

struct Template
{
    QString id;
    QString name;
    QString deviceType;
    QString protocol;
    QVariantMap params;
    QString description;
    QString createdAt;
    QString updatedAt;
};

class TemplateModel : public QAbstractTableModel
{
    Q_OBJECT

public:
    enum Columns {
        IdCol = 0,
        NameCol,
        DeviceTypeCol,
        ProtocolCol,
        ParamCountCol,
        DescriptionCol,
        ColumnCount
    };

    explicit TemplateModel(ApiClient *api, QObject *parent = nullptr);
    ~TemplateModel() override;

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    int columnCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;
    QVariant headerData(int section, Qt::Orientation orientation, int role = Qt::DisplayRole) const override;

    QList<Template> templates() const { return m_templates; }
    Template templateAt(int row) const;

signals:
    void refreshed();
    void applied(const QString &result);
    void batchImported(const QString &summary);
    void error(const QString &message);
    void success(const QString &message);

public slots:
    void refresh();
    void addTemplate(const Template &tpl);
    void updateTemplate(const Template &tpl);
    void removeTemplate(const QString &id);
    void applyToDevices(const QString &templateId, const QStringList &deviceIds);
    void importBatchFiles(const QStringList &filePaths);
    void importBatchData(const QString &jsonData);
    void exportAll();
    void restore(const QString &filePath);

signals:
    void refreshed();
    void applied(const QString &result);
    void batchImported(const QString &summary);
    void error(const QString &message);
    void success(const QString &message);
