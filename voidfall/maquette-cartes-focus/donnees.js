/**
 * donnees.js — 5 cartes d'exemple partagées par les 3 pages de la
 * maquette (actuel.html / variante-a-popup.html / variante-b-carte.html),
 * pour comparer à contenu strictement égal. Choisies pour couvrir les cas
 * A à G de NOTES.md (voir ce fichier pour le détail de chaque cas).
 *
 * Données FICTIVES pour la démo (pas besoin de coller exactement au
 * catalogue réel) mais inspirées de vraies cartes du jeu — noms d'actions
 * et libellés d'options identiques aux clés réelles du moteur.
 */
var CARTES_EXEMPLE = [
  {
    id: 'politique-negocier',
    cas: 'Cas A — Résolution automatique, aucune popup',
    focus: 'Politique',
    action: 'Négocier',
    texte: 'Gagnez 1 Influence.',
    cout: [{ label: '1', titre: '1 Crédit', couleur: '#d1a671' }],
    type: 'auto',
    resultat: '+1 Influence, −1 Crédit'
  },
  {
    id: 'production-ravitailler',
    cas: 'Cas B — Popup informative, sans choix réel',
    focus: 'Production',
    action: 'Ravitailler',
    texte: 'Produisez de l’Énergie (autant que votre Revenu actuel).',
    cout: [],
    type: 'informatif',
    ressource: 'Énergie',
    revenuActuel: 4
  },
  {
    id: 'developpement-harmoniser',
    cas: 'Cas C — Choix exclusif (un seul, boutons de liste)',
    focus: 'Développement',
    action: 'Harmoniser',
    texte: 'Augmentez une Population Pure ou retirez une Corruption.',
    cout: [{ label: '1', titre: '1 Science', couleur: '#06afe5' }],
    type: 'exclusif',
    options: ['Augmenter une population', 'Retirer une Corruption']
  },
  {
    id: 'conquete-planifier',
    cas: 'Cas D + E + F — Choix inclusif, sélection dynamique, paiement Crédit',
    focus: 'Conquête',
    action: 'Planifier',
    texte: 'Gagnez un Programme et/ou déplacez une Corruption.',
    cout: [
      { label: '1', titre: '1 Crédit', couleur: '#d1a671' },
      { label: '1', titre: '1 Énergie — réserve à 0, nécessite une substitution', couleur: '#f8a21b' }
    ],
    type: 'inclusif',
    options: ['Gagner un Programme', 'Déplacer une Corruption'],
    energieReserve: 0,
    energieCredit: 3,
    // Sous-écran de sélection affiché si "Déplacer une Corruption" est
    // coché (cas E — sélection dynamique, ici simplifiée à une étape).
    ciblesCorruption: ['Secteur 4 (vous appartient, Corrompu)', 'Piste Économie (Corrompue)', 'Programme "Poigne de Fer"']
  },
  {
    id: 'conquete-engager',
    cas: 'Cas G — Configurateur multi-étapes',
    focus: 'Conquête',
    action: 'Engager',
    texte: 'Envahissez un secteur ou regroupez.',
    cout: [{ label: '2', titre: '2 Énergie', couleur: '#f8a21b' }],
    type: 'exclusif-configurateur',
    options: ['Envahir un secteur', 'Regrouper'],
    secteursRegrouper: [1, 2, 3]
  }
];

/**
 * Construit le markup d'une pastille de coût — même gabarit visuel que
 * pastillesCoutHTML_ (js/strategieService.js), simplifié (une seule
 * valeur numérique par pastille, cas réel le plus courant).
 */
function pastillesCoutHTML(cout) {
  if (!cout || !cout.length) return '';
  return '<div class="focus-action-cout">' + cout.map(function (c) {
    return '<span class="pastille-cout" style="--couleur-pastille:' + c.couleur + '" title="' + c.titre + '">' + c.label + '</span>';
  }).join('') + '</div>';
}
