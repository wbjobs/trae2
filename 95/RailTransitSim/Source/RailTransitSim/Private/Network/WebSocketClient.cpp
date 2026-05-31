
#include "Network/WebSocketClient.h"
#include "IWebSocket.h"
#include "WebSocketsModule.h"
#include "Json.h"
#include "JsonUtilities.h"
#include "Engine/World.h"
#include "Misc/DateTime.h"

void UWebSocketClient::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    bIsConnected = false;
    ClientId = FString();
    SessionId = FGuid::NewGuid().ToString();
    StudentId = FString();
    AssignedTrainId = FString();
    LatencyMs = 0;
    NextMessageId = 1;
    NextInputSequence = 1;
    LastPingTime = 0.0;
    LastPongTime = 0.0;
    ServerTimeEstimate = 0.0;
    ServerStartTime = 0.0;
    LastReceivedStateVersion = 0;
    ConsecutiveDroppedStates = 0;
    TotalDroppedStates = 0;
    TotalReceivedStates = 0;
    InterpolationDelaySeconds = 0.1f;
    MaxBufferSize = 20;
    MaxPositionErrorThreshold = 500.0f;
    bEnablePositionExtrapolation = true;
}

void UWebSocketClient::Deinitialize()
{
    if (WebSocket.IsValid() && WebSocket->IsConnected())
    {
        WebSocket->Close();
    }
    Super::Deinitialize();
}

bool UWebSocketClient::Connect(const FString& ServerAddress, int32 Port)
{
    if (!FModuleManager::Get().IsModuleLoaded("WebSockets"))
    {
        FModuleManager::Get().LoadModule("WebSockets");
    }

    const FString Url = FString::Printf(TEXT("ws://%s:%d"), *ServerAddress, Port);
    WebSocket = FWebSocketsModule::Get().CreateWebSocket(Url, FString());

    if (!WebSocket.IsValid())
    {
        OnConnectionError.Broadcast(TEXT("Failed to create WebSocket"));
        return false;
    }

    WebSocket->OnConnected().AddUObject(this, &UWebSocketClient::HandleWebSocketConnected);
    WebSocket->OnConnectionError().AddUObject(this, &UWebSocketClient::HandleWebSocketError);
    WebSocket->OnClosed().AddUObject(this, &UWebSocketClient::HandleWebSocketDisconnected);
    WebSocket->OnMessage().AddUObject(this, &UWebSocketClient::HandleWebSocketMessage);

    WebSocket->Connect();
    return true;
}

void UWebSocketClient::Disconnect()
{
    if (WebSocket.IsValid() && WebSocket->IsConnected())
    {
        FNetworkHeader Header;
        Header.MessageType = ENetworkMessageType::ClientDisconnect;
        Header.SenderId = ClientId;
        FString Message = SerializeMessage(ENetworkMessageType::ClientDisconnect, nullptr);
        SendSerializedMessage(Message);

        WebSocket->Close();
    }
    bIsConnected = false;
}

bool UWebSocketClient::Authenticate(const FString& InStudentId, const FString& StudentName, const FString& Password, const FString& Role)
{
    if (!bIsConnected || !WebSocket.IsValid()) return false;

    StudentId = InStudentId;

    FClientAuthRequest Request;
    Request.StudentId = InStudentId;
    Request.StudentName = StudentName;
    Request.Password = Password;
    Request.Role = Role;

    FString Message = SerializeMessage(ENetworkMessageType::ClientAuthRequest, &Request);
    return SendSerializedMessage(Message);
}

bool UWebSocketClient::SendClientInput(const FClientInput& Input)
{
    if (!bIsConnected || !WebSocket.IsValid()) return false;

    FClientInput InputWithSeq = Input;
    InputWithSeq.InputSequence = NextInputSequence++;
    FString Message = SerializeMessage(ENetworkMessageType::ClientInput, &InputWithSeq);
    return SendSerializedMessage(Message);
}

bool UWebSocketClient::SendOperationRecord(const FClientOperationRecord& Record)
{
    if (!bIsConnected || !WebSocket.IsValid()) return false;
    FString Message = SerializeMessage(ENetworkMessageType::ClientOperationRecord, &Record);
    return SendSerializedMessage(Message);
}

bool UWebSocketClient::SendChatMessage(const FChatMessage& Message)
{
    if (!bIsConnected || !WebSocket.IsValid()) return false;
    FString Data = SerializeMessage(ENetworkMessageType::ServerChatMessage, &Message);
    return SendSerializedMessage(Data);
}

void UWebSocketClient::RequestGlobalState()
{
    if (!bIsConnected || !WebSocket.IsValid()) return;
    FString Message = SerializeMessage(ENetworkMessageType::ClientStateRequest, nullptr);
    SendSerializedMessage(Message);
}

void UWebSocketClient::TickClient(float DeltaTime)
{
    if (!bIsConnected || !WebSocket.IsValid()) return;

    const double CurrentTime = FPlatformTime::Seconds();
    if (CurrentTime - LastPingTime > 2.0)
    {
        SendPing();
    }

    InterpolateAllTrainStates();
    CleanupOldBufferStates();
    ProcessOutgoingQueue();
}

FVector UWebSocketClient::GetInterpolatedTrainPosition(const FString& TrainId) const
{
    const FTrainStateBuffer* Buffer = TrainStateBuffers.Find(TrainId);
    if (Buffer && Buffer->StateBuffer.Num() >= 2)
    {
        return Buffer->InterpolatedState.Position;
    }
    return FVector::ZeroVector;
}

FRotator UWebSocketClient::GetInterpolatedTrainRotation(const FString& TrainId) const
{
    const FTrainStateBuffer* Buffer = TrainStateBuffers.Find(TrainId);
    if (Buffer && Buffer->StateBuffer.Num() >= 2)
    {
        return Buffer->InterpolatedState.Rotation;
    }
    return FRotator::ZeroRotator;
}

float UWebSocketClient::GetInterpolatedTrainSpeed(const FString& TrainId) const
{
    const FTrainStateBuffer* Buffer = TrainStateBuffers.Find(TrainId);
    if (Buffer && Buffer->StateBuffer.Num() >= 2)
    {
        return Buffer->InterpolatedState.Speed;
    }
    return 0.0f;
}

bool UWebSocketClient::HasValidState(const FString& TrainId) const
{
    const FTrainStateBuffer* Buffer = TrainStateBuffers.Find(TrainId);
    return Buffer && Buffer->StateBuffer.Num() >= 2;
}

float UWebSocketClient::GetSynchronizationHealth() const
{
    if (TotalReceivedStates == 0) return 100.0f;

    const float DropRate = static_cast<float>(TotalDroppedStates) / static_cast<float>(TotalReceivedStates);
    const float BufferHealth = CalculateBufferHealth();

    return FMath::Clamp((1.0f - DropRate) * BufferHealth * 100.0f, 0.0f, 100.0f);
}

void UWebSocketClient::ResetSynchronization()
{
    TrainStateBuffers.Empty();
    SignalStateCache.Empty();
    SignalStateSequences.Empty();
    TrackStateCache.Empty();
    LastReceivedStateVersion = 0;
    ConsecutiveDroppedStates = 0;
    TotalDroppedStates = 0;
    TotalReceivedStates = 0;
}

FString UWebSocketClient::SerializeMessage(ENetworkMessageType Type, const void* Payload)
{
    FNetworkHeader Header;
    Header.MessageType = Type;
    Header.MessageId = NextMessageId++;
    Header.SenderId = ClientId;
    Header.SessionId = SessionId;
    Header.Timestamp = FPlatformTime::Seconds();
    Header.PayloadSize = 0;
    Header.SequenceNumber = NextInputSequence;

    TSharedPtr<FJsonObject> JsonObject = MakeShareable(new FJsonObject());
    JsonObject->SetNumberField(TEXT("MessageType"), static_cast<int32>(Header.MessageType));
    JsonObject->SetNumberField(TEXT("MessageId"), Header.MessageId);
    JsonObject->SetStringField(TEXT("SenderId"), Header.SenderId);
    JsonObject->SetStringField(TEXT("SessionId"), Header.SessionId);
    JsonObject->SetNumberField(TEXT("Timestamp"), Header.Timestamp);
    JsonObject->SetNumberField(TEXT("SequenceNumber"), Header.SequenceNumber);

    TSharedPtr<FJsonObject> PayloadObj = MakeShareable(new FJsonObject());

    switch (Type)
    {
    case ENetworkMessageType::ClientAuthRequest:
    {
        const FClientAuthRequest* Req = static_cast<const FClientAuthRequest*>(Payload);
        if (Req)
        {
            PayloadObj->SetStringField(TEXT("StudentId"), Req->StudentId);
            PayloadObj->SetStringField(TEXT("StudentName"), Req->StudentName);
            PayloadObj->SetStringField(TEXT("Password"), Req->Password);
            PayloadObj->SetStringField(TEXT("Role"), Req->Role);
        }
        break;
    }
    case ENetworkMessageType::ClientInput:
    {
        const FClientInput* Input = static_cast<const FClientInput*>(Payload);
        if (Input)
        {
            PayloadObj->SetStringField(TEXT("TrainId"), Input->TrainId);
            PayloadObj->SetNumberField(TEXT("ThrottleInput"), Input->ThrottleInput);
            PayloadObj->SetNumberField(TEXT("BrakeInput"), Input->BrakeInput);
            PayloadObj->SetBoolField(TEXT("bEmergencyBrake"), Input->bEmergencyBrake);
            PayloadObj->SetBoolField(TEXT("bDoorOpen"), Input->bDoorOpen);
            PayloadObj->SetBoolField(TEXT("bDoorClose"), Input->bDoorClose);
            PayloadObj->SetNumberField(TEXT("TargetSpeed"), Input->TargetSpeed);
            PayloadObj->SetNumberField(TEXT("InputSequence"), Input->InputSequence);
        }
        break;
    }
    case ENetworkMessageType::ClientOperationRecord:
    {
        const FClientOperationRecord* Rec = static_cast<const FClientOperationRecord*>(Payload);
        if (Rec)
        {
            PayloadObj->SetStringField(TEXT("OperationId"), Rec->OperationId);
            PayloadObj->SetStringField(TEXT("ClientId"), Rec->ClientId);
            PayloadObj->SetStringField(TEXT("TrainId"), Rec->TrainId);
            PayloadObj->SetStringField(TEXT("OperationType"), Rec->OperationType);
            PayloadObj->SetNumberField(TEXT("OperationValue"), Rec->OperationValue);
            PayloadObj->SetNumberField(TEXT("Timestamp"), Rec->Timestamp);
            PayloadObj->SetStringField(TEXT("RelatedSignalId"), Rec->RelatedSignalId);
            PayloadObj->SetBoolField(TEXT("bViolation"), Rec->bViolation);
            PayloadObj->SetStringField(TEXT("ViolationDescription"), Rec->ViolationDescription);
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
    case ENetworkMessageType::ClientStateRequest:
    case ENetworkMessageType::Ping:
    case ENetworkMessageType::ClientDisconnect:
        break;
    default:
        break;
    }

    JsonObject->SetObjectField(TEXT("Payload"), PayloadObj);

    FString OutputString;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutputString);
    FJsonSerializer::Serialize(JsonObject.ToSharedRef(), Writer);
    return OutputString;
}

void UWebSocketClient::DeserializeMessage(const FString& Message)
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
    case ENetworkMessageType::ClientAuthResponse:
    {
        FClientAuthResponse Response;
        Response.bSuccess = Payload->GetBoolField(TEXT("bSuccess"));
        Response.ClientId = Payload->GetStringField(TEXT("ClientId"));
        Response.AssignedTrainId = Payload->GetStringField(TEXT("AssignedTrainId"));
        Response.ErrorMessage = Payload->GetStringField(TEXT("ErrorMessage"));
        Response.ServerStartTime = Payload->GetNumberField(TEXT("ServerStartTime"));

        const TArray<TSharedPtr<FJsonValue>>* Clients;
        if (Payload->TryGetArrayField(TEXT("ActiveClientIds"), Clients))
        {
            for (const auto& Val : *Clients)
            {
                Response.ActiveClientIds.Add(Val->AsString());
            }
        }
        HandleAuthResponse(Response);
        break;
    }
    case ENetworkMessageType::ServerGlobalState:
    {
        FServerGlobalState State;
        State.ServerTimestamp = Payload->GetNumberField(TEXT("ServerTimestamp"));
        State.SimulationTime = Payload->GetNumberField(TEXT("SimulationTime"));
        State.ActiveClientCount = Payload->GetIntegerField(TEXT("ActiveClientCount"));
        State.StateVersion = Payload->GetIntegerField(TEXT("StateVersion"));

        const TArray<TSharedPtr<FJsonValue>>* Trains;
        if (Payload->TryGetArrayField(TEXT("TrainStates"), Trains))
        {
            for (const auto& Val : *Trains)
            {
                const TSharedPtr<FJsonObject> TrainObj = Val->AsObject();
                FTrainNetworkState T;
                T.TrainId = TrainObj->GetStringField(TEXT("TrainId"));
                T.CurrentSpeed = TrainObj->GetNumberField(TEXT("CurrentSpeed"));
                T.TargetSpeed = TrainObj->GetNumberField(TEXT("TargetSpeed"));
                T.TrainState = static_cast<ETrainState>(TrainObj->GetIntegerField(TEXT("TrainState")));
                T.DoorState = static_cast<EDoorState>(TrainObj->GetIntegerField(TEXT("DoorState")));
                T.CurrentSectionId = TrainObj->GetStringField(TEXT("CurrentSectionId"));
                T.DistanceOnSection = TrainObj->GetNumberField(TEXT("DistanceOnSection"));
                T.ControllingClientId = TrainObj->GetStringField(TEXT("ControllingClientId"));
                T.StateSequence = TrainObj->GetIntegerField(TEXT("StateSequence"));
                T.StateTimestamp = TrainObj->GetNumberField(TEXT("StateTimestamp"));

                const TArray<TSharedPtr<FJsonValue>>* PosArr;
                if (TrainObj->TryGetArrayField(TEXT("Position"), PosArr) && PosArr->Num() == 3)
                {
                    T.Position = FVector(
                        (*PosArr)[0]->AsNumber(),
                        (*PosArr)[1]->AsNumber(),
                        (*PosArr)[2]->AsNumber()
                    );
                }

                const TArray<TSharedPtr<FJsonValue>>* RotArr;
                if (TrainObj->TryGetArrayField(TEXT("Rotation"), RotArr) && RotArr->Num() == 3)
                {
                    T.Rotation = FRotator(
                        (*RotArr)[0]->AsNumber(),
                        (*RotArr)[1]->AsNumber(),
                        (*RotArr)[2]->AsNumber()
                    );
                }

                const TArray<TSharedPtr<FJsonValue>>* VelArr;
                if (TrainObj->TryGetArrayField(TEXT("Velocity"), VelArr) && VelArr->Num() == 3)
                {
                    T.Velocity = FVector(
                        (*VelArr)[0]->AsNumber(),
                        (*VelArr)[1]->AsNumber(),
                        (*VelArr)[2]->AsNumber()
                    );
                }

                State.TrainStates.Add(T);
            }
        }

        const TArray<TSharedPtr<FJsonValue>>* Signals;
        if (Payload->TryGetArrayField(TEXT("SignalStates"), Signals))
        {
            for (const auto& Val : *Signals)
            {
                const TSharedPtr<FJsonObject> SigObj = Val->AsObject();
                FSignalNetworkState S;
                S.SignalId = SigObj->GetStringField(TEXT("SignalId"));
                S.CurrentAspect = static_cast<ESignalAspect>(SigObj->GetIntegerField(TEXT("CurrentAspect")));
                S.bIsActivated = SigObj->GetBoolField(TEXT("bIsActivated"));
                S.bIsFailed = SigObj->GetBoolField(TEXT("bIsFailed"));
                S.ProtectedSectionId = SigObj->GetStringField(TEXT("ProtectedSectionId"));
                S.StateSequence = SigObj->GetIntegerField(TEXT("StateSequence"));
                S.StateTimestamp = SigObj->GetNumberField(TEXT("StateTimestamp"));
                S.NextSignalId = SigObj->GetStringField(TEXT("NextSignalId"));
                S.bForcedByInterlock = SigObj->GetBoolField(TEXT("bForcedByInterlock"));
                State.SignalStates.Add(S);
            }
        }

        const TArray<TSharedPtr<FJsonValue>>* Tracks;
        if (Payload->TryGetArrayField(TEXT("TrackStates"), Tracks))
        {
            for (const auto& Val : *Tracks)
            {
                const TSharedPtr<FJsonObject> TrackObj = Val->AsObject();
                FTrackNetworkState T;
                T.SectionId = TrackObj->GetStringField(TEXT("SectionId"));
                T.bIsOccupied = TrackObj->GetBoolField(TEXT("bIsOccupied"));
                T.OccupyingTrainId = TrackObj->GetStringField(TEXT("OccupyingTrainId"));
                T.SwitchPosition = TrackObj->GetIntegerField(TEXT("SwitchPosition"));
                T.OccupiedSince = TrackObj->GetNumberField(TEXT("OccupiedSince"));
                T.StateSequence = TrackObj->GetIntegerField(TEXT("StateSequence"));
                State.TrackStates.Add(T);
            }
        }

        HandleGlobalState(State);
        break;
    }
    case ENetworkMessageType::ServerStateCorrection:
    {
        FStateCorrection Correction;
        Correction.ClientId = Payload->GetStringField(TEXT("ClientId"));
        Correction.TrainId = Payload->GetStringField(TEXT("TrainId"));
        Correction.PositionError = Payload->GetNumberField(TEXT("PositionError"));
        Correction.CorrectedSpeed = Payload->GetNumberField(TEXT("CorrectedSpeed"));
        Correction.Reason = Payload->GetStringField(TEXT("Reason"));

        const TArray<TSharedPtr<FJsonValue>>* PosArr;
        if (Payload->TryGetArrayField(TEXT("CorrectedPosition"), PosArr) && PosArr->Num() == 3)
        {
            Correction.CorrectedPosition = FVector(
                (*PosArr)[0]->AsNumber(),
                (*PosArr)[1]->AsNumber(),
                (*PosArr)[2]->AsNumber()
            );
        }

        const TArray<TSharedPtr<FJsonValue>>* RotArr;
        if (Payload->TryGetArrayField(TEXT("CorrectedRotation"), RotArr) && RotArr->Num() == 3)
        {
            Correction.CorrectedRotation = FRotator(
                (*RotArr)[0]->AsNumber(),
                (*RotArr)[1]->AsNumber(),
                (*RotArr)[2]->AsNumber()
            );
        }

        HandleStateCorrection(Correction);
        break;
    }
    case ENetworkMessageType::ServerScoreUpdate:
    {
        FServerScoreUpdate Update;
        Update.ClientId = Payload->GetStringField(TEXT("ClientId"));
        Update.CurrentScore = Payload->GetNumberField(TEXT("CurrentScore"));
        Update.ScoreChange = Payload->GetNumberField(TEXT("ScoreChange"));
        Update.Reason = Payload->GetStringField(TEXT("Reason"));

        const TArray<TSharedPtr<FJsonValue>>* Penalties;
        if (Payload->TryGetArrayField(TEXT("PenaltyDescriptions"), Penalties))
        {
            for (const auto& Val : *Penalties)
            {
                Update.PenaltyDescriptions.Add(Val->AsString());
            }
        }

        HandleScoreUpdate(Update);
        break;
    }
    case ENetworkMessageType::ServerDispatchOrder:
    {
        FServerDispatchOrder Order;
        Order.OrderId = Payload->GetStringField(TEXT("OrderId"));
        Order.TargetTrainId = Payload->GetStringField(TEXT("TargetTrainId"));
        Order.Command = Payload->GetStringField(TEXT("Command"));
        Order.TargetStation = Payload->GetStringField(TEXT("TargetStation"));
        Order.TargetSpeed = Payload->GetNumberField(TEXT("TargetSpeed"));
        Order.ScheduledTime = Payload->GetNumberField(TEXT("ScheduledTime"));
        HandleDispatchOrder(Order);
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
        HandleChatMessage(Chat);
        break;
    }
    case ENetworkMessageType::Pong:
        HandlePong();
        break;
    default:
        break;
    }
}

bool UWebSocketClient::SendSerializedMessage(const FString& Message)
{
    if (!WebSocket.IsValid() || !WebSocket->IsConnected()) return false;
    WebSocket->Send(Message);
    return true;
}

void UWebSocketClient::HandleWebSocketConnected()
{
    bIsConnected = true;
    SessionId = FGuid::NewGuid().ToString();
    OnConnected.Broadcast(ClientId);
}

void UWebSocketClient::HandleWebSocketDisconnected()
{
    bIsConnected = false;
    OnDisconnected.Broadcast(ClientId);
}

void UWebSocketClient::HandleWebSocketError(const FString& Error)
{
    bIsConnected = false;
    OnConnectionError.Broadcast(Error);
}

void UWebSocketClient::HandleWebSocketMessage(const FString& Message)
{
    DeserializeMessage(Message);
}

void UWebSocketClient::HandleAuthResponse(const FClientAuthResponse& Response)
{
    if (Response.bSuccess)
    {
        ClientId = Response.ClientId;
        AssignedTrainId = Response.AssignedTrainId;
        ServerStartTime = Response.ServerStartTime;
        ServerTimeEstimate = ServerStartTime;
        ResetSynchronization();
    }
    OnAuthResultReceived.Broadcast(Response);
}

void UWebSocketClient::HandleGlobalState(const FServerGlobalState& State)
{
    TotalReceivedStates++;

    if (State.StateVersion < LastReceivedStateVersion)
    {
        ConsecutiveDroppedStates++;
        TotalDroppedStates++;
        return;
    }

    if (State.StateVersion > LastReceivedStateVersion + 1)
    {
        TotalDroppedStates += (State.StateVersion - LastReceivedStateVersion - 1);
    }

    ConsecutiveDroppedStates = 0;
    LastReceivedStateVersion = State.StateVersion;
    ServerTimeEstimate = State.ServerTimestamp;

    for (const FTrainNetworkState& TrainState : State.TrainStates)
    {
        UpdateTrainStateBuffer(TrainState);
    }

    for (const FSignalNetworkState& SignalState : State.SignalStates)
    {
        UpdateSignalState(SignalState);
    }

    for (const FTrackNetworkState& TrackState : State.TrackStates)
    {
        TrackStateCache.Add(TrackState.SectionId, TrackState);
    }

    LatestState = State;
    OnGlobalStateReceived.Broadcast(State);
}

void UWebSocketClient::HandleStateCorrection(const FStateCorrection& Correction)
{
    OnStateCorrectionReceived.Broadcast(Correction);

    if (Correction.PositionError > MaxPositionErrorThreshold)
    {
        FTrainStateBuffer* Buffer = TrainStateBuffers.Find(Correction.TrainId);
        if (Buffer)
        {
            Buffer->StateBuffer.Empty();
            FBufferedTrainState NewState;
            NewState.Position = Correction.CorrectedPosition;
            NewState.Rotation = Correction.CorrectedRotation;
            NewState.Speed = Correction.CorrectedSpeed;
            NewState.Timestamp = FPlatformTime::Seconds();
            NewState.Sequence = 0;
            Buffer->StateBuffer.Add(NewState);
        }
    }
}

void UWebSocketClient::HandleScoreUpdate(const FServerScoreUpdate& Update)
{
    OnScoreUpdateReceived.Broadcast(Update);
}

void UWebSocketClient::HandleChatMessage(const FChatMessage& Message)
{
    OnChatMessageReceived.Broadcast(Message);
}

void UWebSocketClient::HandleDispatchOrder(const FServerDispatchOrder& Order)
{
    OnDispatchOrderReceived.Broadcast(Order);
}

void UWebSocketClient::HandlePong()
{
    LastPongTime = FPlatformTime::Seconds();
    LatencyMs = FMath::RoundToInt((LastPongTime - LastPingTime) * 1000.0);
}

void UWebSocketClient::SendPing()
{
    LastPingTime = FPlatformTime::Seconds();
    FString Message = SerializeMessage(ENetworkMessageType::Ping, nullptr);
    SendSerializedMessage(Message);
}

void UWebSocketClient::ProcessOutgoingQueue()
{
    TSharedPtr<FString> Msg;
    while (OutgoingMessageQueue.Dequeue(Msg) && Msg.IsValid())
    {
        SendSerializedMessage(*Msg);
    }
}

void UWebSocketClient::UpdateTrainStateBuffer(const FTrainNetworkState& ServerState)
{
    FTrainStateBuffer& Buffer = TrainStateBuffers.FindOrAdd(ServerState.TrainId);

    if (Buffer.StateBuffer.Num() > 0 && ServerState.StateSequence <= Buffer.LastReceivedSequence)
    {
        return;
    }

    FBufferedTrainState Buffered;
    Buffered.Position = ServerState.Position;
    Buffered.Rotation = ServerState.Rotation;
    Buffered.Velocity = ServerState.Velocity;
    Buffered.Speed = ServerState.CurrentSpeed;
    Buffered.Timestamp = ServerState.StateTimestamp;
    Buffered.Sequence = ServerState.StateSequence;

    Buffer.StateBuffer.Add(Buffered);
    Buffer.LastReceivedSequence = ServerState.StateSequence;
    Buffer.LastServerTime = ServerState.StateTimestamp;

    while (Buffer.StateBuffer.Num() > MaxBufferSize)
    {
        Buffer.StateBuffer.RemoveAt(0);
    }
}

void UWebSocketClient::InterpolateAllTrainStates()
{
    const double InterpolationTime = GetInterpolatedServerTime();

    for (auto& Pair : TrainStateBuffers)
    {
        FTrainStateBuffer& Buffer = Pair.Value;

        if (Buffer.StateBuffer.Num() < 2)
        {
            if (Buffer.StateBuffer.Num() == 1)
            {
                Buffer.InterpolatedState = Buffer.StateBuffer[0];
            }
            continue;
        }

        int32 FromIndex = -1;
        int32 ToIndex = -1;

        for (int32 i = 0; i < Buffer.StateBuffer.Num() - 1; ++i)
        {
            if (Buffer.StateBuffer[i].Timestamp <= InterpolationTime &&
                Buffer.StateBuffer[i + 1].Timestamp >= InterpolationTime)
            {
                FromIndex = i;
                ToIndex = i + 1;
                break;
            }
        }

        if (FromIndex >= 0 && ToIndex >= 0)
        {
            Buffer.InterpolatedState = InterpolateBetweenStates(
                Buffer.StateBuffer[FromIndex],
                Buffer.StateBuffer[ToIndex],
                InterpolationTime
            );
        }
        else if (bEnablePositionExtrapolation && Buffer.StateBuffer.Num() >= 2)
        {
            const FBufferedTrainState& Last = Buffer.StateBuffer.Last();
            const FBufferedTrainState& PrevLast = Buffer.StateBuffer[Buffer.StateBuffer.Num() - 2];
            const double TimeDelta = FMath::Max(InterpolationTime - Last.Timestamp, 0.0);

            Buffer.InterpolatedState.Position = Last.Position + Last.Velocity * TimeDelta;
            Buffer.InterpolatedState.Rotation = Last.Rotation;
            Buffer.InterpolatedState.Speed = Last.Speed;
        }
    }
}

FBufferedTrainState UWebSocketClient::InterpolateBetweenStates(
    const FBufferedTrainState& From,
    const FBufferedTrainState& To,
    double InterpolationTime
) const
{
    FBufferedTrainState Result;

    const double TimeRange = To.Timestamp - From.Timestamp;
    if (TimeRange <= 0.0)
    {
        return To;
    }

    const double Alpha = (InterpolationTime - From.Timestamp) / TimeRange;
    const float AlphaF = static_cast<float>(FMath::Clamp(Alpha, 0.0, 1.0));

    Result.Position = FMath::Lerp(From.Position, To.Position, AlphaF);
    Result.Rotation = FMath::Lerp(From.Rotation, To.Rotation, AlphaF);
    Result.Velocity = FMath::Lerp(From.Velocity, To.Velocity, AlphaF);
    Result.Speed = FMath::Lerp(From.Speed, To.Speed, AlphaF);
    Result.Timestamp = InterpolationTime;
    Result.Sequence = From.Sequence;

    return Result;
}

void UWebSocketClient::UpdateSignalState(const FSignalNetworkState& ServerState)
{
    ValidateSignalStateOrder(ServerState);
    SignalStateCache.Add(ServerState.SignalId, ServerState);
}

void UWebSocketClient::ValidateSignalStateOrder(const FSignalNetworkState& NewState)
{
    int32* LastSeq = SignalStateSequences.Find(NewState.SignalId);

    if (LastSeq && NewState.StateSequence <= *LastSeq)
    {
        return;
    }

    SignalStateSequences.Add(NewState.SignalId, NewState.StateSequence);
}

double UWebSocketClient::GetInterpolatedServerTime() const
{
    const double LocalNow = FPlatformTime::Seconds();
    const double OneWayLatency = static_cast<double>(LatencyMs) / 2000.0;
    return ServerTimeEstimate + (LocalNow - LastPongTime) - InterpolationDelaySeconds + OneWayLatency;
}

void UWebSocketClient::CleanupOldBufferStates()
{
    const double CurrentTime = FPlatformTime::Seconds();
    const double CutoffTime = CurrentTime - 5.0;

    for (auto& Pair : TrainStateBuffers)
    {
        FTrainStateBuffer& Buffer = Pair.Value;

        while (Buffer.StateBuffer.Num() > 2 && Buffer.StateBuffer[1].Timestamp < CutoffTime)
        {
            Buffer.StateBuffer.RemoveAt(0);
        }
    }
}

bool UWebSocketClient::IsStateValid(const FString& TrainId) const
{
    const FTrainStateBuffer* Buffer = TrainStateBuffers.Find(TrainId);
    return Buffer && Buffer->StateBuffer.Num() >= 2;
}

float UWebSocketClient::CalculateBufferHealth() const
{
    if (TrainStateBuffers.Num() == 0) return 1.0f;

    float TotalHealth = 0.0f;
    for (const auto& Pair : TrainStateBuffers)
    {
        const FTrainStateBuffer& Buffer = Pair.Value;
        TotalHealth += FMath::Min(static_cast<float>(Buffer.StateBuffer.Num()) / 4.0f, 1.0f);
    }

    return TotalHealth / static_cast<float>(TrainStateBuffers.Num());
}
