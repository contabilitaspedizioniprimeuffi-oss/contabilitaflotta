import { ensureSchema } from "./index";

ensureSchema()
  .then(() => {
    console.log("Database SQLite pronto e inizializzato!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Errore init DB:", err);
    process.exit(1);
  });
