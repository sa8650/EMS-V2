/**
 * Detects the writing mode of the user's latest Zudo message so the model
 * cannot drift into the language of earlier turns (unchanged from 4.x).
 */

export type ZudoLang = 'bangla' | 'hindi' | 'arabic' | 'banglish' | 'english';

const BANGLISH = new Set(['ami', 'amr', 'amar', 'amake', 'amakey', 'amader', 'apni', 'apnar', 'apnake', 'tumi', 'tomar', 'tomake', 'tui', 'tor', 'kothay', 'kotha', 'koto', 'kivabe', 'keno', 'kichu', 'kichute', 'kono', 'kon', 'ache', 'achhe', 'achen', 'achilo', 'nai', 'nei', 'thakbe', 'thake', 'thakto', 'hobe', 'hobena', 'hoy', 'hoye', 'hoeche', 'hoyche', 'hoyese', 'geche', 'giye', 'gelo', 'gulo', 'gula', 'korbo', 'korbona', 'koro', 'korben', 'korte', 'korchen', 'kori', 'korite', 'chai', 'chan', 'chao', 'chay', 'chaichi', 'dao', 'din', 'deoya', 'debe', 'deben', 'dite', 'diyecho', 'diyechi', 'diyechilen', 'bolo', 'bolun', 'bolte', 'bujhi', 'bujhte', 'bujh', 'parba', 'parben', 'paro', 'parchi', 'ektu', 'ekta', 'ekhon', 'aaj', 'aj', 'kal', 'roja', 'bhalo', 'valo', 'khub', 'kom', 'komme', 'beshi', 'taka', 'dokan', 'bikri', 'kroy', 'baad', 'pao', 'pabe', 'paben', 'pawa', 'lagbe', 'lagto', 'darun', 'sob', 'soba', 'naki', 'tahole', 'tarpor', 'somossa', 'ossubidha', 'osubidha', 'vai', 'bhai', 'apu', 'salam', 'namaskar', 'doya', 'koruna', 'jan', 'janen', 'jano', 'vala', 'mot', 'kichui', 'tuku', 'gn']);

export function zudoLangMode(q: unknown): ZudoLang {
  const s = String(q || '');
  if (/[\u0980-\u09FF]/.test(s)) return 'bangla';
  if (/[\u0900-\u097F]/.test(s)) return 'hindi';
  if (/[\u0600-\u06FF]/.test(s)) return 'arabic';
  const words = s.toLowerCase().match(/[a-z']+/g) || [];
  return words.some((w) => BANGLISH.has(w)) ? 'banglish' : 'english';
}

export function zudoLangDirective(q: unknown): string {
  switch (zudoLangMode(q)) {
    case 'bangla':
      return '- The question above is in BENGALI (Bangla) script. Write your ENTIRE reply in natural, warm Bengali/Bangla script (অ আ ক খ). Do not use English sentences; common product/number words may stay as-is.';
    case 'banglish':
      return '- The question above is in BANGLISH (Bengali written in Roman/Latin letters, e.g. "amar koto sale hoyeche?"). Write your ENTIRE reply in the SAME Banglish style — warm, simple Bengali using Roman letters (e.g. "Apnar ajker sale hoyeche ৳..."). Do NOT use Bengali script and do NOT answer in English.';
    case 'hindi':
      return '- The question above is in Hindi (Devanagari script). Write your ENTIRE reply in the same Hindi language and script.';
    case 'arabic':
      return '- The question above is in Arabic script. Write your ENTIRE reply in the same language and script.';
    default:
      return '- The question above is in English. Write your ENTIRE reply ONLY in English, even if earlier messages in this conversation used Bangla or Banglish.';
  }
}
