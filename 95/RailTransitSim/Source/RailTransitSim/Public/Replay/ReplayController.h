
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Network/NetworkMessageProtocol.h"
#include "ReplayController.generated.h"

UENUM(BlueprintType)
enum class EReplayPlaybackState : uint8
{
    Idle,
    Recording,
    Playing,
    Paused,
    Exporting
};

USTRUCT(BlueprintType)
struct FReplayFrame
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Timestamp;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FTrainNetworkState> TrainStates;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FSignalNetworkState> SignalStates;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FClientOperationRecord> Operations;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString EventDescription;

    FReplayFrame()
        : Timestamp(0.0f)
    {}
};

USTRUCT(BlueprintType)
struct FReplaySessionInfo
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SessionId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SessionName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FDateTime RecordTime;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float DurationSeconds;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 FrameCount;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString StudentId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString StudentName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float FinalScore;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 TotalViolations;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 FileSizeBytes;

    FReplaySessionInfo()
        : DurationSeconds(0.0f)
        , FrameCount(0)
        , FinalScore(0.0f)
        , TotalViolations(0)
        , FileSizeBytes(0)
    {}
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRecordingStarted, const FString&, SessionId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRecordingStopped, const FReplaySessionInfo&, SessionInfo);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPlaybackStarted, const FString&, SessionId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPlaybackPaused, bool, bPaused);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnPlaybackStopped);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPlaybackTimeChanged, float, NewTime);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnReplayFrameLoaded, const FReplayFrame&, Frame);

UCLASS()
class RAILTRANSITSIM_API UReplayController : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Replay")
    float RecordingFrameRate;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Replay")
    int32 MaxRecordingDurationMinutes;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Replay")
    FString ReplaySaveDirectory;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Replay")
    bool bAutoSaveReplayOnTrainingEnd;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Replay")
    bool bCompressReplayData;

    UPROPERTY(BlueprintReadOnly, Category = "Replay")
    EReplayPlaybackState PlaybackState;

    UPROPERTY(BlueprintReadOnly, Category = "Replay")
    FString CurrentRecordingSessionId;

    UPROPERTY(BlueprintReadOnly, Category = "Replay")
    FString CurrentPlaybackSessionId;

    UPROPERTY(BlueprintReadOnly, Category = "Replay")
    float CurrentPlaybackTime;

    UPROPERTY(BlueprintReadOnly, Category = "Replay")
    float PlaybackSpeed;

    UPROPERTY(BlueprintReadOnly, Category = "Replay")
    float CurrentRecordingDuration;

    UPROPERTY(BlueprintReadOnly, Category = "Replay")
    int32 CurrentFrameIndex;

    UPROPERTY(BlueprintAssignable, Category = "Replay|Events")
    FOnRecordingStarted OnRecordingStarted;

    UPROPERTY(BlueprintAssignable, Category = "Replay|Events")
    FOnRecordingStopped OnRecordingStopped;

    UPROPERTY(BlueprintAssignable, Category = "Replay|Events")
    FOnPlaybackStarted OnPlaybackStarted;

    UPROPERTY(BlueprintAssignable, Category = "Replay|Events")
    FOnPlaybackPaused OnPlaybackPaused;

    UPROPERTY(BlueprintAssignable, Category = "Replay|Events")
    FOnPlaybackStopped OnPlaybackStopped;

    UPROPERTY(BlueprintAssignable, Category = "Replay|Events")
    FOnPlaybackTimeChanged OnPlaybackTimeChanged;

    UPROPERTY(BlueprintAssignable, Category = "Replay|Events")
    FOnReplayFrameLoaded OnReplayFrameLoaded;

    UFUNCTION(BlueprintCallable, Category = "Replay|Recording")
    bool StartRecording(const FString& SessionName = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "Replay|Recording")
    void StopRecording();

    UFUNCTION(BlueprintCallable, Category = "Replay|Recording")
    bool IsRecording() const { return PlaybackState == EReplayPlaybackState::Recording; }

    UFUNCTION(BlueprintCallable, Category = "Replay|Recording")
    void RecordFrame(const FReplayFrame& Frame);

    UFUNCTION(BlueprintCallable, Category = "Replay|Recording")
    void RecordEvent(const FString& EventDescription);

    UFUNCTION(BlueprintCallable, Category = "Replay|Recording")
    bool SaveCurrentRecording(const FString& FileName = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    bool StartPlayback(const FString& SessionId);

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    void PausePlayback();

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    void ResumePlayback();

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    void StopPlayback();

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    void SetPlaybackSpeed(float Speed);

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    void SeekToTime(float TimeSeconds);

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    void SeekToFrame(int32 FrameIndex);

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    void SkipForward(float Seconds);

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    void SkipBackward(float Seconds);

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    FReplayFrame GetCurrentFrame() const;

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    float GetPlaybackDuration() const;

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    bool IsPlaying() const { return PlaybackState == EReplayPlaybackState::Playing; }

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    bool IsPaused() const { return PlaybackState == EReplayPlaybackState::Paused; }

    UFUNCTION(BlueprintCallable, Category = "Replay|Playback")
    void TickPlayback(float DeltaTime);

    UFUNCTION(BlueprintCallable, Category = "Replay|File")
    bool LoadReplaySession(const FString& FilePath);

    UFUNCTION(BlueprintCallable, Category = "Replay|File")
    TArray<FReplaySessionInfo> GetAvailableReplays();

    UFUNCTION(BlueprintCallable, Category = "Replay|File")
    bool DeleteReplay(const FString& SessionId);

    UFUNCTION(BlueprintCallable, Category = "Replay|File")
    FReplaySessionInfo GetReplayInfo(const FString& SessionId) const;

    UFUNCTION(BlueprintCallable, Category = "Replay|Bookmarks")
    void AddBookmark(float Time, const FString& Description);

    UFUNCTION(BlueprintCallable, Category = "Replay|Bookmarks")
    TArray<FString> GetBookmarkDescriptions() const;

    UFUNCTION(BlueprintCallable, Category = "Replay|Bookmarks")
    void JumpToBookmark(int32 BookmarkIndex);

    UFUNCTION(BlueprintCallable, Category = "Replay|Analysis")
    TArray<FClientOperationRecord> GetViolationsInRange(float StartTime, float EndTime) const;

    UFUNCTION(BlueprintCallable, Category = "Replay|Analysis")
    float GetAverageSpeedInRange(float StartTime, float EndTime, const FString& TrainId) const;

private:
    TArray<FReplayFrame> RecordedFrames;
    TArray<FReplayFrame> LoadedFrames;
    TMap<FString, FReplaySessionInfo> ReplayCache;
    TMap<float, FString> Bookmarks;

    float FrameInterval;
    float LastRecordTime;
    float AccumulatedTime;

    FReplayFrame InterpolateFrames(const FReplayFrame& Prev, const FReplayFrame& Next, float Alpha) const;
    int32 FindFrameIndexAtTime(float Time) const;
    FString GenerateReplayFilePath(const FString& SessionName) const;
    bool SerializeReplay(const FString& FilePath, const TArray<FReplayFrame>& Frames, const FReplaySessionInfo& Info);
    bool DeserializeReplay(const FString& FilePath, TArray<FReplayFrame>& OutFrames, FReplaySessionInfo& OutInfo);
    void UpdateReplayCache();
};
