
#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "NetworkMessageProtocol.generated.h"

enum class ESignalAspect : uint8;
enum class ETrainState : uint8;
enum class EDoorState : uint8;

UENUM(BlueprintType)
enum class ENetworkMessageType : uint8
{
    Invalid,
    ClientAuthRequest,
    ClientAuthResponse,
    ClientInput,
    ClientStateRequest,
    ServerGlobalState,
    ServerTrainState,
    ServerSignalState,
    ServerTrackState,
    ServerChatMessage,
    ServerSystemMessage,
    ServerDispatchOrder,
    ClientOperationRecord,
    ServerScoreUpdate,
    Ping,
    Pong,
    ClientDisconnect,
    ServerStateCorrection,
    ServerDeltaState
};

USTRUCT(BlueprintType)
struct FNetworkHeader
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    ENetworkMessageType MessageType;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MessageId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SenderId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SessionId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    double Timestamp;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 PayloadSize;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 SequenceNumber;
};

USTRUCT(BlueprintType)
struct FClientAuthRequest
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString StudentId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString StudentName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Password;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Role;
};

USTRUCT(BlueprintType)
struct FClientAuthResponse
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bSuccess;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ClientId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString AssignedTrainId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ErrorMessage;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FString> ActiveClientIds;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    double ServerStartTime;
};

USTRUCT(BlueprintType)
struct FClientInput
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString TrainId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ThrottleInput;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float BrakeInput;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bEmergencyBrake;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bDoorOpen;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bDoorClose;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TargetSpeed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 InputSequence;
};

USTRUCT(BlueprintType)
struct FTrainNetworkState
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString TrainId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Position;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FRotator Rotation;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Velocity;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CurrentSpeed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TargetSpeed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    ETrainState TrainState;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EDoorState DoorState;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString CurrentSectionId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float DistanceOnSection;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ControllingClientId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 StateSequence;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    double StateTimestamp;
};

USTRUCT(BlueprintType)
struct FSignalNetworkState
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SignalId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    ESignalAspect CurrentAspect;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsActivated;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsFailed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ProtectedSectionId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 StateSequence;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    double StateTimestamp;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString NextSignalId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bForcedByInterlock;
};

USTRUCT(BlueprintType)
struct FTrackNetworkState
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SectionId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsOccupied;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString OccupyingTrainId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 SwitchPosition;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    double OccupiedSince;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 StateSequence;
};

USTRUCT(BlueprintType)
struct FServerGlobalState
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    double ServerTimestamp;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float SimulationTime;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 ActiveClientCount;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 StateVersion;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FTrainNetworkState> TrainStates;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FSignalNetworkState> SignalStates;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FTrackNetworkState> TrackStates;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FString> InvalidatedClientIds;
};

USTRUCT(BlueprintType)
struct FStateCorrection
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ClientId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString TrainId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector CorrectedPosition;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FRotator CorrectedRotation;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CorrectedSpeed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float PositionError;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Reason;
};

USTRUCT(BlueprintType)
struct FClientOperationRecord
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString OperationId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ClientId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString TrainId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString OperationType;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float OperationValue;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    double Timestamp;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SessionId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString RelatedSignalId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bViolation;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ViolationDescription;
};

USTRUCT(BlueprintType)
struct FServerScoreUpdate
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ClientId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CurrentScore;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ScoreChange;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Reason;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FString> PenaltyDescriptions;
};

USTRUCT(BlueprintType)
struct FServerDispatchOrder
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString OrderId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString TargetTrainId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Command;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString TargetStation;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TargetSpeed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    double ScheduledTime;
};

USTRUCT(BlueprintType)
struct FChatMessage
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SenderId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SenderName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Message;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    double Timestamp;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsSystem;
};

USTRUCT(BlueprintType)
struct FBufferedTrainState
{
    GENERATED_BODY()

    FVector Position;
    FRotator Rotation;
    FVector Velocity;
    float Speed;
    double Timestamp;
    int32 Sequence;
};
