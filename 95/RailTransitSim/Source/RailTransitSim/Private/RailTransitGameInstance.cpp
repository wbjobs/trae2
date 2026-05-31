
#include "RailTransitGameInstance.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "Engine/Engine.h"
#include "Track/TrackSceneBuilder.h"
#include "Track/TrackSegment.h"
#include "Train/TrainPawn.h"
#include "Signal/SignalMachine.h"
#include "Replay/ReplayController.h"
#include "Network/NetworkQualityManager.h"
#include "Misc/DateTime.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"

URailTransitGameInstance::URailTransitGameInstance()
{
    GameModeType = EGameModeType::Standalone;
    DefaultServerAddress = TEXT("127.0.0.1");
    DefaultServerPort = 8080;
    DefaultDatabasePath = FPaths::ProjectSavedDir() / TEXT("TrainingDatabase.db");
    CurrentSessionId = FGuid::NewGuid().ToString();

    WebSocketClient = nullptr;
    WebSocketServer = nullptr;
    SignalController = nullptr;
    DispatchEngine = nullptr;
    DatabaseManager = nullptr;
    ReplayController = nullptr;
    NetworkQualityManager = nullptr;
}

void URailTransitGameInstance::Init()
{
    Super::Init();

    WebSocketClient = GetSubsystem<UWebSocketClient>();
    WebSocketServer = GetSubsystem<UWebSocketServer>();
    SignalController = GetSubsystem<USignalLinkageController>();
    DispatchEngine = GetSubsystem<UDispatchRuleEngine>();
    DatabaseManager = GetSubsystem<UTrainingDatabaseManager>();
    ReplayController = GetSubsystem<UReplayController>();
    NetworkQualityManager = GetSubsystem<UNetworkQualityManager>();

    if (DatabaseManager)
    {
        DatabaseManager->ConnectToDatabase(DefaultDatabasePath);
    }

    GetWorld()->GetTimerManager().SetTimer(
        TickTimerHandle,
        this,
        &URailTransitGameInstance::TickGameInstance,
        0.016f,
        true
    );

    BindNetworkEvents();
}

void URailTransitGameInstance::Shutdown()
{
    GetWorld()->GetTimerManager().ClearTimer(TickTimerHandle);

    if (DatabaseManager && DatabaseManager->IsDatabaseConnected())
    {
        DatabaseManager->DisconnectDatabase();
    }

    StopNetwork();

    Super::Shutdown();
}

void URailTransitGameInstance::StartAsServer(int32 Port)
{
    GameModeType = EGameModeType::Server;
    CurrentSessionId = FGuid::NewGuid().ToString();

    if (WebSocketServer)
    {
        WebSocketServer->StartServer(Port);
    }
}

void URailTransitGameInstance::StartAsClient(const FString& ServerAddress, int32 Port, const FString& StudentId, const FString& StudentName)
{
    GameModeType = EGameModeType::Client;
    CurrentSessionId = FGuid::NewGuid().ToString();

    if (WebSocketClient)
    {
        WebSocketClient->Connect(ServerAddress, Port);
    }
}

void URailTransitGameInstance::StartAsStandalone()
{
    GameModeType = EGameModeType::Standalone;
    CurrentSessionId = FGuid::NewGuid().ToString();
}

void URailTransitGameInstance::StopNetwork()
{
    if (WebSocketServer && WebSocketServer->bIsRunning)
    {
        WebSocketServer->StopServer();
    }
    if (WebSocketClient && WebSocketClient->bIsConnected)
    {
        WebSocketClient->Disconnect();
    }
}

void URailTransitGameInstance::TickGameInstance(float DeltaTime)
{
    if (GameModeType == EGameModeType::Server && WebSocketServer)
    {
        WebSocketServer->TickServer(DeltaTime);
        UpdateServerState();
    }

    if (GameModeType == EGameModeType::Client && WebSocketClient)
    {
        WebSocketClient->TickClient(DeltaTime);
        UpdateClientState();
    }

    if (DispatchEngine)
    {
        DispatchEngine->TickDispatch(DeltaTime);
    }

    if (ReplayController)
    {
        if (ReplayController->IsPlaying() || ReplayController->IsPaused())
        {
            ReplayController->TickPlayback(DeltaTime);
        }
    }

    if (NetworkQualityManager && (GameModeType == EGameModeType::Client || GameModeType == EGameModeType::Server))
    {
        NetworkQualityManager->TickQualityManager(DeltaTime);
    }

    if (SignalController)
    {
        SignalController->TickInterlock(DeltaTime);
    }
}

void URailTransitGameInstance::StartTrainingSession(const FString& StudentId, const FString& StudentName)
{
    CurrentSessionId = FGuid::NewGuid().ToString();

    if (DatabaseManager)
    {
        FTrainingScore Score;
        Score.ClientId = WebSocketClient ? WebSocketClient->ClientId : FGuid::NewGuid().ToString();
        Score.StudentId = StudentId;
        Score.StudentName = StudentName;
        Score.SessionId = CurrentSessionId;
        Score.StartTime = FDateTime::Now();
        Score.TotalScore = 1000.0f;
        Score.SignalComplianceScore = 200.0f;
        Score.SpeedComplianceScore = 200.0f;
        Score.ScheduleAdherenceScore = 200.0f;
        Score.SafetyScore = 200.0f;
        Score.CommunicationScore = 200.0f;
        Score.TotalViolations = 0;
        Score.TrainingDurationSeconds = 0.0f;
        Score.EndTime = FDateTime::Now();

        DatabaseManager->SaveTrainingScore(Score);
    }

    if (ReplayController)
    {
        const FString SessionName = FString::Printf(TEXT("%s_%s"), *StudentId, *FDateTime::Now().ToString(TEXT("%Y%m%d_%H%M%S")));
        ReplayController->StartRecording(SessionName);
        UE_LOG(LogTemp, Log, TEXT("Started replay recording for session: %s"), *CurrentSessionId);
    }

    FStudentProfile Profile;
    if (DatabaseManager && DatabaseManager->LoadStudentProfile(StudentId, Profile))
    {
        Profile.StudentId = StudentId;
        Profile.StudentName = StudentName;
        DatabaseManager->SaveStudentProfile(Profile);
    }
    else if (DatabaseManager)
    {
        Profile.StudentId = StudentId;
        Profile.StudentName = StudentName;
        Profile.Role = TEXT("Student");
        Profile.TrainingLevel = 1;
        Profile.AverageScore = 0.0f;
        Profile.TotalTrainingHours = 0;
        Profile.CompletedSessions = 0;
        DatabaseManager->SaveStudentProfile(Profile);
    }
}

void URailTransitGameInstance::EndTrainingSession()
{
    if (DatabaseManager && WebSocketClient)
    {
        DatabaseManager->FinalizeTrainingScore(WebSocketClient->ClientId, CurrentSessionId);
    }

    if (ReplayController && ReplayController->IsRecording())
    {
        ReplayController->StopRecording();
        ReplayController->SaveCurrentRecording();
        UE_LOG(LogTemp, Log, TEXT("Stopped replay recording for session: %s"), *CurrentSessionId);
    }
}

void URailTransitGameInstance::RegisterTrain(ATrainPawn* Train)
{
    if (!Train) return;

    if (DispatchEngine)
    {
        DispatchEngine->RegisterTrain(Train);
    }

    if (GameModeType == EGameModeType::Server && WebSocketServer)
    {
        FTrainNetworkState State;
        State.TrainId = Train->TrainId;
        State.Position = Train->GetActorLocation();
        State.Rotation = Train->GetActorRotation();
        State.CurrentSpeed = Train->Dynamics.CurrentSpeed;
        State.TargetSpeed = Train->Dynamics.TargetSpeed;
        State.TrainState = Train->TrainState;
        State.DoorState = Train->DoorState;
        if (Train->CurrentTrack)
        {
            State.CurrentSectionId = Train->CurrentTrack->SectionId;
        }
        State.DistanceOnSection = Train->DistanceOnCurrentTrack;
        WebSocketServer->RegisterTrainState(State);
    }

    Train->OnEmergencyBrake.AddUObject(this, [this, Train]() {
        FClientOperationRecord Rec = CreateOperationRecord(
            TEXT("Server"),
            Train->TrainId,
            TEXT("EmergencyBrake"),
            1.0f,
            FString(),
            false,
            TEXT("紧急制动")
        );
        RecordTrainInput(Train, 0.0f, 1.0f, true);
    });
}

void URailTransitGameInstance::RegisterSignal(ASignalMachine* Signal)
{
    if (!Signal) return;

    if (SignalController)
    {
        SignalController->RegisterSignal(Signal);
    }

    if (GameModeType == EGameModeType::Server && WebSocketServer)
    {
        FSignalNetworkState State;
        State.SignalId = Signal->SignalId;
        State.CurrentAspect = Signal->CurrentAspect;
        State.bIsActivated = Signal->bIsActivated;
        State.bIsFailed = Signal->bIsFailed;
        if (Signal->ProtectedTrack)
        {
            State.ProtectedSectionId = Signal->ProtectedTrack->SectionId;
        }
        WebSocketServer->RegisterSignalState(State);
    }

    Signal->OnAspectChanged.AddUObject(this, [this](ASignalMachine* Sig, ESignalAspect NewAspect) {
        if (WebSocketServer && IsServerMode())
        {
            FSignalNetworkState State;
            State.SignalId = Sig->SignalId;
            State.CurrentAspect = NewAspect;
            State.bIsActivated = Sig->bIsActivated;
            State.bIsFailed = Sig->bIsFailed;
            if (Sig->ProtectedTrack)
            {
                State.ProtectedSectionId = Sig->ProtectedTrack->SectionId;
            }
            WebSocketServer->RegisterSignalState(State);
        }
    });
}

void URailTransitGameInstance::RegisterTrack(ATrackSegment* Track)
{
    if (!Track) return;

    if (GameModeType == EGameModeType::Server && WebSocketServer)
    {
        FTrackNetworkState State;
        State.SectionId = Track->SectionId;
        State.bIsOccupied = false;
        State.OccupyingTrainId = FString();
        State.SwitchPosition = Track->SwitchPosition;
        WebSocketServer->RegisterTrackState(State);
    }
}

void URailTransitGameInstance::RecordTrainInput(ATrainPawn* Train, float Throttle, float Brake, bool bEmergencyBrake)
{
    if (!Train) return;

    const FString ClientId = WebSocketClient ? WebSocketClient->ClientId : TEXT("Standalone");
    const double Timestamp = FPlatformTime::Seconds();

    if (Throttle > 0.0f)
    {
        FClientOperationRecord Rec = CreateOperationRecord(ClientId, Train->TrainId, TEXT("Throttle"), Throttle);
        if (DatabaseManager)
        {
            DatabaseManager->RecordOperationAndEvaluate(Rec);
        }
        if (WebSocketClient && WebSocketClient->bIsConnected)
        {
            WebSocketClient->SendOperationRecord(Rec);
        }
    }

    if (Brake > 0.0f)
    {
        FClientOperationRecord Rec = CreateOperationRecord(ClientId, Train->TrainId, TEXT("Brake"), Brake);
        if (DatabaseManager)
        {
            DatabaseManager->RecordOperationAndEvaluate(Rec);
        }
        if (WebSocketClient && WebSocketClient->bIsConnected)
        {
            WebSocketClient->SendOperationRecord(Rec);
        }
    }

    if (bEmergencyBrake)
    {
        FClientOperationRecord Rec = CreateOperationRecord(
            ClientId,
            Train->TrainId,
            TEXT("SafetyViolation_EmergencyBrakeMisuse"),
            1.0f,
            FString(),
            true,
            TEXT("紧急制动使用")
        );
        if (DatabaseManager)
        {
            DatabaseManager->RecordOperationAndEvaluate(Rec);
        }
        if (WebSocketClient && WebSocketClient->bIsConnected)
        {
            WebSocketClient->SendOperationRecord(Rec);
        }
    }

    if (WebSocketClient && WebSocketClient->bIsConnected)
    {
        FClientInput Input;
        Input.TrainId = Train->TrainId;
        Input.ThrottleInput = Throttle;
        Input.BrakeInput = Brake;
        Input.bEmergencyBrake = bEmergencyBrake;
        Input.bDoorOpen = false;
        Input.bDoorClose = false;
        Input.TargetSpeed = Train->Dynamics.TargetSpeed;
        WebSocketClient->SendClientInput(Input);
    }
}

void URailTransitGameInstance::BroadcastSystemMessage(const FString& Message)
{
    FChatMessage Chat;
    Chat.SenderId = TEXT("SYSTEM");
    Chat.SenderName = TEXT("系统");
    Chat.Message = Message;
    Chat.Timestamp = FPlatformTime::Seconds();
    Chat.bIsSystem = true;

    if (WebSocketServer && WebSocketServer->bIsRunning)
    {
        WebSocketServer->BroadcastChatMessage(Chat);
    }

    if (WebSocketClient && WebSocketClient->bIsConnected)
    {
        WebSocketClient->SendChatMessage(Chat);
    }
}

void URailTransitGameInstance::BindNetworkEvents()
{
    if (WebSocketServer)
    {
        WebSocketServer->OnClientConnected.AddUObject(this, &URailTransitGameInstance::OnClientConnected);
        WebSocketServer->OnClientDisconnected.AddUObject(this, &URailTransitGameInstance::OnClientDisconnected);
        WebSocketServer->OnClientAuthenticated.AddUObject(this, &URailTransitGameInstance::OnClientAuthenticated);
        WebSocketServer->OnOperationRecorded.AddUObject(this, &URailTransitGameInstance::OnOperationRecorded);
    }

    if (WebSocketClient)
    {
        WebSocketClient->OnGlobalStateReceived.AddUObject(this, &URailTransitGameInstance::OnGlobalStateReceived);
        WebSocketClient->OnAuthResultReceived.AddUObject(this, &URailTransitGameInstance::OnAuthResultReceived);
        WebSocketClient->OnScoreUpdateReceived.AddUObject(this, &URailTransitGameInstance::OnScoreUpdateReceived);
        WebSocketClient->OnChatMessageReceived.AddUObject(this, &URailTransitGameInstance::OnChatMessageReceived);
        WebSocketClient->OnDispatchOrderReceived.AddUObject(this, &URailTransitGameInstance::OnDispatchOrderReceived);
    }
}

void URailTransitGameInstance::OnClientConnected(const FString& ClientId)
{
    BroadcastSystemMessage(FString::Printf(TEXT("客户端 %s 已连接"), *ClientId));
}

void URailTransitGameInstance::OnClientDisconnected(const FString& ClientId)
{
    BroadcastSystemMessage(FString::Printf(TEXT("客户端 %s 已断开连接"), *ClientId));
}

void URailTransitGameInstance::OnClientAuthenticated(const FString& ClientId)
{
    BroadcastSystemMessage(FString::Printf(TEXT("客户端 %s 认证成功"), *ClientId));
}

void URailTransitGameInstance::OnOperationRecorded(const FClientOperationRecord& Record)
{
    if (DatabaseManager)
    {
        DatabaseManager->RecordOperationAndEvaluate(Record);
    }
}

void URailTransitGameInstance::OnGlobalStateReceived(const FServerGlobalState& State)
{
}

void URailTransitGameInstance::OnAuthResultReceived(const FClientAuthResponse& Response)
{
    if (Response.bSuccess)
    {
        StartTrainingSession(Response.ClientId, FString());
        BroadcastSystemMessage(TEXT("连接成功，实训已开始"));
    }
}

void URailTransitGameInstance::OnScoreUpdateReceived(const FServerScoreUpdate& Update)
{
    if (DatabaseManager && GEngine)
    {
        GEngine->AddOnScreenDebugMessage(-1, 3.0f, FColor::Yellow,
            FString::Printf(TEXT("分数更新: %.2f (%.2f) - %s"),
                Update.CurrentScore, Update.ScoreChange, *Update.Reason));
    }
}

void URailTransitGameInstance::OnChatMessageReceived(const FChatMessage& Message)
{
    if (GEngine)
    {
        GEngine->AddOnScreenDebugMessage(-1, 5.0f, FColor::Cyan,
            FString::Printf(TEXT("[%s] %s: %s"),
                Message.bIsSystem ? TEXT("系统") : *Message.SenderName,
                *Message.SenderName, *Message.Message));
    }
}

void URailTransitGameInstance::OnDispatchOrderReceived(const FServerDispatchOrder& Order)
{
    if (GEngine)
    {
        GEngine->AddOnScreenDebugMessage(-1, 5.0f, FColor::Green,
            FString::Printf(TEXT("调度命令: %s -> %s"), *Order.Command, *Order.TargetTrainId));
    }
}

void URailTransitGameInstance::UpdateServerState()
{
    if (!WebSocketServer) return;

    for (ATrainPawn* Train : DispatchEngine->ManagedTrains)
    {
        if (!Train) continue;

        FTrainNetworkState State;
        State.TrainId = Train->TrainId;
        State.Position = Train->GetActorLocation();
        State.Rotation = Train->GetActorRotation();
        State.CurrentSpeed = Train->Dynamics.CurrentSpeed;
        State.TargetSpeed = Train->Dynamics.TargetSpeed;
        State.TrainState = Train->TrainState;
        State.DoorState = Train->DoorState;
        if (Train->CurrentTrack)
        {
            State.CurrentSectionId = Train->CurrentTrack->SectionId;
        }
        State.DistanceOnSection = Train->DistanceOnCurrentTrack;
        WebSocketServer->RegisterTrainState(State);
    }

    for (ASignalMachine* Sig : SignalController->AllSignals)
    {
        if (!Sig) continue;

        FSignalNetworkState State;
        State.SignalId = Sig->SignalId;
        State.CurrentAspect = Sig->CurrentAspect;
        State.bIsActivated = Sig->bIsActivated;
        State.bIsFailed = Sig->bIsFailed;
        if (Sig->ProtectedTrack)
        {
            State.ProtectedSectionId = Sig->ProtectedTrack->SectionId;
        }
        WebSocketServer->RegisterSignalState(State);
    }
}

void URailTransitGameInstance::UpdateClientState()
{
}

FClientOperationRecord URailTransitGameInstance::CreateOperationRecord(
    const FString& ClientId,
    const FString& TrainId,
    const FString& OperationType,
    float OperationValue,
    const FString& RelatedSignalId,
    bool bViolation,
    const FString& ViolationDesc
)
{
    FClientOperationRecord Rec;
    Rec.OperationId = FGuid::NewGuid().ToString();
    Rec.ClientId = ClientId;
    Rec.TrainId = TrainId;
    Rec.OperationType = OperationType;
    Rec.OperationValue = OperationValue;
    Rec.Timestamp = FPlatformTime::Seconds();
    Rec.SessionId = CurrentSessionId;
    Rec.RelatedSignalId = RelatedSignalId;
    Rec.bViolation = bViolation;
    Rec.ViolationDescription = ViolationDesc;
    return Rec;
}
