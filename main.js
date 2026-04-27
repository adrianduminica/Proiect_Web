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

        // Compilare SASS
        const rez = sass.compile(caleScssAbs);
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
app.use((req, res, next) => {
    res.locals.ip = req.ip || req.connection.remoteAddress;
    next();
});

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