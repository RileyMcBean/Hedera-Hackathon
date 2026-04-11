import "dotenv/config";
import { run } from './src/runtime/pipeline';

async function main() {
  const action = {
    actorId: '0.0.8570111', 
    type: 'PAYOUT',
    recipientId: '0.0.8570146',
    amountHbar: 5,
    text: 'Send 5 HBAR to 0.0.8570146'
  } as any;

  try {
    const result = await run(action);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Crash:', err);
  }
}

main();
