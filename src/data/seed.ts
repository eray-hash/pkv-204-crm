import type {
  Lead,
  Termin,
  Nachricht,
  Auszahlung,
  UmsatzPunkt,
  SalesProvisionZeile,
  TeamProvisionZeile,
  Benachrichtigung,
  Teammitglied,
  OnboardingVideo,
  Profil,
  Aktivitaet,
  LeadStatus,
} from '../types'
import { uid, isoDaysAgo, isoDaysFromNow } from '../lib/utils'

const VORNAMEN = [
  'Thomas', 'Michael', 'Andreas', 'Stefan', 'Christian', 'Peter', 'Markus', 'Frank',
  'Julia', 'Sabine', 'Claudia', 'Petra', 'Sandra', 'Nicole', 'Anja', 'Katrin',
  'Wolfgang', 'Jürgen', 'Klaus', 'Dieter', 'Martina', 'Birgit', 'Ursula', 'Monika',
  'Sebastian', 'Daniel', 'Florian', 'Tobias', 'Matthias', 'Alexander', 'Jan', 'Philipp',
  'Laura', 'Christina', 'Melanie', 'Vanessa', 'Jessica', 'Nadine', 'Simone', 'Heike',
]

const NACHNAMEN = [
  'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker',
  'Schulz', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf',
  'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hofmann', 'Lange', 'Schmitt',
  'Werner', 'Krause', 'Meier', 'Lehmann', 'Huber', 'Mayer', 'Herrmann', 'König',
]

const VERSICHERER = ['Allianz', 'DKV', 'Debeka', 'Signal Iduna', 'HanseMerkur', 'Axa', 'Central', 'Barmenia', 'Continentale', 'SDK']

const TARIFE = [
  'Komfort Plus', 'Premium 100', 'Basis Select', 'Classic Med', 'Vital 2000',
  'Top Schutz', 'Exklusiv 300', 'Standard Med', 'Komfort Zahn', 'Vorsorge Plus',
]

const STAEDTE = ['München', 'Hamburg', 'Köln', 'Frankfurt am Main', 'Stuttgart', 'Düsseldorf', 'Leipzig', 'Nürnberg', 'Hannover', 'Dresden']

let counter = 0
function rnd(seed: number): number {
  const x = Math.sin(seed + counter++) * 10000
  return x - Math.floor(x)
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd(arr.length) * arr.length)]
}

function randInt(min: number, max: number): number {
  return Math.floor(rnd(max - min) * (max - min + 1)) + min
}

function buildName(): { name: string; email: string } {
  const vor = pick(VORNAMEN)
  const nach = pick(NACHNAMEN)
  const name = `${vor} ${nach}`
  const email = `${vor.toLowerCase()}.${nach.toLowerCase()}@web.de`
  return { name, email }
}

function buildPhone(): string {
  return `0${randInt(15, 17)}${randInt(1, 9)} ${randInt(1000000, 9999999)}`
}

function buildAktivitaeten(status: LeadStatus, erstelltVorTagen: number): Aktivitaet[] {
  const items: Aktivitaet[] = []
  items.push({ id: uid('akt'), datum: isoDaysAgo(erstelltVorTagen), typ: 'status', text: 'Lead angelegt (Status: Neu)' })
  if (status !== 'Neu') {
    items.push({ id: uid('akt'), datum: isoDaysAgo(Math.max(erstelltVorTagen - 1, 0)), typ: 'anruf', text: 'Erstkontakt telefonisch hergestellt' })
  }
  if (['Termin vereinbart', 'Beratung', 'Antrag', 'Gewonnen', 'Verloren'].includes(status)) {
    items.push({ id: uid('akt'), datum: isoDaysAgo(Math.max(erstelltVorTagen - 3, 0)), typ: 'termin', text: 'Erstgespräch vereinbart' })
  }
  if (['Beratung', 'Antrag', 'Gewonnen', 'Verloren'].includes(status)) {
    items.push({ id: uid('akt'), datum: isoDaysAgo(Math.max(erstelltVorTagen - 5, 0)), typ: 'notiz', text: 'Tarifvergleich erstellt und per E-Mail versendet' })
  }
  if (['Antrag', 'Gewonnen', 'Verloren'].includes(status)) {
    items.push({ id: uid('akt'), datum: isoDaysAgo(Math.max(erstelltVorTagen - 7, 0)), typ: 'email', text: 'Antragsunterlagen (§204 Tarifwechsel) versendet' })
  }
  if (status === 'Gewonnen') {
    items.push({ id: uid('akt'), datum: isoDaysAgo(Math.max(erstelltVorTagen - 9, 0)), typ: 'status', text: 'Tarifwechsel erfolgreich abgeschlossen – Kunde gewonnen' })
  }
  if (status === 'Verloren') {
    items.push({ id: uid('akt'), datum: isoDaysAgo(Math.max(erstelltVorTagen - 9, 0)), typ: 'status', text: 'Lead als verloren markiert' })
  }
  return items
}

function buildLead(opts: {
  liste: Lead['liste']
  status: LeadStatus
  erstelltVorTagen: number
  mitWiedervorlage?: boolean
  wiedervorlageInTagen?: number
}): Lead {
  const { name, email } = buildName()
  const beitragAlt = randInt(300, 900)
  const ersparnisProzent = randInt(12, 32) / 100
  const beitragNeu = ['Antrag', 'Gewonnen'].includes(opts.status) ? Math.round(beitragAlt * (1 - ersparnisProzent)) : undefined
  const ersparnis = beitragNeu ? beitragAlt - beitragNeu : undefined

  const lead: Lead = {
    id: uid('lead'),
    name,
    telefon: buildPhone(),
    email,
    versicherer: pick(VERSICHERER),
    tarif: pick(TARIFE),
    beitragAlt,
    beitragNeu,
    ersparnis,
    status: opts.status,
    liste: opts.liste,
    erstelltAm: isoDaysAgo(opts.erstelltVorTagen),
    notizen: pick([
      'Interesse an Beitragsoptimierung nach §204 VVG signalisiert.',
      'Wünscht Rückruf am Nachmittag.',
      'Ist mit aktuellem Versicherer unzufrieden, sucht Alternativen.',
      'Familienzuwachs geplant, Tarif soll angepasst werden.',
      'Vergleichsangebot angefordert, wartet auf Rückmeldung.',
      'Empfehlung von Bestandskunde erhalten.',
    ]),
    aktivitaeten: buildAktivitaeten(opts.status, opts.erstelltVorTagen),
  }

  if (opts.liste === 'verloren') {
    lead.verlorenGrund = pick([
      'Kein Interesse mehr an Tarifwechsel',
      'Bleibt beim aktuellen Versicherer',
      'Nicht mehr erreichbar',
      'Hat sich für Mitbewerber entschieden',
      'Gesundheitsprüfung nicht bestanden',
    ])
  }

  if (opts.mitWiedervorlage) {
    lead.wiedervorlage = {
      datum: opts.wiedervorlageInTagen !== undefined ? isoDaysFromNow(opts.wiedervorlageInTagen, randInt(9, 17)) : isoDaysAgo(0),
      notiz: pick([
        'Rückruf wegen Entscheidung zum Tarifwechsel',
        'Unterlagen nachfassen',
        'Nach Rücksprache mit Ehepartner erneut kontaktieren',
        'Angebot nachfassen',
        'Termin zur finalen Beratung vereinbaren',
      ]),
    }
  }

  return lead
}

export function buildLeads(): Lead[] {
  const leads: Lead[] = []

  // Gewonnene Kunden (Kundenbereich)
  const kundenStatus: LeadStatus[] = new Array(19).fill('Gewonnen')
  kundenStatus.forEach((status, i) => {
    leads.push(buildLead({ liste: 'kunde', status, erstelltVorTagen: randInt(10, 240), mitWiedervorlage: i % 6 === 0, wiedervorlageInTagen: randInt(1, 20) }))
  })

  // Verlorene Leads
  for (let i = 0; i < 11; i++) {
    leads.push(buildLead({ liste: 'verloren', status: 'Verloren', erstelltVorTagen: randInt(5, 180) }))
  }

  // Alte Leads (inaktiv, älter)
  const alteStatus: LeadStatus[] = ['Neu', 'Kontaktiert', 'Neu', 'Kontaktiert', 'Termin vereinbart', 'Neu', 'Kontaktiert', 'Neu']
  alteStatus.forEach((status) => {
    leads.push(buildLead({ liste: 'alt', status, erstelltVorTagen: randInt(120, 400) }))
  })

  // Aktive Leads (laufende Pipeline, für Leads-Übersicht & Power Dialer)
  const aktivStatus: LeadStatus[] = [
    'Neu', 'Neu', 'Neu', 'Neu', 'Neu', 'Neu',
    'Kontaktiert', 'Kontaktiert', 'Kontaktiert', 'Kontaktiert',
    'Termin vereinbart', 'Termin vereinbart', 'Termin vereinbart',
    'Beratung', 'Beratung',
    'Antrag', 'Antrag',
  ]
  aktivStatus.forEach((status, i) => {
    leads.push(
      buildLead({
        liste: 'aktiv',
        status,
        erstelltVorTagen: randInt(0, 30),
        mitWiedervorlage: i % 4 === 0,
        wiedervorlageInTagen: i % 8 === 0 ? -randInt(1, 4) : randInt(0, 10),
      }),
    )
  })

  return leads
}

export function buildTermine(leads: Lead[]): Termin[] {
  const termine: Termin[] = []
  const kandidaten = leads.filter((l) => l.liste === 'aktiv').slice(0, 14)
  kandidaten.forEach((lead, i) => {
    const tagOffset = i - 3 // einige in der Vergangenheit, einige in der Zukunft
    const stunde = 9 + (i % 8)
    termine.push({
      id: uid('termin'),
      typ: i % 2 === 0 ? 'Erstgespräch' : 'Beratungsgespräch',
      leadName: lead.name,
      leadId: lead.id,
      datum: isoDaysFromNow(tagOffset, stunde, i % 2 === 0 ? 0 : 30),
      dauerMinuten: i % 2 === 0 ? 30 : 45,
      format: pick(['Video', 'Telefon', 'Vor Ort']),
    })
  })
  // Ein paar zusätzliche Termine im September/Oktober 2026
  termine.push({ id: uid('termin'), typ: 'Erstgespräch', leadName: 'Sabine Krüger', datum: '2026-09-22T10:00:00', dauerMinuten: 30, format: 'Telefon' })
  termine.push({ id: uid('termin'), typ: 'Beratungsgespräch', leadName: 'Markus Hofmann', datum: '2026-09-24T14:30:00', dauerMinuten: 45, format: 'Video' })
  termine.push({ id: uid('termin'), typ: 'Beratungsgespräch', leadName: 'Nicole Werner', datum: '2026-10-02T11:00:00', dauerMinuten: 45, format: 'Vor Ort' })
  termine.push({ id: uid('termin'), typ: 'Erstgespräch', leadName: 'Jan Lehmann', datum: '2026-10-06T09:30:00', dauerMinuten: 30, format: 'Video' })
  return termine
}

export function buildNachrichten(): Nachricht[] {
  const themen = [
    { betreff: 'Rückfrage zu Ihrem Tarifvergleich', vorschau: 'Vielen Dank für das Angebot, ich hätte noch eine Frage zu...' },
    { betreff: 'Unterlagen für den Tarifwechsel', vorschau: 'Anbei sende ich Ihnen die unterschriebenen Unterlagen...' },
    { betreff: 'Terminbestätigung Beratungsgespräch', vorschau: 'Hiermit bestätige ich unseren Termin am kommenden...' },
    { betreff: 'Frage zur Beitragsanpassung', vorschau: 'Meine Krankenkasse hat den Beitrag erneut erhöht, können wir...' },
    { betreff: 'Antrag §204 VVG eingereicht', vorschau: 'Der Antrag wurde heute bei der Gesellschaft eingereicht...' },
    { betreff: 'Weiterempfehlung eines Bekannten', vorschau: 'Ein Kollege von mir hat ebenfalls Interesse an einer...' },
    { betreff: 'Kündigungsbestätigung Altvertrag', vorschau: 'Die Kündigung des bisherigen Tarifs wurde bestätigt...' },
    { betreff: 'Neue Gesundheitsfragen erforderlich', vorschau: 'Für den Tarifwechsel benötigen wir noch ergänzende...' },
  ]
  return themen.map((t, i) => {
    const { name, email } = buildName()
    return {
      id: uid('msg'),
      absender: name,
      email,
      betreff: t.betreff,
      vorschau: t.vorschau,
      inhalt: `${t.vorschau} Bitte melden Sie sich bei Rückfragen jederzeit. Beste Grüße, ${name}`,
      datum: isoDaysAgo(i, randInt(8, 17), randInt(0, 59)),
      gelesen: i > 2,
      ordner: 'posteingang',
    }
  })
}

export function buildAuszahlungen(): Auszahlung[] {
  return [
    { id: uid('pay'), datum: isoDaysAgo(3), betrag: 1240, status: 'ausgezahlt' },
    { id: uid('pay'), datum: isoDaysAgo(17), betrag: 980, status: 'ausgezahlt' },
    { id: uid('pay'), datum: isoDaysAgo(31), betrag: 1560, status: 'ausgezahlt' },
    { id: uid('pay'), datum: isoDaysAgo(45), betrag: 720, status: 'ausgezahlt' },
    { id: uid('pay'), datum: isoDaysAgo(60), betrag: 1105, status: 'ausgezahlt' },
  ]
}

export function buildUmsatzverlauf(): UmsatzPunkt[] {
  const monate = ['April', 'Mai', 'Juni', 'Juli', 'August', 'September']
  return monate.map((monat, i) => ({
    monat,
    umsatz: 4200 + i * 620 + randInt(-300, 400),
    provision: 950 + i * 140 + randInt(-80, 120),
  }))
}

export function buildSalesProvision(): SalesProvisionZeile[] {
  return [
    { id: uid('sp'), produkt: 'PKV Tarifoptimierung §204', abschlussart: 'Bestandskunde', satzProzent: 15, hinweis: 'Auf jährliche Beitragsersparnis' },
    { id: uid('sp'), produkt: 'PKV Tarifoptimierung §204', abschlussart: 'Neukunde', satzProzent: 20, hinweis: 'Auf jährliche Beitragsersparnis' },
    { id: uid('sp'), produkt: 'Zusatztarif Zahn', abschlussart: 'Cross-Selling', satzProzent: 10, hinweis: 'Einmalig bei Abschluss' },
    { id: uid('sp'), produkt: 'Krankentagegeld-Optimierung', abschlussart: 'Neu- & Bestandskunde', satzProzent: 12, hinweis: 'Auf jährliche Beitragsersparnis' },
    { id: uid('sp'), produkt: 'Pflegezusatzversicherung', abschlussart: 'Cross-Selling', satzProzent: 8, hinweis: 'Einmalig bei Abschluss' },
  ]
}

export function buildTeamProvision(): TeamProvisionZeile[] {
  return [
    { id: uid('tp'), stufe: 'Starter', bedingung: '0 – 5 geworbene Teammitglieder', satzProzent: 3 },
    { id: uid('tp'), stufe: 'Bronze', bedingung: '6 – 10 geworbene Teammitglieder', satzProzent: 5 },
    { id: uid('tp'), stufe: 'Silber', bedingung: 'Team-Umsatz ab 15.000 €/Monat', satzProzent: 7 },
    { id: uid('tp'), stufe: 'Gold', bedingung: 'Team-Umsatz ab 30.000 €/Monat', satzProzent: 10 },
    { id: uid('tp'), stufe: 'Platin', bedingung: 'Team-Umsatz ab 50.000 €/Monat', satzProzent: 13 },
  ]
}

export function buildBenachrichtigungen(): Benachrichtigung[] {
  return [
    { id: uid('n'), text: 'Neuer Lead „Sabine Krüger“ wurde zugewiesen', datum: isoDaysAgo(0, 8, 12), gelesen: false },
    { id: uid('n'), text: 'Termin mit Markus Hofmann in 30 Minuten', datum: isoDaysAgo(0, 9, 0), gelesen: false },
    { id: uid('n'), text: 'Auszahlung über 1.240 € wurde veranlasst', datum: isoDaysAgo(3), gelesen: true },
    { id: uid('n'), text: 'Wiedervorlage „Jan Lehmann“ ist überfällig', datum: isoDaysAgo(1), gelesen: false },
    { id: uid('n'), text: 'Neue Nachricht im Postfach erhalten', datum: isoDaysAgo(0, 7, 45), gelesen: true },
  ]
}

export function buildTeammitglieder(): Teammitglied[] {
  return [
    { id: uid('team'), name: 'Carsten Kessler', rolle: 'Teamleiter', darfKalenderSehen: true },
    { id: uid('team'), name: 'Julia Fischer', rolle: 'Vertriebspartnerin', darfKalenderSehen: true },
    { id: uid('team'), name: 'Andreas Wolf', rolle: 'Vertriebspartner', darfKalenderSehen: false },
    { id: uid('team'), name: 'Sandra Becker', rolle: 'Teamassistenz', darfKalenderSehen: true },
    { id: uid('team'), name: 'Frank Zimmermann', rolle: 'Vertriebspartner', darfKalenderSehen: false },
  ]
}

export function buildOnboardingVideos(): OnboardingVideo[] {
  return [
    { id: uid('vid'), titel: 'Erste Schritte im CRM', dauer: '6:12', kategorie: 'Einstieg' },
    { id: uid('vid'), titel: 'Leads richtig erfassen und qualifizieren', dauer: '9:45', kategorie: 'Leads' },
    { id: uid('vid'), titel: 'Der Power Dialer in der Praxis', dauer: '7:30', kategorie: 'Leads' },
    { id: uid('vid'), titel: '§204 VVG Tarifoptimierung erklärt', dauer: '14:20', kategorie: 'Fachwissen' },
    { id: uid('vid'), titel: 'Kalender & Terminbuchung einrichten', dauer: '5:58', kategorie: 'Kalender' },
    { id: uid('vid'), titel: 'Provisionsmodell verstehen', dauer: '8:03', kategorie: 'Buchhaltung' },
    { id: uid('vid'), titel: 'Team-Provisionen & Aufbau erklärt', dauer: '10:15', kategorie: 'Team' },
  ]
}

export function buildProfil(): Profil {
  const tage = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
  const wochenplan: Profil['wochenplan'] = {}
  tage.forEach((tag) => {
    const aktiv = tag !== 'Samstag' && tag !== 'Sonntag'
    wochenplan[tag] = { aktiv, zeitfenster: aktiv ? [{ von: '09:00', bis: '17:00' }] : [] }
  })

  return {
    name: 'Carsten Kessler',
    telefon: '0171 2345678',
    email: 'carsten.kessler@pkv-optimierung.de',
    signaturHtml:
      '<p><strong>Carsten Kessler</strong><br/>PKV-Tarifoptimierung nach §204 VVG<br/><a href="mailto:carsten.kessler@pkv-optimierung.de">carsten.kessler@pkv-optimierung.de</a> · 0171 2345678</p>',
    signaturText: 'Carsten Kessler\nPKV-Tarifoptimierung nach §204 VVG\ncarsten.kessler@pkv-optimierung.de · 0171 2345678',
    buchungslink: 'https://buchung.pkv-optimierung.de/carsten-kessler',
    wochenplan,
    blockzeiten: [
      { id: uid('block'), titel: 'Sommerurlaub', von: '2026-09-28', bis: '2026-10-02' },
      { id: uid('block'), titel: 'Mittagspause', von: '2026-09-18', bis: '2026-09-18' },
    ],
  }
}

export const NEWS_TICKER: string[] = [
  'Teambesprechung am Donnerstag um 10 Uhr im großen Meetingraum.',
  'Neue Provisionsstaffel für Q4 2026 ab sofort gültig.',
  'Schulung „§204 Tarifoptimierung Update“ am 30.09.2026.',
  'Bitte Wiedervorlagen diese Woche konsequent nachverfolgen – Ziel: 0 überfällige Fälle.',
]

export const STAEDTE_LISTE = STAEDTE
