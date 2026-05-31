using System.Buffers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using StudioAudioMatrix.Models;

namespace StudioAudioMatrix.Services;

public class ProjectManager
{
    private const int KeySize = 256;
    private const int SaltSize = 16;
    private const int IvSize = 16;
    private const int Iterations = 200000;
    private const int TagSize = 16;
    private const int HeaderSize = 4 + 4 + SaltSize + IvSize + TagSize;
    private static readonly byte[] MagicHeader = Encoding.ASCII.GetBytes("SAM1");

    public event EventHandler<string>? ProjectSaved;
    public event EventHandler<string>? ProjectLoaded;
    public event EventHandler<string>? ProjectError;
    public event EventHandler<ProjectLoadProgressEventArgs>? LoadProgress;

    public async Task<bool> SaveProjectAsync(Project project, string filePath, string password)
    {
        try
        {
            project.ModifiedAt = DateTime.Now;
            project.Version++;

            var options = new JsonSerializerOptions { WriteIndented = false };
            byte[] plaintext = JsonSerializer.SerializeToUtf8Bytes(project, options);
            byte[] encrypted = await EncryptDataAsync(plaintext, password);

            await File.WriteAllBytesAsync(filePath, encrypted);
            ProjectSaved?.Invoke(this, filePath);
            return true;
        }
        catch (Exception ex)
        {
            ProjectError?.Invoke(this, $"保存失败: {ex.Message}");
            return false;
        }
    }

    public async Task<Project?> LoadProjectAsync(string filePath, string password)
    {
        try
        {
            if (!File.Exists(filePath))
            {
                ProjectError?.Invoke(this, "文件不存在");
                return null;
            }

            LoadProgress?.Invoke(this, new ProjectLoadProgressEventArgs(0, "读取文件..."));

            var fi = new FileInfo(filePath);
            long fileSize = fi.Length;

            byte[] encrypted = await File.ReadAllBytesAsync(filePath);
            LoadProgress?.Invoke(this, new ProjectLoadProgressEventArgs(30, "解密数据..."));

            byte[] plaintext = await DecryptDataAsync(encrypted, password);
            LoadProgress?.Invoke(this, new ProjectLoadProgressEventArgs(70, "解析工程数据..."));

            var project = ParseProjectStreaming(plaintext);
            if (project == null)
            {
                ProjectError?.Invoke(this, "工程文件解析失败");
                return null;
            }

            LoadProgress?.Invoke(this, new ProjectLoadProgressEventArgs(100, "加载完成"));
            ProjectLoaded?.Invoke(this, filePath);
            return project;
        }
        catch (CryptographicException ex)
        {
            ProjectError?.Invoke(this, $"密码错误或文件已损坏: {ex.Message}");
            return null;
        }
        catch (JsonException ex)
        {
            ProjectError?.Invoke(this, $"文件格式错误: {ex.Message}");
            return null;
        }
        catch (Exception ex)
        {
            ProjectError?.Invoke(this, $"加载失败: {ex.Message}");
            return null;
        }
    }

    private static Project? ParseProjectStreaming(byte[] utf8Json)
    {
        var reader = new Utf8JsonReader(utf8Json, isFinalBlock: true, state: default);

        var project = new Project();
        string? currentProp = null;
        string? collectionProp = null;

        while (reader.Read())
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.PropertyName:
                    currentProp = reader.GetString();
                    break;

                case JsonTokenType.String when currentProp == "Id":
                    project.Id = reader.GetString() ?? project.Id;
                    break;
                case JsonTokenType.String when currentProp == "Name":
                    project.Name = reader.GetString() ?? project.Name;
                    break;
                case JsonTokenType.String when currentProp == "Description":
                    project.Description = reader.GetString() ?? string.Empty;
                    break;

                case JsonTokenType.Number when currentProp == "Version":
                    project.Version = reader.GetInt32();
                    break;
                case JsonTokenType.Number when currentProp == "StudioWidth":
                    project.StudioWidth = reader.GetDouble();
                    break;
                case JsonTokenType.Number when currentProp == "StudioHeight":
                    project.StudioHeight = reader.GetDouble();
                    break;
                case JsonTokenType.Number when currentProp == "StudioDepth":
                    project.StudioDepth = reader.GetDouble();
                    break;
                case JsonTokenType.Number when currentProp == "MatrixRows":
                    project.MatrixRows = reader.GetInt32();
                    break;
                case JsonTokenType.Number when currentProp == "MatrixColumns":
                    project.MatrixColumns = reader.GetInt32();
                    break;

                case JsonTokenType.StartArray when currentProp == "Devices":
                    collectionProp = "Devices";
                    break;
                case JsonTokenType.StartArray when currentProp == "Zones":
                    collectionProp = "Zones";
                    break;
                case JsonTokenType.StartArray when currentProp == "MatrixCells":
                    collectionProp = "MatrixCells";
                    break;
                case JsonTokenType.StartArray when currentProp == "Tracks":
                    collectionProp = "Tracks";
                    break;
                case JsonTokenType.EndArray:
                    collectionProp = null;
                    break;

                case JsonTokenType.StartObject when collectionProp == "Devices":
                    var dev = JsonSerializer.Deserialize<AudioDevice>(ref reader);
                    if (dev != null) project.Devices.Add(dev);
                    break;
                case JsonTokenType.StartObject when collectionProp == "Zones":
                    var zone = JsonSerializer.Deserialize<SoundZone>(ref reader);
                    if (zone != null) project.Zones.Add(zone);
                    break;
                case JsonTokenType.StartObject when collectionProp == "MatrixCells":
                    var cell = JsonSerializer.Deserialize<MatrixCell>(ref reader);
                    if (cell != null) project.MatrixCells.Add(cell);
                    break;
                case JsonTokenType.StartObject when collectionProp == "Tracks":
                    var track = JsonSerializer.Deserialize<TimelineTrack>(ref reader);
                    if (track != null) project.Tracks.Add(track);
                    break;
            }
        }

        return project;
    }

    public Project CreateNewProject()
    {
        var project = new Project
        {
            Name = "未命名工程",
            CreatedAt = DateTime.Now,
            ModifiedAt = DateTime.Now,
            StudioWidth = 20.0,
            StudioHeight = 8.0,
            StudioDepth = 15.0,
            MatrixRows = 16,
            MatrixColumns = 16
        };

        InitializeDefaultCells(project);
        return project;
    }

    private static void InitializeDefaultCells(Project project)
    {
        for (int r = 0; r < project.MatrixRows; r++)
        {
            for (int c = 0; c < project.MatrixColumns; c++)
            {
                project.MatrixCells.Add(new MatrixCell
                {
                    Row = r,
                    Column = c,
                    IsActive = false,
                    Gain = 1.0
                });
            }
        }
    }

    private static Task<byte[]> EncryptDataAsync(byte[] plaintext, string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(SaltSize);
        byte[] iv = RandomNumberGenerator.GetBytes(IvSize);

        using var key = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password), salt, Iterations,
            HashAlgorithmName.SHA256, KeySize / 8);

        using var aes = AesGcm.Create(key);
        byte[] tag = new byte[TagSize];
        byte[] ciphertext = new byte[plaintext.Length];
        aes.Encrypt(iv, plaintext, ciphertext, tag);

        var result = new byte[HeaderSize + ciphertext.Length];
        int offset = 0;
        Array.Copy(MagicHeader, 0, result, offset, MagicHeader.Length); offset += MagicHeader.Length;
        Array.Copy(BitConverter.GetBytes(Iterations), 0, result, offset, 4); offset += 4;
        Array.Copy(salt, 0, result, offset, SaltSize); offset += SaltSize;
        Array.Copy(iv, 0, result, offset, IvSize); offset += IvSize;
        Array.Copy(tag, 0, result, offset, TagSize); offset += TagSize;
        Array.Copy(ciphertext, 0, result, offset, ciphertext.Length);

        return Task.FromResult(result);
    }

    private static Task<byte[]> DecryptDataAsync(byte[] encrypted, string password)
    {
        if (encrypted.Length < HeaderSize)
            throw new CryptographicException("文件大小无效");

        int offset = 0;
        byte[] header = new byte[MagicHeader.Length];
        Array.Copy(encrypted, offset, header, 0, MagicHeader.Length); offset += MagicHeader.Length;
        if (!header.SequenceEqual(MagicHeader))
            throw new CryptographicException("文件格式无效");

        int iterations = BitConverter.ToInt32(encrypted, offset); offset += 4;
        byte[] salt = new byte[SaltSize];
        Array.Copy(encrypted, offset, salt, 0, SaltSize); offset += SaltSize;
        byte[] iv = new byte[IvSize];
        Array.Copy(encrypted, offset, iv, 0, IvSize); offset += IvSize;
        byte[] tag = new byte[TagSize];
        Array.Copy(encrypted, offset, tag, 0, TagSize); offset += TagSize;
        int ctLen = encrypted.Length - offset;
        byte[] ciphertext = new byte[ctLen];
        Array.Copy(encrypted, offset, ciphertext, 0, ctLen);

        using var key = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password), salt, iterations,
            HashAlgorithmName.SHA256, KeySize / 8);

        using var aes = AesGcm.Create(key);
        byte[] plaintext = new byte[ciphertext.Length];
        aes.Decrypt(iv, ciphertext, tag, plaintext);

        return Task.FromResult(plaintext);
    }

    public bool ValidatePasswordHash(string filePath, string password)
    {
        try
        {
            byte[] encrypted = File.ReadAllBytes(filePath);
            if (encrypted.Length < HeaderSize) return false;

            int offset = MagicHeader.Length;
            byte[] header = new byte[MagicHeader.Length];
            Array.Copy(encrypted, 0, header, 0, MagicHeader.Length);
            if (!header.SequenceEqual(MagicHeader)) return false;

            int iterations = BitConverter.ToInt32(encrypted, offset); offset += 4;
            byte[] salt = new byte[SaltSize];
            Array.Copy(encrypted, offset, salt, 0, SaltSize); offset += SaltSize;
            byte[] iv = new byte[IvSize];
            Array.Copy(encrypted, offset, iv, 0, IvSize); offset += IvSize;
            byte[] tag = new byte[TagSize];
            Array.Copy(encrypted, offset, tag, 0, TagSize); offset += TagSize;
            byte[] ciphertext = new byte[encrypted.Length - offset];
            Array.Copy(encrypted, offset, ciphertext, 0, ciphertext.Length);

            using var key = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(password), salt, iterations,
                HashAlgorithmName.SHA256, KeySize / 8);

            using var aes = AesGcm.Create(key);
            byte[] plaintext = new byte[ciphertext.Length];
            aes.Decrypt(iv, ciphertext, tag, plaintext);
            return true;
        }
        catch { return false; }
    }

    public string GenerateBackupFileName(string originalPath)
    {
        string dir = Path.GetDirectoryName(originalPath) ?? ".";
        string name = Path.GetFileNameWithoutExtension(originalPath);
        string ext = Path.GetExtension(originalPath);
        return Path.Combine(dir, $"{name}_backup_{DateTime.Now:yyyyMMdd_HHmmss}{ext}");
    }
}

public class ProjectLoadProgressEventArgs : EventArgs
{
    public int Percent { get; }
    public string Message { get; }

    public ProjectLoadProgressEventArgs(int percent, string message)
    {
        Percent = percent;
        Message = message;
    }
}
