
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "NetworkQualityManager.generated.h"

UENUM(BlueprintType)
enum class ENetworkQuality : uint8
{
    Excellent UMETA(DisplayName = "优秀"),
    Good UMETA(DisplayName = "良好"),
    Fair UMETA(DisplayName = "一般"),
    Poor UMETA(DisplayName = "较差"),
    Critical UMETA(DisplayName = "危险")
};

USTRUCT(BlueprintType)
struct FNetworkQualityStats
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float AveragePingMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float MinPingMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float MaxPingMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float PacketLossPercent;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float JitterMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float AverageBandwidthKbps;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 PacketsSent;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 PacketsReceived;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 PacketsLost;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    ENetworkQuality CurrentQuality;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float QualityScore;

    FNetworkQualityStats()
        : AveragePingMs(0.0f)
        , MinPingMs(9999.0f)
        , MaxPingMs(0.0f)
        , PacketLossPercent(0.0f)
        , JitterMs(0.0f)
        , AverageBandwidthKbps(0.0f)
        , PacketsSent(0)
        , PacketsReceived(0)
        , PacketsLost(0)
        , CurrentQuality(ENetworkQuality::Excellent)
        , QualityScore(100.0f)
    {}
};

USTRUCT(BlueprintType)
struct FJitterBufferSettings
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MinBufferSize;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MaxBufferSize;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TargetLatencyMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bAutoAdjust;

    FJitterBufferSettings()
        : MinBufferSize(2)
        , MaxBufferSize(10)
        , TargetLatencyMs(100.0f)
        , bAutoAdjust(true)
    {}
};

USTRUCT(BlueprintType)
struct FRedundancySettings
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bEnableRedundancy;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 RedundancyLevel;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float RedundancyThresholdPercent;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MaxRedundantPackets;

    FRedundancySettings()
        : bEnableRedundancy(true)
        , RedundancyLevel(2)
        , RedundancyThresholdPercent(5.0f)
        , MaxRedundantPackets(4)
    {}
};

USTRUCT(BlueprintType)
struct FAdaptiveSyncSettings
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bEnableAdaptiveSync;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float MinSyncIntervalMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float MaxSyncIntervalMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ExcellentQualityIntervalMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float GoodQualityIntervalMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float FairQualityIntervalMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float PoorQualityIntervalMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CriticalQualityIntervalMs;

    FAdaptiveSyncSettings()
        : bEnableAdaptiveSync(true)
        , MinSyncIntervalMs(16.0f)
        , MaxSyncIntervalMs(200.0f)
        , ExcellentQualityIntervalMs(16.0f)
        , GoodQualityIntervalMs(33.0f)
        , FairQualityIntervalMs(50.0f)
        , PoorQualityIntervalMs(100.0f)
        , CriticalQualityIntervalMs(200.0f)
    {}
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnNetworkQualityChanged, ENetworkQuality, NewQuality);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPacketLossDetected, float, LossPercent);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSyncRateChanged, float, NewIntervalMs);

UCLASS()
class RAILTRANSITSIM_API UNetworkQualityManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NetworkQuality")
    FJitterBufferSettings JitterBufferConfig;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NetworkQuality")
    FRedundancySettings RedundancyConfig;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NetworkQuality")
    FAdaptiveSyncSettings AdaptiveSyncConfig;

    UPROPERTY(BlueprintReadOnly, Category = "NetworkQuality")
    FNetworkQualityStats Stats;

    UPROPERTY(BlueprintReadOnly, Category = "NetworkQuality")
    float CurrentSyncIntervalMs;

    UPROPERTY(BlueprintReadOnly, Category = "NetworkQuality")
    int32 CurrentJitterBufferSize;

    UPROPERTY(BlueprintReadOnly, Category = "NetworkQuality")
    int32 CurrentRedundancyLevel;

    UPROPERTY(BlueprintAssignable, Category = "NetworkQuality|Events")
    FOnNetworkQualityChanged OnNetworkQualityChanged;

    UPROPERTY(BlueprintAssignable, Category = "NetworkQuality|Events")
    FOnPacketLossDetected OnPacketLossDetected;

    UPROPERTY(BlueprintAssignable, Category = "NetworkQuality|Events")
    FOnSyncRateChanged OnSyncRateChanged;

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    void RecordPacketSent(int32 PacketSizeBytes, int32 SequenceNumber);

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    void RecordPacketReceived(int32 PacketSizeBytes, int32 SequenceNumber, double SendTimestamp);

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    void RecordPing(float PingMs);

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    void ResetStats();

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    float CalculateQualityScore() const;

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    ENetworkQuality GetNetworkQuality() const;

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    FString GetQualityString() const;

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    int32 GetOptimalRedundancyLevel() const;

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    float GetOptimalSyncInterval() const;

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    bool ShouldUseInterpolation() const;

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    bool ShouldUsePrediction() const;

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    void TickQualityManager(float DeltaTime);

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    TArray<int32> GetRedundantSequenceNumbers(int32 BaseSequence, int32 Count) const;

    UFUNCTION(BlueprintCallable, Category = "NetworkQuality")
    bool IsSequenceNumberRecent(int32 SequenceNumber, int32 WindowSize = 100) const;

private:
    TArray<float> PingHistory;
    TArray<int32> LostSequenceNumbers;
    TMap<int32, double> SentPacketTimestamps;
    TSet<int32> ReceivedSequenceNumbers;

    int32 LastProcessedSequence;
    int32 HighestReceivedSequence;
    float StatsWindowSeconds;
    float LastQualityUpdateTime;
    float AccumulatedBandwidthBytes;

    static const int32 MAX_PING_HISTORY = 60;
    static const int32 MAX_LOST_HISTORY = 100;

    void UpdateNetworkQuality();
    void UpdateJitterBuffer();
    void UpdateRedundancyLevel();
    void UpdateSyncInterval();
    void DetectLostPackets();
    void CalculateJitter();
    ENetworkQuality QualityFromScore(float Score) const;
};
