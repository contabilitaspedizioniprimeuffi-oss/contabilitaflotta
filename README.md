# 🚗 Banca Dati Automezzi Aziendali

Applicazione per la gestione, il tracciamento e l'amministrazione della flotta automezzi aziendale.
Funziona in locale sul PC (Windows): i dati restano sul computer.

---

## 🚀 Come avviare il programma

Doppio clic su **`Banca Dati Automezzi.exe`** (o sul suo collegamento sul Desktop).

All'avvio il programma:
1. controlla se su GitHub c'è una versione più recente e, se c'è, la installa da solo;
2. avvia il server locale;
3. apre la finestra del programma (Microsoft Edge in modalità applicazione).

Quando chiudi la finestra, il programma si ferma.

Se il programma non parte, usa **`avvia.bat`**: apre una finestra nera che mostra gli eventuali errori.

---

## 🔄 Aggiornamenti automatici

Il codice del programma è su GitHub. Ogni modifica pubblicata lì arriva sul PC alla successiva apertura del programma.

- **I dati non vengono mai toccati.** Il database (`local_database.db`), `sheets_dump.txt`, `.env.local`, i backup e i registri sono esclusi da git (`.gitignore`). L'aggiornamento non li modifica e non li cancella.
- **Backup automatico.** Prima di ogni aggiornamento viene salvata una copia del database nella cartella `backup` (si tengono le ultime 20).
- **Ritorno automatico.** Se una nuova versione non si installa o non si compila, il programma torna da solo alla versione precedente.
- **Senza internet** il programma si apre normalmente con la versione già installata.
- **Aggiornamento manuale:** doppio clic su `aggiorna-da-github.bat`.
- **Registri:** cartella `logs` (`aggiornamento.log`, `avvio.log`, `server.log`).

La logica dell'aggiornamento è in `strumenti/aggiorna.ps1`.

---

## 🗄️ Database e dati

- Il database è un file **SQLite** nella cartella del programma: **`local_database.db`**.
- Le tabelle vengono create automaticamente se mancano (`src/db/index.ts`).
- La sincronizzazione legge la copia locale del Foglio Google **`sheets_dump.txt`**. Il file contiene dati reali e non viene mai pubblicato su GitHub.
- L'ID del Foglio Google si imposta nel file locale **`.env.local`** (non pubblicato):
  ```
  GOOGLE_SHEET_ID=...
  ```

### Dati demo
`popola-dati.bat` (oppure `npm run seed`) **cancella tutti i dati** e inserisce 10 veicoli di esempio.
Lo script chiede una conferma e salva prima una copia del database nella cartella `backup`.

---

## 📋 Funzionalità

1. **Dashboard panoramica (`/`)**
   - Stato della flotta: mezzi attivi, in manutenzione, km totali.
   - Statistiche mensili di consumi e spesa carburante, con grafici.
   - Avvisi per scadenze imminenti e scadute (assicurazioni, bolli, revisioni, contratti).
   - Ultime manutenzioni e multe non pagate.

2. **Registro mezzi (`/mezzi`)**
   - Elenco veicoli con targa grafica italiana, alimentazione, km attuali e conducente.
   - Ricerca e filtri per stato (attivo, in manutenzione, fermo, venduto) e per tipologia (acquisto, noleggio, leasing, riscatto).
   - Scheda di dettaglio per ogni mezzo (`/mezzi/[id]`) con la cronistoria completa:
     - diario autisti;
     - storico di tagliandi e riparazioni, con officine e costi;
     - rifornimenti, con calcolo di km/l e spesa;
     - scadenze e multe.
   - Aggiunta e modifica dei veicoli (`/mezzi/nuovo`, `/mezzi/[id]/modifica`).

3. **Scadenze e revisioni (`/scadenze`)**: assicurazioni, bolli, revisioni e fine noleggio, con un colore per l'urgenza.

4. **Manutenzioni (`/manutenzioni`)**: registro officina per tagliandi, gomme, freni e riparazioni straordinarie.

5. **Rifornimenti (`/rifornimenti`)**: registro carburante con km percorsi, litri e spesa.

6. **Multe e infrazioni (`/multe`)**: sanzioni con punti patente, conducente, importo e stato del pagamento.

---

## 🛠️ Sviluppo

Tecnologie: Next.js 16, React 19, Tailwind CSS 4, Drizzle ORM, SQLite (libsql).

```powershell
npm install        # installa i componenti
npm run dev        # versione di sviluppo su http://localhost:3000
npm run build      # compila la versione definitiva (quella usata dal programma)
npm run typecheck  # controllo dei tipi TypeScript
```

Il programma di avvio è scritto in C# (`Launcher.cs`); i comandi per ricompilarlo sono indicati in cima al file.
