export { DepthExplainer } from './DepthExplainer';
export { ThinkingGraph } from './ThinkingGraph';
export { CascadeTranscript } from './CascadeTranscript';
export { ReasoningPanel } from './ReasoningPanel';
export { mockEventSource, liveEventSource, type EventSource, type MockDepth } from './eventSource';
export { realPipelineSource, type Depth } from './liveSource';
export { useClipRecorder, type ClipRecorder } from './useClipRecorder';
export { applyEvent, initReasoning, agentForNode, AGENT_LABEL, type ReasoningState } from './reasoningGraph';
export { ROLE_DEFS, buildRolePayload, parseRoleJson, runRoleAnalysis, runMockRoleAnalysis } from './roleAnalysis';
export type { RoleDef, RolePayload } from './roleAnalysis';
export type {
  GraphData,
  GNode,
  GLink,
  NodeRole,
  GraphVariant,
  ReasoningBeat,
  StakeholderRoleId,
  RoleRiskLevel,
  RoleImpactMetric,
  RoleImpactResult,
  RoleImpactStatus,
} from './types';
