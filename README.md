# 🚗 Banca Dati Automezzi Aziendali

Applicazione web completa per la gestione, il tracciamento e l'amministrazione della flotta automezzi aziendale.

---

## 🚀 Come avviare l'applicazione

Puoi avviare l'applicazione in due modi:

### Metodo 1: Doppio Clic (Consigliato)
Fai doppio clic sul file **`avvia.bat`** presente nella cartella principale del progetto.  
Il server si avvierà automaticamente e aprirà la pagina web nel browser predefinito a questo indirizzo:
👉 **[http://localhost:3000](http://localhost:3000)**

### Metodo 2: Da Riga di Comando / Terminale
```powershell
# 1. Posizionati nella cartella
cd "c:\Users\elite\Desktop\BANCA DATI AUTOMEZZI"

# 2. Avvia il server di sviluppo
npm run dev
```

---

## 🗄️ Database e Dati

Il database è integrato e configurato con **PostgreSQL locale persistente (PGlite)**:
- Non necessita di server esterni, password o porte configurate manualmente.
- I dati vengono salvati in modo sicuro nella cartella locale `./data_db`.
- Se in futuro desideri collegare un database PostgreSQL esterno (es. Supabase, Docker o PostgreSQL Server), basta valorizzare la variabile d'ambiente `DATABASE_URL` nel file `.env`.

### Dati Demo
Per ripopolare o ripristinare i dati di esempio (10 veicoli, scadenze, rifornimenti, manutenzioni e multe):
- Fai doppio clic su **`popola-dati.bat`**  
- Oppure esegui `npm run seed` da terminale.

---

## 📋 Funzionalità Incluse

1. **Dashboard Panoramica (`/`)**:
   - Stato flotta (attivi, in manutenzione, km totali).
   - Statistiche mensili consumi e spesa carburante con grafici a barre interattivi.
   - Avvisi scadenze imminenti e scadute (assicurazioni, bolli, revisioni, contratti).
   - Ultime manutenzioni e multe non pagate.

2. **Registro Mezzi (`/mezzi`)**:
   - Elenco veicoli con targa grafica italiana, alimentazione, km attuali e conducente.
   - Ricerca e filtri per stato (attivo, in manutenzione, fermo, venduto) e tipologia (acquisto, noleggio, leasing, riscatto).
   - Scheda dettaglio per singolo mezzo (`/mezzi/[id]`) con cronistoria completa:
     - Diario autisti giornalieri.
     - Storico tagliandi e riparazioni con officine e costi.
     - Tracciamento rifornimenti con calcolo km/l e spesa.
     - Gestione scadenze e multe.
   - Aggiunta e modifica veicoli (`/mezzi/nuovo`, `/mezzi/[id]/modifica`).

3. **Scadenze e Revisioni (`/scadenze`)**:
   - Monitoraggio assicurazioni, bolli, revisioni e fine noleggio con codice colore di urgenza.

4. **Manutenzioni (`/manutenzioni`)**:
   - Registro officina per tagliandi, gomme, freni e riparazioni straordinarie.

5. **Rifornimenti (`/rifornimenti`)**:
   - Registro carburante con km percorsi, litri e spesa totale.

6. **Multe e Infrazioni (`/multe`)**:
   - Registro sanzioni con punti patente, conducente, importo e stato di pagamento.
