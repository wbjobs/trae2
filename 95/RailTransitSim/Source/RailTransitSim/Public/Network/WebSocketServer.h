
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Containers/Map.h"
#include "NetworkMessageProtocol.h"
#include "Train/TrainPawn.h"
#include "Signal/SignalMachine.h"
#include "WebSocketServer.generated.h"

class IWebSocket;

USTRUCT()
struct FConnectedClient
{
    GENERATED_BODY()

    UPROPERTY()
    FString ClientId;

    UPROPERTY()
    FString StudentId;

    UPROPERTY()
    FString StudentName;

    UPROPERTY()
    FString Role;

    UPROPERTY()
    FString AssignedTrainId;

    UPROPERTY()
    bool bAuthenticated;

    UPROPERTY()
    double LastPingTime;

    UPROPERTY()
    int32 LatencyMs;

    TSharedPtr<IWebSocket> Connection;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnClientConnectedServer, const FString&, ClientId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnClientDisconnectedServer, const FString&, ClientId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnClientAuthenticated, const FString&, ClientId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnClientOperationRecorded, const FClientOperationRecord&, Record);

UCLASS()
class RAILTRANSITSIM_API UWebSocketServer : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    UPROPERTY(BlueprintReadOnly, Category = "WebSocketServer")
    bool bIsRunning;

    UPROPERTY(BlueprintReadOnly, Category = "WebSocketServer")
    int32 ListenPort;

    UPROPERTY(BlueprintReadOnly, Category = "WebSocketServer")
    int32 ConnectedClientCount;

    UPROPERTY(BlueprintReadOnly, Category = "WebSocketServer")
    double ServerTime;

    UPROPERTY(BlueprintReadOnly, Category = "WebSocketServer")
    float SimulationTime;

    UPROPERTY()
    TMap<FString, FConnectedClient> ConnectedClients;

    UPROPERTY()
    FServerGlobalState GlobalState;

    UPROPERTY(BlueprintAssignable, Category = "WebSocketServer|Events")
    FOnClientConnectedServer OnClientConnected;

    UPROPERTY(BlueprintAssignable, Category = "WebSocketServer|Events")
    FOnClientDisconnectedServer OnClientDisconnected;

    UPROPERTY(BlueprintAssignable, Category = "WebSocketServer|Events")
    FOnClientAuthenticated OnClientAuthenticated;

    UPROPERTY(BlueprintAssignable, Category = "WebSocketServer|Events")
    FOnClientOperationRecorded OnOperationRecorded;

    UFUNCTION(BlueprintCallable, Category = "WebSocketServer")
    bool StartServer(int32 Port);

    UFUNCTION(BlueprintCallable, Category = "WebSocketServer")
    void StopServer();

    UFUNCTION(BlueprintCallable, Category = "WebSocketServer")
    void TickServer(float DeltaTime);

    UFUNCTION(BlueprintCallable, Category = "WebSocketServer")
    void BroadcastGlobalState();

    UFUNCTION(BlueprintCallable, Category = "WebSocketServer")
    void BroadcastChatMessage(const FChatMessage& Message);

    UFUNCTION(BlueprintCallable, Category = "WebSocketServer")
    void SendDispatchOrder(const FServerDispatchOrder& Order);

    UFUNCTION(BlueprintCallable, Category = "WebSocketServer")
    void SendScoreUpdate(const FServerScoreUpdate& Update);

    UFUNCTION(BlueprintCallable, Category = "WebSocketServer")
    void RegisterTrainState(const FTrainNetworkState& TrainState);

    UFUNCTION(BlueprintCallable, Category = "WebSocketServer")
    void RegisterSignalState(const FSignalNetworkState& SignalState);

    UFUNCTION(BlueprintCallable, Category = "WebSocketServer")
    void RegisterTrackState(const FTrackNetworkState& TrackState);

    UFUNCTION(BlueprintCallable, Category = "WebSocketServer")
    void EmergencyStopAllClients();

    UFUNCTION(BlueprintPure, Category = "WebSocketServer")
    TArray<FString> GetConnectedClientIds() const;

private:
    TSharedPtr<IWebSocket> ServerSocket;
    TMap<TSharedPtr<IWebSocket>, FString> ConnectionToClientIdMap;
    int32 NextClientId;

    void OnIncomingConnection(TSharedPtr<IWebSocket> NewConnection);
    void HandleClientMessage(TSharedPtr<IWebSocket> Connection, const FString& Message);
    void HandleClientDisconnect(TSharedPtr<IWebSocket> Connection);

    void HandleAuthRequest(TSharedPtr<IWebSocket> Connection, const FClientAuthRequest& Request);
    void HandleClientInput(TSharedPtr<IWebSocket> Connection, const FClientInput& Input);
    void HandleOperationRecord(TSharedPtr<IWebSocket> Connection, const FClientOperationRecord& Record);
    void HandleChatMessage(TSharedPtr<IWebSocket> Connection, const FChatMessage& Message);
    void HandleStateRequest(TSharedPtr<IWebSocket> Connection);
    void HandlePing(TSharedPtr<IWebSocket> Connection);

    FString GenerateClientId();
    FString SerializeMessage(ENetworkMessageType Type, const void* Payload);
    void SendToClient(const FString& ClientId, const FString& Message);
    void BroadcastToAllClients(const FString& Message);

    void UpdateGlobalStateSnapshot();
    void CheckClientTimeouts();
    void AssignTrainToClient(FConnectedClient& Client);
};
