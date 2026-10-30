/**
 * Banca Dati Automezzi - "antenna" del Foglio Google
 *
 * Piccolo progetto Apps Script a parte, nel proprio Drive: legge il Foglio
 * (basta che sia condiviso con il proprio account, anche solo in lettura) e
 * restituisce al programma il contenuto di tutte le schede, con i valori come
 * si vedono a schermo. Cosi' "Sincronizza Fogli" usa sempre i dati aggiornati
 * senza rendere pubblico il Foglio.
 *
 * Come si installa (una volta sola):
 *  1. Aprire script.google.com > Nuovo progetto
 *     (oppure Drive > Nuovo > Altro > Google Apps Script).
 *  2. Incollare tutto questo testo al posto del codice presente e premere Salva.
 *     ID_FOGLIO e' la parte dell'indirizzo del Foglio tra /d/ e /edit
 *     (il pulsante "Copia codice" del programma lo inserisce da solo).
 *  3. Scegliere la funzione "prova" > Esegui > Autorizza
 *     (se compare "Google non ha verificato questa app":
 *      Avanzate > Vai a ... > Consenti).
 *  4. Esegui il deployment > Nuovo deployment > App web
 *     Esegui come: Me    -    Chi ha accesso: Chiunque
 *  5. Copiare l'indirizzo "App web" (finisce con /exec) e incollarlo nel
 *     programma: Sincronizza Fogli > Foglio Google.
 *
 * L'indirizzo funziona come una password: non va condiviso ne' pubblicato.
 * Per disattivarlo: Esegui il deployment > Gestisci deployment > Archivia.
 */
var ID_FOGLIO = 'INSERISCI_QUI_L_ID_DEL_FOGLIO';

function doGet() {
  var file = SpreadsheetApp.openById(ID_FOGLIO);
  var righe = [];
  file.getSheets().forEach(function (scheda) {
    righe.push('--- ' + scheda.getName() + ' ---');
    var valori = scheda.getDataRange().getDisplayValues();
    for (var i = 0; i < valori.length; i++) {
      righe.push(valori[i].map(function (v) {
        return String(v).replace(/[\t\r\n]+/g, ' ');
      }).join('\t'));
    }
  });
  return ContentService.createTextOutput(righe.join('\n'))
    .setMimeType(ContentService.MimeType.TEXT);
}

// Da eseguire una volta dall'editor: chiede l'autorizzazione e verifica l'accesso
function prova() {
  Logger.log('Foglio raggiungibile: ' + SpreadsheetApp.openById(ID_FOGLIO).getName());
}
