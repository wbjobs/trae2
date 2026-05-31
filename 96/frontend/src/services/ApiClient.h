#ifndef APICLIENT_H
#define APICLIENT_H

#include <QObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QUrl>
#include <QStringList>
#include <QByteArray>

class ApiClient : public QObject
{
    Q_OBJECT

public:
    explicit ApiClient(QObject *parent = nullptr);
    ~ApiClient() override;

    void setBaseUrl(const QString &url);
    QString baseUrl() const;

    void setSecretKey(const QString &key);
    QString secretKey() const;

    void get(const QString &endpoint, QObject *receiver, const char *member);
    void post(const QString &endpoint, const QJsonObject &data, QObject *receiver, const char *member);
    void put(const QString &endpoint, const QJsonObject &data, QObject *receiver, const char *member);
    void del(const QString &endpoint, QObject *receiver, const char *member);
    void postFiles(const QString &endpoint, const QStringList &filePaths,
                   QObject *receiver, const char *member);

signals:
    void requestFinished(const QJsonDocument &doc);
    void requestError(const QString &error);

private slots:
    void onAuthInfoReceived(const QJsonDocument &doc);

private:
    QNetworkAccessManager *m_manager;
    QString m_baseUrl;
    QString m_secretKey;
    qint64 m_serverTimeOffset;
    bool m_authInitialized;

    friend class TemplateModel;
    friend class ScheduledModel;

    QUrl buildUrl(const QString &endpoint) const;
    void handleReply(QNetworkReply *reply, QObject *receiver, const char *member);
    void addSignatureHeaders(QNetworkRequest &request, const QString &method,
                             const QString &endpoint, const QByteArray &body) const;
    qint64 currentTimestamp() const;
    QString computeHMAC(const QString &message) const;
    void initializeAuth();
};

#endif // APICLIENT_H
