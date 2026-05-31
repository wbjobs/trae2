#ifndef WEBSOCKETCLIENT_H
#define WEBSOCKETCLIENT_H

#include <QObject>
#include <QWebSocket>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTimer>
#include <QDateTime>

struct Alert
{
    QString id;
    QString deviceId;
    QString deviceName;
    QString level;
    QString type;
    QString title;
    QString message;
    QDateTime timestamp;
    bool acknowledged;
};

class WebSocketClient : public QObject
{
    Q_OBJECT

public:
    explicit WebSocketClient(QObject *parent = nullptr);
    ~WebSocketClient() override;

    void connectToServer(const QString &url);
    void disconnectFromServer();
    bool isConnected() const;

    void sendMessage(const QJsonObject &message);

signals:
    void connected();
    void disconnected();
    void messageReceived(const QJsonObject &message);
    void alertReceived(const Alert &alert);
    void batchStatusReceived(const QJsonArray &reports);
    void errorOccurred(const QString &error);

private slots:
    void onConnected();
    void onDisconnected();
    void onTextMessageReceived(const QString &message);
    void onErrorOccurred(QAbstractSocket::SocketError error);
    void onPingTimeout();

private:
    QWebSocket *m_socket;
    QTimer *m_pingTimer;
    QString m_url;
    bool m_isConnected;
};

#endif // WEBSOCKETCLIENT_H
