# Convertitore Telepass PDF → JSON: input atteso

Il programma «Banca Dati Automezzi» carica i pedaggi dalla sezione **Pedaggi › Carica JSON**.
Questa guida descrive il file JSON che il convertitore deve produrre a partire dal PDF della fattura Telepass, in particolare dalle pagine «Dettaglio Elenco Viaggi Pedaggio».

- **Esempio completo:** [`esempio-input-atteso.json`](esempio-input-atteso.json). Tutti i dati sono **inventati**.
- **Un PDF = un file JSON:** codifica UTF-8, estensione `.json`, nome libero (es. `telepass-900000001.json`).

## Struttura

```
{
  "formato": "pedaggi-telepass",
  "versione": 1,
  "fattura":     { numero, data, periodo_dal, periodo_al, totale },
  "dispositivi": [
    { "codice": ..., "totale": ..., "passaggi": [ { ...una riga del dettaglio... }, ... ] },
    ...
  ]
}
```

## Campi

Tutti i campi sono **obbligatori**: se nel PDF un valore manca, si scrive `""` (stringa vuota) e la chiave non va mai omessa.

### Intestazione (prima pagina del PDF)

| Campo JSON | Dove si trova nel PDF | Formato | Esempio |
|---|---|---|---|
| `formato` | sempre questo valore | testo fisso | `"pedaggi-telepass"` |
| `versione` | sempre questo valore | numero fisso | `1` |
| `fattura.numero` | NUMERO E DATA FATTURA, il numero prima di «DEL» | testo | `"900000001"` |
| `fattura.data` | NUMERO E DATA FATTURA, la data dopo «DEL» | `AAAA-MM-GG` | `"2026-11-16"` |
| `fattura.periodo_dal` | periodo in alto a destra «AAAA-MM-GG /AAAA-MM-GG», prima data | `AAAA-MM-GG` | `"2026-11-01"` |
| `fattura.periodo_al` | stesso periodo, seconda data | `AAAA-MM-GG` | `"2026-11-15"` |
| `fattura.totale` | riepilogo, «TOTALE FATTURA €» | numero | `9.35` |

### Dispositivo (un elemento di `dispositivi` per ogni riga «DISPOSITIVO CODICE OBU/PAN»)

| Campo JSON | Dove si trova nel PDF | Formato | Esempio |
|---|---|---|---|
| `codice` | «DISPOSITIVO CODICE OBU/PAN N. …», la parte dopo «N.», senza spazi | `OBU/PAN` | `"1A2B3C4D/6389160000000000001F"` |
| `totale` | riga «TOTALE» che chiude il dispositivo | numero | `4.80` |
| `passaggi` | le righe del dettaglio di quel dispositivo | elenco | vedi sotto |

### Passaggio (una riga del dettaglio, stesse colonne del PDF e nello stesso ordine)

| Campo JSON | Colonna del PDF | Formato | Esempio |
|---|---|---|---|
| `id_prenotazione` | ID PRENOTAZIONE | testo, di solito `""` | `""` |
| `targa` | TARGA | maiuscolo senza spazi, `""` se manca | `"AA111AA"` |
| `data_entrata` | DATA ENTR. | `AAAA-MM-GG` oppure `""` | `"2026-11-03"` |
| `ora_entrata` | ORA ENTR | `HH:MM:SS` oppure `""` | `"07:42:10"` |
| `stazione_entrata` | STAZIONE ENTRATA | testo | `"NAPOLI NORD"` |
| `data_uscita` | DATA USC. | `AAAA-MM-GG`, sempre presente | `"2026-11-03"` |
| `ora_uscita` | ORA USC. | `HH:MM:SS` | `"08:15:51"` |
| `stazione_uscita` | STAZIONE USCITA | testo | `"CASTELLAMMARE DI STABIA"` |
| `classe` | CLASSE | testo così com'è (`B`, `A`, `2`, `3`…) | `"B"` |
| `srv` | SRV | testo così com'è (`PED`, `SA3`, `RIM`, `PAR`…) | `"PED"` |
| `importo` | IMPORTO | numero, punto decimale, può essere negativo | `3.10` |

La colonna **IVA** del PDF **non** va riportata.

## Regole di conversione

1. **Importi così come sono stampati.** Sono già IVA inclusa: non si calcola niente e non si toglie l'IVA. Basta cambiare la virgola in punto (`1,70` → `1.70`) e scriverli come numeri JSON, non come testo. Gli sconti (SRV `SA3`) restano negativi (`-0,90` → `-0.90`).
2. **Una riga del dettaglio = un passaggio,** nello stesso ordine del PDF.
3. **Dispositivi.** La riga «DISPOSITIVO CODICE OBU/PAN N. …» apre un gruppo. Le righe seguenti appartengono a quel dispositivo fino alla riga «TOTALE», anche quando proseguono nella pagina successiva: l'intestazione del dispositivo non viene ripetuta.
4. **Non vanno riportati:**
   - l'intestazione di ogni pagina (dati dell'azienda, codice cliente, contratto, IBAN…);
   - le intestazioni delle colonne;
   - le righe «TOTALE», che vanno in `totale` del dispositivo;
   - il «RIEPILOGO DEI PEDAGGI PER CLASSE», le legende e i piè di pagina (`TLP_…`).
5. **Caselli a barriera (es. Tangenziale).** Nella colonna STAZIONE ENTRATA c'è «DIREZIONE ENTRATA» o «DIREZIONE USCITA» e mancano data e ora di entrata. Si copia il testo in `stazione_entrata` e si lasciano `"data_entrata": ""` e `"ora_entrata": ""`.
6. **Nomi delle stazioni su due righe.** I nomi lunghi vanno a capo: una parte sta sopra la riga del passaggio e una sotto (es. «CASTELLAMMARE DI» sopra e «STABIA» sotto). Nel JSON va il nome intero, con le parti unite da uno spazio: `"CASTELLAMMARE DI STABIA"`.
7. **Testo attaccato.** In alcune righe l'estrazione del testo unisce la targa alla data (es. `AA111AA2026-11-10`). Vanno separate: la targa italiana è fatta di 2 lettere, 3 cifre e 2 lettere.
8. **Targa mancante.** Molti passaggi hanno solo il dispositivo: si scrive `"targa": ""`. Non va inventata né copiata da altre righe. Ci pensa il programma (vedi sotto).
9. **Date e ore** come nel PDF: `AAAA-MM-GG` e `HH:MM:SS`.

## Controlli prima di consegnare il file

Il programma rifarà questi controlli al caricamento:

- **Per ogni dispositivo** la somma degli `importo` deve essere uguale al suo `totale`. Se non torna, è stata persa o letta male una riga e il file verrà rifiutato.
- **La somma di tutti i passaggi** deve essere uguale a `fattura.totale`. Se non torna, il programma lo segnalerà.
- **Il file** deve essere un JSON valido, controllabile per esempio con un validatore JSON online o `python -m json.tool file.json`.

## Cosa farà il programma con il file (per informazione)

- Mostrerà un'anteprima dei passaggi prima di salvarli.
- Il pedaggio prenderà la data di **uscita** (`data_uscita`).
- Gli importi si vedranno così come sono nel file, cioè IVA inclusa.
- **Passaggi senza targa:** verranno assegnati al mezzo che di solito usa quel dispositivo e segnati con un **asterisco** (*). La targa si potrà cambiare.
- **Targhe non presenti in anagrafica:** prima di importare chiederà se aggiungerle o scartare i loro pedaggi.
- **La stessa fattura** non si potrà caricare due volte.
