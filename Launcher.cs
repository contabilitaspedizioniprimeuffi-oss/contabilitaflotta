using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

namespace BancaDatiAutomezzi
{
    static class Program
    {
        static bool CheckHealth()
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create("http://localhost:3000/api/health");
                request.Timeout = 500;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        [STAThread]
        static void Main()
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string nodeExe = Path.Combine(localAppData, @"Programs\nodejs\node.exe");
            string nextBin = Path.Combine(appDir, @"node_modules\next\dist\bin\next");

            Process serverProcess = null;

            // Se il server non è attivo, avvialo
            if (!CheckHealth())
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                if (File.Exists(nodeExe) && File.Exists(nextBin))
                {
                    psi.FileName = nodeExe;
                    psi.Arguments = string.Format("\"{0}\" start -p 3000", nextBin);
                }
                else
                {
                    psi.FileName = "cmd.exe";
                    psi.Arguments = "/c npm start";
                }

                psi.WorkingDirectory = appDir;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;

                string curPath = Environment.GetEnvironmentVariable("PATH") ?? "";
                string nodeDir = Path.Combine(localAppData, @"Programs\nodejs");
                psi.EnvironmentVariables["PATH"] = nodeDir + ";" + curPath;

                try
                {
                    serverProcess = Process.Start(psi);
                }
                catch { }

                // Attendi che il server sia effettivamente pronto e risponda con HTTP 200
                for (int i = 0; i < 60; i++)
                {
                    if (CheckHealth()) break;
                    Thread.Sleep(500);
                }
            }

            // Apri la finestra Desktop dedicata (Edge in App Mode)
            string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            if (!File.Exists(edgePath))
            {
                edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
            }

            Process appWindow = null;
            if (File.Exists(edgePath))
            {
                ProcessStartInfo winPsi = new ProcessStartInfo();
                winPsi.FileName = edgePath;
                winPsi.Arguments = "--app=http://localhost:3000 --window-size=1440,900";
                appWindow = Process.Start(winPsi);
            }
            else
            {
                Process.Start("http://localhost:3000");
            }

            // Quando l'utente chiude la finestra dell'applicazione, arresta il server di background
            if (appWindow != null && serverProcess != null)
            {
                appWindow.WaitForExit();
                try
                {
                    serverProcess.Kill();
                }
                catch { }
            }
        }
    }
}
