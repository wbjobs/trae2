
#include "Replay/ReplayController.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/PlatformFilemanager.h"
#include "Serialization/BufferArchive.h"
#include "Serialization/MemoryReader.h"
#include "Misc/DateTime.h"

void UReplayController::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    RecordingFrameRate = 30.0f;
    MaxRecordingDurationMinutes = 120;
    ReplaySaveDirectory = FPaths::ProjectSavedDir() / TEXT("Replays");
    bAutoSaveReplayOnTrainingEnd = true;
    bCompressReplayData = true;
    PlaybackState = EReplayPlaybackState::Idle;
    PlaybackSpeed = 1.0f;
    CurrentPlaybackTime = 0.0f;
    CurrentRecordingDuration = 0.0f;
    CurrentFrameIndex = 0;
    FrameInterval = 1.0f / RecordingFrameRate;
    LastRecordTime = 0.0f;
    AccumulatedTime = 0.0f;

    IPlatformFile& FileManager = FPlatformFileManager::Get().GetPlatformFile();
    if (!FileManager.DirectoryExists(*ReplaySaveDirectory))
    {
        FileManager.CreateDirectory(*ReplaySaveDirectory);
    }

    UpdateReplayCache();
}

void UReplayController::Deinitialize()
{
    if (IsRecording())
    {
        StopRecording();
    }
    if (IsPlaying() || IsPaused())
    {
        StopPlayback();
    }

    Super::Deinitialize();
}

bool UReplayController::StartRecording(const FString& SessionName)
{
    if (IsRecording() || IsPlaying() || IsPaused())
    {
        return false;
    }

    CurrentRecordingSessionId = FGuid::NewGuid().ToString();
    RecordedFrames.Empty();
    Bookmarks.Empty();
    CurrentRecordingDuration = 0.0f;
    LastRecordTime = FPlatformTime::Seconds();
    AccumulatedTime = 0.0f;
    PlaybackState = EReplayPlaybackState::Recording;

    OnRecordingStarted.Broadcast(CurrentRecordingSessionId);
    UE_LOG(LogTemp, Log, TEXT("Replay recording started: Session %s"), *CurrentRecordingSessionId);

    return true;
}

void UReplayController::StopRecording()
{
    if (!IsRecording()) return;

    FReplaySessionInfo Info;
    Info.SessionId = CurrentRecordingSessionId;
    Info.RecordTime = FDateTime::Now();
    Info.DurationSeconds = CurrentRecordingDuration;
    Info.FrameCount = RecordedFrames.Num();
    Info.FileSizeBytes = 0;

    PlaybackState = EReplayPlaybackState::Idle;
    OnRecordingStopped.Broadcast(Info);

    UE_LOG(LogTemp, Log, TEXT("Replay recording stopped: %d frames, %.1f seconds"),
        Info.FrameCount, Info.DurationSeconds);

    if (bAutoSaveReplayOnTrainingEnd)
    {
        SaveCurrentRecording();
    }

    CurrentRecordingSessionId.Empty();
}

void UReplayController::RecordFrame(const FReplayFrame& Frame)
{
    if (!IsRecording()) return;

    const float MaxDuration = MaxRecordingDurationMinutes * 60.0f;
    if (CurrentRecordingDuration >= MaxDuration)
    {
        UE_LOG(LogTemp, Warning, TEXT("Max recording duration reached, stopping..."));
        StopRecording();
        return;
    }

    const float Now = FPlatformTime::Seconds();
    const float DeltaTime = Now - LastRecordTime;
    AccumulatedTime += DeltaTime;
    LastRecordTime = Now;

    if (AccumulatedTime >= FrameInterval || RecordedFrames.Num() == 0)
    {
        FReplayFrame NewFrame = Frame;
        NewFrame.Timestamp = CurrentRecordingDuration;
        RecordedFrames.Add(NewFrame);

        while (AccumulatedTime >= FrameInterval)
        {
            AccumulatedTime -= FrameInterval;
            CurrentRecordingDuration += FrameInterval;
        }
    }
}

void UReplayController::RecordEvent(const FString& EventDescription)
{
    if (!IsRecording() || RecordedFrames.Num() == 0) return;

    RecordedFrames.Last().EventDescription = EventDescription;
    UE_LOG(LogTemp, Log, TEXT("Replay event recorded at %.1fs: %s"),
        CurrentRecordingDuration, *EventDescription);
}

bool UReplayController::SaveCurrentRecording(const FString& FileName)
{
    if (RecordedFrames.Num() == 0) return false;

    FReplaySessionInfo Info;
    Info.SessionId = CurrentRecordingSessionId.IsEmpty() ? FGuid::NewGuid().ToString() : CurrentRecordingSessionId;
    Info.SessionName = FileName.IsEmpty() ? FString::Printf(TEXT("Replay_%s"), *FDateTime::Now().ToString(TEXT("%Y%m%d_%H%M%S"))) : FileName;
    Info.RecordTime = FDateTime::Now();
    Info.DurationSeconds = CurrentRecordingDuration;
    Info.FrameCount = RecordedFrames.Num();

    const FString FilePath = GenerateReplayFilePath(Info.SessionName);
    const bool bSuccess = SerializeReplay(FilePath, RecordedFrames, Info);

    if (bSuccess)
    {
        IPlatformFile& FileManager = FPlatformFileManager::Get().GetPlatformFile();
        Info.FileSizeBytes = FileManager.FileSize(*FilePath);
        ReplayCache.Add(Info.SessionId, Info);
        UE_LOG(LogTemp, Log, TEXT("Replay saved to: %s (%d KB)"), *FilePath, Info.FileSizeBytes / 1024);
    }

    return bSuccess;
}

bool UReplayController::StartPlayback(const FString& SessionId)
{
    if (IsRecording())
    {
        StopRecording();
    }

    FReplaySessionInfo Info = GetReplayInfo(SessionId);
    if (Info.SessionId.IsEmpty() && !SessionId.IsEmpty())
    {
        const FString FilePath = GenerateReplayFilePath(SessionId);
        if (!LoadReplaySession(FilePath))
        {
            return false;
        }
    }

    if (LoadedFrames.Num() == 0)
    {
        return false;
    }

    CurrentPlaybackSessionId = SessionId;
    CurrentPlaybackTime = 0.0f;
    CurrentFrameIndex = 0;
    PlaybackSpeed = 1.0f;
    PlaybackState = EReplayPlaybackState::Playing;

    OnPlaybackStarted.Broadcast(SessionId);
    UE_LOG(LogTemp, Log, TEXT("Replay playback started: %s, %.1f seconds"), *SessionId, GetPlaybackDuration());

    return true;
}

void UReplayController::PausePlayback()
{
    if (!IsPlaying()) return;

    PlaybackState = EReplayPlaybackState::Paused;
    OnPlaybackPaused.Broadcast(true);
}

void UReplayController::ResumePlayback()
{
    if (!IsPaused()) return;

    PlaybackState = EReplayPlaybackState::Playing;
    OnPlaybackPaused.Broadcast(false);
}

void UReplayController::StopPlayback()
{
    if (!IsPlaying() && !IsPaused()) return;

    PlaybackState = EReplayPlaybackState::Idle;
    CurrentPlaybackSessionId.Empty();
    CurrentPlaybackTime = 0.0f;
    CurrentFrameIndex = 0;
    OnPlaybackStopped.Broadcast();
}

void UReplayController::SetPlaybackSpeed(float Speed)
{
    PlaybackSpeed = FMath::Clamp(Speed, 0.1f, 8.0f);
}

void UReplayController::SeekToTime(float TimeSeconds)
{
    if (LoadedFrames.Num() == 0) return;

    CurrentPlaybackTime = FMath::Clamp(TimeSeconds, 0.0f, GetPlaybackDuration());
    CurrentFrameIndex = FindFrameIndexAtTime(CurrentPlaybackTime);
    OnPlaybackTimeChanged.Broadcast(CurrentPlaybackTime);
}

void UReplayController::SeekToFrame(int32 FrameIndex)
{
    if (LoadedFrames.Num() == 0) return;

    CurrentFrameIndex = FMath::Clamp(FrameIndex, 0, LoadedFrames.Num() - 1);
    if (LoadedFrames.IsValidIndex(CurrentFrameIndex))
    {
        CurrentPlaybackTime = LoadedFrames[CurrentFrameIndex].Timestamp;
        OnPlaybackTimeChanged.Broadcast(CurrentPlaybackTime);
    }
}

void UReplayController::SkipForward(float Seconds)
{
    SeekToTime(CurrentPlaybackTime + Seconds);
}

void UReplayController::SkipBackward(float Seconds)
{
    SeekToTime(CurrentPlaybackTime - Seconds);
}

FReplayFrame UReplayController::GetCurrentFrame() const
{
    if (LoadedFrames.IsValidIndex(CurrentFrameIndex))
    {
        return LoadedFrames[CurrentFrameIndex];
    }
    return FReplayFrame();
}

float UReplayController::GetPlaybackDuration() const
{
    if (LoadedFrames.Num() > 0)
    {
        return LoadedFrames.Last().Timestamp;
    }
    return 0.0f;
}

void UReplayController::TickPlayback(float DeltaTime)
{
    if (!IsPlaying() || LoadedFrames.Num() == 0) return;

    CurrentPlaybackTime += DeltaTime * PlaybackSpeed;

    const float TotalDuration = GetPlaybackDuration();
    if (CurrentPlaybackTime >= TotalDuration)
    {
        CurrentPlaybackTime = TotalDuration;
        PausePlayback();
    }

    CurrentPlaybackTime = FMath::Max(0.0f, CurrentPlaybackTime);
    CurrentFrameIndex = FindFrameIndexAtTime(CurrentPlaybackTime);

    OnPlaybackTimeChanged.Broadcast(CurrentPlaybackTime);

    if (LoadedFrames.IsValidIndex(CurrentFrameIndex))
    {
        OnReplayFrameLoaded.Broadcast(LoadedFrames[CurrentFrameIndex]);
    }
}

bool UReplayController::LoadReplaySession(const FString& FilePath)
{
    TArray<FReplayFrame> Frames;
    FReplaySessionInfo Info;

    if (DeserializeReplay(FilePath, Frames, Info))
    {
        LoadedFrames = MoveTemp(Frames);
        ReplayCache.Add(Info.SessionId, Info);
        return true;
    }

    return false;
}

TArray<FReplaySessionInfo> UReplayController::GetAvailableReplays()
{
    UpdateReplayCache();

    TArray<FReplaySessionInfo> Result;
    ReplayCache.GenerateValueArray(Result);

    Result.Sort([](const FReplaySessionInfo& A, const FReplaySessionInfo& B) {
        return A.RecordTime > B.RecordTime;
    });

    return Result;
}

bool UReplayController::DeleteReplay(const FString& SessionId)
{
    FReplaySessionInfo Info = GetReplayInfo(SessionId);
    if (Info.SessionId.IsEmpty()) return false;

    const FString FilePath = GenerateReplayFilePath(Info.SessionName);
    IPlatformFile& FileManager = FPlatformFileManager::Get().GetPlatformFile();

    if (FileManager.FileExists(*FilePath))
    {
        FileManager.DeleteFile(*FilePath);
    }

    ReplayCache.Remove(SessionId);
    return true;
}

FReplaySessionInfo UReplayController::GetReplayInfo(const FString& SessionId) const
{
    const FReplaySessionInfo* Found = ReplayCache.Find(SessionId);
    return Found ? *Found : FReplaySessionInfo();
}

void UReplayController::AddBookmark(float Time, const FString& Description)
{
    Bookmarks.Add(Time, Description);
}

TArray<FString> UReplayController::GetBookmarkDescriptions() const
{
    TArray<FString> Result;
    Bookmarks.GenerateValueArray(Result);
    return Result;
}

void UReplayController::JumpToBookmark(int32 BookmarkIndex)
{
    TArray<float> Times;
    Bookmarks.GenerateKeyArray(Times);

    if (Times.IsValidIndex(BookmarkIndex))
    {
        SeekToTime(Times[BookmarkIndex]);
    }
}

TArray<FClientOperationRecord> UReplayController::GetViolationsInRange(float StartTime, float EndTime) const
{
    TArray<FClientOperationRecord> Result;

    for (const FReplayFrame& Frame : LoadedFrames)
    {
        if (Frame.Timestamp < StartTime || Frame.Timestamp > EndTime) continue;

        for (const FClientOperationRecord& Op : Frame.Operations)
        {
            if (Op.bViolation)
            {
                Result.Add(Op);
            }
        }
    }

    return Result;
}

float UReplayController::GetAverageSpeedInRange(float StartTime, float EndTime, const FString& TrainId) const
{
    float TotalSpeed = 0.0f;
    int32 Count = 0;

    for (const FReplayFrame& Frame : LoadedFrames)
    {
        if (Frame.Timestamp < StartTime || Frame.Timestamp > EndTime) continue;

        for (const FTrainNetworkState& Train : Frame.TrainStates)
        {
            if (Train.TrainId == TrainId)
            {
                TotalSpeed += Train.CurrentSpeed;
                Count++;
                break;
            }
        }
    }

    return Count > 0 ? TotalSpeed / Count : 0.0f;
}

int32 UReplayController::FindFrameIndexAtTime(float Time) const
{
    if (LoadedFrames.Num() == 0) return 0;
    if (Time <= LoadedFrames[0].Timestamp) return 0;
    if (Time >= LoadedFrames.Last().Timestamp) return LoadedFrames.Num() - 1;

    int32 Low = 0;
    int32 High = LoadedFrames.Num() - 1;

    while (Low <= High)
    {
        const int32 Mid = (Low + High) / 2;
        if (LoadedFrames[Mid].Timestamp < Time)
        {
            Low = Mid + 1;
        }
        else if (LoadedFrames[Mid].Timestamp > Time)
        {
            High = Mid - 1;
        }
        else
        {
            return Mid;
        }
    }

    return FMath::Max(0, High);
}

FString UReplayController::GenerateReplayFilePath(const FString& SessionName) const
{
    return ReplaySaveDirectory / SessionName + TEXT(".rts");
}

bool UReplayController::SerializeReplay(const FString& FilePath, const TArray<FReplayFrame>& Frames, const FReplaySessionInfo& Info)
{
    FBufferArchive Ar;

    Ar << Frames.Num();
    for (const FReplayFrame& Frame : Frames)
    {
        Ar << Frame.Timestamp;
        Ar << Frame.TrainStates.Num();
        for (const FTrainNetworkState& Train : Frame.TrainStates)
        {
            Ar << Train.TrainId;
            Ar << Train.Position.X << Train.Position.Y << Train.Position.Z;
            Ar << Train.Rotation.Pitch << Train.Rotation.Yaw << Train.Rotation.Roll;
            Ar << Train.CurrentSpeed;
        }
        Ar << Frame.SignalStates.Num();
        for (const FSignalNetworkState& Sig : Frame.SignalStates)
        {
            Ar << Sig.SignalId;
            uint8 Aspect = static_cast<uint8>(Sig.CurrentAspect);
            Ar << Aspect;
            Ar << Sig.bIsActive;
        }
    }

    return FFileHelper::SaveArrayToFile(Ar, *FilePath);
}

bool UReplayController::DeserializeReplay(const FString& FilePath, TArray<FReplayFrame>& OutFrames, FReplaySessionInfo& OutInfo)
{
    TArray<uint8> FileData;
    if (!FFileHelper::LoadFileToArray(FileData, *FilePath))
    {
        return false;
    }

    FMemoryReader Ar(FileData, true);

    int32 FrameCount = 0;
    Ar << FrameCount;
    OutFrames.SetNum(FrameCount);

    for (int32 i = 0; i < FrameCount; ++i)
    {
        FReplayFrame& Frame = OutFrames[i];
        Ar << Frame.Timestamp;

        int32 TrainCount = 0;
        Ar << TrainCount;
        Frame.TrainStates.SetNum(TrainCount);
        for (int32 j = 0; j < TrainCount; ++j)
        {
            FTrainNetworkState& Train = Frame.TrainStates[j];
            Ar << Train.TrainId;
            Ar << Train.Position.X << Train.Position.Y << Train.Position.Z;
            Ar << Train.Rotation.Pitch << Train.Rotation.Yaw << Train.Rotation.Roll;
            Ar << Train.CurrentSpeed;
        }

        int32 SignalCount = 0;
        Ar << SignalCount;
        Frame.SignalStates.SetNum(SignalCount);
        for (int32 j = 0; j < SignalCount; ++j)
        {
            FSignalNetworkState& Sig = Frame.SignalStates[j];
            Ar << Sig.SignalId;
            uint8 Aspect;
            Ar << Aspect;
            Sig.CurrentAspect = static_cast<ESignalAspect>(Aspect);
            Ar << Sig.bIsActive;
        }
    }

    return true;
}

void UReplayController::UpdateReplayCache()
{
    ReplayCache.Empty();

    IPlatformFile& FileManager = FPlatformFileManager::Get().GetPlatformFile();
    TArray<FString> Files;
    FileManager.FindFiles(Files, *ReplaySaveDirectory, TEXT("*.rts"));

    for (const FString& File : Files)
    {
        FReplaySessionInfo Info;
        Info.SessionId = FGuid::NewGuid().ToString();
        Info.SessionName = FPaths::GetBaseFilename(File);
        Info.FileSizeBytes = FileManager.FileSize(*(ReplaySaveDirectory / File));
        ReplayCache.Add(Info.SessionId, Info);
    }
}
