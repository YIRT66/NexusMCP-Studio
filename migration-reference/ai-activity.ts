export interface AiActivity {
  id: string;
  source: string;
  tool: string;
  phase: 'running' | 'completed' | 'error';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  input: string;
  output?: string;
}
