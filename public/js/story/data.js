// Toutes les données de l'aventure, réunies pour le moteur (engine.js), l'hôte (host.js) et les écrans.
// Ajouter un acte : un fichier scripts/actN.js, ajouté à la liste ci-dessous.
import { CAMPAIGN } from './campaign.js';
import { EPISODES } from './episodes.js';
import { JOBS } from './jobs.js';
import { CAST, POOLS } from './cast.js';
import { SCRIPTS as ACT1 } from './scripts/act1.js';
import { SCRIPTS as ACT2 } from './scripts/act2.js';
import { SCRIPTS as ACT3 } from './scripts/act3.js';
import { SCRIPTS as ACT4 } from './scripts/act4.js';

export const DATA = {
  campaign: CAMPAIGN,
  episodes: EPISODES,
  jobs: JOBS,
  cast: CAST,
  pools: POOLS,
  scripts: { ...ACT1, ...ACT2, ...ACT3, ...ACT4 },
};
