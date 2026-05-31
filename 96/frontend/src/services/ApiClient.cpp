#include "ApiClient.h"

#include <QNetworkRequest>
#include <QNetworkReply>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QByteArray>
#include <QUrl>
#include <QFile>
#include <QFileInfo>
#include <QMetaObject>
#include <QDateTime>
#include <QMessageAuthenticationCode>
#include <QTimer>

ApiClient::ApiClient(QObject *parent)
    : QObject(parent)
    , m_manager(new QNetworkAccessManager(this))
    , m_baseUrl("http://127.0.0.1:8080")
    , m_secretKey("icc-secret-key-2024")
    , m_serverTimeOffset(0)
    , m_authInitialized(false)
{
    QTimer::singleShot(500, this, &ApiClient::initializeAuth);
}

ApiClient::~ApiClient() = default;

void ApiClient::setBaseUrl(const QString &url)
{
    m_baseUrl = url;
}

QString ApiClient::baseUrl() const
{
    return m_baseUrl;
}

void ApiClient::setSecretKey(const QString &key)
{
    m_secretKey = key;
}

QString ApiClient::secretKey() const
{
    return m_secretKey;
}

QUrl ApiClient::buildUrl(const QString &endpoint) const
{
    QString fullUrl = m_baseUrl;
    if (!fullUrl.endsWith("/") && !endpoint.startsWith("/")) {
        fullUrl += "/";
    }
    fullUrl += endpoint;
    return QUrl(fullUrl);
}

void ApiClient::handleReply(QNetworkReply *reply, QObject *receiver, const char *member)
{
    if (!reply) return;

    connect(reply, &QNetworkReply::finished, this, [this, reply, receiver, member]() {
        const auto error = reply->error();
        const auto data = reply->readAll();
        const QJsonDocument doc = QJsonDocument::fromJson(data);

        if (error != QNetworkReply::NoError) {
            emit requestError(reply->errorString());
        } else {
            emit requestFinished(doc);
        }

        if (receiver && member) {
            QMetaObject::invokeMethod(receiver, member, Q_ARG(QJsonDocument, doc));
        }

        reply->deleteLater();
    });
}

void ApiClient::get(const QString &endpoint, QObject *receiver, const char *member)
{
    QNetworkRequest request(buildUrl(endpoint));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    auto *reply = m_manager->get(request);
    handleReply(reply, receiver, member);
}

void ApiClient::post(const QString &endpoint, const QJsonObject &data, QObject *receiver, const char *member)
{
    QNetworkRequest request(buildUrl(endpoint));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    const QByteArray body = QJsonDocument(data).toJson(QJsonDocument::Compact);
    addSignatureHeaders(request, "POST", endpoint, body);
    auto *reply = m_manager->post(request, body);
    handleReply(reply, receiver, member);
}

void ApiClient::put(const QString &endpoint, const QJsonObject &data, QObject *receiver, const char *member)
{
    QNetworkRequest request(buildUrl(endpoint));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    const QByteArray body = QJsonDocument(data).toJson(QJsonDocument::Compact);
    addSignatureHeaders(request, "PUT", endpoint, body);
    auto *reply = m_manager->put(request, body);
    handleReply(reply, receiver, member);
}

void ApiClient::del(const QString &endpoint, QObject *receiver, const char *member)
{
    QNetworkRequest request(buildUrl(endpoint));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    addSignatureHeaders(request, "DELETE", endpoint, QByteArray());
    auto *reply = m_manager->deleteResource(request);
    handleReply(reply, receiver, member);
}

void ApiClient::postFiles(const QString &endpoint, const QStringList &filePaths,
                          QObject *receiver, const char *member)
{
    QString boundary = "----QtFormBoundary" + QString::number(qrand());
    QByteArray body;

    for (const QString &filePath : filePaths) {
        QFile file(filePath);
        if (!file.open(QIODevice::ReadOnly)) {
            continue;
        }

        QFileInfo fileInfo(filePath);

        body.append("--" + boundary + "\r\n");
        body.append("Content-Disposition: form-data; name=\"files\"; filename=\"" +
                    fileInfo.fileName() + "\"\r\n");
        body.append("Content-Type: application/octet-stream\r\n\r\n");
        body.append(file.readAll());
        body.append("\r\n");

        file.close();
    }

    body.append("--" + boundary + "--\r\n");

    QNetworkRequest request(buildUrl(endpoint));
    request.setHeader(QNetworkRequest::ContentTypeHeader,
                      "multipart/form-data; boundary=" + boundary);
    addSignatureHeaders(request, "POST", endpoint, body);

    auto *reply = m_manager->post(request, body);
    handleReply(reply, receiver, member);
}

void ApiClient::initializeAuth()
{
    if (m_authInitialized) return;
    get("api/v1/auth/info", this, SLOT(onAuthInfoReceived(QJsonDocument)));
}

void ApiClient::onAuthInfoReceived(const QJsonDocument &doc)
{
    if (!doc.isObject()) return;

    QJsonObject root = doc.object();
    if (root["code"].toInt() != 0) return;

    QJsonObject data = root["data"].toObject();
    qint64 serverTimestamp = data["timestamp"].toVariant().toLongLong();
    qint64 clientTimestamp = QDateTime::currentSecsSinceEpoch();
    m_serverTimeOffset = serverTimestamp - clientTimestamp;
    m_authInitialized = true;

    qDebug() << "[ApiClient] Auth initialized, server time offset:" << m_serverTimeOffset << "s";
}

void ApiClient::addSignatureHeaders(QNetworkRequest &request, const QString &method,
                                     const QString &endpoint, const QByteArray &body) const
{
    if (m_secretKey.isEmpty()) return;

    qint64 timestamp = currentTimestamp();
    QString timestampStr = QString::number(timestamp);

    QString fullEndpoint = endpoint;
    if (!fullEndpoint.startsWith("/")) {
        fullEndpoint = "/" + fullEndpoint;
    }
    if (!fullEndpoint.startsWith("/api/")) {
        fullEndpoint = "/api/v1/" + fullEndpoint;
    }

    QString message = method + "\n" + fullEndpoint + "\n" + timestampStr + "\n" + QString::fromUtf8(body);
    QString signature = computeHMAC(message);

    request.setRawHeader("X-API-Signature", signature.toUtf8());
    request.setRawHeader("X-API-Timestamp", timestampStr.toUtf8());
}

qint64 ApiClient::currentTimestamp() const
{
    return QDateTime::currentSecsSinceEpoch() + m_serverTimeOffset;
}

QString ApiClient::computeHMAC(const QString &message) const
{
    if (m_secretKey.isEmpty()) return QString();

    QByteArray key = m_secretKey.toUtf8();
    QByteArray data = message.toUtf8();

    QMessageAuthenticationCode code(QCryptographicHash::Sha256);
    code.setKey(key);
    code.addData(data);

    return code.result().toHex();
}
