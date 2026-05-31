
#pragma once

#include "CoreMinimal.h"
#include "NetworkMessageProtocol.h"
#include "NetworkCompression.generated.h"

UENUM(BlueprintType)
enum class ECompressionLevel : uint8
{
    None UMETA(DisplayName = "不压缩"),
    Fast UMETA(DisplayName = "快速压缩"),
    Normal UMETA(DisplayName = "标准压缩"),
    High UMETA(DisplayName = "高压缩率")
};

USTRUCT(BlueprintType)
struct FCompressionStats
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int64 OriginalSizeBytes;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int64 CompressedSizeBytes;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CompressionRatio;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CompressionTimeMs;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float DecompressionTimeMs;

    FCompressionStats()
        : OriginalSizeBytes(0)
        , CompressedSizeBytes(0)
        , CompressionRatio(1.0f)
        , CompressionTimeMs(0.0f)
        , DecompressionTimeMs(0.0f)
    {}
};

UCLASS()
class RAILTRANSITSIM_API UNetworkCompression : public UObject
{
    GENERATED_BODY()

public:
    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static TArray<uint8> CompressBytes(const TArray<uint8>& UncompressedData, ECompressionLevel Level = ECompressionLevel::Normal);

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static TArray<uint8> DecompressBytes(const TArray<uint8>& CompressedData);

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static TArray<uint8> CompressTrainState(const FTrainNetworkState& State);

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static bool DecompressTrainState(const TArray<uint8>& Data, FTrainNetworkState& OutState);

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static TArray<uint8> CompressDeltaTrainState(const FTrainNetworkState& NewState, const FTrainNetworkState& OldState);

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static bool DecompressDeltaTrainState(const TArray<uint8>& Data, const FTrainNetworkState& BaseState, FTrainNetworkState& OutState);

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static TArray<uint8> CompressSignalState(const FSignalNetworkState& State);

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static bool DecompressSignalState(const TArray<uint8>& Data, FSignalNetworkState& OutState);

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static TArray<uint8> CompressGlobalState(const FServerGlobalState& State);

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static bool DecompressGlobalState(const TArray<uint8>& Data, FServerGlobalState& OutState);

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static FCompressionStats GetLastCompressionStats();

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static bool ShouldUseCompression(int32 DataSize, ECompressionLevel Level);

    UFUNCTION(BlueprintCallable, Category = "Network|Compression")
    static int32 GetCompressionThreshold(ECompressionLevel Level);

private:
    static FCompressionStats LastStats;

    static void WriteFloat16(TArray<uint8>& Buffer, float Value);
    static float ReadFloat16(const TArray<uint8>& Buffer, int32& Offset);

    static void WriteInt24(TArray<uint8>& Buffer, int32 Value);
    static int32 ReadInt24(const TArray<uint8>& Buffer, int32& Offset);

    static void WriteVectorQuantized(TArray<uint8>& Buffer, const FVector& Vec, float Precision = 1.0f);
    static FVector ReadVectorQuantized(const TArray<uint8>& Buffer, int32& Offset, float Precision = 1.0f);

    static void WriteRotatorQuantized(TArray<uint8>& Buffer, const FRotator& Rot);
    static FRotator ReadRotatorQuantized(const TArray<uint8>& Buffer, int32& Offset);

    static void WriteStringCompact(TArray<uint8>& Buffer, const FString& Str);
    static FString ReadStringCompact(const TArray<uint8>& Buffer, int32& Offset);

    static uint8 CompressFloatToByte(float Value, float Min, float Max);
    static float DecompressByteToFloat(uint8 Byte, float Min, float Max);
};
