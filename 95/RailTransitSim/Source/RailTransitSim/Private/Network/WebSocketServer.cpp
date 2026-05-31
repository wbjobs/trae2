
#include "Network/WebSocketServer.h"
#include "IWebSocket.h"
#include "WebSocketsModule.h"
#include "Json.h"
#include "JsonUtilities.h"
#include "Engine/World.h"
#include "Misc/DateTime.h"

void UWebSocketServer::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    bIsRunning = false;
    ListenPort = 0;
    ConnectedClientCount = 0;
    ServerTime = 0.0;
    SimulationTime = 0.0f;
    NextClientId = 1;
}

void UWebSocketServer::Deinitialize()
{
    StopServer();
    Super::Deinitialize();
}

bool UWebSocketServer::StartServer(int32 Port)
{
    if (!FModuleManager::Get().IsModuleLoaded("WebSockets"))
    {
        FModuleManager::Get().LoadModule("WebSockets");
    }

    ListenPort = Port;

    const FString Url = FString::Printf(TEXT("ws://0.0.0.0:%d"), Port);
    ServerSocket = FWebSocketsModule::Get().CreateServer(Url);

    if (!ServerSocket.IsValid())
    {
        return false;
    }

    ServerSocket->OnConnected().AddUObject(this, &UWebSocketServer::OnIncomingConnection);

    bIsRunning = true;
    return true;
}

void UWebSocketServer::StopServer()
{
    if (ServerSocket.IsValid())
    {
        ServerSocket->Close();
        ServerSocket.Reset();
    }

    for (auto& Pair : ConnectedClients)
    {
        if (Pair.Value.Connection.IsValid() && Pair.Value.Connection->IsConnected())
        {
            Pair.Value.Connection->Close();
        }
    }

    ConnectedClients.Empty();
    ConnectionToClientIdMap.Empty();
    bIsRunning = false;
    ConnectedClientCount = 0;
}

void UWebSocketServer::TickServer(float DeltaTime)
{
    if (!bIsRunning) return;

    ServerTime = FPlatformTime::Seconds();
    SimulationTime += DeltaTime;
    CheckClientTimeouts();
    BroadcastGlobalState();
}

void UWebSocketServer::BroadcastGlobalState()
{
    UpdateGlobalStateSnapshot();
    FString Message = SerializeMessage(ENetworkMessageType::ServerGlobalState, &GlobalState);
    BroadcastToAllClients(Message);
}

void UWebSocketServer::BroadcastChatMessage(const FChatMessage& Message)
{
    FString Data = SerializeMessage(ENetworkMessageType::ServerChatMessage, &Message);
    BroadcastToAllClients(Data);
}

void UWebSocketServer::SendDispatchOrder(const FServerDispatchOrder& Order)
{
    FConnectedClient* Client = ConnectedClients.FindByPredicate([&](const FConnectedClient& C) {
        return C.AssignedTrainId == Order.TargetTrainId;
    });
    if (Client && Client->Connection.IsValid())
    {
        FString Message = SerializeMessage(ENetworkMessageType::ServerDispatchOrder, &Order);
        Client->Connection->Send(Message);
    }
}

void UWebSocketServer::SendScoreUpdate(const FServerScoreUpdate& Update)
{
    FConnectedClient* Client = ConnectedClients.Find(Update.ClientId);
    if (Client && Client->Connection.IsValid())
    {
        FString Message = SerializeMessage(ENetworkMessageType::ServerScoreUpdate, &Update);
        Client->Connection->Send(Message);
    }
}

void UWebSocketServer::RegisterTrainState(const FTrainNetworkState& TrainState)
{
    for (int32 i = 0; i < GlobalState.TrainStates.Num(); ++i)
    {
        if (GlobalState.TrainStates[i].TrainId == TrainState.TrainId)
        {
            GlobalState.TrainStates[i] = TrainState;
            return;
        }
    }
    GlobalState.TrainStates.Add(TrainState);
}

void UWebSocketServer::RegisterSignalState(const FSignalNetworkState& SignalState)
{
    for (int32 i = 0; i < GlobalState.SignalStates.Num(); ++i)
    {
        if (GlobalState.SignalStates[i].SignalId == SignalState.SignalId)
        {
            GlobalState.SignalStates[i] = SignalState;
            return;
        }
    }
    GlobalState.SignalStates.Add(SignalState);
}

void UWebSocketServer::RegisterTrackState(const FTrackNetworkState& TrackState)
{
    for (int32 i = 0; i < GlobalState.TrackStates.Num(); ++i)
    {
        if (GlobalState.TrackStates[i].SectionId == TrackState.SectionId)
        {
            GlobalState.TrackStates[i] = TrackState;
            return;
        }
    }
    GlobalState.TrackStates.Add(TrackState);
}

void UWebSocketServer::EmergencyStopAllClients()
{
    FServerDispatchOrder Order;
    Order.Command = TEXT("EmergencyStop");
    Order.OrderId = FGuid::NewGuid().ToString();
    Order.ScheduledTime = ServerTime;

    for (auto& Pair : ConnectedClients)
    {
        if (Pair.Value.Connection.IsValid() && Pair.Value.bAuthenticated)
        {
            Order.TargetTrainId = Pair.Value.AssignedTrainId;
            FString Message = SerializeMessage(ENetworkMessageType::ServerDispatchOrder, &Order);
            Pair.Value.Connection->Send(Message);
        }
    }
}

TArray<FString> UWebSocketServer::GetConnectedClientIds() const
{
    TArray<FString> Ids;
    for (const auto& Pair : ConnectedClients)
    {
        Ids.Add(Pair.Key);
    }
    return Ids;
}

void UWebSocketServer::OnIncomingConnection(TSharedPtr<IWebSocket> NewConnection)
{
    if (!NewConnection.IsValid()) return;

    const FString NewClientId = GenerateClientId();

    FConnectedClient Client;
    Client.ClientId = NewClientId;
    Client.Connection = NewConnection;
    Client.bAuthenticated = false;
    Client.LastPingTime = ServerTime;
    Client.AssignedTrainId = FString::Printf(TEXT("Train_%s"), *NewClientId);

    ConnectedClients.Add(NewClientId, Client);
    ConnectionToClientIdMap.Add(NewConnection, NewClientId);
    ConnectedClientCount = ConnectedClients.Num();

    NewConnection->OnMessage().AddUObject(this, &UWebSocketServer::HandleClientMessage, NewConnection);
    NewConnection->OnClosed().AddUObject(this, &UWebSocketServer::HandleClientDisconnect, NewConnection);

    OnClientConnected.Broadcast(NewClientId);
}

void UWebSocketServer::HandleClientMessage(TSharedPtr<IWebSocket> Connection, const FString& Message)
{
    TSharedPtr<FJsonObject> JsonObject;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);
    if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
    {
        return;
    }

    const int32 MsgTypeInt = JsonObject->GetIntegerField(TEXT("MessageType"));
    const ENetworkMessageType MsgType = static_cast<ENetworkMessageType>(MsgTypeInt);
    const TSharedPtr<FJsonObject> Payload = JsonObject->GetObjectField(TEXT("Payload"));

    switch (MsgType)
    {
    case ENetworkMessageType::ClientAuthRequest:
    {
        FClientAuthRequest Request;
        Request.StudentId = Payload->GetStringField(TEXT("StudentId"));
        Request.StudentName = Payload->GetStringField(TEXT("StudentName"));
        Request.Password = Payload->GetStringField(TEXT("Password"));
        Request.Role = Payload->GetStringField(TEXT("Role"));
        HandleAuthRequest(Connection, Request);
        break;
    }
    case ENetworkMessageType::ClientInput:
    {
        FClientInput Input;
        Input.TrainId = Payload->GetStringField(TEXT("TrainId"));
        Input.ThrottleInput = Payload->GetNumberField(TEXT("ThrottleInput"));
        Input.BrakeInput = Payload->GetNumberField(TEXT("BrakeInput"));
        Input.bEmergencyBrake = Payload->GetBoolField(TEXT("bEmergencyBrake"));
        Input.bDoorOpen = Payload->GetBoolField(TEXT("bDoorOpen"));
        Input.bDoorClose = Payload->GetBoolField(TEXT("bDoorClose"));
        Input.TargetSpeed = Payload->GetNumberField(TEXT("TargetSpeed"));
        HandleClientInput(Connection, Input);
        break;
    }
    case ENetworkMessageType::ClientOperationRecord:
    {
        FClientOperationRecord Record;
        Record.OperationId = Payload->GetStringField(TEXT("OperationId"));
        Record.ClientId = Payload->GetStringField(TEXT("ClientId"));
        Record.TrainId = Payload->GetStringField(TEXT("TrainId"));
        Record.OperationType = Payload->GetStringField(TEXT("OperationType"));
        Record.OperationValue = Payload->GetNumberField(TEXT("OperationValue"));
        Record.Timestamp = Payload->GetNumberField(TEXT("Timestamp"));
        Record.RelatedSignalId = Payload->GetStringField(TEXT("RelatedSignalId"));
        Record.bViolation = Payload->GetBoolField(TEXT("bViolation"));
        Record.ViolationDescription = Payload->GetStringField(TEXT("ViolationDescription"));
        HandleOperationRecord(Connection, Record);
        break;
    }
    case ENetworkMessageType::ServerChatMessage:
    {
        FChatMessage Chat;
        Chat.SenderId = Payload->GetStringField(TEXT("SenderId"));
        Chat.SenderName = Payload->GetStringField(TEXT("SenderName"));
        Chat.Message = Payload->GetStringField(TEXT("Message"));
        Chat.Timestamp = Payload->GetNumberField(TEXT("Timestamp"));
        Chat.bIsSystem = Payload->GetBoolField(TEXT("bIsSystem"));
        HandleChatMessage(Connection, Chat);
        break;
    }
    case ENetworkMessageType::ClientStateRequest:
        HandleStateRequest(Connection);
        break;
    case ENetworkMessageType::Ping:
        HandlePing(Connection);
        break;
    case ENetworkMessageType::ClientDisconnect:
        HandleClientDisconnect(Connection);
        break;
    default:
        break;
    }
}

void UWebSocketServer::HandleClientDisconnect(TSharedPtr<IWebSocket> Connection)
{
    const FString* ClientIdPtr = ConnectionToClientIdMap.Find(Connection);
    if (!ClientIdPtr) return;

    const FString ClientId = *ClientIdPtr;
    OnClientDisconnected.Broadcast(ClientId);

    ConnectedClients.Remove(ClientId);
    ConnectionToClientIdMap.Remove(Connection);
    ConnectedClientCount = ConnectedClients.Num();
}

void UWebSocketServer::HandleAuthRequest(TSharedPtr<IWebSocket> Connection, const FClientAuthRequest& Request)
{
    const FString* ClientIdPtr = ConnectionToClientIdMap.Find(Connection);
    if (!ClientIdPtr) return;

    const FString ClientId = *ClientIdPtr;
    FConnectedClient* Client = ConnectedClients.Find(ClientId);
    if (!Client) return;

    Client->StudentId = Request.StudentId;
    Client->StudentName = Request.StudentName;
    Client->Role = Request.Role;
    Client->bAuthenticated = true;

    AssignTrainToClient(*Client);

    FClientAuthResponse Response;
    Response.bSuccess = true;
    Response.ClientId = ClientId;
    Response.AssignedTrainId = Client->AssignedTrainId;
    Response.ErrorMessage = TEXT("");

    for (const auto& Pair : ConnectedClients)
    {
        if (Pair.Value.bAuthenticated)
        {
            Response.ActiveClientIds.Add(Pair.Key);
        }
    }

    FString Message = SerializeMessage(ENetworkMessageType::ClientAuthResponse, &Response);
    Connection->Send(Message);

    OnClientAuthenticated.Broadcast(ClientId);

    FChatMessage Welcome;
    Welcome.SenderId = TEXT("SYSTEM");
    Welcome.SenderName = TEXT("系统");
    Welcome.Message = FString::Printf(TEXT("学员 %s 已连接"), *Client->StudentName);
    Welcome.Timestamp = ServerTime;
    Welcome.bIsSystem = true;
    BroadcastChatMessage(Welcome);
}

void UWebSocketServer::HandleClientInput(TSharedPtr<IWebSocket> Connection, const FClientInput& Input)
{
    const FString* ClientIdPtr = ConnectionToClientIdMap.Find(Connection);
    if (!ClientIdPtr) return;

    const FString ClientId = *ClientIdPtr;
    FConnectedClient* Client = ConnectedClients.Find(ClientId);
    if (!Client || !Client->bAuthenticated) return;

    for (int32 i = 0; i < GlobalState.TrainStates.Num(); ++i)
    {
        if (GlobalState.TrainStates[i].TrainId == Client->AssignedTrainId)
        {
            GlobalState.TrainStates[i].ControllingClientId = ClientId;
            break;
        }
    }
}

void UWebSocketServer::HandleOperationRecord(TSharedPtr<IWebSocket> Connection, const FClientOperationRecord& Record)
{
    OnOperationRecorded.Broadcast(Record);
}

void UWebSocketServer::HandleChatMessage(TSharedPtr<IWebSocket> Connection, const FChatMessage& Message)
{
    BroadcastChatMessage(Message);
}

void UWebSocketServer::HandleStateRequest(TSharedPtr<IWebSocket> Connection)
{
    UpdateGlobalStateSnapshot();
    FString Message = SerializeMessage(ENetworkMessageType::ServerGlobalState, &GlobalState);
    Connection->Send(Message);
}

void UWebSocketServer::HandlePing(TSharedPtr<IWebSocket> Connection)
{
    const FString* ClientIdPtr = ConnectionToClientIdMap.Find(Connection);
    if (!ClientIdPtr) return;

    FConnectedClient* Client = ConnectedClients.Find(*ClientIdPtr);
    if (Client)
    {
        Client->LastPingTime = ServerTime;
    }

    TSharedPtr<FJsonObject> JsonObject = MakeShareable(new FJsonObject());
    JsonObject->SetNumberField(TEXT("MessageType"), static_cast<int32>(ENetworkMessageType::Pong));
    JsonObject->SetNumberField(TEXT("MessageId"), 0);
    JsonObject->SetStringField(TEXT("SenderId"), TEXT("SERVER"));
    JsonObject->SetStringField(TEXT("SessionId"), TEXT(""));
    JsonObject->SetNumberField(TEXT("Timestamp"), ServerTime);

    TSharedPtr<FJsonObject> Payload = MakeShareable(new FJsonObject());
    JsonObject->SetObjectField(TEXT("Payload"), Payload);

    FString Output;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
    FJsonSerializer::Serialize(JsonObject.ToSharedRef(), Writer);
    Connection->Send(Output);
}

FString UWebSocketServer::GenerateClientId()
{
    return FString::Printf(TEXT("Client_%04d"), NextClientId++);
}

FString UWebSocketServer::SerializeMessage(ENetworkMessageType Type, const void* Payload)
{
    TSharedPtr<FJsonObject> JsonObject = MakeShareable(new FJsonObject());
    JsonObject->SetNumberField(TEXT("MessageType"), static_cast<int32>(Type));
    JsonObject->SetNumberField(TEXT("MessageId"), 0);
    JsonObject->SetStringField(TEXT("SenderId"), TEXT("SERVER"));
    JsonObject->SetStringField(TEXT("SessionId"), TEXT(""));
    JsonObject->SetNumberField(TEXT("Timestamp"), ServerTime);

    TSharedPtr<FJsonObject> PayloadObj = MakeShareable(new FJsonObject());

    switch (Type)
    {
    case ENetworkMessageType::ClientAuthResponse:
    {
        const FClientAuthResponse* Resp = static_cast<const FClientAuthResponse*>(Payload);
        if (Resp)
        {
            PayloadObj->SetBoolField(TEXT("bSuccess"), Resp->bSuccess);
            PayloadObj->SetStringField(TEXT("ClientId"), Resp->ClientId);
            PayloadObj->SetStringField(TEXT("AssignedTrainId"), Resp->AssignedTrainId);
            PayloadObj->SetStringField(TEXT("ErrorMessage"), Resp->ErrorMessage);

            TArray<TSharedPtr<FJsonValue>> Clients;
            for (const FString& Id : Resp->ActiveClientIds)
            {
                Clients.Add(MakeShareable(new FJsonValueString(Id)));
            }
            PayloadObj->SetArrayField(TEXT("ActiveClientIds"), Clients);
        }
        break;
    }
    case ENetworkMessageType::ServerGlobalState:
    {
        const FServerGlobalState* State = static_cast<const FServerGlobalState*>(Payload);
        if (State)
        {
            PayloadObj->SetNumberField(TEXT("ServerTimestamp"), State->ServerTimestamp);
            PayloadObj->SetNumberField(TEXT("SimulationTime"), State->SimulationTime);
            PayloadObj->SetNumberField(TEXT("ActiveClientCount"), State->ActiveClientCount);

            TArray<TSharedPtr<FJsonValue>> Trains;
            for (const FTrainNetworkState& T : State->TrainStates)
            {
                TSharedPtr<FJsonObject> TObj = MakeShareable(new FJsonObject());
                TObj->SetStringField(TEXT("TrainId"), T.TrainId);
                TObj->SetNumberField(TEXT("CurrentSpeed"), T.CurrentSpeed);
                TObj->SetNumberField(TEXT("TargetSpeed"), T.TargetSpeed);
                TObj->SetNumberField(TEXT("TrainState"), static_cast<int32>(T.TrainState));
                TObj->SetNumberField(TEXT("DoorState"), static_cast<int32>(T.DoorState));
                TObj->SetStringField(TEXT("CurrentSectionId"), T.CurrentSectionId);
                TObj->SetNumberField(TEXT("DistanceOnSection"), T.DistanceOnSection);
                TObj->SetStringField(TEXT("ControllingClientId"), T.ControllingClientId);
                Trains.Add(MakeShareable(new FJsonValueObject(TObj)));
            }
            PayloadObj->SetArrayField(TEXT("TrainStates"), Trains);

            TArray<TSharedPtr<FJsonValue>> Signals;
            for (const FSignalNetworkState& S : State->SignalStates)
            {
                TSharedPtr<FJsonObject> SObj = MakeShareable(new FJsonObject());
                SObj->SetStringField(TEXT("SignalId"), S.SignalId);
                SObj->SetNumberField(TEXT("CurrentAspect"), static_cast<int32>(S.CurrentAspect));
                SObj->SetBoolField(TEXT("bIsActivated"), S.bIsActivated);
                SObj->SetBoolField(TEXT("bIsFailed"), S.bIsFailed);
                SObj->SetStringField(TEXT("ProtectedSectionId"), S.ProtectedSectionId);
                Signals.Add(MakeShareable(new FJsonValueObject(SObj)));
            }
            PayloadObj->SetArrayField(TEXT("SignalStates"), Signals);

            TArray<TSharedPtr<FJsonValue>> Tracks;
            for (const FTrackNetworkState& T : State->TrackStates)
            {
                TSharedPtr<FJsonObject> TObj = MakeShareable(new FJsonObject());
                TObj->SetStringField(TEXT("SectionId"), T.SectionId);
                TObj->SetBoolField(TEXT("bIsOccupied"), T.bIsOccupied);
                TObj->SetStringField(TEXT("OccupyingTrainId"), T.OccupyingTrainId);
                TObj->SetNumberField(TEXT("SwitchPosition"), T.SwitchPosition);
                Tracks.Add(MakeShareable(new FJsonValueObject(TObj)));
            }
            PayloadObj->SetArrayField(TEXT("TrackStates"), Tracks);
        }
        break;
    }
    case ENetworkMessageType::ServerScoreUpdate:
    {
        const FServerScoreUpdate* Upd = static_cast<const FServerScoreUpdate*>(Payload);
        if (Upd)
        {
            PayloadObj->SetStringField(TEXT("ClientId"), Upd->ClientId);
            PayloadObj->SetNumberField(TEXT("CurrentScore"), Upd->CurrentScore);
            PayloadObj->SetNumberField(TEXT("ScoreChange"), Upd->ScoreChange);
            PayloadObj->SetStringField(TEXT("Reason"), Upd->Reason);

            TArray<TSharedPtr<FJsonValue>> Penalties;
            for (const FString& P : Upd->PenaltyDescriptions)
            {
                Penalties.Add(MakeShareable(new FJsonValueString(P)));
            }
            PayloadObj->SetArrayField(TEXT("PenaltyDescriptions"), Penalties);
        }
        break;
    }
    case ENetworkMessageType::ServerDispatchOrder:
    {
        const FServerDispatchOrder* Ord = static_cast<const FServerDispatchOrder*>(Payload);
        if (Ord)
        {
            PayloadObj->SetStringField(TEXT("OrderId"), Ord->OrderId);
            PayloadObj->SetStringField(TEXT("TargetTrainId"), Ord->TargetTrainId);
            PayloadObj->SetStringField(TEXT("Command"), Ord->Command);
            PayloadObj->SetStringField(TEXT("TargetStation"), Ord->TargetStation);
            PayloadObj->SetNumberField(TEXT("TargetSpeed"), Ord->TargetSpeed);
            PayloadObj->SetNumberField(TEXT("ScheduledTime"), Ord->ScheduledTime);
        }
        break;
    }
    case ENetworkMessageType::ServerChatMessage:
    {
        const FChatMessage* Chat = static_cast<const FChatMessage*>(Payload);
        if (Chat)
        {
            PayloadObj->SetStringField(TEXT("SenderId"), Chat->SenderId);
            PayloadObj->SetStringField(TEXT("SenderName"), Chat->SenderName);
            PayloadObj->SetStringField(TEXT("Message"), Chat->Message);
            PayloadObj->SetNumberField(TEXT("Timestamp"), Chat->Timestamp);
            PayloadObj->SetBoolField(TEXT("bIsSystem"), Chat->bIsSystem);
        }
        break;
    }
    default:
        break;
    }

    JsonObject->SetObjectField(TEXT("Payload"), PayloadObj);

    FString OutputString;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutputString);
    FJsonSerializer::Serialize(JsonObject.ToSharedRef(), Writer);
    return OutputString;
}

void UWebSocketServer::SendToClient(const FString& ClientId, const FString& Message)
{
    FConnectedClient* Client = ConnectedClients.Find(ClientId);
    if (Client && Client->Connection.IsValid() && Client->Connection->IsConnected())
    {
        Client->Connection->Send(Message);
    }
}

void UWebSocketServer::BroadcastToAllClients(const FString& Message)
{
    for (const auto& Pair : ConnectedClients)
    {
        if (Pair.Value.Connection.IsValid() && Pair.Value.Connection->IsConnected())
        {
            Pair.Value.Connection->Send(Message);
        }
    }
}

void UWebSocketServer::UpdateGlobalStateSnapshot()
{
    GlobalState.ServerTimestamp = ServerTime;
    GlobalState.SimulationTime = SimulationTime;

    int32 AuthenticatedCount = 0;
    for (const auto& Pair : ConnectedClients)
    {
        if (Pair.Value.bAuthenticated) AuthenticatedCount++;
    }
    GlobalState.ActiveClientCount = AuthenticatedCount;
}

void UWebSocketServer::CheckClientTimeouts()
{
    const double TimeoutThreshold = 30.0;
    TArray<FString> ClientsToRemove;

    for (const auto& Pair : ConnectedClients)
    {
        if (ServerTime - Pair.Value.LastPingTime > TimeoutThreshold)
        {
            ClientsToRemove.Add(Pair.Key);
        }
    }

    for (const FString& Id : ClientsToRemove)
    {
        FConnectedClient* Client = ConnectedClients.Find(Id);
        if (Client && Client->Connection.IsValid())
        {
            Client->Connection->Close();
            OnClientDisconnected.Broadcast(Id);
            ConnectionToClientIdMap.Remove(Client->Connection);
            ConnectedClients.Remove(Id);
        }
    }

    ConnectedClientCount = ConnectedClients.Num();
}

void UWebSocketServer::AssignTrainToClient(FConnectedClient& Client)
{
    FTrainNetworkState TrainState;
    TrainState.TrainId = Client.AssignedTrainId;
    TrainState.ControllingClientId = Client.ClientId;
    RegisterTrainState(TrainState);
}
