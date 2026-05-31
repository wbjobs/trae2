
#include "Database/TrainingDatabaseManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/PlatformFilemanager.h"
#include "Misc/DateTime.h"

void UTrainingDatabaseManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    Database = nullptr;
    bIsConnected = false;
    MaxTotalScore = 1000.0f;
    DatabasePath = FPaths::ProjectSavedDir() / TEXT("TrainingDatabase.db");
    DataRetentionDays = 90;
    bAutoVacuumAfterCleanup = true;
    MinValidTrainingDurationSeconds = 10.0f;
    MaxValidTrainingDurationHours = 8.0f;
}

void UTrainingDatabaseManager::Deinitialize()
{
    DisconnectDatabase();
    Super::Deinitialize();
}

bool UTrainingDatabaseManager::ConnectToDatabase(const FString& DbPath)
{
    DatabasePath = DbPath;

    const FString FullPath = FPaths::ConvertRelativePathToFull(DbPath);
    IPlatformFile& FileManager = FPlatformFileManager::Get().GetPlatformFile();
    const FString Dir = FPaths::GetPath(FullPath);
    if (!FileManager.DirectoryExists(*Dir))
    {
        FileManager.CreateDirectory(*Dir);
    }

    const int32 Result = sqlite3_open(TCHAR_TO_UTF8(*FullPath), &Database);
    if (Result != SQLITE_OK)
    {
        UE_LOG(LogTemp, Error, TEXT("Failed to open database: %s"), UTF8_TO_TCHAR(sqlite3_errmsg(Database)));
        bIsConnected = false;
        return false;
    }

    bIsConnected = true;
    InitializeDatabaseTables();
    InitializeScoringRules();
    return true;
}

void UTrainingDatabaseManager::DisconnectDatabase()
{
    if (Database)
    {
        sqlite3_close(Database);
        Database = nullptr;
        bIsConnected = false;
    }
}

bool UTrainingDatabaseManager::InitializeDatabaseTables()
{
    if (!bIsConnected || !Database) return false;

    const FString CreateScoresTable = TEXT(
        "CREATE TABLE IF NOT EXISTS TrainingScores ("
        "Id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "ClientId TEXT NOT NULL,"
        "StudentId TEXT NOT NULL,"
        "StudentName TEXT NOT NULL,"
        "SessionId TEXT NOT NULL UNIQUE,"
        "TotalScore REAL,"
        "SignalComplianceScore REAL,"
        "SpeedComplianceScore REAL,"
        "ScheduleAdherenceScore REAL,"
        "SafetyScore REAL,"
        "CommunicationScore REAL,"
        "TotalViolations INTEGER,"
        "TrainingDurationSeconds REAL,"
        "StartTime TEXT,"
        "EndTime TEXT,"
        "PenaltyDetails TEXT"
        ");"
    );

    const FString CreateRecordsTable = TEXT(
        "CREATE TABLE IF NOT EXISTS OperationRecords ("
        "Id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "OperationId TEXT NOT NULL UNIQUE,"
        "ClientId TEXT NOT NULL,"
        "TrainId TEXT NOT NULL,"
        "OperationType TEXT NOT NULL,"
        "OperationValue REAL,"
        "Timestamp REAL,"
        "SessionId TEXT,"
        "RelatedSignalId TEXT,"
        "bViolation INTEGER,"
        "ViolationDescription TEXT"
        ");"
    );

    const FString CreateStudentsTable = TEXT(
        "CREATE TABLE IF NOT EXISTS StudentProfiles ("
        "Id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "StudentId TEXT NOT NULL UNIQUE,"
        "StudentName TEXT NOT NULL,"
        "Role TEXT,"
        "Department TEXT,"
        "TrainingLevel INTEGER,"
        "AverageScore REAL,"
        "TotalTrainingHours INTEGER,"
        "CompletedSessions INTEGER,"
        "Certifications TEXT"
        ");"
    );

    const FString CreateRulesTable = TEXT(
        "CREATE TABLE IF NOT EXISTS ScoringRules ("
        "RuleId TEXT PRIMARY KEY,"
        "Description TEXT,"
        "Category TEXT,"
        "PenaltyPoints REAL,"
        "BonusPoints REAL,"
        "bCriticalViolation INTEGER,"
        "Weight REAL"
        ");"
    );

    const bool b1 = ExecuteQuery(CreateScoresTable);
    const bool b2 = ExecuteQuery(CreateRecordsTable);
    const bool b3 = ExecuteQuery(CreateStudentsTable);
    const bool b4 = ExecuteQuery(CreateRulesTable);

    return b1 && b2 && b3 && b4;
}

bool UTrainingDatabaseManager::SaveTrainingScore(const FTrainingScore& Score)
{
    if (!bIsConnected || !Database) return false;

    FString Penalties;
    for (const FString& P : Score.PenaltyDetails)
    {
        Penalties += P + TEXT("|");
    }

    const FString Query = FString::Printf(TEXT(
        "INSERT OR REPLACE INTO TrainingScores "
        "(ClientId, StudentId, StudentName, SessionId, TotalScore, "
        "SignalComplianceScore, SpeedComplianceScore, ScheduleAdherenceScore, "
        "SafetyScore, CommunicationScore, TotalViolations, TrainingDurationSeconds, "
        "StartTime, EndTime, PenaltyDetails) "
        "VALUES ('%s','%s','%s','%s',%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%d,%.2f,'%s','%s','%s');"
    ),
        *EscapeString(Score.ClientId),
        *EscapeString(Score.StudentId),
        *EscapeString(Score.StudentName),
        *EscapeString(Score.SessionId),
        Score.TotalScore,
        Score.SignalComplianceScore,
        Score.SpeedComplianceScore,
        Score.ScheduleAdherenceScore,
        Score.SafetyScore,
        Score.CommunicationScore,
        Score.TotalViolations,
        Score.TrainingDurationSeconds,
        *Score.StartTime.ToString(),
        *Score.EndTime.ToString(),
        *EscapeString(Penalties)
    );

    return ExecuteQuery(Query);
}

bool UTrainingDatabaseManager::LoadTrainingScore(const FString& SessionId, FTrainingScore& OutScore)
{
    if (!bIsConnected || !Database) return false;

    const FString Query = FString::Printf(TEXT(
        "SELECT * FROM TrainingScores WHERE SessionId = '%s';"
    ), *EscapeString(SessionId));

    return ExecuteQueryWithCallback(Query, LoadScoreCallback, &OutScore);
}

bool UTrainingDatabaseManager::SaveOperationRecord(const FClientOperationRecord& Record)
{
    if (!bIsConnected || !Database) return false;

    const FString Query = FString::Printf(TEXT(
        "INSERT OR REPLACE INTO OperationRecords "
        "(OperationId, ClientId, TrainId, OperationType, OperationValue, "
        "Timestamp, SessionId, RelatedSignalId, bViolation, ViolationDescription) "
        "VALUES ('%s','%s','%s','%s',%.2f,%.6f,'%s','%s',%d,'%s');"
    ),
        *EscapeString(Record.OperationId),
        *EscapeString(Record.ClientId),
        *EscapeString(Record.TrainId),
        *EscapeString(Record.OperationType),
        Record.OperationValue,
        Record.Timestamp,
        *EscapeString(Record.SessionId),
        *EscapeString(Record.RelatedSignalId),
        Record.bViolation ? 1 : 0,
        *EscapeString(Record.ViolationDescription)
    );

    return ExecuteQuery(Query);
}

bool UTrainingDatabaseManager::LoadOperationRecords(const FString& SessionId, TArray<FClientOperationRecord>& OutRecords)
{
    if (!bIsConnected || !Database) return false;

    const FString Query = FString::Printf(TEXT(
        "SELECT * FROM OperationRecords WHERE SessionId = '%s' ORDER BY Timestamp;"
    ), *EscapeString(SessionId));

    return ExecuteQueryWithCallback(Query, LoadRecordsCallback, &OutRecords);
}

bool UTrainingDatabaseManager::SaveStudentProfile(const FStudentProfile& Profile)
{
    if (!bIsConnected || !Database) return false;

    FString Certs;
    for (const FString& C : Profile.Certifications)
    {
        Certs += C + TEXT("|");
    }

    const FString Query = FString::Printf(TEXT(
        "INSERT OR REPLACE INTO StudentProfiles "
        "(StudentId, StudentName, Role, Department, TrainingLevel, "
        "AverageScore, TotalTrainingHours, CompletedSessions, Certifications) "
        "VALUES ('%s','%s','%s','%s',%d,%.2f,%d,%d,'%s');"
    ),
        *EscapeString(Profile.StudentId),
        *EscapeString(Profile.StudentName),
        *EscapeString(Profile.Role),
        *EscapeString(Profile.Department),
        Profile.TrainingLevel,
        Profile.AverageScore,
        Profile.TotalTrainingHours,
        Profile.CompletedSessions,
        *EscapeString(Certs)
    );

    return ExecuteQuery(Query);
}

bool UTrainingDatabaseManager::LoadStudentProfile(const FString& StudentId, FStudentProfile& OutProfile)
{
    if (!bIsConnected || !Database) return false;

    const FString Query = FString::Printf(TEXT(
        "SELECT * FROM StudentProfiles WHERE StudentId = '%s';"
    ), *EscapeString(StudentId));

    return ExecuteQueryWithCallback(Query, LoadStudentProfileCallback, &OutProfile);
}

bool UTrainingDatabaseManager::LoadAllStudentProfiles(TArray<FStudentProfile>& OutProfiles)
{
    if (!bIsConnected || !Database) return false;

    const FString Query = TEXT("SELECT * FROM StudentProfiles ORDER BY StudentName;");
    return ExecuteQueryWithCallback(Query, LoadAllProfilesCallback, &OutProfiles);
}

bool UTrainingDatabaseManager::LoadTrainingScoresForStudent(const FString& StudentId, TArray<FTrainingScore>& OutScores)
{
    if (!bIsConnected || !Database) return false;

    const FString Query = FString::Printf(TEXT(
        "SELECT * FROM TrainingScores WHERE StudentId = '%s' ORDER BY StartTime DESC;"
    ), *EscapeString(StudentId));

    return ExecuteQueryWithCallback(Query, LoadTrainingScoresCallback, &OutScores);
}

void UTrainingDatabaseManager::InitializeScoringRules()
{
    ScoringRules.Empty();

    FTrainingScoreRule RedLightViolation;
    RedLightViolation.RuleId = TEXT("SIG_001");
    RedLightViolation.Description = TEXT("闯红灯");
    RedLightViolation.Category = TEXT("Signal");
    RedLightViolation.PenaltyPoints = 100.0f;
    RedLightViolation.bCriticalViolation = true;
    RedLightViolation.Weight = 5.0f;
    ScoringRules.Add(RedLightViolation.RuleId, RedLightViolation);

    FTrainingScoreRule Speeding;
    Speeding.RuleId = TEXT("SPD_001");
    Speeding.Description = TEXT("超速运行");
    Speeding.Category = TEXT("Speed");
    Speeding.PenaltyPoints = 50.0f;
    Speeding.Weight = 3.0f;
    ScoringRules.Add(Speeding.RuleId, Speeding);

    FTrainingScoreRule EmergencyBrake;
    EmergencyBrake.RuleId = TEXT("SAF_001");
    EmergencyBrake.Description = TEXT("紧急制动使用不当");
    EmergencyBrake.Category = TEXT("Safety");
    EmergencyBrake.PenaltyPoints = 75.0f;
    EmergencyBrake.Weight = 4.0f;
    ScoringRules.Add(EmergencyBrake.RuleId, EmergencyBrake);

    FTrainingScoreRule EarlyDeparture;
    EarlyDeparture.RuleId = TEXT("SCH_001");
    EarlyDeparture.Description = TEXT("列车早点发车");
    EarlyDeparture.Category = TEXT("Schedule");
    EarlyDeparture.PenaltyPoints = 30.0f;
    EarlyDeparture.Weight = 2.0f;
    ScoringRules.Add(EarlyDeparture.RuleId, EarlyDeparture);

    FTrainingScoreRule PerfectStop;
    PerfectStop.RuleId = TEXT("BON_001");
    PerfectStop.Description = TEXT("精准对标停车");
    PerfectStop.Category = TEXT("Bonus");
    PerfectStop.BonusPoints = 20.0f;
    PerfectStop.Weight = 1.0f;
    ScoringRules.Add(PerfectStop.RuleId, PerfectStop);

    FTrainingScoreRule OnTimeArrival;
    OnTimeArrival.RuleId = TEXT("BON_002");
    OnTimeArrival.Description = TEXT("正点到达");
    OnTimeArrival.Category = TEXT("Bonus");
    OnTimeArrival.BonusPoints = 15.0f;
    OnTimeArrival.Weight = 1.0f;
    ScoringRules.Add(OnTimeArrival.RuleId, OnTimeArrival);

    for (const auto& Pair : ScoringRules)
    {
        const FTrainingScoreRule& Rule = Pair.Value;
        const FString Query = FString::Printf(TEXT(
            "INSERT OR REPLACE INTO ScoringRules "
            "(RuleId, Description, Category, PenaltyPoints, BonusPoints, bCriticalViolation, Weight) "
            "VALUES ('%s','%s','%s',%.2f,%.2f,%d,%.2f);"
        ),
            *EscapeString(Rule.RuleId),
            *EscapeString(Rule.Description),
            *EscapeString(Rule.Category),
            Rule.PenaltyPoints,
            Rule.BonusPoints,
            Rule.bCriticalViolation ? 1 : 0,
            Rule.Weight
        );
        ExecuteQuery(Query);
    }
}

float UTrainingDatabaseManager::CalculateTrainingScore(const FString& ClientId, const FString& SessionId)
{
    FTrainingScore Score = GetCurrentScore(ClientId);

    Score.SignalComplianceScore = CalculateSignalCompliance(ClientId);
    Score.SpeedComplianceScore = CalculateSpeedCompliance(ClientId);
    Score.ScheduleAdherenceScore = CalculateScheduleAdherence(ClientId);
    Score.SafetyScore = CalculateSafetyScore(ClientId);
    Score.CommunicationScore = CalculateCommunicationScore(ClientId);

    const float Total = Score.SignalComplianceScore * 0.30f +
                       Score.SpeedComplianceScore * 0.20f +
                       Score.ScheduleAdherenceScore * 0.20f +
                       Score.SafetyScore * 0.20f +
                       Score.CommunicationScore * 0.10f;

    Score.TotalScore = FMath::Clamp(Total, 0.0f, MaxTotalScore);

    ActiveScores.Add(ClientId, Score);
    OnScoreCalculated.Broadcast(Score);

    return Score.TotalScore;
}

void UTrainingDatabaseManager::RecordOperationAndEvaluate(const FClientOperationRecord& Record)
{
    SaveOperationRecord(Record);

    FTrainingScore* Score = ActiveScores.Find(Record.ClientId);
    if (!Score)
    {
        FTrainingScore NewScore;
        NewScore.ClientId = Record.ClientId;
        ActiveScores.Add(Record.ClientId, NewScore);
        Score = ActiveScores.Find(Record.ClientId);
    }

    if (Score && Record.bViolation)
    {
        Score->TotalViolations++;
        Score->PenaltyDetails.Add(Record.ViolationDescription);

        EvaluateSignalViolation(Record, *Score);
        EvaluateSpeedViolation(Record, *Score);
        EvaluateScheduleViolation(Record, *Score);
        EvaluateSafetyViolation(Record, *Score);

        OnViolationDetected.Broadcast(Record);
    }
}

void UTrainingDatabaseManager::EvaluateSignalViolation(const FClientOperationRecord& Record, FTrainingScore& Score)
{
    FTrainingScoreRule* Rule = ScoringRules.Find(TEXT("SIG_001"));
    if (Rule && Record.OperationType == TEXT("SignalViolation_RedLight"))
    {
        Score.TotalScore -= Rule->PenaltyPoints * Rule->Weight;
    }
}

void UTrainingDatabaseManager::EvaluateSpeedViolation(const FClientOperationRecord& Record, FTrainingScore& Score)
{
    FTrainingScoreRule* Rule = ScoringRules.Find(TEXT("SPD_001"));
    if (Rule && Record.OperationType == TEXT("SpeedViolation_OverLimit"))
    {
        const float OverSpeedPercent = Record.OperationValue;
        const float Penalty = Rule->PenaltyPoints * Rule->Weight * (1.0f + OverSpeedPercent / 100.0f);
        Score.TotalScore -= Penalty;
    }
}

void UTrainingDatabaseManager::EvaluateScheduleViolation(const FClientOperationRecord& Record, FTrainingScore& Score)
{
    FTrainingScoreRule* Rule = ScoringRules.Find(TEXT("SCH_001"));
    if (Rule && Record.OperationType == TEXT("ScheduleViolation_EarlyDeparture"))
    {
        Score.TotalScore -= Rule->PenaltyPoints * Rule->Weight;
    }
}

void UTrainingDatabaseManager::EvaluateSafetyViolation(const FClientOperationRecord& Record, FTrainingScore& Score)
{
    FTrainingScoreRule* Rule = ScoringRules.Find(TEXT("SAF_001"));
    if (Rule && Record.OperationType == TEXT("SafetyViolation_EmergencyBrakeMisuse"))
    {
        Score.TotalScore -= Rule->PenaltyPoints * Rule->Weight;
    }
}

void UTrainingDatabaseManager::ApplyBonusPoints(const FString& ClientId, const FString& RuleId, const FString& Reason)
{
    FTrainingScore* Score = ActiveScores.Find(ClientId);
    FTrainingScoreRule* Rule = ScoringRules.Find(RuleId);

    if (Score && Rule)
    {
        Score->TotalScore += Rule->BonusPoints * Rule->Weight;
        Score->TotalScore = FMath::Clamp(Score->TotalScore, 0.0f, MaxTotalScore);
        Score->PenaltyDetails.Add(FString::Printf(TEXT("奖励: %s +%.2f"), *Reason, Rule->BonusPoints * Rule->Weight));
    }
}

FTrainingScore UTrainingDatabaseManager::GetCurrentScore(const FString& ClientId)
{
    FTrainingScore* Found = ActiveScores.Find(ClientId);
    return Found ? *Found : FTrainingScore();
}

FTrainingScore UTrainingDatabaseManager::FinalizeTrainingScore(const FString& ClientId, const FString& SessionId)
{
    FTrainingScore Score = GetCurrentScore(ClientId);
    Score.SessionId = SessionId;
    Score.EndTime = FDateTime::Now();
    Score.TrainingDurationSeconds = (Score.EndTime - Score.StartTime).GetTotalSeconds();

    CalculateTrainingScore(ClientId, SessionId);

    FStudentProfile Profile;
    if (LoadStudentProfile(Score.StudentId, Profile))
    {
        const float NewAverage = ((Profile.AverageScore * Profile.CompletedSessions) + Score.TotalScore) / (Profile.CompletedSessions + 1);
        Profile.AverageScore = NewAverage;
        Profile.CompletedSessions++;
        Profile.TotalTrainingHours += FMath::RoundToInt(Score.TrainingDurationSeconds / 3600.0f);
        SaveStudentProfile(Profile);
    }

    SaveTrainingScore(Score);

    FServerScoreUpdate Update;
    Update.ClientId = ClientId;
    Update.CurrentScore = Score.TotalScore;
    Update.Reason = TEXT("实训结束，成绩已生成");
    Update.PenaltyDescriptions = Score.PenaltyDetails;

    return Score;
}

bool UTrainingDatabaseManager::ExportTrainingReport(const FString& SessionId, const FString& ExportPath)
{
    FTrainingScore Score;
    TArray<FClientOperationRecord> Records;

    if (!LoadTrainingScore(SessionId, Score) || !LoadOperationRecords(SessionId, Records))
    {
        return false;
    }

    FString Report;
    Report += FString::Printf(TEXT("轨道交通信号实训报告\n"));
    Report += FString::Printf(TEXT("================================\n"));
    Report += FString::Printf(TEXT("学员: %s (%s)\n"), *Score.StudentName, *Score.StudentId);
    Report += FString::Printf(TEXT("实训时间: %s 至 %s\n"), *Score.StartTime.ToString(), *Score.EndTime.ToString());
    Report += FString::Printf(TEXT("实训时长: %.2f 分钟\n"), Score.TrainingDurationSeconds / 60.0f);
    Report += FString::Printf(TEXT("================================\n"));
    Report += FString::Printf(TEXT("得分详情:\n"));
    Report += FString::Printf(TEXT("  总分: %.2f / %.2f\n"), Score.TotalScore, MaxTotalScore);
    Report += FString::Printf(TEXT("  信号合规: %.2f\n"), Score.SignalComplianceScore);
    Report += FString::Printf(TEXT("  速度合规: %.2f\n"), Score.SpeedComplianceScore);
    Report += FString::Printf(TEXT("  时刻遵守: %.2f\n"), Score.ScheduleAdherenceScore);
    Report += FString::Printf(TEXT("  安全操作: %.2f\n"), Score.SafetyScore);
    Report += FString::Printf(TEXT("  协作沟通: %.2f\n"), Score.CommunicationScore);
    Report += FString::Printf(TEXT("  违规次数: %d\n"), Score.TotalViolations);
    Report += FString::Printf(TEXT("================================\n"));
    Report += FString::Printf(TEXT("操作记录:\n"));

    for (const FClientOperationRecord& Rec : Records)
    {
        FDateTime Time = FDateTime::FromUnixTimestamp(Rec.Timestamp);
        Report += FString::Printf(TEXT("[%s] %s - %s (值: %.2f)%s\n"),
            *Time.ToString(),
            *Rec.OperationType,
            *Rec.ViolationDescription,
            Rec.OperationValue,
            Rec.bViolation ? TEXT(" [违规]") : TEXT("")
        );
    }

    return FFileHelper::SaveStringToFile(Report, *ExportPath);
}

bool UTrainingDatabaseManager::ExecuteQuery(const FString& Query)
{
    if (!bIsConnected || !Database) return false;

    char* ErrorMsg = nullptr;
    const int32 Result = sqlite3_exec(Database, TCHAR_TO_UTF8(*Query), nullptr, nullptr, &ErrorMsg);

    if (Result != SQLITE_OK)
    {
        UE_LOG(LogTemp, Error, TEXT("SQL Error: %s"), UTF8_TO_TCHAR(ErrorMsg));
        sqlite3_free(ErrorMsg);
        OnDatabaseOperationComplete.Broadcast(false);
        return false;
    }

    OnDatabaseOperationComplete.Broadcast(true);
    return true;
}

bool UTrainingDatabaseManager::ExecuteQueryWithCallback(const FString& Query, int (*Callback)(void*, int, char**, char**), void* UserData)
{
    if (!bIsConnected || !Database) return false;

    char* ErrorMsg = nullptr;
    const int32 Result = sqlite3_exec(Database, TCHAR_TO_UTF8(*Query), Callback, UserData, &ErrorMsg);

    if (Result != SQLITE_OK)
    {
        UE_LOG(LogTemp, Error, TEXT("SQL Error: %s"), UTF8_TO_TCHAR(ErrorMsg));
        sqlite3_free(ErrorMsg);
        return false;
    }

    return true;
}

FString UTrainingDatabaseManager::EscapeString(const FString& Input)
{
    FString Output = Input;
    Output.ReplaceInline(TEXT("'"), TEXT("''"));
    return Output;
}

int UTrainingDatabaseManager::LoadScoreCallback(void* Data, int Argc, char** Argv, char** AzColName)
{
    FTrainingScore* Score = static_cast<FTrainingScore*>(Data);
    if (!Score) return 0;

    for (int i = 0; i < Argc; ++i)
    {
        const FString ColName = UTF8_TO_TCHAR(AzColName[i]);
        const FString Value = Argv[i] ? UTF8_TO_TCHAR(Argv[i]) : TEXT("");

        if (ColName == TEXT("ClientId")) Score->ClientId = Value;
        else if (ColName == TEXT("StudentId")) Score->StudentId = Value;
        else if (ColName == TEXT("StudentName")) Score->StudentName = Value;
        else if (ColName == TEXT("SessionId")) Score->SessionId = Value;
        else if (ColName == TEXT("TotalScore")) Score->TotalScore = FCString::Atof(*Value);
        else if (ColName == TEXT("SignalComplianceScore")) Score->SignalComplianceScore = FCString::Atof(*Value);
        else if (ColName == TEXT("SpeedComplianceScore")) Score->SpeedComplianceScore = FCString::Atof(*Value);
        else if (ColName == TEXT("ScheduleAdherenceScore")) Score->ScheduleAdherenceScore = FCString::Atof(*Value);
        else if (ColName == TEXT("SafetyScore")) Score->SafetyScore = FCString::Atof(*Value);
        else if (ColName == TEXT("CommunicationScore")) Score->CommunicationScore = FCString::Atof(*Value);
        else if (ColName == TEXT("TotalViolations")) Score->TotalViolations = FCString::Atoi(*Value);
        else if (ColName == TEXT("TrainingDurationSeconds")) Score->TrainingDurationSeconds = FCString::Atof(*Value);
        else if (ColName == TEXT("StartTime")) Score->StartTime = FDateTime::Parse(Value);
        else if (ColName == TEXT("EndTime")) Score->EndTime = FDateTime::Parse(Value);
        else if (ColName == TEXT("PenaltyDetails")) Value.ParseIntoArray(Score->PenaltyDetails, TEXT("|"), true);
    }

    return 0;
}

int UTrainingDatabaseManager::LoadRecordsCallback(void* Data, int Argc, char** Argv, char** AzColName)
{
    TArray<FClientOperationRecord>* Records = static_cast<TArray<FClientOperationRecord>*>(Data);
    if (!Records) return 0;

    FClientOperationRecord Rec;
    for (int i = 0; i < Argc; ++i)
    {
        const FString ColName = UTF8_TO_TCHAR(AzColName[i]);
        const FString Value = Argv[i] ? UTF8_TO_TCHAR(Argv[i]) : TEXT("");

        if (ColName == TEXT("OperationId")) Rec.OperationId = Value;
        else if (ColName == TEXT("ClientId")) Rec.ClientId = Value;
        else if (ColName == TEXT("TrainId")) Rec.TrainId = Value;
        else if (ColName == TEXT("OperationType")) Rec.OperationType = Value;
        else if (ColName == TEXT("OperationValue")) Rec.OperationValue = FCString::Atof(*Value);
        else if (ColName == TEXT("Timestamp")) Rec.Timestamp = FCString::Atof(*Value);
        else if (ColName == TEXT("RelatedSignalId")) Rec.RelatedSignalId = Value;
        else if (ColName == TEXT("bViolation")) Rec.bViolation = FCString::Atoi(*Value) > 0;
        else if (ColName == TEXT("ViolationDescription")) Rec.ViolationDescription = Value;
    }

    Records->Add(Rec);
    return 0;
}

int UTrainingDatabaseManager::LoadStudentProfileCallback(void* Data, int Argc, char** Argv, char** AzColName)
{
    FStudentProfile* Profile = static_cast<FStudentProfile*>(Data);
    if (!Profile) return 0;

    for (int i = 0; i < Argc; ++i)
    {
        const FString ColName = UTF8_TO_TCHAR(AzColName[i]);
        const FString Value = Argv[i] ? UTF8_TO_TCHAR(Argv[i]) : TEXT("");

        if (ColName == TEXT("StudentId")) Profile->StudentId = Value;
        else if (ColName == TEXT("StudentName")) Profile->StudentName = Value;
        else if (ColName == TEXT("Role")) Profile->Role = Value;
        else if (ColName == TEXT("Department")) Profile->Department = Value;
        else if (ColName == TEXT("TrainingLevel")) Profile->TrainingLevel = FCString::Atoi(*Value);
        else if (ColName == TEXT("AverageScore")) Profile->AverageScore = FCString::Atof(*Value);
        else if (ColName == TEXT("TotalTrainingHours")) Profile->TotalTrainingHours = FCString::Atoi(*Value);
        else if (ColName == TEXT("CompletedSessions")) Profile->CompletedSessions = FCString::Atoi(*Value);
        else if (ColName == TEXT("Certifications")) Value.ParseIntoArray(Profile->Certifications, TEXT("|"), true);
    }

    return 0;
}

int UTrainingDatabaseManager::LoadTrainingScoresCallback(void* Data, int Argc, char** Argv, char** AzColName)
{
    TArray<FTrainingScore>* Scores = static_cast<TArray<FTrainingScore>*>(Data);
    if (!Scores) return 0;

    FTrainingScore Score;
    LoadScoreCallback(&Score, Argc, Argv, AzColName);
    Scores->Add(Score);
    return 0;
}

int UTrainingDatabaseManager::LoadAllProfilesCallback(void* Data, int Argc, char** Argv, char** AzColName)
{
    TArray<FStudentProfile>* Profiles = static_cast<TArray<FStudentProfile>*>(Data);
    if (!Profiles) return 0;

    FStudentProfile Profile;
    LoadStudentProfileCallback(&Profile, Argc, Argv, AzColName);
    Profiles->Add(Profile);
    return 0;
}

float UTrainingDatabaseManager::CalculateSignalCompliance(const FString& ClientId)
{
    float Score = 200.0f;
    FTrainingScore* TS = ActiveScores.Find(ClientId);
    if (TS)
    {
        for (const FString& P : TS->PenaltyDetails)
        {
            if (P.Contains(TEXT("SIG_")))
            {
                Score -= 50.0f;
            }
        }
    }
    return FMath::Max(0.0f, Score);
}

float UTrainingDatabaseManager::CalculateSpeedCompliance(const FString& ClientId)
{
    float Score = 200.0f;
    FTrainingScore* TS = ActiveScores.Find(ClientId);
    if (TS)
    {
        for (const FString& P : TS->PenaltyDetails)
        {
            if (P.Contains(TEXT("SPD_")))
            {
                Score -= 30.0f;
            }
        }
    }
    return FMath::Max(0.0f, Score);
}

float UTrainingDatabaseManager::CalculateScheduleAdherence(const FString& ClientId)
{
    float Score = 200.0f;
    FTrainingScore* TS = ActiveScores.Find(ClientId);
    if (TS)
    {
        for (const FString& P : TS->PenaltyDetails)
        {
            if (P.Contains(TEXT("SCH_")))
            {
                Score -= 25.0f;
            }
        }
    }
    return FMath::Max(0.0f, Score);
}

float UTrainingDatabaseManager::CalculateSafetyScore(const FString& ClientId)
{
    float Score = 200.0f;
    FTrainingScore* TS = ActiveScores.Find(ClientId);
    if (TS)
    {
        for (const FString& P : TS->PenaltyDetails)
        {
            if (P.Contains(TEXT("SAF_")))
            {
                Score -= 60.0f;
            }
        }
    }
    return FMath::Max(0.0f, Score);
}

float UTrainingDatabaseManager::CalculateCommunicationScore(const FString& ClientId)
{
    return 200.0f;
}

int32 UTrainingDatabaseManager::ExecuteScalarInt(const FString& Query)
{
    if (!bIsConnected || !Database) return 0;

    int32 Result = 0;
    ExecuteQueryWithCallback(Query, ScalarIntCallback, &Result);
    return Result;
}

int UTrainingDatabaseManager::ScalarIntCallback(void* Data, int Argc, char** Argv, char** AzColName)
{
    int32* Result = static_cast<int32*>(Data);
    if (Result && Argc > 0 && Argv[0])
    {
        *Result = FCString::Atoi(UTF8_TO_TCHAR(Argv[0]));
    }
    return 0;
}

void UTrainingDatabaseManager::MergeStatistics(FCleanupStatistics& Dest, const FCleanupStatistics& Src)
{
    Dest.InvalidScoresRemoved += Src.InvalidScoresRemoved;
    Dest.InvalidRecordsRemoved += Src.InvalidRecordsRemoved;
    Dest.ExpiredScoresRemoved += Src.ExpiredScoresRemoved;
    Dest.ExpiredRecordsRemoved += Src.ExpiredRecordsRemoved;
    Dest.OrphanedRecordsRemoved += Src.OrphanedRecordsRemoved;
}

FCleanupStatistics UTrainingDatabaseManager::PerformFullCleanup()
{
    FCleanupStatistics Stats;
    Stats.DatabaseSizeBeforeBytes = GetDatabaseSizeBytes();

    MergeStatistics(Stats, RemoveInvalidData());
    MergeStatistics(Stats, RemoveExpiredData());
    MergeStatistics(Stats, RemoveOrphanedRecords());

    if (bAutoVacuumAfterCleanup)
    {
        Stats.bVacuumExecuted = VacuumDatabase();
    }

    Stats.DatabaseSizeAfterBytes = GetDatabaseSizeBytes();

    OnDatabaseCleanupComplete.Broadcast(Stats);
    return Stats;
}

FCleanupStatistics UTrainingDatabaseManager::RemoveInvalidData()
{
    FCleanupStatistics Stats;
    if (!bIsConnected || !Database) return Stats;

    const FString InvalidScoresQuery = FString::Printf(TEXT(
        "DELETE FROM TrainingScores WHERE "
        "StudentId IS NULL OR StudentId = '' OR "
        "SessionId IS NULL OR SessionId = '' OR "
        "TotalScore < 0 OR TotalScore > %.2f OR "
        "TrainingDurationSeconds < %.2f OR "
        "TrainingDurationSeconds > %.2f;"
    ), MaxTotalScore * 2.0f, MinValidTrainingDurationSeconds, MaxValidTrainingDurationHours * 3600.0f);

    char* ErrorMsg = nullptr;
    int32 Result = sqlite3_exec(Database, TCHAR_TO_UTF8(*InvalidScoresQuery), nullptr, nullptr, &ErrorMsg);
    if (Result == SQLITE_OK)
    {
        Stats.InvalidScoresRemoved = sqlite3_changes(Database);
        UE_LOG(LogTemp, Log, TEXT("Removed %d invalid training scores"), Stats.InvalidScoresRemoved);
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("Failed to remove invalid scores: %s"), UTF8_TO_TCHAR(ErrorMsg));
        sqlite3_free(ErrorMsg);
    }

    const FString InvalidRecordsQuery = TEXT(
        "DELETE FROM OperationRecords WHERE "
        "OperationId IS NULL OR OperationId = '' OR "
        "ClientId IS NULL OR ClientId = '' OR "
        "TrainId IS NULL OR TrainId = '' OR "
        "Timestamp <= 0 OR "
        "Timestamp > strftime('%s', 'now');"
    );

    ErrorMsg = nullptr;
    Result = sqlite3_exec(Database, TCHAR_TO_UTF8(*InvalidRecordsQuery), nullptr, nullptr, &ErrorMsg);
    if (Result == SQLITE_OK)
    {
        Stats.InvalidRecordsRemoved = sqlite3_changes(Database);
        UE_LOG(LogTemp, Log, TEXT("Removed %d invalid operation records"), Stats.InvalidRecordsRemoved);
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("Failed to remove invalid records: %s"), UTF8_TO_TCHAR(ErrorMsg));
        sqlite3_free(ErrorMsg);
    }

    return Stats;
}

FCleanupStatistics UTrainingDatabaseManager::RemoveExpiredData(int32 OlderThanDays)
{
    FCleanupStatistics Stats;
    if (!bIsConnected || !Database) return Stats;

    const int32 RetentionDays = (OlderThanDays > 0) ? OlderThanDays : DataRetentionDays;
    const FDateTime CutoffDateTime = FDateTime::Now() - FTimespan(RetentionDays, 0, 0, 0);
    const FString CutoffStr = CutoffDateTime.ToString();

    const FString ExpiredScoresQuery = FString::Printf(TEXT(
        "DELETE FROM TrainingScores WHERE StartTime < '%s';"
    ), *EscapeString(CutoffStr));

    char* ErrorMsg = nullptr;
    int32 Result = sqlite3_exec(Database, TCHAR_TO_UTF8(*ExpiredScoresQuery), nullptr, nullptr, &ErrorMsg);
    if (Result == SQLITE_OK)
    {
        Stats.ExpiredScoresRemoved = sqlite3_changes(Database);
        UE_LOG(LogTemp, Log, TEXT("Removed %d expired training scores (older than %d days)"), Stats.ExpiredScoresRemoved, RetentionDays);
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("Failed to remove expired scores: %s"), UTF8_TO_TCHAR(ErrorMsg));
        sqlite3_free(ErrorMsg);
    }

    const int64 CutoffTimestamp = CutoffDateTime.ToUnixTimestamp();
    const FString ExpiredRecordsQuery = FString::Printf(TEXT(
        "DELETE FROM OperationRecords WHERE Timestamp < %lld;"
    ), CutoffTimestamp);

    ErrorMsg = nullptr;
    Result = sqlite3_exec(Database, TCHAR_TO_UTF8(*ExpiredRecordsQuery), nullptr, nullptr, &ErrorMsg);
    if (Result == SQLITE_OK)
    {
        Stats.ExpiredRecordsRemoved = sqlite3_changes(Database);
        UE_LOG(LogTemp, Log, TEXT("Removed %d expired operation records"), Stats.ExpiredRecordsRemoved);
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("Failed to remove expired records: %s"), UTF8_TO_TCHAR(ErrorMsg));
        sqlite3_free(ErrorMsg);
    }

    return Stats;
}

FCleanupStatistics UTrainingDatabaseManager::RemoveOrphanedRecords()
{
    FCleanupStatistics Stats;
    if (!bIsConnected || !Database) return Stats;

    const FString OrphanedQuery = TEXT(
        "DELETE FROM OperationRecords WHERE "
        "SessionId IS NOT NULL AND SessionId != '' AND "
        "SessionId NOT IN (SELECT SessionId FROM TrainingScores);"
    );

    char* ErrorMsg = nullptr;
    const int32 Result = sqlite3_exec(Database, TCHAR_TO_UTF8(*OrphanedQuery), nullptr, nullptr, &ErrorMsg);
    if (Result == SQLITE_OK)
    {
        Stats.OrphanedRecordsRemoved = sqlite3_changes(Database);
        UE_LOG(LogTemp, Log, TEXT("Removed %d orphaned operation records"), Stats.OrphanedRecordsRemoved);
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("Failed to remove orphaned records: %s"), UTF8_TO_TCHAR(ErrorMsg));
        sqlite3_free(ErrorMsg);
    }

    return Stats;
}

bool UTrainingDatabaseManager::VacuumDatabase()
{
    if (!bIsConnected || !Database) return false;

    UE_LOG(LogTemp, Log, TEXT("Executing database VACUUM to reclaim free space..."));

    char* ErrorMsg = nullptr;
    const int32 Result = sqlite3_exec(Database, "VACUUM", nullptr, nullptr, &ErrorMsg);
    if (Result != SQLITE_OK)
    {
        UE_LOG(LogTemp, Error, TEXT("VACUUM failed: %s"), UTF8_TO_TCHAR(ErrorMsg));
        sqlite3_free(ErrorMsg);
        return false;
    }

    UE_LOG(LogTemp, Log, TEXT("Database VACUUM completed successfully"));
    return true;
}

int64 UTrainingDatabaseManager::GetDatabaseSizeBytes()
{
    const FString FullPath = FPaths::ConvertRelativePathToFull(DatabasePath);
    IPlatformFile& FileManager = FPlatformFileManager::Get().GetPlatformFile();

    if (FileManager.FileExists(*FullPath))
    {
        return FileManager.FileSize(*FullPath);
    }
    return 0;
}

int32 UTrainingDatabaseManager::GetTotalScoreCount()
{
    return ExecuteScalarInt(TEXT("SELECT COUNT(*) FROM TrainingScores;"));
}

int32 UTrainingDatabaseManager::GetTotalRecordCount()
{
    return ExecuteScalarInt(TEXT("SELECT COUNT(*) FROM OperationRecords;"));
}

FString UTrainingDatabaseManager::GetCleanupReport(const FCleanupStatistics& Stats)
{
    FString Report;
    Report += TEXT("=== 数据库清理报告\n");
    Report += TEXT("==============================\n");
    Report += FString::Printf(TEXT("无效成绩记录: %d 条\n"), Stats.InvalidScoresRemoved);
    Report += FString::Printf(TEXT("无效操作记录: %d 条\n"), Stats.InvalidRecordsRemoved);
    Report += FString::Printf(TEXT("过期成绩记录: %d 条\n"), Stats.ExpiredScoresRemoved);
    Report += FString::Printf(TEXT("过期操作记录: %d 条\n"), Stats.ExpiredRecordsRemoved);
    Report += FString::Printf(TEXT("孤立操作记录: %d 条\n"), Stats.OrphanedRecordsRemoved);

    const int32 TotalRemoved = Stats.InvalidScoresRemoved + Stats.InvalidRecordsRemoved +
                            Stats.ExpiredScoresRemoved + Stats.ExpiredRecordsRemoved +
                            Stats.OrphanedRecordsRemoved;
    Report += FString::Printf(TEXT("总计清理: %d 条记录\n"), TotalRemoved);

    if (Stats.DatabaseSizeBeforeBytes > 0)
    {
        const int64 SavedBytes = Stats.DatabaseSizeBeforeBytes - Stats.DatabaseSizeAfterBytes;
        Report += TEXT("------------------------------\n");
        Report += FString::Printf(TEXT("清理前大小: %.2f MB\n"), Stats.DatabaseSizeBeforeBytes / 1048576.0);
        Report += FString::Printf(TEXT("清理后大小: %.2f MB\n"), Stats.DatabaseSizeAfterBytes / 1048576.0);
        Report += FString::Printf(TEXT("释放空间: %.2f MB\n"), SavedBytes / 1048576.0);
    }

    if (Stats.bVacuumExecuted)
    {
        Report += TEXT("\n数据库压缩: 已执行 VACUUM 压缩\n");
    }

    Report += TEXT("==============================\n");
    return Report;
}
