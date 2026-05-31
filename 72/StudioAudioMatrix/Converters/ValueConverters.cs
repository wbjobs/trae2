using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using StudioAudioMatrix.Models;

namespace StudioAudioMatrix.Converters;

public class DevicePositionConverter : IMultiValueConverter
{
    public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
    {
        if (values.Length < 3 || values[0] is not double pos || values[1] is not double max || values[2] is not double actual)
            return 0.0;
        if (max <= 0) return 0.0;
        return (pos / max) * actual - 18;
    }

    public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
        => throw new NotImplementedException();
}

public class ZonePositionConverter : IMultiValueConverter
{
    public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
    {
        if (values.Length < 3 || values[0] is not double pos || values[1] is not double max || values[2] is not double actual)
            return 0.0;
        if (max <= 0) return 0.0;
        return (pos / max) * actual;
    }

    public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
        => throw new NotImplementedException();
}

public class DeviceTypeToColorConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is not DeviceType type) return Brushes.Gray;
        return type switch
        {
            DeviceType.MainSpeaker => Brushes.DodgerBlue,
            DeviceType.Subwoofer => Brushes.OrangeRed,
            DeviceType.Surround => Brushes.MediumSeaGreen,
            DeviceType.Ceiling => Brushes.Purple,
            DeviceType.StageMonitor => Brushes.Goldenrod,
            DeviceType.Microphone => Brushes.Crimson,
            DeviceType.LineArray => Brushes.Teal,
            _ => Brushes.Gray
        };
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotImplementedException();
}

public class SPLToColorConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is not double spl) return Brushes.Transparent;
        double norm = Math.Clamp((spl - 60) / 60, 0, 1);
        byte r = (byte)(norm * 255);
        byte g = (byte)((1 - norm) * 200);
        return new SolidColorBrush(Color.FromRgb(r, g, 100));
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotImplementedException();
}

public class ProgressVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is int progress)
            return progress > 0 && progress < 100 ? Visibility.Visible : Visibility.Collapsed;
        return Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotImplementedException();
}

public class DoubleToGridLengthConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is not double d) return new GridLength(0);
        return new GridLength(d);
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is GridLength gl) return gl.Value;
        return 0.0;
    }
}

public class InverseBooleanToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is bool b) return b ? Visibility.Collapsed : Visibility.Visible;
        return Visibility.Visible;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotImplementedException();
}
