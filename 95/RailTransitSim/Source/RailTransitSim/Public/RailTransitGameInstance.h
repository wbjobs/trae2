
#pragma once

#include "CoreMinimal.h"
#include "Engine/GameInstance.h"
#include "Network/WebSocketClient.h"
#include "Network/WebSocketServer.h"
#include "Signal/SignalLinkageController.h"
#include "Train/DispatchRuleEngine.h"
#include "Database/TrainingDatabaseManager.h"
#include "RailTransitGameInstance.generated.h"

UENUM(BlueprintType)
enum class EGameModeType : uint8
{
    Standalone,
    Server,
    Client
};

UCLASS()
class RAILTRANSITSIM_API URailTransitGameInstance : public UGameInstance
{
    GENERATED_BODY()

public:
    URailTransitGameInstance();

    virtual void Init() override;
    virtual void Shutdown() override;

    UPROPERTY(BlueprintReadOnly, Category = "GameInstance")
    EGameModeType GameModeType;

    UPROPERTY(BlueprintReadOnly, Category = "GameInstance")
    UWebSocketClient* WebSocketClient;

    UPROPERTY(BlueprintReadOnly, Category = "GameInstance")
    UWebSocketServer* WebSocketServer;

    UPROPERTY(BlueprintReadOnly, Category = "GameInstance")
    USignalLinkageController* SignalController;

    UPROPERTY(BlueprintReadOnly, Category = "GameInstance")
    UDispatchRuleEngine* DispatchEngine;

    UPROPERTY(BlueprintReadOnly, Category = "GameInstance")
    UTrainingDatabaseManager* DatabaseManager;

    UPROPERTY(BlueprintReadOnly, Category = "GameInstance")
    class UReplayController* ReplayController;

    UPROPERTY(BlueprintReadOnly, Category = "GameInstance")
    class UNetworkQualityManager* NetworkQualityManager;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Network")
    FString DefaultServerAddress;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Network")
    int32 DefaultServerPort;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Database")
    FString DefaultDatabasePath;

    UPROPERTY(BlueprintReadOnly, Category = "GameInstance")
    FString CurrentSessionId;

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void StartAsServer(int32 Port);

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void StartAsClient(const FString& ServerAddress, int32 Port, const FString& StudentId, const FString& StudentName);

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void StartAsStandalone();

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void StopNetwork();

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void TickGameInstance(float DeltaTime);

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void StartTrainingSession(const FString& StudentId, const FString& StudentName);

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void EndTrainingSession();

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void RegisterTrain(class ATrainPawn* Train);

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void RegisterSignal(class ASignalMachine* Signal);

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void RegisterTrack(class ATrackSegment* Track);

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void RecordTrainInput(class ATrainPawn* Train, float Throttle, float Brake, bool bEmergencyBrake);

    UFUNCTION(BlueprintCallable, Category = "GameInstance")
    void BroadcastSystemMessage(const FString& Message);

    UFUNCTION(BlueprintPure, Category = "GameInstance")
    bool IsServerMode() const { return GameModeType == EGameModeType::Server; }

    UFUNCTION(BlueprintPure, Category = "GameInstance")
    bool IsClientMode() const { return GameModeType == EGameModeType::Client; }

    UFUNCTION(BlueprintPure, Category = "GameInstance")
    bool IsStandaloneMode() const { return GameModeType == EGameModeType::Standalone; }

private:
    FTimerHandle TickTimerHandle;

    void BindNetworkEvents();
    void OnClientConnected(const FString& ClientId);
    void OnClientDisconnected(const FString& ClientId);
    void OnClientAuthenticated(const FString& ClientId);
    void OnOperationRecorded(const FClientOperationRecord& Record);
    void OnGlobalStateReceived(const FServerGlobalState& State);
    void OnAuthResultReceived(const FClientAuthResponse& Response);
    void OnScoreUpdateReceived(const FServerScoreUpdate& Update);
    void OnChatMessageReceived(const FChatMessage& Message);
    void OnDispatchOrderReceived(const FServerDispatchOrder& Order);

    void UpdateServerState();
    void UpdateClientState();

    FClientOperationRecord CreateOperationRecord(
        const FString& ClientId,
        const FString& TrainId,
        const FString& OperationType,
        float OperationValue,
        const FString& RelatedSignalId = FString(),
        bool bViolation = false,
        const FString& ViolationDesc = FString()
    );
};
