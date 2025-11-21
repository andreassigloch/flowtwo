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
 * Compute layout for architecture boxes
 *
 * Places boxes in a grid pattern based on hierarchy.
 * Returns layout result that can be used by both ASCII and graphics renderers.
 */
export function computeArchitectureLayout(
  nodes: Array<{ id: string; name: string; type: string; parentId?: string }>,
  edges: Array<{ sourceId: string; targetId: string }>,
  options: {
    boxWidth?: number;
    boxHeight?: number;
    hSpacing?: number;
    vSpacing?: number;
    maxPerRow?: number;
  } = {}
): LayoutResult {
  const {
    boxWidth = 20,
    boxHeight = 3,
    hSpacing = 4,
    vSpacing = 2,
    maxPerRow = 4,
  } = options;

  // Find root nodes (no parent)
  const childMap = new Map<string, typeof nodes>();
  const roots: typeof nodes = [];

  for (const node of nodes) {
    if (!node.parentId) {
      roots.push(node);
    } else {
      const siblings = childMap.get(node.parentId) || [];
      siblings.push(node);
      childMap.set(node.parentId, siblings);
    }
  }

  const boxes: Box[] = [];
  let currentY = 0;

  // Layout roots first
  roots.forEach((root, idx) => {
    const x = (idx % maxPerRow) * (boxWidth + hSpacing);
    const y = Math.floor(idx / maxPerRow) * (boxHeight + vSpacing);
    boxes.push({
      id: root.id,
      x,
      y,
      width: boxWidth,
      height: boxHeight,
      label: root.name,
      color: getTypeColor(root.type),
    });
    currentY = Math.max(currentY, y + boxHeight + vSpacing);
  });

  // Layout children below their parents
  for (const root of roots) {
    const children = childMap.get(root.id) || [];
    const parentBox = boxes.find(b => b.id === root.id)!;

    children.forEach((child, idx) => {
      const x = parentBox.x + (idx % maxPerRow) * (boxWidth + hSpacing);
      const y = currentY + Math.floor(idx / maxPerRow) * (boxHeight + vSpacing);
      boxes.push({
        id: child.id,
        x,
        y,
        width: boxWidth,
        height: boxHeight,
        label: child.name,
        color: getTypeColor(child.type),
      });
    });
  }

  // Calculate total dimensions
  const maxX = Math.max(...boxes.map(b => b.x + b.width));
  const maxY = Math.max(...boxes.map(b => b.y + b.height));

  return {
    boxes,
    edges: edges.map(e => ({ sourceId: e.sourceId, targetId: e.targetId })),
    width: maxX + 2,
    height: maxY + 2,
  };
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
 * Render layout to ASCII grid
 */
export function renderLayoutToAscii(layout: LayoutResult): string[] {
  const grid = new AsciiGrid(layout.width, layout.height);

  // Draw all boxes
  for (const box of layout.boxes) {
    grid.drawBox(box);
  }

  // Draw edges between boxes
  for (const edge of layout.edges) {
    const sourceBox = layout.boxes.find(b => b.id === edge.sourceId);
    const targetBox = layout.boxes.find(b => b.id === edge.targetId);

    if (sourceBox && targetBox) {
      // Connect from right side of source to left side of target
      const from: Position = {
        x: sourceBox.x + sourceBox.width,
        y: sourceBox.y + Math.floor(sourceBox.height / 2),
      };
      const to: Position = {
        x: targetBox.x,
        y: targetBox.y + Math.floor(targetBox.height / 2),
      };
      grid.drawEdge(from, to, 'right');
    }
  }

  return grid.render();
}
