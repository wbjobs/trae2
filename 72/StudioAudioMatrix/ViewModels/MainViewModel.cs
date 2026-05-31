using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Input;
using StudioAudioMatrix.Engine;
using StudioAudioMatrix.Models;
using StudioAudioMatrix.Services;

namespace StudioAudioMatrix.ViewModels;

public class MainViewModel : INotifyPropertyChanged
{
    private readonly ProjectManager _projectManager;
    private readonly SoundFieldEngine _soundFieldEngine;
    private readonly AudioSimulatorAdapter _simulatorAdapter;
    private readonly TimelinePlayer _timelinePlayer;
    private readonly TemplateManager _templateManager;

    private Project _currentProject;
    private AudioDevice? _selectedDevice;
    private MatrixCell? _selectedCell;
    private TimelineTrack? _selectedTrack;
    private SoundZone? _selectedZone;
    private LayoutTemplate? _selectedTemplate;
    private bool _isSimulating;
    private string _statusMessage = "就绪";
    private double _soundFieldCoverage;
    private double _lastComputationMs;
    private string _connectionStatus = "未连接";
    private int _loadProgress;
    private string _loadProgressMessage = string.Empty;
    private string _zoneStatsText = string.Empty;

    public MainViewModel()
    {
        _projectManager = new ProjectManager();
        _soundFieldEngine = new SoundFieldEngine();
        _simulatorAdapter = new AudioSimulatorAdapter();
        _timelinePlayer = new TimelinePlayer(_simulatorAdapter);
        _templateManager = new TemplateManager();

        _currentProject = _projectManager.CreateNewProject();

        _soundFieldEngine.SoundFieldUpdated += OnSoundFieldUpdated;
        _soundFieldEngine.ZoneSPLComputed += OnZoneSPLComputed;
        _timelinePlayer.PlayheadUpdated += OnPlayheadUpdated;
        _timelinePlayer.EventFired += OnEventFired;
        _timelinePlayer.PlaybackStarted += OnPlaybackStarted;
        _timelinePlayer.PlaybackStopped += OnPlaybackStopped;
        _simulatorAdapter.SimulatorConnected += OnSimulatorConnected;
        _simulatorAdapter.SimulatorDisconnected += OnSimulatorDisconnected;
        _projectManager.ProjectSaved += OnProjectSaved;
        _projectManager.ProjectLoaded += OnProjectLoaded;
        _projectManager.ProjectError += OnProjectError;
        _projectManager.LoadProgress += OnLoadProgress;

        NewProjectCommand = new RelayCommand(_ => ExecuteNewProject());
        SaveProjectCommand = new RelayCommand(async _ => await ExecuteSaveProject());
        LoadProjectCommand = new RelayCommand(async _ => await ExecuteLoadProject());
        AddDeviceCommand = new RelayCommand(_ => ExecuteAddDevice());
        RemoveDeviceCommand = new RelayCommand(_ => ExecuteRemoveDevice());
        ComputeSoundFieldCommand = new RelayCommand(async _ => await ExecuteComputeSoundField());
        StartPlaybackCommand = new RelayCommand(_ => ExecuteStartPlayback());
        PausePlaybackCommand = new RelayCommand(_ => ExecutePausePlayback());
        StopPlaybackCommand = new RelayCommand(_ => ExecuteStopPlayback());
        ConnectSimulatorCommand = new RelayCommand(async _ => await ExecuteConnectSimulator());
        ToggleCellCommand = new RelayCommand<MatrixCell>(ExecuteToggleCell);
        AddTrackCommand = new RelayCommand(_ => ExecuteAddTrack());
        AddEventCommand = new RelayCommand(_ => ExecuteAddEvent());
        AddZoneCommand = new RelayCommand(_ => ExecuteAddZone());
        RemoveZoneCommand = new RelayCommand(_ => ExecuteRemoveZone());
        ApplyTemplateCommand = new RelayCommand(_ => ExecuteApplyTemplate());
        SaveAsTemplateCommand = new RelayCommand(_ => ExecuteSaveAsTemplate());
        DeleteTemplateCommand = new RelayCommand(_ => ExecuteDeleteTemplate());
    }

    public Project CurrentProject
    {
        get => _currentProject;
        set { _currentProject = value; OnPropertyChanged(); }
    }

    public AudioDevice? SelectedDevice
    {
        get => _selectedDevice;
        set { _selectedDevice = value; OnPropertyChanged(); }
    }

    public MatrixCell? SelectedCell
    {
        get => _selectedCell;
        set { _selectedCell = value; OnPropertyChanged(); }
    }

    public TimelineTrack? SelectedTrack
    {
        get => _selectedTrack;
        set { _selectedTrack = value; OnPropertyChanged(); }
    }

    public SoundZone? SelectedZone
    {
        get => _selectedZone;
        set { _selectedZone = value; OnPropertyChanged(); }
    }

    public LayoutTemplate? SelectedTemplate
    {
        get => _selectedTemplate;
        set { _selectedTemplate = value; OnPropertyChanged(); }
    }

    public bool IsSimulating
    {
        get => _isSimulating;
        set { _isSimulating = value; OnPropertyChanged(); }
    }

    public string StatusMessage
    {
        get => _statusMessage;
        set { _statusMessage = value; OnPropertyChanged(); }
    }

    public double SoundFieldCoverage
    {
        get => _soundFieldCoverage;
        set { _soundFieldCoverage = value; OnPropertyChanged(); }
    }

    public double LastComputationMs
    {
        get => _lastComputationMs;
        set { _lastComputationMs = value; OnPropertyChanged(); }
    }

    public string ConnectionStatus
    {
        get => _connectionStatus;
        set { _connectionStatus = value; OnPropertyChanged(); }
    }

    public int LoadProgress
    {
        get => _loadProgress;
        set { _loadProgress = value; OnPropertyChanged(); }
    }

    public string LoadProgressMessage
    {
        get => _loadProgressMessage;
        set { _loadProgressMessage = value; OnPropertyChanged(); }
    }

    public string ZoneStatsText
    {
        get => _zoneStatsText;
        set { _zoneStatsText = value; OnPropertyChanged(); }
    }

    public SoundFieldEngine SoundFieldEngine => _soundFieldEngine;
    public TimelinePlayer TimelinePlayer => _timelinePlayer;
    public AudioSimulatorAdapter SimulatorAdapter => _simulatorAdapter;
    public ProjectManager ProjectManager => _projectManager;
    public TemplateManager TemplateManager => _templateManager;

    public ObservableCollection<LayoutTemplate> BuiltInTemplates => _templateManager.BuiltInTemplates;
    public ObservableCollection<LayoutTemplate> UserTemplates => _templateManager.UserTemplates;

    public ICommand NewProjectCommand { get; }
    public ICommand SaveProjectCommand { get; }
    public ICommand LoadProjectCommand { get; }
    public ICommand AddDeviceCommand { get; }
    public ICommand RemoveDeviceCommand { get; }
    public ICommand ComputeSoundFieldCommand { get; }
    public ICommand StartPlaybackCommand { get; }
    public ICommand PausePlaybackCommand { get; }
    public ICommand StopPlaybackCommand { get; }
    public ICommand ConnectSimulatorCommand { get; }
    public ICommand<MatrixCell> ToggleCellCommand { get; }
    public ICommand AddTrackCommand { get; }
    public ICommand AddEventCommand { get; }
    public ICommand AddZoneCommand { get; }
    public ICommand RemoveZoneCommand { get; }
    public ICommand ApplyTemplateCommand { get; }
    public ICommand SaveAsTemplateCommand { get; }
    public ICommand DeleteTemplateCommand { get; }

    private void ExecuteNewProject()
    {
        CurrentProject = _projectManager.CreateNewProject();
        StatusMessage = "已创建新工程";
    }

    private async Task ExecuteSaveProject()
    {
        var dlg = new Microsoft.Win32.SaveFileDialog
        {
            Filter = "音频矩阵工程 (*.samproj)|*.samproj|所有文件 (*.*)|*.*",
            FileName = CurrentProject.Name
        };

        if (dlg.ShowDialog() == true)
        {
            var passDlg = new PasswordDialog { Owner = Application.Current.MainWindow };
            if (passDlg.ShowDialog() == true)
            {
                bool ok = await _projectManager.SaveProjectAsync(CurrentProject, dlg.FileName, passDlg.Password);
                if (ok) StatusMessage = $"工程已保存: {dlg.FileName}";
            }
        }
    }

    private async Task ExecuteLoadProject()
    {
        var dlg = new Microsoft.Win32.OpenFileDialog
        {
            Filter = "音频矩阵工程 (*.samproj)|*.samproj|所有文件 (*.*)|*.*"
        };

        if (dlg.ShowDialog() == true)
        {
            var passDlg = new PasswordDialog { Owner = Application.Current.MainWindow };
            if (passDlg.ShowDialog() == true)
            {
                var proj = await _projectManager.LoadProjectAsync(dlg.FileName, passDlg.Password);
                if (proj != null)
                {
                    CurrentProject = proj;
                    StatusMessage = $"工程已加载: {dlg.FileName}";
                }
            }
        }
    }

    private void ExecuteAddDevice()
    {
        var device = new AudioDevice
        {
            Name = $"设备 {CurrentProject.Devices.Count + 1}",
            Type = DeviceType.MainSpeaker,
            X = 5 + CurrentProject.Devices.Count * 2,
            Y = 2,
            Z = 5,
            Gain = 1.0
        };
        CurrentProject.Devices.Add(device);
        SelectedDevice = device;
        StatusMessage = $"已添加设备: {device.Name}";
    }

    private void ExecuteRemoveDevice()
    {
        if (SelectedDevice != null)
        {
            CurrentProject.Devices.Remove(SelectedDevice);
            SelectedDevice = null;
            StatusMessage = "设备已移除";
        }
    }

    private async Task ExecuteComputeSoundField()
    {
        IsSimulating = true;
        StatusMessage = "正在计算声场...";

        var field = new SoundField
        {
            StudioWidth = CurrentProject.StudioWidth,
            StudioHeight = CurrentProject.StudioHeight,
            StudioDepth = CurrentProject.StudioDepth,
            GridResolution = 60
        };

        var points = await _soundFieldEngine.ComputeFieldAsync(
            CurrentProject.Devices, field, CurrentProject.Zones);
        SoundFieldCoverage = await _soundFieldEngine.ComputeCoverageRatioAsync(points, 85.0);

        StatusMessage = $"声场计算完成, 覆盖率: {SoundFieldCoverage:P1}";
        IsSimulating = false;
    }

    private void ExecuteStartPlayback()
    {
        if (_timelinePlayer.IsPlaying)
            _timelinePlayer.Resume();
        else
            _timelinePlayer.Start(CurrentProject.Tracks);
    }

    private void ExecutePausePlayback() => _timelinePlayer.Pause();

    private void ExecuteStopPlayback() => _timelinePlayer.Stop();

    private async Task ExecuteConnectSimulator()
    {
        var ports = _simulatorAdapter.GetAvailablePorts();
        if (ports.Length == 0)
        {
            StatusMessage = "未检测到串口设备";
            return;
        }

        bool ok = await _simulatorAdapter.ConnectAsync(ports[0]);
        StatusMessage = ok ? $"已连接到 {ports[0]}" : "连接失败";
    }

    private void ExecuteToggleCell(MatrixCell? cell)
    {
        if (cell != null)
        {
            cell.IsActive = !cell.IsActive;
            cell.SignalLevel = cell.IsActive ? 0.7 : 0;
            _ = _simulatorAdapter.SendMatrixUpdateAsync(cell);
        }
    }

    private void ExecuteAddTrack()
    {
        var track = new TimelineTrack
        {
            Name = $"轨道 {CurrentProject.Tracks.Count + 1}"
        };
        CurrentProject.Tracks.Add(track);
        SelectedTrack = track;
    }

    private void ExecuteAddEvent()
    {
        if (SelectedTrack != null)
        {
            var lastEvent = SelectedTrack.Events.LastOrDefault();
            double startTime = lastEvent != null ? lastEvent.EndTimeMs + 200 : 0;

            var ev = new TimelineEvent
            {
                StartTimeMs = startTime,
                DurationMs = 1000,
                EffectType = "Tone",
                Gain = 0.8
            };
            SelectedTrack.Events.Add(ev);
        }
    }

    private void ExecuteAddZone()
    {
        var zone = new SoundZone
        {
            Name = $"区域 {CurrentProject.Zones.Count + 1}",
            Type = ZoneType.Audience,
            X = CurrentProject.StudioWidth / 4,
            Z = CurrentProject.StudioDepth / 4,
            Width = CurrentProject.StudioWidth / 2,
            Depth = CurrentProject.StudioDepth / 2,
            TargetSPL = 85.0,
            ColorHex = "#FF4CAF50"
        };
        CurrentProject.Zones.Add(zone);
        SelectedZone = zone;
        StatusMessage = $"已添加区域: {zone.Name}";
    }

    private void ExecuteRemoveZone()
    {
        if (SelectedZone != null)
        {
            CurrentProject.Zones.Remove(SelectedZone);
            SelectedZone = null;
            StatusMessage = "区域已移除";
        }
    }

    private void ExecuteApplyTemplate()
    {
        if (SelectedTemplate != null)
        {
            _templateManager.ApplyTemplateToProject(SelectedTemplate, CurrentProject);
            StatusMessage = $"已应用模板: {SelectedTemplate.Name}";
        }
    }

    private void ExecuteSaveAsTemplate()
    {
        var name = CurrentProject.Name + " 模板";
        var template = _templateManager.CreateTemplateFromProject(CurrentProject, name);
        _templateManager.SaveUserTemplate(template, name);
        StatusMessage = $"已保存为模板: {name}";
    }

    private void ExecuteDeleteTemplate()
    {
        if (SelectedTemplate != null && !SelectedTemplate.IsBuiltIn)
        {
            _templateManager.DeleteUserTemplate(SelectedTemplate.Id);
            SelectedTemplate = null;
            StatusMessage = "模板已删除";
        }
    }

    private void OnSoundFieldUpdated(object? sender, SoundFieldUpdatedEventArgs e)
    {
        LastComputationMs = e.ElapsedMs;
    }

    private void OnZoneSPLComputed(object? sender, ZoneSPLResultEventArgs e)
    {
        ZoneStatsText = $"{e.ZoneName}: 平均 {e.AverageSPL:F1} dB | 范围 {e.MinSPL:F1}~{e.MaxSPL:F1} dB | 达标 {e.Coverage:P0}";
    }

    private void OnPlayheadUpdated(object? sender, PlayheadUpdatedEventArgs e) { }
    private void OnEventFired(object? sender, TimelineEventFiredEventArgs e) { }

    private void OnPlaybackStarted(object? sender, EventArgs e)
    {
        IsSimulating = true;
        StatusMessage = "播放中...";
    }

    private void OnPlaybackStopped(object? sender, EventArgs e)
    {
        IsSimulating = false;
        StatusMessage = "播放已停止";
    }

    private void OnSimulatorConnected(object? sender, string port) => ConnectionStatus = $"已连接 ({port})";
    private void OnSimulatorDisconnected(object? sender, string port) => ConnectionStatus = "未连接";
    private void OnProjectSaved(object? sender, string path) { }
    private void OnProjectLoaded(object? sender, string path) { }

    private void OnProjectError(object? sender, string error)
    {
        StatusMessage = error;
        MessageBox.Show(error, "错误", MessageBoxButton.OK, MessageBoxImage.Error);
    }

    private void OnLoadProgress(object? sender, ProjectLoadProgressEventArgs e)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            LoadProgress = e.Percent;
            LoadProgressMessage = e.Message;
        });
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? string.Empty));
}

public class RelayCommand : ICommand
{
    private readonly Action<object?> _execute;
    private readonly Predicate<object?>? _canExecute;

    public RelayCommand(Action<object?> execute, Predicate<object?>? canExecute = null)
    {
        _execute = execute;
        _canExecute = canExecute;
    }

    public event EventHandler? CanExecuteChanged
    {
        add { CommandManager.RequerySuggested += value; }
        remove { CommandManager.RequerySuggested -= value; }
    }

    public bool CanExecute(object? parameter) => _canExecute == null || _canExecute(parameter);
    public void Execute(object? parameter) => _execute(parameter);
}

public class RelayCommand<T> : ICommand
{
    private readonly Action<T?> _execute;
    private readonly Predicate<T?>? _canExecute;

    public RelayCommand(Action<T?> execute, Predicate<T?>? canExecute = null)
    {
        _execute = execute;
        _canExecute = canExecute;
    }

    public event EventHandler? CanExecuteChanged
    {
        add { CommandManager.RequerySuggested += value; }
        remove { CommandManager.RequerySuggested -= value; }
    }

    public bool CanExecute(object? parameter)
    {
        if (parameter == null && typeof(T).IsValueType) return false;
        return _canExecute == null || _canExecute((T?)parameter);
    }

    public void Execute(object? parameter) => _execute((T?)parameter);
}
