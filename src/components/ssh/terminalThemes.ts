import type { ITheme } from '@xterm/xterm';

export interface TerminalTheme { id: string; name: string; theme: ITheme }

const base = { cursorAccent: '#0a0b0d', selectionBackground: '#3b82f655' };

export const TERMINAL_THEMES: TerminalTheme[] = [
  {
    id: 'darkhub-midnight', name: 'DarkHub Midnight',
    theme: { ...base, background: '#0a0b0d', foreground: '#d4d8de', cursor: '#9cc4ff', black: '#1b1e23', red: '#f47174', green: '#7fd6a4', yellow: '#e8c872', blue: '#7aa7ff', magenta: '#c49cff', cyan: '#78d3e6', white: '#d4d8de', brightBlack: '#5b616b', brightRed: '#ff8e90', brightGreen: '#9ae6bc', brightYellow: '#f4d98d', brightBlue: '#9cc4ff', brightMagenta: '#d7b8ff', brightCyan: '#9be4f2', brightWhite: '#f4f6f8' }
  },
  {
    id: 'frost-light', name: 'Frost Light',
    theme: { background: '#f5f7fa', foreground: '#1f2933', cursor: '#2563eb', cursorAccent: '#f5f7fa', selectionBackground: '#2563eb33', black: '#1f2933', red: '#c2302c', green: '#22863a', yellow: '#a46a00', blue: '#2563eb', magenta: '#8250df', cyan: '#0b7f8c', white: '#d0d7de', brightBlack: '#57606a', brightRed: '#e5534b', brightGreen: '#2da44e', brightYellow: '#bf8700', brightBlue: '#3b82f6', brightMagenta: '#a371f7', brightCyan: '#1b9aaa', brightWhite: '#ffffff' }
  },
  {
    id: 'solarized-dark', name: 'Solarized Dark',
    theme: { ...base, background: '#002b36', foreground: '#93a1a1', cursor: '#93a1a1', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5', brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#93a1a1', brightYellow: '#839496', brightBlue: '#657b83', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3' }
  },
  {
    id: 'matrix', name: 'Phosphor',
    theme: { ...base, background: '#050805', foreground: '#7ee787', cursor: '#7ee787', black: '#0d140d', red: '#ff7b72', green: '#7ee787', yellow: '#d2a8ff', blue: '#79c0ff', magenta: '#d2a8ff', cyan: '#a5d6ff', white: '#c9d1d9', brightBlack: '#3c5a3c', brightRed: '#ffa198', brightGreen: '#aff5b4', brightYellow: '#e2c5ff', brightBlue: '#a5d6ff', brightMagenta: '#e2c5ff', brightCyan: '#c6e6ff', brightWhite: '#f0f6fc' }
  }
];

export const themeById = (id?: string | null) => TERMINAL_THEMES.find((t) => t.id === id) ?? TERMINAL_THEMES[0];
