
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Containers/Queue.h"
#include "Containers/RingBuffer.h"
#include "NetworkMessageProtocol.h"
#include "WebSocketClient.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnWebSocketConnected, const FString&, ConnectionId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnWebSocketDisconnected, const FString&, ConnectionId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnWebSocketConnectionError, const FString&, ErrorMessage);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGlobalStateReceived, const FServerGlobalState&, GlobalState);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnAuthResultReceived, const FClientAuthResponse&, AuthResponse);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnScoreUpdateReceived, const FServerScoreUpdate&, ScoreUpdate);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnChatMessageReceived, const FChatMessage&, ChatMessage);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnDispatchOrderReceived, const FServerDispatchOrder&, DispatchOrder);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnStateCorrectionReceived, const FStateCorrection&, Correction);

class IWebSocket;

USTRUCT()
struct FTrainStateBuffer
{
    GENERATED_BODY()

    UPROPERTY()
    FString TrainId;

    UPROPERTY()
    TArray<FBufferedTrainState> StateBuffer;

    FBufferedTrainState InterpolatedState;

    int32 LastReceivedSequence;
    double LastServerTime;
    double LocalTimeOffset;

    FTrainStateBuffer()
        : LastReceivedSequence(0)
        , LastServerTime(0.0)
        , LocalTimeOffset(0.0)
    {
    }
};

UCLASS()
class RAILTRANSITSIM_API UWebSocketClient : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    UPROPERTY(BlueprintReadOnly, Category = "WebSocket")
    bool bIsConnected;

    UPROPERTY(BlueprintReadOnly, Category = "WebSocket")
    FString ClientId;

    UPROPERTY(BlueprintReadOnly, Category = "WebSocket")
    FString SessionId;

    UPROPERTY(BlueprintReadOnly, Category = "WebSocket")
    FString StudentId;

    UPROPERTY(BlueprintReadOnly, Category = "WebSocket")
    FString AssignedTrainId;

    UPROPERTY(BlueprintReadOnly, Category = "WebSocket")
    int32 LatencyMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Synchronization")
    float InterpolationDelaySeconds;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Synchronization")
    int32 MaxBufferSize;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Synchronization")
    float MaxPositionErrorThreshold;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Synchronization")
    bool bEnablePositionExtrapolation;

    UPROPERTY(BlueprintReadOnly, Category = "Synchronization")
    double ServerTimeEstimate;

    UPROPERTY(BlueprintReadOnly, Category = "Synchronization")
    double ServerStartTime;

    UPROPERTY(BlueprintReadOnly, Category = "Synchronization")
    int32 LastReceivedStateVersion;

    UPROPERTY(BlueprintAssignable, Category = "WebSocket|Events")
    FOnWebSocketConnected OnConnected;

    UPROPERTY(BlueprintAssignable, Category = "WebSocket|Events")
    FOnWebSocketDisconnected OnDisconnected;

    UPROPERTY(BlueprintAssignable, Category = "WebSocket|Events")
    FOnWebSocketConnectionError OnConnectionError;

    UPROPERTY(BlueprintAssignable, Category = "WebSocket|Events")
    FOnGlobalStateReceived OnGlobalStateReceived;

    UPROPERTY(BlueprintAssignable, Category = "WebSocket|Events")
    FOnAuthResultReceived OnAuthResultReceived;

    UPROPERTY(BlueprintAssignable, Category = "WebSocket|Events")
    FOnScoreUpdateReceived OnScoreUpdateReceived;

    UPROPERTY(BlueprintAssignable, Category = "WebSocket|Events")
    FOnChatMessageReceived OnChatMessageReceived;

    UPROPERTY(BlueprintAssignable, Category = "WebSocket|Events")
    FOnDispatchOrderReceived OnDispatchOrderReceived;

    UPROPERTY(BlueprintAssignable, Category = "WebSocket|Events")
    FOnStateCorrectionReceived OnStateCorrectionReceived;

    UFUNCTION(BlueprintCallable, Category = "WebSocket")
    bool Connect(const FString& ServerAddress, int32 Port);

    UFUNCTION(BlueprintCallable, Category = "WebSocket")
    void Disconnect();

    UFUNCTION(BlueprintCallable, Category = "WebSocket")
    bool Authenticate(const FString& InStudentId, const FString& StudentName, const FString& Password, const FString& Role);

    UFUNCTION(BlueprintCallable, Category = "WebSocket")
    bool SendClientInput(const FClientInput& Input);

    UFUNCTION(BlueprintCallable, Category = "WebSocket")
    bool SendOperationRecord(const FClientOperationRecord& Record);

    UFUNCTION(BlueprintCallable, Category = "WebSocket")
    bool SendChatMessage(const FChatMessage& Message);

    UFUNCTION(BlueprintCallable, Category = "WebSocket")
    void RequestGlobalState();

    UFUNCTION(BlueprintCallable, Category = "WebSocket")
    void TickClient(float DeltaTime);

    UFUNCTION(BlueprintPure, Category = "WebSocket")
    FServerGlobalState GetLatestGlobalState() const { return LatestState; }

    UFUNCTION(BlueprintPure, Category = "Synchronization")
    FVector GetInterpolatedTrainPosition(const FString& TrainId) const;

    UFUNCTION(BlueprintPure, Category = "Synchronization")
    FRotator GetInterpolatedTrainRotation(const FString& TrainId) const;

    UFUNCTION(BlueprintPure, Category = "Synchronization")
    float GetInterpolatedTrainSpeed(const FString& TrainId) const;

    UFUNCTION(BlueprintPure, Category = "Synchronization")
    bool HasValidState(const FString& TrainId) const;

    UFUNCTION(BlueprintPure, Category = "Synchronization")
    float GetSynchronizationHealth() const;

    UFUNCTION(BlueprintCallable, Category = "Synchronization")
    void ResetSynchronization();

private:
    TSharedPtr<IWebSocket> WebSocket;
    int32 NextMessageId;
    int32 NextInputSequence;
    double LastPingTime;
    double LastPongTime;

    UPROPERTY()
    FServerGlobalState LatestState;

    UPROPERTY()
    TMap<FString, FTrainStateBuffer> TrainStateBuffers;

    UPROPERTY()
    TMap<FString, FSignalNetworkState> SignalStateCache;

    UPROPERTY()
    TMap<FString, int32> SignalStateSequences;

    UPROPERTY()
    TMap<FString, FTrackNetworkState> TrackStateCache;

    TQueue<TSharedPtr<FString>> OutgoingMessageQueue;

    int32 ConsecutiveDroppedStates;
    int32 TotalDroppedStates;
    int32 TotalReceivedStates;

    FString SerializeMessage(ENetworkMessageType Type, const void* Payload);
    void DeserializeMessage(const FString& Message);

    bool SendSerializedMessage(const FString& Message);

    void HandleWebSocketConnected();
    void HandleWebSocketDisconnected();
    void HandleWebSocketError(const FString& Error);
    void HandleWebSocketMessage(const FString& Message);

    void HandleAuthResponse(const FClientAuthResponse& Response);
    void HandleGlobalState(const FServerGlobalState& State);
    void HandleStateCorrection(const FStateCorrection& Correction);
    void HandleScoreUpdate(const FServerScoreUpdate& Update);
    void HandleChatMessage(const FChatMessage& Message);
    void HandleDispatchOrder(const FServerDispatchOrder& Order);
    void HandlePong();

    void SendPing();
    void ProcessOutgoingQueue();

    void UpdateTrainStateBuffer(const FTrainNetworkState& ServerState);
    void InterpolateAllTrainStates();
    FBufferedTrainState InterpolateBetweenStates(
        const FBufferedTrainState& From,
        const FBufferedTrainState& To,
        double InterpolationTime
    ) const;

    void UpdateSignalState(const FSignalNetworkState& ServerState);
    void ValidateSignalStateOrder(const FSignalNetworkState& NewState);

    double GetInterpolatedServerTime() const;
    void CleanupOldBufferStates();

    bool IsStateValid(const FString& TrainId) const;
    float CalculateBufferHealth() const;
};
