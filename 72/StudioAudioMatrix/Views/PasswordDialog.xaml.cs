using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace StudioAudioMatrix.Views;

public partial class PasswordDialog : Window
{
    public string Password { get; private set; } = string.Empty;

    public PasswordDialog()
    {
        InitializeComponent();
        Loaded += (s, e) => PasswordBox.Focus();
    }

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        Password = PasswordBox.Password;
        if (string.IsNullOrWhiteSpace(Password))
        {
            MessageBox.Show("请输入密码", "提示", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        DialogResult = true;
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
