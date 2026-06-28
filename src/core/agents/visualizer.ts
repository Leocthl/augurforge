/**
 * visualizer.ts — choose views (2d/3d), sliders, labels, title. [OWNER: A]
 * STUB: returns the Monte Carlo template default DashboardSpec.
 * TODO(branch: feat/agents): real prompt that designs the spec per BUILD_SPEC §7.
 */
import type { OnEvent, ModelerResult, VisualizerResult } from '../contract';
import { chat } from '../cerebras';
import { monteCarlo } from '../../templates/monte-carlo';
import { coerce, errMsg } from './shared';

const SYSTEM =
  'You are AugurForge’s Visualizer. Given a model spec, design the dashboard: choose 2d/3d ' +
  'views, sliders, labels, and title. Return strict JSON DashboardSpec.'; // TODO(branch: feat/agents)

export async function runVisualizer(
  modeler: ModelerResult,
  onEvent: OnEvent,
): Promise<VisualizerResult> {
  onEvent({ agent: 'visualizer', status: 'start' });
  const mockResult: VisualizerResult = monteCarlo.spec;
  try {
    const res = await chat({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify({ templateId: modeler.templateId, params: modeler.params }) },
      ],
      reasoningEffort: 'low',
      mock: { text: JSON.stringify(mockResult), json: mockResult },
    });
    const result = coerce<VisualizerResult>(res.json, mockResult, 'templateId');
    onEvent({ agent: 'visualizer', status: 'done', result, timeInfo: res.timeInfo });
    return result;
  } catch (err) {
    onEvent({ agent: 'visualizer', status: 'error', error: errMsg(err) });
    return mockResult;
  }
}