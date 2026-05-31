using System.Diagnostics;
using StudioAudioMatrix.Models;

namespace StudioAudioMatrix.Engine;

public class TimelinePlayer
{
    private readonly Stopwatch _clock = new();
    private readonly Timer _schedulerTimer;
    private readonly AudioSimulatorAdapter _simulator;
    private readonly object _syncRoot = new();

    private CancellationTokenSource? _cts;
    private Task? _playbackTask;
    private double _playheadMs;
    private bool _isPlaying;
    private double _totalDurationMs;
    private double _playbackSpeed = 1.0;
    private long _lastTickTimestamp;

    public event EventHandler<PlayheadUpdatedEventArgs>? PlayheadUpdated;
    public event EventHandler<TimelineEventFiredEventArgs>? EventFired;
    public event EventHandler? PlaybackStarted;
    public event EventHandler? PlaybackStopped;

    public TimelinePlayer(AudioSimulatorAdapter simulator)
    {
        _simulator = simulator;
        _schedulerTimer = new Timer(SchedulerTick, null, Timeout.Infinite, Timeout.Infinite);
    }

    public double PlayheadMs
    {
        get { lock (_syncRoot) return _playheadMs; }
        private set { lock (_syncRoot) _playheadMs = value; }
    }

    public double TotalDurationMs
    {
        get => _totalDurationMs;
        set => _totalDurationMs = Math.Max(0, value);
    }

    public double PlaybackSpeed
    {
        get => _playbackSpeed;
        set => _playbackSpeed = Math.Max(0.1, Math.Min(4.0, value));
    }

    public bool IsPlaying => _isPlaying;

    public void Start(IEnumerable<TimelineTrack> tracks)
    {
        Stop();

        var activeTracks = tracks.Where(t => !t.IsMuted).ToList();
        _totalDurationMs = activeTracks.SelectMany(t => t.Events).Max(e => (double?)e.EndTimeMs) ?? 0;

        _cts = new CancellationTokenSource();
        _isPlaying = true;
        _lastTickTimestamp = Stopwatch.GetTimestamp();
        _clock.Restart();

        _playbackTask = RunPlaybackAsync(activeTracks, _cts.Token);
        _schedulerTimer.Change(0, (int)Math.Max(5, 1000 / 60));

        PlaybackStarted?.Invoke(this, EventArgs.Empty);
    }

    public void Pause()
    {
        if (!_isPlaying) return;
        _isPlaying = false;
        _schedulerTimer.Change(Timeout.Infinite, Timeout.Infinite);
        _clock.Stop();
    }

    public void Resume()
    {
        if (_isPlaying || _cts == null || _cts.IsCancellationRequested) return;
        _isPlaying = true;
        _lastTickTimestamp = Stopwatch.GetTimestamp();
        _clock.Start();
        _schedulerTimer.Change(0, (int)Math.Max(5, 1000 / 60));
        PlaybackStarted?.Invoke(this, EventArgs.Empty);
    }

    public void Stop()
    {
        _schedulerTimer.Change(Timeout.Infinite, Timeout.Infinite);
        _cts?.Cancel();
        try { _playbackTask?.Wait(500); } catch { }
        _cts?.Dispose();
        _cts = null;
        _playbackTask = null;
        _isPlaying = false;
        _clock.Reset();
        _playheadMs = 0;
        PlaybackStopped?.Invoke(this, EventArgs.Empty);
    }

    public void Seek(double positionMs)
    {
        lock (_syncRoot)
        {
            _playheadMs = Math.Clamp(positionMs, 0, _totalDurationMs);
        }
        PlayheadUpdated?.Invoke(this, new PlayheadUpdatedEventArgs(_playheadMs));
    }

    private async Task RunPlaybackAsync(List<TimelineTrack> tracks, CancellationToken ct)
    {
        var scheduledEvents = new ScheduledEventQueue();

        foreach (var track in tracks)
        {
            foreach (var ev in track.Events.Where(e => e.IsEnabled))
            {
                scheduledEvents.Enqueue(new ScheduledEvent
                {
                    TrackId = track.Id,
                    TrackVolume = track.Volume,
                    Event = ev,
                    TargetDeviceId = track.TargetDeviceId
                });
            }
        }

        try
        {
            while (!ct.IsCancellationRequested && _isPlaying)
            {
                double currentTime;
                lock (_syncRoot) { currentTime = _playheadMs; }

                var toFire = scheduledEvents.DequeueUpTo(currentTime);
                foreach (var se in toFire)
                {
                    await _simulator.TriggerEffectAsync(se.Event, se.TrackVolume, se.TargetDeviceId);
                    EventFired?.Invoke(this, new TimelineEventFiredEventArgs(se.Event, se.TrackId));
                }

                if (currentTime >= _totalDurationMs && scheduledEvents.IsEmpty)
                {
                    Stop();
                    break;
                }

                await Task.Delay(5, ct);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private void SchedulerTick(object? state)
    {
        if (!_isPlaying) return;

        long now = Stopwatch.GetTimestamp();
        double deltaMs = Stopwatch.GetElapsedTime(_lastTickTimestamp, now).TotalMilliseconds * _playbackSpeed;
        _lastTickTimestamp = now;

        double newPosition;
        lock (_syncRoot)
        {
            _playheadMs = Math.Min(_playheadMs + deltaMs, _totalDurationMs);
            newPosition = _playheadMs;
        }

        PlayheadUpdated?.Invoke(this, new PlayheadUpdatedEventArgs(newPosition));
    }
}

public class PlayheadUpdatedEventArgs : EventArgs
{
    public double PositionMs { get; }

    public PlayheadUpdatedEventArgs(double positionMs)
    {
        PositionMs = positionMs;
    }
}

public class TimelineEventFiredEventArgs : EventArgs
{
    public TimelineEvent Event { get; }
    public string TrackId { get; }

    public TimelineEventFiredEventArgs(TimelineEvent ev, string trackId)
    {
        Event = ev;
        TrackId = trackId;
    }
}

internal class ScheduledEvent
{
    public string TrackId { get; init; } = string.Empty;
    public double TrackVolume { get; init; }
    public TimelineEvent Event { get; init; } = null!;
    public string? TargetDeviceId { get; init; }
}

internal class ScheduledEventQueue
{
    private readonly List<ScheduledEvent> _events = new();
    private int _cursor;

    public bool IsEmpty => _cursor >= _events.Count;

    public void Enqueue(ScheduledEvent ev)
    {
        _events.Add(ev);
        _events.Sort((a, b) => a.Event.StartTimeMs.CompareTo(b.Event.StartTimeMs));
    }

    public List<ScheduledEvent> DequeueUpTo(double timeMs)
    {
        var result = new List<ScheduledEvent>();
        while (_cursor < _events.Count && _events[_cursor].Event.StartTimeMs <= timeMs)
        {
            result.Add(_events[_cursor]);
            _cursor++;
        }
        return result;
    }
}
