/* =========================================================
   Etapa 3 - Meniu (hamburger + deschidere submeniu pe ecran mic)
   ========================================================= */
document.addEventListener('DOMContentLoaded', function () {
    var hamburger = document.getElementById('hamburger-menu');
    var nav = document.getElementById('main-nav');

    if (hamburger && nav) {
        hamburger.addEventListener('click', function () {
            var seInchide = nav.classList.contains('nav-open');
            nav.classList.toggle('nav-open');

            var toateSubmeniurile = nav.querySelectorAll('.sub-meniu');
            if (!seInchide) {
                /* La deschidere: primul submeniu se deschide automat */
                var primulSubmeniu = nav.querySelector('.sub-meniu');
                if (primulSubmeniu) {
                    primulSubmeniu.classList.add('submeniu-open');
                }
            } else {
                /* La închidere: toate submeniurile se închid */
                toateSubmeniurile.forEach(function (s) {
                    s.classList.remove('submeniu-open');
                });
            }
        });
    }

    /* Click pe link cu submeniu pe ecran mic: toggle submeniu */
    document.querySelectorAll('.menu-principal > li').forEach(function (li) {
        var link = li.querySelector('.nav-link');
        var submeniu = li.querySelector('.sub-meniu');

        if (submeniu && link) {
            link.addEventListener('click', function (e) {
                if (window.innerWidth <= 600) {
                    e.preventDefault();
                    var eraOpen = submeniu.classList.contains('submeniu-open');
                    nav.querySelectorAll('.sub-meniu').forEach(function (s) {
                        s.classList.remove('submeniu-open');
                    });
                    if (!eraOpen) {
                        submeniu.classList.add('submeniu-open');
                    }
                }
            });
        }
    });
});
