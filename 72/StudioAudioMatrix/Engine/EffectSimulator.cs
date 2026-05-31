using System.Diagnostics;

namespace StudioAudioMatrix.Engine;

public class EffectSimulator
{
    private readonly Dictionary<string, double> _activeEffects = new();
    private readonly object _lock = new();

    public event EventHandler<EffectSimulatedEventArgs>? EffectSimulated;

    public Task SimulateAsync(SimulatorCommand command)
    {
        switch (command.CommandType)
        {
            case "trigger":
                SimulateTrigger(command);
                break;
            case "matrix_update":
                break;
            case "device_config":
                break;
        }

        EffectSimulated?.Invoke(this, new EffectSimulatedEventArgs(command));
        return Task.CompletedTask;
    }

    private void SimulateTrigger(SimulatorCommand command)
    {
        double intensity = 0;

        switch (command.EffectType?.ToLowerInvariant())
        {
            case "tone":
                intensity = command.Gain * 0.8;
                break;
            case "noise":
                intensity = command.Gain * 0.6;
                break;
            case "sweep":
                intensity = command.Gain * 0.9;
                break;
            case "reverb":
                intensity = command.Gain * 0.4;
                break;
            case "delay":
                intensity = command.Gain * 0.5;
                break;
            default:
                intensity = command.Gain * 0.5;
                break;
        }

        lock (_lock)
        {
            if (!string.IsNullOrEmpty(command.EventId))
                _activeEffects[command.EventId] = intensity;
        }

        Debug.WriteLine($"[EffectSim] Trigger {command.EffectType} gain={command.Gain:F2} dur={command.DurationMs}ms");
    }

    public double GetCurrentIntensity()
    {
        lock (_lock)
        {
            return _activeEffects.Values.DefaultIfEmpty(0).Sum();
        }
    }

    public void ClearAll()
    {
        lock (_lock) { _activeEffects.Clear(); }
    }
}

public class EffectSimulatedEventArgs : EventArgs
{
    public SimulatorCommand Command { get; }

    public EffectSimulatedEventArgs(SimulatorCommand command)
    {
        Command = command;
    }
}
