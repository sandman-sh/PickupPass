const FALLBACK_MODEL = 'amazon.nova-lite-v1:0';

function fallbackExplanation({ policy, event, person }) {
  return {
    provider: 'PickupPass policy explainer',
    mode: 'fallback',
    model: FALLBACK_MODEL,
    text: `${policy.title}. ${policy.detail} Next step: ${policy.nextAction}`,
    source: { event: event.source || 'local', device: event.deviceName || event.deviceId || 'unknown device', person: person.name }
  };
}

async function explainDecision(input) {
  const enabled = process.env.BEDROCK_ENABLED === 'true';
  if (!enabled) return fallbackExplanation(input);

  let BedrockRuntimeClient;
  let ConverseCommand;
  try {
    ({ BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime'));
  } catch {
    return fallbackExplanation(input);
  }

  const region = process.env.AWS_REGION || 'us-east-1';
  const modelId = process.env.BEDROCK_MODEL_ID || FALLBACK_MODEL;
  const client = new BedrockRuntimeClient({ region });
  const prompt = [
    'Explain one childcare pickup decision for a front-desk coordinator.',
    'The policy engine is authoritative. Do not change the result and do not invent facts.',
    'Use two short sentences: what happened, then the safe next step.',
    JSON.stringify({
      policyStatus: input.policy.status,
      policyTitle: input.policy.title,
      policyDetail: input.policy.detail,
      nextAction: input.policy.nextAction,
      ringSource: input.event.source,
      ringDevice: input.event.deviceName || input.event.deviceId,
      person: input.person.name,
      child: input.person.child
    })
  ].join('\n');

  try {
    const response = await client.send(new ConverseCommand({
      modelId,
      system: [{ text: 'You are a calm, precise safety assistant. Never authorize a release yourself.' }],
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 120, temperature: 0.1 }
    }));
    const text = response.output?.message?.content?.find(part => part.text)?.text;
    if (!text) return fallbackExplanation(input);
    return { provider: 'Amazon Bedrock', mode: 'live', model: modelId, text, source: { event: input.event.source || 'local', device: input.event.deviceName || input.event.deviceId || 'unknown device', person: input.person.name } };
  } catch (error) {
    return { ...fallbackExplanation(input), error: error.message };
  }
}

module.exports = { explainDecision, FALLBACK_MODEL };
