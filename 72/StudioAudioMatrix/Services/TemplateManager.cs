using System.Collections.ObjectModel;
using System.Text.Json;
using StudioAudioMatrix.Models;

namespace StudioAudioMatrix.Services;

public class TemplateManager
{
    private readonly string _userTemplatesDir;
    private readonly ObservableCollection<LayoutTemplate> _builtInTemplates = new();
    private readonly ObservableCollection<LayoutTemplate> _userTemplates = new();

    public event EventHandler<string>? TemplateSaved;
    public event EventHandler<string>? TemplateLoaded;

    public TemplateManager()
    {
        _userTemplatesDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "StudioAudioMatrix",
            "Templates");

        Directory.CreateDirectory(_userTemplatesDir);
        InitializeBuiltInTemplates();
        LoadUserTemplates();
    }

    public ObservableCollection<LayoutTemplate> BuiltInTemplates => _builtInTemplates;
    public ObservableCollection<LayoutTemplate> UserTemplates => _userTemplates;

    public IEnumerable<LayoutTemplate> AllTemplates => _builtInTemplates.Concat(_userTemplates);

    private void InitializeBuiltInTemplates()
    {
        _builtInTemplates.Add(CreateSmallStudioTemplate());
        _builtInTemplates.Add(CreateMediumTheaterTemplate());
        _builtInTemplates.Add(CreateLargeConcertHallTemplate());
        _builtInTemplates.Add(CreateConferenceRoomTemplate());
        _builtInTemplates.Add(CreateSurroundStudioTemplate());
    }

    private static LayoutTemplate CreateSmallStudioTemplate()
    {
        var template = new LayoutTemplate
        {
            Id = "builtin_small_001",
            Name = "小型录音棚",
            Description = "适用于 10x8 米的小型工作室，2.1 声道配置",
            Category = "录音棚",
            StudioWidth = 10,
            StudioHeight = 4,
            StudioDepth = 8,
            IsBuiltIn = true,
            DeviceCount = 3
        };

        template.Devices.Add(new AudioDevice
        {
            Id = "dev_1",
            Name = "主音箱 L",
            Type = DeviceType.MainSpeaker,
            X = 1, Y = 2, Z = 1,
            Gain = 1.0
        });
        template.Devices.Add(new AudioDevice
        {
            Id = "dev_2",
            Name = "主音箱 R",
            Type = DeviceType.MainSpeaker,
            X = 9, Y = 2, Z = 1,
            Gain = 1.0
        });
        template.Devices.Add(new AudioDevice
        {
            Id = "dev_3",
            Name = "低音炮",
            Type = DeviceType.Subwoofer,
            X = 5, Y = 0.5, Z = 0.5,
            Gain = 0.8
        });

        template.Zones.Add(new SoundZone
        {
            Id = "zone_1",
            Name = "听音区",
            Type = ZoneType.Audience,
            X = 2, Z = 4,
            Width = 6, Depth = 3,
            TargetSPL = 85,
            ColorHex = "#FF4CAF50"
        });

        InitializeMatrixCells(template);
        return template;
    }

    private static LayoutTemplate CreateMediumTheaterTemplate()
    {
        var template = new LayoutTemplate
        {
            Id = "builtin_theater_001",
            Name = "中型剧场",
            Description = "适用于 20x15 米的中型剧场，5.1 环绕声配置",
            Category = "剧场",
            StudioWidth = 20,
            StudioHeight = 8,
            StudioDepth = 15,
            IsBuiltIn = true,
            DeviceCount = 6
        };

        template.Devices.Add(new AudioDevice { Id = "fl", Name = "前置左", Type = DeviceType.MainSpeaker, X = 2, Y = 4, Z = 1, Gain = 1.0 });
        template.Devices.Add(new AudioDevice { Id = "fc", Name = "中置", Type = DeviceType.MainSpeaker, X = 10, Y = 4, Z = 0.5, Gain = 1.0 });
        template.Devices.Add(new AudioDevice { Id = "fr", Name = "前置右", Type = DeviceType.MainSpeaker, X = 18, Y = 4, Z = 1, Gain = 1.0 });
        template.Devices.Add(new AudioDevice { Id = "sl", Name = "环绕左", Type = DeviceType.Surround, X = 1, Y = 3.5, Z = 8, Gain = 0.7 });
        template.Devices.Add(new AudioDevice { Id = "sr", Name = "环绕右", Type = DeviceType.Surround, X = 19, Y = 3.5, Z = 8, Gain = 0.7 });
        template.Devices.Add(new AudioDevice { Id = "sw", Name = "低音炮", Type = DeviceType.Subwoofer, X = 10, Y = 1, Z = 2, Gain = 0.9 });

        template.Zones.Add(new SoundZone { Id = "z1", Name = "观众席前区", Type = ZoneType.Audience, X = 4, Z = 5, Width = 12, Depth = 5, TargetSPL = 90, ColorHex = "#FFFF9800" });
        template.Zones.Add(new SoundZone { Id = "z2", Name = "观众席后区", Type = ZoneType.Audience, X = 4, Z = 10, Width = 12, Depth = 4, TargetSPL = 85, ColorHex = "#FF4CAF50" });
        template.Zones.Add(new SoundZone { Id = "z3", Name = "舞台区", Type = ZoneType.Stage, X = 6, Z = 0, Width = 8, Depth = 3, TargetSPL = 95, ColorHex = "#FF2196F3" });

        InitializeMatrixCells(template);
        return template;
    }

    private static LayoutTemplate CreateLargeConcertHallTemplate()
    {
        var template = new LayoutTemplate
        {
            Id = "builtin_concert_001",
            Name = "大型音乐厅",
            Description = "适用于 30x25 米的大型音乐厅，线阵列 + 分布式系统",
            Category = "音乐厅",
            StudioWidth = 30,
            StudioHeight = 12,
            StudioDepth = 25,
            IsBuiltIn = true,
            DeviceCount = 12
        };

        for (int i = 0; i < 4; i++)
        {
            template.Devices.Add(new AudioDevice
            {
                Id = $"la_l_{i}",
                Name = $"线阵列左-{i + 1}",
                Type = DeviceType.LineArray,
                X = 3, Y = 6 + i * 1.5, Z = 2,
                Gain = 1.0
            });
            template.Devices.Add(new AudioDevice
            {
                Id = $"la_r_{i}",
                Name = $"线阵列右-{i + 1}",
                Type = DeviceType.LineArray,
                X = 27, Y = 6 + i * 1.5, Z = 2,
                Gain = 1.0
            });
        }

        template.Devices.Add(new AudioDevice { Id = "sub_1", Name = "超低左", Type = DeviceType.Subwoofer, X = 8, Y = 1, Z = 1, Gain = 1.0 });
        template.Devices.Add(new AudioDevice { Id = "sub_2", Name = "超低右", Type = DeviceType.Subwoofer, X = 22, Y = 1, Z = 1, Gain = 1.0 });
        template.Devices.Add(new AudioDevice { Id = "ff_1", Name = "前场补声", Type = DeviceType.MainSpeaker, X = 15, Y = 3, Z = 6, Gain = 0.6 });
        template.Devices.Add(new AudioDevice { Id = "del_1", Name = "延时补声", Type = DeviceType.MainSpeaker, X = 15, Y = 4, Z = 15, Gain = 0.5, DelayMs = 30 });

        template.Zones.Add(new SoundZone { Id = "z1", Name = "VIP 区", Type = ZoneType.VIP, X = 10, Z = 5, Width = 10, Depth = 5, TargetSPL = 92, ColorHex = "#FFE91E63" });
        template.Zones.Add(new SoundZone { Id = "z2", Name = "池座区", Type = ZoneType.Audience, X = 5, Z = 10, Width = 20, Depth = 10, TargetSPL = 88, ColorHex = "#FF4CAF50" });
        template.Zones.Add(new SoundZone { Id = "z3", Name = "舞台", Type = ZoneType.Stage, X = 8, Z = 0, Width = 14, Depth = 3, TargetSPL = 95, ColorHex = "#FF2196F3" });

        InitializeMatrixCells(template);
        return template;
    }

    private static LayoutTemplate CreateConferenceRoomTemplate()
    {
        var template = new LayoutTemplate
        {
            Id = "builtin_conf_001",
            Name = "会议室",
            Description = "适用于 12x10 米的会议室，分布式吸顶扬声器",
            Category = "会议室",
            StudioWidth = 12,
            StudioHeight = 3.5,
            StudioDepth = 10,
            IsBuiltIn = true,
            DeviceCount = 6
        };

        double[] xPos = { 3, 6, 9, 3, 6, 9 };
        double[] zPos = { 2.5, 2.5, 2.5, 7.5, 7.5, 7.5 };

        for (int i = 0; i < 6; i++)
        {
            template.Devices.Add(new AudioDevice
            {
                Id = $"ceil_{i}",
                Name = $"吸顶-{i + 1}",
                Type = DeviceType.Ceiling,
                X = xPos[i], Y = 3, Z = zPos[i],
                Gain = 0.7
            });
        }

        template.Zones.Add(new SoundZone { Id = "z1", Name = "会议桌区", Type = ZoneType.Custom, X = 3, Z = 3, Width = 6, Depth = 4, TargetSPL = 75, ColorHex = "#FF00BCD4" });

        InitializeMatrixCells(template);
        return template;
    }

    private static LayoutTemplate CreateSurroundStudioTemplate()
    {
        var template = new LayoutTemplate
        {
            Id = "builtin_surround_001",
            Name = "7.1.4 混音棚",
            Description = "专业杜比全景声混音室配置",
            Category = "混音棚",
            StudioWidth = 14,
            StudioHeight = 5,
            StudioDepth = 10,
            IsBuiltIn = true,
            DeviceCount = 12
        };

        template.Devices.Add(new AudioDevice { Id = "fl", Name = "前置左", Type = DeviceType.MainSpeaker, X = 1, Y = 2, Z = 0.5, Gain = 1.0 });
        template.Devices.Add(new AudioDevice { Id = "fc", Name = "中置", Type = DeviceType.MainSpeaker, X = 7, Y = 2, Z = 0.3, Gain = 1.0 });
        template.Devices.Add(new AudioDevice { Id = "fr", Name = "前置右", Type = DeviceType.MainSpeaker, X = 13, Y = 2, Z = 0.5, Gain = 1.0 });
        template.Devices.Add(new AudioDevice { Id = "sl", Name = "侧环绕左", Type = DeviceType.Surround, X = 0.5, Y = 2.2, Z = 4, Gain = 0.8 });
        template.Devices.Add(new AudioDevice { Id = "sr", Name = "侧环绕右", Type = DeviceType.Surround, X = 13.5, Y = 2.2, Z = 4, Gain = 0.8 });
        template.Devices.Add(new AudioDevice { Id = "bl", Name = "后环绕左", Type = DeviceType.Surround, X = 2, Y = 2.2, Z = 9.5, Gain = 0.7 });
        template.Devices.Add(new AudioDevice { Id = "br", Name = "后环绕右", Type = DeviceType.Surround, X = 12, Y = 2.2, Z = 9.5, Gain = 0.7 });
        template.Devices.Add(new AudioDevice { Id = "sw", Name = "低音炮", Type = DeviceType.Subwoofer, X = 7, Y = 0.5, Z = 1, Gain = 0.9 });
        template.Devices.Add(new AudioDevice { Id = "tf1", Name = "顶置前左", Type = DeviceType.Ceiling, X = 3, Y = 4.5, Z = 2, Gain = 0.6 });
        template.Devices.Add(new AudioDevice { Id = "tf2", Name = "顶置前右", Type = DeviceType.Ceiling, X = 11, Y = 4.5, Z = 2, Gain = 0.6 });
        template.Devices.Add(new AudioDevice { Id = "tr1", Name = "顶置后左", Type = DeviceType.Ceiling, X = 3, Y = 4.5, Z = 8, Gain = 0.6 });
        template.Devices.Add(new AudioDevice { Id = "tr2", Name = "顶置后右", Type = DeviceType.Ceiling, X = 11, Y = 4.5, Z = 8, Gain = 0.6 });

        template.Zones.Add(new SoundZone { Id = "z1", Name = "混音位", Type = ZoneType.Custom, X = 5, Z = 5, Width = 4, Depth = 2, TargetSPL = 85, ColorHex = "#FFF44336" });
        template.Zones.Add(new SoundZone { Id = "z2", Name = "审听区", Type = ZoneType.Custom, X = 4, Z = 7, Width = 6, Depth = 2, TargetSPL = 82, ColorHex = "#FFFFC107" });

        InitializeMatrixCells(template);
        return template;
    }

    private static void InitializeMatrixCells(LayoutTemplate template)
    {
        for (int r = 0; r < template.MatrixRows; r++)
        {
            for (int c = 0; c < template.MatrixColumns; c++)
            {
                template.MatrixCells.Add(new MatrixCell
                {
                    Row = r,
                    Column = c,
                    IsActive = false,
                    Gain = 1.0
                });
            }
        }
    }

    private void LoadUserTemplates()
    {
        try
        {
            foreach (var file in Directory.GetFiles(_userTemplatesDir, "*.json"))
            {
                try
                {
                    string json = File.ReadAllText(file);
                    var template = JsonSerializer.Deserialize<LayoutTemplate>(json);
                    if (template != null)
                    {
                        template.IsBuiltIn = false;
                        _userTemplates.Add(template);
                    }
                }
                catch
                {
                }
            }
        }
        catch
        {
        }
    }

    public void SaveUserTemplate(LayoutTemplate template, string name)
    {
        template.Id = Guid.NewGuid().ToString("N");
        template.Name = name;
        template.IsBuiltIn = false;
        template.CreatedAt = DateTime.Now;

        string filePath = Path.Combine(_userTemplatesDir, $"{template.Id}.json");
        string json = JsonSerializer.Serialize(template, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(filePath, json);

        _userTemplates.Add(template);
        TemplateSaved?.Invoke(this, name);
    }

    public void DeleteUserTemplate(string templateId)
    {
        var template = _userTemplates.FirstOrDefault(t => t.Id == templateId);
        if (template != null)
        {
            _userTemplates.Remove(template);
            string filePath = Path.Combine(_userTemplatesDir, $"{templateId}.json");
            if (File.Exists(filePath)) File.Delete(filePath);
        }
    }

    public void ApplyTemplateToProject(LayoutTemplate template, Project project)
    {
        project.StudioWidth = template.StudioWidth;
        project.StudioHeight = template.StudioHeight;
        project.StudioDepth = template.StudioDepth;
        project.MatrixRows = template.MatrixRows;
        project.MatrixColumns = template.MatrixColumns;

        project.Devices.Clear();
        foreach (var dev in template.Devices)
        {
            project.Devices.Add(new AudioDevice
            {
                Id = Guid.NewGuid().ToString("N"),
                Name = dev.Name,
                Type = dev.Type,
                X = dev.X,
                Y = dev.Y,
                Z = dev.Z,
                Gain = dev.Gain,
                DelayMs = dev.DelayMs,
                IsEnabled = dev.IsEnabled
            });
        }

        project.Zones.Clear();
        foreach (var zone in template.Zones)
        {
            project.Zones.Add(new SoundZone
            {
                Id = Guid.NewGuid().ToString("N"),
                Name = zone.Name,
                Type = zone.Type,
                X = zone.X,
                Y = zone.Y,
                Z = zone.Z,
                Width = zone.Width,
                Height = zone.Height,
                Depth = zone.Depth,
                TargetSPL = zone.TargetSPL,
                ColorHex = zone.ColorHex,
                IsVisible = zone.IsVisible
            });
        }

        project.MatrixCells.Clear();
        for (int r = 0; r < template.MatrixRows; r++)
        {
            for (int c = 0; c < template.MatrixColumns; c++)
            {
                var src = template.MatrixCells.FirstOrDefault(mc => mc.Row == r && mc.Column == c);
                project.MatrixCells.Add(new MatrixCell
                {
                    Row = r,
                    Column = c,
                    IsActive = src?.IsActive ?? false,
                    Gain = src?.Gain ?? 1.0
                });
            }
        }
    }

    public LayoutTemplate CreateTemplateFromProject(Project project, string name)
    {
        var template = new LayoutTemplate
        {
            Name = name,
            Description = $"从工程 {project.Name} 导出",
            Category = "用户自定义",
            StudioWidth = project.StudioWidth,
            StudioHeight = project.StudioHeight,
            StudioDepth = project.StudioDepth,
            IsBuiltIn = false,
            DeviceCount = project.Devices.Count,
            MatrixRows = project.MatrixRows,
            MatrixColumns = project.MatrixColumns
        };

        foreach (var dev in project.Devices)
            template.Devices.Add(new AudioDevice
            {
                Name = dev.Name,
                Type = dev.Type,
                X = dev.X,
                Y = dev.Y,
                Z = dev.Z,
                Gain = dev.Gain,
                DelayMs = dev.DelayMs
            });

        foreach (var zone in project.Zones)
            template.Zones.Add(new SoundZone
            {
                Name = zone.Name,
                Type = zone.Type,
                X = zone.X,
                Y = zone.Y,
                Z = zone.Z,
                Width = zone.Width,
                Height = zone.Height,
                Depth = zone.Depth,
                TargetSPL = zone.TargetSPL,
                ColorHex = zone.ColorHex
            });

        foreach (var cell in project.MatrixCells)
            template.MatrixCells.Add(new MatrixCell
            {
                Row = cell.Row,
                Column = cell.Column,
                IsActive = cell.IsActive,
                Gain = cell.Gain
            });

        return template;
    }
}
