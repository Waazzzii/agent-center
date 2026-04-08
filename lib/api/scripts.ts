import agentClient from './agent-client';

export interface RecordedStep {
  action: 'navigate' | 'click' | 'fill' | 'select' | 'press_key' | 'extract' | 'switch_tab' | 'close_tab';
  url?: string;
  selector?: string;
  value?: string;
  text?: string;
  key?: string;
  field_name?: string;
  tab_index?: number;
  waitFor?: {
    id?: string | null;
    name?: string | null;
    tag?: string;
    classes?: string[];
    placeholder?: string | null;
  };
}

export interface BrowserSession {
  sessionId: string;
  orgId: string;
  viewerUrl: string;
  lastActivity: string;
  createdAt: string;
  idleExpiresAt: string;
}

export interface BrowserScript {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  steps: RecordedStep[];
  parameters: string[];
  created_at: string;
  updated_at: string;
}

// ─── Recording ────────────────────────────────────────────────

export async function startRecording(
  orgId: string,
  startUrl?: string,
  sessionId?: string
): Promise<{ recordingId: string; viewerUrl: string }> {
  const res = await agentClient.post<{ recordingId: string; viewerUrl: string }>(
    `/api/admin/${orgId}/record/start`,
    {
      ...(startUrl ? { start_url: startUrl } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
    }
  );
  return res.data;
}

export async function getRecordingSteps(
  orgId: string,
  recordingId: string
): Promise<{ steps: RecordedStep[] }> {
  const res = await agentClient.get<{ steps: RecordedStep[] }>(
    `/api/admin/${orgId}/record/${recordingId}/steps`
  );
  return res.data;
}

export async function stopRecording(
  orgId: string,
  recordingId: string
): Promise<{ steps: RecordedStep[] }> {
  const res = await agentClient.post<{ steps: RecordedStep[] }>(
    `/api/admin/${orgId}/record/${recordingId}/stop`
  );
  return res.data;
}

export async function cancelRecording(
  orgId: string,
  recordingId: string
): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/record/${recordingId}`);
}

// ─── Scripts ──────────────────────────────────────────────────

export async function listScripts(
  orgId: string
): Promise<{ scripts: BrowserScript[] }> {
  const res = await agentClient.get<{ scripts: BrowserScript[] }>(
    `/api/admin/${orgId}/scripts`
  );
  return res.data;
}

export async function createScript(
  orgId: string,
  data: {
    name: string;
    description?: string;
    steps: RecordedStep[];
    parameters: string[];
  }
): Promise<BrowserScript> {
  const res = await agentClient.post<BrowserScript>(
    `/api/admin/${orgId}/scripts`,
    data
  );
  return res.data;
}

export async function updateScript(
  orgId: string,
  id: string,
  data: Partial<{
    name: string;
    description: string;
    steps: RecordedStep[];
    parameters: string[];
  }>
): Promise<BrowserScript> {
  const res = await agentClient.patch<BrowserScript>(
    `/api/admin/${orgId}/scripts/${id}`,
    data
  );
  return res.data;
}

export async function deleteScript(
  orgId: string,
  id: string
): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/scripts/${id}`);
}

export async function runScript(
  orgId: string,
  id: string,
  params: Record<string, string>
): Promise<{ ok: boolean; steps_run: number; screenshot?: string }> {
  const res = await agentClient.post<{ ok: boolean; steps_run: number; screenshot?: string }>(
    `/api/admin/${orgId}/scripts/${id}/run`,
    { params }
  );
  return res.data;
}

// ─── Browser Sessions ──────────────────────────────────────────

export async function createBrowserSession(
  orgId: string,
  startUrl?: string
): Promise<{ sessionId: string; viewerUrl: string }> {
  const res = await agentClient.post(`/api/admin/${orgId}/browser-sessions`, {
    start_url: startUrl,
  });
  return res.data;
}

export async function listBrowserSessions(
  orgId: string
): Promise<{ sessions: BrowserSession[] }> {
  const res = await agentClient.get(`/api/admin/${orgId}/browser-sessions`);
  return res.data;
}

export async function touchBrowserSession(
  orgId: string,
  sessionId: string
): Promise<void> {
  await agentClient.post(`/api/admin/${orgId}/browser-sessions/${sessionId}/touch`);
}

export async function destroyBrowserSession(
  orgId: string,
  sessionId: string
): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/browser-sessions/${sessionId}`);
}

export async function getScript(orgId: string, id: string): Promise<BrowserScript> {
  const res = await agentClient.get<BrowserScript>(`/api/admin/${orgId}/scripts/${id}`);
  return res.data;
}

// ─── Step Runs ────────────────────────────────────────────────

export interface StepRun {
  runId: string;
  currentIndex: number;
  totalSteps: number;
  step: RecordedStep | null;
  steps: RecordedStep[];
  extracted: Record<string, string>;
  lastScreenshot: string | null;
  status: 'waiting' | 'running' | 'done' | 'error';
}

export async function startStepRun(
  orgId: string,
  scriptId: string,
  params: Record<string, string> = {}
): Promise<{ runId: string; currentIndex: number; totalSteps: number; step: RecordedStep | null; viewerUrl: string }> {
  const res = await agentClient.post(
    `/api/admin/${orgId}/scripts/${scriptId}/step-run`,
    { params }
  );
  return res.data;
}

export async function getStepRun(orgId: string, runId: string): Promise<StepRun> {
  const res = await agentClient.get<StepRun>(`/api/admin/${orgId}/step-runs/${runId}`);
  return res.data;
}

export async function executeStepRunStep(
  orgId: string,
  runId: string
): Promise<{ done: boolean; currentIndex: number; totalSteps: number; step: RecordedStep | null; screenshot: string; extracted: Record<string, string> }> {
  const res = await agentClient.post(`/api/admin/${orgId}/step-runs/${runId}/execute`);
  return res.data;
}

export async function retryStepRunStep(
  orgId: string,
  runId: string,
  replacementStep?: RecordedStep
): Promise<{ currentIndex: number; totalSteps: number; step: RecordedStep; screenshot: string; extracted: Record<string, string> }> {
  const res = await agentClient.post(`/api/admin/${orgId}/step-runs/${runId}/retry`, {
    ...(replacementStep ? { step: replacementStep } : {}),
  });
  return res.data;
}

export async function updateStepRunStep(
  orgId: string,
  runId: string,
  step: Partial<RecordedStep>
): Promise<StepRun> {
  const res = await agentClient.patch<StepRun>(
    `/api/admin/${orgId}/step-runs/${runId}/step`,
    { step }
  );
  return res.data;
}

export async function abortStepRun(orgId: string, runId: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/step-runs/${runId}`);
}
