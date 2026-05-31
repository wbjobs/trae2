
#include "RailTransitGameMode.h"
#include "RailTransitGameInstance.h"
#include "Database/TrainingDatabaseManager.h"
#include "Track/TrackSceneBuilder.h"
#include "Track/TrackSegment.h"
#include "Train/TrainPawn.h"
#include "Signal/SignalMachine.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "TimerManager.h"
#include "Kismet/GameplayStatics.h"

ARailTransitGameMode::ARailTransitGameMode()
{
    PrimaryActorTick.bCanEverTick = true;
    TrainingDurationMinutes = 30.0f;
    bAutoStartTraining = true;
    bCleanupDatabaseOnStart = true;
    DataRetentionDaysOverride = 0;
    ElapsedTrainingTime = 0.0f;
    bTrainingInProgress = false;
    bPaused = false;
    SimulationTickRate = 0.016f;
    TrackSceneBuilder = nullptr;
}

void ARailTransitGameMode::BeginPlay()
{
    Super::BeginPlay();

    BuildTrackScene();
    RegisterWorldObjects();

    GetWorldTimerManager().SetTimer(
        SimulationTimerHandle,
        this,
        &ARailTransitGameMode::RunSimulationStep,
        SimulationTickRate,
        true
    );

    if (bAutoStartTraining)
    {
        StartTraining();
    }
}

void ARailTransitGameMode::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    if (bTrainingInProgress && !bPaused)
    {
        ElapsedTrainingTime += DeltaSeconds;
        CheckTrainingComplete();
    }

    URailTransitGameInstance* GI = GetGameInstance<URailTransitGameInstance>();
    if (GI)
    {
        GI->TickGameInstance(DeltaSeconds);
    }
}

void ARailTransitGameMode::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    Super::EndPlay(EndPlayReason);

    GetWorldTimerManager().ClearTimer(SimulationTimerHandle);

    if (bTrainingInProgress)
    {
        StopTraining();
    }
}

void ARailTransitGameMode::StartTraining()
{
    if (bTrainingInProgress) return;

    URailTransitGameInstance* GI = GetGameInstance<URailTransitGameInstance>();
    if (bCleanupDatabaseOnStart && GI)
    {
        UTrainingDatabaseManager* DbManager = GI->GetSubsystem<UTrainingDatabaseManager>();
        if (DbManager && DbManager->IsDatabaseConnected())
        {
            UE_LOG(LogTemp, Log, TEXT("Performing database cleanup before training start..."));
            FCleanupStatistics TotalStats;
            if (DataRetentionDaysOverride > 0)
            {
                FCleanupStatistics ExpiredStats = DbManager->RemoveExpiredData(DataRetentionDaysOverride);
                TotalStats.ExpiredScoresRemoved = ExpiredStats.ExpiredScoresRemoved;
                TotalStats.ExpiredRecordsRemoved = ExpiredStats.ExpiredRecordsRemoved;
            }
            FCleanupStatistics InvalidStats = DbManager->RemoveInvalidData();
            TotalStats.InvalidScoresRemoved = InvalidStats.InvalidScoresRemoved;
            TotalStats.InvalidRecordsRemoved = InvalidStats.InvalidRecordsRemoved;
            FCleanupStatistics OrphanStats = DbManager->RemoveOrphanedRecords();
            TotalStats.OrphanedRecordsRemoved = OrphanStats.OrphanedRecordsRemoved;
            
            const int32 TotalRemoved = TotalStats.InvalidScoresRemoved + TotalStats.InvalidRecordsRemoved +
                                    TotalStats.ExpiredScoresRemoved + TotalStats.ExpiredRecordsRemoved +
                                    TotalStats.OrphanedRecordsRemoved;
            UE_LOG(LogTemp, Log, TEXT("Database cleanup completed: Removed %d records"), TotalRemoved);
        }
    }

    ElapsedTrainingTime = 0.0f;
    bTrainingInProgress = true;
    bPaused = false;

    if (GI)
    {
        GI->StartTrainingSession(TEXT("STUDENT_001"), TEXT("学员"));
        GI->BroadcastSystemMessage(TEXT("实训已开始，请遵守信号规则，安全驾驶！"));
    }

    SpawnTrains(2);
    PlaceSignalMachines();

    if (GI && GI->GetSubsystem<USignalLinkageController>())
    {
        GI->GetSubsystem<USignalLinkageController>()->BuildSignalChain();
        GI->GetSubsystem<USignalLinkageController>()->UpdateAllLinkages();
    }
}

void ARailTransitGameMode::PauseTraining()
{
    bPaused = true;
}

void ARailTransitGameMode::ResumeTraining()
{
    bPaused = false;
}

void ARailTransitGameMode::StopTraining()
{
    if (!bTrainingInProgress) return;

    bTrainingInProgress = false;
    bPaused = false;

    URailTransitGameInstance* GI = GetGameInstance<URailTransitGameInstance>();
    if (GI)
    {
        GI->EndTrainingSession();
        GI->BroadcastSystemMessage(TEXT("实训已结束，成绩已保存"));
    }

    EvaluateTrainingPerformance();
}

void ARailTransitGameMode::BuildTrackScene()
{
    URailTransitGameInstance* GI = GetGameInstance<URailTransitGameInstance>();
    if (!GI) return;

    TArray<AActor*> FoundScenes;
    UGameplayStatics::GetAllActorsOfClass(GetWorld(), ATrackSceneBuilder::StaticClass(), FoundScenes);

    if (FoundScenes.Num() > 0)
    {
        TrackSceneBuilder = Cast<ATrackSceneBuilder>(FoundScenes[0]);
    }

    if (!TrackSceneBuilder)
    {
        FActorSpawnParameters Params;
        TrackSceneBuilder = GetWorld()->SpawnActor<ATrackSceneBuilder>(Params);
    }

    if (TrackSceneBuilder)
    {
        const FString Stations[] = {
            TEXT("车站A"), TEXT("车站B"), TEXT("车站C"),
            TEXT("车站D"), TEXT("车站E"), TEXT("车站F")
        };

        for (int32 i = 0; i < 6; ++i)
        {
            TrackSceneBuilder->BuildStationSection(Stations[i], 2000.0f);
        }

        TrackSceneBuilder->bLoopLine = true;
        TrackSceneBuilder->BuildFullLine();

        for (ATrackSegment* Seg : TrackSceneBuilder->TrackSegments)
        {
            GI->RegisterTrack(Seg);
        }
    }
}

void ARailTransitGameMode::SpawnTrains(int32 NumTrains)
{
    URailTransitGameInstance* GI = GetGameInstance<URailTransitGameInstance>();
    if (!GI || !TrackSceneBuilder || TrackSceneBuilder->TrackSegments.Num() == 0) return;

    for (int32 i = 0; i < NumTrains; ++i)
    {
        FActorSpawnParameters Params;
        ATrainPawn* Train = GetWorld()->SpawnActor<ATrainPawn>(Params);
        if (Train)
        {
            Train->TrainId = FString::Printf(TEXT("TRAIN_%02d"), i + 1);
            Train->TrainNumber = FString::Printf(TEXT("%d01"), i + 1);

            const int32 SegIndex = (i * 3) % TrackSceneBuilder->TrackSegments.Num();
            ATrackSegment* StartSeg = TrackSceneBuilder->TrackSegments[SegIndex];

            TArray<ATrackSegment*> Route = TrackSceneBuilder->GetRouteBetweenStations(
                StartSeg->bHasPlatform ? StartSeg->PlatformName : TEXT("车站A"),
                TEXT("车站F")
            );

            if (Route.Num() == 0)
            {
                Route = TrackSceneBuilder->TrackSegments;
            }

            Train->SetRoute(Route);
            Train->Dynamics.TargetSpeed = 60.0f;
            Train->SetActorLocation(StartSeg->GetWorldPositionAtDistance(0.0f));
            Train->SetActorRotation(StartSeg->GetWorldRotationAtDistance(0.0f));

            ActiveTrains.Add(Train);
            GI->RegisterTrain(Train);

            if (i == 0)
            {
                APlayerController* PC = GetWorld()->GetFirstPlayerController();
                if (PC)
                {
                    PC->Possess(Train);
                }
            }
        }
    }
}

void ARailTransitGameMode::PlaceSignalMachines()
{
    URailTransitGameInstance* GI = GetGameInstance<URailTransitGameInstance>();
    if (!GI || !TrackSceneBuilder) return;

    for (ATrackSegment* Seg : TrackSceneBuilder->TrackSegments)
    {
        if (!Seg) continue;

        FActorSpawnParameters Params;
        ASignalMachine* Signal = GetWorld()->SpawnActor<ASignalMachine>(Params);
        if (Signal)
        {
            Signal->SignalId = FString::Printf(TEXT("SIG_%s"), *Seg->SectionId);
            Signal->ProtectedTrack = Seg;
            Signal->SetActorLocation(Seg->GetWorldPositionAtDistance(50.0f) + FVector(0, 200, 100));

            const FRotator SignalRot = Seg->GetWorldRotationAtDistance(50.0f) + FRotator(0, -90, 0);
            Signal->SetActorRotation(SignalRot);

            ActiveSignals.Add(Signal);
            GI->RegisterSignal(Signal);
        }
    }
}

void ARailTransitGameMode::RunSimulationStep(float DeltaTime)
{
    if (bPaused) return;

    URailTransitGameInstance* GI = GetGameInstance<URailTransitGameInstance>();
    if (!GI) return;

    if (GI->IsClientMode() && GI->WebSocketClient)
    {
        const FServerGlobalState State = GI->WebSocketClient->GetLatestGlobalState();
        UpdateTrainsFromGlobalState(State);
        UpdateSignalsFromGlobalState(State);
        UpdateTracksFromGlobalState(State);
    }

    if (GI->IsServerMode() || GI->IsStandaloneMode())
    {
        USignalLinkageController* SignalCtrl = GI->SignalController;
        if (SignalCtrl)
        {
            for (ATrainPawn* Train : ActiveTrains)
            {
                if (!Train || !Train->CurrentTrack) continue;

                if (Train->Dynamics.CurrentSpeed > 5.0f)
                {
                    SignalCtrl->HandleTrainOccupyingSection(Train->CurrentTrack);
                }
                else
                {
                    SignalCtrl->HandleTrainClearingSection(Train->CurrentTrack);
                }

                if (Train->NextSignalAhead)
                {
                    if (Train->DistanceToNextSignal < 50.0f && Train->Dynamics.CurrentSpeed > 1.0f)
                    {
                        SignalCtrl->HandleTrainPassed(Train->NextSignalAhead);

                        if (Train->NextSignalAhead->CurrentAspect == ESignalAspect::Red)
                        {
                            FClientOperationRecord Rec;
                            Rec.OperationId = FGuid::NewGuid().ToString();
                            Rec.ClientId = TEXT("Server");
                            Rec.TrainId = Train->TrainId;
                            Rec.OperationType = TEXT("SignalViolation_RedLight");
                            Rec.OperationValue = Train->GetCurrentSpeedKmh();
                            Rec.Timestamp = FPlatformTime::Seconds();
                            Rec.RelatedSignalId = Train->NextSignalAhead->SignalId;
                            Rec.bViolation = true;
                            Rec.ViolationDescription = FString::Printf(TEXT("闯红灯: 速度 %.1f km/h"), Train->GetCurrentSpeedKmh());

                            GI->DatabaseManager->RecordOperationAndEvaluate(Rec);
                        }
                    }
                    else if (Train->DistanceToNextSignal < 300.0f)
                    {
                        SignalCtrl->HandleTrainApproaching(Train->NextSignalAhead);
                    }
                }

                if (GI->DatabaseManager && Train->CurrentTrack)
                {
                    const float Limit = Train->CurrentTrack->SpeedLimit;
                    if (Train->GetCurrentSpeedKmh() > Limit * 1.1f)
                    {
                        FClientOperationRecord Rec;
                        Rec.OperationId = FGuid::NewGuid().ToString();
                        Rec.ClientId = TEXT("Server");
                        Rec.TrainId = Train->TrainId;
                        Rec.OperationType = TEXT("SpeedViolation_OverLimit");
                        Rec.OperationValue = (Train->GetCurrentSpeedKmh() - Limit) / Limit * 100.0f;
                        Rec.Timestamp = FPlatformTime::Seconds();
                        Rec.RelatedSignalId = FString();
                        Rec.bViolation = true;
                        Rec.ViolationDescription = FString::Printf(
                            TEXT("超速: 当前 %.1f km/h, 限速 %.1f km/h, 超速 %.1f%%"),
                            Train->GetCurrentSpeedKmh(), Limit, Rec.OperationValue
                        );

                        GI->DatabaseManager->RecordOperationAndEvaluate(Rec);
                    }
                }

                Train->FollowSignalInstruction();
            }

            SignalCtrl->UpdateAllLinkages();
        }

        SyncGlobalStateToServer();
    }
}

void ARailTransitGameMode::EvaluateTrainingPerformance()
{
    URailTransitGameInstance* GI = GetGameInstance<URailTransitGameInstance>();
    if (!GI || !GI->DatabaseManager) return;

    for (ATrainPawn* Train : ActiveTrains)
    {
        if (!Train) continue;
        GI->DatabaseManager->CalculateTrainingScore(TEXT("STUDENT_001"), GI->CurrentSessionId);
    }
}

float ARailTransitGameMode::GetRemainingTrainingTime() const
{
    const float TotalSeconds = TrainingDurationMinutes * 60.0f;
    return FMath::Max(0.0f, TotalSeconds - ElapsedTrainingTime);
}

float ARailTransitGameMode::GetTrainingProgressPercent() const
{
    const float TotalSeconds = TrainingDurationMinutes * 60.0f;
    if (TotalSeconds <= 0.0f) return 0.0f;
    return FMath::Clamp(ElapsedTrainingTime / TotalSeconds * 100.0f, 0.0f, 100.0f);
}

void ARailTransitGameMode::BeginTrainingImpl()
{
}

void ARailTransitGameMode::EndTrainingImpl()
{
}

void ARailTransitGameMode::RegisterWorldObjects()
{
    URailTransitGameInstance* GI = GetGameInstance<URailTransitGameInstance>();
    if (!GI) return;

    for (TActorIterator<ASignalMachine> It(GetWorld()); It; ++It)
    {
        ASignalMachine* Sig = *It;
        if (Sig && !ActiveSignals.Contains(Sig))
        {
            ActiveSignals.Add(Sig);
            GI->RegisterSignal(Sig);
        }
    }

    for (TActorIterator<ATrainPawn> It(GetWorld()); It; ++It)
    {
        ATrainPawn* Train = *It;
        if (Train && !ActiveTrains.Contains(Train))
        {
            ActiveTrains.Add(Train);
            GI->RegisterTrain(Train);
        }
    }
}

void ARailTransitGameMode::UpdateSignalsFromGlobalState(const FServerGlobalState& State)
{
    for (const FSignalNetworkState& SigState : State.SignalStates)
    {
        for (ASignalMachine* Sig : ActiveSignals)
        {
            if (Sig && Sig->SignalId == SigState.SignalId)
            {
                if (Sig->CurrentAspect != SigState.CurrentAspect)
                {
                    Sig->ForceAspect(SigState.CurrentAspect);
                }
                Sig->bIsActivated = SigState.bIsActivated;
                Sig->bIsFailed = SigState.bIsFailed;
                break;
            }
        }
    }
}

void ARailTransitGameMode::UpdateTrainsFromGlobalState(const FServerGlobalState& State)
{
    for (const FTrainNetworkState& TrainState : State.TrainStates)
    {
        for (ATrainPawn* Train : ActiveTrains)
        {
            if (Train && Train->TrainId == TrainState.TrainId)
            {
                if (!TrainState.Position.IsZero())
                {
                    Train->SetActorLocation(TrainState.Position);
                    Train->SetActorRotation(TrainState.Rotation);
                }
                Train->Dynamics.CurrentSpeed = TrainState.CurrentSpeed;
                Train->Dynamics.TargetSpeed = TrainState.TargetSpeed;
                Train->TrainState = TrainState.TrainState;
                Train->DoorState = TrainState.DoorState;
                Train->DistanceOnCurrentTrack = TrainState.DistanceOnSection;
                break;
            }
        }
    }
}

void ARailTransitGameMode::UpdateTracksFromGlobalState(const FServerGlobalState& State)
{
    if (!TrackSceneBuilder) return;

    for (const FTrackNetworkState& TrackState : State.TrackStates)
    {
        ATrackSegment* Seg = TrackSceneBuilder->FindTrackBySectionId(TrackState.SectionId);
        if (Seg)
        {
            Seg->SwitchPosition = TrackState.SwitchPosition;
        }
    }
}

void ARailTransitGameMode::SyncGlobalStateToServer()
{
    URailTransitGameInstance* GI = GetGameInstance<URailTransitGameInstance>();
    if (!GI || !GI->WebSocketServer || !TrackSceneBuilder) return;

    for (ATrackSegment* Seg : TrackSceneBuilder->TrackSegments)
    {
        if (!Seg) continue;

        FTrackNetworkState State;
        State.SectionId = Seg->SectionId;
        State.bIsOccupied = false;
        State.OccupyingTrainId = FString();

        for (ATrainPawn* Train : ActiveTrains)
        {
            if (Train && Train->CurrentTrack == Seg)
            {
                State.bIsOccupied = true;
                State.OccupyingTrainId = Train->TrainId;
                break;
            }
        }

        State.SwitchPosition = Seg->SwitchPosition;
        GI->WebSocketServer->RegisterTrackState(State);
    }
}

void ARailTransitGameMode::CheckTrainingComplete()
{
    if (ElapsedTrainingTime >= TrainingDurationMinutes * 60.0f)
    {
        StopTraining();
    }
}
