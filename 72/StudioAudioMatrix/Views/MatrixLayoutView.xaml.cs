using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using StudioAudioMatrix.Models;
using StudioAudioMatrix.ViewModels;

namespace StudioAudioMatrix.Views;

public partial class MatrixLayoutView : UserControl
{
    private MainViewModel? _vm;
    private Point _dragStartPoint;
    private bool _isDragging;
    private AudioDevice? _draggedDevice;
    private TranslateTransform? _dragTransform;

    public MatrixLayoutView()
    {
        InitializeComponent();
        DataContextChanged += OnDataContextChanged;
    }

    private void OnDataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        _vm = e.NewValue as MainViewModel;
    }

    private void DeviceIcon_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement element && element.DataContext is AudioDevice device)
        {
            _draggedDevice = device;
            _dragStartPoint = e.GetPosition(LayoutCanvas);
            _isDragging = true;
            element.CaptureMouse();
            e.Handled = true;
        }
    }

    private void DeviceIcon_MouseMove(object sender, MouseEventArgs e)
    {
        if (_isDragging && _draggedDevice != null && sender is FrameworkElement element)
        {
            Point current = e.GetPosition(LayoutCanvas);
            Vector delta = current - _dragStartPoint;

            double scaleX = LayoutCanvas.ActualWidth / (_vm?.CurrentProject.StudioWidth ?? 20);
            double scaleZ = LayoutCanvas.ActualHeight / (_vm?.CurrentProject.StudioDepth ?? 15);

            double newX = _draggedDevice.X + delta.X / scaleX;
            double newZ = _draggedDevice.Z + delta.Y / scaleZ;

            double maxX = _vm?.CurrentProject.StudioWidth ?? 20;
            double maxZ = _vm?.CurrentProject.StudioDepth ?? 15;

            _draggedDevice.X = Math.Clamp(newX, 0, maxX);
            _draggedDevice.Z = Math.Clamp(newZ, 0, maxZ);

            _dragStartPoint = current;

            if (_vm != null && _vm.SimulatorAdapter != null)
            {
                _ = _vm.SimulatorAdapter.SendDeviceConfigAsync(_draggedDevice);
            }
        }
    }

    private void DeviceIcon_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (_isDragging)
        {
            _isDragging = false;
            _draggedDevice = null;
            (sender as FrameworkElement)?.ReleaseMouseCapture();
        }
    }

    private void LayoutCanvas_SizeChanged(object sender, SizeChangedEventArgs e)
    {
    }
}
