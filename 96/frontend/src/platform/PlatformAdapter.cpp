#include "PlatformAdapter.h"

#include <QSysInfo>
#include <QProcess>
#include <QFile>
#include <QTextStream>
#include <QRegularExpression>
#include <QDebug>
#include <QSerialPortInfo>
#include <QNetworkInterface>

PlatformAdapter *PlatformAdapter::s_instance = nullptr;

PlatformAdapter *PlatformAdapter::instance()
{
    if (!s_instance) {
        s_instance = new PlatformAdapter();
    }
    return s_instance;
}

PlatformAdapter::PlatformAdapter(QObject *parent)
    : QObject(parent)
    , m_isDomestic(false)
    , m_isLinux(false)
{
}

PlatformAdapter::~PlatformAdapter() = default;

void PlatformAdapter::init()
{
    detectPlatform();
    qDebug() << "[Platform] Detected:" << m_osName << "|" << m_architecture
             << "| Domestic:" << m_isDomestic;
}

void PlatformAdapter::detectPlatform()
{
    m_architecture = QSysInfo::currentCpuArchitecture();
    m_osVersion = QSysInfo::productVersion();

#if defined(Q_OS_WINDOWS)
    m_osName = "Microsoft Windows";
    m_isDomestic = false;
    m_isLinux = false;
#elif defined(Q_OS_LINUX)
    m_isLinux = true;
    m_osName = "Linux";
    m_isDomestic = false;

    QFile osRelease("/etc/os-release");
    if (osRelease.open(QIODevice::ReadOnly | QIODevice::Text)) {
        QTextStream in(&osRelease);
        QString content = in.readAll();
        osRelease.close();

        if (content.contains("Kylin", Qt::CaseInsensitive)) {
            if (content.contains("NeoKylin", Qt::CaseInsensitive)) {
                m_osName = "中标麒麟 (NeoKylin)";
            } else {
                m_osName = "银河麒麟 (Kylin)";
            }
            m_isDomestic = true;
        } else if (content.contains("uos", Qt::CaseInsensitive) ||
                   content.contains("UnionTech", Qt::CaseInsensitive)) {
            m_osName = "统信UOS";
            m_isDomestic = true;
        } else if (content.contains("Deepin", Qt::CaseInsensitive)) {
            m_osName = "深度 (Deepin)";
            m_isDomestic = true;
        }

        QRegularExpression nameRegex("PRETTY_NAME=\"([^\"]+)\"");
        QRegularExpressionMatch match = nameRegex.match(content);
        if (match.hasMatch()) {
            m_osVersion = match.captured(1);
        }
    }
#else
    m_osName = "Unknown";
    m_isLinux = false;
#endif
}

QStringList PlatformAdapter::serialPorts() const
{
    QStringList ports;
    const auto serialPorts = QSerialPortInfo::availablePorts();
    for (const auto &port : serialPorts) {
        ports.append(port.portName());
    }
    return ports;
}

QStringList PlatformAdapter::networkInterfaces() const
{
    QStringList names;
    const auto ifaces = QNetworkInterface::allInterfaces();
    for (const auto &iface : ifaces) {
        names.append(iface.name());
    }
    return names;
}

double PlatformAdapter::cpuUsage()
{
#if defined(Q_OS_WINDOWS)
    QProcess process;
    process.start("wmic", QStringList() << "cpu" << "get" << "LoadPercentage" << "/value");
    process.waitForFinished(3000);
    QString output = process.readAllStandardOutput();
    QRegularExpression regex("LoadPercentage=(\\d+)");
    QRegularExpressionMatch match = regex.match(output);
    if (match.hasMatch()) {
        return match.captured(1).toDouble();
    }
    return 0.0;
#elif defined(Q_OS_LINUX)
    QFile file("/proc/stat");
    if (file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        QTextStream in(&file);
        QString line = in.readLine();
        file.close();

        if (line.startsWith("cpu ")) {
            QStringList parts = line.split(QRegularExpression("\\s+"), Qt::SkipEmptyParts);
            if (parts.size() >= 8) {
                double user = parts[1].toDouble();
                double nice = parts[2].toDouble();
                double system = parts[3].toDouble();
                double idle = parts[4].toDouble();
                double iowait = parts[5].toDouble();
                double irq = parts[6].toDouble();
                double softirq = parts[7].toDouble();

                double total = user + nice + system + idle + iowait + irq + softirq;
                double used = total - idle - iowait;
                return (used / total) * 100.0;
            }
        }
    }
    return 0.0;
#else
    return 0.0;
#endif
}

double PlatformAdapter::memoryUsage()
{
#if defined(Q_OS_WINDOWS)
    QProcess process;
    process.start("wmic", QStringList() << "OS" << "get" << "FreePhysicalMemory,TotalVisibleMemorySize" << "/value");
    process.waitForFinished(3000);
    QString output = process.readAllStandardOutput();

    double free = 0, total = 0;
    QRegularExpression freeRegex("FreePhysicalMemory=(\\d+)");
    QRegularExpression totalRegex("TotalVisibleMemorySize=(\\d+)");

    QRegularExpressionMatch freeMatch = freeRegex.match(output);
    if (freeMatch.hasMatch()) free = freeMatch.captured(1).toDouble();

    QRegularExpressionMatch totalMatch = totalRegex.match(output);
    if (totalMatch.hasMatch()) total = totalMatch.captured(1).toDouble();

    if (total > 0) {
        return (1.0 - free / total) * 100.0;
    }
    return 0.0;
#elif defined(Q_OS_LINUX)
    QFile file("/proc/meminfo");
    if (file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        QTextStream in(&file);
        QString content = in.readAll();
        file.close();

        double total = 0, free = 0, buffers = 0, cached = 0;

        QRegularExpression totalRegex("MemTotal:\\s+(\\d+)");
        QRegularExpression freeRegex("MemFree:\\s+(\\d+)");
        QRegularExpression buffersRegex("Buffers:\\s+(\\d+)");
        QRegularExpression cachedRegex("Cached:\\s+(\\d+)");

        QRegularExpressionMatch match;
        if ((match = totalRegex.match(content)).hasMatch()) total = match.captured(1).toDouble();
        if ((match = freeRegex.match(content)).hasMatch()) free = match.captured(1).toDouble();
        if ((match = buffersRegex.match(content)).hasMatch()) buffers = match.captured(1).toDouble();
        if ((match = cachedRegex.match(content)).hasMatch()) cached = match.captured(1).toDouble();

        if (total > 0) {
            double used = total - free - buffers - cached;
            return (used / total) * 100.0;
        }
    }
    return 0.0;
#else
    return 0.0;
#endif
}

bool PlatformAdapter::isElevated() const
{
#if defined(Q_OS_WINDOWS)
    QProcess process;
    process.start("net", QStringList() << "session");
    process.waitForFinished(2000);
    return process.exitCode() == 0;
#elif defined(Q_OS_LINUX)
    return geteuid() == 0;
#else
    return false;
#endif
}

QString PlatformAdapter::executeCommand(const QString &cmd) const
{
    QProcess process;
#if defined(Q_OS_WINDOWS)
    process.start("powershell", QStringList() << "-Command" << cmd);
#else
    process.start("/bin/sh", QStringList() << "-c" << cmd);
#endif
    process.waitForFinished(5000);
    return process.readAllStandardOutput() + process.readAllStandardError();
}
