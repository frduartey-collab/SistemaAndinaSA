using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

public static class Sigem
{
    [STAThread]
    public static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(root, "node.exe");
        string launcher = Path.Combine(root, "iniciar.mjs");
        try
        {
            ProcessStartInfo start = new ProcessStartInfo(node, "\"" + launcher + "\"");
            start.WorkingDirectory = root;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            using (Process process = Process.Start(start))
            {
                process.WaitForExit();
                if (process.ExitCode != 0)
                    MessageBox.Show("SIGEM no pudo iniciar. Revisa errores.log en la carpeta SIGEM dentro de AppData Local.", "SIGEM");
            }
        }
        catch (Exception error)
        {
            MessageBox.Show("No se pudo iniciar SIGEM: " + error.Message, "SIGEM");
        }
    }
}
