import type { OnEvent, OrchestratorResult } from '../contract';
import { chat } from '../cerebras';
import type { PipelineInput } from '../pipeline';
import { GENERATED_BLACK_SCHOLES_ID, GENERATED_MARKET_RISK_ID, GENERATED_SIR_ID, wantsGeneratedModel } from '../generative';
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
  'Black-Scholes, or Greeks. Use generated:market-risk for financial reports, 10-K pages, market risk, interest-rate sensitivity, FX, VaR, revenue, or margin analysis. ' +
  'Use generated:sir for epidemic, infection, SIR, or non-finance generated demos. ' +
  'Return only strict JSON. This is decision-support, not advice.';

const RESPONSE_FORMAT = jsonSchema(
  'augurforge_orchestrator',
  objectSchema(
    {
      templateId: stringEnum(['monte-carlo', GENERATED_BLACK_SCHOLES_ID, GENERATED_SIR_ID, GENERATED_MARKET_RISK_ID]),
      intent: { type: 'string' },
      notes: { type: 'string' },
    },
    ['templateId', 'intent', 'notes'],
  ),
);

function mockRoute(input: PipelineInput): OrchestratorResult {
  const generated = wantsGeneratedModel(input.intent, input.mode);
  const text = (input.intent ?? '').toLowerCase();
  const generatedId = /\b(sir|epidemic|infection|infectious|disease|non[-\s]?finance)\b/.test(text)
    ? GENERATED_SIR_ID
    : /\b(financial report|annual report|10-k|10k|market risk|value-at-risk|var|foreign exchange|fx|interest[-\s]?rate|revenue|margin)\b/.test(text)
      ? GENERATED_MARKET_RISK_ID
      : GENERATED_BLACK_SCHOLES_ID;
  return {
    templateId: input.templateId ?? (generated ? generatedId : 'monte-carlo'),
    intent: input.intent ?? (generated ? 'Build a generated deterministic model sandbox' : 'Explore portfolio ruin risk under volatility'),
    notes: generated
      ? 'Routed to the safe generated-model path for a validated declarative sandbox.'
      : 'Matched to the Monte Carlo (GBM) hero template.',
  };
}

function validate(json: unknown, fallback: OrchestratorResult): OrchestratorResult {
  if (!isRecord(json)) return fallback;
  const templateId =
    json.templateId === GENERATED_BLACK_SCHOLES_ID || json.templateId === GENERATED_SIR_ID || json.templateId === 'monte-carlo'
      || json.templateId === GENERATED_MARKET_RISK_ID
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
            '\nAvailable reliable paths: monte-carlo, generated:black-scholes, generated:sir, generated:market-risk. Do not route to unfinished static templates.',
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
