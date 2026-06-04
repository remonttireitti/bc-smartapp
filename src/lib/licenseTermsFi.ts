/** Selitteet ja taivutetut otsikot (lisenssi / tilaus). */

export type LicenseTermsHelpVariant = 'company' | 'adminOverview' | 'adminEditor' | 'nav';

export const LICENSE_TERMS_HELP_CONTENT: Record<
  LicenseTermsHelpVariant,
  { title: string; paragraphs: string[] }
> = {
  company: {
    title: 'Palvelun tila, lisenssi ja tilaus',
    paragraphs: [
      'Lisenssi on yrityksesi käyttöoikeus valittuihin ohjelman moduuleihin (esim. tarjoukset, laskutus).',
      'Tilaus tarkoittaa valitsemiasi moduuleja, laskutusjaksoa ja maksua. Kokeilujakson aikana kaikki moduulit ovat käytössä ilmaiseksi.',
      'Kokeilun päättyttyä voit lähettää tilauksen tai ottaa yhteyttä BC Smartappiin. Maksun jälkeen valitut moduulit aktivoidaan lisenssiin.',
    ],
  },
  adminOverview: {
    title: 'Yritysten tilaukset ja lisenssit',
    paragraphs: [
      'Vanha sopimus: ei kokeilua eikä laskutusta, kaikki moduulit vapaasti (aiemmin luodut yritykset).',
      'Tilaus ja kokeilu: kokeilu alkaa ensimmäisestä kirjautumisesta. Maksavan asiakkaan moduulit (✓/✗) hallitset kohdassa Yrityksen tilaus ja moduulit.',
      'Kokeilua voi jatkaa ilman maksua (+30 pv). Kirjautuminen ja kokeilun päättyminen näkyvät omissa sarakkeissaan.',
      'Sisäiset käyttäjät = ylläpitäjät, esimiehet ja asentajat (sama lista kuin Hallinta → Käyttäjät). Lukema "tiliä yhteensä" sisältää myös muut roolit samalla yrityksellä.',
    ],
  },
  adminEditor: {
    title: 'Yrityksen tilaus ja moduulit',
    paragraphs: [
      'Yritysmalli määrittää, onko kyseessä vanha sopimus vai tilaus-/kokeilumalli.',
      'Tila ja maksu: kokeilujakso, maksava asiakas tai päättynyt tilaus. Moduulien kytkimet koskevat maksavaa asiakasta (kokeilussa kaikki auki).',
      'Laskutus-kytkin: sekä tilaus/lisenssi että näkyvyys valikossa (ei erillistä lohkoa). Vanhassa sopimuksessa vain valikon näkyvyys.',
    ],
  },
  nav: {
    title: 'Tilaukset ja moduulit',
    paragraphs: [
      'Hallitset yritysten kokeilujaksoja, tilauksia, maksutiloja ja moduulien käyttöoikeuksia (lisenssejä).',
      'Hinnoittelu koskee kaikkia uusia tilauksia. Yrityskohtainen hallinta on tilauskatsauksessa ja alla olevassa lomakkeessa.',
    ],
  },
};

/** Otsikot oikeassa muodossa (ei nominatiivi "Lisenssi ja tilaus"). */
export const LICENSE_SECTION_TITLES = {
  companyPanel: 'Palvelun tila',
  adminOverview: 'Yritysten tilaukset',
  adminEditor: 'Yrityksen tilaus ja moduulit',
  adminNav: 'Tilaukset ja moduulit',
  adminNavDesc: 'Kokeilujaksot, tilaukset, maksut ja moduulien käyttöoikeudet',
} as const;
