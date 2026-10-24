/* ==========================================================================
   DarkHub "Frost" icon set: drawn for DarkHub, no third-party icon font or CDN.
   Grammar: 24px grid, 1.6 stroke, miter joins, round caps. Containers are chamfered tiles (45deg cuts, like
   facets of the snow crystal in the brand mark); the settings cog is a six-spoke crystal.
   Export names mirror the previous icon library so screens only change their import path.
   ========================================================================== */
import React from 'react';

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  strokeWidth?: number | string;
  title?: string;
}

type Node = string | ['c', number, number, number] | ['dot', string];

/** Chamfered rectangle: the "ice tile" used as every icon container. */
const cut = (x: number, y: number, w: number, h: number, c = 2) =>
  `M${x + c} ${y}H${x + w - c}L${x + w} ${y + c}V${y + h - c}L${x + w - c} ${y + h}H${x + c}L${x} ${y + h - c}V${y + c}Z`;
const TILE = cut(3, 3, 18, 18, 4.5);
const FILE = 'M14 3H6.5L5 4.5v15L6.5 21h11l1.5-1.5V8Z M14 3v5h5';
const CLOUD = 'M7.5 18H6a4 4 0 0 1-.4-7.98 6.5 6.5 0 0 1 12.6-1.3A4.6 4.6 0 0 1 17.5 18';

function Base({ size = 24, strokeWidth = 1.6, title, children, className, ...rest }: IconProps & { children: React.ReactNode }) {
  const labelled = Boolean(title || rest['aria-label']);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="miter"
      strokeMiterlimit={8}
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      focusable="false"
      className={className ? `dh-icon ${className}` : 'dh-icon'}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

function icon(name: string, nodes: Node[]) {
  const Icon = (props: IconProps) => {
    const sw = Number(props.strokeWidth ?? 1.6);
    return (
      <Base {...props}>
        {nodes.map((n, i) => {
          if (typeof n === 'string') return <path key={i} d={n} />;
          if (n[0] === 'c') return <circle key={i} cx={n[1]} cy={n[2]} r={n[3]} />;
          return <path key={i} d={n[1]} strokeWidth={sw * 1.45} />;
        })}
      </Base>
    );
  };
  Icon.displayName = name;
  return Icon;
}

// ---------------------------------------------------------------- status
export const Check = icon('Check', ['M5 12.5l4.5 4.5L19 7.5']);
export const CheckCircle2 = icon('CheckCircle2', [TILE, 'M8 12.2l2.8 2.8 5.4-5.6']);
export const CheckCircle = CheckCircle2;
export const CheckSquare = CheckCircle2;
export const CheckCheck = icon('CheckCheck', ['M2.5 12.5l4 4L15 8', 'M11 16l.5.5L20 8']);
export const X = icon('X', ['M6.5 6.5l11 11M17.5 6.5l-11 11']);
export const XCircle = icon('XCircle', [TILE, 'M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6']);
export const XSquare = XCircle;
export const AlertTriangle = icon('AlertTriangle', ['M10.7 4.3h2.6L21.5 19l-1.3 1.5H3.8L2.5 19Z', 'M12 9.5V14', ['dot', 'M12 17v.01']]);
export const AlertCircle = icon('AlertCircle', [TILE, 'M12 7.5V13', ['dot', 'M12 16.2v.01']]);
export const Info = icon('Info', [TILE, 'M12 11v5.5', ['dot', 'M12 7.8v.01']]);
export const HelpCircle = icon('HelpCircle', [TILE, 'M9.6 9.7a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1 .9-1 1.6v.3', ['dot', 'M12 16.6v.01']]);
export const Loader2 = icon('Loader2', ['M21 12a9 9 0 1 1-6.2-8.56']);

// ---------------------------------------------------------------- direction
export const ChevronRight = icon('ChevronRight', ['M9.5 6l6 6-6 6']);
export const ChevronLeft = icon('ChevronLeft', ['M14.5 6l-6 6 6 6']);
export const ChevronDown = icon('ChevronDown', ['M6 9.5l6 6 6-6']);
export const ChevronUp = icon('ChevronUp', ['M6 14.5l6-6 6 6']);
export const ArrowRight = icon('ArrowRight', ['M4 12h15', 'M13.5 6.5L19 12l-5.5 5.5']);
export const ArrowRightLeft = icon('ArrowRightLeft', ['M4 8h15.5', 'M16 4.5L19.5 8 16 11.5', 'M20 16H4.5', 'M8 12.5L4.5 16 8 19.5']);
export const ArrowDownUp = icon('ArrowDownUp', ['M7 4.5v15', 'M3.5 16L7 19.5 10.5 16', 'M17 19.5v-15', 'M13.5 8L17 4.5 20.5 8']);
export const ExternalLink = icon('ExternalLink', ['M14 4h6v6', 'M20 4l-8.5 8.5', 'M17.5 14v4.5L16 20H5.5L4 18.5V8l1.5-1.5H10']);
export const RefreshCw = icon('RefreshCw', ['M19.8 10.5A8 8 0 0 0 5.6 7.2L4 9', 'M4 4.5V9h4.5', 'M4.2 13.5a8 8 0 0 0 14.2 3.3L20 15', 'M20 19.5V15h-4.5']);
export const RotateCcw = icon('RotateCcw', ['M4 4.5V9h4.5', 'M4.6 9A8 8 0 1 1 4 13.5']);
export const Undo2 = icon('Undo2', ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11']);
export const Redo2 = icon('Redo2', ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13']);
export const History = icon('History', ['M3.6 12a8.5 8.5 0 1 0 2.5-6L3.6 8.5', 'M3.6 4v4.5h4.5', 'M12 7.5V12l3 2']);
export const Clock = icon('Clock', [['c', 12, 12, 9], 'M12 7v5l3.2 2']);
export const Route = icon('Route', [['c', 6, 18, 2], ['c', 18, 6, 2], 'M8 18h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16']);
export const Link = icon('Link', ['M10 14l4-4', 'M8.6 11.4l-2.1 2.1a3.5 3.5 0 0 0 5 5l2.1-2.1', 'M15.4 12.6l2.1-2.1a3.5 3.5 0 0 0-5-5l-2.1 2.1']);
export const Link2 = Link;
export const TrendingDown = icon('TrendingDown', ['M2.5 7l7 7 4-4 8 8', 'M15.5 18h6v-6']);

// ---------------------------------------------------------------- actions
export const Plus = icon('Plus', ['M12 5v14M5 12h14']);
export const Minus = icon('Minus', ['M5 12h14']);
export const Trash2 = icon('Trash2', ['M4 6.5h16', 'M9 6.5V4h6v2.5', 'M6 6.5L7 20h10l1-13.5', 'M10 10.5v6M14 10.5v6']);
export const Search = icon('Search', [['c', 10.5, 10.5, 6.5], 'M15.4 15.4l5.1 5.1']);
export const Copy = icon('Copy', [cut(8, 8, 12, 12, 2), 'M16 8V5.5L14.5 4H5.5L4 5.5v9L5.5 16H8']);
export const Save = icon('Save', ['M5.5 4H16l4 4v10.5L18.5 20h-13L4 18.5v-13Z', 'M8 4v4.5h7V4', 'M7.5 20v-6h9v6']);
export const Download = icon('Download', ['M12 4v11', 'M7 10.5l5 5 5-5', 'M4.5 20h15']);
export const DownloadCloud = icon('DownloadCloud', [CLOUD, 'M12 11v9', 'M9 17l3 3 3-3']);
export const Upload = icon('Upload', ['M12 16V5', 'M7 9.5l5-5 5 5', 'M4.5 20h15']);
export const UploadCloud = icon('UploadCloud', [CLOUD, 'M12 20v-9', 'M9 14l3-3 3 3']);
export const Filter = icon('Filter', ['M3.5 5h17l-6.5 7.5V19l-4 1.5v-8Z']);
export const Eraser = icon('Eraser', ['M4.5 15l9-9 6 6-7.5 7.5H8.5Z', 'M9.5 10l6 6', 'M13 19.5h7']);
export const Edit3 = icon('Edit3', ['M12 20h8', 'M15.5 4.5l4 4L9 19H5v-4Z']);
export const Clipboard = icon('Clipboard', ['M8.5 5h-2L5 6.5v12L6.5 20h11l1.5-1.5v-12L17.5 5h-2', cut(8.5, 3, 7, 4, 1)]);
export const MoreVertical = icon('MoreVertical', [['dot', 'M12 5v.01'], ['dot', 'M12 12v.01'], ['dot', 'M12 19v.01']]);
export const Play = icon('Play', ['M7 4.5v15L19.5 12Z']);
export const Pause = icon('Pause', ['M8.5 5v14M15.5 5v14']);
export const PlayCircle = icon('PlayCircle', [TILE, 'M10 8.5v7l5.5-3.5Z']);
export const PauseCircle = icon('PauseCircle', [TILE, 'M10 9v6M14 9v6']);
export const Square = icon('Square', [cut(5, 5, 14, 14, 2)]);
export const PlaySquare = icon('PlaySquare', [cut(3, 4, 18, 16, 3), 'M10 9v6l5-3Z']);
export const Power = icon('Power', ['M12 3v8.5', 'M7.2 6.2a8 8 0 1 0 9.6 0']);
export const Eye = icon('Eye', ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z', ['c', 12, 12, 3]]);
export const EyeOff = icon('EyeOff', ['M3.5 3.5l17 17', 'M10.4 6.6A9 9 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5a15 15 0 0 1-2.4 2.9', 'M6.7 7.7C4.1 9.4 2.5 12 2.5 12s3.5 6 9.5 6c1.7 0 3.2-.4 4.5-1.1', 'M9.9 9.9a3 3 0 0 0 4.2 4.2']);
export const Lock = icon('Lock', [cut(4.5, 10.5, 15, 10, 2), 'M8 10.5v-3a4 4 0 0 1 8 0v3', 'M12 14.5V17']);
export const Unlock = icon('Unlock', [cut(4.5, 10.5, 15, 10, 2), 'M8 10.5v-3a4 4 0 0 1 7.6-1.7', 'M12 14.5V17']);
export const Key = icon('Key', [['c', 7.5, 15.5, 4], 'M10.4 12.6L20 3', 'M16.5 6.5l3 3', 'M14 9l2 2']);
export const KeyRound = Key;
export const Settings = icon('Settings', [['c', 12, 12, 2.4], 'M12 3v5M12 16v5M4.2 7.5l4.3 2.5M15.5 14l4.3 2.5M4.2 16.5l4.3-2.5M15.5 10l4.3-2.5', 'M10.3 4.2L12 5.8l1.7-1.6M10.3 19.8l1.7-1.6 1.7 1.6']);
export const Sliders = icon('Sliders', ['M4 7h9M17 7h3M4 17h3M11 17h9', 'M15 4.5v5M9 14.5v5']);
export const SlidersHorizontal = Sliders;
export const Settings2 = Sliders;
export const Wrench = icon('Wrench', ['M4.5 19.5l8-8', 'M12.5 11.5A4.5 4.5 0 0 1 18 4.2l-2.5 2.5.3 1.8 1.8.3 2.5-2.5a4.5 4.5 0 0 1-7.6 5.2Z']);
export const Tag = icon('Tag', ['M4 4h7.5l8.5 8.5-7.5 7.5L4 11.5Z', ['dot', 'M8 8v.01']]);
export const Hash = icon('Hash', ['M5 9h15M4 15h15M10 4.5l-2 15M16 4.5l-2 15']);
export const List = icon('List', ['M9 6h11M9 12h11M9 18h11', ['dot', 'M4.5 6v.01'], ['dot', 'M4.5 12v.01'], ['dot', 'M4.5 18v.01']]);
export const LayoutGrid = icon('LayoutGrid', [cut(4, 4, 7, 7, 1.5), cut(13, 4, 7, 7, 1.5), cut(4, 13, 7, 7, 1.5), cut(13, 13, 7, 7, 1.5)]);
export const LayoutTemplate = icon('LayoutTemplate', [cut(4, 4, 16, 6, 1.5), cut(4, 13, 7, 7, 1.5), 'M14 13.5h6M14 17h6M14 20h4']);
export const Layers = icon('Layers', ['M12 3.5l8.5 4.5-8.5 4.5L3.5 8Z', 'M3.5 12l8.5 4.5 8.5-4.5', 'M3.5 16l8.5 4.5 8.5-4.5']);
export const Type = icon('Type', ['M5 7V5h14v2', 'M12 5v14', 'M9 19h6']);
export const Brackets = icon('Brackets', ['M8 4H5v16h3', 'M16 4h3v16h-3']);
export const Code = icon('Code', ['M8.5 7l-5 5 5 5', 'M15.5 7l5 5-5 5', 'M13.5 4.5l-3 15']);
export const Terminal = icon('Terminal', [cut(3, 4, 18, 16, 2.5), 'M7 9.5l3 2.5-3 2.5', 'M12.5 15H17']);

// ---------------------------------------------------------------- hardware & system
export const Cpu = icon('Cpu', [cut(6, 6, 12, 12, 2), cut(9.5, 9.5, 5, 5, 1), 'M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3']);
export const CpuIcon = Cpu;
export const MemoryStick = icon('MemoryStick', [cut(3, 6, 18, 10, 1.5), 'M7 9.5v3M10.5 9.5v3M14 9.5v3M17.5 9.5v3', 'M6 16v3M10 16v3M14 16v3M18 16v3']);
export const HardDrive = icon('HardDrive', [cut(3, 13, 18, 7, 2), 'M5.5 13L8 5h8l2.5 8', ['dot', 'M7 16.5v.01'], 'M11 16.5h6']);
// USB trident: trunk with a round end, a square branch and a circle branch
export const Usb = icon('Usb', ['M12 3v14', 'M9.5 5.5L12 3l2.5 2.5', 'M12 14l-4.5-3V8', 'M12 12l4.5-2.5V7', 'M15.5 5.5h2v2h-2z', ['c', 7.5, 7, 1.3], ['c', 12, 19, 2]]);
export const Server = icon('Server', [cut(3.5, 3.5, 17, 7, 1.5), cut(3.5, 13.5, 17, 7, 1.5), ['dot', 'M7 7v.01'], ['dot', 'M7 17v.01'], 'M11 7h6M11 17h6']);
export const Monitor = icon('Monitor', [cut(2.5, 4, 19, 12.5, 2), 'M8.5 20.5h7M12 16.5v4']);
export const MonitorCog = icon('MonitorCog', [cut(2.5, 4, 19, 12.5, 2), 'M8.5 20.5h7M12 16.5v4', ['c', 12, 10.2, 1.7], 'M12 6.6v1.2M12 12.6v1.2M8.6 10.2h1.2M14.2 10.2h1.2']);
export const Laptop = icon('Laptop', [cut(4.5, 5, 15, 10.5, 1.5), 'M2 19.5h20']);
export const AppWindow = icon('AppWindow', [cut(3, 4, 18, 16, 2.5), 'M3 9h18', ['dot', 'M6.5 6.5v.01'], ['dot', 'M9 6.5v.01']]);
export const Gauge = icon('Gauge', ['M4.2 17.5a9 9 0 1 1 15.6 0', 'M12 13.5l4-5', ['dot', 'M12 13.5v.01'], 'M12 5.5V7M6.3 8.3l1 1M17.7 8.3l-1 1']);
export const Thermometer = icon('Thermometer', ['M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0Z', 'M12 10v6']);
export const Fan = icon('Fan', [['c', 12, 12, 2], 'M12 10c-.5-3 .3-6 3.5-6.5 2-.3 3 1.2 2.3 2.8-.8 1.8-3.2 2.4-5.8 3.7', 'M13.7 13c2.8 1 4.9 3.3 3.7 6.3-.7 1.8-2.6 1.9-3.6.5-1.2-1.6-.6-4-.1-6.8', 'M10.3 13c-2.3 1.9-5.3 2.6-7.3.1-1.2-1.6-.4-3.3 1.4-3.5 2-.2 3.7 1.6 5.9 3.4']);
export const Activity = icon('Activity', ['M2.5 12h4l2.5-7 5 14 2.5-7h5']);
export const Zap = icon('Zap', ['M13 2.5L4.5 13.5H11l-1 8 9.5-11.5H13Z']);
export const Flame = icon('Flame', ['M12 21a6 6 0 0 0 6-6c0-4-3-5.5-3.5-9.5C12 7.5 11 9.5 11 11.5c-1-.5-2-2-2-3.5-2 1.5-3 4-3 7a6 6 0 0 0 6 6Z']);
export const Network = icon('Network', [cut(9, 3, 6, 5, 1), cut(3, 16, 6, 5, 1), cut(15, 16, 6, 5, 1), 'M12 8v4M6 16v-4h12v4']);
export const Wifi = icon('Wifi', ['M2.5 9a14 14 0 0 1 19 0', 'M5.5 12.5a9.5 9.5 0 0 1 13 0', 'M8.7 16a5 5 0 0 1 6.6 0', ['dot', 'M12 19.5v.01']]);
export const Globe = icon('Globe', [['c', 12, 12, 9], 'M3 12h18', 'M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z']);
export const Radio = icon('Radio', [['c', 12, 12, 2], 'M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2']);
export const Keyboard = icon('Keyboard', [cut(2.5, 6, 19, 12, 2), ['dot', 'M6.5 10v.01'], ['dot', 'M10 10v.01'], ['dot', 'M14 10v.01'], ['dot', 'M17.5 10v.01'], 'M8 14h8']);
export const MousePointer = icon('MousePointer', ['M5 4l5.5 16 2.3-6.7L19.5 11Z']);
export const MousePointerClick = icon('MousePointerClick', ['M9 9l4 11 1.8-5.2L20 13Z', 'M4 4l2 2M9 2.5V5M2.5 9H5M5.5 12.5L4 14']);
export const Crosshair = icon('Crosshair', [['c', 12, 12, 8], 'M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5']);
export const Target = icon('Target', [['c', 12, 12, 9], ['c', 12, 12, 5.2], ['dot', 'M12 12v.01']]);
export const Headphones = icon('Headphones', ['M4 18v-5a8 8 0 0 1 16 0v5', cut(3, 13.5, 4, 6.5, 1), cut(17, 13.5, 4, 6.5, 1)]);
export const Camera = icon('Camera', ['M3.5 8.5L5 7h3l1.5-2.5h5L16 7h3l1.5 1.5v10L19 20H5l-1.5-1.5Z', ['c', 12, 13, 3.5]]);
/** Region screenshot: four chamfered corner brackets around a crosshair. */
export const ScreenRegion = icon('ScreenRegion', ['M3.5 8V5l1.5-1.5h3', 'M16 3.5h3L20.5 5v3', 'M20.5 16v3L19 20.5h-3', 'M8 20.5H5L3.5 19v-3', 'M12 9v6', 'M9 12h6']);
export const Video = icon('Video', [cut(2.5, 6, 13, 12, 2), 'M15.5 10.5l6-3.5v10l-6-3.5']);
export const Film = icon('Film', [cut(3, 3, 18, 18, 2.5), 'M7.5 3v18M16.5 3v18M3 8h4.5M3 12h18M3 16h4.5M16.5 8H21M16.5 16H21']);
export const Music = icon('Music', ['M9 18V5.5l11-2v12', ['c', 6.5, 18, 2.5], ['c', 17.5, 15.5, 2.5]]);
export const ListMusic = icon('ListMusic', ['M4 6h11M4 10.5h11M4 15h7', 'M18 17.5V7l3-.8', ['c', 16, 17.5, 2]]);
export const Image = icon('Image', [cut(3, 4, 18, 16, 2.5), ['c', 8.5, 9.5, 1.5], 'M21 15.5l-5-5L5.5 20']);
export const FileImage = icon('FileImage', [FILE, ['c', 10, 12.5, 1.2], 'M19 16.5l-3-3-6.5 6.5']);
export const Rocket = icon('Rocket', ['M7.5 13.5l3 3c5.5-2.5 9-7 10-13-6 1-10.5 4.5-13 10Z', ['c', 15, 9, 1.5], 'M7.5 13.5H4L6.5 10h4M10.5 16.5V20l3.5-2.5v-4', 'M6.5 17.5L4 20']);
export const Gamepad2 = icon('Gamepad2', ['M7 7.5h10a4.5 4.5 0 0 1 4.4 5.4l-.9 4.4a2.3 2.3 0 0 1-4 1L14.5 16h-5l-2 2.3a2.3 2.3 0 0 1-4-1l-.9-4.4A4.5 4.5 0 0 1 7 7.5Z', 'M8 10.5v3M6.5 12h3', ['dot', 'M15.5 11.2v.01'], ['dot', 'M17.5 12.8v.01']]);

// ---------------------------------------------------------------- files
export const FileText = icon('FileText', [FILE, 'M8.5 13h7M8.5 16.5h7M8.5 9.5H11']);
export const FileCode = icon('FileCode', [FILE, 'M10 12.5l-2 2 2 2M14 12.5l2 2-2 2']);
export const FileDigit = icon('FileDigit', [FILE, cut(8, 12, 3.2, 5.5, 0.8), 'M14 13l1.2-1v5.5']);
export const FileArchive = icon('FileArchive', [FILE, 'M10 4v1.5M10 7.5V9M10 11v1.5', cut(8.5, 14.5, 3, 3.5, 0.6)]);
export const FileDiff = icon('FileDiff', [FILE, 'M12 10v5M9.5 12.5h5M9.5 17.5h5']);
export const FileSearch = icon('FileSearch', [FILE, ['c', 11.5, 14, 2.5], 'M13.3 15.8l2 2']);
export const FileOutput = icon('FileOutput', [FILE, 'M10 14.5h9', 'M16 11.5l3 3-3 3']);
export const Archive = icon('Archive', [cut(3, 4, 18, 5, 1), 'M4.5 9v9.5L6 20h12l1.5-1.5V9', 'M10 13h4']);
export const FolderOpen = icon('FolderOpen', ['M3.5 18.5v-13L5 4h4.5l2 2.5H17l1.5 1.5v2', 'M3.5 18.5L6.5 11h15l-3 8.5H4.5Z']);
export const FolderCheck = icon('FolderCheck', ['M3.5 6L5 4.5h4.5l2 2H19L20.5 8v10.5L19 20H5l-1.5-1.5Z', 'M9 13.5l2 2 4-4']);
export const Package = icon('Package', ['M12 2.8l8.5 4.6v9.2L12 21.2l-8.5-4.6V7.4Z', 'M3.5 7.4L12 12l8.5-4.6M12 12v9.2', 'M7.8 5.1l8.5 4.6']);
export const LibraryBig = icon('LibraryBig', [cut(3.5, 4, 4, 16, 1), cut(9.5, 4, 4, 16, 1), 'M15.5 5.8l3.6-1 3 14.2-3.6 1Z']);
export const ScanText = icon('ScanText', ['M3.5 8V5L5 3.5h3M16 3.5h3L20.5 5v3M20.5 16v3L19 20.5h-3M8 20.5H5L3.5 19v-3', 'M7.5 9h9M7.5 12h9M7.5 15H13']);
export const Calculator = icon('Calculator', [cut(5, 3, 14, 18, 2), cut(8, 6, 8, 3.5, 0.6), ['dot', 'M8.5 13v.01'], ['dot', 'M12 13v.01'], ['dot', 'M15.5 13v.01'], ['dot', 'M8.5 16.5v.01'], ['dot', 'M12 16.5v.01'], ['dot', 'M15.5 16.5v.01']]);

// ---------------------------------------------------------------- security & misc
const SHIELD = 'M12 2.8l7.5 2.8v6.1c0 4.6-3.1 8.1-7.5 9.5-4.4-1.4-7.5-4.9-7.5-9.5V5.6Z';
export const Shield = icon('Shield', [SHIELD]);
export const ShieldCheck = icon('ShieldCheck', [SHIELD, 'M8.8 12l2.2 2.2 4.4-4.4']);
export const ShieldAlert = icon('ShieldAlert', [SHIELD, 'M12 8v4.5', ['dot', 'M12 15.8v.01']]);
export const Fingerprint = icon('Fingerprint', ['M6.2 18.5A10 10 0 0 1 5 12.5a7 7 0 0 1 14 0v1', 'M9 20a12 12 0 0 1-1.5-7.5 4.5 4.5 0 0 1 9 0c0 2.5-.3 4.5-1 6.5', 'M12 12.5c0 3.5-.6 6-1.8 8.2', 'M18.6 17.5c.3-.9.4-1.8.4-2.8']);
export const Bug = icon('Bug', ['M8 9.5h8V15a4 4 0 0 1-8 0Z', 'M9.5 9.5V8a2.5 2.5 0 0 1 5 0v1.5', 'M4 12.5h4M16 12.5h4M4.5 18.5l3.6-2M19.5 18.5l-3.6-2M5 6.5l3 3M19 6.5l-3 3', 'M12 13v6']);
export const Cookie = icon('Cookie', ['M20.5 12A8.5 8.5 0 1 1 12 3.5a3 3 0 0 0 3.5 3.5 3 3 0 0 0 5 5Z', ['dot', 'M9 10v.01'], ['dot', 'M14.5 14.5v.01'], ['dot', 'M9.5 15.5v.01']]);
export const Scale = icon('Scale', ['M12 4v16M7.5 20h9M5 7h14', 'M5 7l-2.5 6a2.6 2.6 0 0 0 5 0Z', 'M19 7l-2.5 6a2.6 2.6 0 0 0 5 0Z']);
export const Home = icon('Home', ['M3.5 11L12 3.5l8.5 7.5', 'M5.5 9.5V20H10v-5.5h4V20h4.5V9.5']);
export const Users = icon('Users', [['c', 9, 8, 3.5], 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 4.8a3.5 3.5 0 0 1 0 6.4', 'M18.5 14a6.5 6.5 0 0 1 3 6']);
export const Sparkles = icon('Sparkles', ['M12 3.5l1.8 6.7 6.7 1.8-6.7 1.8-1.8 6.7-1.8-6.7L3.5 12l6.7-1.8Z', 'M19 3v3.5M17.25 4.75h3.5']);
export const LifeBuoy = icon('LifeBuoy', [['c', 12, 12, 9], ['c', 12, 12, 4], 'M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6']);

/** The brand mark as an inline glyph: a six-arm snow crystal. */
export const DarkHubMark = icon('DarkHubMark', ['M12 12L12.00 2.50 M12.00 5.80L13.81 3.79 M12.00 5.80L10.19 3.79 M12 12L3.77 7.25 M6.63 8.90L5.80 6.33 M6.63 8.90L3.99 9.46 M12 12L3.77 16.75 M6.63 15.10L3.99 14.54 M6.63 15.10L5.80 17.67 M12 12L12.00 21.50 M12.00 18.20L10.19 20.21 M12.00 18.20L13.81 20.21 M12 12L20.23 16.75 M17.37 15.10L18.20 17.67 M17.37 15.10L20.01 14.54 M12 12L20.23 7.25 M17.37 8.90L20.01 9.46 M17.37 8.90L18.20 6.33']);
