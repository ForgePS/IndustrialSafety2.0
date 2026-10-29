type ForgeAiToolDefinition = {
  type: 'function'
  name: string
  description: string
  strict: true
  parameters: Record<string, unknown>
}

type ForgeAiProviderMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ForgeAiToolCall = {
  call_id: string
  name: string
  arguments: string
}

type ForgeAiProviderResult = {
  text: string
  responseId: string | null
  usage: {
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    totalTokens: number
  }
  toolCalls: number
}

const extractOutputText = (response: any) => {
  const parts: string[] = []

  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text)
      }
    }
  }

  return parts.join('\n').trim()
}

const normalizeUsage = (response: any) => ({
  inputTokens: Number(response?.usage?.input_tokens || 0),
  outputTokens: Number(response?.usage?.output_tokens || 0),
  reasoningTokens: Number(response?.usage?.output_tokens_details?.reasoning_tokens || 0),
  totalTokens: Number(response?.usage?.total_tokens || 0)
})

const addUsage = (
  total: ForgeAiProviderResult['usage'],
  next: ForgeAiProviderResult['usage']
) => ({
  inputTokens: total.inputTokens + next.inputTokens,
  outputTokens: total.outputTokens + next.outputTokens,
  reasoningTokens: total.reasoningTokens + next.reasoningTokens,
  totalTokens: total.totalTokens + next.totalTokens
})

export const runOpenAiForgeAssistant = async ({
  model,
  reasoningEffort,
  maxOutputTokens,
  maxToolCalls,
  instructions,
  messages,
  tools,
  executeTool,
  safetyIdentifier
}: {
  model: string
  reasoningEffort: 'none' | 'low' | 'medium' | 'high'
  maxOutputTokens: number
  maxToolCalls: number
  instructions: string
  messages: ForgeAiProviderMessage[]
  tools: ForgeAiToolDefinition[]
  executeTool: (call: ForgeAiToolCall) => Promise<unknown>
  safetyIdentifier: string
}): Promise<ForgeAiProviderResult> => {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the Forge server.')
  }

  const input: any[] = messages.map(message => ({
    role: message.role,
    content: message.content
  }))

  let totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0
  }
  let totalToolCalls = 0
  let lastResponseId: string | null = null

  for (let round = 0; round < 5; round += 1) {
    const body: Record<string, unknown> = {
      model,
      instructions,
      input,
      tools,
      tool_choice: tools.length ? 'auto' : 'none',
      parallel_tool_calls: false,
      store: false,
      max_output_tokens: maxOutputTokens,
      truncation: 'auto',
      safety_identifier: safetyIdentifier,
      include: ['reasoning.encrypted_content']
    }

    if (reasoningEffort !== 'none') {
      body.reasoning = { effort: reasoningEffort }
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    })

    const payload = await response.json()

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.error ||
        'OpenAI Responses API request failed.'

      throw new Error(String(message))
    }

    lastResponseId = payload?.id || lastResponseId
    totalUsage = addUsage(totalUsage, normalizeUsage(payload))

    const calls: ForgeAiToolCall[] = (payload?.output || [])
      .filter((item: any) => item?.type === 'function_call')
      .map((item: any) => ({
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments || '{}'
      }))

    if (!calls.length) {
      return {
        text: extractOutputText(payload),
        responseId: lastResponseId,
        usage: totalUsage,
        toolCalls: totalToolCalls
      }
    }

    if (totalToolCalls + calls.length > maxToolCalls) {
      throw new Error('Forge AI reached the tenant tool-call limit for this request.')
    }

    totalToolCalls += calls.length

    for (const item of payload.output || []) {
      input.push(item)
    }

    for (const call of calls) {
      const result = await executeTool(call)
      input.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result)
      })
    }
  }

  throw new Error('Forge AI exceeded the maximum reasoning/tool rounds for one request.')
}
