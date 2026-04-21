const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');
const fs = require('fs');

const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const FALLBACK_GEMINI_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.0-pro',
  'gemini-pro',
  'gemini-1.5-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

const AI_SYSTEM_PROMPT = `You are a legal document analyzer for SignatureFlow, an enterprise document 
signing platform. Analyze the provided document and return ONLY a valid JSON 
response with no markdown, no code blocks, no extra text. 

Return exactly this JSON structure:
{
  'summary': 'Plain English summary in 3-4 sentences max',
  'riskScore': 'low' or 'medium' or 'high',
  'riskReason': 'One sentence explaining the risk score',
  'riskyClauses': [
    {
      'title': 'Clause name',
      'description': 'What this clause means in plain English',
      'severity': 'low' or 'medium' or 'high'
    }
  ],
  'keyObligations': ['obligation 1', 'obligation 2', 'obligation 3'],
  'missingElements': ['missing item 1', 'missing item 2'],
  'documentType': 'Type of document e.g. NDA, Employment Contract, etc',
  'signerRights': ['right 1', 'right 2'],
  'recommendation': 'overall recommendation for the signer'
}

Focus on:
- Auto-renewal clauses
- Liability and indemnification
- Non-compete and non-disclosure
- Payment terms and penalties
- Termination conditions
- Intellectual property assignment
- Governing law and jurisdiction

Keep all text simple and understandable for a non-lawyer.`;

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const AI_MAX_INPUT_CHARS = toPositiveInt(process.env.AI_MAX_INPUT_CHARS, 4000);
const AI_MAX_OUTPUT_TOKENS = toPositiveInt(process.env.AI_MAX_OUTPUT_TOKENS, 1000);
const AI_MAX_RETRIES_429 = toPositiveInt(process.env.AI_MAX_RETRIES_429, 1);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getAvailableModels = async () => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) return null;

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`ListModels API call failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const available = (data.models || [])
      .filter((m) => {
        const methods = m.supportedGenerationMethods || [];
        const name = (m.name || '').toLowerCase();
        const isTTSOrImageOnly = name.includes('-tts') || name.includes('-image') || name.includes('lyria') || name.includes('robotics');
        const isGemmaModel = name.includes('gemma');
        return methods.includes('generateContent') && !isTTSOrImageOnly && !isGemmaModel;
      })
      .map((m) => m.name.replace('models/', ''))
      .filter((name) => name && typeof name === 'string');

    return available.length > 0 ? available : null;
  } catch (error) {
    console.warn('Could not discover Gemini models via REST:', error.message);
    return null;
  }
};

const normalizeText = (text) => String(text || '').toLowerCase();

const findKeywordHits = (sourceText, keywords) => {
  const text = normalizeText(sourceText);
  return keywords.filter((keyword) => text.includes(keyword.toLowerCase()));
};

const inferDocumentType = (sourceText) => {
  const text = normalizeText(sourceText);

  if (text.includes('non-disclosure') || text.includes('confidential information') || text.includes('nda')) {
    return 'Non-Disclosure Agreement (NDA)';
  }

  if (text.includes('employment') || text.includes('employee') || text.includes('salary')) {
    return 'Employment Agreement';
  }

  if (text.includes('service agreement') || text.includes('statement of work') || text.includes('consulting')) {
    return 'Services Agreement';
  }

  if (text.includes('lease') || text.includes('landlord') || text.includes('tenant')) {
    return 'Lease Agreement';
  }

  return 'General Contract';
};

const buildHeuristicAnalysis = (sourceText, reasonLabel) => {
  const text = String(sourceText || '');

  const clauseRules = [
    {
      title: 'Auto-Renewal',
      keywords: ['auto-renew', 'automatic renewal', 'evergreen'],
      description: 'The contract may renew automatically unless canceled in time.',
      severity: 'medium',
    },
    {
      title: 'Broad Indemnity',
      keywords: ['indemnify', 'hold harmless'],
      description: 'One party may have to cover losses or legal claims for the other party.',
      severity: 'high',
    },
    {
      title: 'Liability Cap or Disclaimer',
      keywords: ['limitation of liability', 'no liability', 'consequential damages'],
      description: 'Liability may be limited, reducing compensation if something goes wrong.',
      severity: 'medium',
    },
    {
      title: 'Non-Compete / Restrictive Covenant',
      keywords: ['non-compete', 'non compete', 'restrictive covenant'],
      description: 'The signer may be restricted from certain work or business activities.',
      severity: 'high',
    },
    {
      title: 'Unilateral Termination',
      keywords: ['terminate at any time', 'termination for convenience', 'without cause'],
      description: 'One side may end the contract with limited notice or reason.',
      severity: 'medium',
    },
    {
      title: 'Late Fees / Penalties',
      keywords: ['late fee', 'penalty', 'interest charge'],
      description: 'Late payment or non-performance may trigger extra charges.',
      severity: 'medium',
    },
    {
      title: 'IP Assignment',
      keywords: ['assign all rights', 'intellectual property', 'work made for hire'],
      description: 'Intellectual property ownership may transfer away from the signer.',
      severity: 'high',
    },
  ];

  const riskyClauses = clauseRules
    .map((rule) => ({ ...rule, hits: findKeywordHits(text, rule.keywords) }))
    .filter((rule) => rule.hits.length > 0)
    .map(({ title, description, severity }) => ({ title, description, severity }));

  const hasTermination = findKeywordHits(text, ['termination', 'notice period', 'breach']).length > 0;
  const hasPaymentTerms = findKeywordHits(text, ['payment terms', 'invoice', 'due date']).length > 0;
  const hasDispute = findKeywordHits(text, ['governing law', 'jurisdiction', 'arbitration']).length > 0;
  const hasConfidentiality = findKeywordHits(text, ['confidential', 'non-disclosure']).length > 0;

  const missingElements = [];
  if (!hasTermination) missingElements.push('Clear termination conditions and notice timelines are not obvious.');
  if (!hasPaymentTerms) missingElements.push('Payment timing, invoice rules, or late-fee logic is not clearly defined.');
  if (!hasDispute) missingElements.push('Governing law, venue, or dispute resolution terms are not clearly defined.');
  if (!hasConfidentiality) missingElements.push('Confidentiality obligations are not clearly defined.');

  const keyObligations = [
    'Review all payment, notice, and delivery deadlines before signing.',
    'Confirm whether indemnity and liability clauses are one-sided.',
    'Check termination rights and required notice periods.',
  ];

  const signerRights = [
    'Right to request clarification on ambiguous clauses before signing.',
    'Right to negotiate high-risk or one-sided terms.',
    'Right to retain a signed copy and related exhibits for records.',
  ];

  const highRiskCount = riskyClauses.filter((item) => item.severity === 'high').length;
  const mediumRiskCount = riskyClauses.filter((item) => item.severity === 'medium').length;

  let riskScore = 'low';
  if (highRiskCount >= 2 || (highRiskCount >= 1 && mediumRiskCount >= 2)) {
    riskScore = 'high';
  } else if (highRiskCount >= 1 || mediumRiskCount >= 2 || missingElements.length >= 2) {
    riskScore = 'medium';
  }

  const docType = inferDocumentType(text);

  return {
    summary: `Automated analysis completed using fallback rules because ${reasonLabel}. ${docType} patterns were detected from document text. Review highlighted clauses carefully before signing.`,
    riskScore,
    riskReason: `Risk level is based on detected clause patterns and missing safeguards (${riskyClauses.length} risky clause indicators, ${missingElements.length} potential gaps).`,
    riskyClauses,
    keyObligations,
    missingElements,
    documentType: docType,
    signerRights,
    recommendation: riskScore === 'high'
      ? 'Ask for legal review and negotiate high-risk terms before signing.'
      : 'Proceed carefully after confirming obligations, termination terms, and liability boundaries.',
  };
};

const extractTextFromPDF = async (filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return (data?.text || '').trim();
  } catch (error) {
    console.error('AI PDF extraction error:', error);
    throw new Error('Unable to extract text from PDF');
  }
};

const tryParseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const parseClaudeJson = (text) => {
  const direct = tryParseJson(text);
  if (direct) return direct;

  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    const parsed = tryParseJson(jsonBlockMatch[1]);
    if (parsed) return parsed;
  }

  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');

  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const sliced = text.slice(jsonStart, jsonEnd + 1);
    const parsed = tryParseJson(sliced);
    if (parsed) return parsed;
  }

  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');

  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const sliced = text.slice(arrayStart, arrayEnd + 1);
    const parsed = tryParseJson(sliced);
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0];
    }
  }

  return null;
};

const getProviderMessage = (error) => (
  error?.error?.error?.message
  || error?.error?.message
  || error?.message
  || 'Failed to analyze document with AI'
);

const isQuotaExceededError = (error) => {
  const msg = String(getProviderMessage(error)).toLowerCase();
  return (
    msg.includes('quota exceeded')
    || msg.includes('quota is exhausted')
    || msg.includes('billing details')
    || msg.includes('limit: 0')
    || msg.includes('free_tier')
  );
};

const getRetryDelaySeconds = (error) => {
  const details = Array.isArray(error?.errorDetails) ? error.errorDetails : [];
  const retryInfo = details.find((item) => item?.['@type']?.includes('RetryInfo'));
  const retryDelay = retryInfo?.retryDelay;

  if (!retryDelay || typeof retryDelay !== 'string') return null;

  const numeric = Number(retryDelay.replace('s', ''));
  return Number.isFinite(numeric) ? Math.ceil(numeric) : null;
};

const isMissingModelError = (error) => {
  const status = Number(error?.status || 0);
  const msg = String(getProviderMessage(error)).toLowerCase();

  return status === 404 && (msg.includes('model') || msg.includes('not found'));
};

const isRetryableModelError = (error) => {
  const status = Number(error?.status || 0);
  const msg = String(getProviderMessage(error)).toLowerCase();
  const isModalityError = status === 400 && (msg.includes('modality') || msg.includes('response modalities'));
  return (
    isModalityError
    || status === 429
    || status === 503
    || msg.includes('rate limit')
    || msg.includes('quota exceeded')
    || msg.includes('service unavailable')
    || msg.includes('high demand')
  );
};

const getModelCandidates = () => {
  const envModel = (process.env.GEMINI_MODEL || '').trim();
  const merged = envModel
    ? [envModel, ...FALLBACK_GEMINI_MODELS]
    : FALLBACK_GEMINI_MODELS;

  return [...new Set(merged)]
};

const getModelCandidatesWithDiscovery = async () => {
  const discovered = await getAvailableModels();

  if (discovered && discovered.length > 0) {
    console.log(`Discovered ${discovered.length} available Gemini model(s): ${discovered.join(', ')}`);
    return discovered;
  }

  const fallback = getModelCandidates();
  console.log(`Using fallback model candidates: ${fallback.join(', ')}`);
  return fallback;
};

const mapProviderError = (error) => {
  const providerStatus = Number(error?.status || 0);
  const providerMessage = getProviderMessage(error);

  const lowerMessage = String(providerMessage).toLowerCase();

  const mappedError = new Error(providerMessage);

  if (providerStatus === 401 || lowerMessage.includes('api key')) {
    mappedError.statusCode = 401;
    mappedError.userMessage = 'AI service authentication failed. Check GEMINI_API_KEY.';
    return mappedError;
  }

  if (providerStatus === 429 || lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    if (isQuotaExceededError(error)) {
      mappedError.statusCode = 402;
      mappedError.userMessage = 'Gemini API quota is exhausted or disabled for this project. Enable billing/increase quota and try again.';
      return mappedError;
    }

    const retrySeconds = getRetryDelaySeconds(error);
    mappedError.statusCode = 429;
    mappedError.userMessage = retrySeconds
      ? `AI service is rate-limited. Please retry in about ${retrySeconds} seconds.`
      : 'AI service is rate-limited right now. Please retry in a moment.';
    return mappedError;
  }

  if (providerStatus === 400 && (lowerMessage.includes('credit') || lowerMessage.includes('billing') || lowerMessage.includes('quota'))) {
    mappedError.statusCode = 402;
    mappedError.userMessage = 'AI quota is exhausted. Please enable billing or add quota for Gemini API and try again.';
    return mappedError;
  }

  if (providerStatus >= 400 && providerStatus < 600) {
    mappedError.statusCode = providerStatus;
    mappedError.userMessage = providerMessage;
    return mappedError;
  }

  mappedError.statusCode = 500;
  mappedError.userMessage = 'Unable to analyze document right now. Please try again later.';
  return mappedError;
};

const analyzeDocument = async (filePath) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const extractedText = await extractTextFromPDF(filePath);
  if (!extractedText) {
    throw new Error('No readable text found in this PDF');
  }

  const truncatedText = extractedText.slice(0, AI_MAX_INPUT_CHARS);

  try {
    const modelCandidates = await getModelCandidatesWithDiscovery();
    let text = '';
    let lastError = null;

    for (const modelName of modelCandidates) {
      for (let retryAttempt = 0; retryAttempt <= AI_MAX_RETRIES_429; retryAttempt += 1) {
        try {
          const model = client.getGenerativeModel({
            model: modelName,
            systemInstruction: AI_SYSTEM_PROMPT,
          });

          const response = await model.generateContent({
            contents: [
              {
                role: 'user',
                parts: [{ text: `Analyze this document:\n\n${truncatedText}` }],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
              responseMimeType: 'application/json',
            },
          });

          text = response?.response?.text?.() || '';

          if (text.trim()) {
            const parsed = parseClaudeJson(text);
            if (parsed) {
              return parsed;
            }
            text = '';
          }
        } catch (modelError) {
          lastError = modelError;

          if (isMissingModelError(modelError)) {
            break;
          }

          if (isRetryableModelError(modelError)) {
            const isLastRetry = retryAttempt >= AI_MAX_RETRIES_429;
            const permanentQuotaIssue = isQuotaExceededError(modelError);

            if (!isLastRetry && !permanentQuotaIssue) {
              const retrySeconds = getRetryDelaySeconds(modelError);
              const waitMs = retrySeconds
                ? Math.min(retrySeconds, 8) * 1000
                : 1500;

              await sleep(waitMs);
              continue;
            }

            break;
          }

          throw modelError;
        }
      }

      if (text.trim()) break;
    }

    if (!text.trim()) {
      throw lastError || new Error('Empty AI response received from all models');
    }

    const parsed = parseClaudeJson(text);
    if (!parsed) {
      throw new Error('AI response from all models was not valid JSON');
    }

    return parsed;
  } catch (error) {
    console.error('AI document analysis error:', error);
    const mappedError = mapProviderError(error);
    const shouldFallback = process.env.AI_ENABLE_HEURISTIC_FALLBACK !== 'false';

    if (
      shouldFallback
      && (
        mappedError.statusCode === 402
        || mappedError.statusCode === 404
        || mappedError.statusCode === 429
        || mappedError.statusCode >= 500
      )
    ) {
      const reason = mappedError.statusCode === 402
        ? 'the external AI quota is exhausted'
        : mappedError.statusCode === 404
          ? 'the configured external AI models are unavailable for this API key'
        : mappedError.statusCode === 429
          ? 'the external AI service is currently rate-limited'
          : 'the external AI service is temporarily unavailable';

      return buildHeuristicAnalysis(truncatedText, reason);
    }

    throw mappedError;
  }
};

module.exports = {
  extractTextFromPDF,
  analyzeDocument,
};
