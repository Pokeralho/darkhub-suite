import { describe, it, expect } from 'vitest';
import { goalOf, matchesQuery, normalizeText, scoreItem, goalsForWord, searchItems } from '../src/components/optimizer/tweakSearch';

const ram = { title: 'Liberar Memória RAM', description: 'Esvazia o working set de processos.', category: 'memory' };
const tele = { title: 'Desativar a telemetria do Windows', description: 'Reduz o envio de dados de diagnóstico.', category: 'privacy', altText: 'tweak:disableTelemetry' };
const mmcss = { title: 'Prioridade MMCSS para jogos', description: 'Agenda tarefas multimídia.', category: 'gaming' };
const menu = { title: 'Menu de contexto clássico', description: 'Volta o menu do Windows 10.', category: 'customization' };

describe('optimizer search', () => {
  it('ignores accents and case', () => {
    expect(normalizeText('Memória RAM')).toBe('memoria ram');
    expect(matchesQuery(ram, 'memoria')).toBe(true);
    expect(matchesQuery(ram, 'MEMÓRIA')).toBe(true);
  });

  it('matches every word anywhere, not only adjacent text', () => {
    expect(matchesQuery(tele, 'desativar telemetria')).toBe(true);
    expect(matchesQuery(tele, 'telemetria windows')).toBe(true);
    expect(matchesQuery(tele, 'telemetria xbox')).toBe(false);
  });

  it('goal words find items of that goal', () => {
    expect(matchesQuery(mmcss, 'jogos')).toBe(true);
    expect(matchesQuery(tele, 'privacidade')).toBe(true);
    expect(searchItems([tele, ram, menu], 'spy')).toEqual([tele]);
    expect(searchItems([mmcss, ram, menu], 'fps')).toEqual([mmcss]);
    expect(matchesQuery(menu, 'aparência')).toBe(true);
    expect(matchesQuery(ram, 'desempenho')).toBe(true);
    expect(matchesQuery(menu, 'fps')).toBe(false);
  });

  it('a specific word shows only the items that mention it, not the whole goal', () => {
    const ads = { title: 'Desativar anúncios', description: 'Remove sugestões.', category: 'privacy' };
    expect(searchItems([tele, ads, ram], 'telemetria')).toEqual([tele]);
    expect(searchItems([tele, ads, ram], 'privacidade')).toEqual([tele, ads]);
  });

  it('finds the backend id (search works in either language)', () => {
    expect(matchesQuery(tele, 'disableTelemetry')).toBe(true);
  });

  it('maps backend categories to goals', () => {
    expect(goalOf('gaming')).toBe('games');
    expect(goalOf('power')).toBe('performance');
    expect(goalOf('security')).toBe('system');
    expect(goalOf('storage')).toBe('cleanup');
    expect(goalsForWord('jog')).toEqual([]);
    expect(goalsForWord('jogos')).toEqual(['games']);
  });

  it('ranks title hits above description hits', () => {
    expect(scoreItem(mmcss, 'jogos')).toBeGreaterThan(scoreItem({ ...ram, description: 'bom para jogos' }, 'jogos'));
  });
});
