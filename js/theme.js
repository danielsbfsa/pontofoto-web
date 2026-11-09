// Aparência: as mesmas 18 cores e 5 estilos do Android (ui/theme/Theme.kt).
export const ACCENTS = [
  ['ORIGINAL', 'Violeta', '#9D92FF', '#6D5DF6', '#C6F36B'],
  ['ROSA', 'Rosa neon', '#FF4FB0', '#C2187A', '#7DF9FF'],
  ['AZUL', 'Azul neon', '#3CD7FF', '#0072B8', '#FF4FB0'],
  ['VERDE', 'Verde neon', '#4DFF91', '#00884A', '#FFE14D'],
  ['CINZA', 'Cinza neon', '#D0D6E2', '#4A5263', '#7DF9FF'],
  ['PRETO', 'Preto black', '#FFFFFF', '#111111', '#C6F36B'],
  ['LARANJA', 'Laranja neon', '#FF9A3C', '#C25400', '#3CD7FF'],
  ['AMARELO', 'Amarelo neon', '#FFE14D', '#8A6D00', '#FF4FB0'],
  ['VERMELHO', 'Vermelho neon', '#FF4D5E', '#B3122A', '#FFE14D'],
  ['ROXO', 'Roxo neon', '#C77DFF', '#7B2CBF', '#4DFF91'],
  ['MAGENTA', 'Magenta', '#FF3DF2', '#A0008F', '#3CD7FF'],
  ['TURQUESA', 'Turquesa', '#2EE6D6', '#00796B', '#FF9A3C'],
  ['OCEANO', 'Oceano', '#5AB0FF', '#1F4E9A', '#2EE6D6'],
  ['MENTA', 'Menta', '#8CF5C4', '#1E8A5F', '#FF7F6B'],
  ['CORAL', 'Coral', '#FF7F6B', '#C0392B', '#2EE6D6'],
  ['LILAS', 'Lilás', '#D4A5FF', '#8E44AD', '#FFD1E8'],
  ['DOURADO', 'Dourado', '#F5C451', '#8C6A12', '#FFFFFF'],
  ['CAFE', 'Café', '#D7A86E', '#6F4518', '#F5C451'],
].map(([id, label, neon, deep, second]) => ({ id, label, neon, deep, second }));

export const STYLES = [
  ['SUAVE', 'Suave', 'Cantos arredondados e degradê'],
  ['NEON', 'Neon', 'Bordas que brilham na cor escolhida'],
  ['MINIMO', 'Mínimo', 'Liso, cantos retos, sem degradê'],
  ['VIDRO', 'Vidro', 'Cartões transparentes sobre fundo colorido'],
  ['CONTRASTE', 'Contraste', 'Letras maiores e bordas fortes'],
].map(([id, label, hint]) => ({ id, label, hint }));

export const MODES = [['SISTEMA', 'Do sistema'], ['CLARO', 'Claro'], ['ESCURO', 'Escuro']];
export const FOCUS = [['RELOGIO', 'Hora exata'], ['BANCO', 'Banco de horas'], ['MENSAGEM', 'Minha mensagem'], ['LEMBRETES', 'Próximo lembrete'], ['BOTAO', 'Botão de bater ponto']];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (h, a) => `rgba(${hex(h).join(',')},${a})`;
const darken = (h, f) => '#' + hex(h).map((v) => Math.round(v * f).toString(16).padStart(2, '0')).join('');

export function accentOf(id) { return ACCENTS.find((a) => a.id === id) || ACCENTS[0]; }

/** Aplica as escolhas no <html> (variáveis CSS e data-style). */
export function applyAppearance(ap = {}) {
  const a = accentOf(ap.accent), style = ap.style || 'SUAVE', mode = ap.mode || 'SISTEMA';
  const dark = a.id === 'PRETO' || mode === 'ESCURO' || (mode === 'SISTEMA' && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement, v = {};
  const prim = dark ? a.neon : a.deep;
  Object.assign(v, dark ? {
    '--bg': a.id === 'PRETO' ? '#000000' : '#0D0E14', '--surface': a.id === 'PRETO' ? '#101010' : '#171923',
    '--surface-2': a.id === 'PRETO' ? '#171717' : '#1E202B', '--surface-3': a.id === 'PRETO' ? '#1F1F1F' : '#262936',
    '--text': '#ECEDF3', '--muted': '#9A9DB0', '--outline': '#272A37', '--entrada': '#5EE0A0', '--saida': '#FFC266', '--positive': '#5EE0A0', '--negative': '#FF7A85',
  } : {
    '--bg': '#F5F5FA', '--surface': '#FFFFFF', '--surface-2': '#F0F0F7', '--surface-3': '#E8E8F1',
    '--text': '#14151C', '--muted': '#61647A', '--outline': '#E3E3EC', '--entrada': '#13A86B', '--saida': '#E08A00', '--positive': '#13A86B', '--negative': '#D93848',
  });
  v['--primary'] = prim; v['--primary-soft'] = rgba(prim, dark ? 0.18 : 0.14); v['--on-primary'] = dark ? '#0A0A0A' : '#FFFFFF';
  if (a.id === 'ORIGINAL' && dark) v['--on-primary'] = '#15104A';
  v['--accent'] = a.second; v['--glow'] = a.neon; v['--glow-a'] = rgba(a.neon, 0.45);
  const solid = a.id === 'PRETO' ? '#111111' : a.deep;
  v['--brand-ink'] = a.id === 'PRETO' ? '#000000' : a.id === 'ORIGINAL' ? '#3A2CB5' : a.deep;
  v['--brand'] = a.id === 'PRETO' ? 'linear-gradient(135deg, #1C1C1C 0%, #000 100%)'
    : a.id === 'ORIGINAL' ? 'linear-gradient(135deg, #7B6CFF 0%, #3A2CB5 100%)' : `linear-gradient(135deg, ${a.deep} 0%, ${darken(a.deep, 0.55)} 100%)`;
  if (style === 'MINIMO') v['--brand'] = solid;
  if (style === 'CONTRASTE') { v['--brand'] = darken(solid, 0.8); v['--muted'] = dark ? '#D5D7E2' : '#2E3040'; v['--outline'] = dark ? '#8C90A6' : '#5A5D70'; }
  if (style === 'NEON') { v['--brand'] = 'linear-gradient(135deg, #14141C 0%, #07070B 100%)'; if (dark) { v['--bg'] = '#07070B'; v['--surface'] = '#0F1016'; } }
  if (style === 'VIDRO') {
    v['--bg'] = dark ? `linear-gradient(160deg, ${rgba(a.neon, 0.22)}, #0D0E14 60%)` : `linear-gradient(160deg, ${rgba(a.deep, 0.18)}, #F5F5FA 60%)`;
    v['--bg-solid'] = dark ? '#0D0E14' : '#F5F5FA';
    v['--surface'] = dark ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.62)';
    v['--surface-2'] = dark ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.8)';
  }
  for (const [k, val] of Object.entries(v)) root.style.setProperty(k, val);
  if (style !== 'VIDRO') root.style.setProperty('--bg-solid', v['--bg']);
  root.dataset.style = style.toLowerCase();
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0D0E14' : '#F5F5FA');
}
