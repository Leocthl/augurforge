import type { AgentId, OnEvent, TimeInfo } from '../core/contract';
import { chat, USE_LIVE } from '../core/cerebras';
import type { AugurForgeSessionSnapshot } from '../core/sessionContext';
import type { AgentDossier } from './agentDossier';
import { AGENT_LABEL, AGENT_ORDER, AGENT_RESPONSIBILITY } from './agents';

export interface QuestionTurn {
  id: string;
  question: string;
  answer: string;
  sections: Partial<Record<AgentId, string>>;
  timeInfo?: TimeInfo;
  mode: 'live' | 'mock';
  createdAt: number;
}

export interface StartQuestionRunArgs {
  question: string;
  session: AugurForgeSessionSnapshot | null;
  dossiers: AgentDossier[];
  onEvent: OnEvent;
  onComplete: (turn: QuestionTurn) => void;
  onError: (message: string) => void;
}

const TAG_RE = /^\[(orchestrator|modeler|visualizer|sensitivity|risk|explainer)\]\s*/i;

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function extractTaggedAgentSections(text: string): Partial<Record<AgentId, string>> {
  const sections: Partial<Record<AgentId, string>> = {};
  let current: AgentId | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const tag = TAG_RE.exec(line);
    if (tag) {
      current = tag[1].toLowerCase() as AgentId;
      const body = clean(line.replace(TAG_RE, ''));
      if (body) sections[current] = sections[current] ? `${sections[current]} ${body}` : body;
      continue;
    }
    if (current) sections[current] = clean(`${sections[current] ?? ''} ${line}`);
  }

  return sections;
}

export function mockQuestionAnswer(question: string): string {
  return [
    `[orchestrator] I am routing "${question}" through the current War Room context and keeping the answer scoped to decision-support, not advice.`,
    '[modeler] The deterministic browser math is the anchor; horizon, volatility, drift, and ruin threshold explain most changes.',
    '[visualizer] Compare the fan shape with the terminal distribution before trusting a single headline metric.',
    '[sensitivity] Volatility is the first stress knob because it widens the loss cone faster than drift moves the center.',
    '[risk] The important warning is left-tail concentration: a low-probability path can still dominate the downside story.',
    '[explainer] Plain-English readout: the swarm expects the answer to depend on path timing, not only the final average.',
  ].join('\n');
}

function buildPrompt(question: string, session: AugurForgeSessionSnapshot | null, dossiers: AgentDossier[]): string {
  return JSON.stringify({
    instruction:
      'Answer as six AugurForge agents. Use exactly one line per agent, each beginning with [agentId]. Ground claims in supplied context. Keep this decision-support, not advice.',
    question,
    scenarioTitle: session?.title ?? 'Portfolio ruin risk - Monte Carlo',
    metrics: session?.metrics ?? [],
    modelerMapping: session?.modelerMapping ?? {},
    dossiers: dossiers.map((dossier) => ({
      agentId: dossier.agentId,
      responsibility: dossier.responsibility,
      conclusion: dossier.conclusion,
      evidence: dossier.evidence,
      critique: dossier.critique,
      stats: dossier.stats,
    })),
  });
}

function emitSectionEvents(sections: Partial<Record<AgentId, string>>, timeInfo: TimeInfo | undefined, onEvent: OnEvent): void {
  AGENT_ORDER.forEach((agent) => {
    const text = sections[agent] ?? `${AGENT_LABEL[agent]} had no separate finding for this question.`;
    onEvent({ agent, status: 'start' });
    onEvent({ agent, status: 'token', delta: text });
    onEvent({ agent, status: 'done', result: { text }, timeInfo });
  });
}

export function startQuestionRun(args: StartQuestionRunArgs): () => void {
  const controller = new AbortController();
  const createdAt = Date.now();
  if (!USE_LIVE) {
    args.onError('Live mode is off. Restart with VITE_USE_LIVE=true / npm run dev:live to ask Gemma 4 through Cerebras.');
    return () => controller.abort();
  }

  void (async () => {
    try {
      const res = await chat({
        messages: [
          {
            role: 'system',
            content:
              'You are the AugurForge War Room swarm. Return tagged lines for orchestrator, modeler, visualizer, sensitivity, risk, and explainer. No markdown table.',
          },
          { role: 'user', content: buildPrompt(args.question, args.session, args.dossiers) },
        ],
        stream: true,
        reasoningEffort: 'low',
        temperature: 0.25,
        maxTokens: 850,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const answer = res.text.trim();
      if (!answer) throw new Error('Gemma 4 returned no question text.');
      const sections = extractTaggedAgentSections(answer);
      emitSectionEvents(sections, res.timeInfo, args.onEvent);
      args.onComplete({
        id: `q-${createdAt}`,
        question: args.question,
        answer,
        sections,
        timeInfo: res.timeInfo,
        mode: USE_LIVE ? 'live' : 'mock',
        createdAt,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      args.onError(err instanceof Error ? err.message : 'Question run failed');
    }
  })();

  return () => controller.abort();
}

export function responsibilityForQuestion(agentId: AgentId): string {
  return AGENT_RESPONSIBILITY[agentId];
}
