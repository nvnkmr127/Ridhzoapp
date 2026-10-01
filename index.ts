import { config } from 'dotenv';
config({ path: '.env.local' });

import { streamText } from 'ai';

// A plain "provider/model" string routes through Vercel AI Gateway,
// authenticated by AI_GATEWAY_API_KEY from .env.local.
const result = streamText({
  model: 'inclusionai/ling-3.1-flash',
  prompt: 'In two sentences, what is the Vercel AI Gateway?',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

console.log('\n\n--- token usage ---');
console.log(await result.usage);
