import type { ImageSourcePropType } from 'react-native';

const IMG = {
  libreria: require('../../../docs/img/libreria.png') as ImageSourcePropType,
  player: require('../../../docs/img/player.png') as ImageSourcePropType,
  appunto: require('../../../docs/img/appunto.png') as ImageSourcePropType,
  album: require('../../../docs/img/album.png') as ImageSourcePropType,
  bozza: require('../../../docs/img/bozza.png') as ImageSourcePropType,
};

export type TourStep = {
  id: string;
  title: string;
  body: string;
  image?: ImageSourcePropType;
};

export type GuideSection = {
  id: string;
  title: string;
  body: string;
  image?: ImageSourcePropType;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    title: 'Tre passi, poi sei pronto',
    body: 'Ti mostro come mettere un brano, ascoltarlo e scrivere un appunto sul momento esatto. Puoi saltare quando vuoi.',
  },
  {
    id: 'add',
    title: 'Aggiungi un brano',
    body: 'Nella Home, tocca ＋ in alto. Puoi scegliere un file dal telefono oppure registrare una bozza al volo.',
    image: IMG.libreria,
  },
  {
    id: 'note',
    title: 'Tocca + sul momento',
    body: 'Apri un brano. Quando senti il punto da ricordare, tocca il pulsante arancione. L’audio si ferma e si apre un fumetto con l’orario già scritto.',
    image: IMG.appunto,
  },
  {
    id: 'help',
    title: 'Il punto di domanda',
    body: 'Il ? in alto a destra riapre questa guida. Nelle Impostazioni trovi anche le domande frequenti, con le schermate.',
    image: IMG.player,
  },
];

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: 'home',
    title: 'Home',
    body: 'Qui trovi i brani, le cartelle e gli album.',
    image: IMG.libreria,
  },
  {
    id: 'add',
    title: 'Aggiungere un brano',
    body: 'Tocca ＋ in alto a destra. Puoi scegliere un file dal telefono oppure registrare una bozza.',
    image: IMG.album,
  },
  {
    id: 'listen',
    title: 'Ascolto',
    body: 'Tocca un brano per ascoltarlo. Titolo, tempo, onda e i tasti restano sempre uguali.',
    image: IMG.player,
  },
  {
    id: 'note',
    title: 'Appunto',
    body: 'Il tasto arancione + ferma l’audio e apre un fumetto con l’orario già scritto.',
    image: IMG.appunto,
  },
  {
    id: 'album',
    title: 'Album',
    body: 'Un album raccoglie i brani di un progetto o di una lezione.',
    image: IMG.album,
  },
  {
    id: 'sketch',
    title: 'Bozza',
    body: 'Puoi registrare una bozza: un audio veloce che resta sul telefono.',
    image: IMG.bozza,
  },
  {
    id: 'settings',
    title: 'Impostazioni',
    body: 'L’ingranaggio apre account, privacy e le domande frequenti.',
  },
  {
    id: 'help',
    title: 'Questa guida',
    body: 'Il tasto ? in alto a destra riapre questa guida quando vuoi.',
  },
];
