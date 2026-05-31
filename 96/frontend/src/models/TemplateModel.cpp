#include "TemplateModel.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QDebug>
#include <QDateTime>
#include <QFileDialog>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QNetworkRequest>
#include <QNetworkReply>

#include "ApiClient.h"

TemplateModel::TemplateModel(ApiClient *api, QObject *parent)
    : QAbstractTableModel(parent)
    , m_api(api)
{
}

TemplateModel::~TemplateModel() = default;

int TemplateModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : m_templates.size();
}

int TemplateModel::columnCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : ColumnCount;
}

QVariant TemplateModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() >= m_templates.size()) {
        return QVariant();
    }

    const Template &tpl = m_templates[index.row()];

    if (role == Qt::DisplayRole) {
        switch (index.column()) {
        case IdCol: return tpl.id;
        case NameCol: return tpl.name;
        case DeviceTypeCol: return tpl.deviceType;
        case ProtocolCol: return tpl.protocol;
        case ParamCountCol: return static_cast<int>(tpl.params.size());
        case DescriptionCol: return tpl.description;
        }
    }

    return QVariant();
}

QVariant TemplateModel::headerData(int section, Qt::Orientation orientation, int role) const
{
    if (orientation != Qt::Horizontal || role != Qt::DisplayRole) {
        return QVariant();
    }

    switch (section) {
    case IdCol: return tr("模板ID");
    case NameCol: return tr("模板名称");
    case DeviceTypeCol: return tr("设备类型");
    case ProtocolCol: return tr("协议");
    case ParamCountCol: return tr("参数数量");
    case DescriptionCol: return tr("描述");
    }

    return QVariant();
}

Template TemplateModel::templateAt(int row) const
{
    if (row >= 0 && row < m_templates.size()) {
        return m_templates[row];
    }
    return Template();
}

void TemplateModel::refresh()
{
    if (m_api) {
        m_api->get("api/v1/templates", this, SLOT(onTemplatesReceived(QJsonDocument)));
    }
}

void TemplateModel::addTemplate(const Template &tpl)
{
    QJsonObject obj;
    obj["name"] = tpl.name;
    obj["device_type"] = tpl.deviceType;
    obj["protocol"] = tpl.protocol;
    obj["description"] = tpl.description;

    QJsonObject paramsObj;
    for (auto it = tpl.params.begin(); it != tpl.params.end(); ++it) {
        paramsObj[it.key()] = it.value().toString();
    }
    obj["params"] = paramsObj;

    m_api->post("api/v1/templates", obj, this, SLOT(onTemplatesReceived(QJsonDocument)));
}

void TemplateModel::updateTemplate(const Template &tpl)
{
    QJsonObject obj;
    obj["id"] = tpl.id;
    obj["name"] = tpl.name;
    obj["device_type"] = tpl.deviceType;
    obj["protocol"] = tpl.protocol;
    obj["description"] = tpl.description;

    QJsonObject paramsObj;
    for (auto it = tpl.params.begin(); it != tpl.params.end(); ++it) {
        paramsObj[it.key()] = it.value().toString();
    }
    obj["params"] = paramsObj;

    m_api->put(QString("api/v1/templates/%1").arg(tpl.id), obj, this, SLOT(onTemplatesReceived(QJsonDocument)));
}

void TemplateModel::removeTemplate(const QString &id)
{
    m_api->del(QString("api/v1/templates/%1").arg(id), this, SLOT(onTemplatesReceived(QJsonDocument)));
}

void TemplateModel::applyToDevices(const QString &templateId, const QStringList &deviceIds)
{
    QJsonObject obj;
    obj["template_id"] = templateId;

    QJsonArray arr;
    for (const auto &id : deviceIds) {
        arr.append(id);
    }
    obj["device_ids"] = arr;

    m_api->post("api/v1/templates/apply", obj, this, SLOT(onApplyResult(QJsonDocument)));
}

void TemplateModel::onTemplatesReceived(const QJsonDocument &doc)
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
    m_templates.clear();

    for (const auto &item : arr) {
        QJsonObject obj = item.toObject();
        Template tpl;
        tpl.id = obj["id"].toString();
        tpl.name = obj["name"].toString();
        tpl.deviceType = obj["device_type"].toString();
        tpl.protocol = obj["protocol"].toString();
        tpl.description = obj["description"].toString();
        tpl.createdAt = obj["created_at"].toString();
        tpl.updatedAt = obj["updated_at"].toString();

        if (obj["params"].isObject()) {
            QJsonObject params = obj["params"].toObject();
            for (auto it = params.begin(); it != params.end(); ++it) {
                tpl.params[it.key()] = it.value().toString();
            }
        }

        m_templates.append(tpl);
    }

    endResetModel();
    emit refreshed();
}

void TemplateModel::onApplyResult(const QJsonDocument &doc)
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

    QJsonDocument resultDoc(root["data"].toObject());
    emit applied(QString::fromUtf8(resultDoc.toJson(QJsonDocument::Indented)));
}

void TemplateModel::importBatchFiles(const QStringList &filePaths)
{
    if (m_api) {
        m_api->postFiles("api/v1/templates/import", filePaths, this, SLOT(onImportResult(QJsonDocument)));
    }
}

void TemplateModel::importBatchData(const QString &jsonData)
{
    if (m_api) {
        QJsonObject obj;
        obj["data"] = jsonData;
        m_api->post("api/v1/templates/import", obj, this, SLOT(onImportResult(QJsonDocument)));
    }
}

void TemplateModel::onImportResult(const QJsonDocument &doc)
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

    QJsonObject data = root["data"].toObject();
    int total = data["total"].toInt();
    int success = data["success"].toInt();
    int failed = data["failed"].toInt();

    QString summary = tr("批量导入完成: 总计 %1 条, 成功 %2 条, 失败 %3 条")
                          .arg(total).arg(success).arg(failed);

    if (failed > 0 && data.contains("errors")) {
        QJsonArray errors = data["errors"].toArray();
        summary += "\n" + tr("错误:");
        for (int i = 0; i < errors.size() && i < 5; ++i) {
            summary += "\n  - " + errors[i].toString();
        }
        if (errors.size() > 5) {
            summary += "\n  ... " + tr("还有 %1 条错误").arg(errors.size() - 5);
        }
    }

    emit batchImported(summary);
    refresh();
}

void TemplateModel::exportAll()
{
    if (!m_api) return;

    QNetworkRequest request(m_api->buildUrl("api/v1/templates/export"));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");

    QByteArray body = QJsonDocument(QJsonObject()).toJson(QJsonDocument::Compact);
    m_api->addSignatureHeaders(request, "POST", "api/v1/templates/export", body);

    QNetworkReply *reply = m_api->m_manager->post(request, body);
    connect(reply, &QNetworkReply::finished, this, &TemplateModel::onExportResult);
}

void TemplateModel::restore(const QString &filePath)
{
    if (!m_api) return;

    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly)) {
        emit error(tr("无法打开文件: %1").arg(filePath));
        return;
    }
    QByteArray fileData = file.readAll();
    file.close();

    QString boundary = "----QtFormBoundary" + QString::number(qrand());
    QByteArray body;

    body.append("--" + boundary + "\r\n");
    body.append("Content-Disposition: form-data; name=\"file\"; filename=\"" +
                QFileInfo(filePath).fileName() + "\"\r\n");
    body.append("Content-Type: application/json\r\n\r\n");
    body.append(fileData);
    body.append("\r\n");
    body.append("--" + boundary + "--\r\n");

    QNetworkRequest request(m_api->buildUrl("api/v1/templates/restore"));
    request.setHeader(QNetworkRequest::ContentTypeHeader,
                      "multipart/form-data; boundary=" + boundary);
    m_api->addSignatureHeaders(request, "POST", "api/v1/templates/restore", body);

    QNetworkReply *reply = m_api->m_manager->post(request, body);
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        QByteArray data = reply->readAll();
        QJsonDocument doc = QJsonDocument::fromJson(data);
        onRestoreResult(doc);
        reply->deleteLater();
    });
}

void TemplateModel::onExportResult()
{
    QNetworkReply *reply = qobject_cast<QNetworkReply*>(sender());
    if (!reply) return;

    if (reply->error() != QNetworkReply::NoError) {
        emit error(tr("导出失败: %1").arg(reply->errorString()));
        reply->deleteLater();
        return;
    }

    QByteArray data = reply->readAll();
    QString filename = QString("templates_backup_%1.json")
                           .arg(QDateTime::currentDateTime().toString("yyyyMMdd_hhmmss"));
    QString filePath = QFileDialog::getSaveFileName(nullptr, tr("保存备份"),
                                                    QDir::homePath() + "/" + filename,
                                                    tr("JSON 文件 (*.json)"));
    if (filePath.isEmpty()) {
        reply->deleteLater();
        return;
    }

    QFile outFile(filePath);
    if (!outFile.open(QIODevice::WriteOnly)) {
        emit error(tr("无法保存文件: %1").arg(outFile.errorString()));
        reply->deleteLater();
        return;
    }

    outFile.write(data);
    outFile.close();

    emit success(tr("备份已保存到: %1").arg(filePath));
    reply->deleteLater();
}

void TemplateModel::onRestoreResult(const QJsonDocument &doc)
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

    QJsonObject data = root["data"].toObject();
    int total = data["total"].toInt();
    int success = data["success"].toInt();
    int failed = data["failed"].toInt();

    QString summary = tr("备份恢复完成: 总计 %1 条, 成功 %2 条, 失败 %3 条")
                          .arg(total).arg(success).arg(failed);

    emit success(summary);
    refresh();
}
