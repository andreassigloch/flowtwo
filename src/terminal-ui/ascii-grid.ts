/**
 * ASCII Grid Renderer
 *
 * 2D character grid for rendering boxes, lines, and labels.
 * Designed for reuse - layout computation is separate from rendering.
 *
 * @author andreas@siglochconsulting
 */

import { ONTOLOGY } from '../shared/types/ontology.js';

// Box drawing characters
const BOX = {
  TL: '┌', TR: '┐', BL: '└', BR: '┘',
  H: '─', V: '│',
  LT: '├', RT: '┤', TT: '┬', BT: '┴',
  CROSS: '┼',
  ARROW_R: '▶', ARROW_L: '◀', ARROW_D: '▼', ARROW_U: '▲',
};

/**
 * Position in 2D grid
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Box dimensions and position
 */
export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color?: string; // ANSI color code
}

/**
 * Edge between two boxes
 */
export interface Edge {
  sourceId: string;
  targetId: string;
  label?: string;
}

/**
 * Layout result (reusable for graphics UI)
 */
export interface LayoutResult {
  boxes: Box[];
  edges: Edge[];
  width: number;
  height: number;
}

/**
 * ASCII Grid Buffer
 *
 * Character grid with methods for drawing boxes and lines.
 */
export class AsciiGrid {
  private grid: string[][];
  private colors: (string | null)[][];
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = Array(height).fill(null).map(() => Array(width).fill(' '));
    this.colors = Array(height).fill(null).map(() => Array(width).fill(null));
  }

  /**
   * Set character at position
   */
  setChar(x: number, y: number, char: string, color?: string): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.grid[y][x] = char;
      if (color) {
        this.colors[y][x] = color;
      }
    }
  }

  /**
   * Get character at position
   */
  getChar(x: number, y: number): string {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return this.grid[y][x];
    }
    return ' ';
  }

  /**
   * Draw a box outline
   */
  drawBox(box: Box): void {
    const { x, y, width, height, label, color } = box;

    // Top border
    this.setChar(x, y, BOX.TL);
    for (let i = 1; i < width - 1; i++) {
      this.setChar(x + i, y, BOX.H);
    }
    this.setChar(x + width - 1, y, BOX.TR);

    // Side borders
    for (let j = 1; j < height - 1; j++) {
      this.setChar(x, y + j, BOX.V);
      this.setChar(x + width - 1, y + j, BOX.V);
    }

    // Bottom border
    this.setChar(x, y + height - 1, BOX.BL);
    for (let i = 1; i < width - 1; i++) {
      this.setChar(x + i, y + height - 1, BOX.H);
    }
    this.setChar(x + width - 1, y + height - 1, BOX.BR);

    // Label (centered in first row) - color applied to whole label
    const labelX = x + Math.floor((width - label.length) / 2);
    const labelY = y + 1;

    // Write label with color on each char
    for (let i = 0; i < label.length && labelX + i < x + width - 1; i++) {
      if (labelX + i > x) {
        this.grid[labelY][labelX + i] = label[i];
        if (color) {
          this.colors[labelY][labelX + i] = color;
        }
      }
    }
  }

  /**
   * Draw horizontal line
   */
  drawHLine(x1: number, x2: number, y: number): void {
    const start = Math.min(x1, x2);
    const end = Math.max(x1, x2);
    for (let x = start; x <= end; x++) {
      const existing = this.getChar(x, y);
      if (existing === BOX.V) {
        this.setChar(x, y, BOX.CROSS);
      } else if (existing === ' ') {
        this.setChar(x, y, BOX.H);
      }
    }
  }

  /**
   * Draw vertical line
   */
  drawVLine(x: number, y1: number, y2: number): void {
    const start = Math.min(y1, y2);
    const end = Math.max(y1, y2);
    for (let y = start; y <= end; y++) {
      const existing = this.getChar(x, y);
      if (existing === BOX.H) {
        this.setChar(x, y, BOX.CROSS);
      } else if (existing === ' ') {
        this.setChar(x, y, BOX.V);
      }
    }
  }

  /**
   * Draw orthogonal edge between two points with arrow
   */
  drawEdge(from: Position, to: Position, arrow: 'right' | 'down' | 'left' | 'up' = 'right'): void {
    // Simple case: same row - just draw horizontal line
    if (from.y === to.y) {
      for (let x = from.x; x < to.x - 1; x++) {
        this.setChar(x, from.y, BOX.H);
      }
      // Arrow at target
      this.setChar(to.x - 1, to.y, BOX.ARROW_R);
      return;
    }

    // Different rows: L-shaped routing
    const midX = Math.floor((from.x + to.x) / 2);

    // First segment: horizontal from source to midpoint
    this.drawHLine(from.x, midX, from.y);

    // Second segment: vertical from source Y to target Y
    this.drawVLine(midX, from.y, to.y);

    // Third segment: horizontal from midpoint to target
    this.drawHLine(midX, to.x - 1, to.y);

    // Draw corners
    if (from.x !== midX) {
      this.setChar(midX, from.y, from.y < to.y ? BOX.TR : BOX.BR);
    }
    if (to.x !== midX) {
      this.setChar(midX, to.y, from.y < to.y ? BOX.BL : BOX.TL);
    }

    // Arrow at target
    const arrowChar = {
      right: BOX.ARROW_R,
      left: BOX.ARROW_L,
      down: BOX.ARROW_D,
      up: BOX.ARROW_U,
    }[arrow];
    this.setChar(to.x - 1, to.y, arrowChar);
  }

  /**
   * Write text at position
   */
  writeText(x: number, y: number, text: string, color?: string): void {
    for (let i = 0; i < text.length; i++) {
      this.setChar(x + i, y, text[i], color);
    }
  }

  /**
   * Render grid to string array (one string per line)
   */
  render(): string[] {
    const lines: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let line = '';
      let inColor = false;

      for (let x = 0; x < this.width; x++) {
        const char = this.grid[y][x];
        const color = this.colors[y][x];

        if (color && !inColor) {
          // Start colored section
          line += color;
          inColor = true;
        } else if (!color && inColor) {
          // End colored section
          line += '\x1b[0m';
          inColor = false;
        }
        line += char;
      }

      // Reset at end of line if still in color
      if (inColor) {
        line += '\x1b[0m';
      }

      // Trim trailing spaces
      lines.push(line.trimEnd());
    }
    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines;
  }
}

/**
 * Compute layout for architecture boxes using TRUE GRID LAYOUT
 *
 * Grid cells are either:
 * - BOX cells: contain a box (odd columns, odd rows)
 * - ROUTING cells: for edge lines (even columns/rows between boxes)
 *
 * FLOW nodes are smaller (data flow indicators between functions).
 * This ensures boxes and lines NEVER overlap.
 */
export function computeArchitectureLayout(
  nodes: Array<{ id: string; name: string; type: string; parentId?: string }>,
  edges: Array<{ sourceId: string; targetId: string; label?: string }>,
  options: {
    boxWidth?: number;
    boxHeight?: number;
    flowWidth?: number;   // Smaller width for FLOW nodes
    hSpacing?: number;    // Width of horizontal routing channel
    vSpacing?: number;    // Height of vertical routing channel
    maxPerRow?: number;
  } = {}
): LayoutResult {
  const {
    boxWidth = 20,
    boxHeight = 3,
    flowWidth = 14,       // FLOW nodes are smaller
    hSpacing = 8,         // Routing channel width (enough for arrows + labels)
    vSpacing = 2,         // Routing channel height
    maxPerRow = 4,
  } = options;

  // Cell dimensions in the grid
  const cellWidth = boxWidth + hSpacing;   // Box + routing channel
  const cellHeight = boxHeight + vSpacing; // Box + routing channel

  // Filter to only root-level nodes (no parentId) for flat grid
  const flatNodes = nodes.filter(n => !n.parentId);

  const boxes: Box[] = [];

  // Place all nodes in a flat grid
  flatNodes.forEach((node, idx) => {
    const col = idx % maxPerRow;
    const row = Math.floor(idx / maxPerRow);

    // FLOW nodes are smaller and centered in cell
    const isFlow = node.type === 'FLOW';
    const nodeWidth = isFlow ? flowWidth : boxWidth;

    // Position: boxes start at routing channel offset
    // FLOW nodes are centered within the cell
    const xOffset = isFlow ? Math.floor((boxWidth - flowWidth) / 2) : 0;
    const x = col * cellWidth + xOffset;
    const y = row * cellHeight;

    boxes.push({
      id: node.id,
      x,
      y,
      width: nodeWidth,
      height: boxHeight,
      label: truncateLabel(node.name, nodeWidth - 4),
      color: getTypeColor(node.type),
    });
  });

  // Calculate total dimensions
  const numCols = Math.min(flatNodes.length, maxPerRow);
  const numRows = Math.ceil(flatNodes.length / maxPerRow);

  const totalWidth = numCols * cellWidth;
  const totalHeight = numRows * cellHeight;

  return {
    boxes,
    edges: edges.map(e => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      label: e.label,
    })),
    width: totalWidth + 2,
    height: totalHeight + 2,
  };
}

/**
 * Truncate label to fit in box
 */
function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + '…';
}

/**
 * Get ANSI color code for node type
 * Uses ontology.json as single source of truth
 */
function getTypeColor(type: string): string {
  const nodeType = ONTOLOGY.nodeTypes[type];
  if (nodeType?.ansiColor) {
    return `\x1b[${nodeType.ansiColor}m`;
  }
  return '\x1b[0m'; // Reset/default
}

/**
 * Render layout to ASCII grid with TRUE GRID routing
 *
 * Grid-based routing ensures edges NEVER cross boxes:
 * - Same row: horizontal line in routing channel
 * - Different rows: L-shaped routing through inter-row channel
 */
export function renderLayoutToAscii(layout: LayoutResult): string[] {
  const grid = new AsciiGrid(layout.width, layout.height);

  // Create lookup for box positions
  const boxById = new Map(layout.boxes.map(b => [b.id, b]));

  // Determine cell dimensions from first box (assume uniform)
  const firstBox = layout.boxes[0];
  if (!firstBox) return grid.render();

  const boxWidth = firstBox.width;
  const boxHeight = firstBox.height;

  // Find routing channel width/height by looking at spacing between boxes
  let hSpacing = 8; // Default
  let vSpacing = 2; // Default
  if (layout.boxes.length > 1) {
    // Find boxes in same row to determine hSpacing
    const sortedByX = [...layout.boxes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sortedByX.length; i++) {
      if (Math.abs(sortedByX[i].y - sortedByX[i - 1].y) < 2) {
        hSpacing = sortedByX[i].x - sortedByX[i - 1].x - boxWidth;
        break;
      }
    }
    // Find boxes in same column to determine vSpacing
    const sortedByY = [...layout.boxes].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sortedByY.length; i++) {
      if (Math.abs(sortedByY[i].x - sortedByY[i - 1].x) < 2) {
        vSpacing = sortedByY[i].y - sortedByY[i - 1].y - boxHeight;
        break;
      }
    }
  }

  // Draw all boxes FIRST
  for (const box of layout.boxes) {
    grid.drawBox(box);
  }

  // Draw edges in routing channels
  for (const edge of layout.edges) {
    const sourceBox = boxById.get(edge.sourceId);
    const targetBox = boxById.get(edge.targetId);

    if (!sourceBox || !targetBox) continue;

    // Determine source and target rows/cols
    const cellWidth = boxWidth + hSpacing;
    const cellHeight = boxHeight + vSpacing;
    const sourceCol = Math.round(sourceBox.x / cellWidth);
    const sourceRow = Math.round(sourceBox.y / cellHeight);
    const targetCol = Math.round(targetBox.x / cellWidth);
    const targetRow = Math.round(targetBox.y / cellHeight);

    // Source exit point (right side of box, middle height)
    const fromX = sourceBox.x + boxWidth;
    const fromY = sourceBox.y + Math.floor(boxHeight / 2);

    // Target entry point (left side of box, middle height)
    const toX = targetBox.x - 1;
    const toY = targetBox.y + Math.floor(boxHeight / 2);

    if (sourceRow === targetRow && targetCol > sourceCol) {
      // SAME ROW: simple horizontal line
      for (let x = fromX; x < toX; x++) {
        grid.setChar(x, fromY, BOX.H);
      }
      grid.setChar(toX, toY, BOX.ARROW_R);

      // Label above the line
      if (edge.label && hSpacing > 4) {
        const midX = Math.floor((fromX + toX) / 2);
        const label = edge.label.length > hSpacing - 2 ? edge.label.slice(0, hSpacing - 3) + '…' : edge.label;
        grid.writeText(midX - Math.floor(label.length / 2), fromY - 1, label, '\x1b[33m');
      }
    } else if (targetRow > sourceRow) {
      // DIFFERENT ROWS: L-shaped routing through vertical channel
      // Route: right from source → down in routing channel → right to target

      // Horizontal segment from source to routing channel
      const channelX = sourceBox.x + boxWidth + Math.floor(hSpacing / 2);
      for (let x = fromX; x < channelX; x++) {
        grid.setChar(x, fromY, BOX.H);
      }

      // Vertical segment down through routing channel (between rows)
      grid.setChar(channelX, fromY, BOX.TR); // Corner
      for (let y = fromY + 1; y < toY; y++) {
        // Only draw in the routing channel (not through boxes)
        const inBoxRow = Math.floor(y / cellHeight);
        const yInCell = y % cellHeight;
        if (yInCell >= boxHeight || inBoxRow !== sourceRow) {
          grid.setChar(channelX, y, BOX.V);
        }
      }
      grid.setChar(channelX, toY, BOX.BL); // Corner

      // Horizontal segment to target
      for (let x = channelX + 1; x < toX; x++) {
        grid.setChar(x, toY, BOX.H);
      }
      grid.setChar(toX, toY, BOX.ARROW_R);
    }
  }

  return grid.render();
}
