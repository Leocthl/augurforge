import type { OnEvent, OrchestratorResult } from '../contract';
import { chat } from '../cerebras';
import type { PipelineInput } from '../pipeline';
import { GENERATED_BLACK_SCHOLES_ID, wantsGeneratedModel } from '../generative';
import {
  cleanString,
  describeInput,
  errMsg,
  isAbortError,
  isRecord,
  jsonSchema,
  objectSchema,
  stringEnum,
} from './shared';

const SYSTEM =
  'You are AugurForge Orchestrator. Route the request to one model path. ' +
  'Use monte-carlo for portfolio ruin, GBM, volatility fan charts, or generic risk simulation. ' +
  'Use generated:black-scholes when the user asks to generate a new model, asks for options, ' +
  'Black-Scholes, Greeks, or a model outside the current library. ' +
  'Return only strict JSON. This is decision-support, not advice.';

const RESPONSE_FORMAT = jsonSchema(
  'augurforge_orchestrator',
  objectSchema(
    {
      templateId: stringEnum(['monte-carlo', GENERATED_BLACK_SCHOLES_ID]),
      intent: { type: 'string' },
      notes: { type: 'string' },
    },
    ['templateId', 'intent', 'notes'],
  ),
);

function mockRoute(input: PipelineInput): OrchestratorResult {
  const generated = wantsGeneratedModel(input.intent, input.mode);
  return {
    templateId: input.templateId ?? (generated ? GENERATED_BLACK_SCHOLES_ID : 'monte-carlo'),
    intent: input.intent ?? (generated ? 'Build a Black-Scholes option pricing sandbox' : 'Explore portfolio ruin risk under volatility'),
    notes: generated
      ? 'Routed to the safe generated-model path for an option-pricing sandbox.'
      : 'Matched to the Monte Carlo (GBM) hero template.',
  };
}

function validate(json: unknown, fallback: OrchestratorResult): OrchestratorResult {
  if (!isRecord(json)) return fallback;
  const templateId =
    json.templateId === GENERATED_BLACK_SCHOLES_ID || json.templateId === 'monte-carlo'
      ? json.templateId
      : fallback.templateId;
  return {
    templateId,
    intent: cleanString(json.intent, fallback.intent, 220),
    notes: cleanString(json.notes, fallback.notes ?? '', 260),
  };
}

export async function runOrchestrator(
  input: PipelineInput,
  onEvent: OnEvent,
): Promise<OrchestratorResult> {
  onEvent({ agent: 'orchestrator', status: 'start' });
  const mockResult = mockRoute(input);
  try {
    const res = await chat({
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content:
            describeInput(input) +
            '\nAvailable reliable paths: monte-carlo, generated:black-scholes. Do not route to unfinished static templates.',
        },
      ],
      responseFormat: RESPONSE_FORMAT,
      reasoningEffort: 'low',
      temperature: 0,
      maxTokens: 220,
      signal: input.signal,
      mock: { text: JSON.stringify(mockResult), json: mockResult },
    });
    const result = validate(res.json, mockResult);
    onEvent({ agent: 'orchestrator', status: 'done', result, timeInfo: res.timeInfo });
    return result;
  } catch (err) {
    if (isAbortError(err)) return mockResult;
    onEvent({ agent: 'orchestrator', status: 'error', error: errMsg(err) });
    return mockResult;
  }
}
