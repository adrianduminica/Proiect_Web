const express = require('express');
const fs = require('fs');
const path = require('path');
const sass = require('sass');
const sharp = require('sharp'); // Pentru generarea variantelor mici/medii ale imaginilor
const app = express();
const port = 8080;

// Afișare căi 
console.log("Calea fisierului curent (__filename):", __filename);
console.log("Calea folderului curent (__dirname):", __dirname);
console.log("Folderul curent de lucru (process.cwd()):", process.cwd());

// Setare EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Creare foldere automate (incluzând backup-ul CSS pentru Etapa 5)
const vect_foldere = ["temp", "logs", "backup", "fisiere_uploadate", path.join("backup", "resurse", "css")];
vect_foldere.forEach(folder => {
    let cale = path.join(__dirname, folder);
    if (!fs.existsSync(cale)) {
        fs.mkdirSync(cale, { recursive: true });
    }
});

let obGlobal = { 
    obErori: null,
    obGalerie: null,
    folderScss: path.join(__dirname, 'resurse', 'scss'),
    folderCss: path.join(__dirname, 'resurse', 'css'),
    folderBackup: path.join(__dirname, 'backup', 'resurse', 'css')
};

/* =========================================================
   COMPILARE AUTOMATĂ SCSS -> CSS (Etapa 5)
   ========================================================= */
function compileazaScss(caleScss, caleCss) {
    try {
        let caleScssAbs = path.isAbsolute(caleScss) ? caleScss : path.join(obGlobal.folderScss, caleScss);
        
        // Bonus 4: suport pentru puncte multiple în nume (ex: stil.frumos.scss)
        let numeFisierCss = caleCss ? caleCss : path.basename(caleScss).replace(/\.scss$/, '.css');
        let caleCssAbs = path.isAbsolute(numeFisierCss) ? numeFisierCss : path.join(obGlobal.folderCss, numeFisierCss);

        // Salvare în backup (Bonus 3: adăugare timestamp)
        if (fs.existsSync(caleCssAbs)) {
            let timestamp = new Date().getTime();
            let numeFisierBackup = path.basename(caleCssAbs, '.css') + '_' + timestamp + '.css';
            let caleBackup = path.join(obGlobal.folderBackup, numeFisierBackup);
            fs.copyFileSync(caleCssAbs, caleBackup);
        }

        // Compilare SASS (loadPaths: node_modules pentru Bootstrap, folderScss pentru partiale)
        const rez = sass.compile(caleScssAbs, {
            loadPaths: [path.join(__dirname, 'node_modules'), obGlobal.folderScss],
            silenceDeprecations: ['import', 'color-functions', 'global-builtin', 'mixed-decls']
        });
        fs.writeFileSync(caleCssAbs, rez.css);
        console.log(`[SCSS] Compilare reușită: ${path.basename(caleScssAbs)} -> ${numeFisierCss}`);
    } catch (err) {
        console.error(`[SCSS Eroare]: ${err.message}`);
    }
}

// Compilare inițială și activare Watcher pentru modificări în timp real
if (fs.existsSync(obGlobal.folderScss)) {
    fs.readdirSync(obGlobal.folderScss).forEach(fisier => {
        if (fisier.endsWith('.scss')) {
            compileazaScss(fisier);
        }
    });

    fs.watch(obGlobal.folderScss, (eventType, filename) => {
        if (filename && filename.endsWith('.scss')) {
            compileazaScss(filename);
        }
    });
} else {
    fs.mkdirSync(obGlobal.folderScss, { recursive: true });
}

/* =========================================================
   VERIFICARE JSON ERORI (Bonus Etapa 4)
   ========================================================= */

/* Detecteaza chei duplicate IN ACELASI obiect, lucrand pe STRING (nu pe
   obiectul parsat*/
function gasesteCheiDuplicate(text) {
    let duplicate = [];
    let stack = [];           
    let inString = false;
    let escape = false;
    let strCurent = '';
    let ultimulString = null; 

    for (let i = 0; i < text.length; i++) {
        let c = text[i];

        if (escape) { strCurent += c; escape = false; continue; }
        if (inString && c === '\\') { escape = true; continue; }

        if (c === '"') {
            if (inString) { inString = false; ultimulString = strCurent; }
            else { inString = true; strCurent = ''; }
            continue;
        }
        if (inString) { strCurent += c; continue; }

        if (c === '{') {
            stack.push(new Set());
        } else if (c === '}') {
            stack.pop();
        } else if (c === ':') {
            // ultimulString este o cheie a obiectului de pe varful stivei
            if (stack.length > 0 && ultimulString !== null) {
                let set = stack[stack.length - 1];
                if (set.has(ultimulString)) duplicate.push(ultimulString);
                else set.add(ultimulString);
            }
            ultimulString = null;
        } else if (c === ',') {
            ultimulString = null;
        }
    }
    return duplicate;
}

function verificareErori() {
    let caleJsonErori = path.join(__dirname, 'erori.json');

    //  fisierul erori.json nu exista -> mesaj + inchidere aplicatie
    if (!fs.existsSync(caleJsonErori)) {
        console.error("[Verificare erori] EROARE FATALA: Fisierul 'erori.json' nu exista in radacina proiectului. Aplicatia se inchide.");
        process.exit();
    }

    let textErori = fs.readFileSync(caleJsonErori, 'utf8');

    //  proprietate specificata de mai multe ori in acelasi obiect (verificare pe string)
    let cheiDuplicate = gasesteCheiDuplicate(textErori);
    if (cheiDuplicate.length > 0) {
        console.error(`[Verificare erori] EROARE: In 'erori.json' exista chei duplicate in acelasi obiect: ${[...new Set(cheiDuplicate)].join(', ')}. Pastrati o singura aparitie pentru fiecare proprietate.`);
    }

    let date = JSON.parse(textErori);

    //  lipseste una dintre proprietatile de top: info_erori, cale_baza, eroare_default
    ["cale_baza", "eroare_default", "info_erori"].forEach(prop => {
        if (date[prop] === undefined) {
            console.error(`[Verificare erori] EROARE: Lipseste proprietatea obligatorie '${prop}' din 'erori.json'.`);
        }
    });

    //  pentru eroarea default lipseste titlu / text / imagine
    if (date.eroare_default) {
        ["titlu", "text", "imagine"].forEach(prop => {
            if (date.eroare_default[prop] === undefined) {
                console.error(`[Verificare erori] EROARE: 'eroare_default' nu are proprietatea '${prop}'.`);
            }
        });
    }

    // folderul din cale_baza nu exista in sistemul de fisiere
    if (date.cale_baza) {
        let caleBazaAbs = path.join(__dirname, date.cale_baza);
        if (!fs.existsSync(caleBazaAbs)) {
            console.error(`[Verificare erori] EROARE: Folderul specificat in 'cale_baza' (${date.cale_baza}) nu exista in sistemul de fisiere.`);
        } else {
            // Bonus (0.05): vreuna dintre imaginile asociate erorilor nu exista
            let deVerificat = [];
            if (Array.isArray(date.info_erori)) {
                date.info_erori.forEach(e => deVerificat.push(e.imagine));
            }
            if (date.eroare_default && date.eroare_default.imagine) {
                deVerificat.push(date.eroare_default.imagine);
            }
            deVerificat.forEach(img => {
                if (img && !fs.existsSync(path.join(caleBazaAbs, img))) {
                    console.error(`[Verificare erori] EROARE: Imaginea '${img}' asociata unei erori nu exista in folderul '${date.cale_baza}'.`);
                }
            });
        }
    }

    //  mai multe erori cu acelasi identificator
    if (Array.isArray(date.info_erori)) {
        let grupe = {};
        date.info_erori.forEach(e => {
            let id = e.identificator;
            if (!grupe[id]) grupe[id] = [];
            grupe[id].push(e);
        });
        Object.keys(grupe).forEach(id => {
            if (grupe[id].length > 1) {
                let detalii = grupe[id].map(e => {
                    let copie = Object.assign({}, e);
                    delete copie.identificator; // nu afisam identificatorul, restul proprietatilor da
                    return JSON.stringify(copie);
                }).join(' ; ');
                console.error(`[Verificare erori] EROARE: Exista ${grupe[id].length} erori cu acelasi identificator. Erorile (fara identificator): ${detalii}`);
            }
        });
    }
}
verificareErori();

/* =========================================================
   INIȚIALIZĂRI JSON (Erori + Galerie)
   ========================================================= */
function initEroriSiGalerie() {
    // 1. Initializare Erori (Din Etapa 4)
    let caleJsonErori = path.join(__dirname, 'erori.json');
    if (fs.existsSync(caleJsonErori)) {
        let textErori = fs.readFileSync(caleJsonErori, 'utf8');
        let parseData = JSON.parse(textErori);
        obGlobal.obErori = parseData;
    }

    // 2. Initializare Galerie (Etapa 5)
    let caleJsonGalerie = path.join(__dirname, 'galerie.json');
    if (fs.existsSync(caleJsonGalerie)) {
        let textGalerie = fs.readFileSync(caleJsonGalerie, 'utf8');
        let galerieData = JSON.parse(textGalerie);
        
        let caleGalerieAbs = path.join(__dirname, galerieData.cale_galerie);
        
        // Verificari Bonus 5 (JSON Galerie)
        if (!fs.existsSync(caleGalerieAbs)) {
            console.error(`Eroare Bonus 5: Folderul galeriei (${galerieData.cale_galerie}) nu exista!`);
            process.exit();
        }

        galerieData.imagini.forEach(img => {
            let caleImgAbs = path.join(caleGalerieAbs, img.cale_relativa);
            if (!fs.existsSync(caleImgAbs)) {
                console.error(`Eroare Bonus 5: Imaginea ${img.cale_relativa} lipseste din folder!`);
            }
        });

        obGlobal.obGalerie = galerieData;
    }
}
initEroriSiGalerie();

function afisareEroare(res, identificator, titlu, text, imagine) {
    if(!obGlobal.obErori) return res.status(500).send("Eroare interna.");
    let eroare = obGlobal.obErori.info_erori.find(e => e.identificator == identificator) || obGlobal.obErori.eroare_default;
    let errObj = {
        titlu: titlu || eroare.titlu,
        text: text || eroare.text,
        imagine: imagine || ('/' + path.join(obGlobal.obErori.cale_baza, eroare.imagine).replace(/\\/g, '/'))
    };
    let status = (eroare.status !== undefined && eroare.status) ? parseInt(identificator) : 200;
    res.status(status).render('pagini/eroare', errObj);
}

/* =========================================================
   MIDDLEWARE-URI (IP & Galerie Statica)
   ========================================================= */
// Etapa 4 - afisarea IP-ului utilizatorului
app.use((req, res, next) => {
    res.locals.ip = req.ip || req.connection.remoteAddress;
    next();
});

// Etapa 5 - Galerie statica: filtrare imagini dupa ora + generare variante mici/medii (sharp)
app.use(async (req, res, next) => {
    if (!obGlobal.obGalerie) return next();

    // Determinare timp din zi
    let oraCurenta = new Date().getHours();
    let conditieTimp = "noapte";
    if (oraCurenta >= 5 && oraCurenta < 12) conditieTimp = "dimineata";
    else if (oraCurenta >= 12 && oraCurenta < 20) conditieTimp = "zi";

    // Filtrare poze
    let imaginiFiltrate = obGlobal.obGalerie.imagini.filter(img => img.timp === conditieTimp);
    
    // Trunchiere la un numar divizibil cu 3
    let limit = Math.floor(imaginiFiltrate.length / 3) * 3;
    imaginiFiltrate = imaginiFiltrate.slice(0, limit);

    let caleGalerieFolder = obGlobal.obGalerie.cale_galerie;

    // Procesare cu Sharp
    for (let img of imaginiFiltrate) {
        let numeFaraExtensie = img.cale_relativa.split('.')[0];
        
        let caleAbsoluta = path.join(__dirname, caleGalerieFolder, img.cale_relativa);
        let caleMic = path.join(__dirname, caleGalerieFolder, `${numeFaraExtensie}-mic.webp`);
        let caleMediu = path.join(__dirname, caleGalerieFolder, `${numeFaraExtensie}-mediu.webp`);

        try {
            if (fs.existsSync(caleAbsoluta)) {
                if (!fs.existsSync(caleMic)) {
                    await sharp(caleAbsoluta).resize(300).toFormat('webp').toFile(caleMic);
                }
                if (!fs.existsSync(caleMediu)) {
                    await sharp(caleAbsoluta).resize(600).toFormat('webp').toFile(caleMediu);
                }
            }
        } catch(e) {
            console.error("Eroare la redimensionarea imaginii (Sharp):", e.message);
        }

        img.cale_mic = `/${caleGalerieFolder}/${numeFaraExtensie}-mic.webp`;
        img.cale_mediu = `/${caleGalerieFolder}/${numeFaraExtensie}-mediu.webp`;
        img.cale_mare = `/${caleGalerieFolder}/${img.cale_relativa}`;
    }

    res.locals.imaginiGalerie = imaginiFiltrate;
    next();
});

// Resurse statice
app.use((req, res, next) => {
    if (req.path.endsWith('.ejs')) return afisareEroare(res, 400);
    next();
});
app.use('/resurse', (req, res, next) => {
    if (req.path.endsWith('/')) return afisareEroare(res, 403);
    next();
});
app.use('/resurse', express.static(path.join(__dirname, 'resurse')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'resurse', 'imagini', 'ico', 'favicon.ico')));

/* =========================================================
   RUTE PAGINI
   ========================================================= */
app.get(['/', '/index', '/home'], (req, res) => {
    res.render('pagini/index');
});

/* GALERIE DINAMICA (Bonus): numar aleator de imagini (divizibil cu 3, < 16),
   consecutive cu offset aleator. CSS-ul este generat de SASS pe baza numarului. */
app.get('/galerie-dinamica', (req, res) => {
    if (!obGlobal.obGalerie || !Array.isArray(obGlobal.obGalerie.imagini)) {
        return afisareEroare(res, 404);
    }

    let imagini = obGlobal.obGalerie.imagini;
    let total = imagini.length;

    // Numere posibile: multipli de 3, < 16, dar nu mai mari decat cate imagini avem
    let maxMultiplu = Math.min(15, Math.floor(total / 3) * 3);
    let posibile = [];
    for (let k = 3; k <= maxMultiplu; k += 3) posibile.push(k);
    let nr = posibile.length ? posibile[Math.floor(Math.random() * posibile.length)] : Math.floor(total / 3) * 3;

    // Offset aleator astfel incat imaginile consecutive sa incapa
    let maxOffset = total - nr;
    let offset = Math.floor(Math.random() * (maxOffset + 1));

    let selectate = imagini.slice(offset, offset + nr).map(img => ({
        nume: img.nume,
        descriere: img.descriere,
        cale: '/' + obGlobal.obGalerie.cale_galerie + '/' + img.cale_relativa
    }));

    // Generare CSS din SASS pe baza numarului de imagini ales
    try {
        let rez = sass.compileString(`@use 'galerie-animata' with ($nr-imagini: ${nr});`, {
            loadPaths: [obGlobal.folderScss],
            silenceDeprecations: ['import', 'color-functions', 'global-builtin', 'mixed-decls']
        });
        fs.writeFileSync(path.join(obGlobal.folderCss, 'galerie-animata.css'), rez.css);
    } catch (e) {
        console.error('[Galerie animata SCSS Eroare]:', e.message);
    }

    res.render('pagini/galerie-dinamica', { imaginiAnimate: selectate, nrImagini: nr, offset: offset });
});

app.get('/:pagina', (req, res) => {
    let pagina = req.params.pagina;
    res.render('pagini/' + pagina, function(err, html) {
        if (err) {
            if (err.message.includes('Failed to lookup view')) return afisareEroare(res, 404);
            else return afisareEroare(res, 500, "Eroare Randare", err.message);
        }
        res.send(html);
    });
});

app.listen(port, () => {
    console.log(`Server pornit pe: http://localhost:${port}`);
});