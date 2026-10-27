// Overlay editor strings. The screen's pt-BR texts are inline defaults; pt-BR here covers the names that come from the
// main process (metrics, series, templates). Merged into `messages` (see messages.ts).
const METRIC_PT: Record<string, string> = {
  fps: 'FPS', frametime: 'Tempo de quadro', low1: '1% low', low01: '0.1% low', maxFrame: 'Maior quadro', latency: 'Latência', gpuBusy: 'GPU ocupada',
  bound: 'Limitado por', presentMode: 'Modo de apresentação',
  'gpu.load': 'Uso da GPU', 'gpu.temp': 'Temp. da GPU', 'gpu.hotspot': 'Hotspot da GPU', 'gpu.memJunction': 'Junção da VRAM', 'gpu.clock': 'Clock da GPU',
  'gpu.memClock': 'Clock da memória', 'gpu.power': 'Consumo da GPU', 'gpu.powerPct': '% do TDP da GPU', 'gpu.voltage': 'Voltagem da GPU',
  'gpu.fanRpm': 'Ventoinha da GPU', 'gpu.fanPct': 'Ventoinha da GPU %', 'gpu.vram': 'VRAM usada', 'gpu.vramTotal': 'VRAM total',
  'gpu.memCtrl': 'Controlador de memória', 'gpu.name': 'Nome da GPU',
  'cpu.load': 'Uso da CPU', 'cpu.temp': 'Temp. da CPU', 'cpu.clock': 'Clock da CPU', 'cpu.clockMax': 'Maior clock de núcleo', 'cpu.power': 'Consumo da CPU',
  'cpu.vcore': 'Vcore', 'cpu.loadMax': 'Thread mais usada', 'cpu.name': 'Nome da CPU',
  'ram.used': 'RAM usada', 'ram.total': 'RAM total', 'ram.load': 'RAM %',
  'session.time': 'Tempo de sessão', 'session.avgFps': 'FPS médio', 'session.minFps': 'FPS mínimo', 'session.maxFps': 'FPS máximo',
  'session.low1': '1% da sessão', 'session.low01': '0.1% da sessão', 'session.worst': 'Pior quadro', 'session.stdDev': 'Variação (σ)',
  'session.stutters': 'Engasgos', 'session.frames': 'Quadros', clock: 'Relógio'
};
const prefixed = (o: Record<string, string>, p: string) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`${p}${k}`, v]));

export const overlayEditorMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = {
  'pt-BR': {
    ...prefixed(METRIC_PT, 'ovle.m.'),
    'ovle.group.fps': 'FPS e quadros', 'ovle.group.gpu': 'GPU', 'ovle.group.cpu': 'CPU', 'ovle.group.ram': 'RAM', 'ovle.group.session': 'Sessão', 'ovle.group.other': 'Outros',
    'ovle.s.frametime': 'Tempo de quadro', 'ovle.s.fps': 'FPS', 'ovle.s.gpu.load': 'Uso da GPU', 'ovle.s.cpu.load': 'Uso da CPU', 'ovle.s.gpu.temp': 'Temp. da GPU', 'ovle.s.cpu.temp': 'Temp. da CPU',
    'ovle.bg.dark': 'Jogo escuro', 'ovle.bg.bright': 'Jogo claro', 'ovle.bg.forest': 'Jogo colorido', 'ovle.bg.checker': 'Xadrez (transparência)',
    'ovle.preset.rivatuner': 'RivaTuner clássico', 'ovle.preset.overclocker': 'Overclocker', 'ovle.preset.topbar': 'Barra superior', 'ovle.preset.minimal': 'Só FPS', 'ovle.preset.neon': 'Neon', 'ovle.preset.compact': 'Compacto'
  },
  'en-US': {
    'ovle.m.fps': 'FPS', 'ovle.m.frametime': 'Frame time', 'ovle.m.low1': '1% low', 'ovle.m.low01': '0.1% low', 'ovle.m.maxFrame': 'Longest frame', 'ovle.m.latency': 'Latency',
    'ovle.m.gpuBusy': 'GPU busy', 'ovle.m.bound': 'Limited by', 'ovle.m.presentMode': 'Present mode', 'ovle.m.clock': 'Clock',
    'ovle.group.fps': 'FPS & frames', 'ovle.group.gpu': 'GPU', 'ovle.group.cpu': 'CPU', 'ovle.group.ram': 'RAM', 'ovle.group.session': 'Session', 'ovle.group.other': 'Other',
    'ovle.s.frametime': 'Frame time', 'ovle.s.fps': 'FPS', 'ovle.s.gpu.load': 'GPU load', 'ovle.s.cpu.load': 'CPU load', 'ovle.s.gpu.temp': 'GPU temp', 'ovle.s.cpu.temp': 'CPU temp',
    'ovle.bg.dark': 'Dark game', 'ovle.bg.bright': 'Bright game', 'ovle.bg.forest': 'Colorful game', 'ovle.bg.checker': 'Checkerboard (transparency)',
    'ovle.preset.rivatuner': 'RivaTuner classic', 'ovle.preset.overclocker': 'Overclocker', 'ovle.preset.topbar': 'Top bar', 'ovle.preset.minimal': 'FPS only', 'ovle.preset.neon': 'Neon', 'ovle.preset.compact': 'Compact',
    'ovle.title': 'Overlay editor',
    'ovle.subtitle': 'Build the overlay your way: blocks, colors, fonts, graphs and free CSS. The preview uses real numbers while the overlay is on.',
    'ovle.back': 'Back to overlay', 'ovle.save': 'Save', 'ovle.use': 'Save and use in the overlay',
    'ovle.applied': 'Saved and in use in the overlay (Custom layout). Ctrl+Shift+F9 shows it in game.', 'ovle.saved': 'Layout saved.',
    'ovle.layouts': 'Layouts', 'ovle.inUse': 'in use', 'ovle.name': 'Name', 'ovle.unsaved': 'not saved',
    'ovle.new': 'New from template...', 'ovle.newAria': 'New from template', 'ovle.duplicate': 'Duplicate', 'ovle.copy': 'copy', 'ovle.export': 'Export', 'ovle.import': 'Import',
    'ovle.delete': 'Delete layout', 'ovle.confirmDelete': 'Delete this layout?', 'ovle.discard': 'Discard unsaved changes?',
    'ovle.exported': 'Layout code copied. Whoever pastes it in "Import" gets this overlay.', 'ovle.importHint': 'Paste the layout code (starts with dhovl1:) or the JSON.',
    'ovle.imported': 'Layout imported.', 'ovle.badCode': 'Invalid code.', 'ovle.cancel': 'Cancel',
    'ovle.blocks': 'Blocks', 'ovle.add': '+ Add block', 'ovle.addAria': 'Add block', 'ovle.up': 'Move up', 'ovle.down': 'Move down', 'ovle.hide': 'Hide', 'ovle.remove': 'Remove',
    'ovle.t.metrics': 'Metrics line', 'ovle.t.value': 'Big value', 'ovle.t.graph': 'Graph', 'ovle.t.bars': 'Per-thread bars', 'ovle.t.stats': 'Statistics',
    'ovle.t.text': 'Text', 'ovle.t.separator': 'Separator', 'ovle.t.spacer': 'Spacer',
    'ovle.live': 'Real data (overlay on)', 'ovle.sample': 'Sample data', 'ovle.mode.screen': 'On screen (drag to move)', 'ovle.mode.actual': 'Actual size',
    'ovle.stageHint': 'The preview stands for a 1920×1080 screen. Click a block on the left to edit it; drag the overlay in the preview to place it.',
    'ovle.tab.block': 'Block', 'ovle.tab.theme': 'Theme', 'ovle.tab.position': 'Position', 'ovle.pick': 'Pick a block in the list to edit it.',
    'ovle.cssId': 'In advanced CSS this block is', 'ovle.cssHelp': 'Free CSS, applied on top of everything. Available selectors (click to insert):',
    'ovle.cssSafe': 'The overlay loads nothing from the internet and runs no scripts: CSS only changes how it looks.',
    'ovle.style': 'Block style', 'ovle.color': 'Text color', 'ovle.background': 'Background', 'ovle.fontSize': 'Size', 'ovle.fontWeight': 'Weight', 'ovle.none': 'default',
    'ovle.align': 'Alignment', 'ovle.left': 'Left', 'ovle.center': 'Center', 'ovle.right': 'Right', 'ovle.padding': 'Padding', 'ovle.margin': 'Margin', 'ovle.radius': 'Corners',
    'ovle.border': 'Border', 'ovle.shadow': 'Text effect', 'ovle.shadow.soft': 'Shadow', 'ovle.shadow.outline': 'Outline', 'ovle.shadow.glow': 'Glow (neon)',
    'ovle.letterSpacing': 'Letter spacing', 'ovle.opacity': 'Opacity',
    'ovle.prefix': 'Prefix', 'ovle.unit': 'Unit', 'ovle.unitHint': 'Unit shown. A space hides the unit.', 'ovle.decimals': 'Decimal places', 'ovle.dec': 'decimals',
    'ovle.warn': 'Warning', 'ovle.warnHint': 'Value that turns the number yellow', 'ovle.bad': 'Critical',
    'ovle.badHint': 'Value that turns the number red (below the warning = the lower, the worse)', 'ovle.resetColor': 'Back to the theme color',
    'ovle.label': 'Label', 'ovle.labelColor': 'Label color', 'ovle.addValue': 'Add value', 'ovle.gtitle': 'Title', 'ovle.addSeries': 'Add line',
    'ovle.height': 'Height', 'ovle.width': 'Width', 'ovle.widthHint': '0 = follows the overlay width', 'ovle.lineWidth': 'Thickness',
    'ovle.fill': 'Fill', 'ovle.info': 'Min–max', 'ovle.grid': 'Grid', 'ovle.barColor': 'Color', 'ovle.barWarn': 'Above 80%', 'ovle.barBad': 'Above 95%',
    'ovle.columns': 'Columns', 'ovle.text': 'Text',
    'ovle.font': 'Font', 'ovle.unitColor': 'Unit color', 'ovle.good': 'Good color', 'ovle.warnColor': 'Warning color', 'ovle.badColor': 'Critical color',
    'ovle.bgOpacity': 'Background opacity', 'ovle.gap': 'Between blocks', 'ovle.direction': 'Arrangement', 'ovle.column': 'Vertical (list)', 'ovle.row': 'Horizontal (bar)',
    'ovle.textShadow': 'Text shadow (readable over bright games)',
    'ovle.anchor': 'Screen corner', 'ovle.offsetX': 'Offset X', 'ovle.offsetY': 'Offset Y', 'ovle.scale': 'Scale',
    'ovl.layout.custom': 'Custom', 'ovl.layout.customHelp': 'Your own layout, built in the editor: blocks, colors, fonts, graphs and free CSS.', 'ovl.openEditor': 'Open the overlay editor'
  }
};
