using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using StudioAudioMatrix.ViewModels;
using StudioAudioMatrix.Models;

namespace StudioAudioMatrix.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private MainViewModel? VM => DataContext as MainViewModel ?? (Resources["MainVm"] as MainViewModel);

    private void New_Executed(object sender, ExecutedRoutedEventArgs e)
    {
        VM?.NewProjectCommand.Execute(null);
    }

    private void Open_Executed(object sender, ExecutedRoutedEventArgs e)
    {
        VM?.LoadProjectCommand.Execute(null);
    }

    private void Save_Executed(object sender, ExecutedRoutedEventArgs e)
    {
        VM?.SaveProjectCommand.Execute(null);
    }

    private void Exit_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void ToggleMatrixLayout(object sender, RoutedEventArgs e) { }
    private void ToggleDeviceList(object sender, RoutedEventArgs e) { }
    private void ToggleZonePanel(object sender, RoutedEventArgs e) { }
    private void ToggleTemplatePanel(object sender, RoutedEventArgs e) { }
    private void ToggleTimeline(object sender, RoutedEventArgs e) { }
    private void ToggleMatrixGrid(object sender, RoutedEventArgs e) { }

    private void MatrixCell_Click(object sender, RoutedEventArgs e)
    {
        if (sender is CheckBox cb && cb.DataContext is MatrixCell cell)
        {
            VM?.SimulatorAdapter.SendMatrixUpdateAsync(cell);
        }
    }
}
