
#include "Train/DispatchRuleEngine.h"
#include "Track/TrackSegment.h"

void UDispatchRuleEngine::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
}

void UDispatchRuleEngine::Deinitialize()
{
    Super::Deinitialize();
}

void UDispatchRuleEngine::RegisterTrain(ATrainPawn* Train)
{
    if (!Train || ManagedTrains.Contains(Train)) return;
    ManagedTrains.Add(Train);
    TrainIdMap.Add(Train->TrainId, Train);
}

void UDispatchRuleEngine::UnregisterTrain(ATrainPawn* Train)
{
    if (!Train) return;
    ManagedTrains.Remove(Train);
    TrainIdMap.Remove(Train->TrainId);
}

void UDispatchRuleEngine::IssueOrder(const FDispatchOrder& Order)
{
    if (ValidateDispatchRules(Order))
    {
        PendingOrders.Add(Order);
    }
}

void UDispatchRuleEngine::CreateSchedule(const FTrainSchedule& Schedule)
{
    ActiveSchedules.Add(Schedule);
}

void UDispatchRuleEngine::ActivateSchedule(const FString& ScheduleId)
{
    for (FTrainSchedule& Sched : ActiveSchedules)
    {
        if (Sched.ScheduleId == ScheduleId)
        {
            Sched.bIsActive = true;
            break;
        }
    }
}

void UDispatchRuleEngine::ExecutePendingOrders(float CurrentTime)
{
    for (int32 i = PendingOrders.Num() - 1; i >= 0; --i)
    {
        FDispatchOrder& Order = PendingOrders[i];
        if (Order.bExecuted) continue;

        if (CurrentTime >= Order.ScheduledDepartureTime)
        {
            ATrainPawn* Train = FindTrainById(Order.TrainId);
            if (!Train) continue;

            switch (Order.Command)
            {
            case EDispatchCommand::Dispatch:
                if (Order.Route.Num() > 0)
                {
                    Train->SetRoute(Order.Route);
                    Train->Accelerate(Train->Dynamics.MaxSpeed);
                }
                break;
            case EDispatchCommand::Hold:
                Train->Stop();
                break;
            case EDispatchCommand::Terminate:
                Train->Stop();
                break;
            case EDispatchCommand::ChangeRoute:
                if (Order.Route.Num() > 0)
                {
                    Train->SetRoute(Order.Route);
                }
                break;
            case EDispatchCommand::EmergencyStop:
                Train->EmergencyBrake();
                break;
            }

            Order.bExecuted = true;
            PendingOrders.RemoveAt(i);
        }
    }
}

bool UDispatchRuleEngine::CheckRouteConflict(const TArray<ATrackSegment*>& ProposedRoute, const FString& ExcludeTrainId)
{
    for (ATrainPawn* Train : ManagedTrains)
    {
        if (!Train || Train->TrainId == ExcludeTrainId) continue;

        for (ATrackSegment* Seg : ProposedRoute)
        {
            for (ATrackSegment* TrainSeg : Train->AssignedRoute)
            {
                if (Seg == TrainSeg)
                {
                    if (Train->TrainState != ETrainState::Stopped)
                    {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

bool UDispatchRuleEngine::CanDispatchTrain(const FString& TrainId)
{
    ATrainPawn* Train = FindTrainById(TrainId);
    if (!Train) return false;
    if (Train->TrainState != ETrainState::Stopped) return false;
    if (Train->AssignedRoute.Num() == 0) return false;
    return !CheckRouteConflict(Train->AssignedRoute, TrainId);
}

void UDispatchRuleEngine::EmergencyStopAll()
{
    for (ATrainPawn* Train : ManagedTrains)
    {
        if (Train)
        {
            Train->EmergencyBrake();
        }
    }
}

ATrainPawn* UDispatchRuleEngine::FindTrainById(const FString& TrainId)
{
    ATrainPawn** Found = TrainIdMap.Find(TrainId);
    return Found ? *Found : nullptr;
}

void UDispatchRuleEngine::TickDispatch(float DeltaTime)
{
    ExecutePendingOrders(GetWorld()->GetTimeSeconds());
    UpdateScheduleProgress(DeltaTime);
    CheckScheduleAdherence();
}

bool UDispatchRuleEngine::ValidateDispatchRules(const FDispatchOrder& Order)
{
    if (Order.TrainId.IsEmpty()) return false;

    ATrainPawn* Train = FindTrainById(Order.TrainId);
    if (!Train) return false;

    if (Order.Command == EDispatchCommand::Dispatch)
    {
        if (Train->TrainState != ETrainState::Stopped) return false;
        if (Order.Route.Num() == 0) return false;
    }

    return true;
}

void UDispatchRuleEngine::UpdateScheduleProgress(float DeltaTime)
{
}

void UDispatchRuleEngine::CheckScheduleAdherence()
{
}
