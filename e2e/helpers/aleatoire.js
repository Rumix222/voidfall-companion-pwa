/**
 * e2e/helpers/aleatoire.js
 * Générateur pseudo-aléatoire seedé (mulberry32) — permet de rejouer
 * exactement le même déroulé de scénario à partir d'un seed donné (log
 * dans le rapport de chaque run, voir e2e/helpers/rapport.js). Sans lui,
 * un run aléatoire en échec serait impossible à reproduire pour debugger.
 */

function creerRng(seed) {
  var a = seed >>> 0;

  function suivant() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    entierEntre: function (min, max) {
      return min + Math.floor(suivant() * (max - min + 1));
    },
    choisirParmi: function (liste) {
      if (!liste.length) return undefined;
      return liste[this.entierEntre(0, liste.length - 1)];
    },
    seed: seed
  };
}

module.exports = { creerRng: creerRng };
