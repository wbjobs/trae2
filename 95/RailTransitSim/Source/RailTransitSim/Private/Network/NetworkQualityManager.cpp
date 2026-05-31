
#include "Network/NetworkQualityManager.h"

void UNetworkQualityManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    StatsWindowSeconds = 10.0f;
    LastQualityUpdateTime = 0.0f;
    AccumulatedBandwidthBytes = 0.0f;
    LastProcessedSequence = 0;
    HighestReceivedSequence = 0;
    CurrentSyncIntervalMs = AdaptiveSyncConfig.ExcellentQualityIntervalMs;
    CurrentJitterBufferSize = JitterBufferConfig.MinBufferSize;
    CurrentRedundancyLevel = RedundancyConfig.RedundancyLevel;
}

void UNetworkQualityManager::Deinitialize()
{
    PingHistory.Empty();
    LostSequenceNumbers.Empty();
    SentPacketTimestamps.Empty();
    ReceivedSequenceNumbers.Empty();
    Super::Deinitialize();
}

void UNetworkQualityManager::RecordPacketSent(int32 PacketSizeBytes, int32 SequenceNumber)
{
    Stats.PacketsSent++;
    SentPacketTimestamps.Add(SequenceNumber, FPlatformTime::Seconds());
    AccumulatedBandwidthBytes += PacketSizeBytes;
}

void UNetworkQualityManager::RecordPacketReceived(int32 PacketSizeBytes, int32 SequenceNumber, double SendTimestamp)
{
    Stats.PacketsReceived++;
    ReceivedSequenceNumbers.Add(SequenceNumber);
    AccumulatedBandwidthBytes += PacketSizeBytes;

    if (SequenceNumber > HighestReceivedSequence)
    {
        HighestReceivedSequence = SequenceNumber;
    }

    if (SendTimestamp > 0.0)
    {
        const double Now = FPlatformTime::Seconds();
        const float PingMs = static_cast<float>((Now - SendTimestamp) * 1000.0);
        RecordPing(PingMs);
    }

    DetectLostPackets();
}

void UNetworkQualityManager::RecordPing(float PingMs)
{
    PingHistory.Add(PingMs);
    if (PingHistory.Num() > MAX_PING_HISTORY)
    {
        PingHistory.RemoveAt(0);
    }

    Stats.MinPingMs = FMath::Min(Stats.MinPingMs, PingMs);
    Stats.MaxPingMs = FMath::Max(Stats.MaxPingMs, PingMs);

    if (PingHistory.Num() > 0)
    {
        Stats.AveragePingMs = 0.0f;
        for (float P : PingHistory)
        {
            Stats.AveragePingMs += P;
        }
        Stats.AveragePingMs /= PingHistory.Num();
    }

    CalculateJitter();
}

void UNetworkQualityManager::ResetStats()
{
    Stats = FNetworkQualityStats();
    PingHistory.Empty();
    LostSequenceNumbers.Empty();
    SentPacketTimestamps.Empty();
    ReceivedSequenceNumbers.Empty();
    LastProcessedSequence = 0;
    HighestReceivedSequence = 0;
    AccumulatedBandwidthBytes = 0.0f;
}

float UNetworkQualityManager::CalculateQualityScore() const
{
    float Score = 100.0f;

    const float PingScore = FMath::Clamp(100.0f - (Stats.AveragePingMs - 50.0f) * 0.3f, 0.0f, 100.0f);
    const float LossScore = FMath::Clamp(100.0f - Stats.PacketLossPercent * 5.0f, 0.0f, 100.0f);
    const float JitterScore = FMath::Clamp(100.0f - Stats.JitterMs * 2.0f, 0.0f, 100.0f);

    Score = PingScore * 0.4f + LossScore * 0.4f + JitterScore * 0.2f;
    return FMath::Clamp(Score, 0.0f, 100.0f);
}

ENetworkQuality UNetworkQualityManager::GetNetworkQuality() const
{
    return QualityFromScore(Stats.QualityScore);
}

FString UNetworkQualityManager::GetQualityString() const
{
    switch (Stats.CurrentQuality)
    {
    case ENetworkQuality::Excellent:
        return TEXT("优秀");
    case ENetworkQuality::Good:
        return TEXT("良好");
    case ENetworkQuality::Fair:
        return TEXT("一般");
    case ENetworkQuality::Poor:
        return TEXT("较差");
    case ENetworkQuality::Critical:
        return TEXT("危险");
    default:
        return TEXT("未知");
    }
}

int32 UNetworkQualityManager::GetOptimalRedundancyLevel() const
{
    if (!RedundancyConfig.bEnableRedundancy) return 0;

    const float LossPercent = Stats.PacketLossPercent;

    if (LossPercent < 1.0f)
    {
        return 1;
    }
    else if (LossPercent < 3.0f)
    {
        return 2;
    }
    else if (LossPercent < 5.0f)
    {
        return 3;
    }
    else
    {
        return FMath::Min(4, RedundancyConfig.MaxRedundantPackets);
    }
}

float UNetworkQualityManager::GetOptimalSyncInterval() const
{
    if (!AdaptiveSyncConfig.bEnableAdaptiveSync)
    {
        return AdaptiveSyncConfig.ExcellentQualityIntervalMs;
    }

    switch (Stats.CurrentQuality)
    {
    case ENetworkQuality::Excellent:
        return AdaptiveSyncConfig.ExcellentQualityIntervalMs;
    case ENetworkQuality::Good:
        return AdaptiveSyncConfig.GoodQualityIntervalMs;
    case ENetworkQuality::Fair:
        return AdaptiveSyncConfig.FairQualityIntervalMs;
    case ENetworkQuality::Poor:
        return AdaptiveSyncConfig.PoorQualityIntervalMs;
    case ENetworkQuality::Critical:
        return AdaptiveSyncConfig.CriticalQualityIntervalMs;
    default:
        return AdaptiveSyncConfig.FairQualityIntervalMs;
    }
}

bool UNetworkQualityManager::ShouldUseInterpolation() const
{
    return Stats.QualityScore >= 30.0f;
}

bool UNetworkQualityManager::ShouldUsePrediction() const
{
    return Stats.AveragePingMs >= 50.0f || Stats.JitterMs >= 20.0f;
}

void UNetworkQualityManager::TickQualityManager(float DeltaTime)
{
    LastQualityUpdateTime += DeltaTime;

    if (LastQualityUpdateTime >= 1.0f)
    {
        LastQualityUpdateTime = 0.0f;

        Stats.AverageBandwidthKbps = (AccumulatedBandwidthBytes / 1024.0f);
        AccumulatedBandwidthBytes = 0.0f;

        UpdateNetworkQuality();
        UpdateJitterBuffer();
        UpdateRedundancyLevel();
        UpdateSyncInterval();
    }
}

TArray<int32> UNetworkQualityManager::GetRedundantSequenceNumbers(int32 BaseSequence, int32 Count) const
{
    TArray<int32> Result;
    const int32 Level = FMath::Min(Count, CurrentRedundancyLevel);

    for (int32 i = 0; i < Level; i++)
    {
        const int32 Seq = BaseSequence - (i + 1);
        if (Seq > 0)
        {
            Result.Add(Seq);
        }
    }

    return Result;
}

bool UNetworkQualityManager::IsSequenceNumberRecent(int32 SequenceNumber, int32 WindowSize) const
{
    return SequenceNumber >= HighestReceivedSequence - WindowSize;
}

void UNetworkQualityManager::UpdateNetworkQuality()
{
    const float OldScore = Stats.QualityScore;
    Stats.QualityScore = CalculateQualityScore();

    const ENetworkQuality OldQuality = Stats.CurrentQuality;
    Stats.CurrentQuality = QualityFromScore(Stats.QualityScore);

    if (OldQuality != Stats.CurrentQuality)
    {
        OnNetworkQualityChanged.Broadcast(Stats.CurrentQuality);
        UE_LOG(LogTemp, Log, TEXT("Network quality changed: %s (score: %.1f)"),
            *GetQualityString(), Stats.QualityScore);
    }
}

void UNetworkQualityManager::UpdateJitterBuffer()
{
    if (!JitterBufferConfig.bAutoAdjust) return;

    if (Stats.JitterMs < 10.0f)
    {
        CurrentJitterBufferSize = JitterBufferConfig.MinBufferSize;
    }
    else if (Stats.JitterMs < 30.0f)
    {
        CurrentJitterBufferSize = FMath::Clamp(3, JitterBufferConfig.MinBufferSize, JitterBufferConfig.MaxBufferSize);
    }
    else if (Stats.JitterMs < 50.0f)
    {
        CurrentJitterBufferSize = FMath::Clamp(5, JitterBufferConfig.MinBufferSize, JitterBufferConfig.MaxBufferSize);
    }
    else
    {
        CurrentJitterBufferSize = JitterBufferConfig.MaxBufferSize;
    }
}

void UNetworkQualityManager::UpdateRedundancyLevel()
{
    if (!RedundancyConfig.bEnableRedundancy) return;

    const int32 NewLevel = GetOptimalRedundancyLevel();
    if (NewLevel != CurrentRedundancyLevel)
    {
        CurrentRedundancyLevel = NewLevel;
        UE_LOG(LogTemp, Log, TEXT("Redundancy level changed: %d"), CurrentRedundancyLevel);
    }
}

void UNetworkQualityManager::UpdateSyncInterval()
{
    if (!AdaptiveSyncConfig.bEnableAdaptiveSync) return;

    const float NewInterval = GetOptimalSyncInterval();
    if (FMath::Abs(NewInterval - CurrentSyncIntervalMs) > 1.0f)
    {
        CurrentSyncIntervalMs = NewInterval;
        OnSyncRateChanged.Broadcast(CurrentSyncIntervalMs);
        UE_LOG(LogTemp, Log, TEXT("Sync interval adjusted: %.1fms"), CurrentSyncIntervalMs);
    }
}

void UNetworkQualityManager::DetectLostPackets()
{
    if (HighestReceivedSequence <= LastProcessedSequence) return;

    int32 LostCount = 0;
    for (int32 Seq = LastProcessedSequence + 1; Seq < HighestReceivedSequence; Seq++)
    {
        if (!ReceivedSequenceNumbers.Contains(Seq))
        {
            LostCount++;
            Stats.PacketsLost++;
            LostSequenceNumbers.Add(Seq);

            if (LostSequenceNumbers.Num() > MAX_LOST_HISTORY)
            {
                LostSequenceNumbers.RemoveAt(0);
            }
        }
    }

    LastProcessedSequence = HighestReceivedSequence;

    if (Stats.PacketsSent > 0)
    {
        Stats.PacketLossPercent = static_cast<float>(Stats.PacketsLost) /
                                 static_cast<float>(Stats.PacketsSent) * 100.0f;
    }

    if (LostCount > 0 && Stats.PacketLossPercent >= RedundancyConfig.RedundancyThresholdPercent)
    {
        OnPacketLossDetected.Broadcast(Stats.PacketLossPercent);
    }
}

void UNetworkQualityManager::CalculateJitter()
{
    if (PingHistory.Num() < 2)
    {
        Stats.JitterMs = 0.0f;
        return;
    }

    float TotalVariance = 0.0f;
    for (int32 i = 1; i < PingHistory.Num(); i++)
    {
        TotalVariance += FMath::Abs(PingHistory[i] - PingHistory[i - 1]);
    }

    Stats.JitterMs = TotalVariance / (PingHistory.Num() - 1);
}

ENetworkQuality UNetworkQualityManager::QualityFromScore(float Score) const
{
    if (Score >= 80.0f)
    {
        return ENetworkQuality::Excellent;
    }
    else if (Score >= 60.0f)
    {
        return ENetworkQuality::Good;
    }
    else if (Score >= 40.0f)
    {
        return ENetworkQuality::Fair;
    }
    else if (Score >= 20.0f)
    {
        return ENetworkQuality::Poor;
    }
    else
    {
        return ENetworkQuality::Critical;
    }
}
