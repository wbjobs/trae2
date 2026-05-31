using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace StudioAudioMatrix.Models;

public class TimelineTrack : INotifyPropertyChanged
{
    private string _id = Guid.NewGuid().ToString("N");
    private string _name = string.Empty;
    private bool _isMuted;
    private bool _isSolo;
    private double _volume = 1.0;
    private ObservableCollection<TimelineEvent> _events = new();
    private string? _targetDeviceId;

    public string Id
    {
        get => _id;
        set { _id = value; OnPropertyChanged(); }
    }

    public string Name
    {
        get => _name;
        set { _name = value; OnPropertyChanged(); }
    }

    public bool IsMuted
    {
        get => _isMuted;
        set { _isMuted = value; OnPropertyChanged(); }
    }

    public bool IsSolo
    {
        get => _isSolo;
        set { _isSolo = value; OnPropertyChanged(); }
    }

    public double Volume
    {
        get => _volume;
        set { _volume = value; OnPropertyChanged(); }
    }

    public ObservableCollection<TimelineEvent> Events
    {
        get => _events;
        set { _events = value; OnPropertyChanged(); }
    }

    public string? TargetDeviceId
    {
        get => _targetDeviceId;
        set { _targetDeviceId = value; OnPropertyChanged(); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? string.Empty));
}

public class TimelineEvent : INotifyPropertyChanged
{
    private string _id = Guid.NewGuid().ToString("N");
    private double _startTimeMs;
    private double _durationMs = 1000;
    private string _effectType = "Tone";
    private double _gain = 1.0;
    private string _parametersJson = "{}";
    private bool _isEnabled = true;

    public string Id
    {
        get => _id;
        set { _id = value; OnPropertyChanged(); }
    }

    public double StartTimeMs
    {
        get => _startTimeMs;
        set { _startTimeMs = value; OnPropertyChanged(); }
    }

    public double DurationMs
    {
        get => _durationMs;
        set { _durationMs = value; OnPropertyChanged(); }
    }

    public string EffectType
    {
        get => _effectType;
        set { _effectType = value; OnPropertyChanged(); }
    }

    public double Gain
    {
        get => _gain;
        set { _gain = value; OnPropertyChanged(); }
    }

    public string ParametersJson
    {
        get => _parametersJson;
        set { _parametersJson = value; OnPropertyChanged(); }
    }

    public bool IsEnabled
    {
        get => _isEnabled;
        set { _isEnabled = value; OnPropertyChanged(); }
    }

    public double EndTimeMs => StartTimeMs + DurationMs;

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? string.Empty));
}
