// =============================================================================
//  Banca Dati Automezzi - programma di avvio ("Banca Dati Automezzi.exe")
// =============================================================================
//  1) installa gli aggiornamenti da GitHub (strumenti\aggiorna.ps1)
//  2) avvia il server locale del programma in background
//  3) apre la finestra del programma (Edge in modalita' applicazione)
//  4) quando la finestra viene chiusa, arresta il server
//
//  Registri: cartella "logs" (avvio.log, server.log, aggiornamento.log)
//
//  Compatibile con C# 5: si puo' ricompilare anche con il compilatore
//  incluso in Windows:
//  C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe
//     /out:"Banca Dati Automezzi.exe" /r:System.Windows.Forms.dll
//     /r:System.Drawing.dll /r:System.Management.dll Launcher.cs
// =============================================================================
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Management;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace BancaDatiAutomezzi
{
    static class Program
    {
        const int Porta = 3000;
        static readonly string Indirizzo = "http://localhost:" + Porta;

        static string appDir;
        static string logDir;
        static FinestraAvvio finestra;
        static Process server;
        static bool serverPronto;

        [STAThread]
        static void Main()
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory;
            logDir = Path.Combine(appDir, "logs");
            try { Directory.CreateDirectory(logDir); } catch { }

            // Il programma e' gia' aperto: apri solo un'altra finestra
            if (ServerAttivo())
            {
                ApriFinestra();
                return;
            }

            // Evita due avvii contemporanei (doppio clic ripetuto)
            bool preso = false;
            Mutex mutex = new Mutex(false, "Local\\BancaDatiAutomezzi_Avvio");
            try { preso = mutex.WaitOne(0); }
            catch (AbandonedMutexException) { preso = true; }
            if (!preso) return;

            try
            {
                Log("---- Avvio del programma ----");
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                finestra = new FinestraAvvio();
                finestra.Shown += delegate
                {
                    Thread lavoro = new Thread(Avvia);
                    lavoro.IsBackground = true;
                    lavoro.Start();
                };
                Application.Run(finestra);
            }
            finally
            {
                try { mutex.ReleaseMutex(); } catch { }
            }

            if (!serverPronto)
            {
                FermaServer();
                MessageBox.Show(
                    "Il programma non si \u00e8 avviato correttamente.\n\n" +
                    "I dettagli sono nella cartella:\n" + logDir + "\n\n" +
                    "Puoi provare ad avviarlo con \"avvia.bat\".",
                    "Banca Dati Automezzi", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            Process finestraApp = ApriFinestra();
            if (finestraApp != null)
            {
                finestraApp.WaitForExit();
                // Edge a volte passa la finestra a un altro processo: si aspetta
                // finche' resta aperta almeno una finestra con il profilo del programma
                Thread.Sleep(3000);
                while (EdgeProgrammaAperto()) Thread.Sleep(2000);
                Log("Finestra chiusa: arresto il server");
                FermaServer();
            }
            // Senza Edge il programma si apre nel browser e il server resta attivo
        }

        // C'e' ancora un processo Edge che usa il profilo dedicato al programma?
        static bool EdgeProgrammaAperto()
        {
            try
            {
                using (ManagementObjectSearcher s = new ManagementObjectSearcher(
                    "SELECT ProcessId FROM Win32_Process WHERE Name = 'msedge.exe' " +
                    "AND CommandLine LIKE '%BancaDatiAutomezzi%ProfiloEdge%'"))
                using (ManagementObjectCollection r = s.Get())
                {
                    return r.Count > 0;
                }
            }
            catch
            {
                return false;
            }
        }

        // Lavoro svolto mentre e' visibile la finestra di avvio
        static void Avvia()
        {
            try
            {
                EseguiAggiornamento();
                finestra.Stato("Avvio del programma...");
                AvviaServer();
                serverPronto = AttendiServer(180);
                Log(serverPronto ? "Server pronto" : "Il server non risponde");
            }
            catch (Exception ex)
            {
                Log("Errore: " + ex);
            }
            finestra.Chiudi();
        }

        // ---------------------------------------------------------------------
        // Aggiornamento
        // ---------------------------------------------------------------------
        static void EseguiAggiornamento()
        {
            string script = Path.Combine(appDir, @"strumenti\aggiorna.ps1");
            if (!File.Exists(script))
            {
                Log("Script di aggiornamento non trovato: " + script);
                return;
            }
            string ps = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
                                     @"WindowsPowerShell\v1.0\powershell.exe");
            if (!File.Exists(ps)) ps = "powershell.exe";

            finestra.Stato("Controllo aggiornamenti...");
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = ps;
            psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\" -DaLauncher";
            psi.WorkingDirectory = appDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = Encoding.UTF8;
            psi.StandardErrorEncoding = Encoding.UTF8;

            try
            {
                using (Process p = new Process())
                {
                    p.StartInfo = psi;
                    p.OutputDataReceived += delegate (object s, DataReceivedEventArgs e)
                    {
                        if (e.Data == null) return;
                        string riga = e.Data.TrimStart('\uFEFF');
                        int sep = riga.IndexOf('|');
                        if (sep > 0 && (riga.StartsWith("STATO|") || riga.StartsWith("AVVISO|")))
                            finestra.Stato(riga.Substring(sep + 1));
                    };
                    p.ErrorDataReceived += delegate (object s, DataReceivedEventArgs e)
                    {
                        if (!string.IsNullOrEmpty(e.Data)) Log("aggiorna.ps1: " + e.Data);
                    };
                    p.Start();
                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    if (!p.WaitForExit(50 * 60 * 1000))
                    {
                        Log("Aggiornamento interrotto: tempo scaduto");
                        try { p.Kill(); } catch { }
                    }
                    else
                    {
                        p.WaitForExit();
                        Log("Aggiornamento terminato (codice " + p.ExitCode + ")");
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Impossibile eseguire l'aggiornamento: " + ex.Message);
            }
        }

        // ---------------------------------------------------------------------
        // Server locale
        // ---------------------------------------------------------------------
        static string TrovaNode()
        {
            string la = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string[] candidati = {
                Path.Combine(la, @"Programs\nodejs\node.exe"),
                Path.Combine(pf, @"nodejs\node.exe")
            };
            foreach (string c in candidati) if (File.Exists(c)) return c;
            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string d in path.Split(';'))
            {
                try
                {
                    string c = Path.Combine(d.Trim().Trim('"'), "node.exe");
                    if (File.Exists(c)) return c;
                }
                catch { }
            }
            return null;
        }

        static void AvviaServer()
        {
            string nodeExe = TrovaNode();
            string nextBin = Path.Combine(appDir, @"node_modules\next\dist\bin\next");
            string logServer = Path.Combine(logDir, "server.log");
            try
            {
                // si conserva il registro della sessione precedente in server.log.1
                if (File.Exists(logServer)) File.Copy(logServer, logServer + ".1", true);
                File.WriteAllText(logServer, "");
            }
            catch { }

            string comando;
            if (nodeExe != null && File.Exists(nextBin))
                comando = "\"" + nodeExe + "\" \"" + nextBin + "\" start -p " + Porta;
            else
                comando = "npm start";
            Log("Avvio server: " + comando);

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe");
            psi.Arguments = "/d /s /c \"" + comando + " >> \"" + logServer + "\" 2>&1\"";
            psi.WorkingDirectory = appDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            if (nodeExe != null) path = Path.GetDirectoryName(nodeExe) + ";" + path;
            psi.EnvironmentVariables["PATH"] = path;
            psi.EnvironmentVariables["NEXT_TELEMETRY_DISABLED"] = "1";
            try { server = Process.Start(psi); }
            catch (Exception ex) { Log("Avvio server non riuscito: " + ex.Message); }
        }

        static bool AttendiServer(int secondi)
        {
            DateTime limite = DateTime.Now.AddSeconds(secondi);
            while (DateTime.Now < limite)
            {
                if (ServerAttivo()) return true;
                try { if (server != null && server.HasExited) return false; } catch { }
                Thread.Sleep(500);
            }
            return false;
        }

        static bool ServerAttivo()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(Indirizzo + "/api/health");
                req.Timeout = 1500;
                req.Proxy = null;
                using (HttpWebResponse r = (HttpWebResponse)req.GetResponse())
                    return r.StatusCode == HttpStatusCode.OK;
            }
            catch { return false; }
        }

        static void FermaServer()
        {
            if (server == null) return;
            try
            {
                if (server.HasExited) return;
                ProcessStartInfo psi = new ProcessStartInfo("taskkill", "/PID " + server.Id + " /T /F");
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process k = Process.Start(psi);
                k.WaitForExit(10000);
            }
            catch { }
            try { if (!server.HasExited) server.Kill(); } catch { }
        }

        // ---------------------------------------------------------------------
        // Finestra del programma (Edge in modalita' applicazione)
        // ---------------------------------------------------------------------
        static string TrovaEdge()
        {
            string[] candidati = {
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                             @"Microsoft\Edge\Application\msedge.exe")
            };
            foreach (string c in candidati) if (File.Exists(c)) return c;
            return null;
        }

        static Process ApriFinestra()
        {
            string edge = TrovaEdge();
            if (edge != null)
            {
                // Profilo dedicato: la finestra resta indipendente dall'Edge
                // usato per navigare, cosi' alla chiusura si arresta il server
                string profilo = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    @"BancaDatiAutomezzi\ProfiloEdge");
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = edge;
                psi.Arguments = "--app=" + Indirizzo + " --window-size=1440,900" +
                                " --user-data-dir=\"" + profilo + "\"" +
                                " --no-first-run --no-default-browser-check";
                psi.UseShellExecute = false;
                try { return Process.Start(psi); }
                catch (Exception ex) { Log("Apertura Edge non riuscita: " + ex.Message); }
            }
            try { Process.Start(Indirizzo); } catch { }
            return null;
        }

        // ---------------------------------------------------------------------
        static void Log(string testo)
        {
            try
            {
                string f = Path.Combine(logDir, "avvio.log");
                if (File.Exists(f) && new FileInfo(f).Length > 1024 * 1024) File.Delete(f);
                File.AppendAllText(f, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + testo + Environment.NewLine);
            }
            catch { }
        }
    }

    // Piccola finestra mostrata durante aggiornamento e avvio
    class FinestraAvvio : Form
    {
        readonly Label etichetta;
        bool puoChiudere;

        public FinestraAvvio()
        {
            Text = "Banca Dati Automezzi";
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(480, 150);
            BackColor = Color.White;

            Label titolo = new Label();
            titolo.Text = "Banca Dati Automezzi";
            titolo.Font = new Font("Segoe UI", 14F, FontStyle.Bold);
            titolo.ForeColor = Color.FromArgb(30, 41, 59);
            titolo.SetBounds(22, 18, 436, 32);

            etichetta = new Label();
            etichetta.Text = "Avvio in corso...";
            etichetta.Font = new Font("Segoe UI", 10F);
            etichetta.ForeColor = Color.FromArgb(71, 85, 105);
            etichetta.SetBounds(22, 56, 436, 44);

            ProgressBar barra = new ProgressBar();
            barra.Style = ProgressBarStyle.Marquee;
            barra.MarqueeAnimationSpeed = 30;
            barra.SetBounds(22, 108, 436, 18);

            Controls.Add(titolo);
            Controls.Add(etichetta);
            Controls.Add(barra);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Non si chiude a meta' aggiornamento
            if (!puoChiudere && e.CloseReason == CloseReason.UserClosing) e.Cancel = true;
            base.OnFormClosing(e);
        }

        public void Stato(string testo)
        {
            try
            {
                if (IsDisposed) return;
                if (InvokeRequired) BeginInvoke((MethodInvoker)delegate { etichetta.Text = testo; });
                else etichetta.Text = testo;
            }
            catch { }
        }

        public void Chiudi()
        {
            try
            {
                if (IsDisposed) return;
                if (InvokeRequired) BeginInvoke((MethodInvoker)delegate { puoChiudere = true; Close(); });
                else { puoChiudere = true; Close(); }
            }
            catch { }
        }
    }
}
