// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, scene summaries,
// messages of the Configuration screen. Vocabulary of the Gladys interface
// (appareil / Gerät / dispositivo, scène / Szene / escena) and of Discogs
// (collection / Sammlung / colección, wantlist kept as Discogs names it in
// each language). Titles, artists, labels and folders stay as Discogs writes
// them.
//
// A key with an `_one` twin uses it when `count` is 1.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  accountDeviceName: {
    en: 'Discogs ({username})',
    fr: 'Discogs ({username})',
    de: 'Discogs ({username})',
    es: 'Discogs ({username})',
  },
  folderDeviceName: {
    en: '{folder} (Discogs)',
    fr: '{folder} (Discogs)',
    de: '{folder} (Discogs)',
    es: '{folder} (Discogs)',
  },
  featureCollection: {
    en: 'Records in the collection',
    fr: 'Disques dans la collection',
    de: 'Tonträger in der Sammlung',
    es: 'Discos en la colección',
  },
  featureWantlist: {
    en: 'Records in the wantlist',
    fr: 'Disques dans la wantlist',
    de: 'Tonträger auf der Wantlist',
    es: 'Discos en la lista de deseos',
  },
  featureForSale: {
    en: 'Records for sale',
    fr: 'Disques en vente',
    de: 'Tonträger im Verkauf',
    es: 'Discos en venta',
  },
  featureValueMin: {
    en: 'Collection value (minimum)',
    fr: 'Valeur de la collection (minimum)',
    de: 'Wert der Sammlung (Minimum)',
    es: 'Valor de la colección (mínimo)',
  },
  featureValueMedian: {
    en: 'Collection value (median)',
    fr: 'Valeur de la collection (médiane)',
    de: 'Wert der Sammlung (Median)',
    es: 'Valor de la colección (mediana)',
  },
  featureValueMax: {
    en: 'Collection value (maximum)',
    fr: 'Valeur de la collection (maximum)',
    de: 'Wert der Sammlung (Maximum)',
    es: 'Valor de la colección (máximo)',
  },
  featureLastAdded: {
    en: 'Last record added',
    fr: 'Dernier disque ajouté',
    de: 'Zuletzt hinzugefügter Tonträger',
    es: 'Último disco añadido',
  },
  featureFolderCount: {
    en: 'Records in the folder',
    fr: 'Disques dans le dossier',
    de: 'Tonträger im Ordner',
    es: 'Discos en la carpeta',
  },

  // scene summaries
  summaryRandom: {
    en: 'Tonight: {release}.',
    fr: 'Ce soir : {release}.',
    de: 'Heute Abend: {release}.',
    es: 'Esta noche: {release}.',
  },
  summaryRandomNone: {
    en: 'The folder {folder} is empty.',
    fr: 'Le dossier {folder} est vide.',
    de: 'Der Ordner {folder} ist leer.',
    es: 'La carpeta {folder} está vacía.',
  },
  summaryBarcode: {
    en: 'Barcode {barcode}: {release}.',
    fr: 'Code-barres {barcode} : {release}.',
    de: 'Strichcode {barcode}: {release}.',
    es: 'Código de barras {barcode}: {release}.',
  },
  summaryBarcodeMany: {
    en: 'Barcode {barcode}: {release}, and {count} pressings in all.',
    fr: 'Code-barres {barcode} : {release}, et {count} pressages en tout.',
    de: 'Strichcode {barcode}: {release}, insgesamt {count} Pressungen.',
    es: 'Código de barras {barcode}: {release}, y {count} ediciones en total.',
  },
  summaryBarcodeNone: {
    en: 'No release of Discogs has the barcode {barcode}.',
    fr: 'Aucune édition de Discogs ne porte le code-barres {barcode}.',
    de: 'Keine Veröffentlichung auf Discogs hat den Strichcode {barcode}.',
    es: 'Ninguna edición de Discogs tiene el código de barras {barcode}.',
  },
  summaryAdded: {
    en: '{release} added to the collection ({folder}).',
    fr: '{release} ajouté à la collection ({folder}).',
    de: '{release} zur Sammlung hinzugefügt ({folder}).',
    es: '{release} añadido a la colección ({folder}).',
  },
  summaryOwned: {
    en: '{release} is already in the collection ({count} copies), nothing added.',
    fr: '{release} est déjà dans la collection ({count} exemplaires), rien n’a été ajouté.',
    de: '{release} ist schon in der Sammlung ({count} Exemplare), nichts hinzugefügt.',
    es: '{release} ya está en la colección ({count} copias), no se añadió nada.',
  },
  summaryOwned_one: {
    en: '{release} is already in the collection, nothing added.',
    fr: '{release} est déjà dans la collection, rien n’a été ajouté.',
    de: '{release} ist schon in der Sammlung, nichts hinzugefügt.',
    es: '{release} ya está en la colección, no se añadió nada.',
  },
  summaryWanted: {
    en: '{release} is in the wantlist.',
    fr: '{release} est dans la wantlist.',
    de: '{release} steht auf der Wantlist.',
    es: '{release} está en la lista de deseos.',
  },
  summaryUnwanted: {
    en: 'Release {id} removed from the wantlist.',
    fr: 'Édition {id} retirée de la wantlist.',
    de: 'Veröffentlichung {id} von der Wantlist entfernt.',
    es: 'Edición {id} quitada de la lista de deseos.',
  },
  summaryNotWanted: {
    en: 'Release {id} was not in the wantlist.',
    fr: 'L’édition {id} n’était pas dans la wantlist.',
    de: 'Veröffentlichung {id} stand nicht auf der Wantlist.',
    es: 'La edición {id} no estaba en la lista de deseos.',
  },
  summaryPrice: {
    en: '{release}: {count} copies for sale, from {price}.',
    fr: '{release} : {count} exemplaires en vente, à partir de {price}.',
    de: '{release}: {count} Exemplare im Verkauf, ab {price}.',
    es: '{release}: {count} copias en venta, desde {price}.',
  },
  summaryPrice_one: {
    en: '{release}: 1 copy for sale, at {price}.',
    fr: '{release} : 1 exemplaire en vente, à {price}.',
    de: '{release}: 1 Exemplar im Verkauf, für {price}.',
    es: '{release}: 1 copia en venta, a {price}.',
  },
  summaryPriceNone: {
    en: '{release}: no copy for sale on Discogs.',
    fr: '{release} : aucun exemplaire en vente sur Discogs.',
    de: '{release}: kein Exemplar im Verkauf auf Discogs.',
    es: '{release}: ninguna copia en venta en Discogs.',
  },
  summaryCollection: {
    en: '{count} records in the collection, {wants} in the wantlist. Value: {median} (from {min} to {max}).',
    fr: '{count} disques dans la collection, {wants} dans la wantlist. Valeur : {median} (de {min} à {max}).',
    de: '{count} Tonträger in der Sammlung, {wants} auf der Wantlist. Wert: {median} ({min} bis {max}).',
    es: '{count} discos en la colección, {wants} en la lista de deseos. Valor: {median} (de {min} a {max}).',
  },
  summaryCollectionNoValue: {
    en: '{count} records in the collection, {wants} in the wantlist.',
    fr: '{count} disques dans la collection, {wants} dans la wantlist.',
    de: '{count} Tonträger in der Sammlung, {wants} auf der Wantlist.',
    es: '{count} discos en la colección, {wants} en la lista de deseos.',
  },

  summaryCollection_one: {
    en: '1 record in the collection, {wants} in the wantlist. Value: {median} (from {min} to {max}).',
    fr: '1 disque dans la collection, {wants} dans la wantlist. Valeur : {median} (de {min} à {max}).',
    de: '1 Tonträger in der Sammlung, {wants} auf der Wantlist. Wert: {median} ({min} bis {max}).',
    es: '1 disco en la colección, {wants} en la lista de deseos. Valor: {median} (de {min} a {max}).',
  },
  summaryCollectionNoValue_one: {
    en: '1 record in the collection, {wants} in the wantlist.',
    fr: '1 disque dans la collection, {wants} dans la wantlist.',
    de: '1 Tonträger in der Sammlung, {wants} auf der Wantlist.',
    es: '1 disco en la colección, {wants} en la lista de deseos.',
  },

  // widgets
  credit: {
    en: 'Data provided by Discogs · {time}',
    fr: 'Données fournies par Discogs · {time}',
    de: 'Daten von Discogs · {time}',
    es: 'Datos proporcionados por Discogs · {time}',
  },
  discogs: { en: 'Discogs', fr: 'Discogs', de: 'Discogs', es: 'Discogs' },
  tileRecords: { en: 'Records', fr: 'Disques', de: 'Tonträger', es: 'Discos' },
  tileWantlist: { en: 'Wantlist', fr: 'Wantlist', de: 'Wantlist', es: 'Deseos' },
  tileValueMedian: {
    en: 'Median value',
    fr: 'Valeur médiane',
    de: 'Medianwert',
    es: 'Valor mediano',
  },
  tileValueMin: {
    en: 'Minimum value',
    fr: 'Valeur minimale',
    de: 'Mindestwert',
    es: 'Valor mínimo',
  },
  tileValueMax: {
    en: 'Maximum value',
    fr: 'Valeur maximale',
    de: 'Höchstwert',
    es: 'Valor máximo',
  },
  tileForSale: { en: 'For sale', fr: 'En vente', de: 'Im Verkauf', es: 'En venta' },
  recentHeading: {
    en: 'Last added',
    fr: 'Derniers ajouts',
    de: 'Zuletzt hinzugefügt',
    es: 'Últimos añadidos',
  },
  recentWantsHeading: {
    en: 'Wantlist',
    fr: 'Wantlist',
    de: 'Wantlist',
    es: 'Lista de deseos',
  },
  addedOn: {
    en: 'Added on {date}',
    fr: 'Ajouté le {date}',
    de: 'Hinzugefügt am {date}',
    es: 'Añadido el {date}',
  },
  openOnDiscogs: {
    en: 'Open on Discogs',
    fr: 'Voir sur Discogs',
    de: 'Auf Discogs öffnen',
    es: 'Ver en Discogs',
  },
  buttonAnother: { en: 'Another one', fr: 'Un autre', de: 'Noch einer', es: 'Otro' },
  buttonDraw: {
    en: 'Draw a record',
    fr: 'Tirer un disque',
    de: 'Tonträger ziehen',
    es: 'Sortear un disco',
  },
  coverAlt: {
    en: 'Cover of {release}',
    fr: 'Pochette de {release}',
    de: 'Cover von {release}',
    es: 'Portada de {release}',
  },
  widgetNoRecord: {
    en: 'The collection is empty.',
    fr: 'La collection est vide.',
    de: 'Die Sammlung ist leer.',
    es: 'La colección está vacía.',
  },
  widgetNoWant: {
    en: 'The wantlist is empty.',
    fr: 'La wantlist est vide.',
    de: 'Die Wantlist ist leer.',
    es: 'La lista de deseos está vacía.',
  },
  widgetEmptyFolder: {
    en: 'The folder {folder} is empty.',
    fr: 'Le dossier {folder} est vide.',
    de: 'Der Ordner {folder} ist leer.',
    es: 'La carpeta {folder} está vacía.',
  },
  toastDrawn: {
    en: 'Drawn: {release}',
    fr: 'Tiré au sort : {release}',
    de: 'Gezogen: {release}',
    es: 'Sorteado: {release}',
  },
  toastEmpty: {
    en: 'The folder {folder} is empty.',
    fr: 'Le dossier {folder} est vide.',
    de: 'Der Ordner {folder} ist leer.',
    es: 'La carpeta {folder} está vacía.',
  },

  // status and errors
  statusConnected: {
    en: 'Connected as {username}: {count} records, read every {minutes} min.',
    fr: 'Connecté en tant que {username} : {count} disques, lus toutes les {minutes} min.',
    de: 'Verbunden als {username}: {count} Tonträger, alle {minutes} Min. gelesen.',
    es: 'Conectado como {username}: {count} discos, leídos cada {minutes} min.',
  },
  statusNoToken: {
    en: 'Enter the personal access token of your Discogs account (Settings → Developers).',
    fr: 'Saisissez le jeton d’accès personnel de votre compte Discogs (Settings → Developers).',
    de: 'Gib das persönliche Zugriffstoken deines Discogs-Kontos ein (Settings → Developers).',
    es: 'Introduce el token de acceso personal de tu cuenta de Discogs (Settings → Developers).',
  },
  errorToken: {
    en: 'Discogs refused the token: generate a new one (Settings → Developers) and paste it again.',
    fr: 'Discogs a refusé le jeton : générez-en un nouveau (Settings → Developers) et recollez-le.',
    de: 'Discogs hat das Token abgelehnt: erzeuge ein neues (Settings → Developers) und füge es erneut ein.',
    es: 'Discogs rechazó el token: genera uno nuevo (Settings → Developers) y vuelve a pegarlo.',
  },
  errorQuota: {
    en: 'Too many requests to Discogs for now (60 per minute): next try in a minute.',
    fr: 'Trop de requêtes vers Discogs pour le moment (60 par minute) : nouvel essai dans une minute.',
    de: 'Gerade zu viele Anfragen an Discogs (60 pro Minute): neuer Versuch in einer Minute.',
    es: 'Demasiadas solicitudes a Discogs por ahora (60 por minuto): nuevo intento en un minuto.',
  },
  errorNotFound: {
    en: 'Discogs does not know this account or this release.',
    fr: 'Discogs ne connaît pas ce compte ou cette édition.',
    de: 'Discogs kennt dieses Konto oder diese Veröffentlichung nicht.',
    es: 'Discogs no conoce esta cuenta o esta edición.',
  },
  errorForbidden: {
    en: 'Discogs does not allow this token to read this account.',
    fr: 'Discogs n’autorise pas ce jeton à lire ce compte.',
    de: 'Discogs erlaubt diesem Token nicht, dieses Konto zu lesen.',
    es: 'Discogs no permite que este token lea esta cuenta.',
  },
  errorUnreachable: {
    en: 'Discogs cannot be reached ({detail}).',
    fr: 'Discogs est injoignable ({detail}).',
    de: 'Discogs ist nicht erreichbar ({detail}).',
    es: 'No se puede acceder a Discogs ({detail}).',
  },
  testOk: {
    en: 'Connected as {username}: {count} records in the collection, {wants} in the wantlist, {folders} folder(s). Last added: {last}. The devices are on the Discovery screen.',
    fr: 'Connecté en tant que {username} : {count} disques dans la collection, {wants} dans la wantlist, {folders} dossier(s). Dernier ajout : {last}. Les appareils sont dans l’écran de découverte.',
    de: 'Verbunden als {username}: {count} Tonträger in der Sammlung, {wants} auf der Wantlist, {folders} Ordner. Zuletzt hinzugefügt: {last}. Die Geräte stehen in der Geräteerkennung.',
    es: 'Conectado como {username}: {count} discos en la colección, {wants} en la lista de deseos, {folders} carpeta(s). Último añadido: {last}. Los dispositivos están en la pantalla de detección.',
  },
  diagnosticDone: {
    en: 'Diagnostic written in the logs of the integration ({count} line(s) "Discogs diagnostic").',
    fr: 'Diagnostic écrit dans les journaux de l’intégration ({count} ligne(s) « Discogs diagnostic »).',
    de: 'Diagnose in die Protokolle der Integration geschrieben ({count} Zeile(n) „Discogs diagnostic“).',
    es: 'Diagnóstico escrito en los registros de la integración ({count} línea(s) «Discogs diagnostic»).',
  },
};

/**
 * @description Whether a value is a supported language.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, its placeholders filled.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The placeholder values.
 * @returns {string} The text.
 * @example
 * t('tileRecords', 'fr'); // -> 'Disques'
 */
function t(key, language, values = {}) {
  const entry = (values.count === 1 && TEXTS[`${key}_one`]) || TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

export { LANGUAGES, TEXTS, isLanguage, t, all };
