/**
 * Terminal Graphics Support
 *
 * Detects terminal capabilities and renders images using:
 * - iTerm2 Inline Images Protocol (macOS/iTerm2)
 * - Kitty Graphics Protocol (Linux/macOS/WSL)
 * - Fallback to text-based rendering
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Terminal graphics capabilities
 */
export interface TerminalCapabilities {
  supportsImages: boolean;
  protocol: 'iterm2' | 'kitty' | 'none';
  termProgram: string;
}

/**
 * Detect terminal graphics capabilities
 */
export function detectTerminalCapabilities(): TerminalCapabilities {
  const termProgram = process.env.TERM_PROGRAM || '';
  const term = process.env.TERM || '';
  const kittyWindowId = process.env.KITTY_WINDOW_ID;

  // iTerm2 detection (macOS)
  if (termProgram === 'iTerm.app') {
    return {
      supportsImages: true,
      protocol: 'iterm2',
      termProgram: 'iTerm2',
    };
  }

  // Kitty detection (cross-platform)
  if (term.includes('kitty') || kittyWindowId) {
    return {
      supportsImages: true,
      protocol: 'kitty',
      termProgram: 'Kitty',
    };
  }

  // No graphics support
  return {
    supportsImages: false,
    protocol: 'none',
    termProgram: termProgram || term || 'unknown',
  };
}

/**
 * Image scaling options
 */
export interface ImageScaleOptions {
  scale?: number; // 1 = original, 2 = double size, etc.
  width?: number; // Fixed width in pixels (overrides scale)
}

/**
 * Default scale factor for terminal images
 * Increase this value if images appear too small
 */
const DEFAULT_SCALE = 2;

/**
 * Generate PNG from Mermaid syntax (via SVG)
 *
 * @param mermaidCode - Mermaid diagram syntax
 * @param options - Scaling options
 * @returns Path to generated PNG file
 */
export async function generatePNGFromMermaid(
  mermaidCode: string,
  options: ImageScaleOptions = {}
): Promise<string> {
  const tempDir = path.join(process.cwd(), '.tmp');
  await fs.mkdir(tempDir, { recursive: true });

  const inputFile = path.join(tempDir, `mermaid-${Date.now()}.mmd`);
  const outputFile = path.join(tempDir, `diagram-${Date.now()}.png`);

  // Write Mermaid code to temp file
  await fs.writeFile(inputFile, mermaidCode, 'utf-8');

  // Calculate width based on scale factor (default 2x for better visibility)
  const scale = options.scale ?? DEFAULT_SCALE;
  const baseWidth = 800; // Base width before scaling
  const width = options.width ?? baseWidth * scale;

  try {
    // Generate PNG using mmdc (mermaid-cli)
    // -b transparent: transparent background
    // -t dark: dark theme
    // -w: width for better quality (scaled)
    // -s: scale factor for crisp rendering
    await execAsync(
      `npx -y mmdc -i "${inputFile}" -o "${outputFile}" -b transparent -t dark -w ${width} -s ${scale}`
    );

    // Clean up input file
    await fs.unlink(inputFile);

    return outputFile;
  } catch (error) {
    // Clean up on error
    try {
      await fs.unlink(inputFile);
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`Failed to generate PNG from Mermaid: ${error}`);
  }
}

/**
 * Render image using iTerm2 Inline Images Protocol
 *
 * @param imagePath - Path to PNG/JPG file
 * @param options - Display options (width in cells or 'auto')
 * @returns ANSI escape sequence for iTerm2 image rendering
 */
export async function renderITerm2Image(
  imagePath: string,
  options: { width?: string | number; height?: string | number; preserveAspectRatio?: boolean } = {}
): Promise<string> {
  const imageData = await fs.readFile(imagePath);
  const base64Data = imageData.toString('base64');

  // iTerm2 Inline Images Protocol parameters:
  // - inline=1: display inline
  // - width=auto/Npx/N: width (auto, pixels, or character cells)
  // - height=auto/Npx/N: height
  // - preserveAspectRatio=1: maintain aspect ratio
  const params: string[] = ['inline=1'];

  // Width: use 'auto' to let iTerm2 size based on image, or specify cells/pixels
  // Default to auto which displays at native resolution
  if (options.width !== undefined) {
    params.push(`width=${options.width}`);
  }

  if (options.height !== undefined) {
    params.push(`height=${options.height}`);
  }

  // Preserve aspect ratio by default
  if (options.preserveAspectRatio !== false) {
    params.push('preserveAspectRatio=1');
  }

  // iTerm2 Inline Images Protocol
  // ESC ] 1337 ; File = [arguments] : base64-encoded-file-contents ^G
  const escape = `\x1b]1337;File=${params.join(';')}:`;
  const bell = '\x07';

  return `${escape}${base64Data}${bell}\n`;
}

/**
 * Render image using Kitty Graphics Protocol
 *
 * @param imagePath - Path to PNG file
 * @returns ANSI escape sequence for Kitty image rendering
 */
export async function renderKittyImage(imagePath: string): Promise<string> {
  const imageData = await fs.readFile(imagePath);
  const base64Data = imageData.toString('base64');

  // Kitty Graphics Protocol (chunked transmission)
  // ESC _G a=T,f=100,t=f ; base64-data ESC \
  // a=T: transmit and display
  // f=100: PNG format
  // t=f: direct transmission
  const chunkSize = 4096;
  const chunks: string[] = [];

  for (let i = 0; i < base64Data.length; i += chunkSize) {
    const chunk = base64Data.slice(i, i + chunkSize);
    const isLast = i + chunkSize >= base64Data.length;
    const m = isLast ? 0 : 1; // m=1: more chunks, m=0: last chunk

    if (i === 0) {
      // First chunk with parameters (f=100 for PNG)
      chunks.push(`\x1b_Ga=T,f=100,t=f,m=${m};${chunk}\x1b\\`);
    } else {
      // Subsequent chunks
      chunks.push(`\x1b_Gm=${m};${chunk}\x1b\\`);
    }
  }

  return chunks.join('') + '\n';
}

/**
 * Render Mermaid diagram as image in terminal (if supported)
 *
 * @param mermaidCode - Mermaid diagram syntax
 * @returns ANSI escape sequences for image rendering, or null if unsupported
 */
export async function renderMermaidAsImage(
  mermaidCode: string
): Promise<string | null> {
  const capabilities = detectTerminalCapabilities();

  try {
    // Generate PNG from Mermaid
    const pngPath = await generatePNGFromMermaid(mermaidCode);

    // Render using appropriate protocol
    let imageOutput: string;
    if (capabilities.protocol === 'iterm2' || !capabilities.supportsImages) {
      // Default to iTerm2 protocol (works in iTerm2 and Terminal.app on macOS)
      imageOutput = await renderITerm2Image(pngPath);
    } else if (capabilities.protocol === 'kitty') {
      imageOutput = await renderKittyImage(pngPath);
    } else {
      // Cleanup PNG and return null
      await fs.unlink(pngPath);
      return null;
    }

    // Cleanup PNG file
    await fs.unlink(pngPath);

    return imageOutput;
  } catch (error) {
    console.error('Failed to render Mermaid as image:', error);
    return null;
  }
}

/**
 * Clean up temporary files older than 1 hour
 */
export async function cleanupTempFiles(): Promise<void> {
  const tempDir = path.join(process.cwd(), '.tmp');

  try {
    const files = await fs.readdir(tempDir);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);

      if (now - stats.mtimeMs > oneHour) {
        await fs.unlink(filePath);
      }
    }
  } catch {
    // Directory doesn't exist or is empty - ignore
  }
}
