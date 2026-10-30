// =============================================================================
//  Banca Dati Automezzi - programma di avvio ("Banca Dati Automezzi.exe")
// =============================================================================
//  1) prepara il programma (strumenti\aggiorna.ps1 -SoloAvvio): nessun
//     download, ricompila solo se serve
//  2) avvia il server locale del programma in background
//  3) apre la finestra del programma (Edge in modalita' applicazione) e
//     mostra un'icona vicino all'orologio: "Apri" / "Chiudi il programma"
//  4) se nel programma si preme "Sincronizza con GitHub" > "Scarica e
//     installa", chiude il server, installa la nuova versione da GitHub
//     (strumenti\aggiorna.ps1) e riapre il programma
//  5) quando la finestra viene chiusa (o si sceglie "Chiudi il programma"
//     dall'icona) arresta il server. Se la finestra di Edge non e'
//     rilevabile, il programma resta aperto e si chiude dall'icona.
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
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Management;
using System.Net;
using System.Runtime.InteropServices;
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
        static Process finestraApp;               // Edge aperto all'avvio
        static NotifyIcon icona;                  // icona vicino all'orologio
        static volatile bool chiusuraRichiesta;   // "Chiudi il programma" dall'icona

        [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int dwProcessId);
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
        const int ASFW_ANY = -1;
        const int SW_RESTORE = 9;

        [STAThread]
        static void Main()
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory;
            logDir = Path.Combine(appDir, "logs");
            try { Directory.CreateDirectory(logDir); } catch { }

            // Il programma e' gia' aperto: porta davanti la sua finestra (o aprine una)
            if (ServerAttivo(3000))
            {
                Log("Programma gia' aperto: mostro la finestra");
                MostraFinestra();
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

                if (!serverPronto)
                {
                    string causa = Diagnosi();
                    FermaServer();
                    Log("Avvio non riuscito: " + causa.Replace("\n", " | "));
                    Messaggio(
                        "Il programma non si \u00e8 avviato.\n\n" + causa + "\n\n" +
                        "I dettagli sono nella cartella:\n" + logDir + "\n\n" +
                        "Nel frattempo puoi avviarlo con \"avvia.bat\".",
                        MessageBoxIcon.Error);
                    return;
                }

                icona = CreaIcona();
                try { SorvegliaFinestra(); }
                finally
                {
                    try { icona.Visible = false; icona.Dispose(); } catch { }
                }
                FermaServer();
                Log("Programma chiuso");
            }
            finally
            {
                try { mutex.ReleaseMutex(); } catch { }
            }
        }

        // Resta in attesa finche' il programma e' aperto e intanto esegue gli
        // aggiornamenti chiesti dal pulsante "Sincronizza con GitHub".
        // Termina quando la finestra viene chiusa o si sceglie "Chiudi il
        // programma" dall'icona vicino all'orologio.
        static void SorvegliaFinestra()
        {
            string richiesta = Path.Combine(logDir, "richiesta-aggiornamento");
            try { File.Delete(richiesta); } catch { }
            DateTime ultimaRichiesta = DateTime.MinValue;
            DateTime prossimoControllo = DateTime.MinValue;
            DateTime inizio = DateTime.Now;
            bool finestraVista = false;   // la finestra del programma e' stata rilevata
            bool avvisoMostrato = false;
            int assenze = 0;
            while (!chiusuraRichiesta)
            {
                Attendi(1000);
                if (chiusuraRichiesta) break;

                if (File.Exists(richiesta))
                {
                    DateTime quando = DateTime.MinValue;
                    string testo = "";
                    try { quando = File.GetLastWriteTimeUtc(richiesta); } catch { }
                    try { testo = File.ReadAllText(richiesta); } catch { }
                    try { File.Delete(richiesta); } catch { }
                    if (quando != ultimaRichiesta)
                    {
                        ultimaRichiesta = quando;
                        AggiornaSuRichiesta(testo.Contains("forza"));
                        assenze = 0;
                        prossimoControllo = DateTime.MinValue;
                        continue;
                    }
                }

                if (DateTime.Now < prossimoControllo) continue;
                prossimoControllo = DateTime.Now.AddSeconds(2);

                if (FinestraProgramma() != IntPtr.Zero)
                {
                    if (!finestraVista)
                        Log("Finestra del programma aperta (dopo " + (int)(DateTime.Now - inizio).TotalSeconds + " s)");
                    finestraVista = true;
                    assenze = 0;
                    continue;
                }

                if (finestraVista)
                {
                    if (++assenze >= 2)
                    {
                        Log("Finestra chiusa: arresto il server");
                        return;
                    }
                    continue;
                }

                // Finestra mai rilevata (es. Edge l'ha passata a un altro suo
                // processo): invece di chiudere tutto, il programma resta aperto
                // e si apre / chiude dall'icona vicino all'orologio
                if (!avvisoMostrato && (DateTime.Now - inizio).TotalSeconds >= 25)
                {
                    avvisoMostrato = true;
                    Log("Finestra del programma non rilevata: il programma resta aperto (icona vicino all'orologio)");
                    AvvisoIcona();
                }
            }
            Log("Chiusura scelta dall'icona: arresto il server");
            ChiudiFinestreProgramma();
        }

        // Aggiornamento chiesto dal pulsante "Sincronizza con GitHub"
        static void AggiornaSuRichiesta(bool forza)
        {
            Log("---- Aggiornamento richiesto dal programma" + (forza ? " (forzato)" : "") + " ----");
            serverPronto = false;
            finestra = new FinestraAvvio();
            finestra.TopMost = true;
            finestra.Shown += delegate
            {
                Thread lavoro = new Thread(delegate ()
                {
                    try
                    {
                        finestra.Stato("Chiudo il programma per aggiornarlo...");
                        FermaServer();
                        AttendiPortaLibera(30);
                        finestra.Stato("Scarico la nuova versione da GitHub...");
                        EseguiAggiornamento(forza ? "-Forza" : "");
                        finestra.Stato("Riapro il programma...");
                        AvviaServer();
                        serverPronto = AttendiServer(180);
                        Log(serverPronto ? "Server pronto" : "Il server non risponde");
                    }
                    catch (Exception ex)
                    {
                        Log("Errore: " + ex);
                    }
                    finestra.Chiudi();
                });
                lavoro.IsBackground = true;
                lavoro.Start();
            };
            Application.Run(finestra);

            if (!serverPronto)
            {
                Messaggio(
                    "Il programma non si \u00e8 riaperto dopo l'aggiornamento.\n\n" + Diagnosi() + "\n\n" +
                    "Chiudi il programma (icona vicino all'orologio) e riaprilo. Se il problema resta, " +
                    "i dettagli sono nella cartella:\n" + logDir,
                    MessageBoxIcon.Warning);
            }
        }

        // Processi Edge che usano il profilo dedicato al programma
        static List<int> ProcessiProfilo()
        {
            List<int> elenco = new List<int>();
            try
            {
                using (ManagementObjectSearcher s = new ManagementObjectSearcher(
                    "SELECT ProcessId FROM Win32_Process WHERE Name = 'msedge.exe' " +
                    "AND CommandLine LIKE '%BancaDatiAutomezzi%ProfiloEdge%'"))
                using (ManagementObjectCollection r = s.Get())
                {
                    foreach (ManagementObject o in r)
                    {
                        try { elenco.Add(Convert.ToInt32(o["ProcessId"])); } catch { }
                        o.Dispose();
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Ricerca delle finestre di Edge non riuscita: " + ex.Message);
            }
            return elenco;
        }

        // Finestra del programma aperta (Edge con il profilo dedicato), se c'e'
        static IntPtr FinestraProgramma()
        {
            try
            {
                if (finestraApp != null && !finestraApp.HasExited)
                {
                    finestraApp.Refresh();
                    if (finestraApp.MainWindowHandle != IntPtr.Zero) return finestraApp.MainWindowHandle;
                }
            }
            catch { }
            foreach (int pid in ProcessiProfilo())
            {
                try
                {
                    using (Process p = Process.GetProcessById(pid))
                        if (p.MainWindowHandle != IntPtr.Zero) return p.MainWindowHandle;
                }
                catch { }
            }
            return IntPtr.Zero;
        }

        // Porta davanti la finestra del programma, o ne apre una nuova
        static void MostraFinestra()
        {
            IntPtr h = FinestraProgramma();
            if (h == IntPtr.Zero)
            {
                try { AllowSetForegroundWindow(ASFW_ANY); } catch { }
                ApriFinestra();
                return;
            }
            try
            {
                if (IsIconic(h)) ShowWindowAsync(h, SW_RESTORE);
                SetForegroundWindow(h);
            }
            catch { }
        }

        static void ChiudiFinestreProgramma()
        {
            foreach (int pid in ProcessiProfilo())
            {
                try
                {
                    using (Process p = Process.GetProcessById(pid))
                        if (p.MainWindowHandle != IntPtr.Zero) p.CloseMainWindow();
                }
                catch { }
            }
        }

        // Icona vicino all'orologio, visibile finche' il programma e' aperto
        static NotifyIcon CreaIcona()
        {
            NotifyIcon n = new NotifyIcon();
            try { n.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            if (n.Icon == null) n.Icon = SystemIcons.Application;
            n.Text = "Banca Dati Automezzi (aperto)";
            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add("Apri Banca Dati Automezzi", delegate { MostraFinestra(); });
            menu.MenuItems.Add("-");
            menu.MenuItems.Add("Chiudi il programma", delegate
            {
                if (MessageBox.Show("Chiudere Banca Dati Automezzi?", "Banca Dati Automezzi",
                        MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                    chiusuraRichiesta = true;
            });
            n.ContextMenu = menu;
            n.MouseClick += delegate (object sender, MouseEventArgs e)
            {
                if (e.Button == MouseButtons.Left) MostraFinestra();
            };
            n.Visible = true;
            return n;
        }

        static void AvvisoIcona()
        {
            try
            {
                icona.ShowBalloonTip(10000, "Banca Dati Automezzi \u00e8 aperto",
                    "Per aprire la finestra del programma o chiuderlo usa questa icona vicino all'orologio.",
                    ToolTipIcon.Info);
            }
            catch { }
        }

        // Attesa che lascia funzionare l'icona (menu e clic)
        static void Attendi(int millisecondi)
        {
            DateTime fine = DateTime.Now.AddMilliseconds(millisecondi);
            while (DateTime.Now < fine && !chiusuraRichiesta)
            {
                Application.DoEvents();
                Thread.Sleep(50);
            }
        }

        // Messaggio sempre in primo piano (non resta nascosto dietro altre finestre)
        static void Messaggio(string testo, MessageBoxIcon tipo)
        {
            try
            {
                using (Form proprietario = new Form())
                {
                    Rectangle area = Screen.PrimaryScreen.WorkingArea;
                    proprietario.TopMost = true;
                    proprietario.ShowInTaskbar = false;
                    proprietario.FormBorderStyle = FormBorderStyle.None;
                    proprietario.Opacity = 0;
                    proprietario.StartPosition = FormStartPosition.Manual;
                    proprietario.Bounds = new Rectangle(area.Left + area.Width / 2, area.Top + area.Height / 2, 1, 1);
                    proprietario.Show();
                    proprietario.Activate();
                    MessageBox.Show(proprietario, testo, "Banca Dati Automezzi", MessageBoxButtons.OK, tipo);
                }
            }
            catch
            {
                MessageBox.Show(testo, "Banca Dati Automezzi", MessageBoxButtons.OK, tipo,
                                MessageBoxDefaultButton.Button1, MessageBoxOptions.DefaultDesktopOnly);
            }
        }

        // Causa probabile di un avvio non riuscito, da mostrare all'utente
        static string Diagnosi()
        {
            bool serverTerminato = true;
            try { serverTerminato = server == null || server.HasExited; } catch { }
            string coda = CodaLog(Path.Combine(logDir, "server.log"), 8);
            if (coda.Contains("EADDRINUSE") || (serverTerminato && PortaOccupata()))
                return "La porta " + Porta + " \u00e8 gi\u00e0 usata da un altro programma: probabilmente \u00e8 ancora " +
                       "aperta la finestra nera di \"avvia.bat\" (o un'altra copia del programma). " +
                       "Chiudila, oppure riavvia il PC, e riapri il programma.";
            if (coda.Length == 0)
                return "Il server del programma non \u00e8 partito (vedi avvio.log).";
            return "Ultime righe del registro del server:\n" + coda;
        }

        static string CodaLog(string file, int righe)
        {
            try
            {
                if (!File.Exists(file)) return "";
                string testo;
                using (FileStream fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                using (StreamReader r = new StreamReader(fs))
                    testo = r.ReadToEnd();
                string[] tutte = testo.Replace("\r", "").Split('\n');
                List<string> scelte = new List<string>();
                for (int k = tutte.Length - 1; k >= 0 && scelte.Count < righe; k--)
                    if (tutte[k].Trim().Length > 0) scelte.Insert(0, tutte[k].Trim());
                string esito = string.Join("\n", scelte.ToArray());
                return esito.Length > 700 ? "..." + esito.Substring(esito.Length - 700) : esito;
            }
            catch { return ""; }
        }

        // Lavoro svolto mentre e' visibile la finestra di avvio
        static void Avvia()
        {
            try
            {
                finestra.Stato("Avvio del programma...");
                EseguiAggiornamento("-SoloAvvio");
                finestra.Stato("Avvio del programma...");
                AvviaServer();
                serverPronto = AttendiServer(180);
                Log(serverPronto ? "Server pronto" : "Il server non risponde");
                if (serverPronto)
                {
                    // Si apre mentre la finestra di avvio e' ancora davanti:
                    // cosi' Windows la porta in primo piano
                    finestra.Stato("Apro la finestra del programma...");
                    try { AllowSetForegroundWindow(ASFW_ANY); } catch { }
                    finestraApp = ApriFinestra();
                    Thread.Sleep(2500);
                }
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
        static void EseguiAggiornamento(string opzioni)
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

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = ps;
            psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\" -DaLauncher " + opzioni;
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

        static string TrovaGit()
        {
            string la = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string[] candidati = {
                Path.Combine(la, @"Programs\Git\cmd\git.exe"),
                Path.Combine(pf, @"Git\cmd\git.exe"),
                @"C:\Program Files\Git\cmd\git.exe"
            };
            foreach (string c in candidati) if (File.Exists(c)) return c;
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
            string gitExe = TrovaGit();
            if (gitExe != null) path = Path.GetDirectoryName(gitExe) + ";" + path;
            if (nodeExe != null) path = Path.GetDirectoryName(nodeExe) + ";" + path;
            psi.EnvironmentVariables["PATH"] = path;
            psi.EnvironmentVariables["NEXT_TELEMETRY_DISABLED"] = "1";
            psi.EnvironmentVariables["BDA_LAUNCHER"] = "1";   // abilita "Sincronizza con GitHub"
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

        static bool ServerAttivo(int attesaMs = 1500)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(Indirizzo + "/api/health");
                req.Timeout = attesaMs;
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
                if (!server.HasExited)
                {
                    ProcessStartInfo psi = new ProcessStartInfo(
                        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "taskkill.exe"),
                        "/PID " + server.Id + " /T /F");
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    Process k = Process.Start(psi);
                    k.WaitForExit(10000);
                }
            }
            catch { }
            try { if (!server.HasExited) server.Kill(); } catch { }
            try { server.WaitForExit(10000); } catch { }
            server = null;
        }

        static void AttendiPortaLibera(int secondi)
        {
            DateTime limite = DateTime.Now.AddSeconds(secondi);
            while (DateTime.Now < limite && PortaOccupata()) Thread.Sleep(500);
        }

        static bool PortaOccupata()
        {
            try
            {
                using (System.Net.Sockets.TcpClient c = new System.Net.Sockets.TcpClient())
                {
                    IAsyncResult r = c.BeginConnect("127.0.0.1", Porta, null, null);
                    if (!r.AsyncWaitHandle.WaitOne(700)) return false;
                    c.EndConnect(r);
                    return true;
                }
            }
            catch { return false; }
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
                try
                {
                    Process p = Process.Start(psi);
                    Log("Apertura finestra con Edge (processo " + p.Id + ")");
                    return p;
                }
                catch (Exception ex) { Log("Apertura Edge non riuscita: " + ex.Message); }
            }
            else Log("Edge non trovato: apro il browser predefinito");
            try { Process.Start(Indirizzo); } catch (Exception ex) { Log("Apertura browser non riuscita: " + ex.Message); }
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
