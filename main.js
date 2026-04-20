const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 8080;

// Afișare căi 
console.log("Calea fisierului curent (__filename):", __filename);
console.log("Calea folderului curent (__dirname):", __dirname);
console.log("Folderul curent de lucru (process.cwd()):", process.cwd());

// Setare EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Creare foldere automate
const vect_foldere = ["temp", "logs", "backup", "fisiere_uploadate"];
vect_foldere.forEach(folder => {
    let cale = path.join(__dirname, folder);
    if (!fs.existsSync(cale)) {
        fs.mkdirSync(cale);
    }
});

// Variabila globala pentru erori
let obGlobal = { obErori: null };

function initErori() {
    let caleJson = path.join(__dirname, 'erori.json');
    if (!fs.existsSync(caleJson)) {
        console.error("Eroare critica: Nu există fisierul erori.json!");
        process.exit();
    }

    let textJson = fs.readFileSync(caleJson, 'utf8');

    // Verificare chei duplicate în același obiect (Bonus - corectat)
    let blockRegex = /\{([^{}]*)\}/g;
    let matchBlock;
    let areCheiDuplicate = false;
    
    while ((matchBlock = blockRegex.exec(textJson)) !== null) {
        let block = matchBlock[1];
        let keyRegex = /"([^"]+)"\s*:/g;
        let keysInBlock = [];
        let keyMatch;
        
        while ((keyMatch = keyRegex.exec(block)) !== null) {
            let cheie = keyMatch[1];
            if (keysInBlock.includes(cheie)) {
                console.error("Eroare (Bonus): S-a găsit o proprietate specificată de mai multe ori în același obiect: " + cheie);
                areCheiDuplicate = true;
            }
            keysInBlock.push(cheie);
        }
    }
    
    if (areCheiDuplicate) {
        process.exit(); // Oprim serverul dacă json-ul e invalid
    }

    let parseData = JSON.parse(textJson);

    // Validări Bonus
    if (!parseData.info_erori || !parseData.cale_baza || !parseData.eroare_default) {
        console.error("Eroare: Lipsesc proprietăți esențiale (info_erori, cale_baza, eroare_default)!");
        process.exit();
    }
    if (!parseData.eroare_default.titlu || !parseData.eroare_default.text || !parseData.eroare_default.imagine) {
        console.error("Eroare: Erorii default îi lipsesc proprietăți (titlu, text sau imagine)!");
        process.exit();
    }

    let caleBazaAbsoluta = path.join(__dirname, parseData.cale_baza);
    if (!fs.existsSync(caleBazaAbsoluta)) {
        console.error("Eroare: Folderul specificat in cale_baza nu exista!");
        process.exit();
    }

    // Verificare Identificatori Duplicati (Bonus)
    let ids = parseData.info_erori.map(e => e.identificator);
    let duplicateIds = ids.filter((item, index) => ids.indexOf(item) !== index);
    if (duplicateIds.length > 0) {
        console.error("Eroare: Există erori cu identificatori duplicați: " + duplicateIds.join(', '));
        process.exit();
    }

    obGlobal.obErori = parseData;

    // Setare căi absolute imagini și verificare existență fișier (Bonus)
    obGlobal.obErori.info_erori.forEach(err => {
        let checkPath = path.join(caleBazaAbsoluta, err.imagine);
        if (!fs.existsSync(checkPath)) {
            console.error(`Eroare: Imaginea pentru eroarea ${err.identificator} nu a fost gasită la calea: ${checkPath}`);
        }
        err.imagine = '/' + path.join(parseData.cale_baza, err.imagine).replace(/\\/g, '/');
    });
    obGlobal.obErori.eroare_default.imagine = '/' + path.join(parseData.cale_baza, obGlobal.obErori.eroare_default.imagine).replace(/\\/g, '/');
}

initErori();

function afisareEroare(res, identificator, titlu, text, imagine) {
    let eroare = obGlobal.obErori.info_erori.find(e => e.identificator == identificator) || obGlobal.obErori.eroare_default;

    let errObj = {
        titlu: titlu || eroare.titlu,
        text: text || eroare.text,
        imagine: imagine || eroare.imagine
    };

    let status = 400; // default 
    if (eroare.status !== undefined) {
        status = eroare.status ? parseInt(identificator) : 200;
    }

    res.status(status).render('pagini/eroare', errObj);
}

// Extragere IP curent pentru layout
app.use((req, res, next) => {
    res.locals.ip = req.ip || req.connection.remoteAddress;
    next();
});

// Eroare 400 la cererea fisierelor ejs direct (Corectat pentru Express 5)
app.use((req, res, next) => {
    if (req.path.endsWith('.ejs')) {
        return afisareEroare(res, 400);
    }
    next();
});

// Eroare 403 la listarea de directoare din resurse
app.use('/resurse', (req, res, next) => {
    if (req.path.endsWith('/')) {
        return afisareEroare(res, 403);
    }
    next();
});

// Folder static
app.use('/resurse', express.static(path.join(__dirname, 'resurse')));


app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'resurse', 'imagini', 'ico', 'favicon.ico'));
});

// Rute Home
app.get(['/', '/index', '/home'], (req, res) => {
    res.render('pagini/index');
});

// Ruta universala la final (Wildcard) adaptată pentru Express 5
app.get('/:pagina', (req, res) => {
    let pagina = req.params.pagina;
    res.render('pagini/' + pagina, function(err, html) {
        if (err) {
            if (err.message.includes('Failed to lookup view')) {
                return afisareEroare(res, 404);
            } else {
                return afisareEroare(res, 500, "Eroare Randare", err.message);
            }
        }
        res.send(html);
    });
});

app.listen(port, () => {
    console.log(`Server pornit pe: http://localhost:${port}`);
});