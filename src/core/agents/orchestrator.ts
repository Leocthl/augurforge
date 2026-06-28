/**
 * orchestrator.ts — decide which model fits, route. [OWNER: A]
 * STUB: returns a mock route but still calls chat() so LIVE mode exercises the proxy.
 * TODO(branch: feat/agents): real system prompt + strict JSON schema per BUILD_SPEC §7.
 */
import type { OnEvent, OrchestratorResult } from '../contract';
import { chat } from '../cerebras';
import type { PipelineInput } from '../pipeline';
import { coerce, describeInput, errMsg } from './shared';

const SYSTEM =
  'You are AugurForge’s Orchestrator. Given a user intent and a data summary, pick the ' +
  'single best actuarial/quant model template and return strict JSON {templateId,intent,notes}. ' +
  'Decision-support only — not advice.'; // TODO(branch: feat/agents)

export async function runOrchestrator(
  input: PipelineInput,
  onEvent: OnEvent,
): Promise<OrchestratorResult> {
  onEvent({ agent: 'orchestrator', status: 'start' });
  const mockResult: OrchestratorResult = {
    templateId: input.templateId ?? 'monte-carlo',
    intent: input.intent ?? 'Explore portfolio ruin risk under volatility',
    notes: 'Matched to the Monte Carlo (GBM) hero template.',
  };
  try {
    const res = await chat({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: describeInput(input) },
      ],
      reasoningEffort: 'low',
      mock: { text: JSON.stringify(mockResult), json: mockResult },
    });
    const result = coerce<OrchestratorResult>(res.json, mockResult, 'templateId');
    onEvent({ agent: 'orchestrator', status: 'done', result, timeInfo: res.timeInfo });
    return result;
  } catch (err) {
    onEvent({ agent: 'orchestrator', status: 'error', error: errMsg(err) });
    return mockResult;
  }
}