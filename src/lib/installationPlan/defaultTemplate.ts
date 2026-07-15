import type { InstallationPlanSection } from './types';

export const INSTALLATION_PLAN_DOCUMENT_TITLE = 'Asennusselostus taloyhtiölle';

export function createDefaultInstallationPlanSections(): InstallationPlanSection[] {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Sisäyksikkö',
      body:
        'Sisäyksikkö sijoitetaan 2. kerroksen portaikkoon / aulatilaan. Paikka on keskeinen ja mahdollistaa tehokkaan ilman jakautumisen sekä 1. että 2. kerrokseen. Yksikkö kiinnitetään seinään standardikiinnikkeillä.',
    },
    {
      id: crypto.randomUUID(),
      title: 'Ulkoyksikkö',
      body:
        'Ulkoyksikkö sijoitetaan etupihalle keittiön ikkunan välittömään läheisyyteen maan tasolle maatelineelle. Ulkoyksikön viereen asennetaan erillinen turvakytkin.',
    },
    {
      id: crypto.randomUUID(),
      title: 'Putkistot ja kaapelointi',
      body:
        '• Kylmäaineletkut ja kondenssivesiputki vedetään 2. kerroksen makuuhuoneen (MH) kautta.\n'
        + '• Putkireitti suunnitellaan siten, että kondenssiveden poisto onnistuu painovoimaisesti.\n'
        + '• Reitti kulkee 2. kerroksen makuuhuoneen seinän läpi ulkoseinään ja edelleen etupihalle ulkoyksikölle.\n'
        + '• Seinärakenteisiin tehdään tarvittavat poraukset (Ø 70 mm), jotka tiivistetään huolellisesti palokatko- ja kosteuseristein.\n'
        + '• Sähkö- ja ohjauskaapelointi vedetään sisäyksiköltä ulkoyksikölle pääosin samaa reittiä.\n'
        + '• Sähköliitäntä tehdään asunnon sähkökeskuksesta. Koska asunnoissa on rajoitetusti ryhmätilaa, ilmalämpöpumppu liitetään sopivimpaan ryhmään, jossa kuormitus aiheuttaa mahdollisimman vähän haittaa muille laitteille.\n'
        + '• Ulkoyksikön läheisyyteen asennetaan pääkatkaisin (turvakytkin).',
    },
    {
      id: crypto.randomUUID(),
      title: 'Muut toimenpiteet',
      body:
        '• Asennusalue siivotaan huolellisesti työn päätteeksi.\n'
        + '• Mahdolliset pienet seinä- ja pintavauriot korjataan (maalaus tms.).',
    },
    {
      id: crypto.randomUUID(),
      title: 'Asennusaikataulu ja huomioitavaa',
      body:
        '• Asennus suoritetaan arkipäivisin ja kestää tyypillisesti 1 päivän per laite.\n'
        + '• Asennuksesta tiedotetaan taloyhtiön asukkaille etukäteen.\n'
        + '• Asennuksen aikana 2. kerroksen makuuhuoneessa on lyhytaikaista tavaroiden siirtoa ja suojausta.',
    },
  ];
}

export function defaultInstallationPlanData(): {
  descriptionIntro: string;
  attachmentsNote: string;
  closingText: string;
  contactInfo: string;
  sections: InstallationPlanSection[];
} {
  return {
    descriptionIntro:
      'Suunnittelemme asentaa jäähdyttävän ilmalämpöpumpun huoneistoihin seuraavasti:',
    sections: createDefaultInstallationPlanSections(),
    attachmentsNote:
      '• Pohjapiirustus merkinnöin (liitteenä)\n'
      + '• Valokuvat nykytilanteesta (tarvittaessa)\n'
      + '• Laitteen tarkka malli ja teho (täydennetään kun laite on valittu)',
    closingText:
      'Pyydämme taloyhtiöltä suostumusta asennukseen sekä mahdolliset ohjeet (esim. julkisivun väri, telineen sijoittelu tai muut taloyhtiön vaatimukset).\n'
      + 'Asennuksen suorittaa valtuutettu ammattilainen (KVV- ja sähkötyöt).\n'
      + 'Tarvittaessa täydennän selostusta laitteen tarkoilla tiedoilla tai lisäpiirustuksilla.',
    contactInfo: '',
  };
}
