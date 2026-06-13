import type { QuoteRequestData, QuoteTermsPrintFlags, QuoteType } from './types';

/** Termatek Oy – Perusasennus, takuut ja huolto (IILP). Lähde: Termatek_Perusasennus_Takuut_Huolto_Valmis.docx */
export const DEFAULT_TERMATEK_IILP_QUOTE_TERMS = `Perusasennus, takuut ja huolto

Tarjous sisältää ilmalämpöpumpun perusasennuksen alla kuvatulla laajuudella.

Perusasennuksen sisältö

Kylmäasennustyöt
- 5 m putkitus, joka koteloidaan seinäosuuksilla
- Putkiyhteet 3/8" + 1/4" (yleisin)
- Seinä- tai maateline ulkoyksikön kiinnittämistä varten
- Kylmäasennukset suorittaa kylmäalan ammattilainen

Sähköasennustyöt
- Sähkönsyöttö valmiiksi asennetusta turvakytkimestä ulkoyksikölle, johdon pituus enintään 4 m
- Ulko- ja sisäyksikön välinen kaapelointi
- Sähköasennukset suorittaa sähköalan ammattilainen

Rakennustyöt
- Läpivienti puurunkoiseen ja puuverhoiltuun ulkoseinään
- Kondenssivesiputken vienti sisäyksiköltä ulos
- Ulkoyksikön asennuskorkeus enintään 1,5 m maatasosta
- Sisäyksikön asennuskorkeus, alareuna enintään 2,5 m korkeudessa

Viimeistely
- Käyttöönottotarkastus
- Käytönopastus
- Käyttöönotto- ja luovutuspöytäkirjan täyttö

Perusasennukseen ei sisälly
- Varokkeen tai vikavirtasuojan asentaminen sähköpäätauluun
- Sähkönsyötön tuominen pääkeskukselta sisä- tai ulkoyksikön läheisyyteen
- Työtä haittaavien esteiden poistaminen asennuspaikalta
- Ulkoyksikön kondenssiveden viemäröinti
- Timanttiporausta edellyttävät läpiviennit
- Asennukset kohteisiin, jotka edellyttävät erityisiä välineitä, kuten rakennustelineitä tai nosturia
- Lisäputkitus 40 €/m (sis. ALV 25,5 %).

Takuut

Termatek myöntää suorittamalleen asennustyölle kahden (2) vuoden takuun työn valmistumispäivästä lukien. Takuu kattaa asennusvirheistä johtuvat viat, jotka ilmenevät takuuaikana.

Takuu ei kata normaalia kulumista, käyttövirheitä, puutteellisesta huollosta johtuvia vikoja eikä kolmansien osapuolten tekemiä muutoksia tai korjauksia.

Laitteiden ja tarvikkeiden osalta noudatetaan valmistajan voimassa olevia takuuehtoja. Valmistajan takuu kattaa materiaali- ja valmistusvirheet, mutta ei virheellisestä käytöstä tai asennusympäristöstä johtuvia vaurioita.

Mahdollisista laajennetuista takuista sovitaan erikseen ja ne kirjataan tilausvahvistukseen.

Käyttöönotto ja dokumentaatio

Asennuksen valmistuttua asiakkaalle luovutetaan käyttö- ja huolto-ohjeet, käyttöönottoon liittyvä dokumentaatio sekä käyttöönotto- ja luovutuspöytäkirja.

Asiakkaan vastuulla on säilyttää dokumentaatio mahdollista takuukäsittelyä ja huoltoa varten.

Järjestelmän käyttö ja huolto

Laitteen asianmukainen toiminta edellyttää käyttö- ja huolto-ohjeiden noudattamista.

Laitteen takuun voimassaolo edellyttää valmistajan huolto-ohjeiden mukaista huoltoa.

Termatek tarjoaa erikseen sovittaessa määräaikaishuoltoja, tarkastuksia sekä muita tukipalveluita myös takuuajan jälkeen.

Lisätyöt

Mahdolliset lisätyöt suoritetaan vain asiakkaan hyväksynnällä ja laskutetaan erikseen.

Termatek pidättää oikeuden tehdä vähäisiä teknisiä muutoksia asennustapaan, mikäli ne parantavat järjestelmän toimivuutta tai turvallisuutta.

Yleiset ehdot

Tarjoukseen sovelletaan lisäksi Termatek Oy:n yleisiä sopimusehtoja, jotka ovat tämän tarjouksen liitteenä.`;

export const DEFAULT_QUOTE_TERMS_PRINT: QuoteTermsPrintFlags = {
  baseInstall: true,
  warranty: true,
  commissioning: true,
  operationMaintenance: true,
  extraWork: true,
  general: true,
};

export const QUOTE_TERMS_PRINT_LABELS: Record<keyof QuoteTermsPrintFlags, string> = {
  baseInstall: 'Perusasennuksen ehdot',
  warranty: 'Takuut',
  commissioning: 'Käyttöönotto ja dokumentaatio',
  operationMaintenance: 'Käyttö ja huolto',
  extraWork: 'Lisätyöt',
  general: 'Yleiset ehdot',
};

const TERM_SECTION_HEADINGS: Array<{ key: keyof QuoteTermsPrintFlags; heading: string }> = [
  { key: 'warranty', heading: 'Takuut' },
  { key: 'commissioning', heading: 'Käyttöönotto ja dokumentaatio' },
  { key: 'operationMaintenance', heading: 'Järjestelmän käyttö ja huolto' },
  { key: 'extraWork', heading: 'Lisätyöt' },
  { key: 'general', heading: 'Yleiset ehdot' },
];

export function resolveQuoteTermsPrintFlags(data: QuoteRequestData): QuoteTermsPrintFlags {
  const raw = data.quoteTermsPrint;
  if (!raw) return { ...DEFAULT_QUOTE_TERMS_PRINT };
  return {
    baseInstall: raw.baseInstall !== false,
    warranty: raw.warranty !== false,
    commissioning: raw.commissioning !== false,
    operationMaintenance: raw.operationMaintenance !== false,
    extraWork: raw.extraWork !== false,
    general: raw.general !== false,
  };
}

export function quoteTermsPrintHasAnyEnabled(flags: QuoteTermsPrintFlags): boolean {
  return Object.values(flags).some(Boolean);
}

/** Suodattaa plain text -ehdot tulostusta varten valittujen osioiden mukaan. */
export function filterQuoteTermsTextForPrint(text: string, flags: QuoteTermsPrintFlags): string {
  if (!quoteTermsPrintHasAnyEnabled(flags)) return '';

  const lines = text.split('\n');
  const titleLine = lines[0]?.trim() ?? '';
  let bodyStart = 1;
  while (bodyStart < lines.length && !lines[bodyStart]?.trim()) bodyStart += 1;

  const sections: Record<keyof QuoteTermsPrintFlags, string[]> = {
    baseInstall: [],
    warranty: [],
    commissioning: [],
    operationMaintenance: [],
    extraWork: [],
    general: [],
  };

  let currentKey: keyof QuoteTermsPrintFlags = 'baseInstall';
  for (let i = bodyStart; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const match = TERM_SECTION_HEADINGS.find((entry) => entry.heading === trimmed);
    if (match) {
      currentKey = match.key;
      sections[currentKey].push(line);
      continue;
    }
    sections[currentKey].push(line);
  }

  const parts: string[] = [];
  if (flags.baseInstall) {
    if (titleLine) parts.push(titleLine);
    const content = sections.baseInstall.join('\n').trim();
    if (content) parts.push(content);
  }
  for (const { key } of TERM_SECTION_HEADINGS) {
    if (!flags[key]) continue;
    const content = sections[key].join('\n').trim();
    if (content) parts.push(content);
  }

  return parts.join('\n\n').trim();
}

export function defaultQuoteTermsTextForType(type: QuoteType): string {
  return type === 'ilma-ilma' ? DEFAULT_TERMATEK_IILP_QUOTE_TERMS : '';
}

/** Muuntaa lomakkeen plain text -ehdot tulosteen HTML:ksi. */
export function quoteTermsPlainTextToHtml(text: string): string {
  const esc = (v: string) =>
    v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const parts: string[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const isBulletBlock = lines.every((line) => line.startsWith('- '));
    if (isBulletBlock) {
      parts.push(`<ul>${lines.map((line) => `<li>${esc(line.slice(2))}</li>`).join('')}</ul>`);
      continue;
    }

    if (lines.length === 1) {
      const line = lines[0];
      const looksLikeHeading =
        line.length <= 80 &&
        !line.endsWith('.') &&
        !line.startsWith('- ') &&
        (/^[A-ZÄÖÅ]/.test(line) || /^(Kylmä|Sähkö|Rakennus|Viimeistely)/.test(line));
      if (looksLikeHeading) {
        parts.push(`<h3>${esc(line)}</h3>`);
        continue;
      }
    }

    parts.push(`<p>${esc(lines.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }

  return parts.join('\n');
}
