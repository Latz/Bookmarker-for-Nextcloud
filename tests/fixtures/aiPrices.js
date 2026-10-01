// A snapshot of prices and model details as the extension reads them from the
// providers' pages, for the tests (the extension itself has no built-in prices).
// tests/setup.js puts it into use before every test.

export const TEST_PRICES = [
  ['claude-3-5-haiku', 0.8, 4],
  ['claude-fable-5', 10, 50],
  ['claude-fable-5-1', 10, 50],
  ['claude-haiku-4-5', 1, 5],
  ['claude-mythos-5', 10, 50],
  ['claude-mythos-5-1', 10, 50],
  ['claude-opus-4', 15, 75],
  ['claude-opus-4-1', 15, 75],
  ['claude-opus-4-5', 5, 25],
  ['claude-opus-4-6', 5, 25],
  ['claude-opus-4-7', 5, 25],
  ['claude-opus-4-8', 5, 25],
  ['claude-opus-5', 5, 25],
  ['claude-opus-5-5', 4, 20],
  ['claude-sonnet-4', 3, 15],
  ['claude-sonnet-4-5', 3, 15],
  ['claude-sonnet-4-6', 3, 15],
  ['claude-sonnet-5', 2, 10],
  ['claude-sonnet-5-5', 2, 10],
  ['gpt-4.1', 2, 8],
  ['gpt-4.1-mini', 0.4, 1.6],
  ['gpt-4.1-nano', 0.1, 0.4],
  ['gpt-4o', 2.5, 10],
  ['gpt-4o-mini', 0.15, 0.6],
  ['gpt-5', 1.25, 10],
  ['gpt-5-mini', 0.25, 2],
  ['gpt-5-nano', 0.05, 0.4],
  ['gpt-6-astra', 10, 50],
  ['gpt-6-luna', 0.1, 0.5],
  ['gpt-6.1-sol', 2, 10],
  ['o3-mini', 1.1, 4.4],
  ['gemini-2.5-flash', 0.3, 2.5],
  ['gemini-2.5-flash-lite', 0.1, 0.4],
  ['gemini-2.5-pro', 1.25, 10],
  ['gemini-3-flash-preview', 0.5, 3],
  ['gemini-3.1-flash-lite', 0.25, 1.5],
  ['gemini-3.5-flash', 1.5, 9],
  ['gemini-3.5-flash-lite', 0.3, 2.5],
  ['gemini-3.6-flash', 0.75, 3.75],
  ['gemini-3.7-flash', 0.75, 3.75],
  ['gemini-3.8-flash', 0.75, 3.75],
  ['gemini-omni-1.1-flash', 1.5, 9],
  ['gemini-omni-flash-preview', 1.5, 9],
  ['codestral', 0.3, 0.9],
  ['ministral-14b', 0.2, 0.2],
  ['ministral-3b', 0.1, 0.1],
  ['ministral-8b', 0.15, 0.15],
  ['mistral-large', 0.5, 1.5],
  ['mistral-medium', 1.5, 7.5],
  ['mistral-small', 0.15, 0.6],
  ['deepseek-flash', 0.3, 1.2],
  ['deepseek-v4-flash', 0.3, 1.2],
  ['deepseek-v4-flash-vision-exp', 0.3, 1.2],
  ['deepseek-v4-pro', 1.32, 3.96],
  ['gpt-oss-120b', 0.15, 0.6],
  ['gpt-oss-20b', 0.075, 0.3],
  ['llama-3.3-70b', 0.59, 0.79],
  ['qwen3.8-27b', 0.8, 4],
];

export const TEST_INFO = {
  'claude-3-5-haiku': {
    cachedInput: 0.08,
  },
  'claude-fable-5': {
    context: 1000000,
    maxOutput: 128000,
    released: '2026-06-09',
    modalities: 'text, image, file',
    description:
      'Claude Fable 5 is a Mythos-class model from Anthropic, built for autonomous knowledge work and coding.',
    cachedInput: 1,
  },
  'claude-fable-5-1': {
    context: 1000000,
    maxOutput: 128000,
    released: '2026-09-01',
    modalities: 'text, image, file',
    description:
      'Claude Fable 5.1 improves on Claude Fable 5 across the board, with the biggest gains in agentic coding, long-running agentic workflows, and knowledge work: long code refactors, front-end and visual...',
    cachedInput: 0.25,
  },
  'claude-haiku-4-5': {
    context: 200000,
    maxOutput: 64000,
    released: '2025-10-15',
    modalities: 'text, image, file',
    description:
      'Claude Haiku 4.5 is Anthropic’s fastest and most efficient model, delivering near-frontier intelligence at a fraction of the cost and latency of larger Claude models.',
    cachedInput: 0.1,
  },
  'claude-mythos-5': {
    cachedInput: 1,
  },
  'claude-mythos-5-1': {
    cachedInput: 0.25,
  },
  'claude-opus-4': {
    cachedInput: 1.5,
  },
  'claude-opus-4-1': {
    context: 200000,
    maxOutput: 32000,
    released: '2025-08-05',
    modalities: 'image, text, file',
    description:
      'Claude Opus 4.1 is an updated version of Anthropic’s flagship model, offering improved performance in coding, reasoning, and agentic tasks.',
    cachedInput: 1.5,
  },
  'claude-opus-4-5': {
    context: 200000,
    maxOutput: 64000,
    released: '2025-11-24',
    modalities: 'file, image, text',
    description:
      'Claude Opus 4.5 is Anthropic’s frontier reasoning model optimized for complex software engineering, agentic workflows, and long-horizon computer use.',
    cachedInput: 0.5,
  },
  'claude-opus-4-6': {
    context: 1000000,
    maxOutput: 128000,
    released: '2026-02-04',
    modalities: 'text, image, file',
    description:
      'Opus 4.6 is Anthropic’s strongest model for coding and long-running professional tasks.',
    cachedInput: 0.5,
  },
  'claude-opus-4-7': {
    context: 1000000,
    maxOutput: 128000,
    released: '2026-04-16',
    modalities: 'text, image, file',
    description:
      "Opus 4.7 is the next generation of Anthropic's Opus family, built for long-running, asynchronous agents.",
    cachedInput: 0.5,
  },
  'claude-opus-4-8': {
    context: 1000000,
    maxOutput: 128000,
    released: '2026-05-27',
    modalities: 'text, image, file',
    description:
      "Claude Opus 4.8 is Anthropic's most capable generally available model in the Opus family.",
    cachedInput: 0.5,
  },
  'claude-opus-5': {
    context: 1000000,
    maxOutput: 128000,
    released: '2026-07-24',
    modalities: 'text, image, file',
    description:
      'Claude Opus 5 is Anthropic’s flagship model for demanding reasoning, coding, and long-horizon agentic work.',
    cachedInput: 0.5,
  },
  'claude-opus-5-5': {
    context: 1000000,
    maxOutput: 128000,
    released: '2026-09-22',
    modalities: 'text, image, file',
    description:
      "Claude Opus 5.5 is Anthropic's flagship model for demanding reasoning, coding, and long-horizon agentic work, succeeding Claude Opus 5.",
    cachedInput: 0.2,
  },
  'claude-sonnet-4': {
    context: 200000,
    maxOutput: 64000,
    released: '2025-05-22',
    modalities: 'image, text, file',
    description:
      'Claude Sonnet 4 significantly enhances the capabilities of its predecessor, Sonnet 3.7, excelling in both coding and reasoning tasks with improved precision and controllability.',
    cachedInput: 0.3,
  },
  'claude-sonnet-4-5': {
    context: 1000000,
    maxOutput: 64000,
    released: '2025-09-29',
    modalities: 'text, image, file',
    description:
      'Claude Sonnet 4.5 is Anthropic’s most advanced Sonnet model to date, optimized for real-world agents and coding workflows.',
    cachedInput: 0.3,
  },
  'claude-sonnet-4-6': {
    context: 1000000,
    maxOutput: 128000,
    released: '2026-02-17',
    modalities: 'text, image, file',
    description:
      "Sonnet 4.6 is Anthropic's most capable Sonnet-class model yet, with frontier performance across coding, agents, and professional work.",
    cachedInput: 0.3,
  },
  'claude-sonnet-5': {
    context: 1000000,
    maxOutput: 128000,
    released: '2026-06-30',
    modalities: 'text, image, file',
    description:
      "Sonnet 5 is Anthropic's most capable Sonnet-class model, with frontier performance across coding, agents, and professional work.",
    cachedInput: 0.2,
  },
  'claude-sonnet-5-5': {
    context: 1000000,
    maxOutput: 128000,
    released: '2026-09-28',
    modalities: 'text, image, file',
    description:
      "Claude Sonnet 5.5 is Anthropic's Sonnet-class model for well-scoped everyday work, succeeding Claude Sonnet 5 as a direct upgrade.",
    cachedInput: 0.2,
  },
  codestral: {
    context: 256000,
    maxOutput: 204800,
    released: '2025-08-01',
    modalities: 'text, file',
    description:
      "Mistral's cutting-edge language model for coding released end of July 2025.",
    cachedInput: 0.03,
  },
  'deepseek-flash': {
    context: 1000000,
    maxOutput: 384000,
    description:
      'DeepSeek-V4.1-Flash: Supports both non-thinking and thinking (default) modes.',
  },
  'deepseek-v4-flash': {
    context: 1000000,
    maxOutput: 384000,
    description:
      'DeepSeek-V4.1-Flash: Supports both non-thinking and thinking (default) modes.',
  },
  'deepseek-v4-flash-vision-exp': {
    context: 1000000,
    maxOutput: 384000,
    description:
      'DeepSeek-V4.1-Flash: Supports both non-thinking and thinking (default) modes.',
  },
  'deepseek-v4-pro': {
    context: 1000000,
    maxOutput: 384000,
    description:
      'DeepSeek-V4-Pro-0813: Supports both non-thinking and thinking (default) modes.',
  },
  'gemini-2.5-flash': {
    context: 1048576,
    maxOutput: 65535,
    released: '2025-06-17',
    modalities: 'file, image, text, audio, video',
    description:
      "Gemini 2.5 Flash is Google's state-of-the-art workhorse model, specifically designed for advanced reasoning, coding, mathematics, and scientific tasks.",
  },
  'gemini-2.5-flash-lite': {
    context: 1048576,
    maxOutput: 65535,
    released: '2025-07-22',
    modalities: 'text, image, file, audio, video',
    description:
      'Gemini 2.5 Flash-Lite is a lightweight reasoning model in the Gemini 2.5 family, optimized for ultra-low latency and cost efficiency.',
  },
  'gemini-2.5-pro': {
    context: 1048576,
    maxOutput: 65536,
    released: '2025-06-17',
    modalities: 'text, image, file, audio, video',
    description:
      'Gemini 2.5 Pro is Google’s state-of-the-art AI model designed for advanced reasoning, coding, mathematics, and scientific tasks.',
  },
  'gemini-3-flash-preview': {
    context: 1048576,
    maxOutput: 65536,
    released: '2025-12-17',
    modalities: 'text, image, file, audio, video',
    description:
      'Gemini 3 Flash Preview is a high speed, high value thinking model designed for agentic workflows, multi turn chat, and coding assistance.',
  },
  'gemini-3.1-flash-lite': {
    context: 1048576,
    maxOutput: 65536,
    released: '2026-05-07',
    modalities: 'text, image, video, file, audio',
    description:
      'Gemini 3.1 Flash Lite is Google’s GA high-efficiency multimodal model optimized for low-latency, high-volume workloads.',
  },
  'gemini-3.5-flash': {
    context: 1048576,
    maxOutput: 65536,
    released: '2026-05-19',
    modalities: 'text, image, video, file, audio',
    description:
      "Gemini 3.5 Flash is Google's high-efficiency multimodal model, bringing near-Pro level coding and reasoning at Flash-tier cost and speed.",
  },
  'gemini-3.5-flash-lite': {
    context: 1048576,
    maxOutput: 65536,
    released: '2026-07-21',
    modalities: 'text, image, video, file, audio',
    description:
      'Gemini 3.5 Flash Lite is a high-efficiency model from Google with upgraded agentic capabilities.',
  },
  'gemini-3.6-flash': {
    context: 1048576,
    maxOutput: 65536,
    released: '2026-07-21',
    modalities: 'text, image, video, file, audio',
    description:
      'Gemini 3.6 Flash is a high-efficiency model from Google for coding, agentic workflows, and web and app development.',
  },
  'gemini-3.7-flash': {
    context: 1048576,
    maxOutput: 65536,
    released: '2026-08-13',
    modalities: 'text, image, video, file, audio',
    description:
      'Gemini 3.7 Flash is a multimodal model from Google for fast agentic workflows, coding, and complex multi-step reasoning.',
  },
  'gemini-3.8-flash': {
    context: 1048576,
    maxOutput: 65536,
    released: '2026-09-02',
    modalities: 'text, image, video, file, audio',
    description:
      "Gemini 3.8 Flash is Google's most intelligent Flash model with significant gains from 3.7 Flash across software engineering, agentic tasks, and multi-step reasoning.",
  },
  'gpt-4.1': {
    context: 1047576,
    maxOutput: 32768,
    released: '2025-04-14',
    modalities: 'image, text, file',
    description:
      'GPT-4.1 is a flagship large language model optimized for advanced instruction following, real-world software engineering, and long-context reasoning.',
  },
  'gpt-4.1-mini': {
    context: 1047576,
    maxOutput: 32768,
    released: '2025-04-14',
    modalities: 'image, text, file',
    description:
      'GPT-4.1 Mini is a mid-sized model delivering performance competitive with GPT-4o at substantially lower latency and cost.',
  },
  'gpt-4.1-nano': {
    context: 1047576,
    maxOutput: 32768,
    released: '2025-04-14',
    modalities: 'image, text, file',
    description:
      'For tasks that demand low latency, GPT‑4.1 nano is the fastest and cheapest model in the GPT-4.1 series.',
  },
  'gpt-4o': {
    context: 128000,
    maxOutput: 16384,
    released: '2024-05-13',
    modalities: 'text, image, file',
    description:
      'GPT-4o ("o" for "omni") is OpenAI\'s latest AI model, supporting both text and image inputs with text outputs.',
  },
  'gpt-4o-mini': {
    context: 128000,
    maxOutput: 16384,
    released: '2024-07-18',
    modalities: 'text, image, file',
    description:
      "GPT-4o mini is OpenAI's newest model after GPT-4 Omni, supporting both text and image inputs with text outputs.",
  },
  'gpt-5': {
    context: 400000,
    maxOutput: 128000,
    released: '2025-08-07',
    modalities: 'text, image, file',
    description:
      'GPT-5 is OpenAI’s most advanced model, offering major improvements in reasoning, code quality, and user experience.',
  },
  'gpt-5-mini': {
    context: 400000,
    maxOutput: 128000,
    released: '2025-08-07',
    modalities: 'text, image, file',
    description:
      'GPT-5 Mini is a compact version of GPT-5, designed to handle lighter-weight reasoning tasks.',
  },
  'gpt-5-nano': {
    context: 400000,
    maxOutput: 128000,
    released: '2025-08-07',
    modalities: 'text, image, file',
    description:
      'GPT-5-Nano is the smallest and fastest variant in the GPT-5 system, optimized for developer tools, rapid interactions, and ultra-low latency environments.',
  },
  'gpt-6-astra': {
    context: 1050000,
    maxOutput: 128000,
    released: '2026-09-04',
    modalities: 'file, image, text',
    description:
      "GPT-6 Astra is OpenAI's flagship model for demanding end-to-end work.",
    cachedInput: 1,
  },
  'gpt-6-luna': {
    context: 1050000,
    maxOutput: 128000,
    released: '2026-09-22',
    modalities: 'file, image, text',
    description:
      "GPT-6 Luna is the fast, cost-efficient model in OpenAI's GPT-6 series, positioned below GPT-6 Sol.",
    cachedInput: 0.01,
  },
  'gpt-6.1-sol': {
    context: 1050000,
    maxOutput: 128000,
    released: '2026-09-29',
    modalities: 'file, image, text',
    description:
      'GPT-6.1 Sol is an upgrade to GPT-6 Sol from OpenAI, positioned below the flagship GPT-6 Astra in the GPT-6 series.',
    cachedInput: 0.1,
  },
  'gpt-oss-120b': {
    speed: 500,
    context: 131072,
    maxOutput: 65536,
  },
  'gpt-oss-20b': {
    speed: 1000,
    context: 131072,
    maxOutput: 65536,
  },
  'ministral-14b': {
    context: 262144,
    maxOutput: 209715,
    released: '2025-12-02',
    modalities: 'text, image',
    description:
      'The largest model in the Ministral 3 family, Ministral 3 14B offers frontier capabilities and performance comparable to its larger Mistral Small 3.2 24B counterpart.',
    cachedInput: 0.02,
  },
  'ministral-3b': {
    context: 131072,
    maxOutput: 104857,
    released: '2025-12-02',
    modalities: 'text, image',
    description:
      'The smallest model in the Ministral 3 family, Ministral 3 3B is a powerful, efficient tiny language model with vision capabilities.',
    cachedInput: 0.01,
  },
  'ministral-8b': {
    context: 262144,
    maxOutput: 209715,
    released: '2025-12-02',
    modalities: 'text, image',
    description:
      'A balanced model in the Ministral 3 family, Ministral 3 8B is a powerful, efficient tiny language model with vision capabilities.',
    cachedInput: 0.015,
  },
  'mistral-large': {
    context: 262144,
    maxOutput: 209715,
    released: '2025-12-01',
    modalities: 'text, image, file',
    description:
      'Mistral Large 3 2512 is Mistral’s most capable model to date, featuring a sparse mixture-of-experts architecture with 41B active parameters (675B total), and released under the Apache 2.0 license.',
    cachedInput: 0.05,
  },
  'mistral-medium': {
    context: 262144,
    maxOutput: 209715,
    released: '2026-04-30',
    modalities: 'text, image, file',
    description:
      'Mistral Medium 3.5 is a dense 128B instruction-following model from Mistral AI.',
    cachedInput: 0.15,
  },
  'mistral-small': {
    context: 262144,
    maxOutput: 209715,
    released: '2026-03-16',
    modalities: 'text, image',
    description:
      'Mistral Small 4 is the next major release in the Mistral Small family, unifying the capabilities of several flagship Mistral models into a single system.',
    cachedInput: 0.015,
  },
  'o3-mini': {
    context: 200000,
    maxOutput: 100000,
    released: '2025-01-31',
    modalities: 'text, file',
    description:
      'OpenAI o3-mini is a cost-efficient language model optimized for STEM reasoning tasks, particularly excelling in science, mathematics, and coding.',
  },
  'qwen3.8-27b': {
    speed: 450,
    context: 131072,
    maxOutput: 16384,
  },
};
