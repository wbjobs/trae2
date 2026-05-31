#ifndef PLATFORMADAPTER_H
#define PLATFORMADAPTER_H

#include <QObject>
#include <QString>
#include <QStringList>

class PlatformAdapter : public QObject
{
    Q_OBJECT

public:
    static PlatformAdapter *instance();

    void init();

    QString osName() const { return m_osName; }
    QString architecture() const { return m_architecture; }
    QString osVersion() const { return m_osVersion; }
    bool isDomesticOS() const { return m_isDomestic; }
    bool isWindows() const { return m_osName.contains("Windows", Qt::CaseInsensitive); }
    bool isLinux() const { return m_isLinux; }

    QStringList serialPorts() const;
    QStringList networkInterfaces() const;
    double cpuUsage();
    double memoryUsage();
    bool isElevated() const;

    QString executeCommand(const QString &cmd) const;

private:
    explicit PlatformAdapter(QObject *parent = nullptr);
    ~PlatformAdapter() override;

    void detectPlatform();

    QString m_osName;
    QString m_architecture;
    QString m_osVersion;
    bool m_isDomestic;
    bool m_isLinux;

    static PlatformAdapter *s_instance;
};

#endif // PLATFORMADAPTER_H
