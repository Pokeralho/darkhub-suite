/**
 * Optimizer search and goal grouping (pure, unit-tested in tests/optimizerTweakSearch.test.ts).
 *
 * The tab used to filter by exact substring: "memoria" did not find "Memória", "desativar telemetria" found nothing
 * unless the words were adjacent, and "fps" or "jogo" found only items with those exact letters. Now:
 * - accents and case are ignored, every word must match somewhere (title, description, goal, id);
 * - common words map to goals (fps/jogo -> games, internet/ping -> network, spy/telemetry -> privacy...).
 */

export type GoalId = 'games' | 'performance' | 'privacy' | 'network' | 'visual' | 'cleanup' | 'system';

export const GOAL_ORDER: GoalId[] = ['games', 'performance', 'privacy', 'network', 'visual', 'cleanup', 'system'];

/** Backend category -> user goal. */
export function goalOf(category: string): GoalId {
  switch (String(category || '').toLowerCase()) {
    case 'gaming': return 'games';
    case 'power':
    case 'memory':
    case 'performance': return 'performance';
    case 'privacy': return 'privacy';
    case 'network': return 'network';
    case 'customization':
    case 'visual':
    case 'ui': return 'visual';
    case 'storage':
    case 'cleanup': return 'cleanup';
    default: return 'system';
  }
}

export function normalizeText(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.+]+/g, ' ')
    .trim();
}

/** Words people type -> goal (pt-BR and en-US). */
const GOAL_WORDS: Record<GoalId, string[]> = {
  games: ['jogo', 'jogos', 'game', 'games', 'gaming', 'gamer', 'fps', 'input lag', 'stutter', 'travada', 'travadas', 'engasgo'],
  performance: ['desempenho', 'performance', 'rapido', 'lento', 'lentidao', 'velocidade', 'speed', 'fast', 'cpu', 'ram', 'memoria', 'memory', 'energia', 'power', 'bateria', 'battery'],
  privacy: ['privacidade', 'privacy', 'telemetria', 'telemetry', 'rastreamento', 'tracking', 'espionagem', 'spy', 'anuncio', 'anuncios', 'ads', 'copilot', 'recall', 'ia', 'ai', 'cortana'],
  network: ['rede', 'network', 'internet', 'ping', 'latencia', 'latency', 'wifi', 'wi-fi', 'dns', 'conexao', 'connection', 'download'],
  visual: ['visual', 'aparencia', 'appearance', 'menu', 'barra', 'taskbar', 'explorer', 'explorador', 'tema', 'theme', 'animacao', 'animacoes', 'animation', 'transparencia'],
  cleanup: ['limpeza', 'limpar', 'clean', 'cleanup', 'disco', 'disk', 'espaco', 'space', 'temp', 'temporarios', 'lixo', 'junk', 'cache'],
  system: ['sistema', 'system', 'servico', 'servicos', 'service', 'services', 'seguranca', 'security', 'windows update', 'update', 'defender'],
};

export interface SearchableItem {
  title: string;
  description: string;
  category: string;
  altText?: string;
}

/** Goals a query word points to (empty when the word is not a goal word). */
export function goalsForWord(word: string): GoalId[] {
  const w = normalizeText(word);
  if (!w) return [];
  return GOAL_ORDER.filter((g) => GOAL_WORDS[g].some((k) => k === w || (w.length >= 4 && k.startsWith(w))));
}

/** Words that name a whole goal (always expand to it); other goal words only expand when nothing matches by text. */
const GOAL_NAMES = new Set(['jogo', 'jogos', 'game', 'games', 'gaming', 'desempenho', 'performance', 'privacidade', 'privacy',
  'rede', 'network', 'visual', 'aparencia', 'appearance', 'limpeza', 'cleanup', 'sistema', 'system']);

/**
 * True when every word of the query is found in the item text (`goalLabel` = translated goal name shown on screen)
 * or names the item's goal.
 */
export function matchesQuery(item: SearchableItem, query: string, goalLabel = '', expandAll = false): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const goal = goalOf(item.category);
  const hay = normalizeText(`${item.title} ${item.description} ${item.altText ?? ''} ${goalLabel}`);
  return q.split(' ').every((w) => hay.includes(w) || ((expandAll || GOAL_NAMES.has(w)) && goalsForWord(w).includes(goal)));
}

/**
 * Filters a list: text matches first; a specific word ("fps", "telemetria") falls back to its goal only when no
 * item mentions it, so "telemetria" shows the telemetry tweaks and not the whole privacy group.
 */
export function searchItems<T extends SearchableItem>(items: T[], query: string, label: (it: T) => string = () => ''): T[] {
  const strict = items.filter((it) => matchesQuery(it, query, label(it)));
  if (strict.length || !normalizeText(query)) return strict;
  return items.filter((it) => matchesQuery(it, query, label(it), true));
}

/** Relevance for ordering search results: title hits first. */
export function scoreItem(item: SearchableItem, query: string): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const title = normalizeText(item.title);
  let s = 0;
  for (const w of q.split(' ')) {
    if (title.startsWith(w)) s += 4;
    else if (title.includes(w)) s += 3;
    else if (normalizeText(item.description).includes(w)) s += 1;
  }
  return s;
}
