
#include "Network/NetworkCompression.h"
#include "Misc/DateTime.h"

FCompressionStats UNetworkCompression::LastStats;

TArray<uint8> UNetworkCompression::CompressBytes(const TArray<uint8>& UncompressedData, ECompressionLevel Level)
{
    if (Level == ECompressionLevel::None || UncompressedData.Num() < GetCompressionThreshold(Level))
    {
        return UncompressedData;
    }

    const double StartTime = FPlatformTime::Seconds();
    LastStats.OriginalSizeBytes = UncompressedData.Num();

    TArray<uint8> Result;
    Result.Add(static_cast<uint8>(Level));

    if (Level == ECompressionLevel::Fast)
    {
        uint8 LastByte = 0;
        int32 RunLength = 0;

        for (uint8 Byte : UncompressedData)
        {
            if (Byte == LastByte && RunLength < 255)
            {
                RunLength++;
            }
            else
            {
                if (RunLength > 0)
                {
                    Result.Add(LastByte);
                    Result.Add(static_cast<uint8>(RunLength));
                }
                LastByte = Byte;
                RunLength = 1;
            }
        }

        if (RunLength > 0)
        {
            Result.Add(LastByte);
            Result.Add(static_cast<uint8>(RunLength));
        }
    }
    else
    {
        for (int32 i = 0; i < UncompressedData.Num(); i += 2)
        {
            if (i + 1 < UncompressedData.Num())
            {
                Result.Add(UncompressedData[i]);
                Result.Add(UncompressedData[i + 1]);
            }
            else
            {
                Result.Add(UncompressedData[i]);
            }
        }
    }

    const double EndTime = FPlatformTime::Seconds();
    LastStats.CompressedSizeBytes = Result.Num();
    LastStats.CompressionRatio = static_cast<float>(Result.Num()) / static_cast<float>(UncompressedData.Num());
    LastStats.CompressionTimeMs = (EndTime - StartTime) * 1000.0f;

    return Result;
}

TArray<uint8> UNetworkCompression::DecompressBytes(const TArray<uint8>& CompressedData)
{
    if (CompressedData.Num() == 0)
    {
        return TArray<uint8>();
    }

    const double StartTime = FPlatformTime::Seconds();
    TArray<uint8> Result;

    const ECompressionLevel Level = static_cast<ECompressionLevel>(CompressedData[0]);

    if (Level == ECompressionLevel::None)
    {
        Result = CompressedData;
    }
    else if (Level == ECompressionLevel::Fast)
    {
        for (int32 i = 1; i < CompressedData.Num(); i += 2)
        {
            if (i + 1 < CompressedData.Num())
            {
                const uint8 Byte = CompressedData[i];
                const uint8 Count = CompressedData[i + 1];
                for (uint8 j = 0; j < Count; j++)
                {
                    Result.Add(Byte);
                }
            }
        }
    }
    else
    {
        for (int32 i = 1; i < CompressedData.Num(); i++)
        {
            Result.Add(CompressedData[i]);
        }
    }

    const double EndTime = FPlatformTime::Seconds();
    LastStats.DecompressionTimeMs = (EndTime - StartTime) * 1000.0f;

    return Result;
}

TArray<uint8> UNetworkCompression::CompressTrainState(const FTrainNetworkState& State)
{
    TArray<uint8> Buffer;

    WriteStringCompact(Buffer, State.TrainId);
    WriteVectorQuantized(Buffer, State.Position, 0.1f);
    WriteRotatorQuantized(Buffer, State.Rotation);
    WriteFloat16(Buffer, State.CurrentSpeed);
    WriteInt24(Buffer, State.StateSequence);

    return Buffer;
}

bool UNetworkCompression::DecompressTrainState(const TArray<uint8>& Data, FTrainNetworkState& OutState)
{
    if (Data.Num() < 10) return false;

    int32 Offset = 0;
    OutState.TrainId = ReadStringCompact(Data, Offset);
    OutState.Position = ReadVectorQuantized(Data, Offset, 0.1f);
    OutState.Rotation = ReadRotatorQuantized(Data, Offset);
    OutState.CurrentSpeed = ReadFloat16(Data, Offset);
    OutState.StateSequence = ReadInt24(Data, Offset);

    return true;
}

TArray<uint8> UNetworkCompression::CompressDeltaTrainState(const FTrainNetworkState& NewState, const FTrainNetworkState& OldState)
{
    TArray<uint8> Buffer;

    const FVector DeltaPos = NewState.Position - OldState.Position;
    const FRotator DeltaRot = NewState.Rotation - OldState.Rotation;
    const float DeltaSpeed = NewState.CurrentSpeed - OldState.CurrentSpeed;

    WriteStringCompact(Buffer, NewState.TrainId);
    WriteVectorQuantized(Buffer, DeltaPos, 0.01f);
    WriteRotatorQuantized(Buffer, DeltaRot);
    WriteFloat16(Buffer, DeltaSpeed);
    WriteInt24(Buffer, NewState.StateSequence);

    return Buffer;
}

bool UNetworkCompression::DecompressDeltaTrainState(const TArray<uint8>& Data, const FTrainNetworkState& BaseState, FTrainNetworkState& OutState)
{
    if (Data.Num() < 10) return false;

    int32 Offset = 0;
    OutState.TrainId = ReadStringCompact(Data, Offset);
    const FVector DeltaPos = ReadVectorQuantized(Data, Offset, 0.01f);
    const FRotator DeltaRot = ReadRotatorQuantized(Data, Offset);
    const float DeltaSpeed = ReadFloat16(Data, Offset);
    OutState.StateSequence = ReadInt24(Data, Offset);

    OutState.Position = BaseState.Position + DeltaPos;
    OutState.Rotation = BaseState.Rotation + DeltaRot;
    OutState.CurrentSpeed = BaseState.CurrentSpeed + DeltaSpeed;

    return true;
}

TArray<uint8> UNetworkCompression::CompressSignalState(const FSignalNetworkState& State)
{
    TArray<uint8> Buffer;

    WriteStringCompact(Buffer, State.SignalId);
    Buffer.Add(static_cast<uint8>(State.CurrentAspect));
    Buffer.Add(State.bIsActive ? 1 : 0);

    return Buffer;
}

bool UNetworkCompression::DecompressSignalState(const TArray<uint8>& Data, FSignalNetworkState& OutState)
{
    if (Data.Num() < 4) return false;

    int32 Offset = 0;
    OutState.SignalId = ReadStringCompact(Data, Offset);
    OutState.CurrentAspect = static_cast<ESignalAspect>(Data[Offset++]);
    OutState.bIsActive = Data[Offset++] > 0;

    return true;
}

TArray<uint8> UNetworkCompression::CompressGlobalState(const FServerGlobalState& State)
{
    TArray<uint8> Buffer;

    WriteFloat16(Buffer, State.SimulationTime);
    WriteFloat16(Buffer, State.ServerTimestamp);

    Buffer.Add(static_cast<uint8>(State.TrainStates.Num()));
    for (const FTrainNetworkState& Train : State.TrainStates)
    {
        const TArray<uint8> TrainData = CompressTrainState(Train);
        Buffer.Append(TrainData);
    }

    Buffer.Add(static_cast<uint8>(State.SignalStates.Num()));
    for (const FSignalNetworkState& Signal : State.SignalStates)
    {
        const TArray<uint8> SignalData = CompressSignalState(Signal);
        Buffer.Append(SignalData);
    }

    return Buffer;
}

bool UNetworkCompression::DecompressGlobalState(const TArray<uint8>& Data, FServerGlobalState& OutState)
{
    if (Data.Num() < 6) return false;

    int32 Offset = 0;
    OutState.SimulationTime = ReadFloat16(Data, Offset);
    OutState.ServerTimestamp = ReadFloat16(Data, Offset);

    const uint8 TrainCount = Data[Offset++];
    OutState.TrainStates.SetNum(TrainCount);
    for (uint8 i = 0; i < TrainCount; i++)
    {
        FTrainNetworkState Train;
        int32 StartOffset = Offset;

        const FString TrainId = ReadStringCompact(Data, Offset);
        Offset = StartOffset + 18 + TrainId.Len() + 1;

        TArray<uint8> TrainData;
        TrainData.Append(&Data[StartOffset], Offset - StartOffset);
        DecompressTrainState(TrainData, Train);
        OutState.TrainStates[i] = Train;
    }

    return true;
}

FCompressionStats UNetworkCompression::GetLastCompressionStats()
{
    return LastStats;
}

bool UNetworkCompression::ShouldUseCompression(int32 DataSize, ECompressionLevel Level)
{
    return DataSize >= GetCompressionThreshold(Level);
}

int32 UNetworkCompression::GetCompressionThreshold(ECompressionLevel Level)
{
    switch (Level)
    {
    case ECompressionLevel::Fast:
        return 256;
    case ECompressionLevel::Normal:
        return 512;
    case ECompressionLevel::High:
        return 1024;
    default:
        return INT32_MAX;
    }
}

void UNetworkCompression::WriteFloat16(TArray<uint8>& Buffer, float Value)
{
    const float Clamped = FMath::Clamp(Value, -65504.0f, 65504.0f);
    const int16 Half = static_cast<int16>(Clamped * 256.0f);
    Buffer.Add(reinterpret_cast<const uint8*>(&Half)[0]);
    Buffer.Add(reinterpret_cast<const uint8*>(&Half)[1]);
}

float UNetworkCompression::ReadFloat16(const TArray<uint8>& Buffer, int32& Offset)
{
    if (Offset + 1 >= Buffer.Num()) { Offset += 2; return 0.0f; }

    int16 Half = *reinterpret_cast<const int16*>(&Buffer[Offset]);
    Offset += 2;
    return static_cast<float>(Half) / 256.0f;
}

void UNetworkCompression::WriteInt24(TArray<uint8>& Buffer, int32 Value)
{
    const int32 Clamped = FMath::Clamp(Value, -8388608, 8388607);
    Buffer.Add(static_cast<uint8>(Clamped & 0xFF));
    Buffer.Add(static_cast<uint8>((Clamped >> 8) & 0xFF));
    Buffer.Add(static_cast<uint8>((Clamped >> 16) & 0xFF));
}

int32 UNetworkCompression::ReadInt24(const TArray<uint8>& Buffer, int32& Offset)
{
    if (Offset + 2 >= Buffer.Num()) { Offset += 3; return 0; }

    int32 Value = static_cast<int8>(Buffer[Offset + 2]) << 16;
    Value |= Buffer[Offset + 1] << 8;
    Value |= Buffer[Offset];
    Offset += 3;
    return Value;
}

void UNetworkCompression::WriteVectorQuantized(TArray<uint8>& Buffer, const FVector& Vec, float Precision)
{
    const float Scale = 1.0f / Precision;
    WriteInt24(Buffer, static_cast<int32>(Vec.X * Scale));
    WriteInt24(Buffer, static_cast<int32>(Vec.Y * Scale));
    WriteInt24(Buffer, static_cast<int32>(Vec.Z * Scale));
}

FVector UNetworkCompression::ReadVectorQuantized(const TArray<uint8>& Buffer, int32& Offset, float Precision)
{
    FVector Result;
    Result.X = static_cast<float>(ReadInt24(Buffer, Offset)) * Precision;
    Result.Y = static_cast<float>(ReadInt24(Buffer, Offset)) * Precision;
    Result.Z = static_cast<float>(ReadInt24(Buffer, Offset)) * Precision;
    return Result;
}

void UNetworkCompression::WriteRotatorQuantized(TArray<uint8>& Buffer, const FRotator& Rot)
{
    Buffer.Add(CompressFloatToByte(Rot.Pitch, -180.0f, 180.0f));
    Buffer.Add(CompressFloatToByte(Rot.Yaw, -180.0f, 180.0f));
    Buffer.Add(CompressFloatToByte(Rot.Roll, -180.0f, 180.0f));
}

FRotator UNetworkCompression::ReadRotatorQuantized(const TArray<uint8>& Buffer, int32& Offset)
{
    FRotator Result;
    if (Offset + 2 < Buffer.Num())
    {
        Result.Pitch = DecompressByteToFloat(Buffer[Offset++], -180.0f, 180.0f);
        Result.Yaw = DecompressByteToFloat(Buffer[Offset++], -180.0f, 180.0f);
        Result.Roll = DecompressByteToFloat(Buffer[Offset++], -180.0f, 180.0f);
    }
    else
    {
        Offset += 3;
    }
    return Result;
}

void UNetworkCompression::WriteStringCompact(TArray<uint8>& Buffer, const FString& Str)
{
    const FTCHARToUTF8 Converter(*Str);
    const int32 Len = FMath::Min(Converter.Length(), 255);
    Buffer.Add(static_cast<uint8>(Len));
    for (int32 i = 0; i < Len; i++)
    {
        Buffer.Add(reinterpret_cast<const ANSICHAR*>(Converter.Get())[i]);
    }
}

FString UNetworkCompression::ReadStringCompact(const TArray<uint8>& Buffer, int32& Offset)
{
    if (Offset >= Buffer.Num()) { return FString(); }

    const int32 Len = Buffer[Offset++];
    if (Offset + Len > Buffer.Num())
    {
        Offset += Len;
        return FString();
    }

    FString Result = FString(UTF8_TO_TCHAR(reinterpret_cast<const ANSICHAR*>(&Buffer[Offset]))).Left(Len);
    Offset += Len;
    return Result;
}

uint8 UNetworkCompression::CompressFloatToByte(float Value, float Min, float Max)
{
    const float Normalized = (Value - Min) / (Max - Min);
    return static_cast<uint8>(FMath::Clamp(Normalized * 255.0f, 0.0f, 255.0f));
}

float UNetworkCompression::DecompressByteToFloat(uint8 Byte, float Min, float Max)
{
    const float Normalized = static_cast<float>(Byte) / 255.0f;
    return Min + Normalized * (Max - Min);
}
