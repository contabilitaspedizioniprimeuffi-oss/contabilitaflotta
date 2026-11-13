/**
 * Banca Dati Automezzi - seconda "antenna": il Foglio Google del REGISTRO PRESENZE AUTISTI
 *
 * Come quella del gasolio (foglio-google.gs), ma legge solo la scheda USCITA_AUTISTI, che il
 * registro rigenera da solo: una riga per presenza o cambio di stato di ogni furgone
 *   TIPO | DATA | TARGA | AUTISTA_1 | AUTISTA_2 | STATO | CAUSALE | TARGA_SOSTITUTIVA | NOTE | ORIGINE
 * Il programma la usa per il diario conducenti, le manutenzioni e lo stato dei mezzi.
 *
 * Come si installa (una volta sola), stessi passi dell'altra antenna:
 *  1. script.google.com > Nuovo progetto (nome a piacere, es. "Antenna registro autisti").
 *  2. Incollare questo testo al posto del codice presente e premere Salva.
 *     ID_FOGLIO e' la parte dell'indirizzo del Foglio del registro autisti tra /d/ e /edit.
 *  3. Funzione "prova" > Esegui > Autorizza (se "Google non ha verificato questa app":
 *     Avanzate > Vai a ... > Consenti). In basso deve comparire "Foglio raggiungibile".
 *  4. Esegui il deployment > Nuovo deployment > App web
 *     Esegui come: Me    -    Chi ha accesso: Chiunque
 *  5. Copiare l'indirizzo "App web" (finisce con /exec) e incollarlo nel programma
 *     al primo clic sul pulsante "Registro autisti".
 *
 * L'indirizzo funziona come una password: non va condiviso ne' pubblicato.
 * Per disattivarlo: Esegui il deployment > Gestisci deployment > Archivia.
 */
var ID_FOGLIO = 'INSERISCI_QUI_L_ID_DEL_FOGLIO_AUTISTI';
var SCHEDA = 'USCITA_AUTISTI';

function doGet() {
  var file = SpreadsheetApp.openById(ID_FOGLIO);
  var scheda = file.getSheetByName(SCHEDA);
  var righe = ['--- ' + SCHEDA + ' ---'];
  if (scheda) {
    var valori = scheda.getDataRange().getDisplayValues();
    for (var i = 0; i < valori.length; i++) {
      righe.push(valori[i].map(function (v) {
        return String(v).replace(/[\t\r\n]+/g, ' ');
      }).join('\t'));
    }
  }
  return ContentService.createTextOutput(righe.join('\n'))
    .setMimeType(ContentService.MimeType.TEXT);
}

// Da eseguire una volta dall'editor: chiede l'autorizzazione e verifica l'accesso
function prova() {
  var file = SpreadsheetApp.openById(ID_FOGLIO);
  Logger.log('Foglio raggiungibile: ' + file.getName() + (file.getSheetByName(SCHEDA) ? ' (scheda ' + SCHEDA + ' trovata)' : ' - ATTENZIONE: manca la scheda ' + SCHEDA));
}
