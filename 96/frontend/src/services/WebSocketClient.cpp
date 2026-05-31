#include "WebSocketClient.h"

#include <QWebSocket>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTimer>
#include <QDebug>

WebSocketClient::WebSocketClient(QObject *parent)
    : QObject(parent)
    , m_socket(new QWebSocket(QString(), QWebSocketProtocol::VersionLatest, this))
    , m_pingTimer(new QTimer(this))
    , m_isConnected(false)
{
    m_pingTimer->setInterval(30000);

    connect(m_socket, &QWebSocket::connected, this, &WebSocketClient::onConnected);
    connect(m_socket, &QWebSocket::disconnected, this, &WebSocketClient::onDisconnected);
    connect(m_socket, &QWebSocket::textMessageReceived, this, &WebSocketClient::onTextMessageReceived);
    connect(m_socket, QOverload<QAbstractSocket::SocketError>::of(&QWebSocket::errorOccurred),
            this, &WebSocketClient::onErrorOccurred);

    connect(m_pingTimer, &QTimer::timeout, this, &WebSocketClient::onPingTimeout);
}

WebSocketClient::~WebSocketClient()
{
    disconnectFromServer();
}

void WebSocketClient::connectToServer(const QString &url)
{
    m_url = url;
    qDebug() << "[WS] Connecting to:" << url;
    m_socket->open(QUrl(url));
}

void WebSocketClient::disconnectFromServer()
{
    if (m_pingTimer) {
        m_pingTimer->stop();
    }
    if (m_socket) {
        m_socket->close();
    }
    m_isConnected = false;
}

bool WebSocketClient::isConnected() const
{
    return m_isConnected;
}

void WebSocketClient::sendMessage(const QJsonObject &message)
{
    if (m_isConnected && m_socket) {
        const QByteArray data = QJsonDocument(message).toJson(QJsonDocument::Compact);
        m_socket->sendTextMessage(QString::fromUtf8(data));
    }
}

void WebSocketClient::onConnected()
{
    qDebug() << "[WS] Connected";
    m_isConnected = true;
    m_pingTimer->start();
    emit connected();
}

void WebSocketClient::onDisconnected()
{
    qDebug() << "[WS] Disconnected";
    m_isConnected = false;
    m_pingTimer->stop();
    emit disconnected();
}

void WebSocketClient::onTextMessageReceived(const QString &message)
{
    const QJsonDocument doc = QJsonDocument::fromJson(message.toUtf8());
    if (!doc.isObject()) {
        return;
    }

    QJsonObject obj = doc.object();
    QString type = obj["type"].toString();

    if (type == "alert") {
        QJsonObject alertObj = obj["alert"].toObject();
        Alert alert;
        alert.id = alertObj["id"].toString();
        alert.deviceId = alertObj["device_id"].toString();
        alert.deviceName = alertObj["device_name"].toString();
        alert.level = alertObj["level"].toString();
        alert.type = alertObj["type"].toString();
        alert.title = alertObj["title"].toString();
        alert.message = alertObj["message"].toString();
        alert.timestamp = QDateTime::fromString(
            alertObj["timestamp"].toString(), Qt::ISODate);
        alert.acknowledged = alertObj["acknowledged"].toBool();
        emit alertReceived(alert);
        return;
    }

    if (type == "batch_status") {
        QJsonArray reports = obj["reports"].toArray();
        emit batchStatusReceived(reports);
        return;
    }

    emit messageReceived(obj);
}

void WebSocketClient::onErrorOccurred(QAbstractSocket::SocketError error)
{
    Q_UNUSED(error);
    const QString errorStr = m_socket ? m_socket->errorString() : "Unknown error";
    qWarning() << "[WS] Error:" << errorStr;
    emit errorOccurred(errorStr);
}

void WebSocketClient::onPingTimeout()
{
    if (m_isConnected && m_socket) {
        m_socket->ping();
    }
}
