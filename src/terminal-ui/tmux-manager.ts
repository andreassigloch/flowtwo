/**
 * Tmux Session Manager
 *
 * Manages 4-panel tmux layout:
 * ┌─────────────────────┬─────────────────────┐
 * │                     │                     │
 * │   CHAT (left-top)   │  GRAPH (right-top)  │
 * │   User input/output │  Visual graph       │
 * │                     │                     │
 * ├─────────────────────┼─────────────────────┤
 * │  VIEW (left-bottom) │ STDOUT (right-bottom)│
 * │  View selector      │  Debug/logs         │
 * └─────────────────────┴─────────────────────┘
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Tmux Session Configuration
 */
export interface TmuxConfig {
  /** Session name */
  sessionName: string;

  /** Working directory */
  workingDir: string;

  /** Window name */
  windowName?: string;
}

/**
 * Tmux Panel IDs
 */
export enum TmuxPanel {
  CHAT = 'chat',
  GRAPH = 'graph',
  VIEW = 'view',
  STDOUT = 'stdout',
}

/**
 * Tmux Session Manager
 *
 * Creates and manages 4-panel tmux layout for GraphEngine
 */
export class TmuxManager {
  private config: Required<TmuxConfig>;
  private sessionName: string;
  private panelIds: Map<TmuxPanel, string>;

  constructor(config: TmuxConfig) {
    this.config = {
      sessionName: config.sessionName,
      workingDir: config.workingDir,
      windowName: config.windowName || 'graphengine',
    };
    this.sessionName = this.config.sessionName;
    this.panelIds = new Map();
  }

  /**
   * Create tmux session with 4-panel layout
   */
  async createSession(): Promise<void> {
    // Kill existing session if exists
    await this.killSession().catch(() => {
      /* ignore if doesn't exist */
    });

    // Create new session (detached)
    await execAsync(`tmux new-session -d -s ${this.sessionName} -n ${this.config.windowName} -c ${this.config.workingDir}`);

    // Set history limit for scrollback (10000 lines)
    await execAsync(`tmux set-option -t ${this.sessionName} history-limit 10000`);

    // Split into 4 panels
    // 1. Split vertically (left | right)
    await execAsync(`tmux split-window -h -t ${this.sessionName}:0`);

    // 2. Split left pane horizontally (chat above, view below)
    await execAsync(`tmux split-window -v -t ${this.sessionName}:0.0`);

    // 3. Split right pane horizontally (graph above, stdout below)
    await execAsync(`tmux split-window -v -t ${this.sessionName}:0.2`);

    // Resize panes for optimal layout
    // Left column: 50%, Right column: 50%
    // Chat: 70% height, View: 30% height
    // Graph: 70% height, Stdout: 30% height
    await execAsync(`tmux select-layout -t ${this.sessionName}:0 tiled`);

    // Store panel IDs (0.0=chat, 0.1=view, 0.2=graph, 0.3=stdout)
    this.panelIds.set(TmuxPanel.CHAT, `${this.sessionName}:0.0`);
    this.panelIds.set(TmuxPanel.VIEW, `${this.sessionName}:0.1`);
    this.panelIds.set(TmuxPanel.GRAPH, `${this.sessionName}:0.2`);
    this.panelIds.set(TmuxPanel.STDOUT, `${this.sessionName}:0.3`);

    // Set panel titles
    await this.setPanelTitle(TmuxPanel.CHAT, 'CHAT');
    await this.setPanelTitle(TmuxPanel.VIEW, 'VIEW');
    await this.setPanelTitle(TmuxPanel.GRAPH, 'GRAPH');
    await this.setPanelTitle(TmuxPanel.STDOUT, 'STDOUT');
  }

  /**
   * Attach to session (foreground)
   */
  attachSession(): void {
    // Use spawn to run tmux attach in foreground (blocking)
    // This transfers control to tmux, so it doesn't return until detached
    const tmuxProcess = spawn('tmux', ['attach-session', '-t', this.sessionName], {
      stdio: 'inherit',
      detached: false,
    });

    tmuxProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Tmux exited with code ${code}`);
      }
    });
  }

  /**
   * Send command to panel
   */
  async sendToPanel(panel: TmuxPanel, command: string, enter: boolean = true): Promise<void> {
    const panelId = this.panelIds.get(panel);
    if (!panelId) {
      throw new Error(`Panel ${panel} not found`);
    }

    const cmd = enter ? `${command}\n` : command;
    await execAsync(`tmux send-keys -t ${panelId} "${cmd.replace(/"/g, '\\"')}"`);
  }

  /**
   * Run command in panel (spawn process)
   */
  async runInPanel(panel: TmuxPanel, command: string, args: string[] = []): Promise<void> {
    const fullCommand = `${command} ${args.join(' ')}`;
    await this.sendToPanel(panel, fullCommand, true);
  }

  /**
   * Clear panel
   */
  async clearPanel(panel: TmuxPanel): Promise<void> {
    await this.sendToPanel(panel, 'clear', true);
  }

  /**
   * Set panel title (via echo)
   */
  async setPanelTitle(panel: TmuxPanel, title: string): Promise<void> {
    const panelId = this.panelIds.get(panel);
    if (!panelId) return;

    await execAsync(`tmux select-pane -t ${panelId} -T "${title}"`);
  }

  /**
   * Kill session
   */
  async killSession(): Promise<void> {
    await execAsync(`tmux kill-session -t ${this.sessionName}`);
  }

  /**
   * Check if session exists
   */
  async sessionExists(): Promise<boolean> {
    try {
      await execAsync(`tmux has-session -t ${this.sessionName}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all panels
   */
  getPanels(): Map<TmuxPanel, string> {
    return new Map(this.panelIds);
  }

  /**
   * Get panel ID
   */
  getPanelId(panel: TmuxPanel): string | undefined {
    return this.panelIds.get(panel);
  }
}
