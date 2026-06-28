/**
 * visualizer.ts — choose views (2d/3d), sliders, labels, title. [OWNER: A]
 * STUB: returns the Monte Carlo template default DashboardSpec.
 * TODO(branch: feat/agents): real prompt that designs the spec per BUILD_SPEC §7.
 */
import type { OnEvent, ModelerResult, VisualizerResult } from '../contract';
import { chat } from '../cerebras';
import { coerce, errMsg } from './shared';

const SYSTEM =
  'You are AugurForge’s Visualizer. Given a model spec, design the dashboard: choose 2d/3d ' +
  'views, sliders, labels, and title. Return strict JSON DashboardSpec.'; // TODO(branch: feat/agents)

export async function runVisualizer(
  modeler: ModelerResult,
  onEvent: OnEvent,
): Promise<VisualizerResult> {
  onEvent({ agent: 'visualizer', status: 'start' });
  const mockResult: VisualizerResult = {
    templateId: modeler.templateId,
    title: 'Monte Carlo — Portfolio Ruin (GBM)',
    subtitle: 'Geometric Brownian motion · 500 paths · simulated client-side',
    views: ['2d', '3d'],
    defaultView: '2d',
    sliders: modeler.sliders,
    explainer: {
      entry:
        'This shows many possible market journeys over time. Most paths grow, but some dip badly — ' +
        'the share that falls through the floor is the "ruin" chance.',
      expert:
        'A GBM ensemble of 500 paths. The fan shows percentile cones; the histogram is the terminal ' +
        'distribution. P(ruin) is the fraction breaching the barrier; 95% VaR is the 5th-percentile loss.',
    },
  };
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